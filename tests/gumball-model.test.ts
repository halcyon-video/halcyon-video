import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const file = new URL('../public/models/gumball-machine.glb', import.meta.url);
const bytes = readFileSync(file);
const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));

test('gumball export instances UV-mapped candy while retaining operable hardware', () => {
  assert.ok(gltf.extensionsUsed.includes('EXT_mesh_gpu_instancing'));
  const batches = gltf.nodes.filter((n: any) => n.extensions?.EXT_mesh_gpu_instancing);
  assert.equal(batches.length, 7, 'one shared candy mesh per finish');
  let candy = 0;
  for (const batch of batches) {
    const attributes = batch.extensions.EXT_mesh_gpu_instancing.attributes;
    const count = gltf.accessors[attributes.TRANSLATION].count;
    assert.equal(gltf.accessors[attributes.ROTATION].count, count);
    assert.equal(gltf.accessors[attributes.SCALE].count, count);
    candy += count;
    const primitives = gltf.meshes[batch.mesh].primitives;
    assert.equal(primitives.length, 1);
    assert.ok(gltf.accessors[primitives[0].indices].count / 3 <= 80);
  }
  assert.ok(candy > 600, 'the hopper contains real, repeated geometry');
  for (const name of ['Turn handle', 'Delivery flap', 'Clear hopper shell', 'Clear chute sleeve']) {
    assert.ok(gltf.nodes.some((n: any) => n.name === name), name);
  }
  for (const mesh of gltf.meshes) for (const p of mesh.primitives) {
    assert.notEqual(p.attributes.TEXCOORD_0, undefined, mesh.name + ' needs UVs');
  }
  assert.equal(gltf.textures?.length ?? 0, 0, 'candy and glass are geometry, not photographs');
  assert.ok(statSync(file).size < 1_000_000, 'shared topology stays below 1 MB');
});
