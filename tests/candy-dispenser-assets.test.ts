import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

test('dispenser GLB: feet, material roles, real peg hole, UVs and bounded cost', async () => {
  const bytes = readFileSync(new URL('../public/models/candy-dispenser-pack.glb', import.meta.url));
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene), size = bounds.getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x - 2.5 / 12) < 1e-5);
  assert.ok(Math.abs(size.y - 7 / 12) < 1e-5);
  assert.ok(size.z > .05 && size.z < 1 / 12);
  assert.ok(Math.abs(bounds.min.y) < 1e-5);
  const roles = new Set<string>(); let tris = 0;
  scene.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    const m = o.material as THREE.MeshStandardMaterial; roles.add(m.name);
    const g = o.geometry; tris += (g.index?.count ?? g.attributes.position.count) / 3;
    for (const name of ['position', 'normal', 'uv']) {
      assert.ok(g.attributes[name]); assert.ok([...g.attributes[name].array].every(Number.isFinite));
    }
    assert.equal(m.map, null);
  });
  assert.deepEqual([...roles].sort(), ['ClearBlister','DispenserCap','DispenserStem','HingeDetail','PackCard'].sort());
  assert.ok(tris < 2200, String(tris)); assert.ok(bytes.length < 140000);
  const card = scene.getObjectByName('PackCard')!;
  const ray = new THREE.Raycaster(new THREE.Vector3(0, .550, .2), new THREE.Vector3(0, 0, -1));
  assert.equal(ray.intersectObject(card, true).length, 0, 'peg hole must be open');
  ray.ray.origin.x = .035;
  assert.ok(ray.intersectObject(card, true).length > 0, 'card must surround hole');
  const anchor = scene.getObjectByName('Anchor_PegHole')!;
  assert.ok(anchor.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(0, .55, 0)) < 1e-6);
});
