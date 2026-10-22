import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShelfFaceAllocation } from '../src/shelf-face-allocation.ts';
import type { ShelvingUnit } from '../src/store-layout.ts';
const unit=(libraryIdx:number,posInLine:number,browseSign:1|-1=1):ShelvingUnit=>({libraryIdx,unitIdxInLibrary:0,cols:12,xCenter:10,zPos:posInLine===0?0:-posInLine*8,anchorX:10,lineId:2,rowGroupId:2,posInLine,isLineFront:posInLine===0,isLineBack:posInLine===1,yaw:0,browseSign});
function shared(sign:1|-1=1){
 const physical=[unit(0,0,sign),unit(1,1,sign)];
 const order=new Map([0,1].map(lib=>[lib,[{unit:0,side:'front' as const},{unit:0,side:'back' as const}]]));
 return {physical,a:new ShelfFaceAllocation(physical,order)};
}
for(const sign of [1,-1] as const) test(`library fills whole shared front before the rear, browse sign ${sign}`,()=>{
 const {physical,a}=shared(sign), cartoon=a.units.get(0)!,anime=a.units.get(1)!;
 assert.equal(physical.length,2,'no added physical geometry');
 assert.equal(cartoon.length,2);assert.equal(anime.length,2);
 assert.deepEqual(cartoon.map(u=>u.browseSign),[sign,sign]);
 assert.deepEqual(anime.map(u=>u.browseSign),[-sign,-sign]);
 assert.ok([...cartoon,...anime].every(u=>u.singleSided));
 assert.equal(a.owner(physical[0],'front')!.libraryIdx,0);
 assert.equal(a.owner(physical[1],'front')!.libraryIdx,0);
 assert.equal(a.owner(physical[0],'back')!.libraryIdx,1);
 assert.equal(a.owner(physical[1],'back')!.libraryIdx,1);
 for(const lib of [0,1]) {
  const views=a.units.get(lib)!;
  assert.deepEqual(a.orders.get(lib),[{unit:0,side:'front'},{unit:1,side:'front'}]);
  assert.deepEqual(views.map(u=>u.unitIdxInLibrary),[0,1]);
 }
 assert.equal(cartoon[0].zPos,sign===1?0:-8);
 assert.equal(anime[0].zPos,sign===1?-8:0);
 assert.notEqual(cartoon[0].rowGroupId,anime[0].rowGroupId);
});
test('ordinary row retains two-face snake and physical front-order unit ids',()=>{
 const physical=[unit(0,0),{...unit(0,1),unitIdxInLibrary:1}];
 const snake=[{unit:0,side:'front' as const},{unit:1,side:'front' as const},{unit:1,side:'back' as const},{unit:0,side:'back' as const}];
 const a=new ShelfFaceAllocation(physical,new Map([[0,snake]]));
 assert.deepEqual(a.orders.get(0),snake);
 assert.ok(a.units.get(0)!.every(u=>!u.singleSided));
 assert.deepEqual(a.units.get(0)!.map(u=>u.unitIdxInLibrary),[0,1]);
 assert.deepEqual(physical.map(u=>u.unitIdxInLibrary),[0,1],'allocation does not alter geometry ids');
});
test('alias numbering remains continuous when an ordinary row follows shared faces',()=>{
 const {physical}=shared();
 const next={...unit(0,0),rowGroupId:7,lineId:7,zPos:-30,unitIdxInLibrary:1}; physical.push(next);
 const snake=[{unit:0,side:'front' as const},{unit:0,side:'back' as const},{unit:1,side:'front' as const},{unit:1,side:'back' as const}];
 const a=new ShelfFaceAllocation(physical,new Map([[0,snake],[1,[{unit:0,side:'front'},{unit:0,side:'back'}]]]));
 assert.deepEqual(a.units.get(0)!.map(u=>u.unitIdxInLibrary),[0,1,2]);
 assert.deepEqual(a.orders.get(0),[{unit:0,side:'front'},{unit:1,side:'front'},{unit:2,side:'front'},{unit:2,side:'back'}]);
 assert.equal(next.unitIdxInLibrary,1);
});
// #395: a library's unstocked trailing faces must not sit between it and the
// next library's first block.
test('next library starts on the bay after the last stocked block; slack pools at the end',()=>{
 const physical=[0,1,2].map(i=>({...unit(i<2?0:1,i),rowGroupId:i,lineId:i,zPos:-i*8,isLineFront:true,isLineBack:true}));
 const snake=[{unit:0,side:'front' as const},{unit:1,side:'front' as const},{unit:1,side:'back' as const},{unit:0,side:'back' as const}];
 const a=new ShelfFaceAllocation(physical,new Map([[0,snake],[1,[{unit:0,side:'front'},{unit:0,side:'back'}]]]),new Map([[0,3],[1,2]]),[0,1]);
 // library 0 has three stocked blocks of four, library 1 two of two
 assert.equal(a.owner(physical[0],'front')!.libraryIdx,0);
 assert.equal(a.owner(physical[1],'front')!.libraryIdx,0);
 assert.equal(a.owner(physical[1],'back')!.libraryIdx,0);
 assert.equal(a.owner(physical[1],'back')!.block,2);
 assert.equal(a.owner(physical[0],'back')!.libraryIdx,1,'library 1 takes the slack face');
 assert.equal(a.owner(physical[0],'back')!.block,0);
 assert.equal(a.owner(physical[2],'front')!.libraryIdx,1);
 assert.equal(a.owner(physical[2],'front')!.block,1);
 const slack=a.owner(physical[2],'back')!;
 assert.equal(slack.libraryIdx,1,'slack pools on the last library');
 assert.ok(slack.block>=2,'slack blocks sit beyond the last library stock');
 assert.equal(a.orders.get(0)!.length,3,'library 0 keeps only stocked blocks');
});
test('singleSided faces and libraries without stock are not repacked',()=>{
 const wall={...unit(0,0),rowGroupId:5,lineId:5,singleSided:true};
 const floor={...unit(1,0),rowGroupId:6,lineId:6};
 const a=new ShelfFaceAllocation([wall,floor],new Map([[0,[{unit:0,side:'front'}]],[1,[{unit:0,side:'front'},{unit:0,side:'back'}]]]),new Map([[0,0],[1,1]]),[0,1]);
 assert.equal(a.owner(wall,'front')!.libraryIdx,0);
 assert.equal(a.owner(floor,'front')!.libraryIdx,1);
 assert.equal(a.owner(floor,'back')!.libraryIdx,1);
});
