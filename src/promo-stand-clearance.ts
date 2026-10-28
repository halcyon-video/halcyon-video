import { FLOOR_DISPLAY_CLEARANCE, validateLayout, type Footprint } from './layout-validator';
import { FLOOR_FIXTURE_MAX_Z, STORE_CENTER_X, type FixturePlacement } from './store-layout';

/** Stand ids whose x may slide across the corridor to keep their clearance. */
const SLIDING_STANDS = new Set(['promo-stand-front', 'promo-stand-front-right']);
/** Largest four-sided stand footprint (core 2.0 + 0.5 shelf each side). */
const STAND_SIZE = 3.0;
const STEP = 0.5;
const MAX_SHIFT = 6.0;

function resolvedZ(p: FixturePlacement, backWallZ: number): number {
  const o = p.options || {};
  if (!o.relativeToBackWall) return p.position.z;
  const zOffset = typeof o.zOffset === 'number' ? o.zOffset : p.position.z;
  return Math.min(backWallZ + zOffset, FLOOR_FIXTURE_MAX_Z);
}

function standFootprint(p: FixturePlacement, x: number, z: number): Footprint {
  return { label: `fixture:${p.id}`, kind: 'fixture', cx: x, cz: z, w: STAND_SIZE, d: STAND_SIZE, yaw: p.yaw, clearance: FLOOR_DISPLAY_CLEARANCE };
}

/** Smallest clearance the validator reports for `label` (Infinity when it is clear). */
function worstGap(label: string, violations: ReturnType<typeof validateLayout>): number {
  let worst = Infinity;
  for (const v of violations) {
    if (v.a !== label && v.b !== label) continue;
    if (v.severity === 'error') return -1;
    const m = /only ([\d.]+) ft/.exec(v.message);
    worst = Math.min(worst, m ? Number(m[1]) : 0);
  }
  return worst;
}

/**
 * The front promo stands were hand-placed at fixed corridor x positions
 * (store-fixtures-config.ts, promoStandPlacements) tuned against the shelf
 * fields of a few library sizes. Other sizes and the herringbone arrangement
 * push angled shelving tips into that corridor, and the validator then
 * reports the stands at ~1 ft from a unit instead of FLOOR_DISPLAY_CLEARANCE.
 * This slides each sliding stand sideways, nearest candidate first, to the
 * first x that keeps the full clearance from every shelving unit, the store
 * walls and the other corridor fixtures; if no candidate clears, it keeps the
 * one with the widest gap. Returns new placement objects; inputs are untouched.
 */
export function clearPromoStandsOfShelving(
  placements: FixturePlacement[],
  obstacles: Footprint[],
  backWallZ: number,
  storeWidth: number,
): FixturePlacement[] {
  const bounds = { minX: STORE_CENTER_X - storeWidth / 2, maxX: STORE_CENTER_X + storeWidth / 2, minZ: backWallZ, maxZ: 15 };
  const placed: Footprint[] = [...obstacles];
  return placements.map((p) => {
    if (!SLIDING_STANDS.has(p.id)) return p;
    const z = resolvedZ(p, backWallZ);
    const base = p.position.x;
    const candidates = [base];
    for (let s = STEP; s <= MAX_SHIFT + 1e-9; s += STEP) candidates.push(base + s, base - s);
    let bestX = base, bestGap = -Infinity;
    for (const x of candidates) {
      const fp = standFootprint(p, x, z);
      const gap = worstGap(fp.label, validateLayout([fp, ...placed], bounds));
      if (gap === Infinity) { bestX = x; bestGap = gap; break; }
      if (gap > bestGap) { bestX = x; bestGap = gap; }
    }
    placed.push(standFootprint(p, bestX, z));
    if (bestX === base) return p;
    return { ...p, position: { x: bestX, z: p.position.z } };
  });
}
