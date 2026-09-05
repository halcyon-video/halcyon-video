# Halcyon Video for Apple TV (tvOS)

A native Remote Play client: the store runs on a computer somewhere in the
house, renders itself there, and streams to the Apple TV over WebRTC. The Siri
Remote's presses go back the other way as ordinary DOM keyboard events. Tracked
in [#81](https://github.com/halcyon-video/halcyon-video/issues/81) /
[#149](https://github.com/halcyon-video/halcyon-video/issues/149).

**Status: written, never compiled.** Every Swift file here was authored on a
Linux machine with no Swift toolchain — no `swiftc`, no `xcodebuild`, no
simulator. It is written against the protocol doc and the browser client rather
than against a compiler, so treat the first `xcodegen generate && ⌘B` as part of
the work, not as a formality. The [Could not verify](#could-not-verify) list at
the bottom is the honest account of what that means.

Two things still gate a shipped build, and neither is code:

- An Apple Developer account (99 USD/yr) — required to build, sign, or run
  anything on real Apple TV hardware, even for local testing.
- A Mac with Xcode — tvOS apps can only be built and signed there; there is no
  cross-compiling this from Linux.

## Why this can't be the Fire TV app again

[`../android-tv/`](../android-tv/README.md) is a WebView wrapper: it loads
`/remote.html` and lets the page do all the WebRTC and input work, with a thin
native shim only to forward D-pad/BACK keys the WebView swallows. **tvOS does
not allow WebViews in apps distributed through the App Store**, so there is no
equivalent shortcut here — everything `src/remote-viewer.ts` does had to be
written again in Swift.

The wire contract is documented once, for every client, in
[`../docs/remote-play-protocol.md`](../docs/remote-play-protocol.md). Read that
before changing anything here. Nothing in this app is tvOS-specific except the
UI and the remote mapping.

## Building it on a Mac

Assumes Xcode 15 or newer, an Apple TV on the same network as the Mac, and a
store already running with Remote Play on.

1. **Install XcodeGen** (once): `brew install xcodegen`. There is no `.xcodeproj`
   in the repo on purpose — `project.yml` is the source of truth, because a
   generated pbxproj is a merge conflict nobody can read.

2. **Generate the project**:

   ```sh
   cd tvos
   xcodegen generate
   open HalcyonRemote.xcodeproj
   ```

3. **Let Swift Package Manager fetch WebRTC.** Xcode does this on first open;
   if it doesn't, *File → Packages → Resolve Package Versions*. The dependency
   is [stasel/WebRTC](https://github.com/stasel/WebRTC), the maintained binary
   distribution of Google's libwebrtc Objective-C SDK as an XCFramework — around
   a 200 MB download, once. `project.yml` asks for a deliberately wide version
   range (its tags track Chromium milestones, so every milestone bumps the
   major); **once a version builds, pin it exactly** by setting `minVersion` and
   `maxVersion` to that tag, and say which one in the commit.

4. **Sign it.** Select the `HalcyonRemote` target → *Signing & Capabilities* →
   tick *Automatically manage signing* and choose your team. (Or set
   `DEVELOPMENT_TEAM` in `project.yml` and regenerate — but don't commit your
   team id.) The bundle id is `video.halcyon.remote`; change it if it collides
   with something already on your account.

5. **Pick a destination and run.** ⌘R with an Apple TV selected. The tvOS
   simulator works for the UI and the setup screen — its software remote sends
   arrow/select/menu presses — but it is a poor test of the stream; judge
   latency and video on real hardware.

6. **First launch asks for the store's address.** Type what you would type in a
   browser: `192.168.1.20`, or `192.168.1.20:1420`, or a whole pasted
   `http://…/remote.html?tv=1` URL. Port 1420 is assumed when you don't say. It
   is remembered, and every launch after this goes straight to the store.

7. **Say yes to the local-network prompt.** tvOS asks once, the first time the
   app talks to a LAN address. Deny it and the app looks broken with no
   explanation — the connection just never happens. `Settings → Apps → Halcyon`
   on the Apple TV is where to undo a mistaken "Don't Allow".

8. **Run the tests** with ⌘U. There is one test target, covering the address
   parser — the only piece of this app that is pure logic and therefore the only
   piece testable without hardware.

If it won't connect, open the same address in a browser with `/remote.html` on
the end. If that works and the app doesn't, the bug is in this directory; if
neither works, the store isn't hosting. The setup screen says so too, because
that is the one diagnostic a person in a living room can actually run.

### Before TestFlight

No asset catalog is checked in, so the app has no icon. A signed build runs on a
device perfectly well without one; **TestFlight and App Store submission do
not**. Add an `Assets.xcassets` with a tvOS *Brand Assets* set (App Icon layers,
Top Shelf image) before archiving. Take the artwork from the brand pipeline the
rest of the project uses — do not draw a wordmark by hand.

App Review will ask about `NSAllowsArbitraryLoads`. The answer is in
`project.yml` beside the key: this app only ever talks to a server the user runs
themselves, at an address they typed in, over plain http on their own LAN,
and there is no remote endpoint to secure.

## What's in here

| File | Job |
| --- | --- |
| `project.yml` | The XcodeGen spec: target, tvOS 17, the WebRTC package, Info.plist keys. |
| `StoreAddress.swift` | Turns typed text into an origin. A port of the Fire TV client's Kotlin parser, so both clients accept the same input. Pure Foundation, hence testable. |
| `SignalingClient.swift` | The four `/__remote/*` routes: status, long-poll, send, private instance. |
| `PeerConnectionManager.swift` | The answering peer connection, the video track, the input data channel, the audio session. |
| `RemoteSession.swift` | The loop: who's hosting → hello → offer → answer → ICE → stay → back off → again. A port of `main()`/`session()` in `src/remote-viewer.ts`. |
| `SiriRemoteInput.swift` | Presses → DOM keys, held-direction repeat, the MENU long-press. |
| `VideoSurface.swift` / `StoreScreen.swift` | The stream, the status pill, the control legend. |
| `SetupScreen.swift` / `SettingsScreen.swift` / `StoreSettings.swift` | First-run address entry, the in-app menu, and `UserDefaults`. |

## Siri Remote mapping

Every row sends an ordinary `{t:"key", key, code}` data-channel message — see
the protocol doc's keyboard vocabulary table. No bridge object, no tvOS-specific
message type.

| Siri Remote | Sends | Store action |
| --- | --- | --- |
| Click-pad Up/Down/Left/Right | `ArrowUp` / `ArrowDown` / `ArrowLeft` / `ArrowRight` | Browse; seek during playback |
| Click (centre) | `Enter` | Select / OK |
| MENU (tap) | `Escape` | Back out one level |
| MENU (hold ~0.8s) | — | Opens this app's own menu |
| Play/Pause | `' '` (Space) | Select, or pause/resume during playback |
| Touch-surface swipes | — | Optional later: `{t:"look"}` deltas for free-look. Not needed for browse → inspect → play. |

Two behaviours worth knowing before you change this:

**Held directions repeat in the app.** tvOS delivers exactly one `pressesBegan`
for a held click-pad edge — there is no OS key repeat to inherit the way a
browser has — so the repeat is generated locally at 450 ms then every 120 ms,
and marked `repeat: true`. That flag is not cosmetic: the protocol's
backpressure rule lets the sender drop repeats when the channel is backed up,
which is what stops a network stall from becoming a burst of stale steps.

**MENU is trapped, and the long press is the way out.** Presses are taken
through the first responder rather than the focus engine, because `UIPress`
events walk the responder chain and anything the app doesn't claim reaches the
root view controller — where tvOS spends MENU on quitting. Holding MENU opens
the app's own menu (change address, reconnect, show the controls), and on that
screen MENU means what tvOS says it means. So the trap is always one press away
from a screen that behaves normally.

## The control legend

The store's own HUD, help page, hold hints and player OSD are all DOM siblings
of the host's canvas, so **none of them are in the captured stream**. The line
along the bottom is the only controls reference an Apple TV viewer has. It shows
for 9 s on connect, swaps to the playback wording when the host says a film is
on the wire (`{"t":"state","playback":true}`), and is recallable from the app's
menu — the Siri Remote has no spare button to be the browser's `H` key.

## First-run flow

Same shape as the Fire TV app's `SetupActivity`/`StorePrefs`: a text field on
first launch, remembered in `UserDefaults` afterward, skipped on every launch
after that. `UserDefaults` rather than the Keychain deliberately — a LAN address
is not a secret, and the Keychain would only add a failure mode to the one
screen that has to be foolproof. The address can be changed later from the
in-app menu without reinstalling.

## Could not verify

Nothing below was run. These are the specific places where a Linux-authored
Swift file is most likely to be wrong, ordered by how likely and how annoying:

1. **It has never been compiled.** Expect ordinary type and label errors on the
   first build. None of the WebRTC API calls have been checked against a real
   SDK header, only against its documented shape.
2. **`peerConnectionWithConfiguration:` nullability.** It is declared `nullable`
   in the M100-and-later ObjC SDK, which is what the version range resolves to,
   so `PeerConnectionManager.accept` uses `guard let`. On an older SDK where it
   is non-optional that one line will not compile — make it a plain `let`. There
   is a comment saying so at the call site.
3. **`RTCAudioSessionConfiguration` on tvOS.** Assumed present (tvOS defines
   `TARGET_OS_IPHONE`). If it isn't, delete `configureAudioSession()` and its
   call in `HalcyonRemoteApp.init` — audio will fall back to the SDK's default
   configuration.
4. **`setJitterBufferMinimumDelay:`.** Called through `responds(to:)` precisely
   because it isn't in every SDK version. If the selector is missing the call is
   skipped and the stream simply carries the SDK's default receive buffer, which
   the protocol doc says reads as input lag. Worth checking on real hardware
   whether it took effect.
5. **First responder and presses.** The whole input path rests on
   `RemotePressView` becoming first responder inside a `UIViewRepresentable`. If
   presses never arrive, that is the first thing to check — and the fallback is
   SwiftUI's `onMoveCommand`/`onExitCommand`, which give no key-up events and
   would need the down/up pairing faked.
6. **MENU, both ways.** The design (trap MENU on the store screen, long press
   for a screen where it behaves) is the same bargain every tvOS game makes, but
   it has not been through review — and the closing half is untested too: the
   app menu relies on `onExitCommand` firing once the press view has resigned
   first responder. If MENU there quits the app instead of closing the menu,
   the fix is to keep the press view as first responder and handle MENU in it
   for both screens rather than handing the button back.
7. **The local-network prompt.** `NSLocalNetworkUsageDescription` is set and
   `NSBonjourServices` is deliberately absent, since nothing here browses
   Bonjour. If a fresh install turns out to need a Bonjour browse to trigger the
   prompt at all, that's the knob.
8. **Private instances.** The client supports them (it falls back to a private
   per-visitor render when no kiosk is mirroring, and remembers the id across
   launches), but that path has never been exercised from this app.

## Done when

A Siri Remote drives browse → inspect → play on real Apple TV hardware, and a
TestFlight build exists — per issue #81. The Swift is written; the hardware
half is not, and cannot be from here.
