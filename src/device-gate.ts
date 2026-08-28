// Device gate — the first thing a stranger's browser hits.
//
// Two devices reach the store and can't use it, and both used to fail silently:
//
//   1. A PHONE. The 3D store renders fine on a phone — it just has no input.
//      Every control is a remote/arrow-key press (browse cursor, jump index,
//      flip), and there is no touch handling anywhere in the app, so a visitor
//      gets a beautiful room and a HUD reading "◀ ▶ PICK A SECTION" with
//      nothing to press. ~40% of the launch-thread referral uniques came from
//      the Reddit mobile app (issue #47), so this is the single most-hit dead
//      end in the project.
//
//   2. A BROWSER WITHOUT WebGL2 — a VM, a locked-down work laptop, an old
//      tablet, software rendering. StoreScene's constructor throws, main.ts
//      catches it, logs "Falling back to 2D UI" to a console panel nobody has
//      open, and hides the boot overlay. The result is a blank room.
//
// Both have the same answer, and it already exists: 2.5D flat mode is built out
// of real DOM elements with click handlers (src/flat/), so a tap works, and it
// needs no WebGL at all. This gate detects the two cases and offers that mode
// instead of letting either fail. It is NOT a "sorry, come back on a desktop"
// card — it is a door to the same library in the mode that device can actually
// drive.
//
// Deliberately self-contained: its own <style>, no dependency on the 3D stack,
// no dependency on styles.css having loaded. It runs on the paths where things
// are already going wrong, so it assumes as little as possible. The only thing
// it borrows is the house emblem in index.html's <defs> and the theme's palette
// custom properties (never a hardcoded house color — see CLAUDE.md signage
// rule 2), each with a fallback for the case where the theme never applied.
import { getSetting, setSetting } from './settings';

/** Remembered answer, so a returning visitor is never asked twice. */
const ANSWER_KEY = 'bb_device_gate';
const TOUR_URL = 'https://youtu.be/TCkEpeL8Y3w';

/**
 * Does a phone get walked straight into 2.5D instead of being asked? See the
 * note in runDeviceGate — this is the single switch that reverts that call.
 */
const PHONE_STRAIGHT_TO_FLAT = true;

export type GateReason = 'no-webgl2' | 'touch-primary';

/**
 * Can this browser build the 3D store at all? A throwaway probe context, freed
 * immediately: a WebGL2 context left alive here would count against the
 * browser's per-page context limit and could cost StoreScene its own.
 */
function hasWebGL2(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * A finger is the only pointer here. All three conditions matter: a touchscreen
 * laptop is `coarse` but still has a keyboard and hover, and a 10-foot TV UI
 * reports no hover but is large and driven by a remote the 3D store handles
 * natively. Phones and small tablets are what's left.
 */
function isTouchPrimary(): boolean {
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse)').matches
      && window.matchMedia('(hover: none)').matches
      && Math.min(window.innerWidth, window.innerHeight) < 700;
}

/** Why this device needs the gate, or null if it can drive the 3D store. */
export function detectGateReason(): GateReason | null {
  // ?nogate=1 is the escape hatch for verification tools that need to drive the
  // real boot path on a device shape that would otherwise be gated.
  if (new URLSearchParams(location.search).has('nogate')) return null;
  // Already answered on this device, or already living in flat mode: nothing to
  // ask. (A returning 2.5D visitor should just get 2.5D.)
  if (localStorage.getItem(ANSWER_KEY)) return null;
  if (getSetting<string>('bb_render_mode') === 'flat') return null;

  if (!hasWebGL2()) return 'no-webgl2';
  if (isTouchPrimary()) return 'touch-primary';
  return null;
}

const COPY: Record<GateReason, { head: string; body: string; canStay: boolean }> = {
  'touch-primary': {
    head: 'Built for TVs and desktops',
    body: 'The 3D store is walked with a remote or the arrow keys, so there’s '
        + 'nothing here to tap. The 2D store is the same library, same shelves, '
        + 'built to be touched.',
    canStay: true,
  },
  'no-webgl2': {
    head: 'This browser can’t run the 3D store',
    body: 'Walking the aisles needs WebGL2, which this browser or graphics driver '
        + 'doesn’t offer. The 2D store is plain HTML — same library, and it '
        + 'needs none of it.',
    // No point offering a 3D store that provably cannot start.
    canStay: false,
  },
};

