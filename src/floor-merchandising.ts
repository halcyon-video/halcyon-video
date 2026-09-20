import { RETAIL_FIXTURE_SPECS, retailFixtureFootprint, type RetailFixtureKind } from './retail-fixture-specs.ts';
import { buildPromoCampaign } from './promo-campaigns.ts';
import { validateLayout, type Footprint } from './layout-validator.ts';
import type { FixturePlacement } from './store-layout.ts';
import type { Library } from './providers/media-source-provider.ts';

export const FLOOR_PROMOTION_TARGET = 9;
type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };

interface PromotionBlueprint {
  id: string;
  kind: string;
  campaign?: string[];
  options?: Record<string, unknown>;
  w: number;
  d: number;
  clearance: number;
}

const FLOOR_PROMOTION_BLUEPRINTS: PromotionBlueprint[] = [
  {
    id: 'floor-promotion-feature-title-0',
    kind: 'four-sided-display',
    campaign: ['feature-title:0'],
    w: 3, d: 3, clearance: 3,
  },
  {
    id: 'floor-promotion-feature-title-1',
    kind: 'four-sided-display',
    campaign: ['feature-title:1'],
    w: 3, d: 3, clearance: 3,
  },
  {
    id: 'floor-promotion-studio-feature-0',
    kind: 'four-sided-display',
    campaign: ['studio-feature:0'],
    w: 3, d: 3, clearance: 3,
  },
  {
    id: 'floor-promotion-studio-feature-1',
    kind: 'four-sided-display',
    campaign: ['studio-feature:1'],
    w: 3, d: 3, clearance: 3,
  },
  {
    id: 'floor-promotion-actor-spotlight-0',
    kind: 'four-sided-display',
    campaign: ['actor-spotlight:0'],
    w: 3, d: 3, clearance: 3,
  },
  {
    id: 'floor-promotion-actor-spotlight-1',
    kind: 'four-sided-display',
    campaign: ['actor-spotlight:1'],
    w: 3, d: 3, clearance: 3,
  },
  {
    id: 'floor-promotion-bargain-bin',
    kind: 'bargain-bin',
    options: { binIndex: 2, genre: 'Bargain Bin', noRentalCase: true, browseLookDown: true },
    w: 3, d: 3, clearance: 3,
  },
  {
    id: 'floor-promotion-pv-drape-table',
    kind: 'pv-drape-table',
    options: { colorway: 'purple', noRentalCase: true },
    w: 6.2, d: 2.7, clearance: 3,
  },
  {
    id: 'floor-promotion-popcorn-bin',
    kind: 'acrylic-popcorn-bin',
    w: 2.2, d: 2.2, clearance: 3,
  },
  {
    id: 'floor-promotion-rotating-merchandiser',
    kind: 'rotating-merchandiser',
    w: 2.2, d: 2.2, clearance: 3,
  },
];

/** Populate available floor pockets with a varied retail promotion programme.
 * Nine movie-floor displays; popcorn belongs to the checkout queue:
 * - 2 single-film displays (feature-title:0, 1)
 * - 2 studio subjects (studio-feature:0, 1)
 * - 2 actor subjects (actor-spotlight:0, 1)
 * - 2 sale fixtures (bargain-bin, pv-drape-table)
 * - 1 rotating impulse rack (rotating-merchandiser / #275)
 */
export function floorPromotionPlacements(
  libraries: Library[],
  obstacles: Footprint[],
  bounds: Bounds,
  existing = 0,
): FixturePlacement[] {
  const needed = Math.max(0, FLOOR_PROMOTION_TARGET - existing);
  if (!needed || !libraries.some((l) => l.movies.length)) return [];

  const viable = FLOOR_PROMOTION_BLUEPRINTS.filter(bp => {
    if (bp.kind === 'acrylic-popcorn-bin') return false; // Checkout concessions, never the movie/game floor.
    if (bp.campaign) return Boolean(buildPromoCampaign(bp.campaign, libraries, 3, 3));
    // Match the reused sale fixtures' stock contracts rather than reserving
    // floor space for an empty movie table in a series-only library.
    if (bp.kind === 'bargain-bin' && obstacles.some(o => o.label === `fixture:${bp.id}`)) return false;
    if (bp.kind === 'bargain-bin') return libraries.some(l => l.movies.some(m => !m.isSeries));
    if (bp.kind === 'pv-drape-table') return libraries.some(l => l.movies.some(m =>
      !m.isSeries && !m.game && !m.comingSoon && !m.discovery && !m.collectionGap));
    return true;
  });
  if (!viable.length) return [];

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const placed: Footprint[] = [...obstacles];
  const result: FixturePlacement[] = [];
  // Existing towers count toward nine. Checkout popcorn is counted separately.
  // Prioritize sale fixtures, then distinct subjects before duplicates.
  const priority = [6, 7, 8, 9, 0, 2, 4, 1, 3, 5];
  for (const index of priority) {
    const bp = FLOOR_PROMOTION_BLUEPRINTS[index];
    if (!viable.includes(bp) || result.length >= needed) continue;
    const candidates: Footprint[] = [];
    for (let z = bounds.minZ + 8; z <= Math.min(-9, bounds.maxZ - 24); z += 1.5) {
      for (let x = bounds.minX + 6; x <= bounds.maxX - 6; x += 1.5) {
        const fp: Footprint = { label: `fixture:${bp.id}`, kind: 'fixture',
          cx: x, cz: z, w: bp.w, d: bp.d, yaw: 0, clearance: bp.clearance };
        if (fits(fp, placed, bounds)) candidates.push(fp);
      }
    }
    const displays = placed.filter(o => o.kind === 'fixture' && o.clearance);
    const score = (p: Footprint) => displays.length
      ? Math.min(...displays.map(o => Math.hypot(p.cx - o.cx, p.cz - o.cz)))
      : -Math.hypot(p.cx - centerX, p.cz - (bounds.minZ - 9) / 2);
    candidates.sort((a, b) => score(b) - score(a) || b.cz - a.cz || a.cx - b.cx);
    const chosen = candidates[0];
    if (!chosen) continue; // A smaller later family may still fit safely.
    result.push({ id: bp.id, kind: bp.kind, position: { x: chosen.cx, z: chosen.cz }, yaw: 0,
      options: bp.campaign ? { campaigns: bp.campaign, ...bp.options } : bp.options });
    placed.push(chosen);
  }
  return result;
}

