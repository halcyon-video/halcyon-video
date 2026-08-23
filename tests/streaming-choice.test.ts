// #96 — the streaming-services picker is asked in two places (opening day and
// the manager terminal), so the rows and the CSV they persist to are shared
// (src/streaming-choice.ts). These pin the round trip and the two ways it
// could quietly lose someone's choice: a hand-typed custom service dropped
// because it isn't one of the default eight, and a caller reading raw
// localStorage on a build whose default is all eight.
//
//   npm run test:streamingchoice

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  streamingChoiceCsv,
  streamingChoiceRows,
  streamingChoiceScreen,
} from '../src/streaming-choice.ts';
import { ALL_DEFAULT_STREAMING_SERVICES_CSV, DEFAULT_STREAMING_SERVICES } from '../src/streaming-catalog.ts';
import { setupScreenKey, setupScreenLines } from '../src/store-setup-screens.ts';

test('a blank choice offers every default service, none ticked', () => {
  const rows = streamingChoiceRows('');
  assert.equal(rows.length, DEFAULT_STREAMING_SERVICES.length);
  assert.ok(rows.every((r) => !r.carried));
  assert.equal(streamingChoiceCsv(rows), '');
});

test('null reads the same as blank (nothing persisted)', () => {
  assert.ok(streamingChoiceRows(null).every((r) => !r.carried));
});

test("the demo's all-eight default ticks every box", () => {
  const rows = streamingChoiceRows(ALL_DEFAULT_STREAMING_SERVICES_CSV);
  assert.ok(rows.every((r) => r.carried));
  assert.equal(streamingChoiceCsv(rows), ALL_DEFAULT_STREAMING_SERVICES_CSV);
});

test('an existing choice survives a round trip through the picker', () => {
  const csv = 'netflix,max';
  const rows = streamingChoiceRows(csv);
  assert.deepEqual(rows.filter((r) => r.carried).map((r) => r.id), ['netflix', 'max']);
  assert.equal(streamingChoiceCsv(rows), csv);
});

test('a service named by alias comes back as its id, still ticked', () => {
  const rows = streamingChoiceRows('HBO Max');
  assert.deepEqual(rows.filter((r) => r.carried).map((r) => r.id), ['max']);
});

test('a custom service typed in the drawer is offered, not silently dropped', () => {
  const rows = streamingChoiceRows('netflix,Shudder');
  const custom = rows.find((r) => r.id === 'shudder');
  assert.ok(custom, 'the custom entry is missing from the picker');
  assert.ok(custom.carried);
  assert.equal(streamingChoiceCsv(rows), 'netflix,shudder');
});

test('the manager terminal renders its own confirm label; opening day keeps OPEN THE STORE', () => {
  const reentry = streamingChoiceScreen('netflix', 'SAVE AND RESTOCK');
  const openingDay = streamingChoiceScreen('netflix');
  const last = (s: typeof reentry) => setupScreenLines(s).lines.at(-1);
  assert.equal(last(reentry), '  SAVE AND RESTOCK');
  assert.equal(last(openingDay), '  OPEN THE STORE');
});

test('ticking a box and confirming yields the chosen CSV', () => {
  // Walk the real reducer: OK on row 0 ticks the first service, then step to
  // the confirm row and press OK.
  let s = streamingChoiceScreen('', 'SAVE AND RESTOCK');
  s = setupScreenKey(s, 'ok').state;
  assert.ok(s.kind === 'streaming' && s.rows[0].carried);
  for (let i = 0; i < s.rows.length; i++) s = setupScreenKey(s, 'down').state;
  const { state, action } = setupScreenKey(s, 'ok');
  assert.equal(action, 'open-store');
  assert.ok(state.kind === 'streaming');
  assert.equal(streamingChoiceCsv(state.rows), DEFAULT_STREAMING_SERVICES[0].id);
});

test('confirming with nothing ticked is a legitimate answer', () => {
  let s = streamingChoiceScreen(ALL_DEFAULT_STREAMING_SERVICES_CSV, 'SAVE AND RESTOCK');
  assert.ok(s.kind === 'streaming');
  for (let i = 0; i < s.rows.length; i++) {
    s = setupScreenKey(s, 'ok').state;
    s = setupScreenKey(s, 'down').state;
  }
  const { state, action } = setupScreenKey(s, 'ok');
  assert.equal(action, 'open-store', 'an empty selection must not block the confirm row');
  assert.ok(state.kind === 'streaming');
  assert.equal(streamingChoiceCsv(state.rows), '');
});
