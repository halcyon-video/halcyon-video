// #77 — the counter CRT silently truncated its menu: drawTerminal's body box
// seats ~10 rows at the default pitch and the manager ring is 12, so the two
// bottom rows (MANAGER OVERRIDE, RETURN TO STORE) were slice()d away with no
// trace. fitTerminalPitch is the fix's pure core; these tests pin it against
// the REAL geometry drawTerminal derives from the shared 1024x768 terminal
// canvas, and against the real ring lengths from counterTerminalLines.
//
//   npm run test:terminal

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COUNTER_TERMINAL_LABELS,
  counterTerminalLines,
  fitTerminalPitch,
} from '../src/counter-terminal.ts';

// Mirror of drawTerminal's derivation (entrance/index.ts) for its 1024x768
// canvas — if the geometry there changes, re-derive these.
const W = 1024, H = 768;
const PAD_X = W * 0.155;
const SAFE_W = W - PAD_X * 2;
const CH = SAFE_W / 40;
const FONT_PX = Math.floor(CH / 0.6);
const LINE_H = Math.round(FONT_PX * 1.24);
const PAD_Y = H * 0.12;
const BODY_TOP = PAD_Y + LINE_H * 2;
const FOOT_TOP = Math.round(H * 0.73);
const BODY_SPAN = FOOT_TOP - BODY_TOP;

test('idle screen keeps the default pitch', () => {
  const { lineH, maxLines } = fitTerminalPitch(9, LINE_H, FONT_PX, BODY_SPAN);
  assert.equal(lineH, LINE_H);
  assert.ok(maxLines >= 9);
});

test('the full manager ring seats without clipping (#77)', () => {
  const ids = Object.keys(COUNTER_TERMINAL_LABELS);
  assert.equal(ids.length, 10); // full ring incl. the two CRT-only rows
  const { lines, cursorLine } = counterTerminalLines(ids, ids.length - 1);
  assert.equal(lines.length, 12); // 2 header rows + 10 buttons
  assert.equal(lines[lines.length - 1], '> RETURN TO STORE');
  assert.equal(cursorLine, lines.length - 1);
  const { lineH, maxLines } = fitTerminalPitch(lines.length, LINE_H, FONT_PX, BODY_SPAN);
  assert.ok(maxLines >= lines.length, `only ${maxLines} of ${lines.length} rows fit`);
  assert.ok(lineH >= FONT_PX, 'pitch fell below 1.0 leading');
  // The compressed rows must still physically clear the footer's reserve.
  assert.ok(BODY_TOP + (lines.length + 0.4) * lineH <= FOOT_TOP + 1e-6);
});

test('a list too long even at floor pitch reports a smaller maxLines', () => {
  const { lineH, maxLines } = fitTerminalPitch(20, LINE_H, FONT_PX, BODY_SPAN);
  assert.equal(lineH, FONT_PX);
  assert.ok(maxLines < 20);
  assert.ok(maxLines >= 1);
});

test('every CRT label obeys the 38-char clip contract', () => {
  for (const [id, label] of Object.entries(COUNTER_TERMINAL_LABELS)) {
    assert.ok(label.length <= 38, `${id} label is ${label.length} chars`);
  }
});
