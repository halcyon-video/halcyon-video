// STORE FORMAT PRESETS — the store's *personality*, one level above a theme.
//
// A THEME (src/themes.ts) changes finishes: paint, carpet colour, topper style,
// which era's signage set hangs on the walls. Every theme lays the same store
// out the same way, because a theme cannot move a wall.
//
// A FORMAT changes the GEOMETRY RULES. It decides how wide the aisles are, how
// tall the shelving runs, how the floor plan grows as the library grows, how
// low the ceiling sits, which fixtures the format even admits. Two formats ship:
//
//   corporate    — the big chain box this app was built as. Herringbone-capable
//                  aisle fields flanking a wide central walkway, 13.5 ft ceiling,
//                  five-tier gondolas, floor displays, a wall of New Releases.
//
//   mom-and-pop  — the cramped neighbourhood store (GH #33). Straight runs only,
//                  packed at a 4 ft aisle pitch across ONE field with no central
//                  walkway; wood shelving that runs floor-to-ceiling under a
//                  9 ft ceiling; brown shag on the floor; no floor displays and
//                  no New Releases wall — the walls belong to the regular
//                  library and new releases get at most one run of their own.
//                  Behind a beaded curtain at the back is the small curtained-off
//                  section every one of these stores had.
//
// WHY THIS IS DATA AND NOT A BRANCH: the corporate spec below holds *today's
// literal constants*, so store-layout.ts derives its exported geometry from
// `activeStoreFormat()` and the default store is unchanged, value for value.
// A third format is a new entry in FORMATS, not a new `if` in the floor planner.
//
// ── WHEN THE FORMAT IS RESOLVED, AND WHY IT MATTERS ─────────────────────────
// ONCE, at module-evaluation time, from localStorage — the same moment
// store-layout.ts's own constants are computed. That is deliberate and it is
// the whole reason this module imports nothing at runtime.
//
// store-layout.ts derives module-level constants FROM the shelf-tier count
// (UNIT_SIDE_CAPACITY, UNIT_CAPACITY, SECTION_CAPACITY, TINY_LIBRARY_MOVIES),
// and a dozen modules capture those at import time. If the format could change
// after modules loaded, those constants would go stale against a live shelf
// geometry that no longer matched them — a store whose planner believes a unit
// face holds 60 cases while the unit physically has 108 slots. So switching
// format is a RELOAD (see the bb_store_format setting's applyMode), not a
// scene rebuild, and nothing in the app is allowed to mutate the active format
// in place.
//
// The harness gets this for free: harness-params.ts seeds localStorage from the
// URL inside harness-boot.ts, strictly before `import('./harness')` pulls in the
// scene graph — so `--set bb_store_format=mom-and-pop` lands before store-layout
// evaluates. Same contract as `?set=bb_brand_pack=<id>`.
import type { ArrangementId } from './store-layout.ts';

export type StoreFormatId = 'corporate' | 'mom-and-pop';

/** Ground-plan of the checkout counter this format builds (see entrance/counter.ts). */
export type CounterShape = 'shield' | 'usquare' | 'desk';

export interface StoreFormatSpec {
  id: StoreFormatId;
  /** Shown in the settings drawer. */
  name: string;

  // ── Floor plan ────────────────────────────────────────────────────────────

