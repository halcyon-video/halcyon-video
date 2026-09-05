import Foundation

/// One ICE server as the store's `/__remote/status` endpoint describes it.
/// `urls` is normalised here because the endpoint may send a string or an
/// array, exactly as `RTCIceServer` in the browser accepts either.
struct IceServerSpec {
    let urls: [String]
    let username: String?
    let credential: String?
}

/// The parsed body of `GET /__remote/status`.
struct RemoteStatus {
    let hostOnline: Bool
    let instanceCap: Int
    let instancesRunning: Int
    let seeded: Bool
    let iceServers: [IceServerSpec]

    /// The server was built with the private-instance manager. A cap of zero
    /// means the feature is off and the shared kiosk mirror is the only way in.
    var supportsPrivateInstances: Bool { instanceCap > 0 }
}

/// One entry out of `GET /__remote/poll`.
struct SignalMessage {
    let from: String
    let type: String
    let payload: [String: Any]?
}

/// The three shapes `POST /__remote/instance` answers with.
enum InstanceResult {
    case ready(id: String, fresh: Bool)
    /// Every private slot is taken. Transient — the browser client retries.
    case atCapacity
    /// The host can't render at all (`no-webgl2`). Permanent for this machine:
    /// retrying will never help, so the caller falls back to the shared mirror
    /// or stops.
    case unavailable(message: String)
    case failed
}

/// The HTTP half of Remote Play: a mailbox, not a socket.
///
/// Every route and every field name here comes from `docs/remote-play-protocol.md`
/// and is cross-checked against the browser client in `src/remote-viewer.ts`.
/// The one thing this client deliberately does NOT implement is
/// `POST /__remote/instance/beat`: the heartbeat is sent by the *host* browser
/// (`src/remote-play.ts` beats every 20s with its live viewer count), not by
/// viewers. A viewer beating would tell the reaper the wrong thing.
final class SignalingClient {
    let base: URL
    /// Chosen once per app launch and never regenerated, matching the
    /// browser's `'v' + Math.random().toString(36).slice(2, 10)`.
    let peerId: String

    /// Long-poll session. The server holds a poll for ~25s and always answers
    /// 200, so the client's own timeout must sit comfortably above that; the
    /// browser uses `AbortSignal.timeout(35_000)`.
    private let pollSession: URLSession
    /// Everything else: status, send, instance. Short and impatient.
    private let shortSession: URLSession
    /// Spawning a private instance boots a whole headless Chromium.
    private let instanceSession: URLSession

    init(base: URL, peerId: String = SignalingClient.makePeerId()) {
        self.base = base
        self.peerId = peerId

        func session(timeout: TimeInterval) -> URLSession {
            let config = URLSessionConfiguration.ephemeral
            config.timeoutIntervalForRequest = timeout
            config.timeoutIntervalForResource = timeout
            config.waitsForConnectivity = false
            config.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
            config.allowsCellularAccess = true
            return URLSession(configuration: config)
        }

        pollSession = session(timeout: 35)
        shortSession = session(timeout: 10)
        instanceSession = session(timeout: 90)
    }

    static func makePeerId() -> String {
        let alphabet = Array("0123456789abcdefghijklmnopqrstuvwxyz")
        var id = "v"
        for _ in 0..<8 {
            id.append(alphabet.randomElement() ?? "0")
        }
        return id
    }

    // MARK: - Routes

    /// `GET /__remote/status`. Returns nil when the store server can't be
    /// reached at all, which the caller shows as "unreachable" rather than
    /// "offline" — a different thing.
    func status() async -> RemoteStatus? {
        guard let url = url(path: "/__remote/status") else { return nil }
        do {
            let (data, response) = try await shortSession.data(from: url)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return nil }
            guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }

