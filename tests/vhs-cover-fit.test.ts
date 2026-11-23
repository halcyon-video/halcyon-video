import test from 'node:test';
import assert from 'node:assert/strict';
import { vhsLetterboxRect, VHS_VISIBLE_BAND } from '../src/vhs-cover-fit.ts';

// Cover shapes seen in a real library: VHS-tall scans, the 0.58 and 0.65 cases
// that used to shrink inside side bars, 2:3 posters, DVD scans, square and
// widescreen art.
const ASPECTS = [0.45, 0.5368, 0.5792, 0.6546, 2 / 3, 0.704, 0.75, 1, 1.78, 2.4];

for (const scale of [1, 3]) {
  const W = 320 * scale, H = 480 * scale;
  const bandLeft = W * (1 - VHS_VISIBLE_BAND) / 2, bandRight = W - bandLeft;

  test(`letterboxed VHS art spans the whole visible width at ${scale}x`, () => {
    for (const a of ASPECTS) {
      const { dx, dw } = vhsLetterboxRect(1000 * a, 1000, W, H);
      // Covers the band with at least half a base pixel to spare on each side,
      // so a filtered sample at the crop line never reads the hidden strip.
      assert.ok(dx <= bandLeft - 0.5 * scale, `aspect ${a}: art starts at ${dx}, band at ${bandLeft}`);
      assert.ok(dx + dw >= bandRight + 0.5 * scale, `aspect ${a}: art ends at ${dx + dw}, band at ${bandRight}`);
      // ...and never spills far past it: the art is not cropped at the sides.
      assert.ok(dw <= (bandRight - bandLeft) + 3 * scale, `aspect ${a}: art ${dw} wide`);
    }
  });

  test(`letterboxed VHS art keeps its shape and centres, bars only above and below, at ${scale}x`, () => {
    for (const a of ASPECTS) {
      const { dx, dy, dw, dh } = vhsLetterboxRect(1000 * a, 1000, W, H);
      assert.ok(Math.abs(dw / dh - a) / a < 0.01, `aspect ${a} drawn at ${dw / dh}`);
      assert.ok(Math.abs(dx + dw / 2 - W / 2) <= 1, `aspect ${a} off centre`);
      assert.ok(Math.abs(dy + dh / 2 - H / 2) <= 1, `aspect ${a} off centre vertically`);
      // Narrower than the sleeve: the art overflows top and bottom, no bars at all.
      if (a < VHS_VISIBLE_BAND * (2 / 3)) assert.ok(dy <= 0, `aspect ${a}: expected overflow, got dy ${dy}`);
    }
  });
}

test('the shelf and the picked-up case frame a cover the same way', () => {
  for (const a of ASPECTS) {
    const shelf = vhsLetterboxRect(1000 * a, 1000, 320, 480);
    const hero = vhsLetterboxRect(1000 * a, 1000, 960, 1440);
    assert.ok(Math.abs(shelf.dw / 320 - hero.dw / 960) < 0.005, `aspect ${a} width differs`);
    assert.ok(Math.abs(shelf.dy / 480 - hero.dy / 1440) < 0.005, `aspect ${a} bars differ`);
  }
});
