// Remote Play viewer — the thin client behind /remote.html.
//
// Counterpart of src/remote-play.ts (the host side running inside the store):
// exchanges a WebRTC handshake through the dev/preview server's signaling
// mailbox (/__remote/*, see remotePlaySignalPlugin in vite.config.ts),
// receives the store's canvas + audio mix as a peer-to-peer stream, and
// forwards keyboard/mouse input back over the data channel. Deliberately free
// of three.js and app imports: this page must load instantly on a phone or an
// old laptop — the whole point of server-side rendering the store.

import { installTouchControls, isTouchPrimary } from './remote-touch';

const video = document.getElementById('screen') as HTMLVideoElement;
const stage = document.getElementById('stage') as HTMLDivElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const hintEl = document.getElementById('hint') as HTMLDivElement;

const peerId = 'v' + Math.random().toString(36).slice(2, 10);
let pc: RTCPeerConnection | null = null;
let dc: RTCDataChannel | null = null;

// Which host to talk to: 'host' is the kiosk's shared mirror; 'host-<id>' is
// a private per-visitor instance the server spawned for us (option 3).
let hostPeer = 'host';
// Asking for a private store explicitly is sticky; falling back into one
// because no kiosk was mirroring is not (see main()).
const explicitPrivate = new URLSearchParams(location.search).get('private') === '1';
let privateMode = explicitPrivate;

// ?relay=1 forces relay-only ICE — the fastest way to prove the TURN server
// actually works from here without being on a different network to test it.
const forceRelay = new URLSearchParams(location.search).get('relay') === '1';

// Replaced by whatever /__remote/status advertises (a TURN relay when the
// store has one). The public STUN server is the floor, not the plan.
let iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function setStatus(text: string | null) {
  statusEl.style.display = text ? '' : 'none';
  if (text) statusEl.textContent = text;
}

// ─── Connection diagnostics ─────────────────────────────────────────────────
//
// A same-LAN WebRTC connection can reach the store's SERVER (this page loaded,
// the signaling mailbox answers) yet never establish the peer-to-peer MEDIA
// path. WiFi "client isolation", an unresolved `.local` (mDNS) candidate from
// a phone, the host binding ICE to a Docker/VPN interface instead of the LAN,
// or the lack of a TURN relay all look identical from here: the status pill
// hangs forever with no reason. This surfaces WHY, so a stuck viewer is
// diagnosable straight off the phone screen (and via window.__remoteViewer).
const diag = {
  local: new Set<string>(),  // ICE candidate flavours WE gathered
  remote: new Set<string>(), // ICE candidate flavours the HOST offered us
  ice: 'new',                // pc.iceConnectionState
  offerAt: 0,                // when the current negotiation started
  hint: '',                  // human-readable "likely cause"
};

// "candidate:... typ host 192.168.1.5 ..." → "host 192.168.1.5"; a hidden
// local address shows up as an "abcd.local" (mDNS) name instead of an IP.
function candFlavour(candidate: string): string {
  if (/\.local[\s:]/i.test(candidate) || /\.local"/.test(candidate)) return 'host mDNS(.local)';
  const typ = /typ (\w+)/.exec(candidate)?.[1] ?? '?';
  const ip = /(\d{1,3}(?:\.\d{1,3}){3})/.exec(candidate)?.[1];
  return ip ? `${typ} ${ip}` : typ;
}

function diagHint(): string {
  const remoteHasRoutable = [...diag.remote].some((c) => /host \d/.test(c) || c.startsWith('srflx') || c.startsWith('relay'));
  const remoteOnlyMdns = diag.remote.size > 0 && [...diag.remote].every((c) => c.includes('mDNS'));
  if (remoteOnlyMdns) {
    return 'The store only offered a .local (mDNS) address your phone can’t resolve. Fix: launch the store host with --disable-features=WebRtcHideLocalIpsWithMdns (already patched in launch.sh).';
  }
  if (diag.remote.size === 0) {
    return 'No connection info arrived from the store host — it may still be booting, not hosting, or blocked before ICE. Check that Remote Play is on (or wait for the private store to boot).';
  }
  if (remoteHasRoutable && (diag.ice === 'checking' || diag.ice === 'new' || diag.ice === 'failed')) {
    return hasTurn()
      ? 'Reached the store server and it advertises a relay, but no media path formed — the relay looks unreachable from here (its port is blocked, or it is bound to an address this device can’t route to).'
      : 'Reached the store server, but no video path formed and the store advertises NO relay — your network blocks device-to-device traffic (AP/client isolation or a firewall), or you are off-LAN/on a VPN, where the store’s LAN candidates mean nothing. Running coturn on the store machine (tools/remote-play-server.mjs spawns it automatically) bypasses this.';
  }
  return `ICE ${diag.ice}. gathered: [${[...diag.local].join(', ') || 'none'}]; from host: [${[...diag.remote].join(', ') || 'none'}].`;
}

// Rewrite the hanging pill into an actionable diagnostic once a negotiation
// has clearly stalled (offer arrived / hellos sent but never "connected").
function showDiag(): void {
  if (pc?.connectionState === 'connected') return;
  diag.hint = diagHint();
  statusEl.style.display = '';
  statusEl.style.whiteSpace = 'normal';
  statusEl.style.maxWidth = 'min(88vw, 640px)';
  statusEl.style.textAlign = 'center';
  statusEl.style.textTransform = 'none';
  statusEl.style.lineHeight = '1.5';
  statusEl.textContent = diag.hint;
}

// ─── Signaling (HTTP mailbox on the store's server) ─────────────────────────

async function signalSend(type: string, payload?: unknown): Promise<void> {
  try {
    await fetch('/__remote/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: hostPeer, from: peerId, type, payload }),
    });
  } catch { /* server unreachable — the outer loop keeps retrying */ }
}

