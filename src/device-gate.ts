// Device gate — the first thing a stranger's browser hits.
//
// Two devices reach the store and need a decision made for them:
//
//   1. A PHONE. This used to be a dead end: every 3D control was a
//      remote/arrow-key press (browse cursor, jump index, flip), there was no
//      touch handling anywhere in the app, and a visitor got a beautiful room
//      with nothing to press. ~40% of the launch-thread referral uniques came
//      from the Reddit mobile app (issue #47), so this was the single
//      most-hit dead end in the project. That's fixed now: store-touch.ts
//      (issue #126) gives the 3D store real swipe-to-browse, tap-to-select,
//      OK/BACK gestures, and the first-visit welcome hint already knows to
//      show touch wording (store-welcome.ts, isTouchInputActive). A phone is
//      no longer a device the 3D store can't serve — it's one this gate should
//      let choose, honestly, instead of deciding for it.
//
//   2. A BROWSER WITHOUT WebGL2 — a VM, a locked-down work laptop, an old
//      tablet, software rendering. StoreScene's constructor throws, main.ts
//      catches it, logs "Falling back to 2D UI" to a console panel nobody has
//      open, and hides the boot overlay. The result is a blank room. Nothing
//      about touch controls changes this one: 3D provably cannot start here.
//
// Both cases have a fallback that already exists: 2.5D flat mode is built out
// of real DOM elements with click handlers (src/flat/), so a tap works, and it
// needs no WebGL at all. This gate detects the two cases and, where the 3D
// store genuinely can't run, offers flat mode instead of letting the boot
// fail. Where 3D CAN run (touch-primary), it presents both modes as real
// options — this is not a "sorry, come back on a desktop" card, and it is not
// a "here's your consolation prize" card either.
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

interface GateAction {
  label: string;
  mode: 'flat' | '3d';
}

interface GateCopy {
  head: string;
  body: string;
  /** The card's lead recommendation — styled `.dg-primary`. */
  primary: GateAction;
  /**
   * A second real option, styled `.dg-secondary`. Omitted when there genuinely
   * isn't one: no-webgl2's browser provably cannot run the 3D store, so flat
   * is the only choice, not an alternative to a choice.
   */
  secondary?: GateAction;
}

const COPY: Record<GateReason, GateCopy> = {
  'touch-primary': {
    head: 'Now walkable by touch',
    body: 'Swipe to walk the aisles, tap a case to look closer, tap BACK to '
        + 'step away — the 3D store has real touch controls now. Want '
        + 'something simpler instead? The 2D store is the same library, '
        + 'browsed with plain taps.',
    primary: { label: 'Continue to the 3D store', mode: '3d' },
    secondary: { label: 'Open the 2D store instead', mode: 'flat' },
  },
  'no-webgl2': {
    head: 'This browser can’t run the 3D store',
    body: 'Walking the aisles needs WebGL2, which this browser or graphics driver '
        + 'doesn’t offer. The 2D store is plain HTML — same library, and it '
        + 'needs none of it.',
    primary: { label: 'Open the 2D store', mode: 'flat' },
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

  // Both reasons get the same real-choice card. A touch-primary visitor used
  // to be walked straight into flat mode with no card at all (owner direction
  // 2026-08-27, "people click it on their phone and can't use it and give
  // up") — but that call predates store-touch.ts (issue #126) by one day, and
  // deciding silently for a visitor whose device can now actually drive the
  // 3D store is worse than the dead end it replaced: nobody who lands on a
  // phone ever sees the 3D room, or the touch-specific first-visit welcome
  // hint built for exactly this visitor (store-welcome.ts). So the card asks
  // again, honestly worded, with 3D as the lead option and 2D offered as a
  // real alternative rather than a correction.
  //
  // A WebGL2-less browser gets the same card shape but no 3D option: that one
  // carries real information the visitor cannot otherwise get (their browser
  // provably cannot run the 3D store), so there is nothing to offer alongside
  // 2D except the tour, as consolation.
  const { head, body, primary, secondary } = COPY[reason];
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

    const primaryBtn = document.createElement('button');
    primaryBtn.className = 'dg-primary';
    primaryBtn.textContent = primary.label;
    primaryBtn.addEventListener('click', () => finish(primary.mode));
    card.appendChild(primaryBtn);

    // The second real option (touch-primary's 2D alternative) takes the
    // dg-secondary billing when there is one; the tour link steps down to
    // dg-tertiary so it doesn't compete with an actual choice. no-webgl2 has
    // no secondary action, so the tour keeps the dg-secondary billing it
    // always had there.
    if (secondary) {
      const secondaryBtn = document.createElement('button');
      secondaryBtn.className = 'dg-secondary';
      secondaryBtn.textContent = secondary.label;
      secondaryBtn.addEventListener('click', () => finish(secondary.mode));
      card.appendChild(secondaryBtn);
    }

    const tour = document.createElement('a');
    tour.className = `dg-btn ${secondary ? 'dg-tertiary' : 'dg-secondary'}`;
    tour.href = TOUR_URL;
    tour.target = '_blank';
    tour.rel = 'noopener noreferrer';
    tour.textContent = 'Watch the 45-second tour ▶';
    card.appendChild(tour);

    const foot = document.createElement('p');
    foot.className = 'dg-foot';
    foot.textContent = 'You can switch modes any time from the store menu.';
    card.appendChild(foot);

    root.appendChild(card);
    document.body.appendChild(root);
  });
}
