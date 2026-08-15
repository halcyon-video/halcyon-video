import type { LogoSpec } from './logo-spec';
import { getBrandPack } from './brand-pack';
import {
  DEFAULT_LOGO_SPECS, getActiveLogoSpec,
  HALCYON_BLUE, HALCYON_TRIM, HALCYON_ACCENT, HALCYON_BLUE_LIT,
} from './logo-spec';

// Which genre topper an era wears on its shelf-run tops. Read as a data field
// by the topper builders (buildAisleShelving in shelving.ts, the game section)
// instead of the old `theme.id === 'bb-90s'` string checks, so a new era is a
// data entry rather than another special-case branch:
//   ticket-board  — classic 14x8.5in signboard on two feet   (1990)
//   fascia-blade  — small collegiate genre blade on the top   (1993)
//   arched-plaque — brick-red rounded-top ACTION plaque       (2000, Hamlet-era)
//   flush         — elongated rounded-top banner, mounted flush (2010)
export type TopperStyle = 'ticket-board' | 'fascia-blade' | 'arched-plaque' | 'flush';

export interface StoreTheme {
  id: string;
  name: string;
  shelfStyleId: string;
  // The shelf-run genre topper style for this era (see TopperStyle above).
  topperStyle: TopperStyle;
  // When set, this era's period store-dressing pack is ON by default (no
  // bb_93_signage toggle needed). '1993' = fascia blades + counter/storefront/
  // security props + ribbon ceiling panels. Absent = classic dressing.
  dressingEra?: '1993';
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    wall: string;
    carpet: string;
    counterBody: string;
    counterTop: string;
  };
  // Theme-driven storefront override: when set, wins over StorefrontSpec.frameColor
  // for the window/door frame color, regardless of the active storefront
  // preset (see src/entrance/windows.ts, src/entrance/index.ts).
  frameColorOverride?: string;
  brand: {
    name: string;
    // How the flat/2.5D chrome mounts the identity. One value today: the
    // emblem is painted from the LogoSpec wherever it appears, so a new brand
    // is data, never a new branch.
    logoKind: 'emblem';
    // The theme's default brand emblem — what every logo surface paints when
    // the user hasn't customized bb_logo (see getActiveLogoSpec in
    // logo-spec.ts, which deep-merges the bb_logo partial over this).
    logo: LogoSpec;
  };
  defaultMedium: 'dvd' | 'vhs';
  shelving: {
    frame: 'laminate-white' | 'wire-black';
  };
  signageSet: string;
}

// The shared Halcyon room palette: house-yellow drywall, deep-blue carpet,
// gold trim, a blue counter top — the true-blue video-store room (owner
// ruling 2026-08-04). Kept as one object so a palette tweak lands on every
// era at once. One era overrides `wall`: bb-1990 stays white (the stripe
// painted near the top of the wall bays carries the livery, not the paint —
// owner ruling, both 2026-08-03 and reaffirmed with the blue/gold swap).
const HALCYON_ROOM_PALETTE = {
  secondary: HALCYON_TRIM,     // cream trim (knee walls derive: x0.76 -> warm greige)
  accent: HALCYON_ACCENT,      // cream highlights; --bb-sign now tracks the knockout
  wall: '#f2cf4a',              // house-yellow drywall
  carpet: '#7086ab',            // dusty, desaturated blue (owner: the first pass read too vibrant)
  counterBody: '#f4f4f0',       // white counter body
  counterTop: HALCYON_BLUE_LIT, // blue counter top (a touch brighter, it sits under lamps)
} as const;

// bb-2000's own wall departure: dusty lilac (owner ruling 2026-08-04), the
// one era that breaks from house yellow — same shape the old sage override
// used before the blue/gold swap.
const HALCYON_2000_LILAC = '#c7b3d9';

// Selectable tints for the real photo-scanned wall texture (user-assets
// surfaces/store-wall — see its NOTES.md). The "Wall Paint" setting
// (bb_wall_color in settings.ts) cycles through these; 'auto' isn't listed
// here — it means "use this theme's own palette.wall", handled by the
// caller (buildStore in store-shell.ts). 'white' is the scan's own natural
// warm-plaster tone (an identity multiply, x#ffffff).
export const WALL_PAINT_OPTIONS: Record<string, { label: string; hex: string }> = {
  // 'parchment' keeps its key (saved bb_wall_color values) but is a literal
  // now — the room's own default moved to house yellow.
  yellow: { label: 'House Yellow', hex: HALCYON_ROOM_PALETTE.wall },
  parchment: { label: 'Parchment', hex: '#e9e2cf' },
  white: { label: 'White', hex: '#ffffff' },
  blue: { label: 'Blue', hex: '#5b87a6' },
  sage: { label: 'Sage', hex: '#a3b18a' },
};

