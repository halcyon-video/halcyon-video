// Pure-math layout validator: turns spatial mistakes (fixtures overlapping
// shelving, islands poking through walls, aisles crammed too tight to walk)
// into loud, diffable text errors instead of invisible geometry bugs a human
// has to spot by eye in a screenshot. No THREE imports — this only deals in
// plain numbers so it can run against any footprint list, from tests or from
// the live scene (see StoreScene.validateStoreLayout() in three-scene.ts).
//
// Coordinate convention (matches the rest of the codebase — see e.g.
// four-sided-display.ts's getSlots()): a footprint's local (X, Z) axes are
// carried into world space by rotating by `yaw` as
//   worldX = cx + localX*cos(yaw) + localZ*sin(yaw)
//   worldZ = cz - localX*sin(yaw) + localZ*cos(yaw)
// i.e. `w` is the extent along the rotated local-X axis, `d` along local-Z.

export interface Footprint {
  label: string;                 // e.g. 'fixture:candy-display-front', 'shelving:unit-12', 'structure:checkout-counter'
  kind: 'fixture' | 'shelving' | 'structure';
  cx: number; cz: number;        // world-space centre, feet
  w: number;                     // X extent at yaw=0, feet
  d: number;                     // Z extent at yaw=0, feet
  yaw: number;                   // radians, same convention as FixturePlacement.yaw
  /** Explicit minimum clearance (ft) this footprint demands from EVERY other
   *  object — walls included — overriding the pair-kind walkway default.
   *  Floor displays/bins set FLOOR_DISPLAY_CLEARANCE (customers circle them
   *  from all sides, so they need twice a plain aisle's breathing room). */
  clearance?: number;
}

/** Clearance floor displays / dump bins must keep to anything else: twice the
 *  1.5 ft aisle walkway minimum (see validateLayout's default). */
export const FLOOR_DISPLAY_CLEARANCE = 3.0;

/**
 * World-space offset of a point sitting `delta` along a footprint's LOCAL Z
 * axis, using the same rotation convention as everything else here (see the
 * header). Exists because a fixture whose extent is ASYMMETRIC about its
 * placement — an aisle-run unit carrying an end cap on its outer end only —
 * cannot describe itself with a box centred on that placement. Spreading the
 * extra depth over both ends instead overstates it into whatever it meets
 * flush, which reads as a phantom overlap of exactly the asymmetry.
 */
export function localZOffset(yaw: number, delta: number): { dx: number; dz: number } {
  return { dx: delta * Math.sin(yaw), dz: delta * Math.cos(yaw) };
}

export interface LayoutViolation {
  severity: 'error' | 'warn';
  a: string; b?: string;
  message: string;               // human sentence WITH numbers, e.g. "overlaps by 0.42 ft"
}

// Rectangles that are merely touching (shelving units chained short-end to
// short-end are DESIGNED to have zero gap — see store-plan.ts's fillField)
// must not read as an "overlap" once floating-point noise is folded in.
// 1cm is comfortably below any real collision this validator should catch.
const TOUCH_TOL = 0.01;

// A footprint's two local axis directions in world space, as unit vectors —
// the X-axis direction and the Z-axis direction, per the rotation convention
// documented above.
function localAxes(fp: Footprint): { x: number; z: number }[] {
  const c = Math.cos(fp.yaw), s = Math.sin(fp.yaw);
  return [
    { x: c, z: -s }, // local +X direction in world space
    { x: s, z: c },  // local +Z direction in world space
  ];
}

// Half-extent of `fp` as measured along an arbitrary (unit) world-space axis.
function projectHalfExtent(fp: Footprint, axis: { x: number; z: number }): number {
  const [ax, az] = localAxes(fp);
  return Math.abs((fp.w / 2) * (ax.x * axis.x + ax.z * axis.z))
       + Math.abs((fp.d / 2) * (az.x * axis.x + az.z * axis.z));
}

// Oriented-rectangle vs oriented-rectangle test via the Separating Axis
// Theorem: the only candidate separating axes for two rectangles are each
// rectangle's own two edge normals (= its own local X/Z axes), so 4 axes
// total. If every axis shows overlap, the rects intersect (penetration depth
// = the smallest per-axis overlap, i.e. the minimum-translation distance).
// If any axis separates them, they don't intersect (reported gap = the
// largest per-axis separation found, a lower bound on — and in the common
// edge-aligned case, equal to — the true minimum distance between them).
function satOverlap(a: Footprint, b: Footprint): { overlaps: boolean; depth: number; gap: number } {
  const dx = b.cx - a.cx, dz = b.cz - a.cz;
  const axes = [...localAxes(a), ...localAxes(b)];
  let separated = false;
  let maxGap = 0;
  let minDepth = Infinity;
  for (const axis of axes) {
    const centerDist = Math.abs(dx * axis.x + dz * axis.z);
    const totalHalf = projectHalfExtent(a, axis) + projectHalfExtent(b, axis);
    const overlapOnAxis = totalHalf - centerDist;
    if (overlapOnAxis < 0) {
      separated = true;
      maxGap = Math.max(maxGap, -overlapOnAxis);
    } else {
      minDepth = Math.min(minDepth, overlapOnAxis);
    }
  }
  if (separated) return { overlaps: false, depth: 0, gap: maxGap };
  return { overlaps: true, depth: minDepth, gap: 0 };
}

