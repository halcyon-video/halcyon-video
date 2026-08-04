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
