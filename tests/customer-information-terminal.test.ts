import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bytes = readFileSync(new URL('../public/models/customer-information-terminal.glb', import.meta.url));
const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());

test('customer surround exports bounded geometry with UVs and replaceable finish roles', () => {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.ok(bytes.length < 750_000);
  assert.equal(gltf.images?.length ?? 0, 0, 'no source images embedded');
  assert.deepEqual(gltf.materials.map((m: {name: string}) => m.name).sort(),
    ['EnclosurePowderCoat', 'MountHardware', 'ProgramBackboard', 'PromotionalBadge']);
  let triangles = 0;
  for (const mesh of gltf.meshes) for (const p of mesh.primitives) {
    assert.ok(p.attributes.NORMAL !== undefined);
    assert.ok(p.attributes.TEXCOORD_0 !== undefined);
    const position = gltf.accessors[p.attributes.POSITION];
    assert.equal(gltf.accessors[p.attributes.TEXCOORD_0].count, position.count);
    triangles += gltf.accessors[p.indices].count / 3;
  }
  assert.ok(triangles > 1000 && triangles < 15000, 'real perforations within budget');
  assert.equal(gltf.meshes.flatMap((m: {primitives: unknown[]}) => m.primitives).length, 4);
});

test('customer surround preserves foot scale, crop datum and device/sign anchors', () => {
  const nodes = new Map(gltf.nodes.map((n: {name: string}) => [n.name, n]));
  for (const name of ['mount_display', 'mount_program_face', 'mount_badge_face', 'crop_datum_NOT_floor']) {
    const node = nodes.get(name) as {extras: {units: string; placementConfirmed: boolean}};
    assert.ok(node, name);
    assert.equal(node.extras.units, 'feet');
    assert.equal(node.extras.placementConfirmed, false);
  }
  const display = nodes.get('mount_display') as {translation: number[]};
  for (const [i, expected] of [0, .76, -.035].entries()) assert.ok(Math.abs(display.translation[i] - expected) < 1e-5);
  const runtime = nodes.get('CustomerInformationSurround') as {scale?: number[]};
  assert.deepEqual(runtime.scale ?? [1,1,1], [1,1,1], 'no implicit meters conversion');
});