function styleTag(): HTMLStyleElement {
  const s = document.createElement('style');
  s.textContent = `
  #device-gate {
    position: fixed; inset: 0; z-index: 2000;
    display: flex; align-items: center; justify-content: center;
    padding: 24px; box-sizing: border-box;
    background: var(--bg-dark, #05070d);
    font-family: var(--font-body, system-ui, -apple-system, sans-serif);
    color: #fff; overflow-y: auto;
  }
  #device-gate .dg-card {
    width: 100%; max-width: 460px; text-align: center;
  }
  #device-gate .dg-logo { width: min(240px, 62vw); margin: 0 auto 28px; display: block; }
  #device-gate h1 {
    font-family: var(--font-title, var(--font-body, system-ui), sans-serif);
    font-size: clamp(24px, 7vw, 34px); line-height: 1.15; margin: 0 0 14px;
    letter-spacing: 0.01em;
  }
  #device-gate p {
    font-size: clamp(15px, 4vw, 17px); line-height: 1.5; margin: 0 0 28px;
    color: rgba(255,255,255,0.76);
  }
  #device-gate button, #device-gate a.dg-btn {
    display: block; width: 100%; box-sizing: border-box;
    /* 52px keeps every target above the ~44px comfortable-tap floor. */
    min-height: 52px; margin: 0 0 12px; padding: 15px 20px;
    border-radius: 10px; border: 0; cursor: pointer;
    font: inherit; font-size: 17px; font-weight: 600;
    text-decoration: none; -webkit-tap-highlight-color: transparent;
  }
  #device-gate .dg-primary {
    background: var(--bb-accent, #f2b325); color: var(--bb-primary, #10214a);
  }
  #device-gate .dg-secondary {
    background: rgba(255,255,255,0.09); color: #fff;
    border: 1px solid rgba(255,255,255,0.18);
  }
  #device-gate .dg-tertiary {
    background: none; color: rgba(255,255,255,0.62);
    font-weight: 500; font-size: 15px; min-height: 44px; text-decoration: underline;
  }
  #device-gate .dg-foot {
    margin: 18px 0 0; font-size: 13px; color: rgba(255,255,255,0.42);
  }
  @media (prefers-reduced-motion: no-preference) {
    #device-gate { animation: dg-in 180ms ease-out; }
    @keyframes dg-in { from { opacity: 0 } to { opacity: 1 } }
  }`;
  return s;
}

/**
 * Show the gate and resolve once the visitor has chosen. Resolves immediately
 * when the device doesn't need one, so callers can always await it.
 *
 * Sets `bb_render_mode` BEFORE resolving, which is why main() awaits this ahead
 * of its boot call: the store then builds in the chosen mode first time, with
 * no reload and no 3D scene built just to tear it down.
 */
export function runDeviceGate(): Promise<void> {
  const reason = detectGateReason();
  if (!reason) return Promise.resolve();

  // A PHONE IS NOT ASKED. It is answered. (Owner direction 2026-08-27: "people
  // click it on their phone and can't use it and give up".) The card this used
  // to raise led with "Built for TVs and desktops" — the first sentence a
  // stranger off a link read was that their device was the wrong one, and a
  // share of them never reached the second. The zero-setup mandate says the
  // hosted site IS the product and must just work, so a touch-primary visitor
  // now lands in the mode their thumb can actually drive, stocked and
  // browsable, with no screen in between. The 3D store is not hidden: it is
  // one tap away under "3D Store Mode" in the flat store's menu, which is
  // where a curious visitor looks anyway.
  //
  // A WebGL2-less browser still gets the card, because that one carries real
  // information the visitor cannot otherwise get (their browser provably
  // cannot run the 3D store) and offers the tour as consolation.
  //
  // Flip PHONE_STRAIGHT_TO_FLAT back to false to restore the old card.
  if (reason === 'touch-primary' && PHONE_STRAIGHT_TO_FLAT) {
    setSetting('bb_render_mode', 'flat');
    try { localStorage.setItem(ANSWER_KEY, 'flat'); } catch { /* private mode */ }
    return Promise.resolve();
  }

  const { head, body, canStay } = COPY[reason];
  return new Promise<void>((resolve) => {
    const root = document.createElement('div');
    root.id = 'device-gate';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.appendChild(styleTag());

    const card = document.createElement('div');
    card.className = 'dg-card';
    // The emblem is the one in index.html's <defs> — the active brand's board,
    // never a copy (CLAUDE.md signage rule 2).
    card.innerHTML = `
      <svg class="dg-logo" viewBox="0 0 640 400" aria-label="Halcyon Video">
        <use href="#bb-ticket-logo"/>
      </svg>
      <h1></h1>
      <p></p>`;
    (card.querySelector('h1') as HTMLElement).textContent = head;
    (card.querySelector('p') as HTMLElement).textContent = body;

    const finish = (mode: 'flat' | '3d') => {
      setSetting('bb_render_mode', mode);
      try { localStorage.setItem(ANSWER_KEY, mode); } catch { /* private mode */ }
      root.remove();
      resolve();
    };

    const openFlat = document.createElement('button');
    openFlat.className = 'dg-primary';
    openFlat.textContent = 'Open the 2D store';
    openFlat.addEventListener('click', () => finish('flat'));
    card.appendChild(openFlat);

    const tour = document.createElement('a');
    tour.className = 'dg-btn dg-secondary';
    tour.href = TOUR_URL;
    tour.target = '_blank';
    tour.rel = 'noopener noreferrer';
    tour.textContent = 'Watch the 45-second tour ▶';
    card.appendChild(tour);

    if (canStay) {
      const stay = document.createElement('button');
      stay.className = 'dg-tertiary';
      stay.textContent = 'Continue to the 3D store anyway';
      stay.addEventListener('click', () => finish('3d'));
      card.appendChild(stay);
    }

    const foot = document.createElement('p');
    foot.className = 'dg-foot';
    foot.textContent = 'You can switch modes any time from the store menu.';
    card.appendChild(foot);

    root.appendChild(card);
    document.body.appendChild(root);
  });
}
