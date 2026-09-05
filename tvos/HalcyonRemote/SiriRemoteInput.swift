import SwiftUI
import UIKit

/// The Siri Remote, translated into the store's keyboard vocabulary.
///
/// Everything this app sends is an ordinary `{t:"key", key, code}` message from
/// `docs/remote-play-protocol.md` — the host's `InputManager` has no idea a
/// television remote is on the other end, exactly as with the Fire TV client and
/// the phone thumb-pad. `key` and `code` are real DOM `KeyboardEvent` values
/// because the host is a browser and knows nothing about `UIPress.PressType`.
enum SiriRemoteKey {

    /// Nil for a press this app has no opinion about, which is then handed back
    /// to tvOS (the volume/TV buttons, the colour keys on a third-party remote).
    static func mapping(for type: UIPress.PressType) -> (key: String, code: String)? {
        switch type {
        case .upArrow: return ("ArrowUp", "ArrowUp")
        case .downArrow: return ("ArrowDown", "ArrowDown")
        case .leftArrow: return ("ArrowLeft", "ArrowLeft")
        case .rightArrow: return ("ArrowRight", "ArrowRight")
        case .select: return ("Enter", "Enter")
        case .menu: return ("Escape", "Escape")
        // Space is select in the store and pause/resume in the player — one
        // button doing one thing, the way the gamepad's A does.
        case .playPause: return (" ", "Space")
        default: return nil
        }
    }

    /// Holding a direction should keep browsing. tvOS delivers exactly one
    /// `pressesBegan` for a held click-pad edge — there is no OS key repeat to
    /// inherit the way a browser has — so the repeat is generated here, marked
    /// `repeat: true` so the protocol's backpressure rule may drop it.
    static func repeatsWhenHeld(_ type: UIPress.PressType) -> Bool {
        switch type {
        case .upArrow, .downArrow, .leftArrow, .rightArrow: return true
        default: return false
        }
    }

    /// Matches a browser's typical 500ms/30Hz autorepeat closely enough that
    /// browsing feels the same on both clients, without flooding a channel whose
    /// round trip is a whole render.
    static let repeatDelay: TimeInterval = 0.45
    static let repeatInterval: TimeInterval = 0.12

    /// How long MENU must be held to mean "this app's own menu" rather than
    /// "back out one level in the store".
    static let menuHold: TimeInterval = 0.8
}

/// A view whose only job is to be first responder and turn presses into keys.
///
/// It has to be the first responder, not merely focusable: `UIPress` events walk
/// the responder chain, and a view that never becomes first responder watches
/// every press sail past it to the root view controller (where tvOS spends MENU
/// on quitting the app).
final class RemotePressView: UIView {

    /// key, code, isDown, isRepeat.
    var onKey: ((String, String, Bool, Bool) -> Void)?
    /// MENU held down — the Siri Remote has no spare button for a settings entry.
    var onMenuHeld: (() -> Void)?
    /// False while this app's own UI is up, so MENU closes that instead of
    /// backing out of an aisle nobody can see.
    var isCapturing = true {
        didSet { if !isCapturing { cancelRepeat() } }
    }

    private var repeatTimer: Timer?
    private var menuPressedAt: Date?

    override var canBecomeFocused: Bool { true }
    override var canBecomeFirstResponder: Bool { true }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil { becomeFirstResponder() }
    }

    // MARK: - Presses

    override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        var unhandled = Set<UIPress>()
        for press in presses {
            guard isCapturing, let mapping = SiriRemoteKey.mapping(for: press.type) else {
                unhandled.insert(press)
                continue
            }
            if press.type == .menu {
                // MENU's meaning depends on how long it is held, so nothing goes
                // on the wire until the thumb comes off.
                menuPressedAt = Date()
                continue
            }
            onKey?(mapping.key, mapping.code, true, false)
            if SiriRemoteKey.repeatsWhenHeld(press.type) { startRepeat(mapping) }
        }
        if !unhandled.isEmpty { super.pressesBegan(unhandled, with: event) }
    }

    override func pressesEnded(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        var unhandled = Set<UIPress>()
        for press in presses {
            guard isCapturing, let mapping = SiriRemoteKey.mapping(for: press.type) else {
                unhandled.insert(press)
                continue
            }
            if press.type == .menu {
                let held = menuPressedAt.map { Date().timeIntervalSince($0) } ?? 0
                menuPressedAt = nil
                if held >= SiriRemoteKey.menuHold {
                    onMenuHeld?()
                } else {
                    // Down and up together: the store acts on the down, and the
                    // up keeps its InputManager's held-key bookkeeping honest.
                    onKey?(mapping.key, mapping.code, true, false)
                    onKey?(mapping.key, mapping.code, false, false)
                }
                continue
            }
            cancelRepeat()
            onKey?(mapping.key, mapping.code, false, false)
        }
        if !unhandled.isEmpty { super.pressesEnded(unhandled, with: event) }
    }

    override func pressesCancelled(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        var unhandled = Set<UIPress>()
        for press in presses {
            guard isCapturing, let mapping = SiriRemoteKey.mapping(for: press.type) else {
                unhandled.insert(press)
                continue
            }
            cancelRepeat()
            // A cancelled MENU never became a press, so it sends nothing; every
            // other key releases, or the store would think it is still held.
            if press.type == .menu {
                menuPressedAt = nil
            } else {
                onKey?(mapping.key, mapping.code, false, false)
            }
        }
        if !unhandled.isEmpty { super.pressesCancelled(unhandled, with: event) }
    }

    // MARK: - Held-direction repeat

    private func startRepeat(_ mapping: (key: String, code: String)) {
        cancelRepeat()
        let timer = Timer(timeInterval: SiriRemoteKey.repeatInterval, repeats: true) { [weak self] _ in
            // The timer fires outside the main actor; UIView is main-actor
            // bound, so the hop is not optional.
            Task { @MainActor in
                self?.onKey?(mapping.key, mapping.code, true, true)
            }
        }
        timer.fireDate = Date().addingTimeInterval(SiriRemoteKey.repeatDelay)
        RunLoop.main.add(timer, forMode: .common)
        repeatTimer = timer
    }

    private func cancelRepeat() {
        repeatTimer?.invalidate()
        repeatTimer = nil
    }

    deinit {
        repeatTimer?.invalidate()
    }
}

/// SwiftUI wrapper. Invisible and zero-sized in effect — it is laid out over the
/// video only so it has a window to become first responder in.
struct RemoteInputSurface: UIViewRepresentable {

    let isCapturing: Bool
    let onKey: (String, String, Bool, Bool) -> Void
    let onMenuHeld: () -> Void

    func makeUIView(context: Context) -> RemotePressView {
        let view = RemotePressView()
        view.backgroundColor = .clear
        view.isUserInteractionEnabled = true
        view.onKey = onKey
        view.onMenuHeld = onMenuHeld
        view.isCapturing = isCapturing
        return view
    }

    func updateUIView(_ view: RemotePressView, context: Context) {
        view.onKey = onKey
        view.onMenuHeld = onMenuHeld
        view.isCapturing = isCapturing
        // The responder crown follows the visible screen. While this app's own
        // menu is up it has to be given back, or MENU would keep being answered
        // by a store nobody can see instead of closing the menu.
        if isCapturing {
            if !view.isFirstResponder { view.becomeFirstResponder() }
        } else if view.isFirstResponder {
            view.resignFirstResponder()
        }
    }
}
