# Remote Play wire protocol

Reference for building a native thin client — one that cannot embed a
WebView, e.g. tvOS (see [`../tvos/README.md`](../tvos/README.md), issue
[#81](https://github.com/halcyon-video/halcyon-video/issues/81)). The web
viewer at `/remote.html` (`src/remote-viewer.ts`) is the reference
implementation; this documents its wire contract so a client can be built
against it without reading that file end to end. The host side is
`src/remote-play.ts`; the server plugin (signaling mailbox, TURN relay,
private-instance manager) is `tools/remote-play-server.mjs`.

Trust model: dev/preview server only, unauthenticated on the LAN, same as the
feedback-pin and mpv endpoints. Nothing here validates the caller's identity.

## 1. HTTP signaling mailbox

All under `/__remote/*` on the store server's own port (`1420` by default).
No auth, JSON in and out.

### `GET /__remote/status`

Poll before connecting and periodically after (ICE credentials expire).

```json
{
  "hostOnline": true,
  "instances": { "cap": 2, "running": 0, "seeded": true },
  "iceServers": [{ "urls": "stun:stun.l.google.com:19302" }]
}
```

`iceServers` may also carry a TURN entry (long-term REST credential, ~12h
TTL) when the store server runs coturn. Always use whatever this endpoint
returns — don't hardcode just STUN.

### `GET /__remote/poll?peer=<peerId>`

Long-poll, ~25s server-side timeout, always returns 200:

```json
{ "msgs": [{ "from": "host", "type": "offer", "payload": { "sdp": "..." } }] }
```

Pick `peerId` as a random string once per app launch. Poll continuously in a
loop — a poll that gets `{"msgs": []}` back should immediately re-poll.

### `POST /__remote/send`

```json
{ "to": "host", "from": "<peerId>", "type": "hello" }
```

Responds `200 {}`. `to` is `"host"` for the shared kiosk mirror, or
`"host-<instanceId>"` for a private per-visitor instance (below).

### `POST /__remote/instance`

Requests a private, per-visitor render of the store (the server spawns a
headless Chromium running the real 3D scene just for this viewer).

```json
{ "reuse": "<previous id, optional>", "fast": false }
```

→ `200 { "id": "i8xk2p", "fresh": true }`, or `503 { "error": "at capacity" }`,
or `503 { "error": "no-webgl2", "message": "..." }` (permanent — this server
has no GPU; fall back to the shared kiosk if `hostOnline`, otherwise show the
message and stop retrying).

A first client doesn't need to support private instances — connecting to the
shared kiosk (`hostPeer = "host"`) is enough to prove the loop end to end.

## 2. Handshake sequence

1. Generate `peerId`.
2. `POST /__remote/send {to: hostPeer, from: peerId, type: "hello"}`.
3. Start long-polling `GET /__remote/poll?peer=<peerId>` in a loop.
4. On a message of type `"offer"` (`payload.sdp`): create an
   `RTCPeerConnection` with the ICE servers from `/__remote/status`,
   `setRemoteDescription`, `createAnswer`, `setLocalDescription`, then
   `POST /__remote/send {to: hostPeer, from: peerId, type: "answer", payload: {sdp}}`.
5. On every local ICE candidate (including the null "done gathering" one):
   `POST /__remote/send {to: hostPeer, from: peerId, type: "ice", payload: candidate.toJSON() | null}`.
6. On a message of type `"ice"` from the host: `addIceCandidate(payload)`
   (ignore failures — a stale candidate after a re-offer is normal).
7. On type `"retry"`: the store is still booting; keep polling and re-send
   `hello`.
8. On type `"fatal"`: the store told you it can never produce a stream this
   session (`payload.reason`); stop retrying this `hostPeer`.
9. On type `"bye"`, or a `connectionState` of `failed`/`closed`: tear down and
   restart the loop from step 2 (the reference client does this in a loop
   with a ~1.2s backoff).

## 3. Media

The host offers two tracks. Render `video` full-screen; play `audio` through
a separate audio pipeline than any local UI sound, so it never
re-synchronizes lip-sync against the video (a shared audio+video sink
measured 470-1100ms of added latency on localhost — see the `ontrack`
comment in `remote-viewer.ts`). If the platform's WebRTC stack exposes
`jitterBufferTarget`/`playoutDelayHint` on the video receiver, set both to
`0` — this is an interactive stream, not conferencing, and the default
jitter buffer reads as input lag.

## 4. Data channel

The host opens one `RTCDataChannel`; the client just needs `ondatachannel`.
JSON messages both ways, one object per message, no extra framing.

**Host → client**, currently one message:

```json
{ "t": "state", "playback": true }
```

Whether the frames are currently a movie playing (vs. the store). The web
viewer uses it to swap its on-screen legend; a native client can do the same
or ignore it.

**Client → host** (input — the host's `InputManager` receives these as if
they were local DOM events):

- `{ "t": "key", "et": "down" | "up", "key": "ArrowUp", "code": "ArrowUp", "repeat": false }`
  — `key`/`code` must be real DOM `KeyboardEvent` values; the host does not
  know your platform's native key codes. Send `down` once per press, `up`
  once per release.
- `{ "t": "pad", "axes": [...], "buttons": [...], "droppable": true }` — raw
  Gamepad-API-shaped state for a paired physical-controller passthrough (see
  `src/remote-gamepad.ts`); not needed to drive with a TV remote's own D-pad.
- `{ "t": "look", "dx": 12.5, "dy": -3 }` — pointer-look deltas, chunked to
  ≤180px magnitude per message (the host's walk-look handler treats a single
  jump ≥200px as a pointer-lock acquisition glitch and drops it). Only
  relevant if a client adds touch-surface swipe-to-look later.
- `{ "t": "click", "x": 0.35, "y": 0.6 }` — normalized `[0,1]` coordinates in
  video space, for "point and click" on the rendered scene; or
  `{"x": 0.5, "y": 0.5}` to mean "activate whatever the current look
  direction is aimed at." Selection from a TV remote goes through the `key`
  message below instead, same as every existing client.

**Backpressure**: if the data channel's outbound buffer is backed up (the
reference client's threshold is `bufferedAmount > 2048` bytes), drop new
`key` messages with `repeat: true` and `pad` messages with `droppable: true`
rather than queuing them — the channel is ordered/reliable, so a stall
otherwise turns into a burst of stale input once it clears.

## 5. Keyboard vocabulary the host understands

The store's `InputManager` (`src/input.ts`) binds these; anything else is
ignored:

| Action | Keys (send any one as `key`, matching `code`) |
| --- | --- |
| Browse up/down/left/right | `ArrowUp` / `ArrowDown` / `ArrowLeft` / `ArrowRight` (also `w`/`s`/`a`/`d`) |
| Select / OK / pause-resume during playback | `Enter`, `' '` (Space), or `e` |
| Back | `Escape`, `Backspace`, or `q` |
| Search | `/` |
| Help / legend | `f` |
| Clerk call | `c` |
| Return item | `r` |
| Dismiss / not interested | `x` |
| Power menu | `p` |

A native client only needs to emit `key`/`code` pairs from this table — it
never needs to know what they *do* in the store.

## 6. Existing precedent: the Fire TV / Android TV client

[`android-tv/`](../android-tv/README.md) is a WebView wrapper, not a
from-scratch WebRTC client — it loads `/remote.html?tv=1&tvapp=1` and lets
`src/remote-viewer.ts` do everything above; its own code (`MainActivity.kt`)
exists only to forward the Android TV remote's D-pad and BACK keys into the
WebView as synthetic DOM `KeyboardEvent`s, because a WebView does not hand
those to the page on its own (see that README's "Notes for whoever touches
this next"). **tvOS forbids WebViews in App Store apps**, which is why issue
#81 calls for a real native implementation of everything in this document
rather than another wrapper. `src/remote-tv.ts`'s `KEY_MAP` (media-remote
keys → the table above) is the reference for how an existing TV-remote
mapping was built in JS; a Siri Remote mapping is the tvOS equivalent, done
in Swift instead, since there is no page to run it in.
