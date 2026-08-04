// Shared "when did a human last touch a control?" clock.
//
// InputManager stamps it on every REAL control input — keydown, pointerdown,
// throttled mousemove, and edge-detected gamepad presses / stick deflection
// (never the bare 60Hz poll) — via markUserActivity(). StoreScene.animate()
// reads it each rAF to gate the render-on-demand IDLE tier (no dropping to
// IDLE within 30s of input) and the clerk's 5-minute go-to-sleep fade; see
// IDLE_TIER_INPUT_MS / CLERK_SLEEP_INPUT_MS in three-scene.ts.
//
// A module-level mutable timestamp (performance.now() clock, same as
// animate()'s `time`) keeps the plumbing allocation-free: writers call a
// setter, the per-frame reader is a plain number compare.

let lastUserActivity = performance.now(); // boot counts as activity

export function markUserActivity(): void {
  lastUserActivity = performance.now();
}

export function getLastUserActivity(): number {
  return lastUserActivity;
}

// Dev/test hook (harness `?idleAgo=` / window.__setIdleClocks): pretend the
// last input landed `msAgo` in the past so the timed idle behaviors (30s IDLE
// gate, 5min clerk sleep) can be verified without waiting real minutes.
export function backdateUserActivity(msAgo: number): void {
  lastUserActivity = performance.now() - msAgo;
}