async function signalPoll(): Promise<Array<{ type: string; payload?: any }>> {
  const r = await fetch(`/__remote/poll?peer=${peerId}`, { signal: AbortSignal.timeout(35_000) });
  if (!r.ok) throw new Error(`poll ${r.status}`);
  return (await r.json()).msgs ?? [];
}

interface RemoteStatus {
  hostOnline: boolean;
  instances?: { cap: number; running: number; seeded: boolean };
  iceServers?: RTCIceServer[];
}

async function getStatus(): Promise<RemoteStatus | null> {
  try {
    const r = await fetch('/__remote/status', { signal: AbortSignal.timeout(5_000) });
    if (!r.ok) return null;
    const st: RemoteStatus = await r.json();
    // Credentials expire, so every status poll refreshes them; a session
    // already up keeps the config it negotiated with.
    if (Array.isArray(st.iceServers) && st.iceServers.length) iceServers = st.iceServers;
    return st;
  } catch {
    return null;
  }
}

const hasTurn = () => iceServers.some((s) => String(s.urls).includes('turn:'));

/**
 * Ask the server for a private store of our own. The id persists in
 * sessionStorage so a refresh reconnects to the same still-warm instance
 * instead of paying another boot. Null = busy/unavailable (caller retries).
 */
async function requestInstance(): Promise<string | null> {
  const reuse = sessionStorage.getItem('bb_remote_instance') ?? undefined;
  const fast = new URLSearchParams(location.search).get('fast') === '1';
  try {
    // Generous timeout: a fresh spawn answers only once headless Chrome is up.
    const r = await fetch('/__remote/instance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reuse, fast }),
      signal: AbortSignal.timeout(90_000),
    });
    if (r.status === 503) {
      setStatus('All private stores are in use — retrying…');
      return null;
    }
    if (!r.ok) return null;
    const j = await r.json();
    sessionStorage.setItem('bb_remote_instance', String(j.id));
    return String(j.id);
  } catch {
    return null;
  }
}

// ─── WebRTC session ─────────────────────────────────────────────────────────

function teardown() {
  try { dc?.close(); } catch { /* already closed */ }
  try { pc?.close(); } catch { /* already closed */ }
  pc = null;
  dc = null;
}

let stallTimer = 0;

async function onOffer(sdp: string) {
  teardown(); // a fresh offer (host restarted / scene rebuilt) replaces any session
  diag.local.clear();
  diag.remote.clear();
  diag.ice = 'new';
  diag.offerAt = Date.now();
  pc = new RTCPeerConnection({ iceServers, iceTransportPolicy: forceRelay ? 'relay' : 'all' });
  pc.ontrack = (ev) => {
    const stream = ev.streams[0] ?? new MediaStream([ev.track]);
    if (video.srcObject !== stream) video.srcObject = stream;
  };
  pc.ondatachannel = (ev) => {
    dc = ev.channel;
  };
  pc.onicecandidate = (ev) => {
    if (ev.candidate?.candidate) diag.local.add(candFlavour(ev.candidate.candidate));
    void signalSend('ice', ev.candidate ? ev.candidate.toJSON() : null);
  };
  pc.oniceconnectionstatechange = () => {
    diag.ice = pc?.iceConnectionState ?? 'closed';
    // ICE 'failed' is terminal and, unlike a slow 'checking', worth surfacing
    // immediately rather than waiting out the stall timer.
    if (diag.ice === 'failed') showDiag();
  };
  pc.onconnectionstatechange = () => {
    if (pc?.connectionState === 'connected') {
      if (stallTimer) { clearTimeout(stallTimer); stallTimer = 0; }
      statusEl.style.whiteSpace = 'nowrap'; // restore pill styling for reuse
      setStatus(null);
      hintEl.style.opacity = '1';
      setTimeout(() => { hintEl.style.opacity = '0'; }, 9000);
    }
  };
  // If a whole offer/answer/ICE round doesn't reach "connected", the pill would
  // otherwise hang mutely. Turn it into a diagnostic instead.
  if (stallTimer) clearTimeout(stallTimer);
  stallTimer = window.setTimeout(showDiag, 14_000);
  await pc.setRemoteDescription({ type: 'offer', sdp });
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await signalSend('answer', { sdp: answer.sdp });
}

