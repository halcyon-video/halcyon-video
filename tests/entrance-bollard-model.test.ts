import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

test('entrance bollard export is full-sized, seated, finite and within its resource budget', async () => {
  const bytes = await readFile(new URL('../public/models/entrance-bollard.glb', import.meta.url));
  assert.ok(bytes.length < 90_000);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  assert.equal(json.meshes.length, 1, 'one reusable runtime mesh');
  assert.equal(json.images?.length ?? 0, 0);
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const box = new THREE.Box3().setFromObject(scene);
  assert.ok(Math.abs(box.min.y) < 1e-6, 'flange contacts sidewalk');
  assert.ok(Math.abs(box.max.y - 3) < 1e-6, '36-inch height');
  assert.ok(Math.abs(box.max.x - .375) < 1e-6);
  assert.ok(Math.abs(box.min.z + .375) < 1e-6);
  let triangles = 0;
  const roles = new Set<string>();
  scene.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    const g = o.geometry;
    for (const name of ['position', 'normal', 'uv']) {
      const a = g.getAttribute(name);
      assert.ok(a, name);
      assert.ok(Array.from(a.array).every(Number.isFinite), name);
    }
    const n = g.getAttribute('normal');
    for (let i=0; i<n.count; i++) assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-5);
    triangles += (g.index?.count ?? g.getAttribute('position').count) / 3;
    const m = o.material as THREE.Material;
    roles.add(m.name);
    if (m.name === 'SafetyBand') {
      g.computeBoundingBox();
      assert.ok(Math.abs(g.boundingBox!.min.y-2.3)<1e-5);
      assert.ok(Math.abs(g.boundingBox!.max.y-2.55)<1e-5);
      const a=g.getAttribute('position');
      for(let i=0;i<a.count;i++) assert.ok(Math.abs(Math.hypot(a.getX(i),a.getZ(i))-.25)<1e-6, 'band shares post surface');
    }
  });
  assert.deepEqual([...roles].sort(), ['FixingSteel', 'PostPaint', 'SafetyBand']);
  assert.ok(triangles < 2500);
});
