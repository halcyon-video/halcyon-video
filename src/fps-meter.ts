// ─── On-screen FPS / frame-time meter (opt-in) ──────────────────────────────
//
// A small corner overlay showing the live frame rate, the mean frame time, and
// a 1%-low / worst-frame figure over a rolling window. Off by default; switched
// on from the settings drawer (`bb_fps_meter`, Performance group), from a
// `?fps=1` URL param, or from the console via `window.__fpsMeter.on()`.
//
// WHY THIS DOESN'T RUN ITS OWN rAF LOOP
// -------------------------------------
// The store is render-on-demand (see the ACTIVE/VIDEO/IDLE tiers plus the
// static-persist skip in three-scene.ts animate()): it deliberately composites
// ZERO frames when nothing is moving, and the app is expected to idle for days.
// A meter that spun its own requestAnimationFrame would keep the main thread —
// and, once it touched the DOM, the compositor — awake forever, which is
// exactly the cost the tier system exists to avoid.
//
// Instead the meter is a passive observer of frames the app was going to draw
// anyway. `perf-trace.ts` is always on and already times the composite as the
// `renderMs` span, and that span is the LAST statement of animate() — it is
// reached only on frames that genuinely composited (the IDLE tier, the
// static-persist skip and the VIDEO throttle all return before it). So while
// the meter is enabled we wrap `perfTrace.end()` and treat "the renderMs span
// just closed" as "a frame was really drawn". Zero extra rAFs, zero extra
// renders, and the hook is removed again the moment the meter is switched off.
//
// The DOM text is rewritten at most ~2x/second by a setInterval that only
// exists while frames are actually flowing: the first frame after a park starts
// it, and the first tick that sees a parked renderer paints "IDLE" and clears
// it again. A parked store therefore costs one integer compare per composited
// frame and nothing else — no timers, no DOM writes, no repaints.
//
// Per-frame work is two typed-array stores and a couple of compares; every
// allocation (percentile sort scratch views, strings) happens on the ≤2Hz
// update path, never in the frame hook.

import { perfTrace, perfSlot } from './perf-trace';

/** localStorage / settings-registry key for the overlay. */
export const FPS_METER_KEY = 'bb_fps_meter';

// Rolling window of inter-composite gaps: 180 samples is ~3s at 60Hz / 1.5s at
// 120Hz — long enough for a stable 1% low, short enough to react to a hitch.
const RING = 180;
// A gap longer than this means the renderer was PARKED by render-on-demand, not
// that one frame took a quarter of a second. Such gaps are excluded from the
// stats (they'd poison the average with multi-minute "frames") and flip the
// readout to an honest "IDLE" instead of a stale or fake number.
const PARK_MS = 250;
// Upper bound on how often the DOM text is rewritten while frames are flowing.
const UPDATE_MS = 500;
// Samples older than this are ignored. Under render-on-demand a "last 180
// frames" window can span minutes of sparse browsing, which would leave a
// boot-time texture-upload spike sitting in "worst" long after it stopped
// being true.
const MAX_AGE_MS = 15000;

const dts = new Float32Array(RING);
const ts = new Float64Array(RING); // when each sample was taken (age cutoff)
const scratch = new Float32Array(RING); // reused percentile-sort buffer
let count = 0; // valid samples in `dts` (saturates at RING)
let head = 0; // next write index
let lastFrameTs = 0; // performance.now() of the last composited frame

let el: HTMLDivElement | null = null;
let lineTop: HTMLDivElement | null = null;
let lineBot: HTMLDivElement | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let enabled = false;
let renderSlot = -1;
let originalEnd: ((idx: number) => void) | null = null;
let lastTop = '';
let lastBot = '';
let lastDim = -1;

// z-index 13 places the meter on the DIAGNOSTIC rung of the app's ladder: above
// the canvas (1), #hud-overlay (5), the browse locator/hint (6), the CRT
// scanline + vignette passes (10/11) and the flat-mode header (10) — so it
// stays crisp over the picture — but BELOW every menu, dialog and full-screen
// overlay, which all start at 15 (#genre-menu-overlay, #walk-crosshair, the
// power/exit-confirm/login menus, #screensaver-overlay at 30, the episode and
// candy pickers at 60, #boot-overlay at 99, and flat mode's dropdown/detail/
// search at 100/1000/1100). Telemetry must never sit on top of the thing the
// user is actually reading — least of all the kiosk's screensaver.
const BOX_CSS =
  'position:fixed;top:8px;left:10px;z-index:13;pointer-events:none;user-select:none;' +
  'font-family:var(--font-mono, ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace);' +
  'font-size:11px;line-height:1.35;font-variant-numeric:tabular-nums;letter-spacing:0.04em;' +
  'white-space:pre;color:#9fe8d8;background:rgba(4,8,14,0.5);' +
  'border:1px solid rgba(159,232,216,0.18);border-radius:4px;padding:3px 7px;' +
  'text-shadow:0 1px 2px rgba(0,0,0,0.9);transition:opacity 0.2s ease;';

function ensureElement(): void {
  if (el) return;
  el = document.createElement('div');
  el.id = 'fps-meter';
  el.setAttribute('aria-hidden', 'true'); // decorative telemetry, not content
  el.style.cssText = BOX_CSS;
  lineTop = document.createElement('div');
  lineBot = document.createElement('div');
  lineBot.style.cssText = 'opacity:0.66;';
  el.appendChild(lineTop);
  el.appendChild(lineBot);
  document.body.appendChild(el);
}

