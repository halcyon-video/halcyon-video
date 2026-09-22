// Touch controls share the host overlay callbacks. Hosted mobile browsing
// uses direct camera manipulation; other touch installs retain arrow swipes.
import { installMobileWalk } from './mobile-walk';
import type { InputCallbacks } from './input.ts';
import type { StoreScene } from './three-scene.ts';
import { beginMobileDrag, mobileStoreActive, markMobileDragged } from './mobile-store.ts';

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

import { SWIPE_MIN_PX, resolveSwipeDirection } from './swipe-direction.ts';
export { SWIPE_MIN_PX, resolveSwipeDirection };

/**
 * Touch-primary copy for main.ts's updateHUDForMode — same vocabulary
 * contract as its remote-truthful keyboard copy (say what OK/BACK actually
 * do, not a literal key name), swapping the arrow glyphs for SWIPE/TAP since
 * a touch visitor has the on-screen BACK/OK buttons above but no D-pad to
 * point at. `null` means "no touch-specific copy" — main.ts falls through to
 * its own keyboard text. Walking uses the separate phone thumbstick and
 * drag-to-look layer, sharing the scene's collision and inspection logic.
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
  streaming?: boolean,
  streamingChoice?: boolean,
  requestable = false,
): string | null {
  if (!isInspecting) return mobileStoreActive() ? 'DRAG TO BROWSE  •  TAP A MOVIE' : 'SWIPE TO BROWSE  •  TAP OK TO EXAMINE';
  if (streamingChoice) return 'TAP A SERVICE  •  TAP OK TO CONFIRM';
  if (streaming) return 'SWIPE TO FLIP  •  TAP OK TO CHECK OUT';
  if (game) return 'SWIPE TO FLIP  •  TAP OK TO RENT & PLAY';
  if ((discovery || collectionGap) && !requestable) return 'SWIPE TO FLIP  •  NOT IN STOCK';
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
      return mobileStoreActive() ? 'SWIPE TO LOOK  •  TAP A SHELF' : 'SWIPE TO BROWSE  •  TAP OK TO GO';
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
    case 'walk-around':
      return 'DRAG TO LOOK  •  TAP A MOVIE';
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
/* A phone's first usable frame is the budget boundary; do not spend another
   six tenths of a second fading the boot console over it. */
