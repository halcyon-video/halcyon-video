import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('power wing export preserves support datums, surface maps and bounded geometry cost', () => {
  const b = readFileSync(new URL('../public/models/candy-power-wing.glb', import.meta.url));
  assert.equal(b.readUInt32LE(0), 0x46546c67);
  const gltf = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
  const roles = gltf.materials.map((m: { name: string }) => m.name).sort();
  assert.deepEqual(roles, ['AttachmentSteel', 'CorrugatedKraft', 'ExposedFlute', 'HeaderPrint']);
  const kraft = gltf.materials.find((m: { name: string }) => m.name === 'CorrugatedKraft');
  assert.ok(kraft.pbrMetallicRoughness.baseColorTexture);
  assert.ok(kraft.pbrMetallicRoughness.metallicRoughnessTexture);
  assert.ok(kraft.normalTexture);
  assert.equal(gltf.images.length, 3);
  assert.ok(gltf.images.every((i: { bufferView: number }) => Number.isInteger(i.bufferView)), 'textures embedded for offline loading');
  let triangles = 0;
  for (const mesh of gltf.meshes) for (const p of mesh.primitives) {
    for (const key of ['POSITION', 'NORMAL', 'TEXCOORD_0']) assert.ok(Number.isInteger(p.attributes[key]));
    triangles += gltf.accessors[p.indices].count / 3;
  }
  assert.equal(triangles, 4992); assert.ok(b.length < 700000);
  for (let row = 0; row < 5; row++) {
    const node = gltf.nodes.find((n: { name: string }) => n.name === `Anchor_StockRow_${row}`);
    assert.ok(node); assert.ok(Math.abs(node.translation[1] - (.615 + row * .7)) < 1e-6);
  }
  assert.ok(gltf.nodes.some((n: { name: string }) => n.name === 'Anchor_RearAttachment'));
});
