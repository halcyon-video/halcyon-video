import AVFoundation
import Foundation
import WebRTC

/// The WebRTC half of a Remote Play session: one answering peer connection, the
/// host's video track, and the input data channel.
///
/// The store is always the OFFERER (`src/remote-play.ts` calls `createOffer` the
/// moment a viewer says hello), so this side never negotiates — it answers, adds
/// candidates, and renders. There is no local media at all: nothing is captured
/// on the Apple TV, which is also why the audio session below asks for playback
/// rather than play-and-record.
///
/// Threading: libwebrtc calls its delegate on its own signaling thread. Every
/// callback out of this class is hopped onto the main actor first, so the
/// SwiftUI side never has to think about it.
final class PeerConnectionManager: NSObject {

    // MARK: - Callbacks (main actor)

    /// The host's video track, once one exists. Handed straight to the renderer.
    var onVideoTrack: (@MainActor (RTCVideoTrack) -> Void)?
    /// One locally gathered candidate, or nil for "done gathering" — which the
    /// protocol says to forward as an explicit JSON null.
    var onLocalCandidate: (@MainActor (RTCIceCandidate?) -> Void)?
    var onConnectionState: (@MainActor (RTCPeerConnectionState) -> Void)?
    /// `{"t":"state","playback":bool}` from the host: are these frames a film?
    var onPlaybackState: (@MainActor (Bool) -> Void)?

    // MARK: - Factory
    //
    // Exactly one factory for the whole process. Each one spins up its own
    // worker threads and audio device module, and the SDK's own guidance is to
    // keep a single instance alive rather than build one per connection.

    private static let factory: RTCPeerConnectionFactory = {
        _ = RTCInitializeSSL()
        return RTCPeerConnectionFactory(
            encoderFactory: RTCDefaultVideoEncoderFactory(),
            decoderFactory: RTCDefaultVideoDecoderFactory()
        )
    }()

    /// Neither the offer nor the answer needs a constraint: the host decides
    /// what it sends, and this side receives whatever arrives.
    private static let emptyConstraints = RTCMediaConstraints(
        mandatoryConstraints: nil, optionalConstraints: nil
    )

    // MARK: - State

    private var peer: RTCPeerConnection?
    private var channel: RTCDataChannel?
    /// Tracks already handed up, so a second delegate route (see
    /// `adoptRemoteTracks`) doesn't re-deliver the same one.
    private var deliveredTrackIds = Set<String>()

    /// Last reported peer state, so the session loop can ask rather than having
    /// to remember every callback.
    private(set) var connectionState: RTCPeerConnectionState = .new

    var isDataChannelOpen: Bool { channel?.readyState == .open }

    // MARK: - Session

    /// Answer the host's offer. Returns the answer SDP to post back through the
    /// signaling mailbox.
    func accept(offerSDP: String, iceServers: [IceServerSpec]) async throws -> String {
        close()

        let config = RTCConfiguration()
        config.iceServers = iceServers.map {
            RTCIceServer(urlStrings: $0.urls, username: $0.username, credential: $0.credential)
        }
        config.sdpSemantics = .unifiedPlan
        // The host gathers continually and re-sends candidates after a
        // renegotiation; matching it keeps a mid-session network change (the TV
        // moving from wired to WiFi) recoverable without a fresh offer.
        config.continualGatheringPolicy = .gatherContinually
        config.bundlePolicy = .maxBundle
        config.rtcpMuxPolicy = .require

        // NOTE FOR WHOEVER COMPILES THIS: `peerConnectionWithConfiguration:` is
        // declared nullable in the M100-and-later ObjC SDK, which is what the
        // version range in project.yml resolves to. If a build lands on an
        // older SDK where it is non-optional, this `guard let` is the one line
        // that will not compile — make it a plain `let`.
        guard let peer = Self.factory.peerConnection(
            with: config, constraints: Self.emptyConstraints, delegate: self
        ) else {
            throw PeerError.connectionRefused
        }
        self.peer = peer
        connectionState = .new

        try await setRemote(RTCSessionDescription(type: .offer, sdp: offerSDP), on: peer)
        let answer = try await makeAnswer(on: peer)
        try await setLocal(answer, on: peer)
        // Belt and braces: whichever of the two "a track arrived" delegate
        // routes libwebrtc takes for this SDK version, the receivers exist by
        // the time the answer is applied.
        adoptRemoteTracks(on: peer)
        return answer.sdp
    }

