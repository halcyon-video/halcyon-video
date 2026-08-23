// Ground plan of the STANDALONE DESK counter (counterShape 'desk') — the
// mom-and-pop format's till. Pure geometry, no imports, on purpose: two very
// different callers have to agree on this one rectangle and they run at
// different points in buildStore.
//
//   • entrance/counter.ts BUILDS the desk from it (and hangs every anchor —
//     spine, standings, nav footprints — off the same frame).
//   • store-fixtures-config.ts declares its layout-validator footprint and
//     parks the tip jar on it, and that list is assembled BEFORE the entrance
//     exists, so it cannot read the built geometry back.
//
// Those two drifting apart is not hypothetical: GH #110 moved the entrance
// datum, counter.ts followed and the config did not, and the tip jar spent a
// release standing six feet out on the open floor (fixed in 1af1683). One
// exported function is the only way they stay in step.
//
// ── GH #116: the desk runs along a SIDE WALL ────────────────────────────────
// It used to be built centred on the store centreline a few feet inside the
// glass, which put the counter — and whoever works it — dead ahead of anyone
// walking through the door. A real small shop puts the till off to one side
// and leaves the path in clear, so the desk turns 90° and backs onto the LEFT
// wall's work strip, facing across the shop.
//
// LEFT, and not by taste: the RIGHT front of this room is already spoken for.
// The entrance overview — the view the store BOOTS into — stands at
// OVERVIEW_POS (scene-shared.ts), which is authored at x = 24 and clamped
// inward to a wall standoff, landing at x ≈ 18.5, z ≈ 9.5 in a mom-and-pop.
// A desk on the right wall puts that vantage in the clerk's work strip,
// staring at the back of the counter TV. Off the left wall it looks across
// the shop at the till, which is the shot the boot view wants.

/** Length of the desk along its own run (ft) — GH #33's "6 ft of counter". */
export const DESK_LENGTH = 6.0;

/**
 * Front-to-back depth (ft). The same slab the inner counter island is
 * extruded with everywhere else (counter.ts's `innerD`): on this shape the
 * island IS the whole counter, so the two numbers are one number.
 */
export const DESK_DEPTH = 1.6;

/**
 * Clear floor (ft) between the side wall and the desk's back face — the
 * clerk's work strip, and the only reason the desk stands off the wall at all.
 *
 * Sized against her NAV GRID rather than by eye. That grid (store-shell.ts,
 * ClerkNavGrid) keeps her 1.7 ft off any wall and 0.8 ft off the counter, and
 * rasterizes at 0.5 ft, so a 4.0 ft strip leaves a 1.5 ft walkable lane —
 * three cells. Below ~3.2 the lane closes and her register spot is stranded
 * on an island the pathfinder cannot reach.
 */
export const DESK_WALL_STRIP = 4.0;

/**
 * Gap (ft) between the entrance datum (the front wall, or a vestibule's inner
 * face) and the desk's near end.
 *
 * Wide enough to walk. It is how you get behind the counter from the door
 * end, and — the reason it is 3.6 rather than the 0.9 this was first drawn at
 * — it is where the checkout walk-out stands to collect its bag: the shove
 * slides the bag to the DOOR end of the desk, so a counter butted against the
 * front wall put that whole beat, and the first-person camera playing it,
 * about eighteen inches from the glazing.
 */
export const DESK_FRONT_GAP = 3.6;

export interface DeskGroundPlan {
  /** Centre of the desk's ground rect — also the centre of its top spine. */
  cx: number;
  cz: number;
  /** Rect extents: `length` runs along the counter, `depth` front-to-back. */
  length: number;
  depth: number;
  /**
   * Unit vector along the counter run, +u. Every counter-anchored offset in
   * the app (`spineAt(u)`, the prop offsets, the exit ritual's shove) is
   * measured along this.
   */
  ux: number;
  uz: number;
  /** Unit vector from the customer side INTO the desk body (toward the clerk). */
  nx: number;
  nz: number;
  /** Centre of the customer-facing face. */
  frontX: number;
  frontZ: number;
  /**
   * Footprint yaw, layout-validator convention (local +X is
   * `(cos yaw, -sin yaw)` and runs along `length`).
   */
  yaw: number;
  /** Heading the counter FACES — clerk.ts convention, `atan2(dirX, dirZ)`. */
  facingYaw: number;
}

/**
 * Where the standalone desk stands, in world feet.
 *
 * `storeWidth` is what puts it on the wall: the shop's width follows its
 * library, so the wall moves and the desk moves with it. Everything else is
 * the same entrance datum counter.ts builds its band outline from.
 */
export function deskGroundPlan(opts: {
  storeCenterX: number;
  storeWidth: number;
  frontGlassZ: number;
  entryStyle: 'vestibule' | 'storefront-door';
  doorWidth: number;
}): DeskGroundPlan {
  // counter.ts's outline datum: the entrance's store-side wall, less its
  // 0.1 ft setback. With no vestibule chamber (GH #110) that wall IS the
  // front glass; with one it is the chamber's inner face.
  const backZ = opts.frontGlassZ - (opts.entryStyle === 'vestibule' ? opts.doorWidth * 2 : 0);
  const zBackC = backZ - 0.1;

  const wallX = opts.storeCenterX - opts.storeWidth / 2; // LEFT wall (−X)
  const backFaceX = wallX + DESK_WALL_STRIP;             // clerk side
  const frontX = backFaceX + DESK_DEPTH;                 // customer side
  const nearZ = zBackC - DESK_FRONT_GAP;                 // door end of the run
  const cz = nearZ - DESK_LENGTH / 2;

  return {
    cx: backFaceX + DESK_DEPTH / 2,
    cz,
    length: DESK_LENGTH,
    depth: DESK_DEPTH,
    // +u runs AWAY from the door, matching what every counter-anchored offset
    // in the app already means: the terminal (+1.3) and the counter TV (+2.2)
    // sit up-counter, the tip jar (−0.95) and the bag (−1.9) sit down-counter
    // at the end the walk-out passes. Hold that meaning and the exit ritual
    // needs no re-tuning for a desk that has turned 90°.
    ux: 0,
    uz: -1,
    // Into the body: the customer stands on the store side (+X), the clerk
    // between the desk and the wall.
    nx: -1,
    nz: 0,
    frontX,
    frontZ: cz,
    // Footprint local +X is (cos yaw, −sin yaw) and must run along the
    // counter: (0, −1) => yaw = π/2.
    yaw: Math.PI / 2,
    // Faces +X, across the shop: atan2(1, 0).
    facingYaw: Math.PI / 2,
  };
}
