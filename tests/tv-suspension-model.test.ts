import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {Box3,Vector3,Raycaster,Mesh,DoubleSide} from 'three';

test('shared housing retains clear screen/depth paths, swivel aperture and bounded UV geometry',async()=>{
 const bytes=readFileSync(new URL('../public/models/tv-suspension.glb',import.meta.url));
 const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const frame=scene.getObjectByName('TripleCradle')!,housing=frame.getObjectByName('TripleHousing')!;
 assert.ok(housing);assert.equal(housing.parent,frame);
 const box=new Box3().setFromObject(housing,true);
 assert.ok(box.min.x<-4.21&&box.max.x>4.21&&box.max.x<4.35);
 assert.ok(box.min.y< -1.417&&box.max.y>1.36);assert.ok(box.min.z<-1.565&&box.max.z>1.153);
 let triangles=0,meshes=0;const materials=new Set<string>();
 scene.traverse(o=>{if(!(o instanceof Mesh))return;meshes++;const g=o.geometry;
  assert.equal(g.attributes.uv.count,g.attributes.position.count);
  for(const value of g.attributes.normal.array)assert.ok(Number.isFinite(value));
  triangles+=(g.index?.count??g.attributes.position.count)/3;
  for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m.name);m.side=DoubleSide;assert.equal(m.map,null);}
 });
 scene.updateMatrixWorld(true);
 // The actual installed screen/gloss envelope fits each aperture with a margin.
 for(const x of [-2.75,0,2.75])for(const dx of [-1.05,0,1.05])for(const y of [-.872794,0,.872794]){
  const ray=new Raycaster(new Vector3(x+dx,y,2),new Vector3(0,0,-1),0,4);
  assert.equal(ray.intersectObject(housing,true).length,0,'housing blocked a screen or rear depth path');
 }
 const swivel=new Raycaster(new Vector3(0,2,0),new Vector3(0,-1,0),0,.7);
 assert.equal(swivel.intersectObject(housing,true).length,0,'upper cover blocked swivel opening');
 assert.equal(meshes,14);assert.ok(triangles<14000);assert.ok(bytes.length<900000);
 assert.deepEqual([...materials].sort(),['CableJacket','PowderCoat','ZincFasteners']);
 for(const name of ['CeilingPlate','DropStem','Swivel','Cradle'])assert.ok(scene.getObjectByName(name));
});
