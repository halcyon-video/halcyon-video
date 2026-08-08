// Issue #42 — the MEDIA RELEASE DATE screen on the counter CRT, as pure state.
//
// BIOS-clock interaction, because the couch remote is momentary buttons only:
// Left/Right move focus across YEAR / MONTH / DAY / MATCH ERA / SET / CLEAR /
// BACK, Up/Down change the focused value (or toggle MATCH ERA), OK advances a
// field (and fires the focused action row), Back returns to the manager menu.
// Typed digits are keyboard-only sugar handled by the flow module on top.
//
// Pure data + reducer + formatter, no DOM and no three.js: main.ts's flow
// module and the shot harness both render the SAME lines, and the reducer
// unit-tests under bare `node --test` alongside media-release-date.test.ts.
// Explicit .ts specifier (allowImportingTsExtensions): unlike the other
// node-tested modules this one has a RUNTIME dependency on a sibling, and the
// bare specifier resolves under Vite/tsc but not under `node --test`'s
// type-stripping loader.
import type { MediaReleasePin } from './media-release-date.ts';
import {
  PIN_YEAR_MAX,
  PIN_YEAR_MIN,
  effectiveCutoff,
  formatCutoffLabel,
} from './media-release-date.ts';

export const FOCUS_YEAR = 0;
export const FOCUS_MONTH = 1;
export const FOCUS_DAY = 2;
export const FOCUS_ERA = 3;
export const FOCUS_SET = 4;
export const FOCUS_CLEAR = 5;
export const FOCUS_BACK = 6;
const FOCUS_COUNT = 7;

export interface MediaDateScreenState {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31, clamped to the month
  matchEra: boolean;
  focus: number; // FOCUS_* above
  /** Digits typed into the focused field since it gained focus (keyboard). */
  typed: string;
}

export type MediaDateKey = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back';

export interface MediaDateKeyResult {
  state: MediaDateScreenState;
  /** What the host flow should do beyond re-rendering. */
  action: 'none' | 'save' | 'clear' | 'back';
}

const daysInMonth = (y: number, m: number): number => new Date(y, m, 0).getDate();

const clampDay = (s: MediaDateScreenState): MediaDateScreenState => ({
  ...s,
  day: Math.min(s.day, daysInMonth(s.year, s.month)),
});

/** Start from the current pin's effective date (or today, unpinned). */
export function initMediaDateScreen(pin: MediaReleasePin | null, now: Date): MediaDateScreenState {
  const base = pin ? effectiveCutoff(pin, now) : now;
  return {
    year: Math.min(PIN_YEAR_MAX, Math.max(PIN_YEAR_MIN, base.getFullYear())),
    month: base.getMonth() + 1,
    day: base.getDate(),
    matchEra: !!pin?.matchEra,
    focus: FOCUS_YEAR,
    typed: '',
  };
}

/** One remote/keyboard press. Pure — the host applies `action` itself. */
export function mediaDateScreenKey(s: MediaDateScreenState, key: MediaDateKey): MediaDateKeyResult {
  const move = (delta: number): MediaDateKeyResult => ({
    state: { ...s, focus: (s.focus + delta + FOCUS_COUNT) % FOCUS_COUNT, typed: '' },
    action: 'none',
  });
  switch (key) {
    case 'left': return move(-1);
    case 'right': return move(1);
    case 'up':
    case 'down': {
      const d = key === 'up' ? 1 : -1;
      if (s.focus === FOCUS_YEAR) {
        const year = Math.min(PIN_YEAR_MAX, Math.max(PIN_YEAR_MIN, s.year + d));
        return { state: clampDay({ ...s, year, typed: '' }), action: 'none' };
      }
      if (s.focus === FOCUS_MONTH) {
        const month = ((s.month - 1 + d + 12) % 12) + 1;
        return { state: clampDay({ ...s, month, typed: '' }), action: 'none' };
      }
      if (s.focus === FOCUS_DAY) {
        const n = daysInMonth(s.year, s.month);
        const day = ((s.day - 1 + d + n) % n) + 1;
        return { state: { ...s, day, typed: '' }, action: 'none' };
      }
      if (s.focus === FOCUS_ERA) {
        return { state: { ...s, matchEra: !s.matchEra, typed: '' }, action: 'none' };
      }
      return { state: s, action: 'none' }; // action rows: ^/v is inert
    }
    case 'ok':
      if (s.focus === FOCUS_SET) return { state: s, action: 'save' };
      if (s.focus === FOCUS_CLEAR) return { state: s, action: 'clear' };
      if (s.focus === FOCUS_BACK) return { state: s, action: 'back' };
      if (s.focus === FOCUS_ERA) {
        return { state: { ...s, matchEra: !s.matchEra }, action: 'none' };
      }
      return move(1); // date fields: OK steps toward SET
    case 'back':
      return { state: s, action: 'back' };
  }
}

