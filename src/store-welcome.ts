// First-visit welcome for the hosted store (issue #130).
//
// When a stranger visits the hosted store for the first time, nothing tells
// them they can touch-navigate the 3D room, pick up a case, or ask the clerk
// for a recommendation. This module provides a short diegetic welcome on the
// hosted boot:
//   1. First-visit flag in localStorage ('halcyon_first_visit').
//   2. One clerk greeting line (diegetic clerk toast).
//   3. Brief control hint in #browse-hint and touch button intro glow, both
//      fading/transitioning on first user input.
//
// Gated strictly to the hosted store (isDemo) — local installs (opening-day
// empty store and setup terminal) remain untouched.

export const FIRST_VISIT_KEY = 'halcyon_first_visit';

export interface WelcomeDeps {
  isDemo?: boolean;
  isTouch?: boolean;
  showToast?: (text: string, ms?: number) => void;
  brandGreeting?: string;
  onDismiss?: () => void;
}

let welcomeActive = false;
let hudRefreshCallback: (() => void) | null = null;

/** Whether this browser has never visited the hosted store before. */
export function isFirstVisit(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(FIRST_VISIT_KEY) === null;
}

/** Mark that this browser has visited the store so the welcome only runs once. */
export function markFirstVisit(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(FIRST_VISIT_KEY, '1');
}

/** Clear the first-visit flag (test/debug helper). */
export function clearFirstVisit(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(FIRST_VISIT_KEY);
}

/** Whether the initial welcome control hint is currently active on screen. */
export function isWelcomeActive(): boolean {
  return welcomeActive;
}

/**
 * Control hint text shown during the initial first-visit welcome period.
 * Gives the visitor an immediate, clear idea of what they can do.
 *
 * Only keys that answer RIGHT HERE belong in this line. Talking to the clerk
 * is deliberately absent: 'e' is gated on ClerkInteraction's `near` check, so
 * at the entrance -- which is exactly where this hint appears -- it does
 * nothing. The store already teaches that key at the moment it works, via the
 * proximity 'Press E to talk' prompt, and the greeting toast is the invitation
 * to go find her. Teaching a key that ignores the visitor is worse than
 * teaching none.
 */
export function welcomeHUDText(isTouch: boolean): string {
  return isTouch
    ? 'SWIPE TO WALK THE AISLES  •  TAP ANY CASE TO EXAMINE'
    : '◀ ▶ TO WALK THE AISLES  •  ENTER TO EXAMINE';
}

/**
 * Trigger the diegetic first-visit welcome on the hosted boot.
 * A no-op on local installs (!isDemo) and on repeat visits.
 */
export function triggerHostedWelcome(deps: WelcomeDeps = {}): boolean {
  const isDemo = deps.isDemo ?? (
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_DEMO === '1') ||
    (typeof location !== 'undefined' && new URLSearchParams(location.search).get('demo') === '1')
  );

  if (!isDemo || !isFirstVisit()) return false;

  markFirstVisit();
  welcomeActive = true;
  hudRefreshCallback = deps.onDismiss ?? null;

  const isTouch = deps.isTouch ?? (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches &&
    window.matchMedia('(hover: none)').matches
  );

  // 1. Brief control hint in the bottom HUD band
  const hint = typeof document !== 'undefined' ? document.getElementById('browse-hint') : null;
  if (hint) {
    hint.textContent = welcomeHUDText(isTouch);
  }

  // 2. Touch controls intro glow/pulse on-screen
  const touchControls = typeof document !== 'undefined' ? document.getElementById('store-touch-controls') : null;
  touchControls?.classList.add('st-intro');

  // 3. Diegetic clerk greeting toast
  const greeting = deps.brandGreeting ??
    'Hey there! Welcome to Halcyon — take a look around, or come ask me if you need a recommendation!';
  deps.showToast?.(greeting, 6500);

  return true;
}

/**
 * Dismiss the welcome control hint on first user input, fading/restoring
 * standard contextual HUD copy.
 */
export function dismissWelcome(): void {
  if (!welcomeActive) return;
  welcomeActive = false;

  const touchControls = typeof document !== 'undefined' ? document.getElementById('store-touch-controls') : null;
  touchControls?.classList.remove('st-intro');

  const cb = hudRefreshCallback;
  hudRefreshCallback = null;
  cb?.();
}
