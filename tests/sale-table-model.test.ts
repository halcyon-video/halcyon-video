import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
async function model(name: string) {
  const bytes = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  scene.updateMatrixWorld(true); return { root: scene, bytes: bytes.length };
}
test('folding table, feet and cloth fit the unchanged footprint and support datum', async () => {
  const { root, bytes } = await model('sale-table'); assert.ok(bytes < 500_000);
  const b = new T.Box3().setFromObject(root);
  assert.ok(Math.abs(b.min.y) < 1e-6 && b.max.y <= 2.504);
  assert.ok(b.min.x >= -3.1 && b.max.x <= 3.1 && b.min.z >= -1.35 && b.max.z <= 1.35);
  const cloth = root.getObjectByName('DrapeCloth')!; assert.ok(cloth);
  assert.ok(new T.Box3().setFromObject(cloth).min.y > .065, 'hem clears carpet');
  const ray = new T.Raycaster(new T.Vector3(0, 4, 0), new T.Vector3(0, -1, 0));
  const hit = ray.intersectObject(root, true)[0];
  assert.ok(hit && Math.abs(hit.point.y - 2.5) < .004, 'tabletop support');
});
test('wire rack preserves six row supports and named adjustable print clips', async () => {
  const { root, bytes } = await model('sale-table-rack'); assert.ok(bytes < 650_000);
  for (const prefix of ['Offer_stem', 'Offer_clip']) {
    const parts: T.Object3D[] = [];
    root.traverse(o => { if (o instanceof T.Mesh && o.name.startsWith(prefix)) parts.push(o); });
    assert.equal(parts.length, 2, prefix);
    const centers = parts.map(o => new T.Box3().setFromObject(o).getCenter(new T.Vector3()).x).sort((a,b) => a-b);
    assert.ok(Math.abs(centers[0] + 1.36) < 1e-5 && Math.abs(centers[1] - 1.36) < 1e-5);
  }
  const b = new T.Box3().setFromObject(root);
  assert.ok(b.min.x >= -3 && b.max.x <= 3 && b.min.z >= -1.28 && b.max.z <= 1.28);
  for (const side of [-1, 1]) for (let row = 0; row < 3; row++) {
    const z = side * (1.25 - row * (2.5 / 6)), y = 2.53 + row * .42;
    const ray = new T.Raycaster(new T.Vector3(0, y + .08, z), new T.Vector3(0, -1, 0));
    const hit = ray.intersectObject(root, true)[0];
    assert.ok(hit && Math.abs(hit.point.y - y) < .005, `${side} row ${row}`);
  }
});
test('sale furniture has finite UVs/normals and bounded exported resources', async () => {
  for (const [name, budget, drawLimit] of [['sale-table', 12_000, 4], ['sale-table-rack', 9_000, 5]] as const) {
    const { root } = await model(name); let triangles = 0, meshes = 0;
    root.traverse(o => {
      if (!(o instanceof T.Mesh)) return;
      meshes++;triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
      for (const key of ['position', 'normal', 'uv']) {
        const a = o.geometry.getAttribute(key); assert.ok(a?.count > 0 && Array.from(a.array).every(Number.isFinite));
      }
    });
    assert.ok(triangles < budget && triangles > 0 && meshes <= drawLimit);
  }
});
