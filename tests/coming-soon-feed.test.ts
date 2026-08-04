// COMING SOON feed: what the counter letterboard (and, later, the 2009 felt
// menuboard) is allowed to claim is coming, and how those facts land on a
// fixed number of changeable-letter tracks.
//
//   npm run test:comingsoon
//
// Runs under plain `node --test` with type stripping — no test framework.
// coming-soon-feed.ts is pure selection/layout logic with no THREE/DOM/storage
// imports precisely so this works.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Movie, JellyfinLibrary } from '../src/jellyfin.ts';
import {
  collectComingSoon,
  comingSoonRows,
  comingSoonRowsSignature,
  fitLetterboardTitle,
} from '../src/coming-soon-feed.ts';

const NOW = new Date('2026-08-02T12:00:00Z');
const inDays = (n: number) => new Date(NOW.getTime() + n * 86400000).toISOString();

function mk(title: string, extra: Partial<Movie> = {}): Movie {
  return {
    id: title,
    title,
    year: 2000,
    duration: '1h 30m',
    rating: 'PG',
    overview: '',
    director: '',
    actors: [],
    genres: [],
    localPath: '/x',
    ...extra,
  };
}

const lib = (movies: Movie[]): JellyfinLibrary[] => [
  { id: 'l1', name: 'Movies', movies, genres: [] },
];

// ── What counts as coming soon ──────────────────────────────────────────────

test('an ordinary owned title is never on the board', () => {
  const feed = collectComingSoon(lib([mk('Owned Film')]), { now: NOW });
  assert.equal(feed.length, 0);
});

test('an UNORDERED not-in-store case is not coming soon — it is merely absent', () => {
  const feed = collectComingSoon(
    lib([mk('Suggested', { discovery: true, tmdbId: 1 })]),
    { now: NOW }
  );
  assert.equal(feed.length, 0);
});

test('ordering it puts it on the board, by either route', () => {
  const flagged = collectComingSoon(
    lib([mk('A', { collectionGap: true, tmdbId: 1, discoveryRequested: true })]),
    { now: NOW }
  );
  assert.deepEqual(flagged.map((t) => t.title), ['A']);
  const persisted = collectComingSoon(
    lib([mk('B', { discovery: true, tmdbId: 7 })]),
    { now: NOW, requestedIds: new Set([7]) }
  );
  assert.deepEqual(persisted.map((t) => t.title), ['B']);
  assert.equal(persisted[0].source, 'ordered');
});

test('an ordered title whose release already happened carries NO date', () => {
  const feed = collectComingSoon(
    lib([mk('Old Order', { discovery: true, tmdbId: 1, discoveryRequested: true, premiereDate: '1994-05-01' })]),
    { now: NOW }
  );
  assert.equal(feed[0].date, null);
});

test('a genuinely unreleased catalog title is coming soon on its own date', () => {
  const feed = collectComingSoon(lib([mk('Not Out Yet', { premiereDate: inDays(30) })]), { now: NOW });
  assert.equal(feed.length, 1);
  assert.equal(feed[0].source, 'unreleased');
  assert.ok(feed[0].date);
});

test('past the horizon a release stops being "soon"', () => {
  const feed = collectComingSoon(lib([mk('Far Off', { premiereDate: inDays(900) })]), { now: NOW });
  assert.equal(feed.length, 0);
});

test('games never reach the board', () => {
  const feed = collectComingSoon(
    lib([mk('Some Cartridge', { game: true, platform: 'SNES', premiereDate: inDays(10) })]),
    { now: NOW }
  );
  assert.equal(feed.length, 0);
});

test('the same film reaching us twice shows once, keeping the stronger claim', () => {
  const feed = collectComingSoon(
    lib([mk('Twice', { discovery: true, tmdbId: 42, premiereDate: inDays(10) })]),
    {
      now: NOW,
      requestedIds: new Set([42]),
      extra: [mk('Twice', { discovery: true, tmdbId: 42 })],
    }
  );
  assert.equal(feed.length, 1);
  assert.equal(feed[0].source, 'ordered');
  assert.ok(feed[0].date);
});

