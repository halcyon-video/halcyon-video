import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
async function load(family:string,detail:string){
 const b=readFileSync(new URL(`../public/models/packaging-${family}-${detail}.glb`,import.meta.url));
 const {scene}=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');scene.updateMatrixWorld(true);
 return {scene,bytes:b.length};
}
test('cartons retain closed end flaps and the original portrait envelope',async()=>{
 const {scene}=await load('game-carton','hero');const bounds=new T.Box3().setFromObject(scene);
 assert.ok(Math.abs(bounds.max.x-5/24)<1e-6&&Math.abs(bounds.max.y-7/24)<1e-6&&Math.abs(bounds.max.z-1/24)<1e-6);
 for(const sign of [-1,1]){
  const hit=new T.Raycaster(new T.Vector3(0,sign,0),new T.Vector3(0,-sign,0)).intersectObject(scene,true)[0];
  assert.ok(hit&&Math.abs(hit.point.y-sign*7/24)<1e-6,'closed physical end flap');
 }
});
test('season sleeves have an open right rim and four recessed case ends',async()=>{
 const {scene}=await load('series-boxset','hero');let spines=0;
 scene.traverse(o=>{if(o instanceof T.Mesh&&o.name.startsWith('Exposed_nested_case_spine'))spines++;});assert.equal(spines,4);
 const ray=(z:number)=>new T.Raycaster(new T.Vector3(1,0,z),new T.Vector3(-1,0,0)).intersectObject(scene,true)[0];
 assert.ok(Math.abs(ray(.01).point.x-(.445/2-.001))<1e-6,'nested spine sits behind mouth');
 assert.ok(ray(0).point.x<0,'a physical gap separates adjacent case ends');
 const bounds=new T.Box3().setFromObject(scene);assert.ok(Math.abs(bounds.max.z-.1575/2)<1e-6);
});
test('supplemental packaging has bounded resources and all six existing art roles',async()=>{
 for(const family of ['game-carton','series-boxset'])for(const detail of ['stock','hero']){
  const {scene,bytes}=await load(family,detail);assert.ok(bytes<16_000);let triangles=0;const roles=new Set<string>();
  scene.traverse(o=>{if(!(o instanceof T.Mesh))return;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
   for(const key of ['position','normal','uv']){const a=o.geometry.getAttribute(key);assert.ok(a&&Array.from(a.array).every(Number.isFinite));}
   (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>roles.add(m.name));
  });assert.ok(triangles<=100&&triangles>0);
  for(const role of ['Opening','PaperSpine','Top','Shell','PaperFront','PaperBack'])assert.ok(roles.has(role),`${family}: ${role}`);
 }
});
