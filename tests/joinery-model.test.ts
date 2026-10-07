import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
async function kit() {
  const b=readFileSync(new URL('../public/models/visible-joinery.glb',import.meta.url));
  const { scene }=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
  scene.updateMatrixWorld(true);return { scene, bytes:b.length };
}
test('joinery exports finite surfaces, physical rebates and a bounded shared kit',async()=>{
  const {scene,bytes}=await kit();assert.ok(bytes<160_000);let triangles=0;
  for(const name of ['Baseboard','SillCap','WindowVertical','WindowHorizontal','FinishedPanel','TelevisionStand','DoubleDoorLeaf','SingleDoorLeaf','DoorPushBar'])assert.ok(scene.getObjectByName(name),name);
  scene.traverse(o=>{if(!(o instanceof T.Mesh))return;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
    for(const name of ['position','normal','uv']){const a=o.geometry.getAttribute(name);assert.ok(a&&Array.from(a.array).every(Number.isFinite));}
  });assert.ok(triangles<2200);
  const frame=scene.getObjectByName('WindowVertical') as T.Mesh;
  const ray=new T.Raycaster(new T.Vector3(0,0,1),new T.Vector3(0,0,-1));
  const hit=ray.intersectObject(frame)[0];assert.ok(hit&&Math.abs(hit.point.z-.126)<.004,'recessed glazing stop');
});
test('the stand preserves television and deck support heights with open equipment access',async()=>{
  const {scene}=await kit(),stand=scene.getObjectByName('TelevisionStand')!;
  const box=new T.Box3().setFromObject(stand);
  assert.ok(Math.abs(box.min.y)<1e-6&&Math.abs(box.max.y-1.6)<1e-6);
  const down=(x:number,y:number,z:number)=>new T.Raycaster(new T.Vector3(x,y,z),new T.Vector3(0,-1,0)).intersectObject(stand)[0];
  assert.ok(Math.abs(down(0,2,0).point.y-1.6)<1e-6);
  assert.ok(Math.abs(down(0,1,0).point.y-.66)<1e-6);
  const access=new T.Raycaster(new T.Vector3(0,1,2),new T.Vector3(0,0,-1));
  assert.equal(access.intersectObject(stand).length,0,'no hidden backing or equipment obstruction');
});
test('moving door leaves retain a genuinely open glass aperture and shared floor pivot',async()=>{
  const {scene}=await kit();
  for(const name of ['DoubleDoorLeaf','SingleDoorLeaf']){
    const leaf=scene.getObjectByName(name)!;
    assert.equal(new T.Raycaster(new T.Vector3(0,3,1),new T.Vector3(0,0,-1)).intersectObject(leaf).length,0);
    const bounds=new T.Box3().setFromObject(leaf);assert.ok(bounds.min.y>0&&bounds.max.y<7);
    assert.ok(new T.Raycaster(new T.Vector3(0,.18,1),new T.Vector3(0,0,-1)).intersectObject(leaf).length>0,'solid kick rail');
  }
});
