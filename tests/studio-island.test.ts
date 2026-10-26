import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STUDIO_ISLAND, studioIslandCase, studioIslandRows } from '../src/fixtures/studio-island-geometry.ts';
import { RETAIL_FIXTURE_SPECS } from '../src/retail-fixture-specs.ts';

const metrics = JSON.parse(readFileSync(new URL('../tools/models/studio-island-metrics.json', import.meta.url), 'utf8'));
const s = STUDIO_ISLAND;

test('runtime shelves and header match the authored Blender export', () => {
  const rows = studioIslandRows();
  assert.equal(rows.length, metrics.rows.length);
  rows.forEach((row, k) => {
    for (const key of ['deckFrontY', 'deckBackY', 'railFrontZ'] as const)
      assert.ok(Math.abs(row[key] - metrics.rows[k][key]) < 1e-3, `row ${k} ${key}`);
  });
  for (const [key, value] of [['lean', s.lean], ['laminate', s.laminate], ['spineHalf', s.spine], ['innerHalfWidth', s.halfWidth - s.laminate]] as const)
    assert.ok(Math.abs(metrics[key] - value) < 1e-9, key);
  assert.deepEqual(metrics.header, { bottomY: s.top, height: s.headerHeight, halfDepth: s.headerZ });
  const spec = RETAIL_FIXTURE_SPECS['studio-island'];
  const e = 1e-5; // float32 export
  assert.ok(metrics.boundsFeet.max[0] <= spec.w / 2 + e && metrics.boundsFeet.max[2] <= spec.d / 2 + e && metrics.boundsFeet.max[1] <= spec.h + e);
});

for (const [medium, w, h, depth] of [['dvd', .445, .667, .045], ['vhs', .365, .667, .092]] as const) {
  test(`${medium} copies stand on their shelves, behind the rails and clear of the shelf above`, () => {
    const rows = studioIslandRows(), deckTop = (k: number, z: number) =>
      rows[k].deckFrontY - (rows[k].railFrontZ - s.rail - z) * Math.tan(s.lean);
    for (let k = 0; k < rows.length; k++) for (let col = 0; col < s.columns; col++) {
      const c = studioIslandCase(k, col, h, depth, .58);
      assert.ok(Math.abs(c.x) + w / 2 < s.halfWidth - s.laminate, 'between the gables');
      for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        const y = c.y + sy * (h / 2) * Math.cos(s.lean) + sz * (depth / 2) * Math.sin(s.lean);
        const z = c.z - sy * (h / 2) * Math.sin(s.lean) + sz * (depth / 2) * Math.cos(s.lean);
        assert.ok(y >= deckTop(k, z) - 1e-3, `row ${k} rests on its deck`);
        assert.ok(z <= rows[k].railFrontZ - s.rail && z >= s.spine, `row ${k} stays between rail and spine`);
        const ceiling = k + 1 < rows.length ? deckTop(k + 1, z) - s.laminate - .1 : s.top;
        assert.ok(y < ceiling, `row ${k} clears what is above it`);
      }
    }
  });
}
