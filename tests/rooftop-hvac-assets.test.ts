import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

test('rooftop unit GLB has fitted bounds, UVs, four finish roles and bounded cost', async () => {
  const bytes = readFileSync(new URL('../public/models/rooftop-hvac.glb', import.meta.url));
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const b = new THREE.Box3().setFromObject(scene);
  assert.ok(Math.abs(b.min.y) < 1e-5, 'Curb bottom must sit at anchor');
  assert.ok(b.max.y > 3.8 && b.max.y < 3.85);
  assert.ok(b.min.x > -3.24 && b.max.x < 3.24);
  assert.ok(b.min.z > -2.07 && b.max.z < 1.84);
  let triangles = 0, meshes = 0;
  const roles = new Set<string>();
  scene.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    meshes++;
    triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
    for (const name of ['position', 'normal', 'uv']) {
      assert.ok(o.geometry.attributes[name], `${o.name}: ${name}`);
      assert.ok([...o.geometry.attributes[name].array].every(Number.isFinite));
    }
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      roles.add(m.name);
      assert.equal((m as THREE.MeshStandardMaterial).map, null);
    }
  });
  assert.equal(meshes, 4);
  assert.deepEqual(roles, new Set(['HVACCabinet', 'HVACCoil', 'HVACHardware', 'HVACCurb']));
  assert.ok(triangles < 5500, String(triangles));
  assert.ok(bytes.length < 310000);
  for (const name of ['Supply_downshot', 'Return_downshot', 'Power_inlet', 'Drain_outlet']) assert.ok(scene.getObjectByName(name), name);
  // Fan deck is open: a ray between guard rings reaches a pitched blade or
  // interior base, never a solid lid immediately beneath the guard.
  const ray = new THREE.Raycaster(new THREE.Vector3(-2.04 + .32, 4.2, .15), new THREE.Vector3(0,-1,0));
  const hits = ray.intersectObject(scene, true);
  assert.ok(hits.length && hits[0].point.y < 3.6, 'Fan recess blocked by a lid');
  for (const x of [.1, 2]) {
    const duct = new THREE.Raycaster(new THREE.Vector3(x, -.1, 0), new THREE.Vector3(0,1,0));
    const surfaces = duct.intersectObject(scene, true);
    assert.ok(surfaces.length && surfaces[0].point.y > 3.5, 'Downshot collar blocked by base pan');
  }
});
