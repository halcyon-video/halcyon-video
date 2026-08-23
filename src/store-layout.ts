// Store floor-plan constants, shared layout types, and the pure catalog helpers
// that decide how a library's titles are ordered and categorized on the shelves.
// Everything in this module is stateless: no scene, no renderer, no DOM.
// Type-only imports keep this module free of runtime dependencies, so the
// pure shelf-order logic is unit-testable under plain `node --test` with type
// stripping (see tests/shelf-order.test.ts).
import type * as THREE from 'three';
import type { Movie } from './jellyfin';
// The active STORE FORMAT preset (src/store-format.ts). Resolved once, at
// module evaluation, from localStorage — which is why every constant below can
// derive from it and still be a plain `const`. See that module's header for
// why switching format is a reload rather than a scene rebuild.
import { activeStoreFormat, type CounterShape } from './store-format.ts';

const FORMAT = activeStoreFormat();

// Layout settings (standardized to feet: 1 unit = 1 foot)
// THE canonical store-geometry facts (CLAUDE.md documents both for the shot
// harness's --walk coordinate space): world x of the store centreline, and
// world z of the front glass plane. Every module that builds shell/facade/
// fixture/camera geometry against these two facts should import them here
// rather than re-declaring the bare literals — that drift trap is exactly
// what unified PARKING_STALLS in exterior-environment.ts.
export const STORE_CENTER_X = 11.0;
export const FRONT_GLASS_Z = 15.0;
// Centre-to-centre of adjacent shelf runs WITHIN one field, in feet — the
// hatching pitch fillField() steps by (narrowed from 13.0). FORMAT-DRIVEN:
// 11.0 on the corporate box, 6.2 in a mom-and-pop, where the whole point is
// that the aisles are tight. On the corporate store this is numerically the
// same as STORE_CENTER_X but a DIFFERENT fact — don't conflate the two.
export const LIBRARY_X_SPACING = FORMAT.runSpacing;
// Layout-space Z of the front edge of the island field. LAYOUT z is compressed
// 0.75x toward the glass (StorePlan.scaleZ), so the world front edge is
// scaleZ(FIELD_Z_FRONT) and each layout-foot here only moves the world edge
// 0.75 ft. backWallZ derives from here, so the store just deepens to fit.
// FORMAT-DRIVEN: the corporate -14.4 (world -7.05) was chosen so the game
// department's field-side walkway measures >=6 ft in the WORST arrangement
// (herringbone island corners poke ~0.8 ft past the world edge; straight gets
// ~6.9) — measured, not estimated: the gamedump harness state logs it on
// window.__gameDeptClear. A mom-and-pop store is only ~20 ft deep in total and
// has no game department, so it starts its shelves at world -3.0 instead,
// right behind its little desk.
export const FIELD_Z_FRONT = FORMAT.fieldZFront;
// A 12-col island is ~7.4ft long; tilted ~40deg its X-footprint is ~6ft, so islands on
// the same side need ~11ft of centre spacing to leave a real gap and not overlap.
// Clear central aisle straddling the store centreline (X=11). Columns left of centre
// are pushed left and columns right of centre (including a dead-centre column) are
// pushed right by half this, opening a walkway between the left and right fields.
// Clear central aisle straddling the store centreline. FORMAT-DRIVEN: the
// corporate box widened this twice (12.0 -> 16.0) for a real open floor area
// down the store centre; a mom-and-pop has no central walkway at all (its
// format hatches ONE field across the whole floor — see StoreFormatSpec.singleField),
// so it reads 0 and nothing straddles anything.
export const CENTER_WALKWAY = FORMAT.centerWalkway;
// Deepest (largest) Z a back-wall-relative floor fixture may reach: keeps
// displays/bins/racks behind the checkout zone (shield apex z=-5.5 plus a
// floor-display clearance + half-footprint margin) even when a tiny store's
// back wall sits shallow and `backWallZ + zOffset` would land them inside
// the counter. Fixtures with relativeToBackWall clamp against this.
export const FLOOR_FIXTURE_MAX_Z = -10.0;
// Ceiling height in feet — this FORMAT's standard ceiling (the corporate box
// raised it from 12.0 to 13.5; a mom-and-pop sits at 9.0, everything a bit
// compressed). Read as "the height this store normally has" by the handful of
// modules that scale against it (outdoor-lighting's window-pool height, the
// vestibule wall cap, the asset viewer's stub context); the LIVE height, after
// the bb_ceiling override, is StoreShellSpec.ceilingY / scene.ceilingY.
export const CEILING_Y = FORMAT.ceilingY;
export const HIGH_CEILING_Y = 18.0; // Optional raised-ceiling variant (T07)

// ─── Store shell options (T07) ──────────────────────────────────────────────
// The room shell — ceiling height, the stepped back corner, and any decorated
// wall zones — expressed as a plain data object so it can be swapped without
// touching geometry code. Read from localStorage so the settings drawer can
// drive a scene rebuild. The DEFAULT spec (no keys set) reproduces the original
// store exactly.
export interface StoreShellSpec {
  // Live ceiling height; replaces direct CEILING_Y reads in the shell/fixtures.
  ceilingY: number;
  // The back corner that "steps into" the store (an L-shaped forward notch that
  // carries the New Releases wall). null would be a flat back wall, but the
  // stock New-Releases runs assume the step, so the reader always supplies one.
  steppedCorner: null | { corner: 'back-left' | 'back-right'; w: number; d: number };
  // Actor-portrait wall + floating film-strip ribbon (pin 052 rebuild, see
  // wall-decor.ts). Just an on/off flag: the module computes every position
  // itself from real wall geometry (door/window/cornice exclusion zones) and
  // the library's actual most-featured actors, so there's nothing to author
  // here. Only meaningful on the high-ceiling variant — wall-decor.ts is the
  // single source of truth for that gate too.
  wallDecorEnabled: boolean;
}

