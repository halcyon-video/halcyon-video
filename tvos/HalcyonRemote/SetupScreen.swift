import SwiftUI

/// First run: where is the store?
///
/// Same shape as the Fire TV client's `SetupActivity` — one field, one button,
/// and it is never seen again once the address sticks. The parser is deliberately
/// forgiving (`StoreAddress`), because the realistic input is somebody reading an
/// address off a laptop across the room and typing it with a click-pad.
struct SetupScreen: View {

    @EnvironmentObject private var settings: StoreSettings
    @State private var typed = ""
    @State private var rejected = false
    @FocusState private var fieldFocused: Bool

    /// Editing an address that already works, rather than entering the first
    /// one: the copy changes and there is a way back out.
    let isEditing: Bool
    let onDone: (() -> Void)?

    /// Written out rather than left to the memberwise initialiser, whose access
    /// level depends on the private `@State` properties above — an explicit one
    /// is the version that is certainly callable from the settings screen.
    init(isEditing: Bool = false, onDone: (() -> Void)? = nil) {
        self.isEditing = isEditing
        self.onDone = onDone
    }

    var body: some View {
        ZStack {
            Palette.background.ignoresSafeArea()

            VStack(alignment: .leading, spacing: 28) {
                Text(isEditing ? "Change store address" : "Connect to your store")
                    .font(.system(size: 56, weight: .bold))
                    .foregroundStyle(Palette.pillText)

                Text("Type the address of the computer running your store — the same one you would open in a browser. The port is 1420 unless you changed it.")
                    .font(.system(size: 28))
                    .foregroundStyle(Palette.legendText)
                    .lineSpacing(6)
                    .frame(maxWidth: 1000, alignment: .leading)

                TextField("192.168.1.20", text: $typed)
                    .font(.system(size: 34, design: .monospaced))
                    .keyboardType(.URL)
                    .autocorrectionDisabled(true)
                    .textInputAutocapitalization(.never)
                    .focused($fieldFocused)
                    .frame(maxWidth: 1000)
                    .onSubmit { save() }

                if rejected {
                    Text("That doesn't look like an address. Try 192.168.1.20, or 192.168.1.20:1420.")
                        .font(.system(size: 24))
                        .foregroundStyle(Palette.pillText)
                }

                HStack(spacing: 24) {
                    Button("Connect") { save() }
                    if isEditing {
                        Button("Cancel") { onDone?() }
                    }
                }
                .font(.system(size: 28, weight: .semibold))

                if let preview = StoreAddress.origin(typed) {
                    // Show what the parser made of it, so a mistyped port is
                    // visible before the connection times out rather than after.
                    Text("Will connect to \(preview)")
                        .font(.system(size: 22, design: .monospaced))
                        .foregroundStyle(Palette.legendText)
                }

                Text("Not connecting? Open the same address in a browser with /remote.html on the end — if that works and this doesn't, it's the app; if neither works, the store isn't hosting.")
                    .font(.system(size: 20))
                    .foregroundStyle(Palette.legendText.opacity(0.75))
                    .lineSpacing(4)
                    .frame(maxWidth: 1000, alignment: .leading)
                    .padding(.top, 12)
            }
            .padding(80)
        }
        .onAppear {
            typed = settings.address
            fieldFocused = true
        }
    }

    private func save() {
        guard StoreAddress.origin(typed) != nil else {
            rejected = true
            return
        }
        rejected = false
        settings.address = typed
        onDone?()
    }
}
