import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bytes = readFileSync(new URL('../public/models/car_sports.glb', import.meta.url));
const jsonLength = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
const primitives = gltf.meshes.flatMap((mesh: any) => mesh.primitives);
const positions = primitives.map((p: any) => gltf.accessors[p.attributes.POSITION]);

test('sports coupe keeps its feet, ground and street-facing contract', () => {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  // Export is baked into Y-up coordinates; no hidden node transforms.
  for (const node of gltf.nodes) {
    assert.equal(node.matrix, undefined);
    assert.equal(node.rotation, undefined);
    assert.equal(node.scale, undefined);
    assert.equal(node.translation, undefined);
  }
  const min = [0, 1, 2].map(i => Math.min(...positions.map((p: any) => p.min[i])));
  const max = [0, 1, 2].map(i => Math.max(...positions.map((p: any) => p.max[i])));
  assert.equal(min[1], 0, 'tires contact source ground');
  assert.ok(max[2] - min[2] > 14.9 && max[2] - min[2] < 15.2, 'physical length in feet');
  assert.ok(max[0] - min[0] < 6.4, 'mirrors remain inside designed envelope');
  assert.ok(Math.abs(max[1] - 1.29 / .3048) < .002, 'roof height');
  const role = (name: string) => positions[primitives.findIndex((p: any) => gltf.materials[p.material].name === name)];
  assert.ok(role('CoupeAmber').min[2] > 0, 'front indicators face the street (+Z)');
  assert.ok(role('CoupeTail').max[2] < 0, 'tail lenses face the store (-Z)');
});

test('sports coupe export has bounded resource cost, named finishes and usable UVs', () => {
  assert.deepEqual(gltf.materials.map((m: any) => m.name).sort(), [
    'CoupeAlloy', 'CoupeAmber', 'CoupeGlass', 'CoupeInterior', 'CoupeLamp',
    'CoupePaint', 'CoupeRubber', 'CoupeTail', 'CoupeTrim',
  ]);
  assert.equal(primitives.length, 9, 'one runtime draw primitive per role');
  assert.equal(gltf.textures?.length || 0, 0);
  assert.ok(bytes.length < 650_000);
  assert.ok(primitives.reduce((n: number, p: any) => n + gltf.accessors[p.indices].count / 3, 0) < 11_000);
  for (const p of primitives) {
    const pos = gltf.accessors[p.attributes.POSITION];
    const normal = gltf.accessors[p.attributes.NORMAL];
    const uv = gltf.accessors[p.attributes.TEXCOORD_0];
    assert.equal(normal.count, pos.count);
    assert.equal(uv.count, pos.count);
    // All glazing slopes inward toward the roof, so exterior normals point up.
    // This catches accidentally flipped single-sheet windscreen/hatch normals.
    if (gltf.materials[p.material].name === 'CoupeGlass') {
      const view = gltf.bufferViews[normal.bufferView];
      const offset = 28 + jsonLength + (view.byteOffset || 0) + (normal.byteOffset || 0);
      for (let i = 0; i < normal.count; i++) {
        assert.ok(bytes.readFloatLE(offset + i * (view.byteStride || 12) + 4) > 0, 'glass normal faces outward/up');
      }
    }
    assert.equal(uv.componentType, 5126);
    const view = gltf.bufferViews[uv.bufferView];
    const offset = 20 + jsonLength + 8 + view.byteOffset + (uv.byteOffset || 0);
    const stride = view.byteStride || 8;
    const values = new Set();
    for (let i = 0; i < uv.count; i++) {
      const u = bytes.readFloatLE(offset + i * stride), v = bytes.readFloatLE(offset + i * stride + 4);
      assert.ok(Number.isFinite(u) && Number.isFinite(v));
      assert.ok(u >= -.001 && u <= 1.001 && v >= -.001 && v <= 1.001);
      values.add(`${u},${v}`);
    }
    assert.ok(values.size > 3, 'UVs are not collapsed');
  }
  assert.deepEqual(gltf.materials.filter((m: any) => m.alphaMode === 'BLEND').map((m: any) => m.name), ['CoupeGlass']);
});
