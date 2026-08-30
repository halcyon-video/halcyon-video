// Touch controls for the 3D store — issue #126.
//
// The 3D store is a picture, not a place, on a finger: every control in
// InputManager (src/input.ts) is a key, and a phone/tablet visitor who
// reaches it — via ?nogate=1, a previously-answered "3D store" device-gate
// choice, or the Settings render-mode switch — has no way to move, look,
// select or go back. This module is that missing input layer.
//
// It does NOT synthesize keyboard events. main.ts already builds one
// `InputCallbacks` object and hands it to `new InputManager(...)` with a
// comment explaining exactly why: "Stored as a named object so the virtual
// remote can call them directly instead of relying on fragile synthetic
// KeyboardEvent dispatch." This module is that direct caller — every gesture
// below calls straight into the same callback functions a keypress would, so
// it rides the identical overlay-ladder -> StoreScene chain every other
// input source does (verify_nav_states.mjs's coverage of that chain is
// unaffected by anything here).
//
// Scope, deliberately: tapping a specific case already works before this
// file exists — three-scene.ts's onPointerUp/handlePointerClick raycasts on
// any quick low-movement PointerEvent, and PointerEvent fires for touch just
// as it does for mouse. What was actually missing is MOVEMENT (there is no
// touch equivalent of an arrow key), a way to CONFIRM once movement is
// impossible to express as a tap (inspect mode's hero case is a raycast
// no-op — see three-scene.ts line ~5837), and a way to BACK OUT (nothing to
// raycast against). This file adds exactly those three: swipe-to-browse
// (onLeft/onRight/onUp/onDown), a persistent OK button (onEnter), and a
// persistent BACK button (onBack) — sized to the "walk an aisle, select a
// case, inspect it, flip it, get back out" bar in full, not the wider
// tap-a-specific-case / pinch-to-inspect sketch the issue also floats.
// First-person walk-around mode is out of scope here: it is a keyboard-only
// surface today (WASD held-key state read straight off three-scene.ts, not
// through InputCallbacks at all) and none of the Done-when criteria need it;
// onLeft/onRight/onUp/onDown/onEnter all already no-op while it's active.
import type { InputCallbacks } from './input';

/**
 * A finger with no hover is the only signal this acts on. Unlike the
 * boot-time device gate (device-gate.ts's own isTouchPrimary), there is
 * deliberately no screen-size cutoff: a tablet that passed the gate
 * specifically BECAUSE it was wide enough ("often wide enough to want the
 * real thing" — issue #126) still has no keyboard once it's standing in the
 * store, and still needs this layer.
 */
export function isTouchInputActive(): boolean {
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse)').matches
      && window.matchMedia('(hover: none)').matches;
}

// Below this, a touchend belongs to the existing tap-to-select raycast path
// (three-scene.ts requires dist<10 there); above it, a swipe. The gap
// between the two thresholds is a small dead zone rather than a contested one.
const SWIPE_MIN_PX = 44;

/**
 * Touch-primary copy for main.ts's updateHUDForMode — same vocabulary
 * contract as its remote-truthful keyboard copy (say what OK/BACK actually
 * do, not a literal key name), swapping the arrow glyphs for SWIPE/TAP since
 * a touch visitor has the on-screen BACK/OK buttons above but no D-pad to
 * point at. `null` means "no touch-specific copy" — main.ts falls through to
 * its own keyboard text (used by 'walk-around', a keyboard-only surface: held
 * WASD state read straight off three-scene.ts, not through InputCallbacks,
 * so a touch visitor can never actually be in it).
 */
/**
 * Touch-primary copy for main.ts's updateMovieHUD — that function overwrites
 * #browse-hint with movie-specific detail (game / discovery / collection-gap
 * / coming-soon) right after touchHUDText's own mode-based copy lands
 * (onModeChange calls both), so this needs the same touch phrasing or the
 * richer per-movie branch silently clobbers it back to keyboard wording.
 * `null` here too means "let main.ts's own keyboard copy stand."
 */
