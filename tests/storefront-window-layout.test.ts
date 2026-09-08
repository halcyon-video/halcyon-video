import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windowBayLayout } from '../src/storefront-window-layout.ts';
import { baselineStorefrontWidth, getStorefrontSpec, vestibuleHalfWidth, FRONT_WINDOW_CORNER_MARGIN } from '../src/store-layout.ts';

test('one masonry break per wing preserves all sixteen four-foot panes', () => {
  const width = baselineStorefrontWidth();
  const spec = getStorefrontSpec(width);
  const entry = { center: 0, halfWidth: vestibuleHalfWidth(spec) };
  const layout = windowBayLayout(spec.windowBays, entry);
  assert.equal(layout.panes.length, 16);
  assert.equal(layout.gaps.length, 2);
  assert.equal(layout.runs.length, 4);
  assert(Math.abs((width-layout.width)/2-FRONT_WINDOW_CORNER_MARGIN) < 1e-9);
  for (const pane of layout.panes) {
    assert(Math.abs(pane.hi-pane.lo-4) < 1e-9);
    assert(pane.hi <= -entry.halfWidth+1e-9 || pane.lo >= entry.halfWidth-1e-9);
    for (const gap of layout.gaps) assert(pane.hi <= gap.lo || pane.lo >= gap.hi);
  }
  assert(Math.abs(layout.gaps[0].lo+layout.gaps[1].hi) < 1e-9);
  assert(Math.abs(layout.gaps[0].hi+layout.gaps[1].lo) < 1e-9);
  assert.equal(layout.runs.filter(run => run.innerAtLo || run.innerAtHi).length, 2);
});

test('expanding the store keeps symmetric masonry breaks and whole panes', () => {
  for (const width of [90, 98, 106, 110]) {
    const spec = getStorefrontSpec(width);
    const layout = windowBayLayout(spec.windowBays, { center: 0, halfWidth: vestibuleHalfWidth(spec) });
    assert.equal(layout.gaps.length, 2);
    assert(Math.abs(layout.gaps[0].lo+layout.gaps[1].hi) < 1e-9);
    assert(layout.width+2*FRONT_WINDOW_CORNER_MARGIN <= width+1e-9);
    layout.panes.forEach(pane => assert(Math.abs(pane.hi-pane.lo-4) < 1e-9));
  }
});

test('unbroken and empty bay layouts stay usable', () => {
  const bays = Array.from({ length: 6 }, () => ({ width: 4, hasCenterMullion: false }));
  const layout = windowBayLayout(bays);
  assert.equal(layout.runs.length, 1);
  assert.equal(layout.gaps.length, 0);
  assert.equal(layout.width, 24);
  assert.equal(windowBayLayout([]).width, 0);
});