#boot-overlay { transition: none !important; }
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
  background: transparent; border: 0; border-radius: 0; color: #fff;
  font: 900 18px/1.15 'Archivo Black', sans-serif; letter-spacing: 0.025em;
  text-transform: uppercase; opacity: 1; transition: transform 90ms;
  -webkit-tap-highlight-color: transparent;
}
.st-label { color: #fff; font-style: normal; text-shadow: 0 2px 3px #000; }
.st-btn { font: 700 15px/1 var(--font-title, sans-serif), sans-serif; letter-spacing: .06em; }
.st-btn:focus-visible { outline: 2px solid #fff; outline-offset: -3px; }
.st-btn.st-pressed .st-label { color: #ddd; }
#store-touch-controls.visible .st-btn { pointer-events: auto; }
#store-touch-directions { display: none; position: absolute; left: 16px; bottom: max(24px, env(safe-area-inset-bottom)); grid-template-columns: repeat(3, 56px); gap: 6px; }
#store-touch-controls.terminal #store-touch-directions { display: grid; }
#store-touch-directions .st-btn { position: static; min-width: 0; padding: 0 6px; height: 44px; }
#store-touch-up { grid-column: 2; }
#store-touch-left { grid-column: 1; grid-row: 2; }
#store-touch-down { grid-column: 2; grid-row: 2; }
#store-touch-right { grid-column: 3; grid-row: 2; }
.st-btn.st-pressed { transform: scale(0.94); }
#store-touch-back {
  top: max(24px, env(safe-area-inset-top));
  left: max(24px, env(safe-area-inset-left));
}
#store-touch-ok {
  bottom: max(24px, env(safe-area-inset-bottom));
  right: max(24px, env(safe-area-inset-right));
}
#store-touch-walk { top: max(24px, env(safe-area-inset-top)); right: max(24px, env(safe-area-inset-right)); display: none; }
#store-touch-controls:not(.terminal)[data-mode="overview"] #store-touch-walk,
#store-touch-controls:not(.terminal)[data-mode="browse"] #store-touch-walk { display: flex; }
#store-touch-controls:not(.terminal)[data-mode="overview"] #store-touch-ok,
#store-touch-controls:not(.terminal)[data-mode="walk-around"] #store-touch-ok,
#store-touch-controls:not(.terminal)[data-mode="walk-around"] #store-touch-back { display: none; }
#store-touch-stick { display: none; position: absolute; left: max(24px, env(safe-area-inset-left)); bottom: max(100px, calc(env(safe-area-inset-bottom) + 76px)); width: 124px; height: 124px; border: 3px solid #f2e8c9; border-radius: 50%; background: radial-gradient(circle, rgba(3,9,20,.92) 42%, rgba(242,232,201,.34) 43%, rgba(3,9,20,.88) 69%); box-shadow: 0 4px 0 #02050a, 0 0 0 3px rgba(5,12,28,.82), 0 0 12px rgba(242,232,201,.8), inset 0 2px 0 #fff; touch-action: none; }
#store-touch-controls.visible:not(.terminal)[data-mode="walk-around"] #store-touch-stick { display: block; pointer-events: auto; }
.st-stick-knob { position: absolute; inset: 38px; border-radius: 50%; background: radial-gradient(circle at 40% 25%, #fff, #b9c9dc 58%, #526680 78%, #19263b); box-shadow: 0 3px 0 #02050a, 0 0 0 2px #f2e8c9; pointer-events: none; }
.st-stick-label { position: absolute; top: -31px; left: 0; right: 0; text-align: center; color: #e9edf5; font: 900 18px/22px Arial, sans-serif; letter-spacing: 1.5px; pointer-events: none; filter: drop-shadow(0 2px 0 #10151d) drop-shadow(0 1px 2px #000); }
@supports (background-clip: text) { .st-stick-label { background: linear-gradient(#fff 0%, #c5cedc 40%, #fff 48%, #69788e 51%, #e7edf7 88%); background-clip: text; -webkit-background-clip: text; color: transparent; } }
body .clasp-prompt { border-radius: 0; font-size: 15px; }
body .clasp-prompt .clasp-key { display: none; }
body .clerk-prompt { bottom: max(174px, calc(env(safe-area-inset-bottom) + 160px)); max-width: calc(100vw - 48px); }
body .clerk-prompt .clerk-key { display: none; }
body:has(.clerk-dialog.visible) #store-touch-controls,
body:has(.clerk-dialog.visible) #browse-hint { visibility: hidden; }
#walk-hud.visible, #walk-crosshair.visible { display: none; }
body:has(#store-touch-controls[data-mode="inspect"]) #browse-locator { display: none; }
#browse-locator { top: max(86px, calc(env(safe-area-inset-top) + 72px)); max-width: calc(100vw - 48px); }
.browse-locator-name { white-space: normal; text-align: center; font-size: 18px; letter-spacing: 1px; }
body:has(#store-touch-controls[data-mode="walk-around"]) #browse-hint { bottom: 40px; left: auto; right: 16px; transform: none; max-width: calc(100vw - 180px); font: 700 15px/1.4 sans-serif; letter-spacing: .04em; text-shadow: 0 2px 3px #000; }

/* #browse-hint (styles.css) sits bottom-center, nowrap, exactly where the OK
   button now lives — lift it clear and let it wrap. Phone viewports are
   narrower than the desktop line was ever sized for. */
#browse-hint { bottom: 84px; max-width: 62vw; white-space: normal; line-height: 1.4; }
@media (orientation: landscape) and (max-height: 500px) {
  #store-touch-stick { bottom: max(48px, calc(env(safe-area-inset-bottom) + 24px)); }
  #browse-hint { bottom: 14px; font-size: 15px; line-height: 1.1; max-width: calc(100vw - 190px); }

}
`;

/** Press on touchstart, release on touchend; touchcancel cancels without firing. */
function bind(el: HTMLElement, fire: () => void): void {
  let pressed = false;
  const press = (e: TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    pressed = true;
    el.classList.add('st-pressed');
  };
  const cancel = (e: TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    pressed = false;
    el.classList.remove('st-pressed');
  };
  const release = (e: TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!pressed) return;
    pressed = false;
    el.classList.remove('st-pressed');
    const t = e.changedTouches[0];
    if (t) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const inBounds = t.clientX >= rect.left && t.clientX <= rect.right
                      && t.clientY >= rect.top && t.clientY <= rect.bottom;
        if (!inBounds) return; // cancelled by sliding finger off the button
      }
    }
    fire();
  };
  el.addEventListener('touchstart', press, { passive: false });
  el.addEventListener('touchend', release, { passive: false });
  el.addEventListener('touchcancel', cancel, { passive: false });
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
export function installStoreTouchControls(callbacks: InputCallbacks, poke: () => void, getScene?: () => StoreScene | null): void {
  if (!isTouchInputActive()) return;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'store-touch-controls';

  const back = document.createElement('div');
  back.id = 'store-touch-back';
  back.className = 'st-btn';
  back.innerHTML = '<span class="st-label">BACK</span>';
  back.setAttribute('role', 'button');
  back.setAttribute('aria-label', 'Back');
  bind(back, () => { poke(); callbacks.onBack(); });

  const ok = document.createElement('div');
  ok.id = 'store-touch-ok';
  ok.className = 'st-btn';
  ok.innerHTML = '<span class="st-label">OK</span>';
  ok.setAttribute('role', 'button');
  ok.setAttribute('aria-label', 'Select');
  bind(ok, () => { poke(); void callbacks.onEnter(); });

  const directions = document.createElement('div');
  directions.id = 'store-touch-directions';
  for (const [label, fire] of [['UP', callbacks.onUp], ['LEFT', callbacks.onLeft],
    ['DOWN', callbacks.onDown], ['RIGHT', callbacks.onRight]] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `store-touch-${label.toLowerCase()}`;
    button.className = 'st-btn';
    const text = document.createElement('span');
    text.className = 'st-label'; text.textContent = label; button.appendChild(text);
    bind(button, () => { poke(); fire(); });
    directions.appendChild(button);
  }
  root.appendChild(directions);
  root.appendChild(back);
  root.appendChild(ok);
  (document.getElementById('hud-overlay') ?? document.body).appendChild(root);

  // ── Swipe to browse ───────────────────────────────────────────────────
  // Direct hosted gestures own the camera while the finger is down.
  // Inspection and local touch controls reuse the existing callbacks.
  const stage = document.getElementById('canvas-container');
  if (stage) {
    // touch-action: none hands the browser's own pan/pinch/double-tap-zoom
    // handling off entirely, so touchmove needs no preventDefault() to stay
    // out of the page's way.
    stage.style.touchAction = 'none';
    installMobileWalk(root, stage, callbacks, poke, () => getScene?.() ?? null);
    let startX = 0, startY = 0, tracking = false;
    let drag: ReturnType<typeof beginMobileDrag> = null;
    let moved = false;
    stage.addEventListener('touchstart', (e) => {
      if (getScene?.()?.isWalkAroundMode) { tracking = false; drag = null; return; }
      if (e.touches.length !== 1) {
        tracking = false;
        const s = getScene?.();
        if (s) markMobileDragged(s);
        drag?.end();
        drag = null;
        return;
      }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true; moved = false;
      const scene = getScene?.();
      drag = scene ? beginMobileDrag(scene, startX, startY) : null;
    }, { passive: true });
    stage.addEventListener('touchmove', (e) => {
      if (!tracking || !drag || e.touches.length !== 1) {
        if (e.touches.length > 1) {
          const s = getScene?.();
          if (s) markMobileDragged(s);
          if (drag) {
            drag.end();
            drag = null;
          }
          tracking = false;
        }
        return;
      }
      const t = e.touches[0];
      if (Math.hypot(t.clientX - startX, t.clientY - startY) > 8) moved = true;
      if (moved) { poke(); drag.move(t.clientX, t.clientY); }
    }, { passive: true });
    stage.addEventListener('touchend', (e) => {
      if (!tracking) return;
      tracking = false;
      if (drag) { if (moved) drag.end(); drag = null; return; }
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const dir = resolveSwipeDirection(dx, dy);
      if (!dir) return;
      poke();
      if (dir === 'left') callbacks.onLeft();
      else if (dir === 'right') callbacks.onRight();
      else if (dir === 'down') callbacks.onDown();
      else if (dir === 'up') callbacks.onUp();
    }, { passive: true });
    stage.addEventListener('touchcancel', () => {
      tracking = false;
      const s = getScene?.();
      if (s) markMobileDragged(s);
      drag?.end();
      drag = null;
    }, { passive: true });
  }
}
