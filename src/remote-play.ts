// Remote Play — server-side rendering as a store feature.
//
// The machine running the store IS the render server: this module captures
// the live WebGL canvas with captureStream() plus the SFX master bus
// (audio.ts), and streams both peer-to-peer over WebRTC to any /remote.html
// viewer on the network. Viewer keyboard/mouse input comes back on the data
// channel and is replayed as synthetic DOM events, so it flows through the
// exact same InputManager / walk-look / clasp-click paths as local input.
// The handshake goes through the dev/preview server's HTTP mailbox
// (remotePlaySignalPlugin in vite.config.ts); media never touches the server.
//
// Costs nothing while idle by construction: captureStream() only produces
// frames when the render-on-demand loop actually paints, so an idle store
// streams no video, and the encoder (hardware, via WebRTC) sleeps with it.
//
// Enabled with the bb_remote_play setting (Connection group) or ?remote=1.

import type { StoreScene } from './three-scene';
import { retailAudio } from './audio';

type GetScene = () => StoreScene | null | undefined;

interface Viewer {
  pc: RTCPeerConnection;
  videoSender: RTCRtpSender | null;
  audioSender: RTCRtpSender | null;
}

const SEND_URL = '/__remote/send';

// Private-instance mode (option 3): the server's instance manager
// (tools/remote-play-server.mjs) spawns headless copies of the store with
// ?remoteId=<id>. Such a copy registers on the mailbox as host-<id> instead
// of 'host', heartbeats so the server can reap it when abandoned, and is
// always-on (no toggle needed).
const instanceId = new URLSearchParams(location.search).get('remoteId');
const peerName = instanceId ? `host-${instanceId}` : 'host';
const POLL_URL = `/__remote/poll?peer=${peerName}`;

let getScene: GetScene = () => null;
let getPlayerVideo: () => HTMLVideoElement | null = () => null;
let running = false;
let runToken = 0; // bumping this retires any in-flight poll loop
const viewers = new Map<string, Viewer>();
let capturedCanvas: HTMLCanvasElement | null = null;
let canvasStream: MediaStream | null = null;
let audioTrack: MediaStreamTrack | null = null;

