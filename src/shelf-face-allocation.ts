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
  constructor(physical: ShelvingUnit[], original: Map<number, ShelfBlock[]>, stocked?: Map<number, number>, libOrder?: number[]) {
    const rows = new Map<number, ShelvingUnit[]>();
    for (const u of physical) { const row = rows.get(u.rowGroupId) ?? []; row.push(u); rows.set(u.rowGroupId,row); }
    const fixedRow = (row: ShelvingUnit[]) => row.some(u=>u.singleSided);
    const orderedRow = (row: ShelvingUnit[]) => row.slice().sort((a,b)=> a.browseSign < 0 ? b.lineId-a.lineId || b.posInLine-a.posInLine : a.lineId-b.lineId || a.posInLine-b.posInLine);
    // Planned faces: every (library, block) pair gets the physical face the
    // plan poured it onto. A row planned for several libraries pours its whole
    // front before its rear.
    type Face = { unit: ShelvingUnit; side: ShelfSide };
    type Item = Face & { libraryIdx: number; block: number; movable: boolean };
    const planned = new Map<number, Item[]>();
    for (const row of rows.values()) {
      const libs = [...new Set(row.map(u=>u.libraryIdx))];
      const shared = libs.length > 1 && !fixedRow(row);
      const ordered = orderedRow(row);
      const faces = [...ordered.map(unit=>({unit,side:'front' as const})), ...ordered.slice().reverse().filter(u=>!u.singleSided).map(unit=>({unit,side:'back' as const}))];
      const blocks = libs.flatMap(libraryIdx => {
        const local = physical.filter(u=>u.libraryIdx===libraryIdx);
        return (original.get(libraryIdx) ?? []).flatMap((bo, block)=> row.includes(local[bo.unit]) ? [{libraryIdx,block,unit:local[bo.unit],side:bo.side}] : []);
      });
      blocks.forEach((source,index)=> {
        const face = shared ? faces[index] : {unit:source.unit,side:source.side};
        const list = planned.get(source.libraryIdx) ?? [];
        list.push({...face,libraryIdx:source.libraryIdx,block:source.block,movable:!fixedRow(row)});
        planned.set(source.libraryIdx,list);
      });
    }
    // Pack libraries at face granularity: stocked blocks take consecutive faces
    // in library order, so the next library starts on the bay after the last
    // stocked one. The faces left over are empty and pool at the end of the
    // last library's run. Wall/room faces and libraries with no stock stay put.
    const final: Item[] = [];
    const sequence: Item[] = [];
    const stockedOf = (lib: number) => stocked?.get(lib) ?? Infinity;
    for (const lib of libOrder ?? [...planned.keys()].sort((a,b)=>a-b)) {
      const list = (planned.get(lib) ?? []).slice().sort((a,b)=>a.block-b.block);
      for (const item of list) (item.movable && stockedOf(lib) > 0 ? sequence : final).push(item);
    }
    const stockedItems = sequence.filter(item=>item.block < stockedOf(item.libraryIdx));
    const tailLib = sequence.length ? sequence[sequence.length-1].libraryIdx : -1;
    stockedItems.forEach((item,i)=> final.push({...item,unit:sequence[i].unit,side:sequence[i].side}));
    let nextBlock = Math.max(stockedOf(tailLib), ...final.filter(item=>item.libraryIdx===tailLib).map(item=>item.block+1));
    sequence.slice(stockedItems.length).forEach(face=> final.push({...face,libraryIdx:tailLib,block:nextBlock++}));
    const assigned = new Map<ShelvingUnit, Partial<Record<ShelfSide, Item>>>();
    for (const item of final) { const own = assigned.get(item.unit) ?? {}; own[item.side] = item; assigned.set(item.unit,own); }

    const ordinary = new Map<ShelvingUnit,ShelvingUnit>();
    const views = new Map<number, { unit: ShelvingUnit; block: number; physical: ShelvingUnit; side: ShelfSide; viewSide: ShelfSide }[]>();
    for (const row of rows.values()) {
      const ordered = orderedRow(row);
      const faces = [...ordered.map(unit=>({unit,side:'front' as const})), ...ordered.slice().reverse().filter(u=>!u.singleSided).map(unit=>({unit,side:'back' as const}))]
        .flatMap(face=> assigned.get(face.unit)?.[face.side] ? [{...face,item:assigned.get(face.unit)![face.side]!}] : []);
      const shared = new Set(faces.map(face=>face.item.libraryIdx)).size > 1 && !fixedRow(row);
      for (const face of faces) {
        const lib = face.item.libraryIdx;
        const view = shared ? { ...face.unit, libraryIdx:lib,
          singleSided:true, browseSign:(face.side==='front'?face.unit.browseSign:-face.unit.browseSign) as 1|-1,
          rowGroupId:-face.unit.rowGroupId*2-(face.side==='back'?2:1),
        } : ordinary.get(face.unit) ?? { ...face.unit, libraryIdx:lib };
        if (!shared) ordinary.set(face.unit,view);
        const list=views.get(lib) ?? [];
        list.push({unit:view,block:face.item.block,physical:face.unit,side:face.side,viewSide:shared?'front':face.side});
        views.set(lib,list);
      }
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