export function touchMovieHUDText(
  isInspecting: boolean,
  game: boolean,
  discovery: boolean,
  collectionGap: boolean,
  comingSoon: boolean,
  isRequestedDiscovery: boolean,
): string | null {
  if (!isInspecting) return 'SWIPE TO BROWSE  •  TAP OK TO EXAMINE';
  if (game) return 'SWIPE TO FLIP  •  TAP OK TO RENT & PLAY';
  if (discovery) return isRequestedDiscovery ? 'ALREADY REQUESTED' : 'NOT IN STOCK — TAP OK TO ORDER OR PASS';
  if (collectionGap) return isRequestedDiscovery ? 'ON ORDER — COMING SOON' : 'NOT IN STOCK — TAP OK TO ORDER OR PASS';
  if (comingSoon) return 'COMING SOON — NOT YET AVAILABLE';
  return 'SWIPE TO FLIP  •  TAP OK TO PLAY';
}

export function touchHUDText(mode: string, canHoldToCheckout: boolean, carryMode: boolean): string | null {
  // Deliberately terse — BACK's job is the same everywhere (the persistent
  // button, not a per-mode fact worth a clause), and the hint has to fit a
  // narrow phone width without crowding the OK button parked in the same
  // bottom-center band it lives in on desktop (see the #browse-hint override
  // in CSS, below).
  switch (mode) {
    case 'library-select':
      return 'TAP TO BROWSE THIS SECTION';
    case 'overview':
      return 'SWIPE TO BROWSE  •  TAP OK TO GO';
    case 'genre-select':
      return '';
    case 'browse':
      return canHoldToCheckout
        ? 'SWIPE TO BROWSE  •  CHECK OUT AT THE COUNTER'
        : 'SWIPE TO BROWSE  •  TAP OK TO EXAMINE';
    case 'inspect':
      return carryMode
        ? 'TAP OK TO TAKE IT'
        : 'SWIPE TO FLIP  •  TAP OK TO PLAY';
    case 'checkout':
      return 'TAP OK TO CHECK OUT';
    case 'backroom':
      return 'SWIPE TO PICK A TAPE  •  TAP OK TO PLAY';
    case 'person-endcap':
      return 'TAP OK TO GO TO THE MOVIE';
    default:
      return null;
  }
}

const CSS = `
/* Fades with the rest of the HUD (main.ts's updateBrowseHUDVisibility drives
   .visible in lockstep with #browse-locator/#browse-hint) — a DOM overlay,
   playback, the screensaver or a live jump index all suppress it the same
   way. Buttons are pointer-events:none while faded so an invisible BACK/OK
   can't eat a touch meant for whatever is on top. */
#store-touch-controls { position: absolute; inset: 0; z-index: 6; pointer-events: none; opacity: 0; transition: opacity 0.3s ease; }
#store-touch-controls.visible { opacity: 1; }
.st-btn {
  position: absolute; pointer-events: none; touch-action: none;
  display: flex; align-items: center; justify-content: center;
  min-width: 64px; height: 46px; padding: 0 18px;
  background: var(--panel-bg, rgba(0, 10, 26, 0.88));
  border: 1px solid var(--panel-border, rgba(255, 204, 0, 0.35));
  border-radius: 10px; color: #fff;
  font: 700 15px/1 var(--font-title, sans-serif), sans-serif; letter-spacing: 0.06em;
  text-transform: uppercase; opacity: 0.85; transition: background 90ms, transform 90ms;
}
#store-touch-controls.visible .st-btn { pointer-events: auto; }
.st-btn.st-pressed { transform: scale(0.94); }
#store-touch-back {
  top: max(24px, env(safe-area-inset-top));
  left: max(24px, env(safe-area-inset-left));
}
#store-touch-back.st-pressed { background: rgba(255, 255, 255, 0.85); color: var(--bb-navy, #000a1c); }
#store-touch-ok {
  bottom: max(24px, env(safe-area-inset-bottom));
  right: max(24px, env(safe-area-inset-right));
  background: var(--bb-yellow, #ffcc00); color: var(--bb-navy, #000a1c);
  border-color: var(--bb-yellow, #ffcc00); opacity: 0.92;
}
#store-touch-ok.st-pressed { background: #fff; }
@keyframes st-pulse {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 204, 0, 0); }
  50% { transform: scale(1.05); box-shadow: 0 0 12px 2px rgba(255, 204, 0, 0.45); }
}
.st-intro .st-btn { animation: st-pulse 1.8s ease-in-out 3; }
/* #browse-hint (styles.css) sits bottom-center, nowrap, exactly where the OK
   button now lives — lift it clear and let it wrap. Phone viewports are
   narrower than the desktop line was ever sized for. */
#browse-hint { bottom: 84px; max-width: 62vw; white-space: normal; line-height: 1.4; }
`;

