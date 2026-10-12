import type { ShelvingUnit } from './store-layout.ts';
export type ShelfSide = 'front' | 'back';
export interface ShelfBlock { unit: number; side: ShelfSide }
export interface ShelfFaceOwner { libraryIdx: number; unitIdx: number; side: ShelfSide; block: number }
/** Keep geometry unique; on a shared row, pour entire front before the rear.
 * Single-face library views carry the physical face's browse direction, so all
 * stock and navigation consumers can keep their ordinary library-local keys.
 */
export class ShelfFaceAllocation {
  readonly units = new Map<number, ShelvingUnit[]>();
  readonly orders = new Map<number, ShelfBlock[]>();
  private owners = new Map<ShelvingUnit, Partial<Record<ShelfSide, ShelfFaceOwner>>>();
  constructor(physical: ShelvingUnit[], original: Map<number, ShelfBlock[]>) {
    const rows = new Map<number, ShelvingUnit[]>();
    for (const u of physical) { const row = rows.get(u.rowGroupId) ?? []; row.push(u); rows.set(u.rowGroupId,row); }
    const ordinary = new Map<ShelvingUnit,ShelvingUnit>();
    const views = new Map<number, { unit: ShelvingUnit; block: number; physical: ShelvingUnit; side: ShelfSide; viewSide: ShelfSide }[]>();
    for (const row of rows.values()) {
      const libs = [...new Set(row.map(u=>u.libraryIdx))];
      const shared = libs.length > 1 && !row.some(u=>u.singleSided);
      const ordered = row.slice().sort((a,b)=> a.browseSign < 0 ? b.lineId-a.lineId || b.posInLine-a.posInLine : a.lineId-b.lineId || a.posInLine-b.posInLine);
      const faces = [...ordered.map(unit=>({unit,side:'front' as const})), ...ordered.slice().reverse().filter(u=>!u.singleSided).map(unit=>({unit,side:'back' as const}))];
      const blocks = libs.flatMap(libraryIdx => {
        const local = physical.filter(u=>u.libraryIdx===libraryIdx);
        return (original.get(libraryIdx) ?? []).flatMap((bo, block)=> row.includes(local[bo.unit]) ? [{libraryIdx,block,unit:local[bo.unit],side:bo.side}] : []);
      });
      blocks.forEach((source,index)=> {
        const face = shared ? faces[index] : {unit:source.unit,side:source.side};
        const view = shared ? { ...face.unit, libraryIdx:source.libraryIdx,
          singleSided:true, browseSign:(face.side==='front'?face.unit.browseSign:-face.unit.browseSign) as 1|-1,
          rowGroupId:-face.unit.rowGroupId*2-(face.side==='back'?2:1),
        } : ordinary.get(face.unit) ?? { ...face.unit };
        if (!shared) ordinary.set(face.unit,view);
        const list=views.get(source.libraryIdx) ?? [];
        list.push({unit:view,block:source.block,physical:face.unit,side:face.side,viewSide:shared?'front':source.side});
        views.set(source.libraryIdx,list);
      });
    }
    for (const [lib, list] of views) {
      list.sort((a,b)=>a.block-b.block);
      const units: ShelvingUnit[]=[];
      const order: ShelfBlock[]=[];
      for (const entry of list) {
        let index=units.indexOf(entry.unit);
        if(index<0) { index=units.length; units.push(entry.unit); }
        // Unshared physical units retain original front-order numbering.
        // Shared single-face views are numbered in their exact stock order.
        order[entry.block]={unit:index,side:entry.viewSide};
        const owned=this.owners.get(entry.physical) ?? {};
        owned[entry.side]={libraryIdx:lib,unitIdx:index,side:entry.viewSide,block:entry.block};
        this.owners.set(entry.physical,owned);
      }
      // Retain physical front numbering for ordinary rows: reverse back faces
      // must refer to the same unit as their matching front.
      units.forEach((u,i)=> { u.unitIdxInLibrary=i; });
      this.units.set(lib,units);this.orders.set(lib,order);
    }
  }
  owner(unit: ShelvingUnit, side: ShelfSide): ShelfFaceOwner | undefined { return this.owners.get(unit)?.[side]; }
}
