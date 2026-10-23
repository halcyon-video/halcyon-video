import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FILM_DISPLAY, filmDisplayCaseCenter, filmDisplayRows } from '../src/fixtures/film-floor-display-geometry.ts';
import { RETAIL_FIXTURE_SPECS } from '../src/retail-fixture-specs.ts';

const metrics = JSON.parse(readFileSync(new URL('../tools/models/film-floor-display-metrics.json', import.meta.url), 'utf8'));
const d = FILM_DISPLAY;

test('runtime tray datums match the authored Blender export', () => {
  const rows = filmDisplayRows();
  assert.equal(rows.length, metrics.rows.length);
  rows.forEach((row, k) => {
    for (const key of ['deckFrontY', 'deckBackY', 'apronFrontZ'] as const)
      assert.ok(Math.abs(row[key] - metrics.rows[k][key]) < 1e-3, `row ${k} ${key}`);
  });
  assert.equal(metrics.columns, d.columns);
  assert.ok(Math.abs(metrics.tilt - d.tilt) < 1e-9 && Math.abs(metrics.board - d.board) < 1e-9);
  assert.ok(Math.abs(metrics.headerBottomY - d.top) < 1e-6);
  const spec = RETAIL_FIXTURE_SPECS['film-floor-display'];
  assert.ok(metrics.boundsFeet.max[1] <= spec.h && 2 * d.halfWidth <= spec.w && d.footZ - d.backZ <= spec.d);
});

// DVD keepcase and VHS sleeve, feet (video-case.ts CASE_DIMS).
for (const [medium, w, h, depth] of [['dvd', .445, .667, .045], ['vhs', .365, .667, .092]] as const) {
  test(`${medium} copies stand on their trays, inside the board and clear of the tray above`, () => {
    const rows = filmDisplayRows(), deckTop = (k: number, z: number) =>
      rows[k].deckFrontY - (rows[k].apronFrontZ - d.board - z) * Math.tan(d.tilt);
    for (let k = 0; k < d.rows; k++) for (let col = 0; col < d.columns; col++) {
      const c = filmDisplayCaseCenter(k, col, h, depth, .58);
      // Corners of the case leaning back with the deck (rotation.x = -tilt).
      const corners = [-1, 1].flatMap(sy => [-1, 1].map(sz => {
        const y = sy * h / 2, z = sz * depth / 2;
        return { y: c.y + y * Math.cos(d.tilt) + z * Math.sin(d.tilt), z: c.z - y * Math.sin(d.tilt) + z * Math.cos(d.tilt) };
      }));
      assert.ok(Math.abs(c.x) + w / 2 < d.halfWidth - d.board, 'between the side panels');
      for (const p of corners) {
        assert.ok(p.y >= deckTop(k, p.z) - 1e-3, `row ${k} rests on its deck`);
        assert.ok(p.z <= rows[k].apronFrontZ - d.board, `row ${k} stays behind its apron`);
        assert.ok(p.z >= d.backZ + 2 * d.board, `row ${k} clears the back panel`);
        if (k + 1 < d.rows) assert.ok(p.y < deckTop(k + 1, p.z) - d.board - .1, `row ${k} clears the tray above`);
        else assert.ok(p.y < d.top, 'top row stays below the side panels');
      }
      const bottomFront = corners.reduce((a, b) => (b.y < a.y || (b.y === a.y && b.z > a.z) ? b : a));
      assert.ok(bottomFront.y - deckTop(k, bottomFront.z) < .01, `row ${k} touches its deck`);
    }
  });
}
