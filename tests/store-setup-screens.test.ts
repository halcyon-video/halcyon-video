// Issue #41 — unit tests for the NEW STORE SETUP terminal's pure screens:
// row navigation, typed-field editing, the guard rails (no empty address, at
// least one carried library), the actions each screen can emit, and the
// 40-column line contract drawTerminal enforces.
//
//   npm run test:setup

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialHomeScreen,
  setupScreenKey,
  setupScreenChar,
  setupScreenBackspace,
  setupScreenLines,
  type SetupScreen,
} from '../src/store-setup-screens.ts';

function lines(s: SetupScreen): string[] {
  return setupScreenLines(s).lines;
}

test('home: starts on the address row with the saved address prefilled', () => {
  const s = initialHomeScreen('http://tv:8096');
  assert.equal(s.row, 1);
  assert.equal(s.address, 'http://tv:8096');
  assert.match(lines(s)[0], /NEW STORE SETUP/);
});

test('home: up/down wrap through the four rows', () => {
  let s = initialHomeScreen();
  s = setupScreenKey(s, 'down').state as typeof s;
  assert.equal((s as any).row, 2);
  s = setupScreenKey(setupScreenKey(s, 'down').state, 'down').state as typeof s;
  assert.equal((s as any).row, 0); // wrapped past TRY A DEMO STORE
  s = setupScreenKey(s, 'up').state as typeof s;
  assert.equal((s as any).row, 3);
});

test('home: typing lands in the address only while its row is focused', () => {
  let s: SetupScreen = initialHomeScreen('http://');
  s = setupScreenChar(s, 'x');
  assert.equal((s as any).address, 'http://x');
  s = setupScreenBackspace(s);
  assert.equal((s as any).address, 'http://');
  const onProvider = setupScreenKey(s, 'up').state; // row 0
  assert.equal((setupScreenChar(onProvider, 'x') as any).address, 'http://');
});

test('home: CONNECT without an address is refused with an error line', () => {
  let s: SetupScreen = initialHomeScreen();
  s = setupScreenKey(s, 'down').state; // CONNECT
  const { state, action } = setupScreenKey(s, 'ok');
  assert.equal(action, undefined);
  assert.match((state as any).error, /ADDRESS/);
});

test('home: CONNECT with an address emits connect; demo row emits demo', () => {
  let s: SetupScreen = { ...initialHomeScreen('http://tv:8096'), row: 2 };
  assert.equal(setupScreenKey(s, 'ok').action, 'connect');
  s = { ...s, row: 3 };
  assert.equal(setupScreenKey(s, 'ok').action, 'demo');
});

test('home: OK on the distributor/address rows advances BIOS-style', () => {
  let s: SetupScreen = { ...initialHomeScreen(), row: 0 };
  s = setupScreenKey(s, 'ok').state;
  assert.equal((s as any).row, 1);
  s = setupScreenKey(s, 'ok').state;
  assert.equal((s as any).row, 2);
});

test('manual-auth: sign-in requires a member name; back emits back-home', () => {
  let s: SetupScreen = { kind: 'manual-auth', row: 2, username: '', password: '' };
  const refused = setupScreenKey(s, 'ok');
  assert.equal(refused.action, undefined);
  assert.match((refused.state as any).error, /MEMBER NAME/);
  s = { kind: 'manual-auth', row: 2, username: 'dave', password: '' };
  assert.equal(setupScreenKey(s, 'ok').action, 'sign-in');
  s = { kind: 'manual-auth', row: 3, username: '', password: '' };
  assert.equal(setupScreenKey(s, 'ok').action, 'back-home');
});

test('manual-auth: the password renders masked, never in clear', () => {
  const s: SetupScreen = { kind: 'manual-auth', row: 1, username: 'dave', password: 'hunter2' };
  const all = lines(s).join('\n');
  assert.ok(!all.includes('hunter2'));
  assert.match(all, /\*{7}/);
});

test('libraries: OK toggles a row; OPEN THE STORE needs one carried', () => {
  let s: SetupScreen = {
    kind: 'libraries',
    rows: [
      { id: 'a', name: 'Movies', carried: true },
      { id: 'b', name: 'Kids', carried: false },
    ],
    row: 0,
  };
  s = setupScreenKey(s, 'ok').state;
  assert.equal((s as any).rows[0].carried, false);
  const refused = setupScreenKey({ ...(s as any), row: 2 }, 'ok');
  assert.equal(refused.action, undefined);
  assert.match((refused.state as any).error, /AT LEAST ONE/);
  s = setupScreenKey(s, 'ok').state; // toggle Movies back on
  assert.equal(setupScreenKey({ ...(s as any), row: 2 }, 'ok').action, 'open-store');
});

test('libraries: long lists window around the cursor and keep CONTINUE last', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ id: String(i), name: `Library ${i}`, carried: true }));
  const s: SetupScreen = { kind: 'libraries', rows, row: 11 };
  const { lines: ls, cursorLine } = setupScreenLines(s);
  assert.match(ls[cursorLine], /LIBRARY 11/);
  assert.match(ls[ls.length - 1], /CONTINUE/);
  const home: SetupScreen = { kind: 'libraries', rows, row: 0 };
  const first = setupScreenLines(home);
  assert.match(first.lines[first.cursorLine], /LIBRARY 0/);
});