/** Press on touchstart, release on touchend/touchcancel; never a bare 'click' (no compat click follows a preventDefault()'d touchstart). */
function bind(el: HTMLElement, fire: () => void): void {
  const press = (e: TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.add('st-pressed');
    fire();
  };
  const release = (e: TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove('st-pressed');
  };
  el.addEventListener('touchstart', press, { passive: false });
  el.addEventListener('touchend', release, { passive: false });
  el.addEventListener('touchcancel', release, { passive: false });
}

/**
 * Install the touch layer once at boot, right after `new InputManager(...)`.
 * A no-op on anything but a touch-primary device — nothing is added to the
 * DOM and nothing is listened for. `callbacks` is the same `InputCallbacks`
 * object handed to InputManager; `poke` is InputManager's own activity pipe
 * (idle timer reset, screensaver wake, gamepad poll-rate) exposed for
 * exactly this — keyboard/mouse/gamepad all reach it privately through their
 * own listeners, and touch has no other way in.
 */
export function installStoreTouchControls(callbacks: InputCallbacks, poke: () => void): void {
  if (!isTouchInputActive()) return;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'store-touch-controls';

  const back = document.createElement('div');
  back.id = 'store-touch-back';
  back.className = 'st-btn';
  back.textContent = 'BACK';
  back.setAttribute('role', 'button');
  back.setAttribute('aria-label', 'Back');
  bind(back, () => { poke(); callbacks.onBack(); });

  const ok = document.createElement('div');
  ok.id = 'store-touch-ok';
  ok.className = 'st-btn';
  ok.textContent = 'OK';
  ok.setAttribute('role', 'button');
  ok.setAttribute('aria-label', 'Select');
  bind(ok, () => { poke(); void callbacks.onEnter(); });

  root.appendChild(back);
  root.appendChild(ok);
  (document.getElementById('hud-overlay') ?? document.body).appendChild(root);

  // ── Swipe to browse ───────────────────────────────────────────────────
  // One discrete step per completed swipe (not a continuous drag-to-scroll):
  // the browse cursor is a single highlighted case, exactly like a keyboard
  // arrow press, so one swipe = one press. Direction matches the D-pad
  // convention a keyboard/gamepad already uses: swipe the way you'd press.
  // In 'inspect' mode this same onLeft/onRight already flips the case
  // (store-nav.ts's moveLeftInternal/moveRightInternal) — "swipe to flip"
  // falls out of reusing the one mechanism rather than needing a second.
  const stage = document.getElementById('canvas-container');
  if (stage) {
    // touch-action: none hands the browser's own pan/pinch/double-tap-zoom
    // handling off entirely, so touchmove needs no preventDefault() to stay
    // out of the page's way.
    stage.style.touchAction = 'none';
    let startX = 0, startY = 0, tracking = false;
    stage.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) { tracking = false; return; }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
    }, { passive: true });
    stage.addEventListener('touchend', (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const adx = Math.abs(dx), ady = Math.abs(dy);
      // A short touch belongs to the existing raycast tap-to-select path
      // (three-scene.ts onPointerUp) — leave it alone.
      if (Math.max(adx, ady) < SWIPE_MIN_PX) return;
      poke();
      if (adx > ady) {
        if (dx < 0) callbacks.onLeft(); else callbacks.onRight();
      } else {
        if (dy < 0) callbacks.onUp(); else callbacks.onDown();
      }
    }, { passive: true });
    stage.addEventListener('touchcancel', () => { tracking = false; }, { passive: true });
  }
}
