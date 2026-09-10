import test from 'node:test';
import assert from 'node:assert/strict';
import { calibrateQualityIfNeeded, readCalibratedQuality, usesPhoneQualityDefault } from '../src/quality-calibrate.ts';

test('phone auto quality skips GPU probing and ignores stale desktop calibration', async () => {
  const values = new Map([['bb_quality_auto', 'high'], ['bb_quality_ss', '1']]);
  const saved = new Map(['window', 'localStorage', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {
      innerWidth: 390, innerHeight: 844, matchMedia: () => ({ matches: true }),
    } });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null } });
    Object.defineProperty(globalThis, 'document', { configurable: true, get() { throw new Error('Phone boot must not create a probe canvas'); } });
    assert.equal(await calibrateQualityIfNeeded(), 'low');
    assert.deepEqual(readCalibratedQuality('Apple GPU'), { tier: 'low', supersample: false });
    values.set('bb_quality', 'high');
    assert.equal(await calibrateQualityIfNeeded(), 'high', 'explicit quality remains authoritative');
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test('usesPhoneQualityDefault matches small coarse touchscreens', () => {
  const saved = new Map(['window'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {
      innerWidth: 390, innerHeight: 844,
      matchMedia: (q: string) => ({ matches: q.includes('coarse') || q.includes('hover: none') }),
    } });
    assert.equal(usesPhoneQualityDefault(), true);
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