function fits(fp: Footprint, obstacles: Footprint[], bounds: Bounds): boolean {
  if (validateLayout([fp], bounds).length) return false;
  return obstacles.every(o => {
    // The shared validator permits exact-touch joins for chained shelving.
    // Freestanding fixtures need a real approach even at that boundary:
    // test the clearance envelope as geometry, not just the reported gap.
    const gap = Math.max(fp.clearance ?? 0, o.clearance ?? 0, o.kind === 'structure' ? 0 : 1.5) + .02;
    const padded = { ...fp, w: fp.w + 2 * gap, d: fp.d + 2 * gap, clearance: 0 };
    return !validateLayout([padded, { ...o, clearance: 0 }], bounds, { minWalkway: 0 })
      .some(v => v.b && v.severity === 'error');
  });
}

/** A single concessions run facing checkout, with bargain bins on its far side.
 * The owner sketch fixes the order and adjacency, not surveyed dimensions.
 * Admit the whole run together: individual gap-filling scatters its members.
 */
export function frontRefreshmentPlacements(obstacles: Footprint[], bounds: Bounds): FixturePlacement[] {
  const yaw = Math.PI / 4, c = Math.cos(yaw), s = Math.sin(yaw);
  const kinds: RetailFixtureKind[] = ['candy-wall-gondola', 'acrylic-popcorn-bin', 'two-door-cooler'];
  const width = kinds.reduce((sum,k)=>sum+RETAIL_FIXTURE_SPECS[k].w,0), depth=2.6;
  let run: Footprint | undefined;
  for(let offset=0;offset<=8 && !run;offset+=.5) for(const dz of [0,-.5,.5,-1,1,-1.5,1.5]) {
    const x=1-offset, z=-7+dz;
    const fp:Footprint={label:'concessions run',kind:'fixture',cx:x,cz:z,w:width,d:depth,yaw,clearance:3};
    if(fits(fp,obstacles,bounds)) {run=fp;break;}
  }
  if(!run) return [];
  let along=-width/2;
  const result:FixturePlacement[]=kinds.map(kind=>{
    const spec=RETAIL_FIXTURE_SPECS[kind], u=along+spec.w/2;
    // Flush fronts, joined ends: this is one retail run, not three aisles.
    const v=(depth-spec.d)/2; along+=spec.w;
    return {id:`${kind}-front`,kind,position:{x:run!.cx+u*c+v*s,z:run!.cz-u*s+v*c},yaw};
  });
  const placed=[...obstacles,run];
  for(const [index,id] of ['bargain-bin-1','floor-promotion-bargain-bin'].entries()) {
    let chosen:Footprint|undefined;
    // Across the rear aisle; slide toward the outer wall if shelves occupy
    // the first pocket. Keep the counters and the exit side unobstructed.
    for(const u of [0,-6.1,6.1,-12.2,12.2]) {
      for(const v of [-6.5,-8,-9.5]) {
        const fp:Footprint={label:`fixture:${id}`,kind:'fixture',cx:run.cx+u*c+v*s,
          cz:run.cz-u*s+v*c,w:3,d:3,yaw,clearance:3};
        if(fits(fp,placed,bounds)) {chosen=fp;break;}
      }
      if(chosen) break;
    }
    if(chosen) {
      result.push({id,kind:'bargain-bin',position:{x:chosen.cx,z:chosen.cz},yaw,
        options:{binIndex:index+1,genre:'Bargain Bin',noRentalCase:true,browseLookDown:true}});
      placed.push(chosen);
    }
  }
  // The additional freezer keeps a separate pocket outside the sketched run.
  freezer: for(const offset of [4,8,12]) for(let z=6;z>=-8;z-=.5) {
    const p:FixturePlacement={id:'chest-freezer-front',kind:'chest-freezer',
      position:{x:run.cx-width/2-offset,z},yaw:Math.PI/2};
    const fp={...retailFixtureFootprint('chest-freezer',p),clearance:3};
    if(fits(fp,placed,bounds)) {result.push(p);break freezer;}
  }
  return result;
}

/** Keep the era-specific sale table, but admit it against the live counters. */
export function placeFloorSaleTable(placement: FixturePlacement, obstacles: Footprint[], bounds: Bounds): FixturePlacement | null {
  for (let z = 6; z >= bounds.minZ + 6; z -= 1.5) {
    for (const x of [-11, 33, -18, 40, 11]) {
      const fp: Footprint = {label: placement.id,kind:'fixture',cx:x,cz:z,w:6.2,d:2.7,yaw:0,clearance:3};
      if (fits(fp,obstacles,bounds)) return {...placement,position:{x,z}};
    }
  }
  return null;
}
