import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {isBluRayCase, BLURAY_KEEPCASE_DIMS} from '../src/packaging-formats.ts';
async function load(detail:string){
 const b=readFileSync(new URL(`../public/models/packaging-bluray-keepcase-${detail}.glb`,import.meta.url));
 const {scene}=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');scene.updateMatrixWorld(true);
 return {scene,bytes:b.length};
}
test('blu-ray selection is explicit, DVD-medium and movie-only',()=>{
 const m={packaging:'bluray-keepcase' as const};
 assert.equal(isBluRayCase(m,'dvd'),true);
 assert.equal(isBluRayCase(m,'vhs'),false);
 assert.equal(isBluRayCase({...m,game:true},'dvd'),false);
 assert.equal(isBluRayCase({...m,isSeries:true},'dvd'),false);
 assert.equal(isBluRayCase({},'dvd'),false);
 assert.ok(BLURAY_KEEPCASE_DIMS.h<.667&&BLURAY_KEEPCASE_DIMS.w===.445&&BLURAY_KEEPCASE_DIMS.d<.045);
});
test('blu-ray models match declared bounds, art roles and cost bounds',async()=>{
 for(const detail of ['stock','hero']){
  const {scene,bytes}=await load(detail);assert.ok(bytes<120_000);
  const d=BLURAY_KEEPCASE_DIMS,box=new T.Box3().setFromObject(scene);
  assert.ok(Math.abs(box.max.x-d.w/2)<1e-4&&Math.abs(box.max.y-d.h/2)<1e-4&&Math.abs(box.max.z-d.d/2)<2e-3);
  const roles=new Set<string>();
  scene.traverse(o=>{if(!(o instanceof T.Mesh))return;
   for(const k of ['position','normal','uv'])assert.ok(Array.from(o.geometry.getAttribute(k).array).every(Number.isFinite));
   (Array.isArray(o.material)?o.material:[o.material]).forEach(x=>roles.add(x.name));});
  for(const r of ['PaperSpine','PaperFront','PaperBack','BlueShell','ClearRim'])assert.ok(roles.has(r),r);
 }
});