export const THEMES: Record<string, StoreTheme> = {
  // ── 1990: the classic era — signboard genre toppers on feet ─────────────────
  'bb-1990': {
    id: 'bb-1990',
    name: 'Halcyon 1990',
    shelfStyleId: 'classic-trapezoid-4',
    topperStyle: 'ticket-board',
    // Plain white walls, no painted lettering (owner ruling 2026-08-03) —
    // same "white" value the counter body already uses
    // (HALCYON_ROOM_PALETTE.counterBody). The house livery appears in 1990
    // only as a stripe painted near the top of the wall bays
    // (wall-stripe-1990.ts) — not a soffit, just paint on a flat wall. The
    // knee wall under the front glazing shares the room's wall material
    // (store-shell.ts kneeMat = scene.wallSurface, UV-mapped onto the same
    // surface), so it follows this white automatically — no sill seam;
    // themeKneeGoldHex() is only the standalone-preview fallback where no
    // room exists to clash with.
    palette: { primary: HALCYON_BLUE, ...HALCYON_ROOM_PALETTE, wall: '#f4f4f0' },
    brand: {
      name: 'Halcyon Video',
      logoKind: 'emblem',
      logo: DEFAULT_LOGO_SPECS['bb-1990'],
    },
    defaultMedium: 'vhs',
    shelving: { frame: 'laminate-white' },
    signageSet: 'halcyon-1990-signs',
  },
  // ── 1993: the mid-era store — small genre blades + period store dressing ────
  'bb-1993': {
    id: 'bb-1993',
    name: 'Halcyon 1993',
    shelfStyleId: 'classic-trapezoid-4',
    topperStyle: 'fascia-blade',
    dressingEra: '1993',
    palette: { primary: HALCYON_BLUE, ...HALCYON_ROOM_PALETTE },
    brand: {
      name: 'Halcyon Video',
      logoKind: 'emblem',
      logo: DEFAULT_LOGO_SPECS['bb-1993'],
    },
    defaultMedium: 'vhs',
    shelving: { frame: 'laminate-white' },
    signageSet: 'halcyon-1993-signs',
  },
  // ── 2000: brick-red arched ACTION plaques, VHS ──────────────────────────────
  'bb-2000': {
    id: 'bb-2000',
    name: 'Halcyon 2000',
    shelfStyleId: 'classic-trapezoid-4',
    topperStyle: 'arched-plaque',
    // Dusty lilac drywall — 2000's own departure from house yellow (owner
    // ruling 2026-08-04, same shape the old sage departure used).
    palette: { primary: HALCYON_BLUE, ...HALCYON_ROOM_PALETTE, wall: HALCYON_2000_LILAC },
    brand: {
      name: 'Halcyon Video',
      logoKind: 'emblem',
      logo: DEFAULT_LOGO_SPECS['bb-2000'],
    },
    defaultMedium: 'vhs',
    shelving: { frame: 'laminate-white' },
    signageSet: 'halcyon-2000-signs',
  },
  // ── 2010: late-era DVD store — flush banner toppers, black wire shelving ────
  'bb-2010': {
    id: 'bb-2010',
    name: 'Halcyon 2010',
    shelfStyleId: 'classic-trapezoid-4',
    topperStyle: 'flush',
    palette: { primary: HALCYON_BLUE, ...HALCYON_ROOM_PALETTE },
    brand: {
      name: 'Halcyon Video',
      logoKind: 'emblem',
      logo: DEFAULT_LOGO_SPECS['bb-2010'],
    },
    defaultMedium: 'dvd',
    shelving: { frame: 'wire-black' },
    signageSet: 'halcyon-2010-signs',
  },
};

// Back-compat: the eras were renamed when 1990/1993 split out of the old
// combined "bb-90s" theme and "bb-2000s" became "bb-2010". Old saved bb_theme
// values, harness `--theme` flags, screenshots, memories and CLAUDE.md commands
// all still name the retired ids — resolve them so nothing breaks. bb-90s maps
// to the classic 1990 look (the fascia-blade look it used to reach via
// bb_93_signage is now its own bb-1993 theme).
export const THEME_ALIASES: Record<string, string> = {
  'bb-90s': 'bb-1990',
  'bb-2000s': 'bb-2010',
  // feedback/039 (owner: "remove night owl video as an era option") — the
  // second chain is retired outright, not renamed, so both its id and its
  // own legacy alias now resolve straight to the registry's default era
  // (matching resolveThemeId's null/missing-id fallback below) instead of
  // chaining through a theme that no longer exists in THEMES.
  'hv-90s': 'bb-1990',
  'owl-90s': 'bb-1990',
};