// Verification hook (tools/verify_remote_play.mjs, verify_remote_playback.mjs)
// + quick console debugging.
const stats = {
  running: false,
  viewers: 0,
  inputsApplied: 0,
  get remotelyDriven() { return isRemotelyDriven(); },
  get streamingPlayback() { return !!playbackVideoTrack(); },
};
(window as any).__remotePlay = stats;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ICE config the server hands out (a TURN relay when it runs one — viewers
// off the LAN have no other way in). Refreshed hourly because the relay's
// credentials are time-stamped; the public STUN server is the fallback floor.
let iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
let iceFetchedAt = 0;

function applyIceConfig(status: any): void {
  if (Array.isArray(status?.iceServers) && status.iceServers.length) iceServers = status.iceServers;
  iceFetchedAt = Date.now();
}

async function refreshIceServers(): Promise<void> {
  if (Date.now() - iceFetchedAt < 60 * 60_000) return;
  try {
    const r = await fetch('/__remote/status', { signal: AbortSignal.timeout(5_000) });
    if (r.ok) applyIceConfig(await r.json());
  } catch { /* keep the last config — a stale relay beats none */ }
}

/**
 * Remember how to reach the live scene and start streaming if the option is
 * on. Call once per entry point (main.ts, harness.ts); the getter is re-read
 * on every use so settings-rebuild scene swaps are followed automatically.
 * `getVideo` hands over the in-app player's <video> when the entry point has
 * one — a film has to reach viewers as ITS frames, not the store's (see
 * startPlaybackStream).
 */
export function setupRemotePlay(get: GetScene, getVideo?: () => HTMLVideoElement | null): void {
  getScene = get;
  if (getVideo) getPlayerVideo = getVideo;
  const params = new URLSearchParams(location.search);
  const enabled = !!instanceId || params.get('remote') === '1' || localStorage.getItem('bb_remote_play') === '1';
  if (enabled) setRemotePlayEnabled(true);
}

/** True when this page IS a spawned private-store instance (?remoteId=...). */
export function isRemoteInstance(): boolean {
  return !!instanceId;
}

// How long after a remote keypress the store still counts as remotely driven.
const REMOTE_DRIVE_MS = 60_000;
let lastRemoteInputAt = 0;

/**
 * True when the person driving is watching over Remote Play rather than
 * standing in front of this machine: a spawned private instance always is, a
 * shared kiosk is whenever a viewer drove it in the last minute.
 *
 * Playback has to stay inside the browser for them — handing a film to mpv
 * opens a window on the STORE's screen, which a remote viewer can neither see
 * nor close (and on a private instance would put a stranger's movie on the
 * owner's TV).
 */
export function isRemotelyDriven(): boolean {
  if (instanceId) return true;
  return viewers.size > 0 && Date.now() - lastRemoteInputAt < REMOTE_DRIVE_MS;
}

/** Live-apply entry for the settings toggle. Safe to call redundantly. */
export function setRemotePlayEnabled(on: boolean): void {
  // A spawned private instance exists ONLY to host — its viewer is already
  // waiting on the stream — so nothing may switch that off. This is a guard,
  // not a nicety: the instance boots with the owner's donated settings, and
  // applyLiveSettings() replays every explicitly-set live one onto the newly
  // built scene. bb_remote_play was among them, so the instance would start
  // hosting, finish building its store, and then immediately tear the stream
  // down — leaving every private viewer on "Store is still booting…" forever.
  if (instanceId && !on) {
    console.log('[RemotePlay] ignoring disable on a private instance — hosting is its whole job');
    return;
  }
  if (on === running) return;
  running = on;
  stats.running = on;
  runToken++;
  if (on) {
    void startHost(runToken);
  } else {
    for (const id of [...viewers.keys()]) dropViewer(id, true);
    canvasStream?.getTracks().forEach((t) => t.stop());
    canvasStream = null;
    capturedCanvas = null;
  }
}

async function startHost(token: number): Promise<void> {
  // The signaling mailbox only exists on the vite dev/preview server. Probe
  // once so a Tauri bundle or the GitHub Pages demo (no /__remote endpoints)
  // never spins a doomed retry loop.
  try {
    const r = await fetch('/__remote/status', { signal: AbortSignal.timeout(5_000) });
    if (!r.ok) throw new Error(String(r.status));
    applyIceConfig(await r.json()); // same probe carries the relay config
  } catch {
    console.log('[RemotePlay] no signaling endpoint on this server — staying off');
    running = false;
    stats.running = false;
    return;
  }
  console.log(`[RemotePlay] hosting as ${peerName}: viewers can open /remote.html on this server`);
  // The kiosk host donates its credentials + look settings so private
  // instances can boot the real store; a spawned instance donates nothing.
  if (!instanceId) pushSeed();
  // Instances heartbeat so the server's reaper can tell "abandoned" (kill it)
  // from "viewer mid-movie" (leave it). Shared hosts don't need one — their
  // presence is the hanging long-poll itself.
  const beat = instanceId
    ? window.setInterval(() => {
        void fetch('/__remote/instance/beat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: instanceId, viewers: stats.viewers }),
        }).catch(() => { /* server gone — reaper gets us anyway */ });
      }, 20_000)
    : 0;
  try {
    while (running && token === runToken) {
      let msgs: Array<{ from: string; type: string; payload?: any }>;
      try {
        const r = await fetch(POLL_URL, { signal: AbortSignal.timeout(35_000) });
        if (!r.ok) throw new Error(String(r.status));
        msgs = (await r.json()).msgs ?? [];
      } catch {
        await sleep(2000);
        continue;
      }
      if (!running || token !== runToken) return;
      ensureStream(); // follow scene-rebuild canvas swaps even with no traffic
      watchPlayer();  // the player element appears once its entry point builds it
      if (!instanceId) pushSeed(); // no-op unless the token was refreshed
      for (const m of msgs) {
        try {
          await handleSignal(m);
        } catch (err) {
          console.warn('[RemotePlay] signal error', err);
        }
      }
    }
  } finally {
    if (beat) window.clearInterval(beat);
  }
}