/** One connection attempt: hello → offer/answer/ice → stay until it drops. */
async function session(patienceMs: number): Promise<void> {
  teardown();
  await signalSend('hello');
  let helloAt = Date.now();
  for (;;) {
    if (pc) {
      const st = pc.connectionState;
      if (st === 'failed' || st === 'closed' || st === 'disconnected') return;
    } else if (Date.now() - helloAt > patienceMs) {
      return; // host never answered the hello
    }
    let msgs: Array<{ type: string; payload?: any }>;
    try {
      msgs = await signalPoll();
    } catch {
      await sleep(1500);
      continue;
    }
    for (const m of msgs) {
      if (m.type === 'offer') {
        await onOffer(String(m.payload?.sdp ?? ''));
      } else if (m.type === 'ice' && pc) {
        try {
          if (m.payload) {
            if (m.payload.candidate) diag.remote.add(candFlavour(String(m.payload.candidate)));
            await pc.addIceCandidate(m.payload);
          }
        } catch { /* stale candidate after a re-offer — harmless */ }
      } else if (m.type === 'retry') {
        setStatus('Store is still booting…');
        await sleep(3000);
        await signalSend('hello');
        helloAt = Date.now();
      } else if (m.type === 'bye') {
        return;
      }
    }
  }
}

// Corner button to hop between the shared kiosk mirror and a private store.
const modeBtn = document.getElementById('modebtn') as HTMLDivElement;
function updateModeBtn(st: RemoteStatus) {
  if (privateMode && st.hostOnline) {
    modeBtn.textContent = '⇄ SHARED VIEW';
    modeBtn.onclick = () => { location.href = '/remote.html'; };
    modeBtn.style.display = 'block';
  } else if (!privateMode && st.instances) {
    modeBtn.textContent = '★ MY OWN STORE';
    modeBtn.onclick = () => { location.href = '/remote.html?private=1'; };
    modeBtn.style.display = 'block';
  } else {
    modeBtn.style.display = 'none';
  }
}

async function main() {
  for (;;) {
    const st = await getStatus();
    if (!st) {
      setStatus('Store server unreachable — retrying…');
      await sleep(2500);
      continue;
    }
    // No kiosk mirroring right now but the server can mint private stores:
    // serve one instead of a dead end — and hand the mirror back the moment
    // the kiosk starts hosting, unless a private store was asked for by name.
    if (!privateMode && !st.hostOnline && st.instances) privateMode = true;
    else if (privateMode && !explicitPrivate && st.hostOnline) privateMode = false;
    updateModeBtn(st);

    if (privateMode && st.instances) {
      setStatus(sessionStorage.getItem('bb_remote_instance')
        ? 'Reconnecting to your store…'
        : 'Opening your own private store… (~30s)');
      const id = await requestInstance();
      if (!id) { await sleep(4000); continue; }
      hostPeer = `host-${id}`;
      // Patience: a fresh instance still has a whole library to load before
      // its scene exists and the offer can come.
      await session(60_000);
    } else if (st.hostOnline) {
      hostPeer = 'host';
      setStatus('Connecting…');
      await session(20_000);
    } else {
      setStatus('Store offline — start it with Remote Play on');
      await sleep(2500);
      continue;
    }
    teardown();
    setStatus('Connection lost — retrying…');
    await sleep(1200);
  }
}

void main();
window.addEventListener('pagehide', () => {
  try {
    navigator.sendBeacon('/__remote/send', JSON.stringify({ to: hostPeer, from: peerId, type: 'bye' }));
  } catch { /* best effort */ }
  teardown();
});

// ─── Input forwarding ───────────────────────────────────────────────────────

