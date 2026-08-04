// Flat-mode session lifecycle.
//
// The flat "2.5D Shelf" store registers a handful of window-level listeners
// (keyboard nav, hover focus, the menu's click-outside, detail-overlay keys).
// When mode switching was a full page reload those never needed cleanup — the
// reload wiped them. Now that 2D <-> 3D swaps happen in-process (see
// switchRenderMode in main.ts), leaving them bound would leak listeners and let
// them fight the 3D store's input on the way back.
//
// One AbortController spans a single flat mounting: every flat module passes
// `flatSignal()` to addEventListener, and teardownFlatStore() aborts it to drop
// them all at once. `beginFlatSession()` is idempotent so the store's internal
// re-renders (e.g. the "Back to Libraries" button re-runs bootFlatStore) reuse
// the same session instead of orphaning the listeners bound to a prior signal.

let controller: AbortController | null = null;

/** Start (or reuse) the flat session and return its abort signal. */
export function beginFlatSession(): AbortSignal {
  if (!controller) controller = new AbortController();
  return controller.signal;
}

/** The current session's signal, or undefined when flat mode isn't mounted. */
export function flatSignal(): AbortSignal | undefined {
  return controller?.signal;
}

/** True while a flat session is mounted. */
export function isFlatSessionActive(): boolean {
  return controller !== null;
}

/** End the session, removing every listener bound to its signal. */
export function endFlatSession(): void {
  controller?.abort();
  controller = null;
}
