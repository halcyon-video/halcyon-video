// Brand drop detection tests.
//
//   node --experimental-strip-types --test tests/brand-drop.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectBrandDrop, BRAND_DROP_DIRS, tracedAlphaPathD } from '../src/brand-drop.ts';

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
