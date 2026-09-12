import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Box3, Vector3, Mesh } from 'three';

test('hatchback runtime keeps lot axis, ground, UVs and bounded resource cost', async () => {
  const bytes = readFileSync(new URL('../public/models/car_hatchback.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const box = new Box3().setFromObject(gltf.scene);
  const size = box.getSize(new Vector3());
  assert.ok(Math.abs(size.z - 9) < 0.0001);
  assert.ok(Math.abs(box.min.y) < 0.0001);
  assert.ok(size.x < 4.5 && size.y > 3 && size.y < 4);
  let triangles = 0, draws = 0;
  const roles = new Set<string>();
  gltf.scene.traverse(o => {
    if (!(o instanceof Mesh)) return;
    const g = o.geometry;
    assert.equal(g.attributes.uv.count, g.attributes.position.count);
    for (const value of g.attributes.normal.array) assert.ok(Number.isFinite(value));
    triangles += (g.index?.count ?? g.attributes.position.count) / 3;
    draws += g.groups.length || 1;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      roles.add(m.name);
      assert.equal(m.map, null);
    }
  });
  assert.ok(triangles < 5000);
  assert.equal(draws, 8);
  assert.deepEqual([...roles].sort(), ['AmberLens', 'BodyPaint', 'Headlamp', 'InteriorCloth', 'RubberTrim', 'TailLamp', 'WheelMetal', 'WindowGlass']);
  assert.ok(bytes.length < 350000);
});