// Read the active shell spec from localStorage. Absent keys fall back to values
// that render identically to the pre-T07 store.
export function getStoreShellSpec(): StoreShellSpec {
  const ls = typeof localStorage !== 'undefined' ? localStorage : null;

  // The format sets the room's normal height (CEILING_Y); 'high' is still a
  // user override on top of it, so a mom-and-pop can be given a raised ceiling
  // deliberately even though its own default is a low one.
  const ceilingY = ls?.getItem('bb_ceiling') === 'high' ? HIGH_CEILING_Y : CEILING_Y;

  // Stepped back-right corner. The store has always had this forward step; the
  // option only varies its footprint. Depth is kept below the 8 ft back-wall
  // shelf margin (see StorePlan.plan) so no freestanding island can reach into
  // the notch — shelves never intersect it by construction.
  // A format without the step has a flat back wall, full stop: the step exists
  // to carry the New Releases wall, and a format with no New Releases wall
  // (mom-and-pop) would just be notching its back corner for nothing — in a
  // room this small the notch is a meaningful bite out of the sales floor.
  let steppedCorner: StoreShellSpec['steppedCorner'] = FORMAT.steppedCorner
    ? { corner: 'back-right', w: 7.2, d: 7.0 }
    : null;
  if (FORMAT.steppedCorner) {
    switch (ls?.getItem('bb_corner')) {
      case 'wide': steppedCorner = { corner: 'back-right', w: 11.0, d: 7.0 }; break;
      case 'shallow': steppedCorner = { corner: 'back-right', w: 5.0, d: 4.0 }; break;
      case 'none': steppedCorner = null; break;
    }
  }

  // Wall displays default OFF so the default store is identical to today.
  const wallDecorEnabled = ls?.getItem('bb_walldecor') === '1';

  return { ceilingY, steppedCorner, wallDecorEnabled };
}

// ─── Storefront options (T05) ───────────────────────────────────────────────
// The front wall — doors, storefront window bays, and the checkout counter —
// expressed as a single data object so `EntranceCheckout` (src/entrance/) and
// the shell code in three-scene.ts (which builds the brick facade and the
// storefront window glazing) both read the same numbers instead of each
// hardcoding its own copy. Read from localStorage (bb_storefront preset id)
// so the settings drawer can drive a scene rebuild. The DEFAULT spec (no key
// set) reproduces the original storefront exactly.
export interface StorefrontSpec {
  doorStyle: 'double-swing' | 'sliding' | 'single';
  doorWidth: number;
  windowBays: { width: number; hasCenterMullion: boolean }[]; // left -> right
  frameColor: string;        // '#111' today; must support gray '#888'
  counterStyle: 'laminate-90s' | 'rounded-2000s';
  counterTop: 'white' | 'woodgrain' | 'speckled';
  // Ground-plan of the checkout counter: the classic 'shield' pentagon, or a
  // 'usquare' half-square — three straight sides with square corners, open
  // toward the vestibule — of roughly the same overall size. Unlike
  // counterStyle/counterTop (materials/bevels only), this changes the
  // FOOTPRINT, so counterStructureFootprints() in store-fixtures-config.ts
  // must stay in sync with counter.ts for both shapes.
  counterShape: CounterShape;
}

// Width of one entrance door leaf (ft). FORMAT-DRIVEN — a mom-and-pop hangs a
// single 3.0 ft leaf where the chain hangs a 3.2 ft pair.
const DEFAULT_DOOR_WIDTH = FORMAT.doorWidth;
// EXACT pane width of every storefront pane, front and side walls alike (ft).
// User direction: every pane is 4.0 ft wide, PERIOD — a bigger store never
// stretches its panes, it adds WHOLE panes and leaves any leftover run as
// solid wall. (This replaced the old 6.0 ft "target" width that divided the
// wall evenly, which drifted pane widths with storeWidth.) Sharing one
// constant keeps every wall's pane rhythm identical (#136).
export const WINDOW_BAY_TARGET_WIDTH = 4.0;

// Baseline pane counts (the small store, before stock forces an expansion):
// SIXTEEN 4-ft panes across the front (EIGHT each side of the entrance) and
// SIX 4-ft panes in each side wall's window ribbon. Bigger stores add whole
// panes; these counts size the baseline shell (see baselineStorefrontWidth /
// baselineStoreDepth below).
export const FRONT_PANES_BASELINE = FORMAT.frontPanesBaseline;
export const SIDE_PANES_BASELINE = FORMAT.sidePanesBaseline;

// Solid wall margin (ft) between each end of the front window row and the
// store corner — the glazing must NOT run wall-to-wall (user direction: ~2 ft
// of pure flat wall at every glazed corner, no protruding pier). The side
// ribbons carry the same margin via SIDE_RIBBON_FRONT_Z (storefront-facade.ts).
// This is the MINIMUM margin: whole-pane quantization can leave a wider strip
// of solid wall at the corners (panes are never stretched to fill it).
export const FRONT_WINDOW_CORNER_MARGIN = 2.25;

// Width of the narrow sidelight pane flanking each entrance door leaf (ft) —
// the reference photo's recess composition is sidelight | door | door |
// sidelight, the two leaves adjacent at the centreline. Shared by the
// vestibule front-wall build (src/entrance/index.ts) and the exterior
// facade's recess opening (entranceOpeningHalfWidth below).
export const ENTRANCE_SIDELIGHT_WIDTH = 2.0;

// Half-width of the glazed entry composition (door pair + sidelights) plus a
// small reveal — the exterior facade sizes its recessed entry-bay opening off
// this so the brick jamb pillars frame exactly the doors + sidelights.
export function entranceOpeningHalfWidth(spec: Pick<StorefrontSpec, 'doorWidth'>): number {
  return spec.doorWidth + ENTRANCE_SIDELIGHT_WIDTH + 0.35;
}

// Baseline (small-store) front-wall width, sized by the window spec: exactly
// FRONT_PANES_BASELINE whole panes + the vestibule + the two corner margins.
// This replaces the old fixed 90-ft facade floor;
// stock overflow still grows the store wider (see StorePlan.computeDimensions).
export function baselineStorefrontWidth(doorWidth = DEFAULT_DOOR_WIDTH): number {
  return FRONT_PANES_BASELINE * WINDOW_BAY_TARGET_WIDTH
    + 2 * vestibuleHalfWidth({ doorWidth })
    + 2 * FRONT_WINDOW_CORNER_MARGIN;
}

// Baseline (small-store) depth, front glass to back wall. Depth rule (user
// direction): "the store is twice as deep as the side windows extend; the
// side windows end half way down the store" — so depth = 2 × (front corner
// margin + the six-pane baseline ribbon). 2 × (2.25 + 24) = 52.5 ft.
export function baselineStoreDepth(): number {
  return 2 * (FRONT_WINDOW_CORNER_MARGIN + SIDE_PANES_BASELINE * WINDOW_BAY_TARGET_WIDTH);
}

// Fractions along the wall (0 = left edge, 1 = right edge) that get a
// suspended poster, matching the spread the storefront's original fixed
// 10-bay layout used (bays 0, 2, 7, 9). Exposed so three-scene.ts's window
// poster placement and this module's own mullion suppression (below) agree
// on exactly the same bays no matter how many bays a given wall resolves to.
const POSTER_BAY_FRACTIONS = [0.0, 0.2, 0.7, 0.9];
export function posterBayIndices(bayCount: number): number[] {
  if (bayCount <= 0) return [];
  const idxs = POSTER_BAY_FRACTIONS.map((f) => Math.min(bayCount - 1, Math.round(f * bayCount)));
  return Array.from(new Set(idxs));
}