/**
 * A typed digit into the focused date field (keyboard users). Fields fill
 * left-to-right and auto-advance when full; out-of-range values clamp on
 * commit, so "00" can never wedge a month.
 */
export function mediaDateScreenDigit(s: MediaDateScreenState, digit: string): MediaDateScreenState {
  if (!/^[0-9]$/.test(digit)) return s;
  if (s.focus !== FOCUS_YEAR && s.focus !== FOCUS_MONTH && s.focus !== FOCUS_DAY) return s;
  const width = s.focus === FOCUS_YEAR ? 4 : 2;
  const typed = (s.typed + digit).slice(0, width);
  const value = parseInt(typed, 10);
  let next: MediaDateScreenState = { ...s, typed };
  if (typed.length < width) {
    // Partial entry shows live where it can (a half-typed year of "19" reads
    // as 19 — harmless, it clamps on commit or further digits).
    if (s.focus === FOCUS_MONTH && value >= 1 && value <= 12) next.month = value;
    if (s.focus === FOCUS_DAY && value >= 1) next.day = Math.min(value, daysInMonth(s.year, s.month));
    if (s.focus === FOCUS_YEAR && typed.length === 4) next.year = value;
    return next;
  }
  // Field full: commit with clamps, then advance focus.
  if (s.focus === FOCUS_YEAR) next.year = Math.min(PIN_YEAR_MAX, Math.max(PIN_YEAR_MIN, value));
  if (s.focus === FOCUS_MONTH) next.month = Math.min(12, Math.max(1, value));
  if (s.focus === FOCUS_DAY) next.day = Math.max(1, Math.min(value, daysInMonth(next.year, next.month)));
  next = clampDay(next);
  next.focus = next.focus + 1;
  next.typed = '';
  return next;
}

const p2 = (n: number) => n.toString().padStart(2, '0');

/**
 * The CRT lines (each <= 40 chars — drawTerminal hard-clips there) plus the
 * row the blinking cursor parks on. The focused element wears brackets.
 */
export function mediaDateScreenLines(
  s: MediaDateScreenState,
  pin: MediaReleasePin | null,
  now: Date,
): { lines: string[]; cursorLine: number } {
  const wrap = (txt: string, focused: boolean) => (focused ? `[${txt}]` : ` ${txt} `);
  const status = pin
    ? `STATUS: PINNED — STORE DATE ${formatCutoffLabel(pin, now)}`
    : 'STATUS: LIVE — CATALOG UNPINNED';
  const dateRow =
    `  DATE: ${wrap(String(s.year), s.focus === FOCUS_YEAR)}/${wrap(p2(s.month), s.focus === FOCUS_MONTH)}/${wrap(p2(s.day), s.focus === FOCUS_DAY)}`;
  const eraRow = `  MATCH STORE ERA: ${wrap(s.matchEra ? 'YES' : 'NO', s.focus === FOCUS_ERA)}`;
  const actionsRow =
    ` ${wrap('SET PIN', s.focus === FOCUS_SET)}  ${wrap('CLEAR', s.focus === FOCUS_CLEAR)}  ${wrap('BACK', s.focus === FOCUS_BACK)}`;
  // Exactly 10 rows: the counterterm CRT clips at ~10 body lines before the
  // footer bar (verified on the mediadate shot), so no blank between the
  // action row and the two advice lines.
  const lines = [
    'MEDIA RELEASE DATE — CATALOG PIN',
    '',
    status,
    '',
    dateRow,
    eraRow,
    '',
    actionsRow,
    'TITLES PAST THE STORE DATE VANISH.',
    '</> FIELD  ^/v CHANGE  OK NEXT/USE',
  ];
  const cursorLine = s.focus <= FOCUS_DAY ? 4 : s.focus === FOCUS_ERA ? 5 : 7;
  return { lines, cursorLine };
}
