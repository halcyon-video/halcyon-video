import type { LogoSpec } from './logo-spec';
import { getBrandPack } from './brand-pack';
import {
  DEFAULT_LOGO_SPECS,
  HALCYON_BLUE, HALCYON_GOLD, HALCYON_GOLD_HI, HALCYON_BLUE_LIT,
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
  secondary: HALCYON_GOLD,     // gold trim (knee walls derive: x0.76 -> antique gold)
  accent: HALCYON_GOLD_HI,     // bright gold: --bb-sign, safety accents
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

// Pack-merged themes, one clone per (theme id, pack id). getActiveTheme() is
// called ~100 times across the build (and inside default parameters), so the
// merge must not allocate per call; neither input can change without a reload,
// which is what makes a plain memo correct here.
const mergedThemeCache = new Map<string, StoreTheme>();

/**
 * The theme every surface reads, with the installed brand pack's identity
 * merged over it: palette entries the pack declares, its brand name, and its
 * signage set. Everything else — id, era behaviour, topper style, shelving —
 * stays the theme's, so a pack re-skins a store rather than becoming a new
 * era. With no pack this returns the THEMES entry itself, exactly as before.
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
  if (!pack) return base;
  const key = `${base.id}|${pack.id}`;
  let merged = mergedThemeCache.get(key);
  if (!merged) {
    merged = {
      ...base,
      // Pack palette, then that era's own deviations from it — a chain that
      // spans decades repaints, and without the second spread every era would
      // wear the one the pack was authored in.
      palette: { ...base.palette, ...(pack.palette ?? {}), ...(pack.themes?.[base.id]?.palette ?? {}) },
      brand: {
        ...base.brand,
        name: pack.name ?? base.brand.name,
        // getActiveLogoSpec applies the pack's logo partial itself (it also
        // serves callers that have no theme), so brand.logo stays the theme's
        // default here — merging it twice would just be the same result.
      },
      signageSet: pack.signageSet ?? base.signageSet,
    };
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
// darkened (brass #e0a81c × 0.76 = the antique brass the knee walls wear).
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
  style.setProperty('--bb-sign', theme.palette.accent);

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