// Whole-pane bay layout: every pane is EXACTLY WINDOW_BAY_TARGET_WIDTH ft
// wide. The panes split into two equal wings flanking the entrance vestibule
// and sit flush against it; each wing holds as many whole panes as its run
// (corner margin to vestibule edge) allows, and the leftover stays solid
// wall at the corner — a wider store gains panes, it never stretches them.
// The baseline storefront width (baselineStorefrontWidth) resolves to exactly
// FRONT_PANES_BASELINE/2 panes per wing.
function defaultWindowBays(storeWidth: number, doorWidth: number, hasCenterMullion = false): StorefrontSpec['windowBays'] {
  const wingRun = storeWidth / 2 - FRONT_WINDOW_CORNER_MARGIN - vestibuleHalfWidth({ doorWidth });
  const perWing = Math.max(1, Math.floor(wingRun / WINDOW_BAY_TARGET_WIDTH));
  const count = perWing * 2;
  // Bays that will carry a suspended poster stay a single uninterrupted pane
  // even when the rest of the storefront carries a center mullion — splitting
  // the one pane used for signage put the mullion directly behind the poster,
  // which posterBayIndices()'s callers then centered the poster ON (#135).
  const posterBays = hasCenterMullion ? new Set(posterBayIndices(count)) : null;
  return Array.from({ length: count }, (_, i) => ({
    width: WINDOW_BAY_TARGET_WIDTH,
    hasCenterMullion: hasCenterMullion && !posterBays!.has(i),
  }));
}

// Read the active storefront spec from localStorage. `storeWidth` is needed
// to size the (equal-width, by default) window bays in feet. Absent/unknown
// `bb_storefront` values fall back to the pre-T05 storefront look.
export function getStorefrontSpec(storeWidth: number): StorefrontSpec {
  const ls = typeof localStorage !== 'undefined' ? localStorage : null;
  const preset = ls?.getItem('bb_storefront') ?? 'standard';

  if (preset === 'sliding-gray') {
    return {
      doorStyle: 'sliding',
      doorWidth: DEFAULT_DOOR_WIDTH,
      // Light-silver frame, but FULL-WIDTH panes (#4). This preset used to
      // pass hasCenterMullion, which halves every 4 ft bay into a pair of 2 ft
      // panes — from the lot the wing read as a picket fence of posts rather
      // than a storefront. The era it dresses is the one that could finally
      // hang big glass, so the mullion is the wrong detail here even though
      // the silver frame is the right one; the split survives in the spec for
      // any preset that genuinely wants a divided light.
      windowBays: defaultWindowBays(storeWidth, DEFAULT_DOOR_WIDTH),
      frameColor: '#c9ced4',
      counterStyle: 'laminate-90s',
      counterTop: 'white',
      counterShape: 'shield',
    };
  }
  if (preset === 'rounded-counter') {
    return {
      doorStyle: 'single',
      doorWidth: DEFAULT_DOOR_WIDTH,
      windowBays: defaultWindowBays(storeWidth, DEFAULT_DOOR_WIDTH),
      frameColor: '#111111',
      counterStyle: 'rounded-2000s',
      counterTop: 'speckled',
      counterShape: 'shield',
    };
  }
  if (preset === 'usquare-counter') {
    return {
      doorStyle: 'double-swing',
      doorWidth: DEFAULT_DOOR_WIDTH,
      windowBays: defaultWindowBays(storeWidth, DEFAULT_DOOR_WIDTH),
      frameColor: '#111111',
      counterStyle: 'laminate-90s',
      counterTop: 'white',
      counterShape: 'usquare',
    };
  }
  // The unnamed 'standard' storefront IS the active format's own storefront:
  // door count, counter ground-plan and counter top all come from the preset,
  // so a mom-and-pop boots with a single leaf and a little wooden desk without
  // the user having to pick a matching bb_storefront value. The named presets
  // above stay exactly as authored — choosing one is choosing that storefront.
  return {
    doorStyle: FORMAT.doorStyle,
    doorWidth: DEFAULT_DOOR_WIDTH,
    windowBays: defaultWindowBays(storeWidth, DEFAULT_DOOR_WIDTH),
    frameColor: '#111111',
    counterStyle: 'laminate-90s',
    counterTop: FORMAT.counterShape === 'desk' ? 'woodgrain' : 'white',
    counterShape: FORMAT.counterShape,
  };
}

// Half-width of the vestibule footprint (see src/entrance/index.ts), in feet
// from the store centreline. This is the single source of truth for that
// number — three-scene.ts's storefront knee-wall gap and the entrance
// module's own footprint both call this instead of each hardcoding
// `(9.0 + 2 * 3.2) / 2 + 0.2`.
export function vestibuleHalfWidth(spec: Pick<StorefrontSpec, 'doorWidth'>): number {
  return (FORMAT.vestibuleInnerWidth + 2 * spec.doorWidth) / 2 + 0.2;
}

export const BROWSE_WINDOW_SIZE = 8; // Number of columns visible at once in browse mode
// Shelf pitch is MEASURED, not aesthetic: every era of reference footage
// (1989-2001 video corpus, FIXTURE-DIFF.md) packs tiers at 1.15-1.38x case
// height — the old 14.4 in pitch (1.8x) read airy and fake. Owner approved
// the tightening 2026-07-30. Aisle: 5 @ 10 in, first deck 6 in. Wall: 8 @
// 10.5 in, bottom deck ~5 in off the carpet like the footage shows.
// Y coordinates of each shelf tier on a freestanding unit. FORMAT-DRIVEN, and
// the TIER COUNT is load-bearing: UNIT_SIDE_CAPACITY, UNIT_CAPACITY,
// SECTION_CAPACITY, TINY_LIBRARY_MOVIES and sideEntrySlot() all derive from
// `.length`, which is exactly why the format is resolved before this module
// evaluates and can never change afterwards (see store-format.ts's header).
// Corporate: 5 tiers @ 10 in, first deck 6 in. Mom-and-pop: 9 tiers @ 10.5 in
// reaching 7.42 ft — floor-to-ceiling under its 9 ft lid.
export const AISLE_SHELF_HEIGHTS = FORMAT.aisleShelfHeights;
export const WALL_SHELF_HEIGHTS = [0.42, 1.295, 2.17, 3.045, 3.92, 4.795, 5.67, 6.545]; // Y coordinates for New Releases wall shelves (floor-to-high coverage)
export const BOX_SPACING = 0.58; // Space between boxes on a shelf in feet
export const LEAN_ANGLE = -10 * Math.PI / 180; // 10 degrees in radians (0.1745) leaning backward
export const STAGGER_OFFSET = -0.04; // Offset in feet — the rental copy peeks out on LEFT (-X) of the movie cover
// A "section" is one signboard/divider bay -- 6 columns wide. Freestanding units
// are a fixed two sections wide so every island reads the same regardless of how
// many movies its library holds (short libraries just leave the tail slots empty).
export const SECTION_COLS = 6;
// FORMAT-DRIVEN (see StoreFormatSpec.unitSections): the chain's unit is two
// signboard sections wide, a mom-and-pop's is one. This is the granularity the
// floor planner allocates shelving in, so it is read together with the tier
// count — the two together decide the smallest amount of shelf a library can be
// given, and a unit that holds far more than a small library has is a unit with
// a bare face on it.
export const UNIT_SECTIONS = FORMAT.unitSections;
export const MAX_SHELF_COLS = SECTION_COLS * UNIT_SECTIONS; // 12 on the corporate box
export const UNIT_DEPTH = 2.16; // Double-sided freestanding depth (X extent when axis-aligned), in feet.
export const UNIT_TOP_DEPTH = 1.26; // Double-sided freestanding depth at the taper reference height, in feet.

