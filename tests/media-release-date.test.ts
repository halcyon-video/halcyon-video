// Issue #42 — unit tests for the pure Media Release Date rules: pin parsing,
// the rolling effective cutoff, title gating (premiereDate + year fallback),
// library filtering, era derivation, and the permanent suggestion window.
//
//   npm run test:releasedate
//
// Runs under plain `node --test` with type stripping — no test framework.
// Calendar math is LOCAL time throughout, same as the module.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDateOnly,
  toDateOnly,
  parseMediaReleasePin,
  effectiveCutoff,
  titleReleasedBy,
  filterMoviesByCutoff,
  filterLibrariesByCutoff,
  eraThemeIdForDate,
  parseBound,
  suggestionWindow,
  titleInWindow,
  windowLteParam,
  windowGteParam,
  formatCutoffLabel,
} from '../src/media-release-date.ts';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0, 0, 0);

// ── parsing ─────────────────────────────────────────────────────────────────

test('parseDateOnly: real dates parse local, impossible dates reject', () => {
  assert.deepEqual(parseDateOnly('1996-06-12'), new Date(1996, 5, 12));
  assert.equal(parseDateOnly('1996-02-31'), null); // not a real day
  assert.equal(parseDateOnly('96-06-12'), null);
  assert.equal(parseDateOnly('1996/06/12'), null);
  assert.equal(parseDateOnly('2101-01-01'), null); // outside sanity range
});

test('parseMediaReleasePin: bare date, full record, corrupt input', () => {
  assert.deepEqual(parseMediaReleasePin('1996-06-12'), { mediaReleaseDate: '1996-06-12' });
  const rec = parseMediaReleasePin(JSON.stringify({
    mediaReleaseDate: '1996-06-12', pinnedAt: '2026-08-08T10:00:00.000Z', matchEra: true,
  }));
  assert.deepEqual(rec, {
    mediaReleaseDate: '1996-06-12', pinnedAt: '2026-08-08T10:00:00.000Z', matchEra: true,
  });
  assert.equal(parseMediaReleasePin('{"mediaReleaseDate":"nope"}'), null);
  assert.equal(parseMediaReleasePin('{broken'), null);
  assert.equal(parseMediaReleasePin(''), null);
  assert.equal(parseMediaReleasePin(null), null);
  // A bad pinnedAt degrades to a static pin rather than rejecting the record.
  assert.deepEqual(
    parseMediaReleasePin('{"mediaReleaseDate":"1996-06-12","pinnedAt":"garbage"}'),
    { mediaReleaseDate: '1996-06-12' },
  );
});

// ── rolling cutoff ──────────────────────────────────────────────────────────

test('effectiveCutoff: static pin (no pinnedAt) is end of the pinned day', () => {
  const c = effectiveCutoff({ mediaReleaseDate: '1996-06-12' }, at(2026, 8, 8));
  assert.equal(toDateOnly(c), '1996-06-12');
  assert.equal(c.getHours(), 23);
});

test('effectiveCutoff: advances one day per elapsed local day', () => {
  const pin = { mediaReleaseDate: '1996-06-12', pinnedAt: at(2026, 8, 1, 15).toISOString() };
  assert.equal(toDateOnly(effectiveCutoff(pin, at(2026, 8, 1, 16))), '1996-06-12'); // same day
  assert.equal(toDateOnly(effectiveCutoff(pin, at(2026, 8, 2, 9))), '1996-06-13');  // next morning
  assert.equal(toDateOnly(effectiveCutoff(pin, at(2026, 8, 31))), '1996-07-12');    // 30 days on
});

test('effectiveCutoff: clock set backwards never rolls the pin back', () => {
  const pin = { mediaReleaseDate: '1996-06-12', pinnedAt: at(2026, 8, 8).toISOString() };
  assert.equal(toDateOnly(effectiveCutoff(pin, at(2026, 8, 1))), '1996-06-12');
});

test('effectiveCutoff: rolls across month and year ends', () => {
  const pin = { mediaReleaseDate: '1999-12-30', pinnedAt: at(2026, 8, 1).toISOString() };
  assert.equal(toDateOnly(effectiveCutoff(pin, at(2026, 8, 3))), '2000-01-01');
});

// ── title gating ────────────────────────────────────────────────────────────

const cutoff96 = effectiveCutoff({ mediaReleaseDate: '1996-06-12' }, at(2026, 8, 8));

test('titleReleasedBy: exact premiere dates gate to the day', () => {
  assert.equal(titleReleasedBy({ premiereDate: '1996-06-12T00:00:00Z' }, cutoff96), true);
  assert.equal(titleReleasedBy({ premiereDate: '1996-06-20T00:00:00Z' }, cutoff96), false);
  assert.equal(titleReleasedBy({ premiereDate: '1980-01-01T00:00:00Z' }, cutoff96), true);
});

test('titleReleasedBy: year-only falls back to year <= cutoff year', () => {
  assert.equal(titleReleasedBy({ year: 1996 }, cutoff96), true); // same year, month unknown → keep
  assert.equal(titleReleasedBy({ year: 1997 }, cutoff96), false);
  assert.equal(titleReleasedBy({ year: 0 }, cutoff96), true); // no real data → keep
});

