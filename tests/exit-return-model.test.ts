import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

test('angled returns export preserves its floor origin, worktop height and bounded geometry',async()=>{
  const bytes=readFileSync(new URL('../public/models/exit-return-counter.glb',import.meta.url));
  const metrics=JSON.parse(readFileSync(new URL('../tools/models/exit-return-counter-metrics.json',import.meta.url),'utf8'));
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const box=new THREE.Box3().setFromObject(scene);
  assert.ok(Math.abs(box.min.y)<1e-5 && Math.abs(box.max.y-4.2)<1e-5);
  assert.ok(box.min.x>=-7.75-1e-5 && box.max.x<=7.75+1e-5);
  assert.ok(box.min.z>=-11.5-1e-5 && box.max.z<=.23+1e-5);
  assert.ok(box.min.z<-11.3,'projecting point is present');
  let triangles=0,meshes=0;
  const materials=new Set<THREE.Material>();
  scene.traverse(o=>{
    if(!(o instanceof THREE.Mesh)) return;
    meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
    for(const name of ['position','normal','uv']) {
      const attr=o.geometry.getAttribute(name);
      assert.ok(attr && Array.from(attr.array).every(Number.isFinite));
    }
    for(const m of Array.isArray(o.material)?o.material:[o.material]) materials.add(m);
    o.geometry.dispose();
  });
  assert.equal(triangles,metrics.triangles);
  assert.ok(meshes<=6 && triangles<8000 && bytes.length<400000);
  for(const m of materials)m.dispose();
});