// The height (ft) at which the depth taper reaches UNIT_TOP_DEPTH. This is the
// taper's REFERENCE, not where the frame stops — see UNIT_FRAME_HEIGHT. It is
// deliberately still 5.1, the old frame height, so trimming the crown changed
// no shelf's depth and no fixture that solves "how deep is the unit at y".
export const UNIT_TAPER_HEIGHT = 5.1;

// Where the gondola FRAME actually stops: the crown height of the dividers,
// the spine, the run-end caps and anything mounted on top of them (section
// toppers, fascia blades, arched plaques). DERIVED FROM THE STOCK, not chosen:
// the top tier's board is AISLE_SHELF_HEIGHTS's last entry (3.833) and a case
// leaning back by LEAN_ANGLE stands CASE_HEIGHT*cos(LEAN) = 0.657 ft on it, so
// the top row tops out at ~4.51 ft; 4.6 leaves ~1 in of crown over it.
// This was 5.1 — 7 in of bare frame above the stock, three quarters of a shelf
// pitch, i.e. visibly enough room for a sixth row that never comes (F8 pin
// 023: "the tops of the shelves are extending a bit high for no reason. are we
// trying to fit another row?"). It also now matches ENDCAP_CORE_HEIGHT, so a
// run terminating in an endcap fixture crowns at exactly the same height as
// one terminating in its own cap.
export const UNIT_FRAME_HEIGHT = FORMAT.unitFrameHeight;

/**
 * Front-to-back depth (ft) of a freestanding unit at height `y` — the single
 * definition of the gondola's taper. Shelf boards, dividers, end caps, the
 * browse camera's stand-off and every fixture that clips onto a shelf lip all
 * solve their width/depth through this.
 */
export function unitDepthAtHeight(y: number): number {
  // A format whose shelving does NOT taper is full depth all the way up: a
  // mom-and-pop's wooden case is a plain box, and carrying the chain gondola's
  // taper to a 7.4 ft top tier would leave that tier 0.9 ft deep — too shallow
  // to stand a tape on, and negative before the ceiling.
  if (!FORMAT.unitTaper) return UNIT_DEPTH;
  return UNIT_DEPTH - (UNIT_DEPTH - UNIT_TOP_DEPTH) * (y / UNIT_TAPER_HEIGHT);
}

// Freestanding aisles are rotated by one uniform angle about a pivot so the whole
// run of islands reads on the diagonal, like the classic video-store floor plan,
// while the room shell (walls, New Releases, fixtures) stays square. The angle is
// applied identically to the aisle structure (via a parent group), the movie box
// resting positions (baked), and the browse/inspect camera framing, so navigation
// is unaffected.
// Herringbone fan: aisles on the LEFT half of the store tilt one way and aisles on
// the RIGHT half tilt the mirror way, so the two fields converge toward the centre
// as they run to the BACK of the store -- an "A" pattern read from the front
// entrance. This is the magnitude of that tilt; the per-aisle sign is chosen by
// aisleAngleFor() based on which side of the store the aisle sits on.
// Measured from the store's depth axis (a 0deg aisle runs straight front-to-back).
// The classic video-store floor plan lays the islands almost broadside to the
// entrance -- ~30deg off the FRONT wall -- so the tilt off the depth axis is the
// complement, 60deg. Left field reads "\", right field reads "/".
export const AISLE_ANGLE = 40 * Math.PI / 180;
// Herringbone row tilt. Was AISLE_ANGLE - 10deg, but the browse fronts read too
// side-on walking in; at AISLE_ANGLE + 10deg each row's browse-front face tips
// ~20deg further toward the front glass than the original (mirrored left/right:
// right field rotates CCW seen from above, left field CW), greeting the entrance.
export const HERRINGBONE_AISLE_ANGLE = AISLE_ANGLE + 10 * Math.PI / 180;
// Cases one unit FACE holds: every column, every shelf tier. Derived from
// AISLE_SHELF_HEIGHTS — the tier count is measured (see the comment on that
// array) and has changed; a hardcoded row count here silently left the top
// tier of every freestanding unit bare.
export const UNIT_SIDE_CAPACITY = MAX_SHELF_COLS * AISLE_SHELF_HEIGHTS.length; // 60 (12 cols x 5 shelves)
export const UNIT_CAPACITY = UNIT_SIDE_CAPACITY * 2; // 120 (double-sided)
// Longest continuous shelf run (line), in units, in the SMALLEST store of this
// format — StorePlan.computeDimensions grows it from here with the library.
export const MAX_RUN_UNITS = FORMAT.baseRunUnits;
// Cross-aisle gap (ft) between consecutive runs in one hatched line.
export const RUN_BREAK_GAP = FORMAT.runBreakGap;
export const BACK_WALL_UNIT_IDX = 999;

/**
 * The span of BACK WALL this format hands to New Releases, given the span the
 * shell would otherwise offer (wall edges, minus the left sliver and the
 * right-wall clearance).
 *
 * A format with a New Releases WALL takes all of it — that ribbon is the whole
 * back of a chain store. A format without one gets, at most, a single dedicated
 * run centred on the wall, and the rest of that wall stays the room's own
 * finish: the owner's mom-and-pop spec is "no NEW RELEASES walls — the walls
 * belong to the regular library; at most one dedicated new-releases shelf"
 * (GH #33). `newReleasesRuns: 0` yields an empty span and no runs at all.
 *
 * Lives here, with the format-derived constants it is made of, rather than in
 * three-scene.ts's shell derivation — that file is at its line budget and this
 * is exactly the kind of feature logic the budget exists to keep out of it.
 */
export function newReleasesWallSpan(leftX: number, rightX: number): [left: number, right: number] {
  if (FORMAT.newReleasesWall) return [leftX, rightX];
  const unitLen = (MAX_SHELF_COLS - 1) * BOX_SPACING + 1.0;
  const runW = Math.min(Math.max(0, FORMAT.newReleasesRuns) * unitLen, rightX - leftX);
  const midX = (leftX + rightX) / 2;
  return [midX - runW / 2, midX + runW / 2];
}