test('streaming: OK toggles a row; zero chosen is allowed (no error, still emits open-store)', () => {
  let s: SetupScreen = {
    kind: 'streaming',
    rows: [
      { id: 'netflix', name: 'NETFLIX', carried: false },
      { id: 'hulu', name: 'HULU', carried: false },
    ],
    row: 0,
  };
  s = setupScreenKey(s, 'ok').state;
  assert.equal((s as any).rows[0].carried, true);
  s = setupScreenKey(s, 'ok').state; // toggle back off
  assert.equal((s as any).rows[0].carried, false);
  const confirmed = setupScreenKey({ ...(s as any), row: 2 }, 'ok');
  assert.equal(confirmed.action, 'open-store');
  assert.equal((confirmed.state as any).error, undefined);
});

test('streaming: long lists window around the cursor and keep OPEN THE STORE last', () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({ id: String(i), name: `SERVICE ${i}`, carried: false }));
  const s: SetupScreen = { kind: 'streaming', rows, row: 7 };
  const { lines: ls, cursorLine } = setupScreenLines(s);
  assert.match(ls[cursorLine], /SERVICE 7/);
  assert.match(ls[ls.length - 1], /OPEN THE STORE/);
});

test('notice: rows emit retry / change-server / demo / copy-report', () => {
  const base: SetupScreen = { kind: 'notice', address: 'http://tv:8096', detail: 'NO ANSWER', row: 0 };
  assert.equal(setupScreenKey(base, 'ok').action, 'retry');
  assert.equal(setupScreenKey({ ...base, row: 1 }, 'ok').action, 'change-server');
  assert.equal(setupScreenKey({ ...base, row: 2 }, 'ok').action, 'demo');
  const copyRes = setupScreenKey({ ...base, row: 3 }, 'ok');
  assert.equal(copyRes.action, 'copy-report');
  assert.equal((copyRes.state as any).copied, true);
  assert.match(lines(copyRes.state).join('\n'), /REPORT COPIED/);
});

test('home with error: offers COPY REPORT on row 4 and wraps navigation', () => {
  let s: SetupScreen = { ...initialHomeScreen('http://tv:8096'), row: 3, error: 'CONNECTION FAILED.' };
  assert.match(lines(s).join('\n'), /COPY REPORT/);
  // down from row 3 goes to row 4 (COPY REPORT)
  s = setupScreenKey(s, 'down').state;
  assert.equal((s as any).row, 4);
  const copyRes = setupScreenKey(s, 'ok');
  assert.equal(copyRes.action, 'copy-report');
  assert.equal((copyRes.state as any).copied, true);
  assert.match(lines(copyRes.state).join('\n'), /REPORT COPIED/);

  // down wraps to row 0
  s = setupScreenKey(s, 'down').state;
  assert.equal((s as any).row, 0);

  // typing in address row clears error and copied
  let typingScreen: SetupScreen = { ...initialHomeScreen('http://tv:8096'), row: 1, error: 'ERR', copied: true };
  typingScreen = setupScreenChar(typingScreen, 'a');
  assert.equal((typingScreen as any).error, undefined);
  assert.equal((typingScreen as any).copied, undefined);
});

test('every screen honors the 40-column CRT clip', () => {
  const long = 'http://a-truly-unreasonably-long-hostname.example.com:8096/jellyfin';
  const screens: SetupScreen[] = [
    { ...initialHomeScreen(long), error: 'X'.repeat(60) },
    { ...initialHomeScreen(long), error: 'X'.repeat(60), copied: true },
    { kind: 'dialing', address: long, step: 'S'.repeat(60) },
    { kind: 'members', count: 12 },
    { kind: 'manual-auth', row: 0, username: 'u'.repeat(60), password: 'p'.repeat(60) },
    { kind: 'libraries', rows: [{ id: 'a', name: 'N'.repeat(80), carried: true }], row: 0 },
    { kind: 'streaming', rows: [{ id: 'a', name: 'N'.repeat(80), carried: true }], row: 0 },
    { kind: 'sync', stage: 'S'.repeat(80), pages: 12345 },
    { kind: 'arriving' },
    { kind: 'notice', address: long, detail: 'D'.repeat(80), row: 0 },
    { kind: 'notice', address: long, detail: 'D'.repeat(80), row: 3, copied: true },
  ];
  for (const s of screens) {
    for (const line of lines(s)) {
      assert.ok(line.length <= 40, `line over 40 cols: "${line}" (${line.length})`);
    }
  }
});

test('cursorLine always points at a real line', () => {
  const screens: SetupScreen[] = [
    initialHomeScreen(),
    { ...initialHomeScreen(), error: 'ERROR MESSAGE', row: 4 },
    { kind: 'dialing', address: 'http://tv', step: 'DIALING...' },
    { kind: 'members', count: 2 },
    { kind: 'manual-auth', row: 3, username: '', password: '' },
    { kind: 'libraries', rows: [{ id: 'a', name: 'Movies', carried: true }], row: 1 },
    { kind: 'streaming', rows: [{ id: 'a', name: 'NETFLIX', carried: false }], row: 1 },
    { kind: 'sync', stage: 'SYNC', pages: 0 },
    { kind: 'arriving' },
    { kind: 'notice', address: 'http://tv', detail: 'NO ANSWER', row: 2 },
    { kind: 'notice', address: 'http://tv', detail: 'NO ANSWER', row: 3, copied: true },
  ];
  for (const s of screens) {
    const { lines: ls, cursorLine } = setupScreenLines(s);
    assert.ok(cursorLine >= 0 && cursorLine < ls.length, `cursor ${cursorLine} outside ${ls.length} lines for ${s.kind}`);
  }
});

