import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import spec from '../src/exit-return-spec.json' with { type: 'json' };
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

test('angled returns export preserves its floor origin, worktop height and bounded geometry',async()=>{
  const bytes=readFileSync(new URL('../public/models/exit-return-counter.glb',import.meta.url));
  const metrics=JSON.parse(readFileSync(new URL('../tools/models/exit-return-counter-metrics.json',import.meta.url),'utf8'));
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const box=new THREE.Box3().setFromObject(scene);
  assert.ok(Math.abs(box.min.y)<1e-5 && Math.abs(box.max.y-3.55)<1e-5);
  assert.ok(box.min.x>=-7.75-1e-5 && box.max.x<=7.75+1e-5);
  assert.ok(box.min.z>=-11.5-1e-5 && box.max.z<=.23+1e-5);
  assert.ok(box.min.z<-11.3,'projecting point is present');
  // A three-inch white backsplash meets the glazing; the broad worktop stays low.
  for(const x of [-5.5,0]) {
    const top=new THREE.Raycaster(new THREE.Vector3(x,4,.15),new THREE.Vector3(0,-1,0)).intersectObject(scene,true);
    assert.ok(top.length && Math.abs(top[0].point.y-(spec.worktopHeight+spec.backsplashHeight))<.001,'low white backsplash reaches the window datum');
    assert.equal((top[0].object as THREE.Mesh).material.name,'CounterWorktop');
    const bench=new THREE.Raycaster(new THREE.Vector3(x,4,-.3),new THREE.Vector3(0,-1,0)).intersectObject(scene,true);
    assert.ok(bench.length && Math.abs(bench[0].point.y-spec.worktopHeight)<.001,'worktop remains at its approved height');
    const rear=new THREE.Raycaster(new THREE.Vector3(x,3.25,1),new THREE.Vector3(0,0,-1),0,2);
    assert.equal(rear.intersectObject(scene,true).length,0,'backsplash ends below the old raised shelf height');
  }
  const bridge=new THREE.Raycaster(new THREE.Vector3(5.6,4,-1.65),new THREE.Vector3(0,-1,0)).intersectObject(scene,true);
  assert.ok(bridge.length && Math.abs(bridge[0].point.y-2.82)<.001,'white worktop continues ahead of the low receiver');
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
  // The through-window insert uses its own metal material, in addition to
  // the six existing millwork materials. Keep one draw per material role.
  assert.deepEqual([...materials].map(m=>m.name).sort(),
    ['CounterBody','CounterTop','CounterInlay','CounterWorktop','CounterPlinth','CounterReveal','CounterReturnMetal'].sort());
  assert.equal(meshes,materials.size);
  assert.ok(triangles<8000 && bytes.length<400000);
  for(const m of materials)m.dispose();
});
