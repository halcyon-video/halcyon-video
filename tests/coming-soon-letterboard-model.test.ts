import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

test('letterboard export preserves live-face UVs and actually contacts ledge and glass', async () => {
 const bytes=await readFile(new URL('../public/models/coming-soon-letterboard.glb',import.meta.url));
 assert.ok(bytes.length<150_000);
 const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 assert.equal(json.images?.length ?? 0,0);
 const {scene:model}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const lean=11*Math.PI/180;
 const store=new THREE.Group();store.position.set(9,3.54,7.75);store.rotation.y=Math.PI;
 const board=new THREE.Group();board.position.set(0,1.75*Math.cos(lean),-1.75*Math.sin(lean));board.rotation.x=-lean;store.add(board);board.add(model);
 model.position.set(0,.018*Math.cos(lean),.018*Math.sin(lean));
 store.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(model, true);
 assert.ok(Math.abs(bounds.min.y-3.54)<1e-6,'sole must rest exactly on the counter');
 assert.ok(Math.abs(bounds.max.z-8.54)<1e-6,'rear pads must meet the glass');
 assert.ok(Math.abs(bounds.max.x-bounds.min.x-28/12)<1e-6);
 let triangles=0,draws=0,faces=0;const materials=new Set<string>();
 model.traverse(o=>{
  if(!(o instanceof THREE.Mesh))return;
  draws++;const pos=o.geometry.getAttribute('position'),uv=o.geometry.getAttribute('uv');
  for(const name of ['position','normal','uv']){
   const a=o.geometry.getAttribute(name);assert.ok(a);assert.equal(a.count,pos.count);assert.ok(Array.from(a.array).every(Number.isFinite));
  }
  triangles+=(o.geometry.index?.count ?? pos.count)/3;
  const mat=o.material as THREE.Material;materials.add(mat.name);
  if(mat.name==='LetterboardLiveFace'){
   faces++;
   for(let i=0;i<pos.count;i++){
    assert.ok(Math.abs(uv.getX(i)-(pos.getX(i)/(28/12)+.5))<1e-6);
    assert.ok(Math.abs(uv.getY(i)-(.5-pos.getY(i)/3.5))<1e-6);
   }
   // Slot grooves have real depth, with the original face's forward datum.
   const z=Array.from({length:pos.count},(_,i)=>pos.getZ(i));
   assert.ok(Math.max(...z)-Math.min(...z)>.001);
  }
 });
 assert.equal(faces,1);assert.equal(materials.size,4);assert.ok(triangles<2000);assert.ok(draws<=9);
 // Ray from a reader hits the live insert, not an opaque replacement overlay.
 const hit=new THREE.Raycaster(new THREE.Vector3(9,5.3,5),new THREE.Vector3(0,0,1)).intersectObject(model)[0];
 assert.ok(hit);assert.equal(((hit.object as THREE.Mesh).material as THREE.Material).name,'LetterboardLiveFace');
});
