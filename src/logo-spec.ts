// LogoSpec — the data contract for the store's brand identity. The storefront
// emblem, shelf/library labels, overhead signage (and, in later phases, box
// wraps and the extruded 3D sign) are all painted from one of these specs
// instead of hardcoded drawing, so users can design their own video-store
// brand — or, with a brand pack (src/brand-pack.ts), drop in a whole traced
// identity without touching code.
//
// NO three.js imports here: this module is consumed by pure-canvas painters
// (logo-renderer.ts) and, later, by the settings-UI form, neither of which
// needs the 3D stack.
//
// The runtime dependency is one-directional — themes.ts imports the default
// specs from here to embed as `theme.brand.logo`; this file only imports the
// StoreTheme TYPE (erased at compile time), so there is no import cycle.
import type { StoreTheme } from './themes';
import { getBrandPack } from './brand-pack';

export type LogoShape =
  | 'rect'
  | 'rounded-rect'
  | 'triangle'
  | 'half-circle'   // flat side down
  | 'shield'
  | 'circle'        // always round: inscribed in the emblem box, never stretched
  | 'oval'          // ellipse filling the emblem box
  | 'path'          // brand-supplied outline: SVG path data in `pathD`
  | 'image'         // brand-supplied raster/vector emblem: `imageSrc`
  | 'none';         // no emblem: text only

export interface LogoSpec {
  version: 1;
  shape: LogoShape;
  // Procedural torn right edge (a ripped-poster look). Seeded jitter so it's
  // stable across boots. Off in every committed spec.
  tornEdge: boolean;
  tornSeed: number;
  bodyColor: string;    // emblem fill      (default Halcyon emerald)
  textColor: string;    // wordmark color   (default cream)
  borderColor: string;  // inner pinstripe + 3D extrusion sides (default brass)
  innerBorder: boolean; // the thin inset outline inside the emblem edge
  mainText: string;     // "HALCYON" — the big wordmark
  subText: string;      // "VIDEO" | "VIDEOS" | "ENTERTAINMENT" | "" — smaller, right-aligned below main
  bandText: string;     // rotated side-band text, e.g. "10,000 VIDEOS" ("" = none)
  taglineText: string;  // banner under the emblem, e.g. "OPEN LATE" ("" = none)
  fontFamily: string;   // canvas font family; default 'Archivo Black'
  fontStyle: 'normal' | 'italic' | 'bold' | 'bold italic';
  textTilt: number;     // degrees; the house emblem rakes 4
  textOverflow: boolean;// main text may spill past the emblem edges
  storefront: {
    mode: 'emblem' | 'letters'; // letters = freestanding glyph letters on the facade, no emblem
    extrudeDepth: number;       // feet; 0 = flat sign (today's look)
    // Cap height of the freestanding letters, in feet (letters mode only).
    // ~2.5 is today's modest row; crank toward 8 for the
    // "letters across the whole front" look. The row auto-shrinks only when
    // the name simply cannot fit the facade at the requested height.
    // Optional so older saved bb_logo partials (and spec literals written
    // before this field existed) stay valid — absent means
    // LETTER_HEIGHT_DEFAULT_FT.
    letterHeightFt?: number;
  };
  // ── Brand-supplied artwork (shape 'path' / 'image', or a vector wordmark) ──
  // All optional: a spec written before these existed stays valid, and the
  // committed specs set none of them. Packs are the expected author (see
  // src/brand-pack.ts), but bb_logo can carry them too.
  /**
   * shape:'path' — the emblem outline as SVG path data, in any units/viewBox.
   * Straightened, normalized to 0..1 and scaled to the emblem box, so it
   * extrudes into the 3D storefront sign and fills on 2D canvases from one
   * silhouette.
   */
  pathD?: string;
  /** Degrees `pathD` is authored leaning by; rotated upright before normalizing. */
  pathTiltDeg?: number;
  /**
   * How `pathD` meets a surface's emblem box.
   *   'stretch' (default) — fill the box on both axes. What a wide emblem
   *     designed AS a sign wants: it lands edge to edge on the board.
   *   'contain' — keep the authored aspect, centred, letterboxed in the box.
   *     What a MARK wants: a shape with a designed silhouette (a bird, a
   *     monogram) squashed into a 4:1 storefront band reads as a rendering
   *     fault, exactly as a stretched raster emblem does.
   * The simple-drop tier sets 'contain'; hand-written packs default to
   * 'stretch' so nothing about an existing pack moves.
   */
  pathFit?: 'stretch' | 'contain';
  /**
   * shape:'image' — pack-relative (or absolute) emblem art, drawn CONTAINED in
   * the emblem box (aspect kept). It replaces the filled body silhouette, not
   * the text layer: a spec whose art already carries the lettering should set
   * mainText/subText to '' rather than have them paint over it. Preloaded at
   * boot — a texture painted before it decodes would bake the empty box in
   * permanently.
   */
  imageSrc?: string;
  /**
   * The wordmark as SVG path data, painted INSTEAD of setting mainText in a
   * font — the escape hatch for a lettering design no installable face
   * reproduces, which is what a real chain's wordmark usually is.
   */
  wordmarkPathD?: string;
  /**
   * Extra vector layers painted in `pathD`'s OWN authored coordinate space —
   * i.e. the same SVG document the outline was traced out of, so a wordmark,
   * pinstripe or ® mark lands exactly where the artwork puts it relative to
   * the silhouette, instead of being re-fitted independently. This is what
   * lets a traced emblem reproduce a real lockup; `wordmarkPathD` (fitted and
   * centred on its own) is the simpler single-path case.
   *
   * Only meaningful with shape:'path'. When present these REPLACE the text
   * layer's wordmark/pinstripe drawing for the emblem (the art already carries
   * them); subText / bandText / taglineText still paint on top.
   */
  artLayers?: LogoArtLayer[];
}

