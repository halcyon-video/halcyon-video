import {test} from 'node:test';
import assert from 'node:assert/strict';
import {catalogLoadingReporter, shouldPauseStoreConnection, requiresStoreSignIn} from '../src/boot-loading.ts';
test('ordinary input cannot interrupt a healthy connection and reveal empty shelves', () => {
  for (const key of ['Enter', 'ArrowDown', ' ', 'Tab']) assert.equal(shouldPauseStoreConnection('keydown', key), false);
  assert.equal(shouldPauseStoreConnection('click'), false);
  assert.equal(shouldPauseStoreConnection('keydown', 'Escape'), true);
});
test('catalog progress reports completed libraries and pages while preserving watchdog ticks', () => {
  const updates: [number, string?][] = [], ticks: string[] = [];
  const report = catalogLoadingReporter((n, detail) => updates.push([n, detail]), stage => ticks.push(stage));
  for (const stage of ['settings', 'page', 'page', 'catalog 1 of 3', 'catalog 3 of 3', 'done']) report(stage);
  assert.equal(updates[3][0], 21); assert.equal(updates[4][0], 23); assert.equal(updates[5][0], 24);
  assert.match(updates[2][1]!, /2 pages/); assert.equal(ticks[1], 'page');
  report('Friend: catalog 1 of 2'); assert.equal(updates.at(-1)![0], 21.5);
});

test('expired authentication is distinguished from an unavailable server', () => {
  for (const message of ['HTTP error 401: ', 'HTTP 401', 'Unauthorized', 'status: 401']) assert.equal(requiresStoreSignIn(message), true);
  for (const message of ['HTTP error 503', 'Request timed out', 'No movies found']) assert.equal(requiresStoreSignIn(message), false);
});
