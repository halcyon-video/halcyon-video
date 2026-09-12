import type { FixturePlacement } from '../store-layout.ts';
import type { Movie } from '../jellyfin.ts';
import type { Footprint } from '../layout-validator.ts';

/** Original corner millwork, feet. Store-left/back is (-X,-Z). */
export const CLUBHOUSE = { size: 14, reserve: 20, height: 10.6, ceiling: 13.5, entryHead: 7.21, shelfDepth: 1.2 } as const;
export interface ClubhouseHost { center: { x: number; z: number }; width: number; depth: number;
  yaw: number; familyTitles: number; reserved: boolean; carpeted: boolean; }
export function familyStock(movies: Movie[]): Movie[] {
  return movies.filter(m => !m.game && (m.genres ?? []).some(g => /^(family|children|kids)$/i.test(g)));
}
export function clubhouseEligible(theme: string, format: string, width: number, ceiling: number, familyTitles: number): boolean {
  return theme === 'bb-1990' && format === 'corporate' && width >= 64 && ceiling >= CLUBHOUSE.ceiling && familyTitles > 0;
}
export function clubhouseHost(left: number, back: number, familyTitles: number): ClubhouseHost {
  return { center: { x: left + 7.2, z: back + 7.2 }, width: 14, depth: 14,
    yaw: 0, familyTitles, reserved: true, carpeted: true };
}
/** Individual solids, not the walkable interior or overhead fascia. */
export function clubhouseFeet(host: ClubhouseHost): Footprint[] {
  const rects: [string, number, number, number, number, number][] = [
    ['rear',0,-6.9,13.6,.2,0], ['left',-6.9,0,.2,13.6,0],
    ['front-panel',-3.2,6.9,7.4,.2,0], ['side-panel',6.9,-3.2,.2,7.4,0],
    ['front-jamb',.75,6.85,.5,.5,0], ['side-jamb',6.85,.75,.5,.5,0],
    ['tv-cabinet',-4.9,-4.9,3.5,3.5,0],
    ...[-5.1,-1.4].flatMap((u,i): [string,number,number,number,number,number][] => [
      [`family-front-${i}`,u,7.6,3.7,1.2,0], [`family-side-${i}`,7.6,u,3.7,1.2,Math.PI/2],
    ]),
  ];
  return rects.map(([name,x,z,w,d,yaw]) => ({ label:`fixture:clubhouse-${name}`,kind:'fixture',
    cx:host.center.x+x,cz:host.center.z+z,w,d,yaw,clearance:0 }));
}

/** Chairs admitted only by the built 1990 clubhouse host.
 * Local -X is the television side wall; the diagonal approach stays clear. */
export function childrenChairPlacements(host?: {
  center: { x: number; z: number }; yaw: number;
  width: number; depth: number; familyTitles: number;
  carpeted: boolean; reserved: boolean; theme?: string;
}): FixturePlacement[] {
  if (!host || host.theme !== 'bb-1990' || !host.reserved || !host.carpeted || host.familyTitles < 1 ||
      ![host.width, host.depth, host.yaw, host.center.x, host.center.z, host.familyTitles].every(Number.isFinite) ||
      host.width < 8 || host.depth < 11.5) return [];
  // The chairs face the wedge TV cabinet in the (-6.65, -6.65) corner.
  const x = -2.5, z = -2.5;
  return [{ id: 'children-chair-pair', kind: 'children-chair',
    position: { x: host.center.x + x * Math.cos(host.yaw) + z * Math.sin(host.yaw), z: host.center.z - x * Math.sin(host.yaw) + z * Math.cos(host.yaw) },
    yaw: host.yaw - 3*Math.PI/4, options: { admitted: true, pair: true } }];
}