  /**
   * Arrangement this format allows, overriding the user's `bb_arrangement`.
   * null = the user's choice stands (corporate). Mom-and-pop forces 'straight':
   * a tilted run wastes the floor either side of it, and a cramped store has
   * no floor to waste.
   */
  forcedArrangement: ArrangementId | null;
  /**
   * Hatch the whole floor as ONE field instead of two fields flanking a central
   * walkway. This is what puts a single long run down the middle of the
   * smallest store and grows it outward run by run, rather than opening a
   * corridor down the centre of a room that is barely wider than one.
   */
  singleField: boolean;
  /** Clear central aisle between the two shelving fields (ft). Ignored when singleField. */
  centerWalkway: number;
  /** Shelf runs stay this far off the side walls (ft). */
  wallMargin: number;
  /**
   * Centre-to-centre spacing of adjacent runs within a field (ft), before the
   * arrangement's tilt. Clear aisle = this minus UNIT_DEPTH (2.16 ft), so
   * corporate's 11.0 gives an 8.8 ft chain aisle and mom-and-pop's 6.2 gives
   * 4.0 ft — tight, but still a real two-people-passing aisle and still wider
   * than the browse camera's own stand-off (see browseStandoff).
   */
  runSpacing: number;
  /** Cross-aisle gap (ft) inserted between consecutive runs in one hatched line. */
  runBreakGap: number;
  /**
   * Layout-space Z of the shelf field's front edge. LAYOUT z is compressed
   * 0.75x toward the glass (StorePlan.scaleZ), so the world front edge is
   * 15 + 0.75*(this - 15). Corporate's -14.4 puts it at world z = -7.05, well
   * behind the big shield counter. Mom-and-pop's -3.0 puts it at world z = 1.5,
   * which is 2.8 ft past the store-facing edge of its little desk (that desk
   * fronts at z = 4.3) — a cramped store cannot spend 22 ft getting to its
   * first shelf the way the chain does.
   */
  fieldZFront: number;
  /** Clear floor (ft) left between the deepest run and the back wall. */
  backAisleClearance: number;
  /** Longest continuous run (units) in the smallest store of this format. */
  baseRunUnits: number;
  /** Ceiling on that run length however big the store gets. */
  maxRunUnitsCap: number;
  /** One unit is added to the run length per this many units of total demand. */
  runGrowthPerUnits: number;
  /** Hard cap on store width (ft) — past this the store only deepens. */
  widthCap: number;
  /**
   * Grow the store wider while the estimated depth exceeds this fraction of the
   * width. Corporate's 0.9 keeps the big box roughly square; mom-and-pop's 1.8
   * lets it run deep and narrow, which is the shape of a real strip-mall unit —
   * it only adds aisles across once it is already nearly twice as deep as wide.
   */
  depthToWidthRatio: number;

  // ── Storefront envelope ───────────────────────────────────────────────────

  /** Whole 4-ft window panes across the front of the smallest store of this format. */
  frontPanesBaseline: number;
  /** Whole 4-ft panes in each side wall's window ribbon (also sets baseline depth). */
  sidePanesBaseline: number;
  /** Clear inner width (ft) of the entrance vestibule chamber, door leaves excluded. */
  vestibuleInnerWidth: number;
  /** Width (ft) of one entrance door leaf. */
  doorWidth: number;
  /** Ground-plan of the checkout counter (see entrance/counter.ts). */
  counterShape: CounterShape;
  /**
   * How the entrance leaves are BUILT (StorefrontSpec.doorStyle): 'single' is
   * the lighter, thinner-framed single-glazed door a small shop hangs, against
   * the chain's heavy pair.
   *
   * Note what this does NOT do: the vestibule still builds two leaves side by
   * side either way (entrance/doors.ts reads doorStyle only for the leaf's own
   * frame/glass thickness). A genuinely single-leaf entrance is a change to the
   * vestibule itself, not to this field.
   */
  doorStyle: 'double-swing' | 'sliding' | 'single';

  // ── Shelving ──────────────────────────────────────────────────────────────

