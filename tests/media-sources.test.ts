// The connected-source registry (GH #84): a store stocked from more than one
// media server.
//
// Two things here are worth more than the rest, because getting either wrong
// breaks a store that already works rather than merely failing to add the
// feature:
//
//  - a pre-#84 install, which has the three singleton keys and NO source list,
//    must resolve to exactly one source and keep working untouched;
//  - the primary source must MIRROR back into those keys, because ~46 call
//    sites across 11 modules still read them.
//
// The rest is id namespacing, which exists because two servers routinely hand
// out the same library id — Plex section keys are small integers.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// activeProviderKind() and every accessor here read localStorage; Node has
// none. Shim before import (same idiom as playback-routing.test.ts).
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null,
};

const {
  LEGACY_SOURCE_ID,
  MEDIA_SOURCES_KEY,
  addMediaSource,
  bareLibraryId,
  clearMediaSources,
  connectionForTitle,
  disambiguateLibraryNames,
  hasMultipleSources,
  knownLibrariesBySource,
  labelForUrl,
  listMediaSources,
  namespaceLibraryId,
  primaryMediaSource,
  rememberSourceLibraries,
  removeMediaSource,
  saveMediaSources,
  sourceForTitle,
  splitLibraryId,
  stampSourceOnLibraries,
} = await import('../src/media-sources.ts');

beforeEach(() => store.clear());

const JF = { kind: 'jellyfin', url: 'http://home:8096', token: 'tok-home', userId: 'u1', name: 'Home' };
const PLEX = { kind: 'plex', url: 'http://friend:32400', token: 'tok-friend', userId: '', name: "Dave's" };

// ─── Rule 1: a pre-#84 install keeps working ─────────────────────────────────

test('an install with only the singleton keys resolves to one source', () => {
  store.set('jellyfin_url', 'http://nas:8096');
  store.set('jellyfin_token', 'legacy-token');
  store.set('jellyfin_userid', 'legacy-user');

  const sources = listMediaSources();
  assert.equal(sources.length, 1);
  assert.equal(sources[0].id, LEGACY_SOURCE_ID);
  assert.equal(sources[0].url, 'http://nas:8096');
  assert.equal(sources[0].token, 'legacy-token');
  assert.equal(sources[0].userId, 'legacy-user');
  // No provider_kind saved: every install that predates the boundary is a
  // Jellyfin one, which is what keeps the migration a no-op for them.
  assert.equal(sources[0].kind, 'jellyfin');
  assert.equal(hasMultipleSources(), false);
});

test('no credentials at all means no sources — not a phantom one', () => {
  assert.deepEqual(listMediaSources(), []);
  assert.equal(primaryMediaSource(), null);
});

test('a half-written source (no token) is not offered as connectable', () => {
  store.set(MEDIA_SOURCES_KEY, JSON.stringify([{ id: 'a', kind: 'jellyfin', url: 'http://x' }]));
  assert.deepEqual(listMediaSources(), []);
});

test('a corrupt source list falls back to the singleton rather than stranding the store', () => {
  store.set(MEDIA_SOURCES_KEY, '{not json');
  store.set('jellyfin_url', 'http://nas:8096');
  store.set('jellyfin_token', 'legacy-token');
  assert.equal(listMediaSources().length, 1);
  assert.equal(listMediaSources()[0].url, 'http://nas:8096');
});

// ─── Rule 2: the primary mirrors back into the legacy keys ───────────────────

test('saving sources mirrors the primary into the singleton keys', () => {
  saveMediaSources([{ id: 'primary', ...JF }, { id: 's2', ...PLEX }]);
  assert.equal(store.get('jellyfin_url'), JF.url);
  assert.equal(store.get('jellyfin_token'), JF.token);
  assert.equal(store.get('jellyfin_userid'), JF.userId);
  // provider_kind follows the primary, so the singleton consumers agree with
  // the address they are pointed at.
  assert.equal(store.get('provider_kind'), 'jellyfin');
});

test('the SECOND source never becomes the mirrored one', () => {
  addMediaSource(JF);
  addMediaSource(PLEX);
  const sources = listMediaSources();
  assert.equal(sources.length, 2);
  assert.equal(sources[0].url, JF.url, 'first connected stays primary');
  assert.equal(store.get('jellyfin_url'), JF.url);
  assert.equal(store.get('provider_kind'), 'jellyfin');
  assert.equal(hasMultipleSources(), true);
});

test('clearing disconnects every server and empties the legacy keys', () => {
  addMediaSource(JF);
  addMediaSource(PLEX);
  clearMediaSources();
  assert.deepEqual(listMediaSources(), []);
  assert.equal(store.get('jellyfin_url'), undefined);
  assert.equal(store.get('jellyfin_token'), undefined);
});

// ─── Connecting and reconnecting ─────────────────────────────────────────────

test('reconnecting the same server keeps its id, so carried-library choices survive', () => {
  const first = addMediaSource(JF);
  const again = addMediaSource({ ...JF, token: 'refreshed', userId: 'u1' });
  assert.equal(again.id, first.id);
  assert.equal(listMediaSources().length, 1, 'refresh must not append a duplicate');
  assert.equal(listMediaSources()[0].token, 'refreshed');
});

test('a trailing slash is the same server, not a new one', () => {
  addMediaSource(JF);
  addMediaSource({ ...JF, url: `${JF.url}/` });
  assert.equal(listMediaSources().length, 1);
});