/** Write the two lines, skipping any that didn't change (no needless repaint). */
function paint(top: string, bot: string, dim: boolean): void {
  if (!el || !lineTop || !lineBot) return;
  if (top !== lastTop) {
    lineTop.textContent = top;
    lastTop = top;
  }
  if (bot !== lastBot) {
    lineBot.textContent = bot;
    lastBot = bot;
  }
  const d = dim ? 1 : 0;
  if (d !== lastDim) {
    el.style.opacity = dim ? '0.5' : '1';
    lastDim = d;
  }
}

/** Recompute + repaint. Called on resume-from-park and by the 2Hz interval. */
function refresh(now: number): void {
  if (!el) return;
  if (now - lastFrameTs > PARK_MS) {
    // Honest idle state: the renderer is parked on a finished frame, so there
    // is no frame rate to report. Stop the timer — the next composited frame
    // restarts it (see onComposite).
    paint('IDLE', 'renderer parked', true);
    stopTimer();
    return;
  }
  // One pass: age-filter into the sort scratch while accumulating mean/max.
  const cutoff = now - MAX_AGE_MS;
  let n = 0;
  let sum = 0;
  let max = 0;
  for (let i = 0; i < count; i++) {
    if (ts[i] < cutoff) continue;
    const v = dts[i];
    scratch[n++] = v;
    sum += v;
    if (v > max) max = v;
  }
  if (n === 0) {
    paint('-- FPS', 'measuring', true);
    return;
  }
  const mean = sum / n;
  // 1% low = the 99th-percentile frame time expressed in fps. Sorting a ≤180
  // entry scratch twice a second is cheaper (and exact) versus any streaming
  // estimator, and it keeps the per-frame path down to two stores.
  const view = scratch.subarray(0, n);
  view.sort();
  const p99 = view[Math.min(n - 1, Math.floor(n * 0.99))] || mean;
  paint(
    `${Math.round(1000 / mean)} FPS   ${mean.toFixed(1)} ms`,
    `1% low ${Math.round(1000 / p99)}   worst ${max.toFixed(1)} ms`,
    false,
  );
}

function tick(): void {
  refresh(performance.now());
}

function stopTimer(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * One composited frame just finished. Hot path — no allocations, no DOM work
 * except on the park→live transition.
 */
function onComposite(): void {
  const now = performance.now();
  const dt = now - lastFrameTs;
  lastFrameTs = now;
  if (dt > 0 && dt < PARK_MS) {
    dts[head] = dt;
    ts[head] = now;
    head = head + 1 === RING ? 0 : head + 1;
    if (count < RING) count++;
  }
  if (timer === null) {
    // Resumed from a parked renderer. Repaint once right now so a single wake
    // frame (e.g. the screenshot harness's pre-capture nudge) already shows
    // real numbers, then let the 2Hz interval take over.
    timer = setInterval(tick, UPDATE_MS);
    refresh(now);
  }
}

function hook(): void {
  if (originalEnd) return;
  renderSlot = perfSlot('renderMs'); // idempotent by name: same index three-scene uses
  const bound = perfTrace.end.bind(perfTrace);
  originalEnd = bound;
  (perfTrace as unknown as Record<string, unknown>).end = (idx: number) => {
    bound(idx);
    if (idx === renderSlot) onComposite();
  };
}

function unhook(): void {
  if (!originalEnd) return;
  // Drop the own property so calls fall back through to the prototype method.
  delete (perfTrace as unknown as Record<string, unknown>).end;
  originalEnd = null;
}

/** Tear the overlay down completely: element removed, tracer hook released. */
export function destroyFpsMeter(): void {
  enabled = false;
  stopTimer();
  unhook();
  el?.remove();
  el = null;
  lineTop = null;
  lineBot = null;
  lastTop = '';
  lastBot = '';
  lastDim = -1;
  count = 0;
  head = 0;
  lastFrameTs = 0;
}

/** Show or hide the meter. Idempotent, safe to call before the scene exists. */
export function enableFpsMeter(on: boolean): void {
  if (!on) {
    if (enabled) destroyFpsMeter();
    return;
  }
  if (enabled || typeof document === 'undefined') return;
  enabled = true;
  ensureElement();
  hook();
  paint('IDLE', 'renderer parked', true);
}

export function isFpsMeterEnabled(): boolean {
  return enabled;
}

/** '1' (how the settings registry stores toggles) plus the friendly spellings. */
function truthy(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

/**
 * Boot-time state: `?fps=1` (or `?fps=0` to force it off for one session) wins,
 * otherwise the persisted setting. A hand-written / harness-written 'on' is
 * normalized to the registry's '1' so the drawer row agrees with the screen.
 */
function bootEnabled(): boolean {
  try {
    const p = new URLSearchParams(window.location.search).get('fps');
    if (p !== null) return truthy(p);
  } catch {
    /* no location (SSR/worker) — fall through to storage */
  }
  try {
    const raw = localStorage.getItem(FPS_METER_KEY);
    if (raw === null) return false;
    const on = truthy(raw);
    if (on && raw !== '1') localStorage.setItem(FPS_METER_KEY, '1');
    return on;
  } catch {
    return false;
  }
}

/** Called once at boot (registerCoreSettings): console hook + saved setting. */
export function initFpsMeter(): void {
  if (typeof window === 'undefined') return;
  (window as unknown as Record<string, unknown>).__fpsMeter = {
    on: () => enableFpsMeter(true),
    off: () => enableFpsMeter(false),
    isOn: isFpsMeterEnabled,
  };
  const apply = () => {
    if (bootEnabled()) enableFpsMeter(true);
  };
  apply();
  // The screenshot harness / public demo seeds its `?set=<key>=<value>`
  // localStorage writes AFTER calling registerCoreSettings(), so re-check once
  // the current task drains. One-shot, and skipped entirely when the first
  // check already raised the meter (the main.ts boot path).
  if (!enabled) setTimeout(apply, 0);
}
