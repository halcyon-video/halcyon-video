import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('coffee table exports bounded, textured standard-PBR roles and support anchors', () => {
  const bytes = readFileSync(new URL('../public/models/coffee_table.glb', import.meta.url));
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  assert.deepEqual(gltf.materials.map((m: any) => m.name).sort(),
    ['TableBrassPins', 'TableGlazing', 'TableOak', 'TableResilientSeats']);
  assert.equal(gltf.meshes.length, 4);
  let triangles = 0;
  for (const mesh of gltf.meshes) for (const p of mesh.primitives) {
    assert.notEqual(p.attributes.TEXCOORD_0, undefined);
    assert.notEqual(p.attributes.NORMAL, undefined);
    triangles += gltf.accessors[p.indices].count / 3;
  }
  assert.ok(triangles < 3000);
  assert.ok(bytes.length < 2_100_000);
  const glass = gltf.materials.find((m: any) => m.name === 'TableGlazing');
  assert.equal(glass.alphaMode ?? 'OPAQUE', 'OPAQUE');
  assert.ok(!glass.extensions?.KHR_materials_transmission);
  for (const m of gltf.materials) assert.notEqual(m.pbrMetallicRoughness.metallicRoughnessTexture, undefined);
  assert.notEqual(gltf.materials.find((m: any) => m.name === 'TableOak').normalTexture, undefined);
  const top = gltf.nodes.find((n: any) => n.name === 'mount_tabletop');
  assert.ok(Math.abs(top.translation[1] - 2.0125) < 1e-6);
  for (const name of ['mount_cases', 'mount_due_note']) {
    const node = gltf.nodes.find((n: any) => n.name === name);
    assert.equal(node.translation[1], top.translation[1]);
  }
});
