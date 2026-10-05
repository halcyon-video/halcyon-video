import type { FixturePlacement } from '../store-layout.ts';
import { validateLayout, type Footprint } from '../layout-validator.ts';
import { deskGroundPlan } from '../entrance/desk-plan.ts';
import { vestibuleLayout } from '../vestibule-layout.ts';

export const GUMBALL_HEIGHT = 4;
// Both editable models are authored at 5.5 ft; scale their full construction uniformly.
export const GUMBALL_SCALE = GUMBALL_HEIGHT / 5.5;
export const GUMBALL_RADIUS = 1.05 * GUMBALL_SCALE;
export interface GumballShelf { footprint: Footprint; frontCap?: boolean; backCap?: boolean }
type CounterSpec = { counterShape: 'shield' | 'usquare' | 'desk'; entryStyle: 'vestibule' | 'storefront-door'; doorWidth: number };

/** Actual built shelf ends, including joined units. Negative world Z is deeper. */
export function gumballPlacement(shelves: readonly GumballShelf[], storeWidth: number, spec: CounterSpec): FixturePlacement {
  const backZ = vestibuleLayout(spec).backZ - .1;
  const apexZ = backZ - (spec.counterShape === 'usquare' ? 12 : 14.8);
  const counter = spec.counterShape === 'desk'
    ? deskGroundPlan({ storeCenterX: 11, storeWidth, frontGlassZ: 15, ...spec })
    : { frontX: 11, frontZ: apexZ };
  const make = (x: number, z: number, yaw: number, host?: string): FixturePlacement => ({
    id: 'gumball-machine', kind: 'gumball-machine', position: { x, z }, yaw,
    options: { hostShelf: host, placementRule: host ? 'deepest-game-endcap' : 'counter-entrance' },
  });
  if (shelves.length) {
    const ends = shelves.flatMap(({ footprint: f, frontCap, backCap }) => [-1, 1].flatMap(sign => {
      if (sign === 1 && frontCap === false || sign === -1 && backCap === false) return [];
      const support=GUMBALL_RADIUS*(Math.abs(Math.sin(f.yaw))+Math.abs(Math.cos(f.yaw)));
      const nominalX = f.cx + sign * Math.sin(f.yaw) * (f.d / 2 + support + .08);
      const x=Math.max(11-storeWidth/2+GUMBALL_RADIUS,Math.min(11+storeWidth/2-GUMBALL_RADIUS,nominalX));
      const z = f.cz + sign * Math.cos(f.yaw) * (f.d / 2 + support + .08);
      // Joined units and wall-facing ends are not exposed endcaps.
      if (Math.abs(x-nominalX)>GUMBALL_RADIUS || z + GUMBALL_RADIUS > 15) return [];
      if (validateLayout([{label:'machine',kind:'structure',cx:x,cz:z,w:GUMBALL_RADIUS*2,d:GUMBALL_RADIUS*2,yaw:0},f],
        {minX:-1e5,maxX:1e5,minZ:-1e5,maxZ:1e5},{minWalkway:0}).some(v=>v.severity==='error')) return [];
      if (shelves.some(({ footprint: other }) => {
        if (other === f) return false;
        const dx = x - other.cx, dz = z - other.cz, c = Math.cos(other.yaw), s = Math.sin(other.yaw);
        return Math.abs(dx*c-dz*s) < other.w/2+GUMBALL_RADIUS && Math.abs(dx*s+dz*c) < other.d/2+GUMBALL_RADIUS;
      })) return [];
      const depth = f.cz - Math.abs(Math.sin(f.yaw))*f.w/2 - Math.abs(Math.cos(f.yaw))*f.d/2;
      const distance = Math.hypot(counter.frontX - x, counter.frontZ - z);
      // Keep fixtures square or at 45 degrees while turning the coin face toward the counter.
      const yaw = Math.round(Math.atan2(counter.frontX-x, counter.frontZ-z)/(Math.PI/4))*Math.PI/4;
      return [{ depth, distance, placement: make(x,z,yaw,f.label) }];
    }));
    ends.sort((a,b) => a.depth-b.depth || a.distance-b.distance || a.placement.position.x-b.placement.position.x);
    if (ends[0]) return ends[0].placement;
    // A shelf entirely against walls has its customer-facing side available.
    // Keep the machine with games rather than silently selecting the no-games rule.
    const f = [...shelves].sort((a,b) => a.footprint.cz-b.footprint.cz)[0].footprint;
    return make(f.cx + Math.cos(f.yaw)*(f.w/2+GUMBALL_RADIUS+.08),
      f.cz - Math.sin(f.yaw)*(f.w/2+GUMBALL_RADIUS+.08), -Math.PI/2, f.label);
  }
  if (spec.counterShape === 'desk') return make(counter.frontX+GUMBALL_RADIUS+.12, counter.frontZ+1.1, Math.PI/2);
  if (spec.counterShape === 'usquare') return make(12.7, apexZ-GUMBALL_RADIUS-.12, 0);
  // Exterior of the entranceward right shoulder, next to the central peak.
  // Normal clearance uses the square proxy's projected diagonal half-extent.
  const along = 2.4, outward = GUMBALL_RADIUS*Math.SQRT2+.12;
  return make(11+(along+outward)*Math.SQRT1_2, apexZ+(along-outward)*Math.SQRT1_2, 0);
}
