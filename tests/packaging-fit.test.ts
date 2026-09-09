import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rentalRestZ, shelfCasePacking } from '../src/packaging-fit.ts';

// Independently project closed box corners, rather than repeat the placement
// formula. The old offsets penetrated the center backing and stacked shells.
for (const [label,rh,rd,sh,sd] of [
  ['VHS',.667,.092,.727,.104], ['large white',8.75/12,1.25/12,.727,.104],
  ['single jewel',4.9/12,.4/12,.667,.045], ['four-disc jewel',4.9/12,.72/12,.667,.045],
  ['landscape carton',5.25/12,.0917,.727,.104], ['DVD',.667,.045,.667,.045],
] as const) for (const tilt of [-.175,-.25]) {
 test(`${label}, lean ${tilt}: paper/plastic pair and backstock clear backing, neighbors and deck lip`,()=>{
  const lift=(sh-rh)/2, z=rentalRestZ(rd,sd,lift,tilt);
  // Pair separation measured along their normal, including relative height.
  const separation=(rd/2-z)*Math.cos(tilt)+lift*Math.sin(tilt);
  assert.ok(separation >= (rd+sd)/2+.00199);
  for(const halfDeck of [.72,1.0]) {
   const p=shelfCasePacking(rh,rd,sh,sd,tilt,halfDeck,2); assert.equal(p.fits,true);
   assert.ok(p.count>=0 && p.count<=2);
   const origin=p.offset-rh/2*Math.abs(Math.sin(tilt));
   let rear=Infinity, front=-Infinity;
   for(const y of [-sh/2,sh/2]) for(const zz of [-sd/2,sd/2]) rear=Math.min(rear,origin+z-p.pitch*p.count+y*Math.sin(tilt)+zz*Math.cos(tilt));
   for(const y of [-rh/2,rh/2]) for(const zz of [-rd/2,rd/2]) front=Math.max(front,origin+rd/2+y*Math.sin(tilt)+zz*Math.cos(tilt));
   assert.ok(rear >= .25599,`${rear} clips backing`);assert.ok(front <= halfDeck-.00599,`${front} overhangs deck`);
   assert.ok(p.pitch*Math.cos(tilt)>=sd+.00399,'copies intersect');
  }
 });
}
test('a shallow shelf explicitly reports an unfit main pair',()=>{
 assert.equal(shelfCasePacking(.729,.104,.727,.104,-.25,.4,2).fits,false);
});