/** One vector layer of a traced emblem, in `pathD`'s authored coordinates. */
export interface LogoArtLayer {
  /** SVG path data, same document/units as `pathD`. */
  d: string;
  /** Which spec color paints it. Default 'text'. */
  paint?: 'body' | 'text' | 'border';
  /**
   * A literal CSS color, overriding `paint`. Artwork with more inks than the
   * spec's three slots — which is most artwork the moment you drop a real logo
   * file in — keeps its own colors this way. The three slots stay the default
   * so a hand-written pack still re-tints with the brand.
   */
  color?: string;
  /** Stroke the path instead of filling it (pinstripes). */
  stroke?: boolean;
  /** Stroke width in AUTHORED units (scaled with the art). Default 5. */
  strokeWidth?: number;
}

// Default freestanding-letter cap height (feet) when a spec doesn't say.
export const LETTER_HEIGHT_DEFAULT_FT = 2.5;

// ─── Built-in brand colors — single source of truth ─────────────────────────
// themes.ts palettes AND the default logo specs below both point here, so the
// theme's primary/secondary and the emblem's body/brass can never drift apart.
// The constants live on THIS side of the themes.ts ↔ logo-spec.ts boundary
// because this module must stay free of runtime imports from themes.ts (see
// the module comment above).
//
// Halcyon Video — the store's own identity: a true-blue board, gold
// lettering, a gold keyline. (Owner ruling 2026-08-04: the house wears blue
// and gold; "Halcyon" is the kingfisher — blue and gold IS the bird — and the
// emblem itself joins later.) The blue/gold pair is deliberately its own:
// deeper board blue and a warmer gold than any real chain's flat scheme, and
// the marks (name, board shape, Archivo face) carry the identity.
export const HALCYON_BLUE = '#1a49c2';      // brand body; palette.primary
export const HALCYON_CREAM = '#f2e8c9';        // print stock/knockout cream (paper, not livery)
export const HALCYON_GOLD = '#e0a81c';        // keyline/trim; palette.secondary
export const HALCYON_GOLD_HI = '#ffd23f';     // bright gold; palette.accent, --bb-sign, wordmark
export const HALCYON_BLUE_LIT = '#1d50cf';  // counter top / lit blue surfaces
export const HALCYON_INK = '#1c3f9e';          // wrap/print blue ink

// Night Owl Video — the second chain, an after-hours store in purple and
// amber. Deliberately nowhere near the Halcyon family so the theme picker
// offers a real alternative rather than a shade of the same green.
export const OWL_PURPLE = '#3b1f5e';   // palette.primary
export const OWL_AMBER = '#ff9f1c';    // palette.secondary
export const OWL_PINK = '#ff5e78';     // palette.accent

// Storefront prints can run a brighter ink than the interior boards do; this
// is the hook for that. An identity passthrough today — no committed color
// wants the lift, and a user's own brand color must reach the facade exactly
// as they set it.
export function storefrontBrandGold(color: string): string {
  return color;
}

// The emblem's lettering lean, in degrees: a slight rake, not an italic
// parallelogram.
export const HALCYON_TILT_DEG = 4;

