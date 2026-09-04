# Halcyon Video for Apple TV (tvOS)

Status: **scoped, not started.** Tracked in
[#81](https://github.com/halcyon-video/halcyon-video/issues/81). Blocked on
two things nobody on this project currently has:

- An Apple Developer account (99 USD/yr) — required to build, sign, or run
  anything on real Apple TV hardware, even for local testing.
- A Mac with Xcode — tvOS apps can only be built and signed there; there is
  no cross-compiling this from Linux.

Whoever picks this up next also needs to make one call before writing code:
**TestFlight first, or straight to App Store review.**

## Why this can't be the Fire TV app again

[`../android-tv/`](../android-tv/README.md) is a WebView wrapper: it loads
`/remote.html` and lets the page do all the WebRTC and input work, with a
thin native shim only to forward D-pad/BACK keys the WebView swallows.
**tvOS does not allow WebViews in apps distributed through the App Store**,
so there is no equivalent shortcut here — this has to be a real native app: a
SwiftUI view showing decoded WebRTC video, a WebRTC framework (e.g. the
`WebRTC` Swift Package) doing the peer connection, and the same HTTP
long-poll signaling every other client speaks.

The full wire contract (HTTP signaling endpoints, WebRTC session setup, and
the data-channel message format) is documented once, for every client, in
[`../docs/remote-play-protocol.md`](../docs/remote-play-protocol.md) — read
that before writing any Swift. Nothing about it is tvOS-specific except the
UI and the remote-mapping table below.

## Siri Remote mapping (proposed)

Every row sends an ordinary `{t:"key", key, code}` data-channel message — see
the protocol doc's keyboard vocabulary table. No bridge object, no
tvOS-specific message type needed.

| Siri Remote | Sends | Store action |
| --- | --- | --- |
| Click-pad edges (swipe/click Up/Down/Left/Right) | `ArrowUp` / `ArrowDown` / `ArrowLeft` / `ArrowRight` | Browse |
| Click (center) | `Enter` | Select / OK |
| Menu / Back | `Escape` | Back out |
| Play/Pause | `' '` (Space) | Select, or pause/resume during playback |
| Touch-surface swipes | — | Optional later: map to `{t:"look"}` deltas for free-look; not needed for browse → inspect → play |

## First-run flow

Same shape as the Fire TV app's `SetupActivity`/`StorePrefs`
([`../android-tv/`](../android-tv/README.md)): a text field for the store's
address on first launch, remembered afterward (tvOS: `UserDefaults` or
Keychain), skipped on every subsequent launch straight into the video view.

## Done when

A Siri Remote drives browse → inspect → play on real Apple TV hardware, and a
TestFlight build exists — per issue #81. That needs the prerequisites above;
this directory holds the plan so picking it up later is a matter of writing
Swift against a documented contract, not re-deriving one.
