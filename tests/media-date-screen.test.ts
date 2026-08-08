// Issue #42 — unit tests for the MEDIA RELEASE DATE screen's pure reducer:
// BIOS-style focus/value moves, digit typing, day clamping, action rows, and
// the 40-column line contract drawTerminal enforces.
//
//   npm run test:releasedate   (runs alongside media-release-date.test.ts)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FOCUS_BACK,
  FOCUS_CLEAR,
  FOCUS_DAY,
  FOCUS_ERA,
  FOCUS_MONTH,
  FOCUS_SET,
  FOCUS_YEAR,
  initMediaDateScreen,
  mediaDateScreenDigit,
  mediaDateScreenKey,
  mediaDateScreenLines,
} from '../src/media-date-screen.ts';

const now = new Date(2026, 7, 8, 12); // Sat 2026-08-08

test('init: unpinned starts at today, focus on year, era-follow off', () => {
  const s = initMediaDateScreen(null, now);
  assert.equal(s.year, 2026);
  assert.equal(s.month, 8);
  assert.equal(s.day, 8);
  assert.equal(s.matchEra, false);
  assert.equal(s.focus, FOCUS_YEAR);
});

test('init: pinned starts at the EFFECTIVE date and keeps matchEra', () => {
  const pin = { mediaReleaseDate: '1996-06-12', pinnedAt: new Date(2026, 7, 1).toISOString(), matchEra: true };
  const s = initMediaDateScreen(pin, now); // 7 days after pinning
  assert.equal(s.year, 1996);
  assert.equal(s.month, 6);
  assert.equal(s.day, 19);
  assert.equal(s.matchEra, true);
});

test('left/right move focus and wrap', () => {
  let s = initMediaDateScreen(null, now);
  s = mediaDateScreenKey(s, 'left').state;
  assert.equal(s.focus, FOCUS_BACK);
  s = mediaDateScreenKey(s, 'right').state;
  assert.equal(s.focus, FOCUS_YEAR);
  s = mediaDateScreenKey(s, 'right').state;
  assert.equal(s.focus, FOCUS_MONTH);
});

test('up/down change the focused field; month wraps; day clamps to month', () => {
  let s = { ...initMediaDateScreen(null, now), year: 1996, month: 1, day: 31, focus: FOCUS_MONTH };
  s = mediaDateScreenKey(s, 'up').state; // Jan -> Feb
  assert.equal(s.month, 2);
  assert.equal(s.day, 29); // 1996 is a leap year
  s = { ...s, month: 12, day: 15 };
  s = mediaDateScreenKey(s, 'up').state; // Dec wraps to Jan
  assert.equal(s.month, 1);
});

test('up/down toggle MATCH STORE ERA', () => {
  let s = { ...initMediaDateScreen(null, now), focus: FOCUS_ERA };
  s = mediaDateScreenKey(s, 'down').state;
  assert.equal(s.matchEra, true);
  s = mediaDateScreenKey(s, 'up').state;
  assert.equal(s.matchEra, false);
});

test('ok advances date fields, fires the focused action row', () => {
  let s = initMediaDateScreen(null, now);
  const r1 = mediaDateScreenKey(s, 'ok');
  assert.equal(r1.action, 'none');
  assert.equal(r1.state.focus, FOCUS_MONTH);
  assert.equal(mediaDateScreenKey({ ...s, focus: FOCUS_SET }, 'ok').action, 'save');
  assert.equal(mediaDateScreenKey({ ...s, focus: FOCUS_CLEAR }, 'ok').action, 'clear');
  assert.equal(mediaDateScreenKey({ ...s, focus: FOCUS_BACK }, 'ok').action, 'back');
  assert.equal(mediaDateScreenKey(s, 'back').action, 'back');
});

test('typed digits fill a field and auto-advance on the last one', () => {
  let s = initMediaDateScreen(null, now);
  for (const d of '1996') s = mediaDateScreenDigit(s, d);
  assert.equal(s.year, 1996);
  assert.equal(s.focus, FOCUS_MONTH);
  for (const d of '06') s = mediaDateScreenDigit(s, d);
  assert.equal(s.month, 6);
  assert.equal(s.focus, FOCUS_DAY);
  for (const d of '31') s = mediaDateScreenDigit(s, d);
  assert.equal(s.day, 30); // June has 30 days — clamped on commit
  assert.equal(s.focus, FOCUS_ERA);
});

test('typed out-of-range month clamps instead of wedging', () => {
  let s = { ...initMediaDateScreen(null, now), focus: FOCUS_MONTH };
  for (const d of '00') s = mediaDateScreenDigit(s, d);
  assert.equal(s.month, 1);
});

test('lines: every row fits the CRT 40-column clip, brackets track focus', () => {
  const pin = { mediaReleaseDate: '1996-06-12' };
  for (let focus = FOCUS_YEAR; focus <= FOCUS_BACK; focus++) {
    const s = { ...initMediaDateScreen(pin, now), focus };
    const { lines, cursorLine } = mediaDateScreenLines(s, pin, now);
    for (const line of lines) assert.ok(line.length <= 40, `"${line}" is ${line.length} chars`);
    assert.ok(cursorLine >= 0 && cursorLine < lines.length);
  }
  const focused = mediaDateScreenLines({ ...initMediaDateScreen(pin, now), focus: FOCUS_SET }, pin, now);
  assert.match(focused.lines[7], /\[SET PIN\]/);
  assert.match(focused.lines[2], /12-JUN-1996/);
  const live = mediaDateScreenLines(initMediaDateScreen(null, now), null, now);
  assert.match(live.lines[2], /LIVE/);
});