/**
 * Columns for the LEFT-WALL New Releases unit — the start of the ribbon — given
 * the run of wall the side-window ribbon left behind it.
 *
 * Windows take priority (user direction), so this is adaptive: it uses whatever
 * wall remains, and drops the run entirely below one signboard section rather
 * than building a stub. A format with no New Releases wall has no ribbon to
 * start, and that side wall belongs to the room.
 */
export function newReleasesLeftWallCols(unitSpace: number): number {
  if (!FORMAT.newReleasesWall) return 0;
  const cols = Math.max(0, Math.floor((unitSpace - 1.0) / BOX_SPACING));
  return cols < SECTION_COLS ? 0 : cols;
}

// New Releases wall-run construction depths — the SINGLE SOURCE shared by the
// layout calc (buildStore in store-shell.ts), buildShelfRun's geometry, and
// the corner insets in three-scene.ts, so the left-wall unit and back-wall
// Run 1 always butt flush at the back-left corner whatever the store
// dimensions are.
export const NR_WALL_SHELF_DEPTH = 0.3;  // shelf-board depth (ft) — buildShelfRun's backWallShelfDepth
// Assembly back face stand-off from the room wall plane. Must clear the
// walls' navy baseboards (0.04 ft thick, standing 0.02 off the wall — see
// bbBack et al. in buildStore): at the old 0.02 the backing panel and the
// uprights physically interpenetrated the baseboard along the whole run and
// z-fought at the floor line.
export const NR_WALL_CLEARANCE = 0.08;
// Built depth of a wall run: room wall plane -> shelf/end-panel front face.
export const NR_RUN_DEPTH = NR_WALL_CLEARANCE + NR_WALL_SHELF_DEPTH;
export const NR_LEFT_UNIT_STANDOFF = 0.1; // left-wall unit group origin off the wall mesh

// A title the store has no physical stock of: a Jellyseerr-synthesized
// coming-soon entry, a missing collection entry, or an inline discovery
// suggestion. Requestable — and still stockless once REQUESTED (the gold
// COMING SOON restamp doesn't put a tape in the drawer). Its slot renders the
// display case alone: no rental clamshell behind the case
// (MovieSlot.noRentalCase) and no popularity backstock (extraCopiesCount) —
// the bare slot is the whole point: scanning a shelf, the not-in-stock cases
// are the ones with nothing stacked behind them.
export function isUnstockedTitle(movie: Movie): boolean {
  return movie.comingSoon === true || movie.collectionGap === true || movie.discovery === true
    || movie.streaming === true;
}

// Returns the number of extra static rental copies to place behind this movie's slot.
// 0 = none, 1 = one extra (total 2), 2 = two extra (total 3).
// Threshold: communityRating >= 9.0 (≈ 4.5/5 stars) OR criticRating >= 90.
// Both conditions = two extra copies.
export function extraCopiesCount(movie: Movie): number {
  // Stock the store never had (coming soon / collection gap / discovery): its
  // TMDB vote average would otherwise earn it copies like any other
  // well-liked film.
  if (isUnstockedTitle(movie)) return 0;
  const highStars = typeof movie.communityRating === 'number' && movie.communityRating >= 9.0;
  const highRT    = typeof movie.criticRating === 'number'    && movie.criticRating >= 90;
  if (highStars && highRT) return 2;
  if (highStars || highRT) return 1;
  return 0;
}

// New Releases wall sectioning: a title that's highly rated but wasn't picked
// up by the "recently added" cut still deserves a highlight rather than
// blending into a single generic shelf row (see buildAllMovieBoxes's
// highRatedOrderedSlots). Threshold: communityRating >= 8.0 or criticRating >=
// 85 -- looser than extraCopiesCount's backstock threshold above, since this
// only decides wall placement, not how much physical stock a slot implies.
export function isWallHighlyRated(movie: Movie): boolean {
  const highStars = typeof movie.communityRating === 'number' && movie.communityRating >= 8.0;
  const highRT    = typeof movie.criticRating === 'number'    && movie.criticRating >= 85;
  return highStars || highRT;
}

// Deterministic per-copy pseudo-random value in [0, 1), seeded from a string. Used to
// jitter each stacked extra copy's horizontal position so copies don't all peek out
// from behind the cover at the exact same spot. Seeded (rather than Math.random())
// so a copy's position stays stable across rebuildExtraCopies() reruns (genre filter
// changes, etc.) instead of reshuffling every rebuild.
export function seededRandom01(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return (Math.abs(hash) % 1000) / 1000;
}

// Deterministic per-DAY seed string (local calendar date, YYYY-MM-DD). Pair with
// seededRandom01 (e.g. `seededRandom01(dailySeed() + key)`) to make a selection
// that is STABLE within a day but rotates the next — used by the floor displays
// to pick which Jellyfin collections they face out each day. `new Date()` is
// fine here: this is app-runtime code (only the workflow-script sandbox forbids
// it), and the value only needs day granularity.
export function dailySeed(): string {
  return new Date().toISOString().slice(0, 10);
}

// STAGGER_OFFSET is the leftmost a stacked copy can peek out to (matching the front
// case's own peek); per-copy jitter can push it up to this much further to the right.
export const COPY_X_JITTER_RANGE = 0.06;

// ─── T08: smart shelf-fill scoring ──────────────────────────────────────────
// When a category is padded out to a whole signboard section, the leftover slots
// used to be bare `null`s. Instead we face-out extra copies of that category's
// *most deserving* titles (real stores stack multiples of a hot title together).
// Ranking, per the ticket: new releases first, then highly rated. Fully
// deterministic (no Math.random) so the same library always fills identically.

// Epoch ms a title was added to the library (its "new release" recency). Titles
// with no dateCreated sort as oldest (0) so ratings decide among them.
export function movieAddedTime(movie: Movie): number {
  if (!movie.dateCreated) return 0;
  const t = Date.parse(movie.dateCreated);
  return Number.isFinite(t) ? t : 0;
}

// Popularity weight for fill ordering — extends extraCopiesCount()/isWallHighlyRated()'s
// rating idea into a continuous score so ties past recency break by how loved a title is.
export function shelfFillScore(movie: Movie): number {
  const stars = typeof movie.communityRating === 'number' ? movie.communityRating : 0; // 0..10
  const rt    = typeof movie.criticRating === 'number' ? movie.criticRating : 0;        // 0..100
  let score = stars * 10 + rt; // 0..200
  if (isWallHighlyRated(movie)) score += 50; // nudge the wall-worthy ahead of the merely-decent
  return score;
}

