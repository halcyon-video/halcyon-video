import Foundation
import WebRTC

/// The connection loop, and the only thing the SwiftUI layer talks to.
///
/// It is a straight port of `main()` + `session()` in `src/remote-viewer.ts`,
/// including the wording of the status pill, because the two clients answer to
/// the same store and a viewer comparing a phone with the TV should not be told
/// two different stories about the same failure.
///
/// Shape of the loop: ask `/__remote/status` who is hosting → say hello to that
/// host → long-poll until an offer arrives → answer it → stay until the peer
/// connection drops → back off and go round again.
@MainActor
final class RemoteSession: ObservableObject {

    // MARK: - Published state

    /// Short pill text, or nil when frames are arriving and nothing needs saying.
    @Published private(set) var status: String?
    /// A paragraph rather than a pill: the store explaining why it can never
    /// stream, which must not be papered over by the next "Connecting…".
    @Published private(set) var message: String?
    @Published private(set) var videoTrack: RTCVideoTrack?
    @Published private(set) var isConnected = false
    /// The host says these frames are a film, not the store — the legend swaps.
    @Published private(set) var isPlayback = false
    @Published private(set) var isLegendVisible = false

    // MARK: - Internals

    private let manager = PeerConnectionManager()
    private var signaling: SignalingClient?
    private var settings: StoreSettings?
    private var loop: Task<Void, Never>?
    private var statusHeartbeat: Task<Void, Never>?
    private var legendTimer: Task<Void, Never>?

    /// The store this session is pointed at, so a redundant connect (SwiftUI
    /// hands us both an `onAppear` and a scene-phase change at launch) is a
    /// no-op instead of a teardown and a fresh handshake.
    private var currentOrigin: URL?
    private var hostPeer = "host"
    private var iceServers = SignalingClient.defaultIceServers
    /// A reason the store gave for never being able to stream, plus whether it
    /// came from the shared kiosk (recoverable — someone can fix it at the
    /// machine) or a private instance (permanent for this server).
    private var fatalReason: String?
    private var fatalFromShared = false
    /// Grows while reconnects keep failing, resets the moment frames arrive.
    private var backoff = Backoff.initial

    private enum Backoff {
        static let initial: TimeInterval = 1.2
        static let ceiling: TimeInterval = 10
        static let growth = 1.6
    }

    /// How long a hello may go unanswered before the loop starts over. A private
    /// instance is still loading a whole library when it first answers, so it
    /// gets the long one — same two numbers the browser client uses.
    private enum Patience {
        static let shared: TimeInterval = 20
        static let privateInstance: TimeInterval = 60
    }

    init() {
        manager.onVideoTrack = { [weak self] track in
            self?.videoTrack = track
        }
        manager.onLocalCandidate = { [weak self] candidate in
            self?.forwardLocalCandidate(candidate)
        }
        manager.onConnectionState = { [weak self] state in
            self?.handleConnectionState(state)
        }
        manager.onPlaybackState = { [weak self] playback in
            self?.handlePlaybackState(playback)
        }
    }

    // MARK: - Lifecycle

    func connect(to origin: URL, settings: StoreSettings) {
        if currentOrigin == origin, let loop, !loop.isCancelled { return }
        stop()
        currentOrigin = origin
        self.settings = settings
        signaling = SignalingClient(base: origin)
        fatalReason = nil
        backoff = Backoff.initial
        Log.info("connecting to \(origin.absoluteString)")
        loop = Task { [weak self] in await self?.run() }
        startStatusHeartbeat()
    }

    /// Tear the session down and tell the host, so it drops us immediately
    /// instead of waiting for ICE to notice. The browser sends the same `bye`
    /// from its `pagehide` handler.
    func stop() {
        let client = signaling
        let host = hostPeer
        loop?.cancel()
        loop = nil
        statusHeartbeat?.cancel()
        statusHeartbeat = nil
        legendTimer?.cancel()
        legendTimer = nil
        manager.close()
        signaling = nil
        currentOrigin = nil
        videoTrack = nil
        isConnected = false
        isPlayback = false
        isLegendVisible = false
        clearMessage()
        if let client {
            Task { await client.send(to: host, type: "bye", payload: nil) }
        }
    }

