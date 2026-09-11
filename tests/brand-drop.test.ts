// Brand drop detection tests.
//
//   node --experimental-strip-types --test tests/brand-drop.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectBrandDrop, BRAND_DROP_DIRS, tracedAlphaPathD } from '../src/brand-drop.ts';
import { signedLoopArea, flattenSvgPath, nestLoops, loopArea } from '../src/alpha-trace.ts';

// Mock minimal DOM Image for testing image probing in node
class MockImage {
  width = 0;
  height = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = '';

  get src(): string {
    return this._src;
  }

  set src(val: string) {
    this._src = val;
    queueMicrotask(() => {
      if (val.includes('NOTFOUND')) {
        this.onerror?.();
      } else {
        this.width = 200;
        this.height = 100;
        this.onload?.();
      }
    });
  }
}

test('BRAND_DROP_DIRS includes common case variations', () => {
  assert.ok(BRAND_DROP_DIRS.includes('brand'));
  assert.ok(BRAND_DROP_DIRS.includes('BRAND'));
  assert.ok(BRAND_DROP_DIRS.includes('Brand'));
});

test('raster silhouette preserves disconnected mark pieces and a counter', () => {
  // Synthetic brand-free lockup: two separate blocks, the second with a
  // transparent counter. A one-component boundary walk used to return only
  // the left block — exactly the reported dropped-wordmark crop.
  const w = 30, h = 12;
  const alpha = new Float32Array(w * h);
  const fill = (x0: number, y0: number, x1: number, y1: number, a = 255) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) alpha[y * w + x] = a;
  };
  fill(1, 2, 9, 10);
  fill(17, 1, 29, 11);
  fill(21, 4, 25, 8, 0);

  const d = tracedAlphaPathD(alpha, w, h);
  assert.ok(d);
  assert.equal(d!.match(/M/g)?.length, 3, 'two outer pieces plus the counter must survive');
  const xs = [...d!.matchAll(/[ML](-?\d+(?:\.\d+)?)\s/g)].map((m) => Number(m[1]));
  assert.ok(Math.min(...xs) < 2 && Math.max(...xs) >= 28, 'path spans the whole lockup');
});

test('detectBrandDrop finds uppercase BRAND/LOGO.PNG', async () => {
  const originalFetch = globalThis.fetch;
  const originalImage = (globalThis as unknown as { Image: unknown }).Image;

  try {
    (globalThis as unknown as { Image: unknown }).Image = MockImage;
    globalThis.fetch = async (url: string | URL | Request) => {
      return {
        ok: false,
        text: async () => '',
      } as Response;
    };

    const assetUrlFor = (p: string) => {
      if (p === 'BRAND/LOGO.PNG') return 'https://test.local/user-assets/BRAND/LOGO.PNG';
      return 'https://test.local/user-assets/NOTFOUND';
    };

    const result = await detectBrandDrop(assetUrlFor);
    assert.ok(result !== null, 'Expected brand drop to be detected');
    assert.equal(result.dir, 'BRAND');
    assert.equal(result.report.file, 'LOGO.PNG');
    assert.equal(result.report.kind, 'image');
    assert.equal(result.manifest.logo?.shape, 'image');
    assert.equal(result.manifest.logo?.imageSrc, 'LOGO.PNG');
    assert.equal(result.manifest.logo?.mainText, '');
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as unknown as { Image: unknown }).Image = originalImage;
  }
});

test('detectBrandDrop finds mixed-case brand/Logo.png', async () => {
  const originalFetch = globalThis.fetch;
  const originalImage = (globalThis as unknown as { Image: unknown }).Image;

  try {
    (globalThis as unknown as { Image: unknown }).Image = MockImage;
    globalThis.fetch = async (url: string | URL | Request) => {
      return {
        ok: false,
        text: async () => '',
      } as Response;
    };

    const assetUrlFor = (p: string) => {
      if (p === 'brand/Logo.png') return 'https://test.local/user-assets/brand/Logo.png';
      return 'https://test.local/user-assets/NOTFOUND';
    };

    const result = await detectBrandDrop(assetUrlFor);
    assert.ok(result !== null, 'Expected brand drop to be detected');
    assert.equal(result.dir, 'brand');
    assert.equal(result.report.file, 'Logo.png');
    assert.equal(result.report.kind, 'image');
    assert.equal(result.manifest.logo?.shape, 'image');
    assert.equal(result.manifest.logo?.imageSrc, 'Logo.png');
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as unknown as { Image: unknown }).Image = originalImage;
  }
});

