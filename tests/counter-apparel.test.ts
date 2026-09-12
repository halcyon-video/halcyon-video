import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bytes = readFileSync(new URL('../public/models/counter-apparel.glb', import.meta.url));
const length = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.subarray(20, 20 + length).toString());
const bin = bytes.subarray(28 + length);

test('counter apparel exports bounded UV-mapped geometry and textured cloth roles', () => {
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(gltf.meshes.length, 5);
  assert.ok(bytes.length < 700_000);
  let triangles = 0;
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    triangles += gltf.accessors[primitive.indices].count / 3;
    for (const name of ['POSITION', 'NORMAL', 'TEXCOORD_0']) {
      const a = gltf.accessors[primitive.attributes[name]];
      assert.ok(a, `${mesh.name} has ${name}`);
      assert.equal(a.componentType, 5126);
      const view = gltf.bufferViews[a.bufferView], components = name === 'TEXCOORD_0' ? 2 : 3;
      for (let i = 0; i < a.count; i++) for (let c = 0; c < components; c++) {
        const value = bin.readFloatLE((view.byteOffset || 0) + (a.byteOffset || 0) + i * (view.byteStride || components * 4) + c * 4);
        assert.ok(Number.isFinite(value), `${name} is finite`);
      }
    }
  }
  assert.ok(triangles > 10_000 && triangles < 22_000);
  for (const name of ['ShirtCotton', 'CapTwill', 'RibAndStitch']) {
    const m = gltf.materials.find((m: { name: string }) => m.name === name);
    assert.ok(m.pbrMetallicRoughness.baseColorTexture);
    assert.ok(m.pbrMetallicRoughness.metallicRoughnessTexture);
    assert.ok(m.normalTexture);
    assert.equal(m.pbrMetallicRoughness.metallicFactor, 0);
  }
  assert.equal(gltf.images.length, 8);
  assert.ok(gltf.images.every((i: { bufferView?: number; uri?: string }) => i.bufferView !== undefined && !i.uri));
});

test('all authored apparel solids have manifold edge topology', () => {
  const audit = JSON.parse(readFileSync(new URL('../tools/models/counter-apparel-topology.json', import.meta.url), 'utf8'));
  assert.ok(audit.length > 20);
  for (const part of audit) assert.equal(part.nonmanifold_edges, 0, part.part);
});
