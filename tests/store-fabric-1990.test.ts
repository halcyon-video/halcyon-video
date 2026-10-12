import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

async function inspect(filename: string) {
  const bytes=readFileSync(new URL(`../public/models/${filename}.glb`,import.meta.url));
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const bounds=new THREE.Box3().setFromObject(scene), worktop=new THREE.Box3();
  const roles=new Set<string>();let triangles=0;
  scene.updateMatrixWorld(true);
  scene.traverse(o=>{
    if(!(o instanceof THREE.Mesh))return;
    const materials=Array.isArray(o.material)?o.material:[o.material];
    materials.forEach(m=>roles.add(m.name));
    triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
    if(materials.some(m=>m.name==='CounterWorktop'))worktop.union(new THREE.Box3().setFromObject(o));
    for(const name of ['position','normal','uv'])assert.ok(Array.from(o.geometry.getAttribute(name).array).every(Number.isFinite));
    o.geometry.dispose();materials.forEach(m=>m.dispose());
  });
  return {bounds,worktop,roles,triangles,bytes:bytes.length};
}

for(const shape of ['shield','usquare'])for(const style of ['laminate','rounded']) {
  test(`1990 ${shape} ${style} removes inlay without moving service surfaces`,async()=>{
    const base=await inspect(`checkout-counter-${shape}-${style}`);
    const early=await inspect(`checkout-counter-${shape}-${style}-1990`);
    assert.ok(!early.roles.has('CounterInlay'));
    assert.ok(early.roles.has('CounterBody')&&early.roles.has('CounterTop'));
    assert.ok(early.worktop.min.distanceTo(base.worktop.min)<1e-5);
    assert.ok(early.worktop.max.distanceTo(base.worktop.max)<1e-5);
    assert.ok(Math.abs(early.bounds.min.y)<1e-5&&Math.abs(early.bounds.max.y-3.54)<1e-5);
    assert.ok(early.triangles<10000&&early.bytes<700000);
  });
}
test('1990 returns keeps the working surfaces and through-window receiver',async()=>{
  const base=await inspect('exit-return-counter'),early=await inspect('exit-return-counter-1990');
  assert.ok(!early.roles.has('CounterInlay')&&early.roles.has('CounterReturnMetal'));
  assert.ok(early.worktop.min.distanceTo(base.worktop.min)<1e-5);
  assert.ok(early.worktop.max.distanceTo(base.worktop.max)<1e-5);
  assert.ok(early.bounds.min.distanceTo(base.bounds.min)<.15);
  assert.ok(early.bounds.max.distanceTo(base.bounds.max)<.15);
  assert.ok(early.triangles<8000&&early.bytes<400000);
});
