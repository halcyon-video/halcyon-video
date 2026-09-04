import Foundation

/// Turns whatever a person types at the setup screen into an origin the
/// signaling client can hang paths off.
///
/// This is a direct port of the Fire TV client's `StoreAddress.kt` and is kept
/// deliberately dependency-free (Foundation only, no UIKit, no URLSession) so
/// it stays unit-testable and so the two clients accept exactly the same
/// inputs. If you change a rule here, change it there.
///
/// Accepted, all producing `http://192.168.1.20:1420`:
///   `192.168.1.20`, `192.168.1.20:1420`, `http://192.168.1.20:1420`,
///   `http://192.168.1.20:1420/remote.html?tv=1`, with any surrounding spaces.
enum StoreAddress {
    /// The vite dev/preview server the store is served from.
    static let defaultPort = 1420

    /// `scheme://host[:port]` with no trailing slash, or nil if the text can't
    /// be an address.
    static func origin(_ raw: String?) -> String? {
        guard var text = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else {
            return nil
        }

        // Scheme. Anything but http/https is a typo, not a protocol we speak.
        let lowered = text.lowercased()
        var scheme = "http"
        if lowered.hasPrefix("https://") {
            scheme = "https"
            text = String(text.dropFirst("https://".count))
        } else if lowered.hasPrefix("http://") {
            text = String(text.dropFirst("http://".count))
        } else if text.contains("://") {
            return nil
        }

        // Path, query and fragment are noise here: people paste the whole
        // viewer URL out of a browser bar.
        if let cut = text.firstIndex(where: { $0 == "/" || $0 == "?" || $0 == "#" }) {
            text = String(text[..<cut])
        }
        text = text.trimmingCharacters(in: .whitespaces)
        if text.isEmpty { return nil }

        let host: String
        var port: Int?

        if text.hasPrefix("[") {
            // IPv6 literal: `[::1]` or `[::1]:1420`.
            guard let close = text.firstIndex(of: "]") else { return nil }
            host = String(text[...close])
            let rest = text[text.index(after: close)...]
            if rest.hasPrefix(":") {
                guard let parsed = Int(rest.dropFirst()) else { return nil }
                port = parsed
            } else if !rest.isEmpty {
                return nil
            }
        } else if let colon = text.lastIndex(of: ":") {
            host = String(text[..<colon])
            guard let parsed = Int(text[text.index(after: colon)...]) else { return nil }
            port = parsed
        } else {
            host = text
        }

        if host.isEmpty || host.contains(" ") { return nil }
        if let port, port < 1 || port > 65535 { return nil }

        // No port typed: http means the store's own port; https means whoever
        // put a TLS terminator in front already chose 443, so say nothing.
        if let port {
            return "\(scheme)://\(host):\(port)"
        }
        return scheme == "http" ? "\(scheme)://\(host):\(defaultPort)" : "\(scheme)://\(host)"
    }

    /// The origin as a `URL`, which is what `SignalingClient` actually wants.
    static func baseURL(_ raw: String?) -> URL? {
        guard let origin = origin(raw) else { return nil }
        return URL(string: origin)
    }

    /// The browser viewer for the same store. This app never loads it — tvOS
    /// forbids WebViews in App Store builds, which is the whole reason the
    /// native client exists — but it is the thing to try in a browser when the
    /// native client can't connect, so the setup screen prints it.
    static func viewerURL(_ raw: String?) -> String? {
        guard let origin = origin(raw) else { return nil }
        return "\(origin)/remote.html?tv=1&tvapp=1"
    }
}
