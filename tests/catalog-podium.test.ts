import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const bytes = readFileSync(new URL('../public/models/catalog-podium.glb', import.meta.url));
const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
test('paper catalog has bounded foot-scale geometry and portable physical surfaces', () => {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.ok(bytes.length < 4_000_000);
  let triangles = 0;
  for (const mesh of gltf.meshes) for (const p of mesh.primitives) {
    assert.ok(p.attributes.NORMAL !== undefined);
    assert.ok(p.attributes.TEXCOORD_0 !== undefined);
    assert.equal(gltf.accessors[p.attributes.POSITION].count, gltf.accessors[p.attributes.TEXCOORD_0].count);
    triangles += gltf.accessors[p.indices].count / 3;
  }
  assert.ok(triangles > 2000 && triangles < 20000);
  assert.equal(gltf.meshes.flatMap((m: {primitives: unknown[]}) => m.primitives).length, 6);
  for (const m of gltf.materials) {
    assert.ok(m.normalTexture, `${m.name} normal relief`);
    assert.ok(m.pbrMetallicRoughness.baseColorTexture, `${m.name} albedo`);
    assert.ok(m.pbrMetallicRoughness.metallicRoughnessTexture, `${m.name} roughness`);
  }
  for (const image of gltf.images) assert.ok(image.bufferView !== undefined, 'textures embedded for offline loading');
  const roles = gltf.materials.map((m: {name: string}) => m.name);
  assert.ok(roles.includes('CatalogPrint')); assert.ok(roles.includes('BrushedNickel'));
  const nodes = new Map(gltf.nodes.map((n: {name: string}) => [n.name, n]));
  for (const name of ['floor_origin', 'catalog_rest', 'reader_stance']) assert.ok(nodes.has(name));
  const rest = nodes.get('catalog_rest') as {translation: number[]};
  assert.ok(Math.abs(rest.translation[1] - 2.81) < 1e-5);
});

test('both printed leaves face upward toward the reader after Y-up export', () => {
  const binaryOffset = 20 + bytes.readUInt32LE(12) + 8;
  const print = gltf.materials.findIndex((m: {name: string}) => m.name === 'CatalogPrint');
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    if (primitive.material !== print) continue;
    const accessor = gltf.accessors[primitive.attributes.NORMAL];
    const view = gltf.bufferViews[accessor.bufferView];
    assert.equal(accessor.componentType, 5126);
    for (let i = 0; i < accessor.count; i++) {
      const offset = binaryOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
        + i * (view.byteStride ?? 12);
      assert.ok(bytes.readFloatLE(offset + 4) > .8, 'printed face normal must face up');
    }
  }
});