// Per-theme default specs. All four Halcyon eras wear the SAME board — the era
// difference lives in the dressing, the toppers and the medium, not in two
// greens. bodyColor/textColor mirror each theme's palette.primary/secondary so
// a palette tweak and the emblem can never drift apart.
const HALCYON_BASE: Omit<LogoSpec, 'bodyColor'> = {
  version: 1,
  shape: 'rect',
  tornEdge: false,
  tornSeed: 1985,
  textColor: HALCYON_GOLD_HI,   // gold lettering on the blue board
  borderColor: HALCYON_GOLD,   // mirrors theme.palette.secondary
  innerBorder: true,
  mainText: 'HALCYON',
  subText: 'VIDEO',
  bandText: '',
  taglineText: '',
  fontFamily: 'Archivo Black',
  fontStyle: 'normal',
  textTilt: HALCYON_TILT_DEG,
  textOverflow: false,
  storefront: { mode: 'emblem', extrudeDepth: 0, letterHeightFt: LETTER_HEIGHT_DEFAULT_FT },
};

export const DEFAULT_LOGO_SPECS: Record<string, LogoSpec> = {
  // (Keyed by the current era ids — legacy bb-90s / bb-2000s callers are
  // canonicalized before lookup, see below.)
  'bb-1990': { ...HALCYON_BASE, bodyColor: HALCYON_BLUE, storefront: { ...HALCYON_BASE.storefront } },
  'bb-1993': { ...HALCYON_BASE, bodyColor: HALCYON_BLUE, storefront: { ...HALCYON_BASE.storefront } },
  'bb-2000': { ...HALCYON_BASE, bodyColor: HALCYON_BLUE, storefront: { ...HALCYON_BASE.storefront } },
  'bb-2010': { ...HALCYON_BASE, bodyColor: HALCYON_BLUE, storefront: { ...HALCYON_BASE.storefront } },
};

// Deep-merge a partial spec over a theme default. Only `storefront` nests, so
// the "deep" part is one explicit spread; version is pinned so a future
// version-2 migration has a stable field to key on.
function mergeLogoSpec(base: LogoSpec, partial: Partial<LogoSpec>): LogoSpec {
  return {
    ...base,
    ...partial,
    version: 1,
    storefront: { ...base.storefront, ...(partial.storefront ?? {}) },
  };
}

/**
 * The spec every brand surface paints from, in increasing precedence:
 *
 *   theme default  <  installed brand pack's `logo`  <  localStorage bb_logo
 *
 * i.e. a pack supplies the identity and the user's own brand-editor edits
 * still win over it. Pass the theme when you already have it (texture painters
 * take a theme param); without one the saved bb_theme id picks the default —
 * resolved here rather than via getActiveTheme() to keep this module free of
 * runtime imports from themes.ts (which imports our default specs).
 *
 * Returns the theme's shared default object verbatim on the no-override hot
 * path — treat the result as immutable.
 */
export function getActiveLogoSpec(theme?: StoreTheme): LogoSpec {
  let base: LogoSpec | undefined = theme?.brand.logo;
  if (!base) {
    const savedTheme = typeof localStorage !== 'undefined' ? localStorage.getItem('bb_theme') : null;
    // Canonicalize legacy ids here rather than importing resolveThemeId from
    // themes.ts (that would be a runtime import cycle — themes.ts pulls its
    // default specs from this module). Keep this map in step with THEME_ALIASES.
    const legacy: Record<string, string> = {
      // feedback/039: Night Owl Video is retired outright, so both its own id
      // and its legacy alias resolve straight to the default era now — kept
      // in step with THEME_ALIASES in themes.ts.
      'bb-90s': 'bb-1990', 'bb-2000s': 'bb-2010', 'hv-90s': 'bb-1990', 'owl-90s': 'bb-1990',
    };
    const id = savedTheme ? (legacy[savedTheme] ?? savedTheme) : 'bb-1990';
    base = DEFAULT_LOGO_SPECS[id] ?? DEFAULT_LOGO_SPECS['bb-1990'];
  }
  const packLogo = getBrandPack()?.logo;
  if (packLogo) base = mergeLogoSpec(base, packLogo);
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('bb_logo') : null;
  if (!raw) return base;
  try {
    return mergeLogoSpec(base, JSON.parse(raw) as Partial<LogoSpec>);
  } catch (e) {
    console.error('Failed to parse bb_logo spec, using theme default:', e);
    return base;
  }
}
