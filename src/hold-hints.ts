// Action prompt pills — the small gold-outlined reminders that an extra
// action is available right now. The copy advertises the REMOTE path (the TV
// remote's momentary buttons physically can't register a hold — review §4.5);
// each pill's fill bar still doubles as the live hold-progress meter for
// keyboards/gamepads, fed straight from InputManager's hold ticker (see
// HoldGesture in input.ts — HOLD ENTER / HOLD ▼ keep working, unadvertised).
//
// Two pills today, stacked so they can be up at the same time (you can be
// carrying a tape while inspecting a case you don't want):
//   • checkout — a tape is in hand → BACK, then the CHECKOUT counter cursor
//   • dismiss  — a not-in-stock case → OK opens the ORDER / NOT INTERESTED choice

interface HoldPill {
  el: HTMLDivElement;
  fill: HTMLDivElement;
  shown: boolean | null;
}

function makePill(id: string, label: string, bottomPx: number): HoldPill {
  const el = document.createElement('div');
  el.id = id;
  // 10-ft type floor (review §4.4): ≥20px in the design mono.
  el.style.cssText =
    `position:fixed;left:50%;bottom:${bottomPx}px;transform:translateX(-50%);z-index:58;` +
    'pointer-events:none;opacity:0;transition:opacity .25s;overflow:hidden;' +
    "font-family:var(--font-mono,'Courier New',monospace);font-size:20px;font-weight:400;letter-spacing:.1em;" +
    'color:#eef3ff;background:rgba(9,16,38,.85);border:2px solid var(--bb-secondary, #ffd54a);' +
    'border-radius:999px;padding:8px 22px;text-shadow:0 1px 2px #000;';
  const fill = document.createElement('div');
  fill.style.cssText =
    'position:absolute;inset:0;transform-origin:left;transform:scaleX(0);' +
    'background:var(--bb-secondary, #ffd54a);opacity:.32;';
  const text = document.createElement('span');
  text.textContent = label;
  text.style.cssText = 'position:relative;';
  el.appendChild(fill);
  el.appendChild(text);
  document.body.appendChild(el);
  return { el, fill, shown: null };
}

let checkoutPill: HoldPill | null = null;
let dismissPill: HoldPill | null = null;

function setShown(pill: HoldPill, show: boolean) {
  if (show === pill.shown) return; // cheap no-op: this runs on a 200ms poll
  pill.shown = show;
  pill.el.style.opacity = show ? '1' : '0';
  if (!show) pill.fill.style.transform = 'scaleX(0)';
}

/**
 * Show/hide the pills for the current moment. Called from the HUD poll — the
 * per-pill writes are skipped entirely when nothing changed.
 */
export function refreshHoldHints(state: { checkout: boolean; dismiss: boolean }) {
  if (!checkoutPill) {
    // Stacked with room for the 20px-type pills (each ~44px tall now).
    checkoutPill = makePill('hold-checkout-hint', '📼 TAPE IN HAND — CHECK OUT: BACK, THEN THE COUNTER', 96);
    dismissPill = makePill('hold-dismiss-hint', '🚫 NOT YOUR THING? OK, THEN “NOT INTERESTED”', 150);
  }
  setShown(checkoutPill, state.checkout);
  setShown(dismissPill!, state.dismiss);
}

export function setHoldCheckoutProgress(p: number) {
  if (!checkoutPill) return;
  checkoutPill.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, p))})`;
}

export function setHoldDismissProgress(p: number) {
  if (!dismissPill) return;
  dismissPill.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, p))})`;
}
