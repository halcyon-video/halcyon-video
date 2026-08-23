// The emblem document: the pure half of the build-your-own logo editor —
// primitive geometry, document normalization and stack order.
//
//   node --experimental-strip-types --test tests/emblem-doc.test.ts
//
// Runs under plain `node --test` with type stripping, no test framework and no
// browser. emblem-doc.ts is deliberately free of DOM and three.js so that the
// SHAPE of every primitive — the thing that becomes the physical silhouette of
// the store's signs — is checkable without booting a store.
//
// What is NOT covered here, because it genuinely needs a canvas: rasterizing a
// composition and tracing its alpha back into an outline (src/emblem-render.ts).
// The screenshot harness is that gate.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cloneEmblemDoc,
  defaultEmblemLayer,
  emblemDocActive,
  emblemLayerPathD,
  emptyEmblemDoc,
  EMBLEM_KINDS,
  EMBLEM_KIND_SPECS,
  EMBLEM_STARTERS,
  moveEmblemLayer,
  normalizeEmblemDoc,
} from '../src/emblem-doc.ts';
import type { EmblemLayer, EmblemLayerKind } from '../src/emblem-doc.ts';

const W = 1000, H = 500;

/** Every coordinate pair in a path, in order. */
function points(d: string): { x: number; y: number }[] {
  const nums = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push({ x: nums[i], y: nums[i + 1] });
  return out;
}

function bbox(d: string) {
  const pts = points(d);
  return {
    x0: Math.min(...pts.map((p) => p.x)),
    y0: Math.min(...pts.map((p) => p.y)),
    x1: Math.max(...pts.map((p) => p.x)),
    y1: Math.max(...pts.map((p) => p.y)),
  };
}

/** Signed shoelace area — its SIGN is the winding, which is the fill rule. */
function signedArea(pts: { x: number; y: number }[]): number {
  let s = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    s += pts[j].x * pts[i].y - pts[i].x * pts[j].y;
  }
  return s / 2;
}

function layer(kind: EmblemLayerKind, over: Partial<EmblemLayer> = {}): EmblemLayer {
  return { ...defaultEmblemLayer(kind), ...over };
}

test('every primitive kind emits geometry, and text deliberately does not', () => {
  for (const kind of EMBLEM_KINDS) {
    const d = emblemLayerPathD(layer(kind, { cx: 0.5, cy: 0.5, w: 0.6, h: 0.6 }), W, H);
    if (kind === 'text') {
      // Glyph outlines don't exist until something has drawn them; the
      // renderer's raster pass is what carries type into the silhouette.
      assert.equal(d, '', 'text must have no analytic outline');
    } else {
      assert.ok(d.length > 0, `${kind} produced no path`);
      assert.ok(d.endsWith('Z'), `${kind} path is not closed`);
      assert.ok(points(d).length >= 3, `${kind} has fewer than 3 points`);
    }
  }
});

test('a shape lands where the layer says, at the size the layer says', () => {
  const d = emblemLayerPathD(layer('rect', { cx: 0.25, cy: 0.5, w: 0.5, h: 0.4 }), W, H);
  const b = bbox(d);
  // cx 0.25 of 1000 = 250, half-width 0.5*1000/2 = 250 → spans x 0..500.
  assert.ok(Math.abs(b.x0 - 0) < 0.5, `left edge ${b.x0}`);
  assert.ok(Math.abs(b.x1 - 500) < 0.5, `right edge ${b.x1}`);
  // cy 0.5 of 500 = 250, half-height 0.4*500/2 = 100 → spans y 150..350.
  assert.ok(Math.abs(b.y0 - 150) < 0.5, `top edge ${b.y0}`);
  assert.ok(Math.abs(b.y1 - 350) < 0.5, `bottom edge ${b.y1}`);
});

test('rotation turns the shape about its own centre, not the canvas origin', () => {
  const flat = layer('rect', { cx: 0.5, cy: 0.5, w: 0.4, h: 0.1 });
  const turned = { ...flat, rot: 90 };
  const a = bbox(emblemLayerPathD(flat, W, W)); // square canvas: 90° swaps cleanly
  const b = bbox(emblemLayerPathD(turned, W, W));
  const centre = (bx: ReturnType<typeof bbox>) => ({ x: (bx.x0 + bx.x1) / 2, y: (bx.y0 + bx.y1) / 2 });
  assert.ok(Math.abs(centre(a).x - centre(b).x) < 0.5, 'centre moved in x');
  assert.ok(Math.abs(centre(a).y - centre(b).y) < 0.5, 'centre moved in y');
  // Width and height traded places.
  assert.ok(Math.abs((a.x1 - a.x0) - (b.y1 - b.y0)) < 0.5, 'width did not become height');
  assert.ok(Math.abs((a.y1 - a.y0) - (b.x1 - b.x0)) < 0.5, 'height did not become width');
});

test('a star has two vertices per point, alternating out and in', () => {
  const d = emblemLayerPathD(layer('star', { detail: 7, detail2: 0.4, w: 1, h: 1 }), W, W);
  assert.equal(points(d).length, 14, 'seven-point star should have 14 vertices');
});

test('a polygon has exactly one vertex per side', () => {
  for (const sides of [3, 5, 8, 12]) {
    const d = emblemLayerPathD(layer('polygon', { detail: sides, w: 1, h: 1 }), W, W);
    assert.equal(points(d).length, sides, `${sides}-sided polygon`);
  }
});