  /** Y of each shelf tier on a freestanding unit (ft). Tier COUNT drives every capacity constant. */
  aisleShelfHeights: number[];
  /**
   * How many signboard SECTIONS wide one freestanding unit is (a section is
   * SECTION_COLS = 6 columns, one overhead sign).
   *
   * This is the format's stocking GRANULARITY, and it has to be read together
   * with the tier count. The floor planner allocates a library whole units, so
   * one unit's capacity is the smallest amount of shelf a library can be given:
   * the chain's 2 sections x 5 tiers x 2 faces is 120 cases. Mom-and-pop
   * shelving is nine tiers deep, so at 2 sections a single unit would hold 216
   * — and a 150-title library would be handed one unit, fill the front face and
   * leave the whole back face bare board. One section keeps a unit at 108, in
   * the same range as the chain's, so a small library still reads as a stocked
   * store rather than as empty fixtures. It also gives every unit its own
   * overhead sign, which is what a small shop's shelving actually looked like.
   */
  unitSections: number;
  /** Where the unit frame crowns (ft) — dividers, spine, end caps, toppers. */
  unitFrameHeight: number;
  /**
   * Whether the gondola tapers front-to-back with height (UNIT_TOP_DEPTH at
   * UNIT_TAPER_HEIGHT). A chain gondola does. A mom-and-pop's shelving is a
   * plain full-depth wooden case, and a taper carried up to 7 ft would leave
   * the top tier too shallow to stand a tape on.
   */
  unitTaper: boolean;
  /**
   * How far the browse camera backs off the shelf FACE (ft; the unit's own
   * half-depth is added on top). Must stay comfortably inside the aisle or the
   * camera ends up behind the run opposite: corporate 3.8 inside an 8.8 ft
   * aisle, mom-and-pop 2.6 inside a 4.0 ft one (1.4 ft of clearance left).
   */
  browseStandoff: number;
  /**
   * What the shelving is MADE of. 'laminate' is the chain's warm off-white
   * melamine over a painted steel frame; 'wood' is stained timber, boards and
   * end panels alike — the fixture a small shop bought once and kept.
   */
  shelfFinish: 'laminate' | 'wood';
  /**
   * Timber colour for the shelf boards and carcass, when shelfFinish is 'wood'.
   * null on a laminate format (the melamine tint is the shelf material's own).
   */
  shelfWoodHex: string | null;
  /**
   * Colour of the run's END PANELS and sign sides. A chain paints these in the
   * house colour and the shell takes `theme.palette.primary` for them (signage
   * rule 2: never hardcode a house colour into a fixture). A wood format has no
   * painted panel to put a house colour ON, so it names its own darker stain
   * here — as format DATA, for the same reason the palette is theme data.
   * null keeps the theme's house colour.
   */
  shelfEndPanelHex: string | null;

  // ── Shell ─────────────────────────────────────────────────────────────────

  /** Ceiling height (ft) before the bb_ceiling 'high' override. */
  ceilingY: number;
  /** Whether this format's back corner steps forward to carry New Releases. */
  steppedCorner: boolean;
  /**
   * Multiplier on the spacing of the ceiling KEY LIGHTS (store-shell.ts's
   * troffer key grid, which is otherwise derived from the ceiling height).
   *
   * The derivation assumes an OPEN floor, where a cone spreading from the
   * ceiling reaches the carpet unobstructed. It does not survive shelving that
   * runs floor-to-ceiling: a mom-and-pop's runs stop a foot under the lid, so
   * each 4 ft aisle is a canyon that only receives light from the fixtures
   * more or less directly above it, and at the chain's spacing most aisles get
   * none. Below 1 the grid tightens — more fixtures, closer together, which is
   * also how these rooms were really lit (strip lights ALONG the aisles, not a
   * sparse grid of troffers over an open sales floor).
   */
  keyLightSpacingScale: number;
  /**
   * Multiplier on each key light's intensity, to go with the spacing above:
   * tightening the grid without this would multiply the room's total light by
   * the number of fixtures added.
   */
  keyLightIntensityScale: number;
  /** Floor covering. 'shag' is the deep brown pile of a 70s/80s neighbourhood store. */
  carpet: 'loop-pile' | 'shag';
  /**
   * Colour the floor is dyed, when the FORMAT owns that choice rather than the
   * theme. null defers to `theme.palette.carpet`, which is what the corporate
   * box has always done — a chain re-carpets to match its livery. A mom-and-pop
   * does not: the brown shag was there when they signed the lease, and it is
   * brown whichever era's signage is hanging up.
   */
  carpetHex: string | null;
  /** Wall finish. 'wood-panel' is tongue-and-groove veneer over the whole sales floor. */
  wallFinish: 'drywall' | 'wood-panel';
  /** Wall colour when the format owns it; null defers to `theme.palette.wall`. See carpetHex. */
  wallHex: string | null;

  // ── What this format admits ───────────────────────────────────────────────

