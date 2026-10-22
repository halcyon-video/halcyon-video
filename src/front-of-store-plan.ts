// Front-of-store arrangement for the 2000 and 2010 chain stores (GH #388).
//
// The owner's wide interior photograph is the primary source for three
// features that only read right together: the dropped bulkhead over the cash
// wrap, the bounded square-tile zone beneath it, and the vestibule they both
// meet. In that view the bulkhead is not a pointed wedge but an ANGULAR ring —
// long straight runs, 45-degree chamfered corners and a straight front edge —
// with a deep pale fascia around a recessed gridded ceiling. The gray tile
// floor follows the same outline a step further out, so the carpet boundary is
// long straight runs and an angled transition rather than a rectangle.
//
// The photograph has no calibrated dimensions. The numbers below fit that
// outline to the existing counter and vestibule; they are estimates, not
// measurements of a real store. Earlier eras keep their own front of store
// until the owner confirms otherwise.

export interface PlanPoint { x: number; z: number }

const ANGULAR_FRONT_ERAS = new Set(['bb-2000', 'bb-2010']);

/** True when an era (theme id) builds the angular bulkhead and tiled front. */
export function angularFrontEra(themeId: string): boolean {
  return ANGULAR_FRONT_ERAS.has(themeId);
}

// Half-width of the bulkhead's straight front edge, and how far it stands
// proud of the counter's apex. Estimated from the reference: a short straight
// run across the nose, with the chamfers doing most of the turning. The
// clearance stops short of the NOW SHOWING lightbox hung at z -9, which must
// stay in front of the fascia rather than through it.
const FRONT_EDGE_HALF = 5.0;
const FRONT_EDGE_CLEAR = 1.5;

/**
 * Plan of the bulkhead's outer face, wound like frontSoffitPolygon: the last
 * point closes back along the cornice line across the entrance.
 */
export function angularSoffitPolygon(cx: number, armHalf: number, backZ: number, counterApexZ: number): PlanPoint[] {
  const frontHalf = Math.min(FRONT_EDGE_HALF, armHalf - 1);
  const frontZ = counterApexZ - FRONT_EDGE_CLEAR;
  // Equal X/Z advances keep the chamfers at 45 degrees, like the counter's own
  // customer faces. A narrow shell shortens the side runs, never the angle.
  const chamferZ = Math.min(backZ - 1, frontZ + (armHalf - frontHalf));
  return [
    { x: cx - armHalf, z: backZ },
    { x: cx - armHalf, z: chamferZ },
    { x: cx - frontHalf, z: frontZ },
    { x: cx + frontHalf, z: frontZ },
    { x: cx + armHalf, z: chamferZ },
    { x: cx + armHalf, z: backZ },
  ];
}

/**
 * The bulkhead's exposed chain, run on to the storefront: a real bulkhead dies
 * into the front wall, so its sides carry on past the cornice line to the glass
 * instead of stopping in mid-air.
 */
export function bulkheadChain(soffit: PlanPoint[], glassZ: number): PlanPoint[] {
  return [
    { x: soffit[0].x, z: glassZ },
    ...soffit,
    { x: soffit[soffit.length - 1].x, z: glassZ },
  ];
}

/**
 * Offset an open, convex chain by `distance` toward `inside` (negative moves it
 * outward). Joints sit where the neighbouring offset lines meet, so a ring
 * built between two offsets is properly mitred.
 */
export function offsetChain(chain: PlanPoint[], distance: number, inside: PlanPoint): PlanPoint[] {
  const normals = chain.slice(0, -1).map((a, i) => {
    const b = chain[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    let nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
    if ((inside.x - (a.x + b.x) / 2) * nx + (inside.z - (a.z + b.z) / 2) * nz < 0) { nx = -nx; nz = -nz; }
    return { nx, nz, ux: (b.x - a.x) / len, uz: (b.z - a.z) / len };
  });
  return chain.map((p, i) => {
    const prev = normals[Math.max(0, i - 1)], next = normals[Math.min(normals.length - 1, i)];
    if (i === 0 || i === chain.length - 1) {
      const n = i === 0 ? next : prev;
      return { x: p.x + n.nx * distance, z: p.z + n.nz * distance };
    }
    const den = 1 + prev.nx * next.nx + prev.nz * next.nz;
    return { x: p.x + (prev.nx + next.nx) / den * distance, z: p.z + (prev.nz + next.nz) / den * distance };
  });
}

// How far the tile runs out past the bulkhead's face: enough that a customer
// standing at the counter, and the queue behind them, is on the hard floor.
export const TILE_BEYOND_SOFFIT = 1.5;

/** Closed outline of the tiled zone: the bulkhead chain pushed outward, closed along the glass. */
export function frontTilePolygon(soffit: PlanPoint[], glassZ: number, minX: number, maxX: number): PlanPoint[] {
  const chain = bulkheadChain(soffit, glassZ);
  const inside = soffitInterior(soffit);
  return offsetChain(chain, -TILE_BEYOND_SOFFIT, inside)
    .map(p => ({ x: Math.min(maxX, Math.max(minX, p.x)), z: Math.min(glassZ, p.z) }));
}

/** A point safely inside a convex soffit outline: its vertex centroid. */
export function soffitInterior(soffit: PlanPoint[]): PlanPoint {
  return soffit.reduce((a, p) => ({ x: a.x + p.x / soffit.length, z: a.z + p.z / soffit.length }), { x: 0, z: 0 });
}
