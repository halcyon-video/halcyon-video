import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('partition GLB publishes named, UV-mapped trim parts at the doorway scale', () => {
  const bytes = readFileSync(new URL('../public/models/alcove-partition.glb', import.meta.url));
  assert.equal(bytes.toString('utf8', 0, 4), 'glTF');
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  assert.deepEqual(gltf.nodes.map((n: { name: string }) => n.name).sort(), [
    'AlcoveBracketScrew', 'AlcoveCrown', 'AlcoveDoorSurround', 'AlcoveHeaderCap', 'AlcoveJambLining',
    'AlcoveRailBracket', 'AlcoveSkirting',
  ]);
  assert.deepEqual(gltf.materials.map((m: { name: string }) => m.name).sort(), ['AlcoveBracketBrass', 'AlcoveTrimTimber']);
  assert.equal(gltf.textures?.length ?? 0, 0);
  assert.ok(bytes.length < 250000);
  for (const mesh of gltf.meshes) for (const p of mesh.primitives) {
    assert.ok(p.attributes.NORMAL !== undefined && p.attributes.TEXCOORD_0 !== undefined);
  }
  const part = (name: string) => {
    const node = gltf.nodes.find((n: { name: string }) => n.name === name);
    return gltf.accessors[gltf.meshes[node.mesh].primitives[0].attributes.POSITION];
  };
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;
  const surround = part('AlcoveDoorSurround');
  assert.ok(near(surround.max[1], 7.12), 'room-side drip cap tops out at 7.12 ft');
  assert.ok(surround.min[1] === 0, 'plinth blocks stand on the floor');
  const lining = part('AlcoveJambLining');
  assert.ok(near(lining.max[0] - lining.min[0], .34), 'lining spans the 0.34 ft partition');
  assert.ok(near(lining.max[1], 6.8), 'lining stops at the 6.8 ft door head');
  assert.ok(near(Math.abs(lining.max[2]), 1.5), 'lining hugs the 3 ft opening');
  assert.ok(near(part('AlcoveSkirting').max[2] - part('AlcoveSkirting').min[2], 1), 'unit moulding is 1 ft long');
});
