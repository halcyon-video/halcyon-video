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
  // ACTION is directly attested MAGENTA on the 1993 ceiling plate
  // (HFNfVDQdMxs f0016, "a magenta/red rounded plate"), not the sci-fi
  // purple it was previously grouped with.
  'ACTION': '#c13066',
  'SPECIAL INTEREST': '#b03a2e',
};

export const BB93_DEFAULT_GENRE_COLOR = '#1f6fc4';

export function bb93GenreColor(label: string): string {
  return BB93_FAMILY_COLORS[label.toUpperCase()] ?? BB93_DEFAULT_GENRE_COLOR;
}

/**
 * The 1993-footage store dressing (fascia blades, ribbon ceiling panels,
 * flat-oblique NEW RELEASES band, counter/storefront/security props). ON for
 * exactly one thing: the 1993 era (theme.dressingEra === '1993').
 *
 * There is no separate switch. The pack IS the 1993 store, so pick that era
 * and you get all of it; pick any other and you get none of it (issue #113 —
 * the retired "1993 Store Dressing" row existed only to layer 1993 signage
 * onto the 1990/2000/2010 stores, a distinction nobody asked for).
 *
 * This is the single lever every 93-dressing gate reads, so selecting the
 * 1993 era turns the whole pack on at once.
 */
export function dressing93Active(): boolean {
  // getActiveTheme reads localStorage/THEMES; guarded so pure-node callers
  // (unit tests, tooling) that never set a theme fall back to "off".
  try {
    return getActiveTheme().dressingEra === '1993';
  } catch {
    return false;
  }
}