// Sort comparator that decides which titles earn filler face-out copies: new
// releases first (more recently added), then higher rated, then a stable id
// tiebreak so the fill never reshuffles between reloads.
export function shelfFillCompare(a: Movie, b: Movie): number {
  const ta = movieAddedTime(a), tb = movieAddedTime(b);
  if (tb !== ta) return tb - ta;
  const sa = shelfFillScore(a), sb = shelfFillScore(b);
  if (sb !== sa) return sb - sa;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// How many ADJACENT face-out copies of one title a fill run places before it
// moves on to the next. Two of the same box side by side is the period read
// (the footage is full of them); one-each would just look mis-sorted.
export const FILL_RUN_COPIES = 2;

// The face-out copies that stock the slots a category cannot fill on its own.
// This is the SIDEWAYS twin of extraCopiesCount()'s backstock: that one stacks
// copies BEHIND a title's own box, this one runs them along the shelf into the
// slots that would otherwise be bare board. Both only ever duplicate stock the
// store already has — nothing here can invent a title, every returned entry is
// a movie from `list` (i.e. from that very section).
//
// Ranked by shelfFillCompare (new releases first, then best-loved) and emitted
// in FILL_RUN_COPIES-long runs, cycling the ranking until `count` is met, so a
// thin section reads as a wall of its own hits — deepest on the titles that
// earned it — instead of a half-empty fixture. Fully deterministic.
export function sectionFillCopies(list: Movie[], count: number): Movie[] {
  if (count <= 0 || list.length === 0) return [];
  // Requestable phantom stock (coming soon / gaps / discovery) has no tape to
  // make a second copy of — see isUnstockedTitle. Prefer real stock; fall back
  // to the whole list only if that is all the section has.
  const stocked = list.filter((m) => !isUnstockedTitle(m));
  const ranked = [...(stocked.length > 0 ? stocked : list)].sort(shelfFillCompare);
  const out: Movie[] = [];
  for (let i = 0; out.length < count; i++) {
    out.push(ranked[Math.floor(i / FILL_RUN_COPIES) % ranked.length]);
  }
  return out;
}

// Copies needed to round `entryCount` up to a whole COLUMN of shelf tiers. An
// un-sectioned run (tiny/uncategorized library) lands its entries row-major
// through sideEntrySlot, so a count that isn't a whole number of columns leaves
// the bottom tiers of the trailing columns bare.
export function columnFillCount(entryCount: number): number {
  const rows = AISLE_SHELF_HEIGHTS.length;
  return (rows - (entryCount % rows)) % rows;
}

// ─── T08: overflow / special-interest routing ───────────────────────────────
// Where titles that don't belong to a headline shelf category (documentaries,
// special interest, etc.) are surfaced.
//   general        — fold them into the GENERAL shelves (legacy behavior)
//   display-stands — highlight them on the four-sided display stands (default)
//   dedicated-unit — give them their own labeled "SPECIAL INTEREST" shelf section
export type OverflowPolicy = 'general' | 'display-stands' | 'dedicated-unit';
export const DEFAULT_OVERFLOW_POLICY: OverflowPolicy = 'display-stands';

// A title routed to the overflow zone: currently the SPECIAL INTEREST bucket
// (documentary/sport/history/biography). Kept as a named predicate so the display
// stand content-provider and the shelf router agree on what counts as overflow.
export function isOverflowTitle(movie: Movie): boolean {
  return storeCategory(movie) === 'SPECIAL INTEREST';
}

// How far behind the main box's own back face a stacked extra copy (see
// extraCopiesCount()) can sit before its own back face clips into the double-sided
// unit's center backing wall (`backingWallGeo`, 0.5ft wide).
//
// A unit's box is placed 0.33ft off the unit centre (the `localX` side offset in
// buildAllMovieBoxes()/rebuildMovieBoxes()), but LEANING the box backward
// (LEAN_ANGLE, to keep its bottom edge flush on the shelf -- see leanHingeOffset())
// pulls its actual centre back toward the divider by CASE_HEIGHT/2 * |sin(LEAN_ANGLE)|
// -- about 0.058ft. That leaves only ~0.022ft of real clearance to the divider face
// (0.33 - 0.058 - 0.25), which is LESS than a single case's own half-depth
// (CASE_DEPTH/2 ~= 0.022ft). In other words: there is essentially no room to stack a
// copy any further back than where the main box's own back face already sits, so
// extra copies are placed at that same depth (not pushed deeper) with only a hairline
// per-copy nudge -- just enough to keep two stacked copies from perfectly
// z-fighting, not a real depth stack.
export const EXTRA_COPY_DEPTH_STEP = 0.045;

// How the freestanding islands are oriented on the floor. Placement (where a unit
// sits) and capacity (how many movies it holds) are independent of this; an
// arrangement only decides each unit's yaw (tilt) and which face you browse first.
// Add new presets by giving each unit a yaw + browseSign in applyArrangement().
//   herringbone — the classic "A": left field "\", right field "/" (default)
//   straight    — every island axis-aligned (no tilt), all browsed from the same side
//   diagonal    — every island tilted the SAME way (uniform "/"), browsed from one side
// ─── Classic video-store wall categories ────────────────────────────────────
// The genre menu is gone: every library's titles are physically sorted into the
// section categories an original rental store used, each category padded out to
// whole 6-column sections so the overhead signboards line up with the stock.
export const SECTION_CAPACITY = SECTION_COLS * AISLE_SHELF_HEIGHTS.length; // 30 cases per signboard section
export const TINY_LIBRARY_MOVIES = SECTION_CAPACITY * 2; // below this a library keeps one un-sectioned run
export const MIN_CATEGORY_TITLES = 6; // categories smaller than this flex into GENERAL shelves
export const STORE_CATEGORY_ORDER = [
  'ACTION', 'COMEDY', 'DRAMA', 'SUSPENSE', 'HORROR', 'SCI-FI & FANTASY',
  'FAMILY', 'ROMANCE', 'MUSIC', 'SPECIAL INTEREST', 'TELEVISION', 'GENERAL',
];

// Shelf-order collation key: video stores alphabetize ignoring leading articles
// ("The Matrix" files under M), so the on-shelf order matches what a customer
// scanning the spines expects.
// Where the n-th entry on ONE unit face lands: shelf row and column. Entries
// fill each 6-column signboard section top row first, left to right, then the
// next row down, before moving on to the next section — so a section's cases
// read as one contiguous block under its sign. Shared by the box-placement pass
// and the overview's per-genre cursors so both agree on where a section starts.
// Row count comes from AISLE_SHELF_HEIGHTS: with it hardcoded, a full face
// (UNIT_SIDE_CAPACITY entries) derived MORE columns than the unit physically
// has and the topmost tier never received an entry.
export function sideEntrySlot(entryCountOnSide: number, remSide: number): { shelfIdx: number; col: number } {
  const rows = AISLE_SHELF_HEIGHTS.length;
  const sideCols = Math.max(1, Math.ceil(entryCountOnSide / rows));
  const numSets = Math.ceil(sideCols / SECTION_COLS);
  let temp = remSide;
  for (let s = 0; s < numSets; s++) {
    const startCol = s * SECTION_COLS;
    const endCol = Math.min(sideCols - 1, (s + 1) * SECTION_COLS - 1);
    const width = endCol - startCol + 1;
    const capacity = width * rows;
    if (temp < capacity) {
      return { shelfIdx: (rows - 1) - Math.floor(temp / width), col: startCol + (temp % width) };
    }
    temp -= capacity;
  }
  return { shelfIdx: rows - 1, col: 0 };
}

export function shelfSortTitle(title: string): string {
  return title.replace(/^(the|a|an)\s+/i, '').toLowerCase();
}

// Where a title files on the shelf: a collection member files under its
// collection's name (minus the redundant "Collection" suffix Jellyfin/TMDB box
// sets carry), so "Raiders of the Lost Ark" stands with the other Indiana
// Jones films instead of alone under R. Loose titles file under their own name.
export function shelfFileKey(m: Movie): string {
  const base = m.collectionName
    ? m.collectionName.replace(/\s+collection$/i, '')
    : m.title;
  return shelfSortTitle(base);
}

export function shelfTitleCompare(a: Movie, b: Movie): number {
  const byKey = shelfFileKey(a).localeCompare(shelfFileKey(b));
  if (byKey !== 0) return byKey;
  // Same filing key but different collections (or a loose title whose name
  // happens to match a collection's): keep each group contiguous.
  const collA = a.collectionName ?? '';
  const collB = b.collectionName ?? '';
  if (collA !== collB) return collA.localeCompare(collB);
  if (collA) {
    // Within one collection: chronological, the way a customer expects a
    // saga to read along the shelf.
    if (a.year !== b.year) return a.year - b.year;
    if (a.premiereDate && b.premiereDate && a.premiereDate !== b.premiereDate) {
      return a.premiereDate.localeCompare(b.premiereDate);
    }
  }
  return shelfSortTitle(a.title).localeCompare(shelfSortTitle(b.title));
}

// Every wall category a title's genre tags qualify it for, in shelving-priority
// order (most specific first). A film tagged "History, Drama" yields
// ['SPECIAL INTEREST', 'DRAMA']: it *prefers* the specialist section, but if
// that section never gets built (too few titles, or folded away by the overflow
// policy) the planner can still file it under DRAMA instead of dumping it in
// GENERAL. See StorePlan.buildLibraryLayouts for the cascade.
export function storeCategoryCandidates(movie: Movie): string[] {
  if (movie.isSeries) return ['TELEVISION'];
  const g = movie.genres.map((x) => x.toLowerCase());
  const has = (...names: string[]) => names.some((n) => g.includes(n));
  const out: string[] = [];
  if (has('horror')) out.push('HORROR');
  if (has('sci-fi', 'science fiction', 'fantasy')) out.push('SCI-FI & FANTASY');
  if (has('animation', 'family', 'kids', 'children')) out.push('FAMILY');
  if (has('action', 'adventure', 'war', 'western', 'martial arts')) out.push('ACTION');
  // "Comedy" is a modifier at least as often as it is a genre, so taking it at
  // face value lets COMEDY swallow half the library. A drama with jokes is a
  // drama — Drama outranks Comedy and the dramedy files under DRAMA. Lighter
  // pairings (crime, romance, family) still read as comedies, so those keep the
  // early COMEDY slot and win as before.
  const outrankedByDrama = has('drama');
  if (has('comedy') && !outrankedByDrama) out.push('COMEDY');
  if (has('thriller', 'mystery', 'crime', 'suspense', 'film-noir', 'film noir')) out.push('SUSPENSE');
  if (has('romance')) out.push('ROMANCE');
  if (has('music', 'musical', 'concert')) out.push('MUSIC');
  if (has('documentary', 'sport', 'history', 'biography')) out.push('SPECIAL INTEREST');
  if (has('drama')) out.push('DRAMA');
  // Still a fallback: if DRAMA never gets built, a dramedy lands in COMEDY
  // rather than GENERAL.
  if (has('comedy') && outrankedByDrama) out.push('COMEDY');
  return out;
}

export function storeCategory(movie: Movie): string {
  return storeCategoryCandidates(movie)[0] ?? 'GENERAL';
}

// A collection's members can carry different genres (one Alien film tagged
// Horror, another Sci-Fi); bucketing each by its own genre would split the
// saga across category sections and defeat the grouped shelf order
// (shelfTitleCompare). This maps each collection name to its members' majority
// category, ties broken by wall-category display order, so every member
// shelves together — see StorePlan.buildLibraryLayouts.
export function collectionCategoryMap(movies: Movie[]): Map<string, string> {
  const votes = new Map<string, Map<string, number>>();
  movies.forEach((m) => {
    if (!m.collectionName) return;
    let v = votes.get(m.collectionName);
    if (!v) votes.set(m.collectionName, (v = new Map()));
    const c = storeCategory(m);
    v.set(c, (v.get(c) ?? 0) + 1);
  });
  const result = new Map<string, string>();
  votes.forEach((v, coll) => {
    let best = '';
    let bestScore = -1;
    v.forEach((n, cat) => {
      const rank = STORE_CATEGORY_ORDER.indexOf(cat);
      const bestRank = best ? STORE_CATEGORY_ORDER.indexOf(best) : Infinity;
      if (n > bestScore || (n === bestScore && rank < bestRank)) {
        best = cat;
        bestScore = n;
      }
    });
    result.set(coll, best);
  });
  return result;
}

export function shelfCategoryOf(m: Movie, collectionCat: Map<string, string>): string {
  return (m.collectionName && collectionCat.get(m.collectionName)) || storeCategory(m);
}

// Per-collection candidate lists, mirroring collectionCategoryMap: the voted
// majority category leads, then every other category any member qualifies for
// (in wall order) as fallbacks. So a saga whose majority category never gets
// built cascades to its next-best section as ONE group instead of scattering.
export function collectionCategoryCandidates(movies: Movie[]): Map<string, string[]> {
  const majority = collectionCategoryMap(movies);
  const unionByColl = new Map<string, Set<string>>();
  movies.forEach((m) => {
    if (!m.collectionName) return;
    let s = unionByColl.get(m.collectionName);
    if (!s) unionByColl.set(m.collectionName, (s = new Set()));
    storeCategoryCandidates(m).forEach((c) => s!.add(c));
  });
  const result = new Map<string, string[]>();
  unionByColl.forEach((set, coll) => {
    const best = majority.get(coll);
    const rest = [...set]
      .filter((c) => c !== best)
      .sort((a, b) => STORE_CATEGORY_ORDER.indexOf(a) - STORE_CATEGORY_ORDER.indexOf(b));
    result.set(coll, best ? [best, ...rest] : rest);
  });
  return result;
}

// Every wall category this title could file under, honouring its collection's
// grouping. Used by the planner's viability cascade.
export function shelfCategoryCandidatesOf(m: Movie, collectionCands: Map<string, string[]>): string[] {
  const coll = m.collectionName && collectionCands.get(m.collectionName);
  return coll && coll.length > 0 ? coll : storeCategoryCandidates(m);
}

// Shelf order for one library: the movies in category order with null padding to
// section boundaries, plus the category label for every signboard section.
export interface LibraryLayout {
  entries: (Movie | null)[];
  // `${unitIdxInLibrary}_${side}_${sectionIdx}` -> category label
  sectionLabels: Map<string, string>;
  categorized: boolean;
}

export type ArrangementId = 'herringbone' | 'straight' | 'diagonal';

export interface ShelvingUnit {
  libraryIdx: number;
  unitIdxInLibrary: number;
  cols: number;
  zPos: number;
  xCenter: number;
  // A "line" is a chain of units whose short ends touch, running along the
  // arrangement axis. lineId groups them; posInLine is the 0-based slot from the
  // line's FRONT end. anchorX is the lane's front-edge X before the diagonal drift
  // is applied (the value applyArrangement() reads to pick a side), and is the
  // single source of truth for orientation. layoutConnectedLines() then walks each
  // unit out along the rotated axis so consecutive units actually join up.
  lineId: number;
  posInLine: number;
  isLineFront: boolean; // true only for the unit at the line's front end (blue cap)
  isLineBack: boolean;  // true only for the unit at the line's back end (white cap)
  // A single straight physical row can be POURED as several lineId chunks —
  // fillField() breaks a run into maxRunUnits-sized pieces (each its own
  // lineId, with a real RUN_BREAK_GAP cross-aisle and its own endcaps) purely
  // for shelving-capacity bookkeeping, even though consecutive chunks sit
  // short-end-to-short-end with only that small gap between them: to a
  // customer walking the row they read as ONE continuous run. rowGroupId is
  // shared by every chunk poured from the same fillField() run (i.e. the same
  // physical row), so StorePlan's walk-order pass and entryBlockOrder() can
  // treat them as one line for content-flow purposes without disturbing
  // lineId/isLineFront/isLineBack, which every OTHER consumer (endcap
  // placement, browse-cursor line-hopping) still keys off unchanged.
  rowGroupId: number;
  anchorX: number;
  // Placement is now an explicit property of the unit rather than something
  // re-derived from xCenter at every call site. yaw is the island's tilt about its
  // own centre; browseSign (+1/-1) is which local-X face is the browse-front. Both
  // are filled in by applyArrangement() and are the single source of truth that the
  // structure geometry, movie-box baking, and camera framing all read from.
  yaw: number;
  browseSign: number;
}

export interface DisplayStand {
  x: number;
  z: number;
  genre: string;
  movies: Movie[];
}

export interface FixturePlacement {
  id: string;              // stable key, e.g. 'display-ghibli'
  kind: string;            // registry key, e.g. 'four-sided-display'
  position: { x: number; z: number };   // feet, world space (store centreline is X=11)
  yaw: number;             // radians
  options?: Record<string, unknown>;    // per-kind config (shelf heights, materials...)
}

export interface MovieSlot {
  movie: Movie;
  libraryIdx: number;
  unitIdx: number;
  side: 'front' | 'back' | 'left' | 'right';
  shelfIdx: number;
  col: number;
  key: string; // "unitIdx_side_shelfIdx_col" relative to selected library
  source?: 'shelving' | 'fixture';
  fixtureId?: string;
  // Suppress the rental clamshell that normally stands behind every
  // retail box, so this title reads as the plain Jellyfin case alone. Set from
  // the fixture placement's `noRentalCase` option — bargain-bin stock is sold
  // ex-rental, not rented, so it never wears the branded case — or because the
  // title itself is unstocked (see isUnstockedTitle): a requestable gap /
  // discovery / coming-soon case has no rental copy behind it either.
  noRentalCase?: boolean;

  frontMesh: THREE.InstancedMesh;
  backMesh: THREE.InstancedMesh;
  instanceIdx: number;
  genericInstanceIdx: number;

  restingX: number;
  restingY: number;
  restingZ: number;
  restingRotY: number;
  restingRotX?: number;
  aisleAngle?: number; // herringbone tilt of this aisle (0 for back-wall/display)
  browseSign?: number; // which local-X face is the browse-front (+1/-1); set from unit.browseSign
  depth: number;

  currentX: number;
  currentY: number;
  currentZ: number;
  currentRotX: number;
  currentRotY: number;

  frontX: number;
  frontZ: number;
  frontRotY: number;

  backX: number;
  backZ: number;
  backRotY: number;
  /**
   * Lift (ft) applied to the rental shell ONLY, so its bottom lands on the
   * same surface as the retail box in front of it. Both boxes share the
   * slot's single Y and both geometries are origin-centred, so a taller shell
   * otherwise hangs through the shelf. See rentalBottomLift() in video-case.
   */
  backYLift: number;

  currentScale: number;
  loadShelfDetails: (priority?: number, onSettled?: () => void) => void;
  loadFullDetails: () => void;
  needsInitialMatrixUpdate?: boolean;
  hidden: boolean;
}

// ─── Wall-segment UV mapping ─────────────────────────────────────────────────
// The shared wall material's texture repeat is sized for ONE storeWidth x
// roomHeight plane, so every smaller piece reusing that material must rescale
// both UV axes or its texels get squeezed/stretched (a narrow step face crams
// the full-width repeats into a few feet; a short band above a window squashes
// the whole wall height into it).
//
// `vBottom` (ft above the floor) keeps a partial-height piece sampling the same
// texture ROWS as the full-height wall beside it, so the orange-peel pattern
// lines up across a glazing head — and so the wall material's 1x256
// contact-AO gradient (makeWallContactAO) lands at the true floor/ceiling
// lines on every segment rather than being restretched per piece.
//
// Works on box geometry too (BoxGeometry's per-face 0..1 UVs each get the same
// transform), which is what lets the knee walls under the glazing share the
// wall material instead of being flat untextured paint.
export function mapWallSegmentUV(
  geo: THREE.BufferGeometry,
  width: number,
  height: number,
  vBottom: number,
  storeWidth: number,
  roomHeight: number,
): void {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  if (!uv) return;
  const su = width / storeWidth;
  const sv = height / roomHeight;
  const ov = vBottom / roomHeight;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv + ov);
  uv.needsUpdate = true;
}
