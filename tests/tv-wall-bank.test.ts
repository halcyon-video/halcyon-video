import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {Box3,Vector3,Mesh,Raycaster,DoubleSide} from 'three';

test('wall-bank export preserves asymmetric envelope and clear three picture/depth apertures',async()=>{
 const b=readFileSync(new URL('../public/models/tv-wall-bank.glb',import.meta.url));
 const {scene}=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 const box=new Box3().setFromObject(scene,true),size=box.getSize(new Vector3());
 assert.ok(box.min.x>=-5.6136&&box.max.x<=5.6136);
 assert.ok(box.min.y>=-1.88485&&box.max.y<=2.01485);
 assert.ok(Math.abs(size.x-11.227)<.01&&Math.abs(size.y-3.8995)<.01);
 assert.ok(Math.abs(box.min.z)<1e-5&&Math.abs(box.max.z-.5)<1e-5);
 let triangles=0,meshes=0;const roles=new Set<string>();
 scene.traverse(o=>{if(!(o instanceof Mesh))return;meshes++;const g=o.geometry;
  for(const key of ['position','normal','uv'])for(const value of g.attributes[key].array)assert.ok(Number.isFinite(value));
  assert.equal(g.attributes.uv.count,g.attributes.position.count);
  for(const value of g.attributes.uv.array)assert.ok(value>=-.0001&&value<=1.0001);
  triangles+=(g.index?.count??g.attributes.position.count)/3;
  for(const m of Array.isArray(o.material)?o.material:[o.material]){roles.add(m.name);assert.equal(m.map,null);m.side=DoubleSide;}
 });
 scene.updateMatrixWorld(true);
 for(const center of [-3.5,0,3.5])for(const dx of [-1.05,0,1.05])for(const y of [-.7875,0,.7875])
  assert.equal(new Raycaster(new Vector3(center+dx,y,1),new Vector3(0,0,-1),0,2).intersectObject(scene,true).length,0,'solid sheet across a CRT aperture');
 assert.equal(meshes,3);assert.ok(triangles<2500&&b.length<160000);
 assert.deepEqual([...roles].sort(),['HousingAmber','RecessHardware','WallFasteners']);
});
