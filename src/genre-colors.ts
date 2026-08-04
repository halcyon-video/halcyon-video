import { getActiveTheme } from './themes';

// The 1993 in-store genre color system, extracted from the store footage:
// every genre sign — the fascia blades on the run tops AND the skewed ceiling
// panels — draws from the same four saturated families. Orange for the funny
// shelves, blue for the dramatic ones, purple for the scary ones, red for the
// specialist wall. Shared here (no deps) so canvas-textures and the fascia
// builder can't drift apart.
export const BB93_FAMILY_COLORS: Record<string, string> = {
  'COMEDY': '#d9571f',
  'MUSIC': '#d9571f',
  'FAMILY': '#d9571f',
  'DRAMA': '#1f6fc4',
  'SUSPENSE': '#1f6fc4',
  'ROMANCE': '#1f6fc4',
  'TELEVISION': '#1f6fc4',
  'GENERAL': '#1f6fc4',
  'SCI-FI & FANTASY': '#5b4ba0',
  'HORROR': '#5b4ba0',
  'ACTION': '#5b4ba0',
  'SPECIAL INTEREST': '#b03a2e',
};

export const BB93_DEFAULT_GENRE_COLOR = '#1f6fc4';

export function bb93GenreColor(label: string): string {
  return BB93_FAMILY_COLORS[label.toUpperCase()] ?? BB93_DEFAULT_GENRE_COLOR;
}

/**
 * The 1993-footage store dressing (fascia blades, ribbon ceiling panels,
 * flat-oblique NEW RELEASES band, counter/storefront/security props). ON
 * whenever the active era IS the 1993 theme (theme.dressingEra === '1993'),
 * and additionally as a legacy opt-in (bb_93_signage) that layers the look
 * onto any other era theme.
 *
 * This is the single lever every 93-dressing gate reads, so selecting the
 * 1993 era turns the whole pack on at once.
 */
export function bb93SignageOn(): boolean {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('bb_93_signage') === 'on') {
    return true;
  }
  // getActiveTheme reads localStorage/THEMES; guarded so pure-node callers
  // (unit tests, tooling) that never set a theme fall back to "off".
  try {
    return getActiveTheme().dressingEra === '1993';
  } catch {
    return false;
  }
}
