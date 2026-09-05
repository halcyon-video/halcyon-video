import Foundation

/// Where the store is, remembered between launches.
///
/// The Fire TV client keeps the same two values in `StorePrefs`; this is the
/// tvOS half of that pair. `UserDefaults` rather than the Keychain on purpose —
/// a LAN address is not a secret, and the Keychain would only add a failure
/// mode to a first-run screen that has to be foolproof.
@MainActor
final class StoreSettings: ObservableObject {

    private enum Key {
        static let address = "halcyon.store.address"
        static let instance = "halcyon.store.instanceId"
    }

    private let defaults: UserDefaults

    /// Exactly what the owner typed, kept verbatim so the settings screen can
    /// show it back to them rather than a normalised form they never entered.
    @Published var address: String {
        didSet { defaults.set(address, forKey: Key.address) }
    }

    /// The private instance last handed out for this store, so a relaunch
    /// reconnects to one that is still warm instead of paying another ~30s boot.
    /// The browser keeps this in sessionStorage; an app has no session to hang
    /// it on, and a stale id is harmless — the server just mints a fresh one.
    @Published var instanceId: String? {
        didSet { defaults.set(instanceId, forKey: Key.instance) }
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        address = defaults.string(forKey: Key.address) ?? ""
        instanceId = defaults.string(forKey: Key.instance)
    }

    /// Nil until someone has typed something that parses, which is exactly the
    /// condition for showing the first-run screen.
    var origin: URL? { StoreAddress.baseURL(address) }

    /// The browser viewer for the same store, printed on the setup screen as the
    /// thing to try when this app can't connect — it isolates "the store isn't
    /// reachable" from "this client is wrong".
    var viewerURL: String? { StoreAddress.viewerURL(address) }

    var isConfigured: Bool { origin != nil }
}