  /**
   * Floor displays: promo stands, the bargain bin, the drape table, the mirror
   * column. A cramped store has no open floor to stand them on, and the owner's
   * spec bans them outright.
   */
  floorDisplays: boolean;
  /**
   * The full New Releases ribbon (back wall + left wall). Off for mom-and-pop:
   * "no NEW RELEASES walls — the walls belong to the regular library; at most
   * one dedicated new-releases shelf" (owner spec, GH #33).
   */
  newReleasesWall: boolean;
  /** How many wall runs of New Releases this format builds at most. */
  newReleasesRuns: number;
  /** Whether a clerk works this floor. Mom-and-pop: "No clerk for now." */
  clerk: boolean;
  /**
   * Ceiling-hung CRT sets over the sales floor (src/ambient-tvs.ts).
   *
   * A matter of headroom, not taste. The sets hang on a 2 ft pole with a 2.2 ft
   * body, so their glass sits about 3.3 ft below the ceiling: overhead in a
   * 13.5 ft chain store, and at standing eye height in a 9 ft one — where the
   * shelving also reaches to within a foot of the lid, leaving nowhere over the
   * floor to hang anything at all. A store like that put its television on a
   * bracket behind the counter, and this format does the same thing the app
   * already does when a build has no ambient sets: ▲ from the entrance falls
   * back to the over-the-top shelf wrap (see store-tv-peek.ts).
   */
  ceilingTvs: boolean;
  /** The curtained-off back section behind a beaded curtain. */
  curtainedSection: boolean;
}

// ── The presets ─────────────────────────────────────────────────────────────

/**
 * The chain box. EVERY VALUE HERE IS THE LITERAL THIS APP ALREADY USED — this
 * spec exists so store-layout.ts can derive its constants from the active
 * format without the default store changing by a single foot. Do not "tidy"
 * these numbers; each one has its own derivation comment at its old home in
 * store-layout.ts.
 */
const CORPORATE: StoreFormatSpec = {
  id: 'corporate',
  name: 'Corporate chain',

  forcedArrangement: null,
  singleField: false,
  centerWalkway: 16.0,
  wallMargin: 7.5,
  runSpacing: 11.0,
  runBreakGap: 3.0,
  fieldZFront: -14.4,
  backAisleClearance: 8.0,
  baseRunUnits: 4,
  maxRunUnitsCap: 6,
  runGrowthPerUnits: 16,
  widthCap: 110.0,
  depthToWidthRatio: 0.9,

  frontPanesBaseline: 16,
  sidePanesBaseline: 6,
  vestibuleInnerWidth: 9.0,
  doorWidth: 3.2,
  counterShape: 'shield',
  doorStyle: 'double-swing',

  aisleShelfHeights: [0.5, 1.333, 2.167, 3.0, 3.833],
  unitSections: 2,
  unitFrameHeight: 4.6,
  unitTaper: true,
  browseStandoff: 3.8,
  shelfFinish: 'laminate',
  shelfWoodHex: null,
  shelfEndPanelHex: null,

  ceilingY: 13.5,
  steppedCorner: true,
  keyLightSpacingScale: 1.0,
  keyLightIntensityScale: 1.0,
  carpet: 'loop-pile',
  carpetHex: null,
  wallFinish: 'drywall',
  wallHex: null,

  floorDisplays: true,
  newReleasesWall: true,
  newReleasesRuns: 3,
  clerk: true,
  ceilingTvs: true,
  curtainedSection: false,
};

/**
 * The neighbourhood store (GH #33). Everything is compressed.
 *
 * The shelf ladder is the one number worth reading twice: NINE tiers at the
 * 10.5 in wall-shelf pitch, from 0.42 ft to 7.42 ft. A case leaning back on the
 * top board tops out at 7.42 + CASE_HEIGHT·cos(LEAN) ≈ 8.08 ft, the frame
 * crowns at 8.2, and the ceiling is at 9.0 — so the runs genuinely reach the
 * ceiling with a hand's width of air over them, which is what "floor-to-ceiling"
 * means in a room this short. Nine tiers instead of five is also why one unit
 * face holds 108 cases here against the chain's 60: a cramped store carries its
 * stock UP, not out.
 */