/**
 * Donate this store's connection + look config to the instance manager so
 * "private store" visitors get the user's real library. Only a host that is
 * actually logged into a media server has anything worth donating — the
 * harness and demo mode stay silent, leaving instances on the demo-library
 * fallback.
 */
let seededToken = '';

function pushSeed(): void {
  const token = localStorage.getItem('jellyfin_token');
  if (!localStorage.getItem('jellyfin_url') || !token) return;
  // Re-donate whenever the token changes. The app silently re-authenticates
  // when the server rejects a stale token (main.ts), and a seed pushed once at
  // boot then holds a dead credential forever — private instances would boot
  // to a login screen, and they can't self-heal because the password is
  // deliberately never seeded.
  if (token === seededToken) return;
  seededToken = token;
  const seedConfig: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    // jellyfin_* carries the session for BOTH backends (shared keys, see
    // boot-flow.ts); provider_kind and plex_* are what tell a spawned
    // instance which one to speak — without them it defaults to Jellyfin
    // and a Plex-seeded instance would fail every request.
    if (/^(bb_|jellyfin_|jellyseerr_|romm_|plex_)/.test(k) || k === 'provider_kind') {
      seedConfig[k] = localStorage.getItem(k)!;
    }
  }
  void fetch('/__remote/seed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(seedConfig), // server filters hosting/rental keys out
  }).catch(() => { /* older server without the endpoint */ });
}

async function handleSignal(m: { from: string; type: string; payload?: any }): Promise<void> {
  if (!m.from) return;
  if (m.type === 'hello') {
    dropViewer(m.from, false); // a re-hello replaces any stale session
    await createViewer(m.from);
  } else if (m.type === 'answer') {
    const v = viewers.get(m.from);
    if (v) await v.pc.setRemoteDescription({ type: 'answer', sdp: String(m.payload?.sdp ?? '') });
  } else if (m.type === 'ice') {
    const v = viewers.get(m.from);
    if (v && m.payload) {
      try { await v.pc.addIceCandidate(m.payload); } catch { /* stale after re-offer */ }
    }
  } else if (m.type === 'bye') {
    dropViewer(m.from, false);
  }
}

function signalSend(to: string, type: string, payload?: unknown): void {
  void fetch(SEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, from: peerName, type, payload }),
  }).catch(() => { /* mailbox hiccup — viewer side retries */ });
}

/**
 * Capture the current scene's canvas (no frame-rate argument: frames are
 * produced exactly when the on-demand loop paints). A settings rebuild swaps
 * the renderer canvas out from under live sessions — detect that here and
 * steer every viewer's sender onto the new track via replaceTrack, which
 * needs no renegotiation.
 */
function ensureStream(): MediaStream | null {
  const scene = getScene();
  if (!scene) return null;
  const canvas = scene.renderer.domElement;
  if (canvasStream && capturedCanvas === canvas) return canvasStream;
  try {
    const stream = canvas.captureStream();
    const track = stream.getVideoTracks()[0];
    if (track) track.contentHint = 'detail'; // box art text over motion smoothness
    canvasStream?.getTracks().forEach((t) => t.stop());
    canvasStream = stream;
    capturedCanvas = canvas;
    // Never steer senders back to the canvas mid-film: stopPlaybackStream owns
    // that hand-back, and a settings rebuild during playback must not undo it.
    if (track && !playbackStream) {
      for (const v of viewers.values()) void v.videoSender?.replaceTrack(track);
    }
    scene.requestRender();
    return stream;
  } catch {
    return null;
  }
}

