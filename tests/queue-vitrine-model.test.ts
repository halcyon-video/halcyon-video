import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bytes = readFileSync(new URL('../public/models/queue-vitrine.glb', import.meta.url));
const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());

test('queue vitrine export fits its fixed checkout envelope and resource budget', () => {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.ok(bytes.length < 2_500_000);
  let triangles = 0;
  for (const mesh of gltf.meshes) for (const p of mesh.primitives) {
    const position = gltf.accessors[p.attributes.POSITION];
    assert.ok(position.count > 0);
    assert.equal(gltf.accessors[p.attributes.NORMAL].count, position.count);
    assert.equal(gltf.accessors[p.attributes.TEXCOORD_0].count, position.count);
    triangles += gltf.accessors[p.indices].count / 3;
    assert.ok(position.min.every(Number.isFinite));
    assert.ok(position.max.every(Number.isFinite));
  }
  assert.ok(triangles > 1000 && triangles < 12_000);
  assert.equal(gltf.meshes.length, 13); // eight independently sorted panes + five opaque roles
  for (const [name, height] of [['merchandise_base', .64], ['merchandise_shelf_1', 1.43], ['merchandise_shelf_2', 2.32]] as const) {
    const node = gltf.nodes.find((n: { name: string }) => n.name === name);
    assert.ok(node, name);
    assert.ok(Math.abs(node.translation[1] - height) < 1e-5);
    assert.equal(node.extras.units, 'feet');
  }
  const metrics = JSON.parse(readFileSync(new URL('../tools/models/queue-vitrine-metrics.json', import.meta.url), 'utf8'));
  assert.equal(triangles, metrics.triangles);
  assert.equal(bytes.length, metrics.glbBytes);
  const [lo, hi] = metrics.boundsBlender;
  assert.ok(Math.abs(hi[0] - lo[0] - 3.5) < 1e-5);
  assert.ok(hi[1] <= .95 && lo[1] >= -.851);
  assert.equal(lo[2], 0);
  assert.ok(hi[2] <= 3.483);
});

test('queue vitrine retains UV textured finish roles and never requests transmission', () => {
  assert.ok(!gltf.extensionsUsed?.includes('KHR_materials_transmission'));
  assert.deepEqual(gltf.materials.map((m: { name: string }) => m.name).sort(), [
    'VitrineAnodizedAluminum', 'VitrineCarton', 'VitrineGasket', 'VitrineGlass', 'VitrineLaminate', 'VitrinePaper',
  ]);
  for (const m of gltf.materials) {
    assert.ok(m.pbrMetallicRoughness.baseColorTexture);
    assert.ok(m.pbrMetallicRoughness.metallicRoughnessTexture);
    assert.ok(m.normalTexture);
  }
  assert.equal(gltf.materials.find((m: { name: string }) => m.name === 'VitrineGlass').alphaMode, 'BLEND');
});
