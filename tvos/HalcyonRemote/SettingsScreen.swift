import SwiftUI

/// The app's own menu, opened by holding MENU on the store screen.
///
/// It exists because the Siri Remote has no spare button. The web viewer has a
/// keyboard's worth of viewer-local keys (H for the legend, L for mouse look, a
/// corner button to swap between the shared kiosk and a private store); a remote
/// with five buttons has none to spare, so all of it lives behind one long press.
///
/// MENU inside here closes it — which is also what keeps this app well-behaved
/// on tvOS: the store screen traps MENU, but the trap is always one press away
/// from a screen where MENU means what tvOS says it means.
struct SettingsScreen: View {

    @EnvironmentObject private var settings: StoreSettings
    @EnvironmentObject private var session: RemoteSession
    @Binding var isPresented: Bool

    @State private var editingAddress = false

    /// Explicit for the same reason `SetupScreen`'s is.
    init(isPresented: Binding<Bool>) {
        _isPresented = isPresented
    }

    var body: some View {
        ZStack {
            Palette.background.ignoresSafeArea()

            if editingAddress {
                SetupScreen(isEditing: true, onDone: { editingAddress = false })
                    .environmentObject(settings)
            } else {
                menu
            }
        }
        .onExitCommand {
            // MENU: out of the address editor, then out of the menu entirely.
            if editingAddress { editingAddress = false } else { isPresented = false }
        }
    }

    private var menu: some View {
        VStack(alignment: .leading, spacing: 30) {
            Text("Halcyon")
                .font(.system(size: 52, weight: .bold))
                .foregroundStyle(Palette.pillText)

            VStack(alignment: .leading, spacing: 8) {
                Text(settings.origin?.absoluteString ?? "No store address set")
                    .font(.system(size: 26, design: .monospaced))
                    .foregroundStyle(Palette.legendText)
                Text(connectionSummary)
                    .font(.system(size: 22))
                    .foregroundStyle(Palette.legendText.opacity(0.8))
            }

            VStack(alignment: .leading, spacing: 20) {
                Button("Back to the store") { isPresented = false }
                Button("Show the controls") {
                    session.showLegend()
                    isPresented = false
                }
                Button("Change store address") { editingAddress = true }
                Button("Reconnect now") {
                    session.stop()
                    if let origin = settings.origin {
                        session.connect(to: origin, settings: settings)
                    }
                    isPresented = false
                }
            }
            .font(.system(size: 30, weight: .semibold))

            ControlLegend(playback: session.isPlayback)
                .padding(.top, 20)
        }
        .padding(80)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var connectionSummary: String {
        if let message = session.message { return message }
        if session.isConnected { return "Connected." }
        return session.status ?? "Not connected."
    }
}