test('detectBrandDrop with SVG and no brand.txt suppresses default HALCYON text', async () => {
  const originalFetch = globalThis.fetch;
  const originalImage = (globalThis as unknown as { Image: unknown }).Image;
  const originalDoc = (globalThis as unknown as { document: unknown }).document;
  const originalGcs = (globalThis as unknown as { getComputedStyle: unknown }).getComputedStyle;

  try {
    (globalThis as unknown as { Image: unknown }).Image = MockImage;
    (globalThis as unknown as { document: unknown }).document = {
      createElement: () => ({
        setAttribute: () => {},
        innerHTML: '',
        querySelector: () => ({
          setAttribute: () => {},
          querySelectorAll: () => [
            {
              getTotalLength: () => 100,
              getBBox: () => ({ width: 100, height: 100 }),
              getCTM: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
              getPointAtLength: (d: number) => ({ x: d, y: d }),
              getAttribute: (attr: string) => (attr === 'fill' ? '#ff0000' : null),
            },
          ],
        }),
        remove: () => {},
      }),
      body: {
        appendChild: () => {},
      },
    };
    (globalThis as unknown as { getComputedStyle: unknown }).getComputedStyle = () => ({ fill: '#ff0000' });

    globalThis.fetch = async (url: string | URL | Request) => {
      const s = String(url);
      if (s.endsWith('brand/logo.svg')) {
        return {
          ok: true,
          text: async () => '<svg viewBox="0 0 100 100"><path d="M0 0 L100 0 L100 100 Z"/></svg>',
        } as Response;
      }
      return { ok: false, text: async () => '' } as Response;
    };

    const assetUrlFor = (p: string) => `https://test.local/user-assets/${p}`;

    const result = await detectBrandDrop(assetUrlFor);
    assert.ok(result !== null);
    assert.equal(result.report.file, 'logo.svg');
    assert.equal(result.report.kind, 'svg');
    assert.equal(result.manifest.logo?.shape, 'path');
    assert.equal(result.manifest.logo?.mainText, '', 'mainText must be empty to avoid stamping HALCYON over mark');
    assert.equal(result.manifest.logo?.subText, '', 'subText must be empty');
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as unknown as { Image: unknown }).Image = originalImage;
    (globalThis as unknown as { document: unknown }).document = originalDoc;
    (globalThis as unknown as { getComputedStyle: unknown }).getComputedStyle = originalGcs;
  }
});

test('flattenSvgPath parses disjoint subpaths into separate polygon loops without connecting chords', () => {
  const d = 'M 10 10 L 30 10 L 30 30 L 10 30 Z M 50 50 L 70 50 L 70 70 L 50 70 Z';
  const loops = flattenSvgPath(d);
  assert.equal(loops.length, 2, 'two disjoint subpaths must yield two independent loops');
  assert.equal(loops[0].length, 4);
  assert.equal(loops[1].length, 4);
  assert.equal(loops[0][0].x, 10);
  assert.equal(loops[1][0].x, 50);
});

test('nestLoops groups holes under their containing outer contour and keeps disjoint outer contours separate', () => {
  // Outer 1: [0, 0] to [100, 100]
  const outer1 = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  // Hole 1: [20, 20] to [40, 40]
  const hole1 = [{ x: 20, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 40 }, { x: 20, y: 40 }];
  // Outer 2 (disjoint): [200, 0] to [300, 100]
  const outer2 = [{ x: 200, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 100 }, { x: 200, y: 100 }];

  const nested = nestLoops([outer1, hole1, outer2]);
  assert.equal(nested.length, 2, 'must produce two outer silhouettes');
  const withHole = nested.find((n) => n.holes.length > 0);
  const withoutHole = nested.find((n) => n.holes.length === 0);
  assert.ok(withHole, 'one outer contour must have the internal hole');
  assert.ok(withoutHole, 'disjoint outer contour must have no holes');
  assert.equal(withHole!.holes.length, 1);
});

