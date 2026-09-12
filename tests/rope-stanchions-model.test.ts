import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

test('rope queue exports reusable post/rope modules, feet, UVs and separate finish roles', async () => {
  const bytes = await readFile(new URL('../public/models/rope-stanchions.glb', import.meta.url));
  assert.ok(bytes.length < 300_000);
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const post = scene.getObjectByName('Post')!, rope = scene.getObjectByName('Rope')!, runner = scene.getObjectByName('Runner')!;
  assert.ok(post && rope && runner);
  const b = new THREE.Box3().setFromObject(post);
  assert.ok(Math.abs(b.min.y)<1e-6 && Math.abs(b.max.y-3.25)<1e-6, 'floor datum and 39-inch height');
  assert.ok(Math.abs(b.max.x-b.min.x-14/12)<.0001, '14-inch base');
  post.updateMatrixWorld(true);
  for (const radius of [.3,.4,.5,.53]) {
    const hit = new THREE.Raycaster(new THREE.Vector3(radius,.5,0),new THREE.Vector3(0,-1,0)).intersectObject(post,true)[0];
    assert.ok(hit, 'continuous spun cover');
    assert.equal(((hit.object as THREE.Mesh).material as THREE.Material).name,'BrushedBrass', 'weight must remain below the cover');
  }
  const r = new THREE.Box3().setFromObject(rope);
  assert.ok(r.min.x > -2.5 && r.max.x < 2.5, 'clasp ends fit inside five-foot post centers');
  assert.ok(r.min.y > 1.90 && r.min.y < 2.0, 'nominal one-foot sag');
  const roles = new Set<string>(); let draws=0, triangles=0;
  scene.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    draws++; triangles+=(o.geometry.index?.count ?? o.geometry.attributes.position.count)/3;
    for (const name of ['position','normal','uv']) {
      const a=o.geometry.getAttribute(name); assert.ok(a && Array.from(a.array).every(Number.isFinite));
      assert.equal(a.count,o.geometry.attributes.position.count);
    }
    const m=o.material as THREE.MeshStandardMaterial; roles.add(m.name);assert.equal(m.map,null);
  });
  assert.equal(draws,7);assert.ok(triangles<8000);
  assert.deepEqual([...roles].sort(),['BrushedBrass','FloorRubber','RopeFabric','RunnerPile','WeightedCore']);
});
