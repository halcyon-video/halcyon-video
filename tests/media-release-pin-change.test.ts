import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { applyMediaReleasePin } from '../src/media-release-pin-change.ts';
import {
  MEDIA_RELEASE_DATE_KEY, activeMediaCutoff, loadMediaReleasePin,
  filterLibrariesByCutoff, saveMediaReleasePin,
} from '../src/media-release-date.ts';
import { snapshotLocalConfig, applyConfigSnapshot } from '../src/store-config-keys.ts';
import {
  initMediaDateScreen, mediaDateScreenKey, mediaDateScreenLines, FOCUS_CLEAR,
} from '../src/media-date-screen.ts';

const storage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, String(value)),
  removeItem: (key: string) => storage.delete(key),
  get length() { return storage.size; },
  key: (i: number) => [...storage.keys()][i] ?? null,
};
beforeEach(() => storage.clear());

const pin = { mediaReleaseDate: '1996-06-12', matchEra: true };
const inventory = [
  { id: 'mixed', movies: [{ year: 1990 }, { year: 2020 }, {}] },
  { id: 'modern', movies: [{ year: 2025 }] },
];

for (const raw of [JSON.stringify(pin), '1996-06-12', '', 'invalid', null]) {
  test(`clear restores all inventory and persists removal from ${JSON.stringify(raw)}`, async () => {
    // Start with shelves filtered at a previous build, including an aisle
    // removed entirely by the pin. Storage can change independently of them.
    let shelves = filterLibrariesByCutoff(inventory, new Date(1996, 5, 12));
    assert.equal(shelves.length, 1);
    if (raw !== null) storage.set(MEDIA_RELEASE_DATE_KEY, raw);
    storage.set('bb_theme', 'bb-1993');
    storage.set('poster-cache', 'keep');
    let saved: Record<string, string> | undefined;
    let finishSave!: () => void;
    const pendingSave = new Promise<void>(resolve => { finishSave = resolve; });
    const work = applyMediaReleasePin(null, {
      saveConfig: async () => { saved = snapshotLocalConfig(); await pendingSave; },
      rebuild: async () => {
        const cutoff = activeMediaCutoff();
        shelves = cutoff ? filterLibrariesByCutoff(inventory, cutoff) : inventory;
      },
    });
    // Restock is not blocked by the configuration network request.
    assert.equal(activeMediaCutoff(), null);
    assert.deepEqual(shelves, inventory);
    assert.equal(storage.has(MEDIA_RELEASE_DATE_KEY), false);
    assert.equal(storage.get('poster-cache'), 'keep');
    finishSave();
    await work;
    assert.ok(saved);
    assert.equal(MEDIA_RELEASE_DATE_KEY in saved, false);
    // A later boot/device with an old pin reconciles the saved deletion.
    saveMediaReleasePin(pin);
    applyConfigSnapshot(saved);
    assert.equal(loadMediaReleasePin(), null);
    const reset = initMediaDateScreen(loadMediaReleasePin(), new Date(2026, 8, 10));
    assert.equal(reset.matchEra, false);
    assert.equal(reset.year, 2026);
    assert.match(mediaDateScreenLines(reset, null, new Date()).lines[2], /LIVE/);
  });
}

test('setting a date persists the complete pin and rebuilds with its cutoff', async () => {
  let saved: Record<string, string> = {};
  let shelves = inventory;
  await applyMediaReleasePin(pin, {
    saveConfig: async () => { saved = snapshotLocalConfig(); },
    rebuild: async () => { shelves = filterLibrariesByCutoff(inventory, activeMediaCutoff()!); },
  });
  assert.deepEqual(JSON.parse(saved[MEDIA_RELEASE_DATE_KEY]), pin);
  assert.equal(shelves.length, 1);
  assert.equal(shelves[0].movies.length, 2);
  assert.equal(inventory[0].movies.length, 3);
  const state = initMediaDateScreen(loadMediaReleasePin(), new Date());
  assert.equal(mediaDateScreenKey({ ...state, focus: FOCUS_CLEAR }, 'ok').action, 'clear');
});
