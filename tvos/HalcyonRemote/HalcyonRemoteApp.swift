import SwiftUI

@main
struct HalcyonRemoteApp: App {

    @StateObject private var settings = StoreSettings()
    @StateObject private var session = RemoteSession()

    init() {
        // Do this once, before any peer connection exists: the SDK reads the
        // audio configuration when it builds its audio device module.
        PeerConnectionManager.configureAudioSession()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(settings)
                .environmentObject(session)
        }
    }
}

/// First run shows the setup screen; every launch after that goes straight to
/// the store, which is the whole point of remembering the address.
struct RootView: View {

    @EnvironmentObject private var settings: StoreSettings
    @EnvironmentObject private var session: RemoteSession
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if let origin = settings.origin {
                StoreScreen()
                    .onAppear { session.connect(to: origin, settings: settings) }
            } else {
                SetupScreen()
            }
        }
        .onChange(of: settings.origin) { _, origin in
            // Typing a new address at the settings screen re-points the session
            // rather than restarting the app.
            if let origin {
                session.connect(to: origin, settings: settings)
            } else {
                session.stop()
            }
        }
        .onChange(of: scenePhase) { _, phase in
            // Hold nothing open in the background: the host reaps a viewer that
            // stops answering, and a private instance with no viewers is killed
            // a few minutes later. Saying goodbye makes both immediate.
            switch phase {
            case .background:
                session.stop()
            case .active:
                if let origin = settings.origin { session.connect(to: origin, settings: settings) }
            default:
                break
            }
        }
    }
}
