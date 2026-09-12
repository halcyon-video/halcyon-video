import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('curtain GLB publishes reusable, UV-mapped parts at the attachment scale', () => {
  const bytes = readFileSync(new URL('../public/models/alcove-curtain.glb', import.meta.url));
  assert.equal(bytes.toString('utf8', 0, 4), 'glTF');
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  assert.deepEqual(gltf.nodes.map((n: { name: string }) => n.name).sort(), [
    'AlcoveBeadBarrel', 'AlcoveBeadFacet', 'AlcoveCord', 'AlcoveCordKnot', 'AlcoveEyelet', 'AlcoveSupportRail',
  ]);
  assert.equal(gltf.textures?.length ?? 0, 0);
  assert.ok(bytes.length < 50000, 'prototype pack stays small; strands must be instanced at runtime');
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    assert.ok(primitive.attributes.NORMAL !== undefined);
    assert.ok(primitive.attributes.TEXCOORD_0 !== undefined);
    assert.ok(gltf.materials[primitive.material].name);
  }
  const part = (name: string) => {
    const node = gltf.nodes.find((n: { name: string }) => n.name === name);
    return gltf.accessors[gltf.meshes[node.mesh].primitives[0].attributes.POSITION];
  };
  const rail = part('AlcoveSupportRail');
  assert.ok(Math.abs(rail.max[1] - 6.86) < 1e-5, 'Y-up support embeds into the 6.8 ft header');
  assert.ok(Math.abs(rail.max[2] - rail.min[2] - 3) < 1e-5, 'rail spans the existing doorway');
  for (const name of ['AlcoveBeadBarrel', 'AlcoveBeadFacet']) {
    const bead = part(name);
    assert.ok(Math.abs(bead.max[0] - bead.min[0] - .1) < 1e-6);
    assert.ok(bead.max[1] - bead.min[1] < .125, 'beads leave exposed cord between them');
  }
});
