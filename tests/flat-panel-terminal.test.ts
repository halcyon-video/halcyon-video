import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { counterMonitorAsset } from '../src/counter-terminal.ts';

const bytes = readFileSync(new URL('../public/models/flat-panel-terminal.glb', import.meta.url));
const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());

test('late-era chain desk mixes an LCD and CRT while earlier/single desks retain CRTs', () => {
  assert.equal(counterMonitorAsset('bb-2010', 0, 2), 'models/flat-panel-terminal.glb');
  assert.equal(counterMonitorAsset('bb-2010', 1, 2), 'models/rental-terminal.glb');
  for (const theme of ['bb-1990', 'bb-1993', 'bb-2000', 'mom-and-pop', 'unknown']) {
    for (const station of [0, 1]) assert.equal(counterMonitorAsset(theme, station, 2), 'models/rental-terminal.glb');
  }
  assert.equal(counterMonitorAsset('bb-2010', 0, 1), 'models/rental-terminal.glb');
});

test('LCD export carries UVs, live 4:3 face, physical finishes and bounded resource cost', () => {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.ok(bytes.length < 350_000);
  assert.equal(gltf.images.length, 2);
  const primitives = gltf.meshes.flatMap((m: { primitives: any[] }) => m.primitives);
  assert.equal(primitives.length, 6);
  let triangles = 0;
  for (const p of primitives) {
    const pos = gltf.accessors[p.attributes.POSITION];
    assert.equal(gltf.accessors[p.attributes.NORMAL].count, pos.count);
    assert.equal(gltf.accessors[p.attributes.TEXCOORD_0].count, pos.count);
    triangles += gltf.accessors[p.indices].count / 3;
    const m = gltf.materials[p.material];
    assert.ok(m.pbrMetallicRoughness.baseColorFactor.slice(0, 3).every((v: number) => v >= .07999));
    if (m.name.endsWith('ABS') || m.name.endsWith('Rubber')) {
      assert.ok(m.normalTexture);
      assert.ok(m.pbrMetallicRoughness.metallicRoughnessTexture);
    }
  }
  assert.ok(triangles < 5000);
  const screen = primitives.find((p: {material: number}) => gltf.materials[p.material].name === 'LCDScreen');
  const face = gltf.accessors[screen.attributes.POSITION];
  assert.ok(Math.abs((face.max[0] - face.min[0]) / (face.max[1] - face.min[1]) - 4 / 3) < 1e-5);
  assert.ok(Math.abs(face.min[2] + .089) < 1e-5, 'front faces glTF -Z');
  const bounds = primitives.map((p: {attributes: {POSITION: number}}) => gltf.accessors[p.attributes.POSITION]);
  assert.ok(Math.abs(Math.min(...bounds.map((b: {min: number[]}) => b.min[1]))) < 1e-6, 'desk contact at y=0');
  assert.ok(Math.max(...bounds.map((b: {max: number[]}) => b.max[1])) < 1.551);
});