/** Canonicalize a possibly-legacy theme id to a current THEMES key. */
export function resolveThemeId(id: string | null | undefined): string {
  if (!id) return 'bb-1990';
  return THEME_ALIASES[id] ?? id;
}

// Brand-merged themes, one clone per (theme id, pack id, derived livery).
// getActiveTheme() is called ~100 times across the build (and inside default
// parameters), so the merge must not allocate per call. Theme and pack can't
// change without a reload, but the livery CAN — the brand editor rewrites
// bb_logo live — which is why it is part of the key rather than assumed
// constant, and why getActiveTheme bounds this map's size.
const mergedThemeCache = new Map<string, StoreTheme>();

// The LIVERY the signs key off — palette primary/secondary/accent — follows the
// active emblem, so choosing a brand repaints the endcaps, the wall bays and
// every topper that reads palette.primary instead of leaving a yellow store
// wearing blue fixtures. The ROOM (wall, carpet, counter tops) is deliberately
// left alone: per brand-drop.ts's header, "a logo is evidence about a logo, not
// about what colour someone painted their walls".
//
// This is the EDITOR half of a mapping brand-drop.ts already did for a dropped
// logo.svg (bodyColor -> primary), which is exactly why a file drop repainted
// the signage and an editor preset did not — the drawer writes a LogoSpec and
// nothing ever carried its colours across to the palette.
//
// secondary/accent come from borderColor rather than the drop's textColor
// because the editor HAS a border field and logo-spec.ts's own defaults mirror
// borderColor onto palette.secondary; a drop has no border to sample and must
// fall back to the lettering.
//
// Returns null when the derived livery already equals the theme's, which is
// every default install — all four eras have palette.primary === HALCYON_BLUE
// === DEFAULT_LOGO_SPECS[era].bodyColor, and borderColor === HALCYON_TRIM ===
// palette.secondary. That keeps the untouched-store path returning the THEMES
// entry itself, byte-for-byte as before.
function liveryFromLogo(base: StoreTheme):
Pick<StoreTheme['palette'], 'primary' | 'secondary' | 'accent'> | null {
  const spec = getActiveLogoSpec(base);
  const primary = spec.bodyColor || base.palette.primary;
  const secondary = spec.borderColor || base.palette.secondary;
  if (primary === base.palette.primary && secondary === base.palette.secondary) return null;
  return { primary, secondary, accent: secondary };
}

/**
 * The theme every surface reads, with the active brand merged over it: the
 * livery inferred from the emblem, then any palette entries an installed pack
 * declares, its brand name, and its signage set. Everything else — id, era
 * behaviour, topper style, shelving — stays the theme's, so a brand re-skins a
 * store rather than becoming a new era. An untouched store returns the THEMES
 * entry itself, exactly as before.
 *
 * The result is shared and cached: treat it as immutable (the THEMES entries
 * always were).
 */
export function getActiveTheme(): StoreTheme {
  let base = THEMES['bb-1990'];
  if (typeof localStorage !== 'undefined') {
    const saved = resolveThemeId(localStorage.getItem('bb_theme'));
    if (THEMES[saved]) base = THEMES[saved];
  }
  const pack = getBrandPack();
  const livery = liveryFromLogo(base);
  if (!pack && !livery) return base;
  const key = `${base.id}|${pack?.id ?? '-'}|${livery ? `${livery.primary}${livery.secondary}` : '-'}`;
  let merged = mergedThemeCache.get(key);
  if (!merged) {
    merged = {
      ...base,
      // Livery inferred from the emblem FIRST, then the pack's own declarations
      // over it: a brand.json that names a palette is an explicit statement and
      // outranks anything read off the board's colours (brand-drop.ts's header
      // — "a brand.json is how you say the room changes too"). Then that era's
      // deviations, since a chain that spans decades repaints, and without the
      // last spread every era would wear the one the pack was authored in.
      palette: {
        ...base.palette,
        ...(livery ?? {}),
        ...(pack?.palette ?? {}),
        ...(pack?.themes?.[base.id]?.palette ?? {}),
      },
      brand: {
        ...base.brand,
        name: pack?.name ?? base.brand.name,
        // getActiveLogoSpec applies the pack's logo partial itself (it also
        // serves callers that have no theme), so brand.logo stays the theme's
        // default here — merging it twice would just be the same result.
      },
      signageSet: pack?.signageSet ?? base.signageSet,
    };
    // The livery is now part of the key, and the brand editor rewrites bb_logo
    // live, so a colour-picker drag can mint an entry per frame. Bounded rather
    // than unbounded: the hot path is one key and this only ever trips mid-edit.
    if (mergedThemeCache.size > 64) mergedThemeCache.clear();
    mergedThemeCache.set(key, merged);
  }
  return merged;
}

