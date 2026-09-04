import Foundation
import os

/// Deliberately tiny. Everything interesting in this app happens across a
/// network and a WebRTC negotiation, both of which are invisible without a
/// trail; `Console.app` on the Mac (or `xcrun devicectl`) shows these while the
/// Apple TV is plugged in.
enum Log {
    private static let logger = Logger(subsystem: "video.halcyon.remote", category: "remote")

    static func info(_ message: String) {
        logger.info("\(message, privacy: .public)")
        #if DEBUG
        print("[halcyon] \(message)")
        #endif
    }

    static func error(_ message: String) {
        logger.error("\(message, privacy: .public)")
        #if DEBUG
        print("[halcyon] ERROR \(message)")
        #endif
    }
}