test('the same address on a DIFFERENT backend is a different source', () => {
  addMediaSource(JF);
  addMediaSource({ ...JF, kind: 'plex', token: 'other' });
  assert.equal(listMediaSources().length, 2);
});

test('removing a source leaves the others and re-mirrors the new primary', () => {
  const a = addMediaSource(JF);
  addMediaSource(PLEX);
  removeMediaSource(a.id);
  const left = listMediaSources();
  assert.equal(left.length, 1);
  assert.equal(left[0].url, PLEX.url);
  assert.equal(store.get('jellyfin_url'), PLEX.url);
  assert.equal(store.get('provider_kind'), 'plex');
});

test('a server with no name of its own is labelled by host', () => {
  assert.equal(labelForUrl('http://192.168.1.9:8096'), '192.168.1.9:8096');
  assert.equal(labelForUrl(''), 'Media server');
});

// ─── Rule 3: namespaced library ids ──────────────────────────────────────────

test('library ids namespace and split back', () => {
  assert.equal(namespaceLibraryId('s2', '1'), 's2:1');
  assert.deepEqual(splitLibraryId('s2:1'), { sourceId: 's2', libraryId: '1' });
  assert.equal(bareLibraryId('s2:1'), '1');
});

test('a BARE id belongs to the primary source — pre-#84 keys keep their meaning', () => {
  assert.deepEqual(splitLibraryId('abc123'), {
    sourceId: LEGACY_SOURCE_ID,
    libraryId: 'abc123',
  });
});

test('the same library id on two servers stays two distinct ids', () => {
  // The literal Plex case: section key "1" on both boxes.
  assert.notEqual(namespaceLibraryId('primary', '1'), namespaceLibraryId('s2', '1'));
});

// ─── Stamping a catalog with its source ──────────────────────────────────────

function lib(id: string, name: string, titles: string[]): any {
  return { id, name, genres: [], movies: titles.map((t) => ({ id: t, title: t })) };
}

test('stamping namespaces the library and marks every title with its server', () => {
  const source = { id: 's2', ...PLEX };
  const libs = [lib('1', 'Movies', ['a', 'b'])];
  stampSourceOnLibraries(source as any, libs as any);
  assert.equal(libs[0].id, 's2:1');
  assert.equal(libs[0].sourceId, 's2');
  assert.deepEqual(libs[0].movies.map((m: any) => m.sourceId), ['s2', 's2']);
  assert.deepEqual(libs[0].movies.map((m: any) => m.libraryName), ['Movies', 'Movies']);
});

test('a title routes back to the server it came from', () => {
  addMediaSource(JF);
  const friend = addMediaSource(PLEX);
  const conn = connectionForTitle({ sourceId: friend.id });
  assert.equal(conn?.url, PLEX.url);
  assert.equal(conn?.token, PLEX.token);
  assert.equal(conn?.source.kind, 'plex');
});

test('an UNMARKED title falls back to the primary — demo and pre-#84 titles', () => {
  addMediaSource(JF);
  addMediaSource(PLEX);
  assert.equal(sourceForTitle({})?.url, JF.url);
  assert.equal(sourceForTitle(null)?.url, JF.url);
  assert.equal(connectionForTitle(undefined)?.url, JF.url);
});

test('a title naming a server that has since been disconnected falls back, not throws', () => {
  addMediaSource(JF);
  assert.equal(sourceForTitle({ sourceId: 'gone' })?.url, JF.url);
});

// ─── Same-named libraries across servers ─────────────────────────────────────

test('a name claimed by two servers gets the server appended; a unique one does not', () => {
  const a = { id: 'primary', ...JF };
  const b = { id: 's2', ...PLEX };
  const aLibs = [lib('1', 'Movies', ['x']), lib('2', 'Anime', ['y'])];
  const bLibs = [lib('1', 'Movies', ['z'])];
  disambiguateLibraryNames([
    { source: a as any, libraries: aLibs as any },
    { source: b as any, libraries: bLibs as any },
  ]);
  assert.equal(aLibs[0].name, 'Movies (Home)');
  assert.equal(bLibs[0].name, "Movies (Dave's)");
  assert.equal(aLibs[1].name, 'Anime', 'a unique name is left alone');
  // Signage and several fixtures read libraryName off the title, so it has to
  // track the library it was disambiguated to.
  assert.equal(aLibs[0].movies[0].libraryName, 'Movies (Home)');
});

test('a single-server store never has its library names rewritten', () => {
  const only = [lib('1', 'Movies', ['x'])];
  disambiguateLibraryNames([{ source: { id: 'primary', ...JF } as any, libraries: only as any }]);
  assert.equal(only[0].name, 'Movies');
});

// ─── Remembered per-source library lists ─────────────────────────────────────

test('remembered libraries are kept per source and dropped when it disconnects', () => {
  const a = addMediaSource(JF);
  const b = addMediaSource(PLEX);
  rememberSourceLibraries(a, [{ id: '1', name: 'Movies' }]);
  rememberSourceLibraries(b, [{ id: '1', name: 'Films' }, { id: '2', name: 'Shows' }]);

  const known = knownLibrariesBySource();
  assert.equal(known.length, 2);
  assert.equal(known.find((e) => e.sourceId === b.id)?.libraries.length, 2);
  assert.equal(known.find((e) => e.sourceId === a.id)?.sourceName, 'Home');

  removeMediaSource(b.id);
  rememberSourceLibraries(a, [{ id: '1', name: 'Movies' }]);
  assert.deepEqual(knownLibrariesBySource().map((e) => e.sourceId), [a.id]);
});
