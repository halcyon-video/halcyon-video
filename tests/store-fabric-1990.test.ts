import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

async function inspect(filename: string, probe?: (scene: THREE.Group) => void) {
  const bytes=readFileSync(new URL(`../public/models/${filename}.glb`,import.meta.url));
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const bounds=new THREE.Box3().setFromObject(scene), worktop=new THREE.Box3();
  const roles=new Set<string>();let triangles=0;
  scene.updateMatrixWorld(true);
  probe?.(scene);
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
    assert.ok(early.roles.has('CounterInterior'));
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

// Probe the loaded surfaces from customer and staff positions, independent of
// the authoring profile. A painted band cannot satisfy this ledge measurement.
for(const shape of ['shield','usquare','returns'])for(const style of shape==='returns'?['laminate']:['laminate','rounded']) {
  test(`1990 ${shape} ${style} has a projecting fascia and white staff-facing panels`,async()=>{
    const filename=shape==='returns'?'exit-return-counter-1990':`checkout-counter-${shape}-${style}-1990`;
    await inspect(filename,scene=>{
      const point=shape==='shield'?new THREE.Vector3(5.25,0,-9.65):new THREE.Vector3(shape==='returns'?-7.75:-6.8,0,shape==='returns'?-3.7:-7);
      const inward=shape==='shield'?new THREE.Vector3(-1,0,1).normalize():new THREE.Vector3(1,0,0);
      const hit=(height:number,staff=false)=>{
        const origin=point.clone().addScaledVector(inward,staff?3:-3);origin.y=height;
        const hits=new THREE.Raycaster(origin,staff?inward.clone().negate():inward).intersectObject(scene,true);
        assert.ok(hits.length,'the expected counter panel is present');return hits[0];
      };
      const body=hit(1.5),fascia=hit(3.1),inside=hit(3.1,true);
      assert.ok(body.distance-fascia.distance>.24,'upper fascia projects at least a quarter foot beyond the body');
      assert.equal((inside.object as THREE.Mesh<THREE.BufferGeometry,THREE.Material>).material.name,'CounterInterior');
      if(shape==='shield')for(const side of [-1,1])for(let x=.25;x<8;x+=.05) {
        const normal=new THREE.Vector3(-side,0,1).normalize();
        const origin=new THREE.Vector3(side*x,1.5,x-14.9).addScaledVector(normal,-3);
        const face=new THREE.Raycaster(origin,normal).intersectObject(scene,true)[0];
        assert.ok(face,'continuous customer-facing cabinet skin');
        assert.notEqual((face.object as THREE.Mesh<THREE.BufferGeometry,THREE.Material>).material.name,'CounterInterior','white inner panels must not fold through the blue exterior');
      }
    });
  });
}
