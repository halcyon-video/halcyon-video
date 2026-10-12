import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { prioritizeInitialPlacements, placementBudget } from '../src/progressive-placement.ts';
import type { MovieSlot } from '../src/store-layout.ts';
function slot(x:number,z:number,initial=true):MovieSlot { return { restingX:x,restingY:0,restingZ:z,needsInitialMatrixUpdate:initial,hidden:false } as MovieSlot; }
test('approached bay fronts receive existing placement budget before previously queued distant aisles',()=>{
 const camera=new PerspectiveCamera(60,1,.1,100);camera.updateProjectionMatrix();
 const distant=slot(40,-5),front=slot(0,-4),behind=slot(0,4),farther=slot(0,-12);
 const queued=new Set([distant,behind,farther,front]);
 const order=prioritizeInitialPlacements(queued,camera);
 const admit=placementBudget(()=>0,1,2);
 const admitted=order.filter(s=>s.needsInitialMatrixUpdate && admit());
 assert.deepEqual(admitted,[front]);
 assert.deepEqual([...queued],[distant,behind,farther,front],'catalog insertion order remains intact');
 assert.equal(new Set(order).size,queued.size,'every dirty slot remains in the drain');
 front.needsInitialMatrixUpdate=false;
 assert.equal(prioritizeInitialPlacements(queued,camera)[0],farther,'placed front no longer competes with pending visible stock');
});
test('turning to a previously distant shelf changes placement priority without adding a separate budget',()=>{
 const camera=new PerspectiveCamera(60,1,.1,100);camera.updateProjectionMatrix();
 const left=slot(-5,-5),right=slot(5,-5),queued=new Set([left,right]);
 camera.lookAt(5,0,-5);
 assert.equal(prioritizeInitialPlacements(queued,camera)[0],right);
 camera.lookAt(-5,0,-5);
 assert.equal(prioritizeInitialPlacements(queued,camera)[0],left);
});
test('large visible stock uses a 96-slot priority window and reuses its scratch result',()=>{
 const camera=new PerspectiveCamera(60,1,.1,100);camera.updateProjectionMatrix();
 const original=Array.from({length:300},(_,i)=>slot(0,-(6-i/100)));
 const queued=new Set(original),ordered=prioritizeInitialPlacements(queued,camera);
 const priority=ordered.slice(0,96),chosen=new Set(priority);
 assert.equal(priority[0],original[299]);assert.equal(priority[95],original[204]);
 assert.deepEqual(ordered.slice(96),original.filter(s=>!chosen.has(s)),'non-priority stock keeps insertion order');
 assert.equal(prioritizeInitialPlacements(queued,camera),ordered,'scratch array is reused');
});