test('titleReleasedBy: unparseable premiere falls through to year, then keeps', () => {
  assert.equal(titleReleasedBy({ premiereDate: 'not-a-date', year: 2005 }, cutoff96), false);
  assert.equal(titleReleasedBy({ premiereDate: 'not-a-date' }, cutoff96), true);
  assert.equal(titleReleasedBy({}, cutoff96), true);
});

test('filterLibrariesByCutoff: copies, filters, drops emptied libraries', () => {
  const libs = [
    { name: 'Mixed', movies: [{ year: 1990 }, { year: 2005 }] },
    { name: 'Modern', movies: [{ premiereDate: '2020-01-01T00:00:00Z', year: 2020 }] },
  ];
  const out = filterLibrariesByCutoff(libs, cutoff96);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'Mixed');
  assert.equal(out[0].movies.length, 1);
  // Inputs untouched — clearing the pin must be a rebuild, not a re-sync.
  assert.equal(libs[0].movies.length, 2);
  assert.equal(libs[1].movies.length, 1);
  assert.notEqual(out[0], libs[0]);
});

test('filterMoviesByCutoff returns a fresh array', () => {
  const input = [{ year: 1990 }];
  const out = filterMoviesByCutoff(input, cutoff96);
  assert.notEqual(out, input);
  assert.deepEqual(out, input);
});

// ── era derivation ──────────────────────────────────────────────────────────

const ERAS = ['bb-1990', 'bb-1993', 'bb-2000', 'bb-2010'];

test('eraThemeIdForDate: latest era at or before the cutoff year', () => {
  assert.equal(eraThemeIdForDate(at(1996, 6, 12), ERAS), 'bb-1993');
  assert.equal(eraThemeIdForDate(at(1991, 1, 1), ERAS), 'bb-1990');
  assert.equal(eraThemeIdForDate(at(2000, 1, 1), ERAS), 'bb-2000');
  assert.equal(eraThemeIdForDate(at(2026, 8, 8), ERAS), 'bb-2010');
});

test('eraThemeIdForDate: before the earliest era wears the earliest', () => {
  assert.equal(eraThemeIdForDate(at(1985, 7, 1), ERAS), 'bb-1990');
});

test('eraThemeIdForDate: unsuffixed ids are ignored; none suffixed → null', () => {
  assert.equal(eraThemeIdForDate(at(1996, 6, 12), ['custom-pack', ...ERAS]), 'bb-1993');
  assert.equal(eraThemeIdForDate(at(1996, 6, 12), ['custom-pack']), null);
});

// ── permanent suggestion window ─────────────────────────────────────────────

test('parseBound: bare years read inclusively at each edge', () => {
  assert.deepEqual(parseBound('1980', 'start'), new Date(1980, 0, 1));
  assert.equal(toDateOnly(parseBound('1999', 'end')!), '1999-12-31');
  assert.deepEqual(parseBound('1980-06-15', 'start'), new Date(1980, 5, 15));
  assert.equal(parseBound('80', 'start'), null);
  assert.equal(parseBound('', 'start'), null);
});

test('suggestionWindow: rolling pin folds into the ceiling, tighter wins', () => {
  const pin = { mediaReleaseDate: '1996-06-12' };
  const now = at(2026, 8, 8);
  // Pin tighter than the static bound.
  let win = suggestionWindow(pin, '1980', '2010', now);
  assert.equal(windowLteParam(win), '1996-06-12');
  assert.equal(windowGteParam(win), '1980-01-01');
  // Static bound tighter than the pin.
  win = suggestionWindow(pin, null, '1990', now);
  assert.equal(windowLteParam(win), '1990-12-31');
  // No pin, no bounds — wide open.
  win = suggestionWindow(null, null, null, now);
  assert.equal(win.min, null);
  assert.equal(win.max, null);
  assert.equal(windowLteParam(win), null);
});

test('titleInWindow: ceiling and floor both gate; undated fails a floor only', () => {
  const win = suggestionWindow(null, '1980', '1999', at(2026, 8, 8));
  assert.equal(titleInWindow({ premiereDate: '1985-03-01T00:00:00Z' }, win), true);
  assert.equal(titleInWindow({ premiereDate: '1979-12-31T00:00:00Z' }, win), false);
  assert.equal(titleInWindow({ premiereDate: '2005-01-01T00:00:00Z' }, win), false);
  assert.equal(titleInWindow({ year: 1980 }, win), true); // year floor is inclusive
  assert.equal(titleInWindow({ year: 1979 }, win), false);
  assert.equal(titleInWindow({}, win), false); // undated can't prove it clears the floor
  const noFloor = suggestionWindow(null, null, '1999', at(2026, 8, 8));
  assert.equal(titleInWindow({}, noFloor), true); // no floor → undated passes
});

test('formatCutoffLabel renders the EFFECTIVE date', () => {
  const pin = { mediaReleaseDate: '1996-06-12', pinnedAt: at(2026, 8, 1).toISOString() };
  assert.equal(formatCutoffLabel(pin, at(2026, 8, 3)), '14-JUN-1996');
});