const MOM_AND_POP: StoreFormatSpec = {
  id: 'mom-and-pop',
  name: 'Mom & pop',

  forcedArrangement: 'straight',
  singleField: true,
  centerWalkway: 0,
  // 2.6 ft off the side walls: enough to walk the end of a run and turn into
  // the next aisle, and nothing more. The chain leaves 7.5.
  wallMargin: 2.6,
  // 6.2 − UNIT_DEPTH(2.16) = 4.04 ft of clear aisle.
  runSpacing: 6.2,
  // Half the chain's cross-aisle break: 3 ft of dead floor between run chunks
  // is a luxury this store doesn't have.
  runBreakGap: 1.5,
  fieldZFront: -3.0,
  // 8.0, not the 3 ft a cramped aisle would otherwise want, because THE BACK
  // ROOM stands in this strip: the curtained alcove is 5 ft deep against the
  // back wall (fixtures/curtained-alcove.ts), leaving ~3 ft of cross-aisle in
  // front of its curtain. The two numbers are read together — shrink this and
  // the shelf runs walk into the alcove. Every other format leaves its back
  // strip as plain circulation.
  backAisleClearance: 8.0,
  // Long runs are the POINT here ("one long shelf run down the middle"), so the
  // run length starts where the chain's tops out and climbs from there.
  baseRunUnits: 6,
  maxRunUnitsCap: 10,
  runGrowthPerUnits: 20,
  // A mom-and-pop never becomes a warehouse. Past 44 ft it only gets deeper —
  // which is exactly how a strip-mall unit grows.
  widthCap: 44.0,
  depthToWidthRatio: 1.8,

  frontPanesBaseline: 2,
  sidePanesBaseline: 2,
  vestibuleInnerWidth: 4.6,
  doorWidth: 3.0,
  counterShape: 'desk',
  doorStyle: 'single',

  aisleShelfHeights: [0.42, 1.295, 2.17, 3.045, 3.92, 4.795, 5.67, 6.545, 7.42],
  unitSections: 1,
  unitFrameHeight: 8.2,
  unitTaper: false,
  browseStandoff: 2.6,
  shelfFinish: 'wood',
  // Golden-oak veneer for the boards and carcass; a darker walnut stain on the
  // end panels, so a run still terminates in something that reads as a deliberate
  // face rather than dissolving into the panelled wall behind it.
  shelfWoodHex: '#b0793f',
  shelfEndPanelHex: '#6f4322',

  ceilingY: 9.0,
  steppedCorner: false,
  // ~3x the fixture count at a bit under half the output each: net a little
  // more light than the chain grid, spread far more evenly, because in here
  // "evenly" is the whole problem. See keyLightSpacingScale.
  keyLightSpacingScale: 0.55,
  keyLightIntensityScale: 0.45,
  carpet: 'shag',
  // Dark chocolate shag. Deliberately deeper than any theme carpet — the
  // corporate palette's dusty blue at this saturation would read as "chain
  // store with the lights off", not as a different kind of shop.
  carpetHex: '#5c3a24',
  wallFinish: 'wood-panel',
  // Mid-brown stained veneer, a little warmer and lighter than the floor so the
  // room has a horizon: a shag-brown wall over a shag-brown floor is a cave.
  wallHex: '#8a5d38',

  floorDisplays: false,
  newReleasesWall: false,
  newReleasesRuns: 1,
  clerk: false,
  ceilingTvs: false,
  curtainedSection: true,
};

export const STORE_FORMATS: Record<StoreFormatId, StoreFormatSpec> = {
  'corporate': CORPORATE,
  'mom-and-pop': MOM_AND_POP,
};

export const DEFAULT_STORE_FORMAT: StoreFormatId = 'corporate';

/** localStorage key the format is read from. */
export const STORE_FORMAT_KEY = 'bb_store_format';

/**
 * Resolve a saved/URL value to a real format id. An unknown or absent value —
 * including every store built before this module existed — resolves to
 * 'corporate', so nothing that already works changes shape.
 */
export function resolveStoreFormatId(value: unknown): StoreFormatId {
  return typeof value === 'string' && value in STORE_FORMATS
    ? (value as StoreFormatId)
    : DEFAULT_STORE_FORMAT;
}

// Resolved ONCE, at module evaluation — see the header. `typeof localStorage`
// guard: this module is pulled into plain-node unit tests through
// store-layout.ts, where there is no DOM.
const ACTIVE: StoreFormatSpec = STORE_FORMATS[resolveStoreFormatId(
  typeof localStorage !== 'undefined' ? localStorage.getItem(STORE_FORMAT_KEY) : null
)];

/**
 * The format this page load is building. Stable for the lifetime of the module
 * graph — see the header for why that is load-bearing rather than a limitation.
 */
export function activeStoreFormat(): StoreFormatSpec {
  return ACTIVE;
}

/** Convenience predicate for the handful of places that only care about the small format. */
export function isMomAndPop(): boolean {
  return ACTIVE.id === 'mom-and-pop';
}