    /// One candidate from the host. Failures are ignored on purpose: a stale
    /// candidate arriving after a re-offer is normal, and the browser client
    /// swallows the same error.
    func add(candidate: RTCIceCandidate) {
        peer?.add(candidate)
    }

    func close() {
        channel?.close()
        peer?.close()
        channel = nil
        peer = nil
        deliveredTrackIds.removeAll()
        connectionState = .closed
    }

    // MARK: - Input

    /// One input message on the data channel.
    ///
    /// `droppable` implements the protocol's backpressure rule: the channel is
    /// ordered and reliable, so anything queued behind a stall is applied in a
    /// burst once it clears — which reads as the store running away from you.
    /// Key repeats are the droppable case; a real press or release never is.
    @discardableResult
    func send(_ message: [String: Any], droppable: Bool = false) -> Bool {
        guard let channel, channel.readyState == .open else { return false }
        if droppable && channel.bufferedAmount > 2048 { return false }
        guard let data = try? JSONSerialization.data(withJSONObject: message) else { return false }
        return channel.sendData(RTCDataBuffer(data: data, isBinary: false))
    }

    // MARK: - Candidate JSON
    //
    // The host feeds whatever arrives straight into the browser's
    // `addIceCandidate`, so these two functions have to speak the browser's
    // `RTCIceCandidate.toJSON()` shape exactly — field names included.

    static func json(for candidate: RTCIceCandidate) -> [String: Any] {
        var json: [String: Any] = [
            "candidate": candidate.sdp,
            "sdpMLineIndex": Int(candidate.sdpMLineIndex),
        ]
        if let mid = candidate.sdpMid { json["sdpMid"] = mid }
        return json
    }

    static func candidate(from payload: [String: Any]) -> RTCIceCandidate? {
        guard let sdp = payload["candidate"] as? String, !sdp.isEmpty else { return nil }
        let index = (payload["sdpMLineIndex"] as? NSNumber)?.int32Value ?? 0
        return RTCIceCandidate(sdp: sdp, sdpMLineIndex: index, sdpMid: payload["sdpMid"] as? String)
    }

    // MARK: - Audio session

    /// Route the host's audio mix to the TV.
    ///
    /// Left at its default the SDK configures play-AND-record, because its usual
    /// job is a call. This client captures nothing, and a record category on an
    /// Apple TV asks for a microphone that generally isn't there. Playback +
    /// movie playback is the honest description of what this app does.
    static func configureAudioSession() {
        let config = RTCAudioSessionConfiguration.webRTC()
        config.category = AVAudioSession.Category.playback.rawValue
        config.mode = AVAudioSession.Mode.moviePlayback.rawValue
        config.categoryOptions = []
        RTCAudioSessionConfiguration.setWebRTC(config)

        let session = RTCAudioSession.sharedInstance()
        session.lockForConfiguration()
        do {
            try session.setConfiguration(config, active: true)
        } catch {
            Log.error("audio session: \(error.localizedDescription)")
        }
        session.unlockForConfiguration()
    }

    // MARK: - SDP plumbing
    //
    // The SDK is completion-handler based. These three wrappers are the only
    // reason the session loop above can read as a straight line.

