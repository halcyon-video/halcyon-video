import type { StorePlan } from './store-plan';
import type { JellyfinLibrary, Movie } from './jellyfin';
import type { ClerkNavGrid, NavPoint } from './clerk-nav';
import type { SlottedFixture } from './fixtures';
import { SECTION_CAPACITY, UNIT_DEPTH, UNIT_SECTIONS, UNIT_SIDE_CAPACITY, isUnstockedTitle } from './store-layout';
import { customerDepartment } from './customer-preferences';
import { CUSTOMER_SEPARATION, type CustomerStop } from './customer-simulation';

/** Only actual stocked shelf sections get destinations; empty props/walls do not. */
export function customerStops(plan: StorePlan, libraries: readonly JellyfinLibrary[], fixtures: readonly SlottedFixture[],
  nav: ClerkNavGrid, exit: NavPoint, checkout: NavPoint): CustomerStop[] {
  const result: CustomerStop[] = [];
  function add(stop: CustomerStop) {
    const safe = nav.nearestWalkable(stop.x, stop.z, .75);
    if (!safe || !nav.findPath(exit.x, exit.z, safe.x, safe.z)) return;
    // Shopping never reserves the door, central entrance approach or register.
    if (Math.hypot(safe.x-exit.x,safe.z-exit.z)<4 || Math.hypot(safe.x-checkout.x,safe.z-checkout.z)<4) return;
    if (result.some(p=>Math.hypot(p.x-safe.x,p.z-safe.z)<CUSTOMER_SEPARATION+.15)) return;
    result.push({...stop,...safe});
  }
  for (const [i, unit] of plan.shelvingUnits.entries()) {
    const library = libraries[unit.libraryIdx], layout = plan.layoutFor(unit.libraryIdx);
    if (!library) continue;
    for (const side of ['front','back'] as const) {
      if (unit.singleSided && side==='back') continue;
      const block = plan.blockIndexOf(unit.libraryIdx, unit.unitIdxInLibrary, side);
      const physicalSide = (side==='front' ? unit.browseSign : -unit.browseSign);
      for (let section=0; section<UNIT_SECTIONS; section++) {
        const start = block*UNIT_SIDE_CAPACITY+section*SECTION_CAPACITY;
        const stock = layout.entries.slice(start,start+SECTION_CAPACITY).filter((m):m is Movie=>!!m && (!isUnstockedTitle(m)||!!m.streaming));
        if (!stock.length) continue;
        const col = (section+.5)*unit.cols/UNIT_SECTIONS-.5;
        const z = plan.aisleColZ(unit,col,side);
        const face = plan.unitToWorld(unit,unit.xCenter+physicalSide*UNIT_DEPTH/2,z);
        const point = plan.unitToWorld(unit,unit.xCenter+physicalSide*(UNIT_DEPTH/2+1.7),z);
        const label = layout.sectionLabels.get(String(block*UNIT_SECTIONS+section));
        const departments = library.games ? ['games'] : label ? [customerDepartment(label)]
          : [...new Set(stock.flatMap(m=>m.genres).map(customerDepartment))];
        add({...point,id:`shelf:${i}:${side}:${section}`,yaw:Math.atan2(face.x-point.x,face.z-point.z),departments:departments.length?departments:[library.name.toLowerCase()]});
      }
    }
  }
  for (const fixture of fixtures) {
    if (!fixture.placement.id.startsWith('game-section')) continue;
    // Slot transforms already describe the stocked front/back/platform bays.
    for (const slot of fixture.getSlots()) {
      if (slot.shelfIdx!==0 || slot.displayCopy || isUnstockedTitle(slot.movie)&&!slot.movie.streaming) continue;
      const dx=Math.sin(slot.restingRotY), dz=Math.cos(slot.restingRotY);
      add({id:slot.key,x:slot.restingX+dx*1.8,z:slot.restingZ+dz*1.8,
        yaw:Math.atan2(-dx,-dz),departments:['games']});
    }
  }
  return result;
}
