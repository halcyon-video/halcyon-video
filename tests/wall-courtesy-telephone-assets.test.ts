import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('wall courtesy phone export: bounded geometry, flush back, named mounts and embedded physical finishes', () => {
  const bytes = readFileSync(new URL('../public/models/wall-courtesy-telephone.glb', import.meta.url));
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.ok(bytes.length < 800000);
  let triangles = 0;
  for (const mesh of gltf.meshes) for (const p of mesh.primitives) {
    for (const attr of ['POSITION', 'NORMAL', 'TEXCOORD_0']) assert.ok(Number.isInteger(p.attributes[attr]), attr);
    triangles += gltf.accessors[p.indices].count / 3;
  }
  assert.equal(gltf.meshes.length, 6);
  assert.equal(gltf.meshes.reduce((n: number, m: {primitives: unknown[]}) => n + m.primitives.length, 0), 6); assert.ok(triangles < 13000, String(triangles));
  assert.deepEqual(new Set(gltf.materials.map((m: {name: string}) => m.name)), new Set(['PhoneHousing','PhoneHandset','PhoneKeys','PhoneRubber','PhoneLegend','PhoneHardware']));
  for (const m of gltf.materials) {
    assert.ok(m.normalTexture); assert.ok(m.pbrMetallicRoughness.metallicRoughnessTexture);
    assert.ok(m.pbrMetallicRoughness.baseColorFactor.slice(0,3).every((x: number) => x >= .079999));
  }
  assert.equal(gltf.images.length, 2);
  assert.ok(gltf.images.every((i: {bufferView: number; uri?: string}) => Number.isInteger(i.bufferView) && !i.uri));
  for (const name of ['Mount_wall', 'Connector_handset', 'Connector_base']) assert.ok(gltf.nodes.some((n: {name: string}) => n.name === name));
  const metrics = JSON.parse(readFileSync(new URL('../public/models/wall-courtesy-telephone.json', import.meta.url), 'utf8'));
  assert.equal(metrics.triangles, triangles); assert.equal(metrics.bytes, bytes.length);
  assert.ok(Math.abs(metrics.bounds_runtime.min[2]) < 1e-7);
  assert.ok(metrics.bounds_runtime.max[2] < .39);
  assert.ok(metrics.bounds_runtime.min[1] > -1.3);
  assert.ok(metrics.source_closed_parts >= 30);
});