    private func setRemote(_ sdp: RTCSessionDescription, on peer: RTCPeerConnection) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            peer.setRemoteDescription(sdp) { error in
                if let error { cont.resume(throwing: error) } else { cont.resume(returning: ()) }
            }
        }
    }

    private func setLocal(_ sdp: RTCSessionDescription, on peer: RTCPeerConnection) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            peer.setLocalDescription(sdp) { error in
                if let error { cont.resume(throwing: error) } else { cont.resume(returning: ()) }
            }
        }
    }

    private func makeAnswer(on peer: RTCPeerConnection) async throws -> RTCSessionDescription {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<RTCSessionDescription, Error>) in
            peer.answer(for: Self.emptyConstraints) { sdp, error in
                if let sdp {
                    cont.resume(returning: sdp)
                } else {
                    cont.resume(throwing: error ?? PeerError.noAnswer)
                }
            }
        }
    }

    // MARK: - Remote tracks

    private func adoptRemoteTracks(on peer: RTCPeerConnection) {
        for receiver in peer.receivers {
            tuneLatency(on: receiver)
            if let track = receiver.track as? RTCVideoTrack { deliver(track) }
        }
    }

    private func deliver(_ track: RTCVideoTrack) {
        guard deliveredTrackIds.insert(track.trackId).inserted else { return }
        let callback = onVideoTrack
        Task { @MainActor in callback?(track) }
    }

    /// Zero the receive jitter buffer.
    ///
    /// The protocol doc asks every client to do this: the store is interactive,
    /// so every frame is the answer to a keypress, and a conferencing-sized
    /// jitter buffer reads as input lag rather than smoothness. The browser sets
    /// `jitterBufferTarget`/`playoutDelayHint`; the ObjC SDK's equivalent is
    /// `setJitterBufferMinimumDelay:`, which only exists on newer builds — hence
    /// the runtime check rather than a hard call that would pin the SDK version.
    private func tuneLatency(on receiver: RTCRtpReceiver) {
        let selector = NSSelectorFromString("setJitterBufferMinimumDelay:")
        guard receiver.responds(to: selector) else { return }
        _ = receiver.perform(selector, with: NSNumber(value: 0.0))
    }
}

enum PeerError: Error {
    case connectionRefused
    case noAnswer
}

// MARK: - RTCPeerConnectionDelegate

extension PeerConnectionManager: RTCPeerConnectionDelegate {

    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        let callback = onLocalCandidate
        Task { @MainActor in callback?(candidate) }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {
        // "Complete" is how the ObjC SDK spells the browser's null candidate;
        // the host reads that null as end-of-gathering.
        guard newState == .complete else { return }
        let callback = onLocalCandidate
        Task { @MainActor in callback?(nil) }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCPeerConnectionState) {
        report(newState)
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {
        // The host opens exactly one channel ("input") and keeps it for the life
        // of the session; this side only ever receives it.
        channel = dataChannel
        dataChannel.delegate = self
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {
        if let track = stream.videoTracks.first { deliver(track) }
    }

    func peerConnection(
        _ peerConnection: RTCPeerConnection,
        didAdd rtpReceiver: RTCRtpReceiver,
        streams mediaStreams: [RTCMediaStream]
    ) {
        tuneLatency(on: rtpReceiver)
        if let track = rtpReceiver.track as? RTCVideoTrack { deliver(track) }
    }

    // The rest of the protocol is required by Obj-C and uninteresting here: this
    // side never renegotiates, never removes a stream it added, and treats ICE
    // connection state as advisory next to the peer connection state above.
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    /// The ICE state is a second, older witness to the same thing.
    ///
    /// `didChangeConnectionState:` is the callback that matters and has been in
    /// the ObjC SDK for years — but it is an OPTIONAL protocol method, so a
    /// version whose Swift name differs by a word would simply never call the
    /// one above and this class would sit at `.new` while frames poured in.
    /// This one has never been optional. It only ever promotes to connected or
    /// reports a terminal failure: ICE `disconnected` is routinely transient,
    /// and treating it as a drop would restart sessions that were about to
    /// recover on their own.
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        Log.info("ice \(newState.rawValue)")
        switch newState {
        case .connected, .completed: report(.connected)
        case .failed: report(.failed)
        case .closed: report(.closed)
        default: break
        }
    }

    private func report(_ state: RTCPeerConnectionState) {
        guard connectionState != state else { return }
        connectionState = state
        let callback = onConnectionState
        Task { @MainActor in callback?(state) }
    }
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
}

// MARK: - RTCDataChannelDelegate

extension PeerConnectionManager: RTCDataChannelDelegate {

    func dataChannelDidChangeState(_ dataChannel: RTCDataChannel) {
        Log.info("data channel \(dataChannel.readyState.rawValue)")
    }

    func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) {
        guard !buffer.isBinary,
              let object = try? JSONSerialization.jsonObject(with: buffer.data) as? [String: Any],
              object["t"] as? String == "state" else { return }
        let playback = object["playback"] as? Bool ?? false
        let callback = onPlaybackState
        Task { @MainActor in callback?(playback) }
    }
}