// ─── Keeping frames flowing ─────────────────────────────────────────────────
//
// captureStream() produces a frame only when the store actually paints, and
// the render-on-demand loop paints only when something changes — so a viewer
// joining an untouched kiosk decodes NOTHING and stares at a black screen
// until they happen to press a key. Two nudges fix that without giving up the
// idle-costs-nothing design: a burst at connect (an encoder needs more than
// one frame to emit a decodable keyframe, and the bitrate estimator needs
// something to measure), then a slow tick that runs only while someone is
// actually watching.
const KEEPALIVE_MS = 1000;
const BURST_FRAMES = 12;
let keepAlive = 0;

function burstRender(): void {
  let left = BURST_FRAMES;
  const step = () => {
    const scene = getScene();
    if (!scene || left-- <= 0) return;
    scene.requestRender();
    requestAnimationFrame(step);
  };
  step();
}

function ensureKeepAlive(): void {
  if (keepAlive) return;
  keepAlive = window.setInterval(() => {
    if (!viewers.size) { // last viewer left: back to a store that costs nothing
      window.clearInterval(keepAlive);
      keepAlive = 0;
      return;
    }
    getScene()?.requestRender();
  }, KEEPALIVE_MS);
}

// ─── Playing a film to viewers ──────────────────────────────────────────────
//
// Starting a movie pauses the store's render loop, and the in-app player is a
// DOM <video> overlay — so the canvas capture freezes on the last frame of the
// store and a remote viewer watches nothing at all. While the player is
// running, point every sender at ITS stream instead (video AND the film's
// audio, replacing the SFX bus), then hand the store back on teardown.
// replaceTrack() needs no renegotiation, so the swap is invisible to viewers.
let playbackStream: MediaStream | null = null;
let watchedVideoEl: HTMLVideoElement | null = null;

type CapturableVideo = HTMLVideoElement & { captureStream?: () => MediaStream };

function playbackVideoTrack(): MediaStreamTrack | null {
  const t = playbackStream?.getVideoTracks()[0];
  return t && t.readyState === 'live' ? t : null;
}

/** Attach the swap to the player element the first time an entry point has one. */
function watchPlayer(): void {
  const el = getPlayerVideo();
  if (!el || el === watchedVideoEl) return;
  watchedVideoEl = el;
  // 'playing' rather than 'play': wait until frames actually exist, so the
  // first thing a viewer decodes isn't an empty capture.
  el.addEventListener('playing', () => startPlaybackStream(el));
  // close() clears the source, which is the one teardown every exit path runs
  // through — natural end, Back, error retry, or the next episode.
  el.addEventListener('emptied', stopPlaybackStream);
}

function startPlaybackStream(el: HTMLVideoElement): void {
  if (!running || playbackVideoTrack()) return;
  let stream: MediaStream | undefined;
  try { stream = (el as CapturableVideo).captureStream?.(); } catch { /* unsupported */ }
  if (!stream?.getVideoTracks().length) return;
  playbackStream = stream;
  const video = stream.getVideoTracks()[0];
  const audio = stream.getAudioTracks()[0] ?? null;
  for (const v of viewers.values()) {
    void v.videoSender?.replaceTrack(video);
    if (audio) void v.audioSender?.replaceTrack(audio);
  }
}

function stopPlaybackStream(): void {
  if (!playbackStream) return;
  playbackStream = null;
  const canvasTrack = ensureStream()?.getVideoTracks()[0] ?? null;
  for (const v of viewers.values()) {
    if (canvasTrack) void v.videoSender?.replaceTrack(canvasTrack);
    if (audioTrack) void v.audioSender?.replaceTrack(audioTrack);
  }
  burstRender(); // the store is back on screen — give it frames immediately
}

