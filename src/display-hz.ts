// Compositor refresh rate, sampled once at boot from requestAnimationFrame
// cadence — there is no web API that reports it directly. The dynamic
// resolution scaler (StoreScene.updateDynamicResolution) reads this to pick
// its fps target: a 120Hz display should chase 120, not the hardcoded 50/58
// thresholds the scaler shipped with when every display was assumed 60Hz.
//
// The harness never calls measureDisplayHz(), so headless perf runs keep the
// deterministic 60Hz thresholds and stay comparable across sessions.

const KNOWN_RATES = [60, 75, 90, 100, 120, 144, 165, 240];

let measured = 60;

/** Best-known compositor refresh rate; 60 until measureDisplayHz() resolves. */
export function displayHz(): number {
  return measured;
}

/**
 * ACTIVE-tier render cap (issue: the composer chain — N8AO/bloom/bokeh/FXAA
 * at up to a 3.7MP supersampled buffer — used to chase the raw display rate,
 * so a 144/165/240Hz monitor ran the full chain at full refresh for no visual
 * gain, and the dynamic resolution scaler's fps target scaled with it too,
 * so those displays actively lowered render resolution chasing 144+fps).
 *
 * Picks an EVEN DIVISOR of the display rate so the paced cadence lands on
 * every Nth vsync exactly (120→60, 144→72, 165→82.5, 240→60, 60→60) instead
 * of a fractional target that beats against the compositor. `override` is
 * the raw bb_fps_cap localStorage value, read once at construction: null or
 * 'auto' (unset, or the SERVICE MODE row's default cycle position — see
 * settings.ts) targets 60; '0' disables the cap outright (divisor 1, i.e.
 * today's uncapped behavior); any other finite number targets that instead
 * of 60, clamped to 24..hz so a stray value can't stall the renderer or ask
 * for faster than the display can present.
 */
export function computeFpsCap(hz: number, override: string | null): number {
  if (override === '0') return hz;
  let targetFps = 60;
  if (override !== null && override !== 'auto') {
    const n = Number(override);
    if (Number.isFinite(n) && n > 0) targetFps = Math.min(hz, Math.max(24, n));
  }
  const divisor = Math.max(1, Math.floor(hz / targetFps));
  return hz / divisor;
}

/**
 * Ceiling on the fps target the RESOLUTION SCALER chases — deliberately not the
 * same number as the presentation cap above.
 *
 * Uncapped presentation (`bb_fps_cap` '0', which the calibrated supersample
 * grant turns on by default) makes computeFpsCap return the panel's real
 * refresh, and updateDynamicResolution derives its step thresholds from that:
 * on a 144Hz display it will not step resolution back up until the scene holds
 * ~140fps. A mid-range GPU cannot reach that in this scene at ANY resolution —
 * motion-frame cost here is largely pixel-independent (AO recompute + draw-call
 * submission), the same measurement the 0.83x down-threshold rests on. So the
 * scaler walks resScale down 0.05/s to its floor, can never climb back, and the
 * store renders permanently soft — while the settle frame, an ABSOLUTE pixel
 * target divided by resScale, stays sharp. Every camera nudge then pops between
 * the two, which reads as the resolution flickering rather than as a scaler
 * doing its job.
 *
 * Chasing a rate the pixel budget cannot buy was never the scaler's job: it
 * exists so frames that must land in 16ms do. Bound its target here and leave
 * presentation uncapped, so capable hardware still chases the panel (owner
 * ruling 2026-08-05) while the scaler defends a reachable floor.
 */
export const SCALER_TARGET_FPS_CAP = 60;

/**
 * The fps target updateDynamicResolution measures against. Below the cap the
 * scaler still defends whatever the render cap asked for (an explicit
 * bb_fps_cap of 30 is defended at 30); above it, the extra refresh is a
 * presentation concern, not a resolution one.
 */
export function computeScalerTargetFps(targetFps: number): number {
  if (!Number.isFinite(targetFps) || targetFps <= 0) return SCALER_TARGET_FPS_CAP;
  return Math.min(targetFps, SCALER_TARGET_FPS_CAP);
}

/**
 * Fire-and-forget boot sampling: ~45 rAF ticks (≲0.5s), fastest decile wins.
 * Boot-time texture decode janks individual frames, which only ever makes
 * deltas LONGER — the fastest ticks are the compositor's true cadence. The
 * result snaps to the nearest standard rate, and anything that isn't
 * decisively quicker than a 60Hz tick stays 60.
 */
export function measureDisplayHz(): void {
  if (typeof requestAnimationFrame === 'undefined') return;
  const deltas: number[] = [];
  let prev = 0;
  let n = 0;
  const tick = (t: number) => {
    if (prev) deltas.push(t - prev);
    prev = t;
    if (++n < 45) {
      requestAnimationFrame(tick);
      return;
    }
    deltas.sort((a, b) => a - b);
    const fast = deltas[Math.floor(deltas.length * 0.1)];
    if (!(fast > 0)) return;
    const hz = 1000 / fast;
    if (hz <= 70) return; // not measurably faster than 60 — keep the default
    let best = KNOWN_RATES[0];
    for (const r of KNOWN_RATES) {
      if (Math.abs(r - hz) < Math.abs(best - hz)) best = r;
    }
    measured = best;
    console.log(`[displayHz] rAF fast-decile ${fast.toFixed(2)}ms → ${measured}Hz`);
  };
  requestAnimationFrame(tick);
}