test('tracedAlphaPathD preserves sparse/text-heavy raster silhouette with coverage < 1% and internal counters', () => {
  const w = 100, h = 100;
  const alpha = new Float32Array(w * h);
  const fill = (x0: number, y0: number, x1: number, y1: number, a = 255) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) alpha[y * w + x] = a;
  };
  // Shape 1: Outer 8x8 box, inner 2x2 hole (64 - 4 = 60 opaque px)
  fill(10, 10, 18, 18);
  fill(13, 13, 15, 15, 0);
  // Shape 2: Disjoint small glyph (4x6 = 24 opaque px)
  fill(70, 70, 74, 76);

  // Total opaque: 84 px. Total pixels: 10,000. Coverage = 0.0084 (0.84% < 1%)
  const d = tracedAlphaPathD(alpha, w, h);
  assert.ok(d, 'must not reject sparse/text-heavy mark with cover < 0.01');
  const loops = flattenSvgPath(d!);
  assert.equal(loops.length, 3, 'must contain two outer contours and one counter hole');

  // Verify winding: two positive areas (outer), one negative area (hole)
  const areas = loops.map((loop) => signedLoopArea(loop));
  const positive = areas.filter((a) => a > 0);
  const negative = areas.filter((a) => a < 0);
  assert.equal(positive.length, 2, 'outer contours must have positive winding');
  assert.equal(negative.length, 1, 'hole must have negative winding');

  // Verify bounding box spans the full lockup
  const allPts = loops.flat();
  const minX = Math.min(...allPts.map((p) => p.x));
  const maxX = Math.max(...allPts.map((p) => p.x));
  const minY = Math.min(...allPts.map((p) => p.y));
  const maxY = Math.max(...allPts.map((p) => p.y));
  assert.ok(minX <= 11 && maxX >= 73, 'silhouette spans the full disconnected width');
  assert.ok(minY <= 11 && maxY >= 75, 'silhouette spans the full disconnected height');
});

test('detectBrandDrop with multi-contour SVG gathers all disjoint shapes and counter holes into a unified composite pathD', async () => {
  const originalFetch = globalThis.fetch;
  const originalImage = (globalThis as unknown as { Image: unknown }).Image;
  const originalDoc = (globalThis as unknown as { document: unknown }).document;
  const originalGcs = (globalThis as unknown as { getComputedStyle: unknown }).getComputedStyle;

  try {
    (globalThis as unknown as { Image: unknown }).Image = MockImage;

    // Disjoint shapes:
    // Letter 1: 'O' with outer loop (10,10 to 30,50) and counter hole (15,20 to 25,40)
    // Letter 2: 'I' bar at (60,10 to 80,50)
    const shapeO_outer = 'M 10 10 L 30 10 L 30 50 L 10 50 Z';
    const shapeO_hole = 'M 15 20 L 25 20 L 25 40 L 15 40 Z';
    const shapeI = 'M 60 10 L 80 10 L 80 50 L 60 50 Z';

    const mockElements = [
      {
        d: shapeO_outer,
        box: { width: 20, height: 40 },
        fill: '#ffffff',
      },
      {
        d: shapeO_hole,
        box: { width: 10, height: 20 },
        fill: '#000000',
      },
      {
        d: shapeI,
        box: { width: 20, height: 40 },
        fill: '#ffffff',
      },
    ];

    (globalThis as unknown as { document: unknown }).document = {
      createElement: () => ({
        setAttribute: () => {},
        innerHTML: '',
        querySelector: () => ({
          setAttribute: () => {},
          querySelectorAll: () =>
            mockElements.map((el) => ({
              getTotalLength: () => 100,
              getBBox: () => el.box,
              getCTM: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
              getPointAtLength: (d: number) => ({ x: d, y: d }),
              getAttribute: (attr: string) => {
                if (attr === 'd') return el.d;
                if (attr === 'fill') return el.fill;
                return null;
              },
            })),
        }),
        remove: () => {},
      }),
      body: {
        appendChild: () => {},
      },
    };
    (globalThis as unknown as { getComputedStyle: unknown }).getComputedStyle = () => ({ fill: '#ffffff' });

    globalThis.fetch = async (url: string | URL | Request) => {
      const s = String(url);
      if (s.endsWith('brand/logo.svg')) {
        return {
          ok: true,
          text: async () => '<svg viewBox="0 0 100 100"><path d="..."/></svg>',
        } as Response;
      }
      return { ok: false, text: async () => '' } as Response;
    };

    const assetUrlFor = (p: string) => `https://test.local/user-assets/${p}`;

    const result = await detectBrandDrop(assetUrlFor);
    assert.ok(result !== null);
    assert.equal(result.manifest.logo?.shape, 'path');
    assert.ok(result.manifest.logo?.pathD, 'pathD must be generated');

    // Parse the generated composite pathD
    const loops = flattenSvgPath(result.manifest.logo.pathD);
    assert.equal(loops.length, 3, 'composite pathD must include all disjoint outer shapes and the counter hole');

    // Check loop windings
    const areas = loops.map((loop) => signedLoopArea(loop));
    const positive = areas.filter((a) => a > 0);
    const negative = areas.filter((a) => a < 0);
    assert.equal(positive.length, 2, 'outer letters must have positive winding');
    assert.equal(negative.length, 1, 'counter hole must have negative winding');

    // Check composite bounding box spans all shapes
    const allPts = loops.flat();
    const minX = Math.min(...allPts.map((p) => p.x));
    const maxX = Math.max(...allPts.map((p) => p.x));
    const minY = Math.min(...allPts.map((p) => p.y));
    const maxY = Math.max(...allPts.map((p) => p.y));
    assert.equal(minX, 10);
    assert.equal(maxX, 80);
    assert.equal(minY, 10);
    assert.equal(maxY, 50);

    // Aspect ratio spans full width (80-10=70) and height (50-10=40) => 70/40 = 1.75
    const aspect = (maxX - minX) / (maxY - minY);
    assert.equal(aspect, 1.75, 'aspect ratio must reflect the composite silhouette, not just the first shape');
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as unknown as { Image: unknown }).Image = originalImage;
    (globalThis as unknown as { document: unknown }).document = originalDoc;
    (globalThis as unknown as { getComputedStyle: unknown }).getComputedStyle = originalGcs;
  }
});

