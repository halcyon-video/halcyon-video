// POP-kit period — the merchandising axis, separate from the theme.
//
// Owner's model (2026-07-30): a theme is the STORE FABRIC — paint, painted
// wall bands, fixtures, carpet — and fabric is renovation-vintage, not
// year-vintage: a store refit in 1993 wears that look until the next refit
// (the owner has a 1993 photo indistinguishable from a 2008-look store).
// What actually dates a scene is the POINT-OF-PURCHASE KIT: the campaign
// banners, price signs, shelf cards and standees corporate MAILED to every
// store on a schedule. Those have real start/end dates, attested by the
// reference-photo corpus (ERAS.md "Signage intervals").
//
// Gating rule, directional on purpose:
//   - POP newer than the fabric = PLAUSIBLE (an old store, still open,
//     displaying this season's mailing).
//   - POP older than the fabric = IMPOSSIBLE (the refit binned it).
// So a kit renders iff popPeriod is inside the kit's attested interval AND
// the theme's fabric vintage <= the period. `bb_pop_period` overrides the
// per-theme default (harness: --set bb_pop_period=2005).
import { getActiveTheme } from './themes';

export type PopPeriod = '2005' | '2008' | '2012';

// Fabric renovation vintage per theme (hv-90s is the other brand — no
// No period POP belongs on it, so it gets no default period and an
// Infinity vintage keeps every kit off even under an explicit override).
const FABRIC_VINTAGE: Record<string, number> = {
  'bb-1990': 1990,
  'bb-1993': 1993,
  'bb-2000': 2000,
  'bb-2010': 2008,
};

const DEFAULT_PERIOD: Record<string, PopPeriod> = {
  // Coherent defaults: each fabric shows the earliest kit era it plausibly
  // hosted, so every theme boots looking like its own moment.
  'bb-2000': '2005',
  'bb-2010': '2008',
};

export function getPopPeriod(): PopPeriod | null {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem('bb_pop_period');
  } catch {
    /* storage unavailable — fall through to the theme default */
  }
  if (stored === '2005' || stored === '2008' || stored === '2012') return stored;
  return DEFAULT_PERIOD[getActiveTheme().id] ?? null;
}

/** True iff a kit attested for [startYear..endYear] belongs in the scene. */
export function popKitVisible(startYear: number, endYear: number): boolean {
  const period = getPopPeriod();
  if (period === null) return false;
  const year = Number(period);
  if (year < startYear || year > endYear) return false;
  const vintage = FABRIC_VINTAGE[getActiveTheme().id] ?? Infinity;
  return vintage <= year;
}
