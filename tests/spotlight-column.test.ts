import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SPOTLIGHT_COLUMN, spotlightColumnAngle, spotlightColumnCase } from '../src/fixtures/spotlight-column-geometry.ts';
import { RETAIL_FIXTURE_SPECS } from '../src/retail-fixture-specs.ts';

const metrics = JSON.parse(readFileSync(new URL('../tools/models/spotlight-column-metrics.json', import.meta.url), 'utf8'));
const c = SPOTLIGHT_COLUMN;

test('runtime ledges and marquee match the authored Blender export', () => {
  for (const [key, value] of [['drumRadius', c.drumRadius], ['ledgeRadius', c.ledgeRadius], ['rimThickness', c.rimThickness], ['lean', c.lean]] as const)
    assert.ok(Math.abs(metrics[key] - value) < 1e-9, key);
  assert.deepEqual(metrics.ledgeY, [...c.ledgeY]);
  assert.deepEqual(metrics.marquee, { size: c.marqueeSize, bottomY: c.marqueeBottomY, height: c.marqueeHeight });
  const spec = RETAIL_FIXTURE_SPECS['spotlight-column'];
  assert.ok(metrics.boundsFeet.max[0] <= spec.w / 2 && metrics.boundsFeet.max[2] <= spec.d / 2 && metrics.boundsFeet.max[1] <= spec.h);
  // The centre column of every quarter face looks straight out of that face.
  for (let face = 0; face < c.faces; face++) assert.equal(spotlightColumnAngle(face, 1), face * Math.PI / 2);
});

// Corners of a copy leaning back against the drum, in (radial, lateral, y).
function corners(row: number, w: number, h: number, depth: number) {
  const at = spotlightColumnCase(row, h, depth), sin = Math.sin(c.lean), cos = Math.cos(c.lean);
  return [-1, 1].flatMap(sh => [-1, 1].flatMap(sd => [-1, 1].map(sw => ({
    radial: at.radius - sh * (h / 2) * sin + sd * (depth / 2) * cos,
    lateral: sw * w / 2,
    y: at.y + sh * (h / 2) * cos + sd * (depth / 2) * sin,
  }))));
}
const deckAt = (row: number, r: number) => c.ledgeY[row] + (r - c.drumRadius) * Math.tan(c.lean);

for (const [medium, w, h, depth] of [['dvd', .445, .667, .045], ['vhs', .365, .667, .092]] as const) {
  test(`${medium} copies sit on their rings, clear of the drum, rims, ring above and neighbours`, () => {
    for (let row = 0; row < c.ledgeY.length; row++) {
      for (const p of corners(row, w, h, depth)) {
        const r = Math.hypot(p.radial, p.lateral);
        assert.ok(r >= c.drumRadius, `row ${row} stays out of the drum`);
        assert.ok(r <= c.ledgeRadius - c.rimThickness, `row ${row} stays inside the rim`);
        // A flat case on the cone may graze the deck by a few thousandths at its edges.
        assert.ok(p.y >= deckAt(row, r) - .006, `row ${row} rests on its ledge`);
        const ceiling = row + 1 < c.ledgeY.length ? deckAt(row + 1, r) - .04 - .15 : c.marqueeBottomY - .07 - .3;
        assert.ok(p.y < ceiling, `row ${row} clears what is above it`);
      }
      // Neighbours sit one step apart: each copy stays inside its half-step wedge.
      const widest = Math.max(...corners(row, w, h, depth).map(p => Math.atan2(Math.abs(p.lateral), p.radial)));
      assert.ok(widest < c.step / 2, `row ${row} copies are separated`);
    }
  });
}