test('soonest first, undated last', () => {
  const feed = collectComingSoon(
    lib([
      mk('Later', { premiereDate: inDays(60) }),
      mk('No Date', { discovery: true, tmdbId: 3, discoveryRequested: true }),
      mk('Sooner', { premiereDate: inDays(5) }),
    ]),
    { now: NOW }
  );
  assert.deepEqual(feed.map((t) => t.title), ['Sooner', 'Later', 'No Date']);
});

// ── How it lands on the tracks ──────────────────────────────────────────────

const dated = (title: string, days: number) => ({
  title, date: new Date(NOW.getTime() + days * 86400000), source: 'unreleased' as const, key: title,
});
const undated = (title: string) => ({
  title, date: null, source: 'ordered' as const, key: title,
});

test('the manager sets month+day once, then bare days, then nothing for a shared date', () => {
  // 2026: Aug 2 + 9 = Aug 11, +23 = Aug 25, +38 = Sept 9.
  const rows = comingSoonRows([dated('A', 9), dated('B', 9), dated('C', 23), dated('D', 38)], 22);
  assert.deepEqual(rows, [
    { date: 'AUG 11', title: 'A' },
    { date: '', title: 'B' },
    { date: '25', title: 'C' },
    { date: '', title: '' },
    { date: 'SEPT 9', title: 'D' },
  ]);
});

test('the undated block leads, separated from the dated ones by a blank line', () => {
  const rows = comingSoonRows([dated('D', 9), undated('U1'), undated('U2')], 22);
  assert.deepEqual(rows, [
    { date: '', title: 'U1' },
    { date: '', title: 'U2' },
    { date: '', title: '' },
    { date: 'AUG 11', title: 'D' },
  ]);
});

test('never more rows than the board holds, and never a trailing blank', () => {
  const items = [];
  for (let i = 0; i < 40; i++) items.push(undated(`U${i}`));
  for (let i = 0; i < 40; i++) items.push(dated(`D${i}`, 5 + i * 4));
  const rows = comingSoonRows(items, 22);
  assert.equal(rows.length, 22);
  assert.ok(rows[21].title || rows[21].date);
  // Both kinds survive the squeeze — one must not starve the other.
  assert.ok(rows.some((r) => r.title.startsWith('U')));
  assert.ok(rows.some((r) => r.title.startsWith('D')));
});

test('nothing coming means no rows at all — the caller keeps its shipped face', () => {
  assert.deepEqual(comingSoonRows([], 22), []);
});

// ── Fitting a title to a letter kit ─────────────────────────────────────────

test('a title that fits is only uppercased and de-yeared', () => {
  assert.equal(fitLetterboardTitle('Tango & Cash (1989)', 30), 'TANGO & CASH');
});

test('a subtitle goes before any letters are lost', () => {
  assert.equal(
    fitLetterboardTitle('The Long Picture: Chapter Two Electric Boogaloo', 30),
    'THE LONG PICTURE'
  );
});

test('a genuinely oversized title cuts on a word boundary, never mid-word', () => {
  const out = fitLetterboardTitle('ALPHA BRAVO CHARLIE DELTA ECHO FOXTROT GOLF', 24);
  assert.ok(out.length <= 24);
  assert.equal(out, 'ALPHA BRAVO CHARLIE');
});

// ── The perf guard ──────────────────────────────────────────────────────────

test('the signature moves only when the copy does', () => {
  const a = comingSoonRows([dated('A', 9), undated('U')], 22);
  const b = comingSoonRows([dated('A', 9), undated('U')], 22);
  assert.equal(comingSoonRowsSignature(a), comingSoonRowsSignature(b));
  const c = comingSoonRows([dated('A', 10), undated('U')], 22);
  assert.notEqual(comingSoonRowsSignature(a), comingSoonRowsSignature(c));
});