async function createViewer(id: string): Promise<void> {
  const scene = getScene();
  const stream = ensureStream();
  if (!scene || !stream) {
    signalSend(id, 'retry'); // still booting — viewer waits and re-hellos
    return;
  }
  await refreshIceServers(); // credentials are time-stamped; re-read hourly
  const pc = new RTCPeerConnection({ iceServers });
  const v: Viewer = { pc, videoSender: null, audioSender: null };
  viewers.set(id, v);
  stats.viewers = viewers.size;

  // Joining mid-film gets the film, not a frozen store.
  const videoTrack = playbackVideoTrack() ?? stream.getVideoTracks()[0];
  if (videoTrack) v.videoSender = pc.addTrack(videoTrack, stream);
  if (!audioTrack) audioTrack = retailAudio.captureRemoteTrack();
  // Same stream handle for both tracks so the viewer's ontrack sees one
  // MediaStream carrying video + audio.
  const sendAudio = (playbackStream?.getAudioTracks()[0] ?? null) || audioTrack;
  if (sendAudio) v.audioSender = pc.addTrack(sendAudio, stream);

  const dc = pc.createDataChannel('input', { ordered: true });
  dc.onmessage = (ev) => {
    try {
      applyInput(JSON.parse(String(ev.data)));
    } catch { /* malformed input frame — drop it */ }
  };
  dc.onopen = () => burstRender(); // hand the newcomer real frames, not one

  pc.onicecandidate = (ev) => signalSend(id, 'ice', ev.candidate ? ev.candidate.toJSON() : null);
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    if (st === 'failed' || st === 'closed' || st === 'disconnected') dropViewer(id, false);
    else if (st === 'connected') { burstRender(); ensureKeepAlive(); }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  signalSend(id, 'offer', { sdp: offer.sdp });
}

function dropViewer(id: string, sayBye: boolean): void {
  const v = viewers.get(id);
  if (!v) return;
  viewers.delete(id);
  stats.viewers = viewers.size;
  try { v.pc.close(); } catch { /* already closed */ }
  if (sayBye) signalSend(id, 'bye');
}

// ─── Input replay ───────────────────────────────────────────────────────────
//
// Everything below dispatches REAL DOM events so remote input takes the same
// code paths as local input (InputManager on window, walk mouse-look on
// window, clasp picking on the renderer canvas) — no parallel input API to
// keep in sync.

function applyInput(msg: any): void {
  const scene = getScene();
  if (!scene || !msg) return;
  stats.inputsApplied++;
  lastRemoteInputAt = Date.now(); // whoever acts next is acting for a viewer
  if (msg.t === 'key') {
    const type = msg.et === 'up' ? 'keyup' : 'keydown';
    window.dispatchEvent(new KeyboardEvent(type, {
      key: String(msg.key ?? ''),
      code: String(msg.code ?? ''),
      repeat: !!msg.repeat,
      bubbles: true,
      cancelable: true,
    }));
  } else if (msg.t === 'look') {
    // movementX/Y are readonly getters on the prototype; own-property
    // definitions shadow them portably (MouseEventInit support varies).
    const ev = new MouseEvent('mousemove', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'movementX', { value: Number(msg.dx) || 0 });
    Object.defineProperty(ev, 'movementY', { value: Number(msg.dy) || 0 });
    window.dispatchEvent(ev);
  } else if (msg.t === 'click') {
    const el = scene.renderer.domElement;
    const rect = el.getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, Number(msg.x) || 0));
    const ny = Math.min(1, Math.max(0, Number(msg.y) || 0));
    const init: PointerEventInit = {
      clientX: rect.left + nx * rect.width,
      clientY: rect.top + ny * rect.height,
      button: 0,
      buttons: 1,
      pointerId: 0x4243,
      pointerType: 'mouse',
      isPrimary: true,
      bubbles: true,
      cancelable: true,
    };
    el.dispatchEvent(new PointerEvent('pointerdown', init));
    el.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
  }
}