test('detectBrandDrop with single-contour SVG preserves single outline without holes', async () => {
  const originalFetch = globalThis.fetch;
  const originalImage = (globalThis as unknown as { Image: unknown }).Image;
  const originalDoc = (globalThis as unknown as { document: unknown }).document;
  const originalGcs = (globalThis as unknown as { getComputedStyle: unknown }).getComputedStyle;

  try {
    (globalThis as unknown as { Image: unknown }).Image = MockImage;

    (globalThis as unknown as { document: unknown }).document = {
      createElement: () => ({
        setAttribute: () => {},
        innerHTML: '',
        querySelector: () => ({
          setAttribute: () => {},
          querySelectorAll: () => [
            {
              getTotalLength: () => 100,
              getBBox: () => ({ width: 50, height: 50 }),
              getCTM: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
              getPointAtLength: (d: number) => ({ x: d, y: d }),
              getAttribute: (attr: string) => {
                if (attr === 'd') return 'M 10 10 L 60 10 L 60 60 L 10 60 Z';
                if (attr === 'fill') return '#00ff00';
                return null;
              },
            },
          ],
        }),
        remove: () => {},
      }),
      body: {
        appendChild: () => {},
      },
    };
    (globalThis as unknown as { getComputedStyle: unknown }).getComputedStyle = () => ({ fill: '#00ff00' });

    globalThis.fetch = async (url: string | URL | Request) => {
      const s = String(url);
      if (s.endsWith('brand/logo.svg')) {
        return {
          ok: true,
          text: async () => '<svg viewBox="0 0 100 100"><path d="..."/></svg>',
        } as Response;
      }
      return { ok: false, text: async () => '' } as Response;
    };

    const assetUrlFor = (p: string) => `https://test.local/user-assets/${p}`;

    const result = await detectBrandDrop(assetUrlFor);
    assert.ok(result !== null);
    assert.equal(result.manifest.logo?.shape, 'path');
    assert.ok(result.manifest.logo?.pathD);

    const loops = flattenSvgPath(result.manifest.logo.pathD);
    assert.equal(loops.length, 1);
    assert.ok(signedLoopArea(loops[0]) > 0, 'single outer contour must have positive winding');
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as unknown as { Image: unknown }).Image = originalImage;
    (globalThis as unknown as { document: unknown }).document = originalDoc;
    (globalThis as unknown as { getComputedStyle: unknown }).getComputedStyle = originalGcs;
  }
});