const dcOpen = () => !!dc && dc.readyState === 'open';
function sendInput(msg: unknown) {
  if (!dcOpen()) return;
  try { dc!.send(JSON.stringify(msg)); } catch { /* channel died mid-send */ }
}

// The stream arrives muted (autoplay policy); the first real gesture unmutes.
function unmute() {
  if (video.muted) {
    video.muted = false;
    void video.play().catch(() => { /* still blocked — stays muted */ });
  }
}

// Keys whose page default (scrolling, find-as-you-type, back-nav) must not
// fire under the store's controls.
const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Backspace', '/']);

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return; // leave browser chords alone
  if (e.key === 'l' || e.key === 'L') { toggleMouseLook(); return; } // viewer-local
  if (PREVENT.has(e.key)) e.preventDefault();
  unmute();
  sendInput({ t: 'key', et: 'down', key: e.key, code: e.code, repeat: e.repeat });
});
window.addEventListener('keyup', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'l' || e.key === 'L') return;
  sendInput({ t: 'key', et: 'up', key: e.key, code: e.code });
});

// Mouse look: pointer-lock the stage (toggle with L), accumulate deltas and
// flush once per frame — mirroring how the browser coalesces local mousemove.
// Chunked under 180px because the host's walk-look handler drops any single
// event moving ≥200px as a pointer-lock acquisition glitch.
let lookDx = 0;
let lookDy = 0;
let lookFlush = 0;
function flushLook() {
  lookFlush = 0;
  let dx = lookDx;
  let dy = lookDy;
  lookDx = 0;
  lookDy = 0;
  while (Math.abs(dx) + Math.abs(dy) >= 1) {
    const mag = Math.abs(dx) + Math.abs(dy);
    const s = Math.min(1, 180 / mag);
    sendInput({ t: 'look', dx: dx * s, dy: dy * s });
    dx -= dx * s;
    dy -= dy * s;
  }
}
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== stage) return;
  lookDx += e.movementX;
  lookDy += e.movementY;
  if (!lookFlush) lookFlush = requestAnimationFrame(flushLook);
});
function toggleMouseLook() {
  if (document.pointerLockElement === stage) document.exitPointerLock();
  else void (stage.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => { /* denied */ });
}

// Clicks: while mouse-looking the host activates whatever its walk-mode gaze
// has focused (coordinates are irrelevant); otherwise map the click through
// the object-fit letterbox onto normalized video coordinates.
// Set while a touch drag is looking around; the click a touchend synthesizes
// afterwards would otherwise pick whatever the finger happened to stop on.
let touchDragging = false;

stage.addEventListener('click', (e) => {
  if (touchDragging) return;
  unmute();
  if (document.pointerLockElement === stage) {
    sendInput({ t: 'click', x: 0.5, y: 0.5 });
    return;
  }
  const r = video.getBoundingClientRect();
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  const scale = Math.min(r.width / vw, r.height / vh);
  const cw = vw * scale;
  const ch = vh * scale;
  const x = (e.clientX - (r.left + (r.width - cw) / 2)) / cw;
  const y = (e.clientY - (r.top + (r.height - ch) / 2)) / ch;
  if (x < 0 || x > 1 || y < 0 || y > 1) return; // letterbox bar
  sendInput({ t: 'click', x, y });
});

// Touch devices get a thumb D-pad + drag-to-look instead of a keyboard they
// don't have and a pointer lock iOS Safari won't grant (src/remote-touch.ts).
// Everything it sends is an ordinary key/look message, so the host is unaware
// there's a phone on the other end.
if (isTouchPrimary()) {
  installTouchControls({
    stage,
    sendKey: (key, code, down, repeat) =>
      sendInput({ t: 'key', et: down ? 'down' : 'up', key, code, repeat }),
    sendLook: (dx, dy) => sendInput({ t: 'look', dx, dy }),
    unmute,
    setDragging: (v) => { touchDragging = v; },
  });
  hintEl.textContent = 'D-pad browses · OK selects · drag to look around · tap a case to pick it';
}

// Verification hook (tools/verify_remote_play.mjs).
(window as any).__remoteViewer = {
  peerId,
  get dcOpen() { return dcOpen(); },
  get connectionState() { return pc?.connectionState ?? 'none'; },
  // Connection diagnostics: candidate flavours each side offered, live ICE
  // state, and the best-guess cause when a connection stalls.
  get diag() {
    return {
      ice: diag.ice,
      connection: pc?.connectionState ?? 'none',
      localCandidates: [...diag.local],
      remoteCandidates: [...diag.remote],
      iceServers: iceServers.map((s) => String(s.urls)),
      relayOnly: forceRelay,
      hint: diagHint(),
    };
  },
};
