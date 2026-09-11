import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Shim localStorage before importing status module
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null,
};

import {
  getAmbientTvStatus,
  updateAmbientTvStatus,
  resetAmbientTvStatus,
  formatAmbientTvStatus,
  getTvFallbackPreference,
  type AmbientTvStatus,
} from '../src/ambient-tv-status.ts';
import { isSyncedConfigKey } from '../src/store-config-keys.ts';

beforeEach(() => {
  store.clear();
  resetAmbientTvStatus();
});

test('ambient TV status defaults to inactive dead tube with null title and failure reason', () => {
  const status = getAmbientTvStatus();
  assert.equal(status.ok, false);
  assert.equal(status.source, 'dead');
  assert.equal(status.title, null);
  assert.equal(status.lastFailureReason, null);
  assert.equal(formatAmbientTvStatus(), 'Off');
});

test('ambient TV status updates properly for active stream playback', () => {
  updateAmbientTvStatus({
    source: 'stream',
    ok: true,
    title: 'The Matrix (1999)',
    lastFailureReason: null,
  });

  const status = getAmbientTvStatus();
  assert.equal(status.ok, true);
  assert.equal(status.source, 'stream');
  assert.equal(status.title, 'The Matrix (1999)');
  assert.equal(status.lastFailureReason, null);
  assert.equal(formatAmbientTvStatus(), 'Active: Streaming The Matrix (1999)');
});

test('ambient TV status formats fallback loop with failure reason', () => {
  updateAmbientTvStatus({
    source: 'loop',
    ok: true,
    title: 'Big Buck Bunny (Bundled)',
    lastFailureReason: 'transcode watchdog timeout after 20s',
  });

  const status = getAmbientTvStatus();
  assert.equal(status.source, 'loop');
  assert.equal(status.lastFailureReason, 'transcode watchdog timeout after 20s');
  assert.equal(
    formatAmbientTvStatus(),
    'Fallback: Big Buck Bunny (reason: transcode watchdog timeout after 20s)',
  );
});

test('ambient TV status formats fallback loop without failure reason', () => {
  updateAmbientTvStatus({
    source: 'loop',
    ok: true,
    title: 'Big Buck Bunny (Bundled)',
    lastFailureReason: null,
  });

  assert.equal(formatAmbientTvStatus(), 'Fallback: Big Buck Bunny');
});

test('ambient TV status formats testcard with and without failure reason', () => {
  updateAmbientTvStatus({
    source: 'dead',
    ok: true,
    title: 'SMPTE Test Card',
    lastFailureReason: 'decoder stalls on initial keyframe',
  });
  assert.equal(
    formatAmbientTvStatus(),
    'Test Card (reason: decoder stalls on initial keyframe)',
  );

  updateAmbientTvStatus({
    source: 'dead',
    ok: true,
    title: 'SMPTE Test Card',
    lastFailureReason: null,
  });
  assert.equal(formatAmbientTvStatus(), 'Test Card: SMPTE Bars');
});

test('ambient TV status formats dead tube with and without failure reason', () => {
  updateAmbientTvStatus({
    source: 'dead',
    ok: false,
    title: null,
    lastFailureReason: 'fatal network error',
  });
  assert.equal(formatAmbientTvStatus(), 'Off (reason: fatal network error)');

  updateAmbientTvStatus({
    source: 'dead',
    ok: false,
    title: null,
    lastFailureReason: null,
  });
  assert.equal(formatAmbientTvStatus(), 'Off');
});

test('getTvFallbackPreference respects bb_tv_fallback setting and legacy flags', () => {
  // Default is 'loop'
  assert.equal(getTvFallbackPreference(), 'loop');

  // Explicit bb_tv_fallback setting
  localStorage.setItem('bb_tv_fallback', 'dark');
  assert.equal(getTvFallbackPreference(), 'dark');

  localStorage.setItem('bb_tv_fallback', 'testcard');
  assert.equal(getTvFallbackPreference(), 'testcard');

  localStorage.setItem('bb_tv_fallback', 'loop');
  assert.equal(getTvFallbackPreference(), 'loop');

  // Legacy fallback flags when bb_tv_fallback is not set
  localStorage.removeItem('bb_tv_fallback');
  localStorage.setItem('bb_tv_testcard', '1');
  assert.equal(getTvFallbackPreference(), 'testcard');

  localStorage.removeItem('bb_tv_testcard');
  localStorage.setItem('bb_tv_demo_loop', '0');
  assert.equal(getTvFallbackPreference(), 'dark');
});

test('bb_tv_status is an unsynced device-local config key', () => {
  assert.equal(isSyncedConfigKey('bb_tv_status'), false);
});

test('window event halcyon:tv-status is dispatched when window exists', () => {
  let dispatched = false;
  let eventDetail: AmbientTvStatus | null = null;

  (globalThis as any).window = {
    dispatchEvent: (evt: any) => {
      dispatched = true;
      eventDetail = evt.detail;
    },
  };
  (globalThis as any).CustomEvent = class CustomEvent {
    type: string;
    detail: any;
    constructor(type: string, init?: any) {
      this.type = type;
      this.detail = init?.detail;
    }
  };

  try {
    updateAmbientTvStatus({
      source: 'stream',
      ok: true,
      title: 'Speed (1994)',
    });
    assert.equal(dispatched, true);
    assert.equal(eventDetail?.title, 'Speed (1994)');
    assert.equal(eventDetail?.source, 'stream');
  } finally {
    delete (globalThis as any).window;
    delete (globalThis as any).CustomEvent;
  }
});

test('settings.ts registers bb_tv_status readout and bb_tv_fallback in Overhead TVs', () => {
  const content = readFileSync(new URL('../src/settings.ts', import.meta.url), 'utf8');
  assert.ok(content.includes("key: 'bb_tv_status'"), 'registers bb_tv_status');
  assert.ok(content.includes("kind: 'readout'"), 'defines readout kind');
  assert.ok(content.includes("subpage: 'Overhead TVs'"), 'assigns Overhead TVs subpage');
  assert.ok(content.includes("key: 'bb_tv_fallback'"), 'registers bb_tv_fallback');
  assert.ok(content.includes("formatAmbientTvStatus()"), 'calls formatAmbientTvStatus');
});
