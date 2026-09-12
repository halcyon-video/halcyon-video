import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bytes = readFileSync(new URL('../public/models/previously-viewed-tub.glb', import.meta.url));
const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());

test('counter tub export carries closed hardware, UV/normal surfaces and a bounded resource cost', () => {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.ok(bytes.length < 300_000);
  let triangles = 0;
  for (const mesh of gltf.meshes) {
    for (const p of mesh.primitives) {
      for (const attribute of ['POSITION', 'NORMAL', 'TEXCOORD_0']) {
        assert.ok(Number.isInteger(p.attributes[attribute]), `${mesh.name}: ${attribute}`);
      }
      triangles += gltf.accessors[p.indices].count / 3;
    }
  }
  assert.ok(triangles < 3000);
  assert.equal(gltf.nodes.filter((n: { name: string }) => n.name.startsWith('Silicone_foot')).length, 4);
  assert.ok(gltf.nodes.some((n: { name: string }) => n.name === 'Bent_front_base_rear_3mm'));
  assert.ok(gltf.nodes.some((n: { name: string }) => n.name === 'Folded_price_card_pocket'));
  const metrics = JSON.parse(readFileSync(new URL('../tools/models/previously-viewed-tub-metrics.json', import.meta.url), 'utf8'));
  assert.equal(metrics.triangles, triangles);
  assert.ok(metrics.parts.every((p: { nonmanifoldEdges: number; uv: boolean }) => p.nonmanifoldEdges === 0 && p.uv));
});

test('acrylic keeps the store alpha glass approach and all roles have real surface maps', () => {
  for (const m of gltf.materials) {
    assert.ok(m.normalTexture);
    assert.ok(m.pbrMetallicRoughness.metallicRoughnessTexture);
    assert.ok(m.pbrMetallicRoughness.baseColorFactor.slice(0, 3).every((v: number) => v >= .08));
    assert.equal(m.extensions?.KHR_materials_transmission, undefined);
  }
  const acrylic = gltf.materials.find((m: { name: string }) => m.name === 'Tub_ClearAcrylic');
  assert.equal(acrylic.alphaMode, 'BLEND');
  assert.ok(acrylic.pbrMetallicRoughness.baseColorFactor[3] < .2);
  assert.ok(acrylic.extensions.KHR_materials_clearcoat);
});