// The four corners of a footprint in world space, local-space (±w/2, ±d/2)
// rotated by yaw per the module-level convention.
function corners(fp: Footprint): { x: number; z: number }[] {
  const c = Math.cos(fp.yaw), s = Math.sin(fp.yaw);
  const hw = fp.w / 2, hd = fp.d / 2;
  const local: [number, number][] = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  return local.map(([lx, lz]) => ({
    x: fp.cx + lx * c + lz * s,
    z: fp.cz - lx * s + lz * c,
  }));
}

const WALKWAY_KINDS = new Set(['fixture', 'shelving']);

export function validateLayout(
  footprints: Footprint[],
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  opts?: { minWalkway?: number }
): LayoutViolation[] {
  const minWalkway = opts?.minWalkway ?? 1.5;
  const violations: LayoutViolation[] = [];

  // 1. Bounds: does any corner poke past a wall? Report the worst penetration
  // per wall per footprint (not per corner, so a fully-outside rect reports
  // one line per wall, not up to four duplicates).
  for (const fp of footprints) {
    const cs = corners(fp);
    let pastLeft = 0, pastRight = 0, pastBack = 0, pastFront = 0;
    for (const p of cs) {
      pastLeft = Math.max(pastLeft, bounds.minX - p.x);
      pastRight = Math.max(pastRight, p.x - bounds.maxX);
      pastBack = Math.max(pastBack, bounds.minZ - p.z);
      pastFront = Math.max(pastFront, p.z - bounds.maxZ);
    }
    if (pastLeft > TOUCH_TOL) {
      violations.push({ severity: 'error', a: fp.label, message: `intrudes ${pastLeft.toFixed(2)} ft past left wall (x=${bounds.minX.toFixed(1)})` });
    }
    if (pastRight > TOUCH_TOL) {
      violations.push({ severity: 'error', a: fp.label, message: `intrudes ${pastRight.toFixed(2)} ft past right wall (x=${bounds.maxX.toFixed(1)})` });
    }
    if (pastBack > TOUCH_TOL) {
      violations.push({ severity: 'error', a: fp.label, message: `intrudes ${pastBack.toFixed(2)} ft past back wall (z=${bounds.minZ.toFixed(1)})` });
    }
    if (pastFront > TOUCH_TOL) {
      violations.push({ severity: 'error', a: fp.label, message: `intrudes ${pastFront.toFixed(2)} ft past front glass (z=${bounds.maxZ.toFixed(1)})` });
    }

    // Footprints with an explicit clearance demand keep it to the WALLS too
    // (only demanded, not defaulted: shelving is designed to hug walls).
    if (fp.clearance) {
      let nearestWallGap = Infinity;
      let wall = '';
      for (const p of cs) {
        if (p.x - bounds.minX < nearestWallGap) { nearestWallGap = p.x - bounds.minX; wall = 'left wall'; }
        if (bounds.maxX - p.x < nearestWallGap) { nearestWallGap = bounds.maxX - p.x; wall = 'right wall'; }
        if (p.z - bounds.minZ < nearestWallGap) { nearestWallGap = p.z - bounds.minZ; wall = 'back wall'; }
        if (bounds.maxZ - p.z < nearestWallGap) { nearestWallGap = bounds.maxZ - p.z; wall = 'front glass'; }
      }
      if (nearestWallGap > TOUCH_TOL && nearestWallGap < fp.clearance) {
        violations.push({
          severity: 'warn', a: fp.label,
          message: `only ${nearestWallGap.toFixed(2)} ft clearance to ${wall} (min ${fp.clearance.toFixed(1)} ft)`,
        });
      }
    }
  }

  // 2. Pairwise overlap + walkway clearance, O(n^2) over ~50 rects, once per build.
  for (let i = 0; i < footprints.length; i++) {
    for (let j = i + 1; j < footprints.length; j++) {
      const a = footprints[i], b = footprints[j];
      const result = satOverlap(a, b);
      if (result.overlaps) {
        if (result.depth > TOUCH_TOL) {
          violations.push({ severity: 'error', a: a.label, b: b.label, message: `overlaps by ${result.depth.toFixed(2)} ft` });
        }
      } else {
        // Pair clearance requirement: the walkway default applies between
        // fixtures and shelving (never shelving-vs-shelving, which chains by
        // design); an explicit per-footprint clearance (floor displays/bins)
        // applies against EVERYTHING, counter structure included, and takes
        // the larger of the two demands.
        const walkwayApplies =
          WALKWAY_KINDS.has(a.kind) && WALKWAY_KINDS.has(b.kind) && !(a.kind === 'shelving' && b.kind === 'shelving');
        const required = Math.max(
          walkwayApplies ? minWalkway : 0,
          a.clearance ?? 0,
          b.clearance ?? 0,
        );
        if (required > 0 && result.gap > TOUCH_TOL && result.gap < required) {
          violations.push({ severity: 'warn', a: a.label, b: b.label, message: `only ${result.gap.toFixed(2)} ft clearance (min ${required.toFixed(1)} ft)` });
        }
      }
    }
  }

  // Deterministic order: errors before warnings, then alphabetically by
  // participants, so runs are diffable.
  violations.sort((x, y) => {
    if (x.severity !== y.severity) return x.severity === 'error' ? -1 : 1;
    if (x.a !== y.a) return x.a < y.a ? -1 : 1;
    const xb = x.b ?? '', yb = y.b ?? '';
    if (xb !== yb) return xb < yb ? -1 : 1;
    return x.message < y.message ? -1 : x.message > y.message ? 1 : 0;
  });

  return violations;
}

