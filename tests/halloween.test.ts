import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inSeason } from '../src/promo-campaigns.ts';
import {
  HALLOWEEN_CLING_MARGIN,
  HALLOWEEN_COUNTER_BAND_TOP_Y,
  HALLOWEEN_PUMPKIN_COUNTER_U,
  halloweenClingPlacements,
  halloweenPumpkinCounterPosition,
} from '../src/entrance/halloween-layout.ts';

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

test('Clings form a deterministic three-piece cluster on every other pane with frame margins', () => {
  const panes = Array.from({ length: 8 }, (_, i) => ({ lo: i * 4, hi: i * 4 + 4 }));
  const a = halloweenClingPlacements(panes);
  const b = halloweenClingPlacements(panes);
  assert.deepEqual(a, b);
  assert.deepEqual([...new Set(a.map(p => p.paneIndex))], [1, 3, 5, 7]);
  assert.equal(a.length, 12);
  for (const placement of a) {
    const pane = panes[placement.paneIndex];
    assert.ok(placement.width >= .88);
    assert.ok(placement.x - placement.width / 2 >= pane.lo + HALLOWEEN_CLING_MARGIN - 1e-9);
    assert.ok(placement.x + placement.width / 2 <= pane.hi - HALLOWEEN_CLING_MARGIN + 1e-9);
    assert.ok(placement.y - placement.height / 2 >= 2 + HALLOWEEN_CLING_MARGIN - 1e-9);
    assert.ok(placement.y + placement.height / 2 <= 7.7 - HALLOWEEN_CLING_MARGIN + 1e-9);
  }
});

test('Pumpkin sits on the outer counter band instead of colliding with register equipment', () => {
  assert.equal(HALLOWEEN_PUMPKIN_COUNTER_U, -4.55);
  const p = halloweenPumpkinCounterPosition({ x: 6.45, y: 2.94, z: 4, rotY: Math.PI, depth: 1.2 }, true);
  assert.equal(p.y, HALLOWEEN_COUNTER_BAND_TOP_Y);
  assert.ok(Math.abs(p.x - 6.45) < 1e-9);
  assert.ok(p.z > 4);
});