test('a ring is a hole, not a disc: its inner loop winds the other way', () => {
  const d = emblemLayerPathD(layer('ring', { detail: 0.2, w: 1, h: 1 }), W, W);
  const loops = d.split('Z').filter((seg) => seg.trim().length).map((seg) => points(seg));
  assert.equal(loops.length, 2, 'ring should emit an outer and an inner loop');
  const outer = signedArea(loops[0]);
  const inner = signedArea(loops[1]);
  assert.ok(outer !== 0 && inner !== 0, 'degenerate ring loop');
  // Opposite signs are what make nonzero fill (canvas, and three.js's
  // extruder) cut the middle out instead of plugging it.
  assert.ok(outer * inner < 0, 'ring loops wind the same way — the hole would fill solid');
  assert.ok(Math.abs(inner) < Math.abs(outer), 'inner loop is not inside the outer');
});

test('a chevron fills the box it is given', () => {
  const d = emblemLayerPathD(layer('chevron', { detail: 0.4, cx: 0.5, cy: 0.5, w: 0.8, h: 0.8 }), W, W);
  const b = bbox(d);
  assert.ok(Math.abs(b.y0 - 100) < 1, `chevron top ${b.y0}`);
  assert.ok(Math.abs(b.y1 - 900) < 1, `chevron bottom ${b.y1} — it should reach the bottom of its box`);
});

test('a zero-sized layer emits nothing rather than a degenerate path', () => {
  assert.equal(emblemLayerPathD(layer('rect', { w: 0, h: 0.5 }), W, H), '');
  assert.equal(emblemLayerPathD(layer('ellipse', { w: 0.5, h: 0 }), W, H), '');
});

test('normalizeEmblemDoc survives garbage without throwing', () => {
  assert.equal(normalizeEmblemDoc(null), null);
  assert.equal(normalizeEmblemDoc('nonsense'), null);
  assert.equal(normalizeEmblemDoc(42), null);

  const doc = normalizeEmblemDoc({
    version: 1,
    aspect: 9999,
    tilt: -500,
    layers: [
      null,
      'not a layer',
      { kind: 'unheard-of', cx: 'x', w: Infinity, alpha: 7, role: 'melt', ink: 'plaid' },
      { kind: 'star', detail: 900, detail2: -5 },
    ],
  });
  assert.ok(doc, 'a doc with junk in it should still normalize');
  assert.equal(doc!.layers.length, 2, 'non-object layers are dropped');
  assert.ok(doc!.aspect <= 6 && doc!.aspect >= 0.25, 'aspect clamped');
  assert.ok(doc!.tilt >= -30 && doc!.tilt <= 30, 'tilt clamped');

  const [junk, star] = doc!.layers;
  assert.equal(junk.kind, 'rect', 'an unknown kind falls back to a rectangle');
  assert.equal(junk.role, 'solid', 'an unknown role falls back to solid');
  assert.equal(junk.ink, 'body', 'an unknown ink falls back to the brand body');
  assert.ok(Number.isFinite(junk.cx) && Number.isFinite(junk.w), 'non-finite numbers replaced');
  assert.ok(junk.alpha <= 1 && junk.alpha >= 0, 'alpha clamped');

  const starSpec = EMBLEM_KIND_SPECS.star;
  assert.equal(star.detail, starSpec.detail!.max, 'detail clamped to the kind range');
  assert.equal(star.detail2, starSpec.detail2!.min, 'detail2 clamped to the kind range');
});

test('normalizeEmblemDoc round-trips every starter unchanged', () => {
  for (const starter of EMBLEM_STARTERS) {
    const doc = starter.doc();
    const round = normalizeEmblemDoc(JSON.parse(JSON.stringify(doc)));
    assert.ok(round, `${starter.label} failed to normalize`);
    assert.deepEqual(round, doc, `${starter.label} changed on a round trip`);
  }
});

test('a doc only dresses the store when it is on and has something solid', () => {
  assert.equal(emblemDocActive(null), false);
  assert.equal(emblemDocActive(emptyEmblemDoc()), false, 'no layers = nothing to cut a sign from');

  const inkOnly = emptyEmblemDoc();
  inkOnly.layers = [layer('text', { role: 'ink' })];
  assert.equal(emblemDocActive(inkOnly), false, 'ink with no board under it is not an emblem');

  const solid = emptyEmblemDoc();
  solid.layers = [layer('ellipse')];
  assert.equal(emblemDocActive(solid), true);

  solid.enabled = false;
  assert.equal(emblemDocActive(solid), false, 'switched off keeps the doc but not the dressing');
});

test('moving a layer in the stack is clamped and reports where it landed', () => {
  const doc = emptyEmblemDoc();
  doc.layers = [layer('rect'), layer('ellipse'), layer('star')];
  const ids = doc.layers.map((l) => l.id);

  assert.equal(moveEmblemLayer(doc, 0, -1), 0, 'the bottom layer cannot go lower');
  assert.deepEqual(doc.layers.map((l) => l.id), ids, 'a clamped move must not reorder');

  assert.equal(moveEmblemLayer(doc, 0, 1), 1);
  assert.deepEqual(doc.layers.map((l) => l.id), [ids[1], ids[0], ids[2]]);

  assert.equal(moveEmblemLayer(doc, 2, 5), 2, 'the top layer cannot go higher');
  assert.deepEqual(doc.layers.map((l) => l.id), [ids[1], ids[0], ids[2]]);
});

test('cloning a doc detaches its layers', () => {
  const doc = emptyEmblemDoc();
  doc.layers = [layer('rect', { cx: 0.2 })];
  const copy = cloneEmblemDoc(doc);
  copy.layers[0].cx = 0.9;
  assert.equal(doc.layers[0].cx, 0.2, 'the clone shares layer objects with the original');
});