    // MARK: - Input

    /// One Siri Remote press, as a DOM keyboard event the store already
    /// understands. Repeats are marked droppable per the protocol's
    /// backpressure rule.
    func sendKey(_ key: String, code: String, down: Bool, isRepeat: Bool) {
        manager.send(
            [
                "t": "key",
                "et": down ? "down" : "up",
                "key": key,
                "code": code,
                "repeat": isRepeat,
            ],
            droppable: isRepeat
        )
    }

    /// Bring the control legend back — the Siri Remote has no H key, so this is
    /// wired to the app's own menu rather than to a press.
    func showLegend(seconds: TimeInterval = 12) {
        isLegendVisible = true
        legendTimer?.cancel()
        legendTimer = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self?.isLegendVisible = false
        }
    }

    // MARK: - The loop

    private func run() async {
        while !Task.isCancelled {
            guard let signaling else { return }

            guard let remote = await signaling.status() else {
                setStatus("Store server unreachable — retrying…")
                await pause(2.5)
                continue
            }
            if !remote.iceServers.isEmpty { iceServers = remote.iceServers }

            // A store that said it can never stream keeps saying so, because the
            // ordinary connection chatter underneath would otherwise bury the
            // one line that explains what to go and fix.
            if let reason = fatalReason {
                if fatalFromShared {
                    // The kiosk's own mirror. If the kiosk has gone away
                    // entirely its last reason no longer describes anything; if
                    // it is still up, keep the reason on screen and keep
                    // hello-ing, so the moment someone switches it back an offer
                    // arrives and clears it.
                    if !remote.hostOnline {
                        clearMessage()
                    } else {
                        setMessage(reason)
                    }
                } else if remote.hostOnline {
                    // A private store here is impossible, but the shared mirror
                    // is a perfectly good answer.
                    clearMessage()
                } else {
                    // Nothing to fall back to, and looping would respawn the
                    // same doomed instance every few seconds.
                    setMessage(reason)
                    return
                }
            }

            if remote.hostOnline {
                hostPeer = "host"
                if fatalReason == nil { setStatus("Connecting…") }
                await runSession(patience: Patience.shared)
            } else if remote.supportsPrivateInstances {
                guard await openPrivateInstance() else { continue }
                await runSession(patience: Patience.privateInstance)
            } else {
                setStatus("Store offline — start it with Remote Play on")
                await pause(2.5)
                continue
            }

            manager.close()
            videoTrack = nil
            isConnected = false
            if fatalReason == nil { setStatus("Connection lost — reconnecting…") }
            await pause(backoff)
            backoff = min(backoff * Backoff.growth, Backoff.ceiling)
        }
    }

    /// Ask for a private per-visitor render. False means "don't start a session
    /// this time round" — the caller loops back to the status poll.
    private func openPrivateInstance() async -> Bool {
        guard let signaling else { return false }
        let reuse = settings?.instanceId
        setStatus(reuse == nil ? "Opening your own private store… (~30s)" : "Reconnecting to your store…")

        switch await signaling.requestInstance(reuse: reuse) {
        case .ready(let id, _):
            settings?.instanceId = id
            hostPeer = "host-\(id)"
            return true
        case .atCapacity:
            setStatus("All private stores are in use — retrying…")
            await pause(4)
            return false
        case .unavailable(let text):
            fatalReason = text
            fatalFromShared = false
            setMessage(text)
            await pause(4)
            return false
        case .failed:
            await pause(4)
            return false
        }
    }

    /// One attempt: hello → offer → answer → ICE → stay until it drops.
    private func runSession(patience: TimeInterval) async {
        guard let signaling else { return }
        manager.close()
        videoTrack = nil
        isConnected = false

        await signaling.send(to: hostPeer, type: "hello", payload: nil)
        var helloAt = Date()
        var negotiating = false

        while !Task.isCancelled {
            if negotiating {
                switch manager.connectionState {
                case .failed, .closed, .disconnected:
                    return
                default:
                    break
                }
            } else if Date().timeIntervalSince(helloAt) > patience {
                return // the host never answered the hello
            }

            let messages: [SignalMessage]
            do {
                messages = try await signaling.poll()
            } catch {
                await pause(1.5)
                continue
            }

            for message in messages {
                switch message.type {
                case "offer":
                    guard let sdp = message.payload?["sdp"] as? String, !sdp.isEmpty else { break }
                    negotiating = true
                    guard await answer(offer: sdp) else { return }

                case "ice":
                    guard negotiating,
                          let payload = message.payload,
                          let candidate = PeerConnectionManager.candidate(from: payload) else { break }
                    manager.add(candidate: candidate)

                case "retry":
                    // The store is still booting. Wait, then re-hello — and
                    // restart the patience clock, or a slow boot would time out
                    // a store that is answering perfectly well.
                    setStatus("Store is still booting…")
                    await pause(3)
                    await signaling.send(to: hostPeer, type: "hello", payload: nil)
                    helloAt = Date()

                case "fatal":
                    fatalFromShared = (hostPeer == "host")
                    let reason = (message.payload?["reason"] as? String)?
                        .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                    let text = reason.isEmpty ? "This store can't render a session right now." : reason
                    fatalReason = text
                    setMessage(text)
                    return

                case "bye":
                    return

                default:
                    break
                }
            }
        }
    }

    private func answer(offer sdp: String) async -> Bool {
        guard let signaling else { return false }
        do {
            let answerSDP = try await manager.accept(offerSDP: sdp, iceServers: iceServers)
            await signaling.send(to: hostPeer, type: "answer", payload: ["sdp": answerSDP])
            return true
        } catch {
            Log.error("could not answer the store's offer: \(error.localizedDescription)")
            return false
        }
    }

    // MARK: - Peer callbacks

    private func forwardLocalCandidate(_ candidate: RTCIceCandidate?) {
        guard let signaling else { return }
        // An explicit JSON null is how end-of-gathering is spelled on this wire,
        // so the nil case is sent rather than skipped.
        var payload: Any = NSNull()
        if let candidate { payload = PeerConnectionManager.json(for: candidate) }
        let host = hostPeer
        Task { await signaling.send(to: host, type: "ice", payload: payload) }
    }

    private func handleConnectionState(_ state: RTCPeerConnectionState) {
        guard state == .connected else { return }
        isConnected = true
        backoff = Backoff.initial
        // Frames are arriving, so whatever the store last called permanent
        // isn't: a kiosk switched into 2.5D and back is exactly this case.
        clearMessage()
        showLegend(seconds: 9)
    }

    private func handlePlaybackState(_ playback: Bool) {
        let was = isPlayback
        isPlayback = playback
        // A film starting is the one moment the picture changes with nothing on
        // screen to explain it — say which buttons still work, briefly.
        if playback && !was { showLegend(seconds: 6) }
    }

    // MARK: - Status heartbeat
    //
    // Not `/__remote/instance/beat` — that one belongs to the HOST (see
    // SignalingClient). This is the periodic `/__remote/status` re-read the
    // browser client does: TURN credentials carry a ~12h TTL, and a long-lived
    // living-room session outlives them. Refreshed here, the NEXT negotiation
    // gets working relay credentials instead of failing ICE with expired ones.

    private func startStatusHeartbeat() {
        statusHeartbeat = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 60 * 1_000_000_000)
                guard !Task.isCancelled, let self, let signaling = self.signaling else { return }
                guard let remote = await signaling.status(), !remote.iceServers.isEmpty else { continue }
                self.iceServers = remote.iceServers
            }
        }
    }

    // MARK: - Helpers

    private func setStatus(_ text: String?) {
        // A store that told us WHY it can't stream keeps saying so.
        if message != nil && text != nil { return }
        status = text
    }

    private func setMessage(_ text: String) {
        message = text
        status = nil
    }

    /// Drop a standing "this can never work" explanation, so the ordinary
    /// connection chatter is allowed to speak again.
    private func clearMessage() {
        fatalReason = nil
        message = nil
        status = nil
    }

    private func pause(_ seconds: TimeInterval) async {
        try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
    }
}