// ─── Case-pair fit ──────────────────────────────────────────────────────────
//
// Every shelf slot shows TWO boxes: the title's retail case in front and the
// store's rental shell behind it. They are separate geometries, separately
// sized, positioned from ONE slot's numbers — which is exactly how they drift
// apart. Two real bugs shipped from that: the shell hung below the shelf
// because both boxes took the slot's single Y while being origin-centred
// (~1.7 in on a landscape SNES carton), and the shell straddled the parting
// plane because both took the RETAIL depth while the shell is always thicker
// (~0.07 in on every game and every VHS movie).
//
// Neither is a collision problem — nothing moves, and a resolver would just
// shove the boxes to some other wrong place and hide the arithmetic. They are
// assertion problems: the placement is knowable up front, so check it up
// front. Validated per distinct SHAPE, not per slot — the mismatch is a
// property of the box pair, so a store gets a handful of checks, not 3000.

export interface CaseFitPair {
  label: string;                 // e.g. 'game:PLAYSTATION', 'movie:vhs'
  retailH: number; retailD: number;
  shellH: number;  shellD: number;
  /** Shell's Y offset from the slot centre (MovieSlot.backYLift). */
  lift: number;
  /** Local-Z centres of the two boxes (MovieSlot.frontZ / backZ). */
  frontZ: number; backZ: number;
}

/** Sub-thou-of-a-foot noise from the dims tables; not a real defect. */
const CASE_FIT_TOL = 0.0005;

export function validateCaseFit(pairs: CaseFitPair[]): LayoutViolation[] {
  const violations: LayoutViolation[] = [];
  const inches = (ft: number) => `${(ft * 12).toFixed(2)} in`;

  for (const p of pairs) {
    // Depth: the boxes must meet, not interpenetrate. Positive overlap means
    // the shell's front face is inside the case standing in front of it.
    const frontMin = p.frontZ - p.retailD / 2, frontMax = p.frontZ + p.retailD / 2;
    const shellMin = p.backZ - p.shellD / 2,  shellMax = p.backZ + p.shellD / 2;
    const overlap = Math.min(frontMax, shellMax) - Math.max(frontMin, shellMin);
    if (overlap > CASE_FIT_TOL) {
      violations.push({
        severity: 'error', a: p.label, b: 'rental-shell',
        message: `cases interpenetrate by ${inches(overlap)} in depth`,
      });
    }

    // Footing: both boxes stand on the same shelf, so their BOTTOMS agree.
    // Geometry is origin-centred, so the bottom is -h/2 plus any lift.
    const frontBottom = -p.retailH / 2;
    const shellBottom = p.lift - p.shellH / 2;
    const drop = frontBottom - shellBottom;
    if (Math.abs(drop) > CASE_FIT_TOL) {
      violations.push({
        severity: 'error', a: p.label, b: 'rental-shell',
        message: drop > 0
          ? `shell sinks ${inches(drop)} below the shelf the case stands on`
          : `shell floats ${inches(-drop)} above the shelf the case stands on`,
      });
    }
  }

  violations.sort((x, y) => (x.a !== y.a ? (x.a < y.a ? -1 : 1) : (x.message < y.message ? -1 : 1)));
  return violations;
}