// ─── Palette-derived trim shades ─────────────────────────────────────────────
// Scale an #rrggbb by `f` (clamped): tiny local color math so consumers don't
// each hand-roll darkening of the palette.
export function scaleHex(hex: string, f: number): string {
  const c = hex.replace('#', '');
  const ch = (i: number) =>
    Math.max(0, Math.min(255, Math.round(parseInt(c.substring(i, i + 2), 16) * f)));
  return `#${[ch(0), ch(2), ch(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// Near-black trim (baseboards, base kicks, sill caps) derived from the theme's
// primary, so it reads as a deep shade of the house color in every theme
// rather than one hardcoded near-black.
export function themeTrimDarkHex(theme: StoreTheme = getActiveTheme()): string {
  return scaleHex(theme.palette.primary, 0.22);
}

// Knee-wall / accent trim derived from the theme's secondary, slightly
// darkened (cream #f2e8c9 × 0.76 = the warm greige the knee walls wear since
// the 2026-08-13 de-gold; it was an antique brass off #e0a81c before).
export function themeKneeGoldHex(theme: StoreTheme = getActiveTheme()): string {
  return scaleHex(theme.palette.secondary, 0.76);
}

function hexToRgbStr(hex: string): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

export function applyThemeCssVars(theme: StoreTheme): void {
  if (typeof document === 'undefined') return;
  const style = document.documentElement.style;

  // Hex Colors
  style.setProperty('--bb-primary', theme.palette.primary);
  style.setProperty('--bb-secondary', theme.palette.secondary);
  style.setProperty('--bb-accent', theme.palette.accent);
  style.setProperty('--bb-wall', theme.palette.wall);
  style.setProperty('--bb-carpet', theme.palette.carpet);
  style.setProperty('--bb-counter-body', theme.palette.counterBody);
  style.setProperty('--bb-counter-top', theme.palette.counterTop);

  // The house KNOCKOUT — the ink the emblem letters in, and so the ink every
  // sign, topper and HUD prompt letters in. It is deliberately not
  // palette.accent: accent is a highlight/safety colour, and letting the two
  // share a token is what let the overhead blades keep the old house ink after
  // a brand change. DOM chrome reads it as var(--bb-knockout); the canvas
  // painters read LogoSpec.textColor directly. --bb-sign is the older alias for
  // the same idea (no consumers today) and now points at the same value rather
  // than drifting to accent.
  const knockout = getActiveLogoSpec(theme).textColor;
  style.setProperty('--bb-knockout', knockout);
  style.setProperty('--bb-sign', knockout);

  // RGB Colors for transparency
  style.setProperty('--bb-primary-rgb', hexToRgbStr(theme.palette.primary));
  style.setProperty('--bb-secondary-rgb', hexToRgbStr(theme.palette.secondary));
  style.setProperty('--bb-accent-rgb', hexToRgbStr(theme.palette.accent));
  style.setProperty('--bb-wall-rgb', hexToRgbStr(theme.palette.wall));
  style.setProperty('--bb-carpet-rgb', hexToRgbStr(theme.palette.carpet));
  style.setProperty('--bb-counter-body-rgb', hexToRgbStr(theme.palette.counterBody));
  style.setProperty('--bb-counter-top-rgb', hexToRgbStr(theme.palette.counterTop));

  // Brand Name / Configs
  style.setProperty('--bb-brand-name', `"${theme.brand.name}"`);
  style.setProperty('--bb-logo-kind', theme.brand.logoKind);
  style.setProperty('--bb-default-medium', theme.defaultMedium);
  style.setProperty('--bb-shelving-frame', theme.shelving.frame);
  style.setProperty('--bb-signage-set', theme.signageSet);
  if (theme.frameColorOverride) {
    style.setProperty('--bb-frame-color-override', theme.frameColorOverride);
  } else {
    style.removeProperty('--bb-frame-color-override');
  }

  // Font Stacks
  style.setProperty('--font-title', "'Bebas Neue', sans-serif");
  style.setProperty('--font-logo', "'Archivo Black', sans-serif");
  style.setProperty('--font-body', "'Outfit', sans-serif");
  style.setProperty('--font-mono', "'Share Tech Mono', monospace");
  style.setProperty('--font-display', "'Archivo Black', sans-serif");
}
