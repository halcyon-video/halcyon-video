import SwiftUI

/// The store, and nothing else.
///
/// Everything a viewer normally reads off the store's own HUD — the help page,
/// the hold hints, the player OSD — is a DOM sibling of the host's canvas and is
/// therefore NOT in the captured stream. The pill and the legend below are the
/// only chrome an Apple TV viewer has, which is why the legend is recallable
/// (hold MENU) rather than shown once and lost, exactly as on the web viewer.
struct StoreScreen: View {

    @EnvironmentObject private var settings: StoreSettings
    @EnvironmentObject private var session: RemoteSession
    @State private var showingMenu = false

    var body: some View {
        ZStack {
            Palette.background.ignoresSafeArea()

            VideoSurface(track: session.videoTrack)
                .ignoresSafeArea()

            RemoteInputSurface(
                isCapturing: !showingMenu,
                onKey: { key, code, down, isRepeat in
                    session.sendKey(key, code: code, down: down, isRepeat: isRepeat)
                },
                onMenuHeld: { showingMenu = true }
            )
            .ignoresSafeArea()

            VStack {
                if let message = session.message {
                    StatusParagraph(text: message)
                        .padding(.top, 40)
                } else if let status = session.status {
                    StatusPill(text: status)
                        .padding(.top, 40)
                }
                Spacer()
                if session.isLegendVisible {
                    ControlLegend(playback: session.isPlayback)
                        .padding(.bottom, 50)
                        .transition(.opacity)
                }
            }
        }
        .animation(.easeInOut(duration: 0.25), value: session.isLegendVisible)
        .fullScreenCover(isPresented: $showingMenu) {
            SettingsScreen(isPresented: $showingMenu)
                .environmentObject(settings)
                .environmentObject(session)
        }
    }
}

/// The short one: "Connecting…", "Connection lost — reconnecting…".
struct StatusPill: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 28, weight: .semibold))
            .textCase(.uppercase)
            .foregroundStyle(Palette.pillText)
            .padding(.horizontal, 34)
            .padding(.vertical, 18)
            .background(Capsule().fill(Palette.pillFill.opacity(0.92)))
            .overlay(Capsule().stroke(Palette.pillEdge, lineWidth: 2))
    }
}

/// The long one: the store explaining a failure someone has to go and fix.
/// Laid out as a paragraph, because it never fits in a pill and a viewer who
/// can't read it is a viewer staring at a spinner.
struct StatusParagraph: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 30, weight: .medium))
            .multilineTextAlignment(.center)
            .foregroundStyle(Palette.pillText)
            .lineSpacing(8)
            .frame(maxWidth: 1000)
            .padding(40)
            .background(RoundedRectangle(cornerRadius: 24).fill(Palette.pillFill.opacity(0.92)))
            .overlay(RoundedRectangle(cornerRadius: 24).stroke(Palette.pillEdge, lineWidth: 2))
    }
}

/// The web viewer's two TV legends, in Siri Remote words. The store half and
/// the playback half swap on the host's `{"t":"state"}` message — the keys keep
/// working when a film starts, and nothing else on screen would say so.
struct ControlLegend: View {
    let playback: Bool

    private var text: String {
        playback
            ? "Now playing  ·  Play/Pause resumes  ·  ◀ ▶ seek  ·  MENU stops  ·  hold MENU for settings"
            : "Click-pad browses  ·  Click selects  ·  MENU backs out  ·  hold MENU for settings"
    }

    var body: some View {
        Text(text)
            .font(.system(size: 24, weight: .medium))
            .foregroundStyle(Palette.legendText)
            .padding(.horizontal, 28)
            .padding(.vertical, 14)
            .background(RoundedRectangle(cornerRadius: 12).fill(Palette.legendFill.opacity(0.8)))
    }
}