            let instances = object["instances"] as? [String: Any] ?? [:]
            return RemoteStatus(
                hostOnline: object["hostOnline"] as? Bool ?? false,
                instanceCap: intValue(instances["cap"]) ?? 0,
                instancesRunning: intValue(instances["running"]) ?? 0,
                seeded: instances["seeded"] as? Bool ?? false,
                iceServers: Self.parseIceServers(object["iceServers"])
            )
        } catch {
            return nil
        }
    }

    /// `POST /__remote/send`. Fire-and-forget by design: the browser ignores
    /// the reply too, and a dropped signal is recovered by the session restart.
    /// `to` is `"host"` for the shared kiosk mirror or `"host-<instanceId>"`
    /// for a private one. `payload` may be `NSNull()` to send an explicit
    /// `null`, which is how end-of-candidates is spelled.
    func send(to host: String, type: String, payload: Any?) async {
        guard let url = url(path: "/__remote/send") else { return }
        var body: [String: Any] = ["to": host, "from": peerId, "type": type]
        if let payload { body["payload"] = payload }
        guard let data = try? JSONSerialization.data(withJSONObject: body) else {
            Log.error("signal \(type): body would not serialise")
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = data
        do {
            _ = try await shortSession.data(for: request)
        } catch {
            Log.error("signal \(type) failed: \(error.localizedDescription)")
        }
    }

    /// `GET /__remote/poll?peer=<peerId>`. Long-poll; an empty `msgs` array is
    /// the normal answer to a quiet 25 seconds and means "ask again at once".
    /// Throws only on transport failure, which the caller answers with a 1.5s
    /// pause before retrying (browser parity).
    func poll() async throws -> [SignalMessage] {
        guard let pollURL = url(path: "/__remote/poll"),
              var components = URLComponents(url: pollURL, resolvingAgainstBaseURL: false) else {
            throw SignalingError.badURL
        }
        components.queryItems = [URLQueryItem(name: "peer", value: peerId)]
        guard let url = components.url else { throw SignalingError.badURL }

        let (data, response) = try await pollSession.data(from: url)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw SignalingError.badStatus((response as? HTTPURLResponse)?.statusCode ?? -1)
        }
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw SignalingError.malformed
        }
        let raw = object["msgs"] as? [[String: Any]] ?? []
        return raw.compactMap { entry in
            guard let type = entry["type"] as? String else { return nil }
            return SignalMessage(
                from: entry["from"] as? String ?? "host",
                type: type,
                payload: entry["payload"] as? [String: Any]
            )
        }
    }

    /// `POST /__remote/instance`. `reuse` is a previously-issued id; the server
    /// hands the same instance back if it is still alive, which is what makes a
    /// reconnect land in the store you left rather than a fresh one.
    func requestInstance(reuse: String?, fast: Bool = false) async -> InstanceResult {
        guard let url = url(path: "/__remote/instance") else { return .failed }
        var body: [String: Any] = ["fast": fast]
        if let reuse, !reuse.isEmpty { body["reuse"] = reuse }
        guard let data = try? JSONSerialization.data(withJSONObject: body) else { return .failed }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = data

        do {
            let (responseData, response) = try await instanceSession.data(for: request)
            let object = (try? JSONSerialization.jsonObject(with: responseData)) as? [String: Any] ?? [:]
            let code = (response as? HTTPURLResponse)?.statusCode ?? -1

            if code == 200, let id = object["id"] as? String, !id.isEmpty {
                return .ready(id: id, fresh: object["fresh"] as? Bool ?? true)
            }
            let error = object["error"] as? String ?? ""
            if error == "no-webgl2" {
                let message = object["message"] as? String
                    ?? "This store's machine can't render a private store."
                return .unavailable(message: message)
            }
            if code == 503 {
                return .atCapacity
            }
            Log.error("instance request: HTTP \(code) \(error)")
            return .failed
        } catch {
            Log.error("instance request failed: \(error.localizedDescription)")
            return .failed
        }
    }

    // MARK: - Helpers

    private func url(path: String) -> URL? {
        URL(string: path, relativeTo: base)?.absoluteURL
    }

    private func intValue(_ any: Any?) -> Int? {
        if let number = any as? NSNumber { return number.intValue }
        if let string = any as? String { return Int(string) }
        return nil
    }

    /// The status endpoint's `iceServers` is handed to `RTCPeerConnection`
    /// verbatim in the browser, so it uses the WebRTC JSON shape: `urls` is a
    /// string or an array of strings, and TURN entries carry `username` and
    /// `credential`. The protocol doc is explicit that this list must be used
    /// as given rather than hardcoding STUN — off-LAN viewers only work through
    /// the TURN relay the server spawns, with time-limited credentials.
    static func parseIceServers(_ any: Any?) -> [IceServerSpec] {
        guard let entries = any as? [[String: Any]] else { return [] }
        return entries.compactMap { entry in
            let urls: [String]
            if let single = entry["urls"] as? String {
                urls = [single]
            } else if let many = entry["urls"] as? [String] {
                urls = many
            } else if let single = entry["url"] as? String {
                urls = [single]
            } else {
                return nil
            }
            if urls.isEmpty { return nil }
            return IceServerSpec(
                urls: urls,
                username: entry["username"] as? String,
                credential: entry["credential"] as? String
            )
        }
    }

    /// What the client falls back to before the first successful status poll,
    /// matching the browser's initial value.
    static let defaultIceServers = [
        IceServerSpec(urls: ["stun:stun.l.google.com:19302"], username: nil, credential: nil)
    ]
}

enum SignalingError: Error {
    case badURL
    case badStatus(Int)
    case malformed
}
