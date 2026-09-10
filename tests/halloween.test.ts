import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inSeason } from '../src/promo-campaigns.ts';

test('Halloween follows October boundaries and the existing review override', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    for (const [date, expected] of [['2026-09-30', false], ['2026-10-01', true], ['2026-10-31', true], ['2026-11-01', false], ['2026-12-25', false]] as const) {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => date } });
      assert.equal(inSeason('halloween'), expected, date);
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('Pumpkin export stays within the small seasonal mesh budget', () => {
  const bytes = readFileSync(new URL('../public/models/halloween-pumpkin.glb', import.meta.url));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  assert.ok(bytes.length < 100_000);
  assert.deepEqual(gltf.materials.map((m: { name: string }) => m.name).sort(), ['PumpkinMoldedOrange', 'PumpkinStem']);
  let triangles = 0;
  for (const mesh of gltf.meshes) for (const p of mesh.primitives) {
    triangles += gltf.accessors[p.indices].count / 3;
    assert.ok(p.attributes.NORMAL !== undefined);
    assert.ok(p.attributes.TEXCOORD_0 !== undefined);
  }
  assert.ok(triangles < 3000);
});
