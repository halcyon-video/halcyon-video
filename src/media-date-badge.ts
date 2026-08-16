// The STORE DATE stamp — the corner readout that says which day the shelves
// you are looking at are stocked for.
//
// The Media Release Date pin (#42, media-release-date.ts) removes everything
// that premiered after its rolling cutoff: the store is genuinely the store as
// it stood on that date. Without a readout that is invisible — a 1996-pinned
// library just looks like a library that happens to have nothing recent in it,
// and the missing titles read as a sync failure rather than the point. This is
// the one line that names the date, so what's on the shelves is legibly "what
// was in stock on 12-JUN-1996" and not "what my server lost".
//
// WHAT DATE IT SHOWS, AND WHY IT ISN'T RE-DERIVED
// ----------------------------------------------
// The cutoff is handed IN, by the scene-build funnel that used it to filter the
// catalog (main.ts's refreshStoreCatalog) — never re-read from storage here.
// The pin ROLLS: its effective cutoff advances one day per real day, so a store
// left running across midnight would, if this module re-derived, start claiming
// a date its shelves were not built for. The stamp is a caption on the build,
// not a clock. It changes when the store is rebuilt, which is exactly when the
// stock it describes changes.
//
// Presentation follows the app's HUD language (see #browse-locator /
// #browse-hint in styles.css): floating uppercase type, no background bar, a
// drop shadow to survive a bright shelf behind it. Styling is inline rather
// than in styles.css because the screenshot harness (harness.html) loads no
// stylesheet — same reason fps-meter.ts and hold-hints.ts carry their own.

import { formatCutoffDate } from './media-release-date';

const EL_ID = 'store-date-stamp';

// z-index 6 puts the stamp on the HUD rung with the browse locator and the mode
// hint (5/6) — above the canvas, below every menu, dialog and full-screen
// overlay (all 15+), so anything the user opens simply covers it. It reads as
// part of the same floating HUD those two belong to, not as telemetry pinned on
// top of the picture (which is the fps meter's rung, 13).
const STAMP_CSS =
  'position:fixed;right:34px;bottom:76px;z-index:6;pointer-events:none;user-select:none;' +
  'display:flex;align-items:baseline;gap:11px;white-space:nowrap;' +
  "font-family:var(--font-title, 'Bebas Neue', sans-serif);text-transform:uppercase;" +
  // Two shadows, as the browse locator does it: the wide one lifts the type off
  // a busy shelf, the tight one keeps its edges from dissolving into a white
  // box wrap directly behind it.
  'text-shadow:0 2px 10px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.75);' +
  'opacity:0;transition:opacity 0.45s ease;';

// Both lines clear the 10-ft type floor (review §4.4: nothing user-facing under
// 22px @1080p) — this is read from a couch, not a desk.
const LABEL_CSS = 'font-size:22px;letter-spacing:2px;color:rgba(255,255,255,0.65);';
const DATE_CSS = 'font-size:26px;letter-spacing:2.5px;color:#fff;';

let el: HTMLDivElement | null = null;
let dateEl: HTMLSpanElement | null = null;
let shown = '';

/**
 * Show the stamp for `cutoff`, or take it down when the catalog is unpinned.
 * Idempotent and cheap to call on every rebuild: an unchanged date touches no
 * DOM at all.
 */
export function refreshStoreDateStamp(cutoff: Date | null): void {
  if (typeof document === 'undefined') return;
  if (!cutoff) {
    destroyStoreDateStamp();
    return;
  }
  const text = formatCutoffDate(cutoff);
  if (el && text === shown) return;
  if (!el) {
    el = document.createElement('div');
    el.id = EL_ID;
    el.style.cssText = STAMP_CSS;
    const label = document.createElement('span');
    label.style.cssText = LABEL_CSS;
    label.textContent = 'Store date';
    dateEl = document.createElement('span');
    dateEl.style.cssText = DATE_CSS;
    el.append(label, dateEl);
    document.body.appendChild(el);
    // Fade in from the initial opacity:0 rather than popping — one frame's
    // delay so the browser has the starting value to transition from.
    requestAnimationFrame(() => {
      if (el) el.style.opacity = '1';
    });
  }
  shown = text;
  dateEl!.textContent = text;
  (window as unknown as Record<string, unknown>).__storeDateStamp = text;
}

/** Remove the stamp entirely — an unpinned store carries no extra DOM node. */
export function destroyStoreDateStamp(): void {
  el?.remove();
  el = null;
  dateEl = null;
  shown = '';
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__storeDateStamp = null;
  }
}
