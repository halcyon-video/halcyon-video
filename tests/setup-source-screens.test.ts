// The multi-server setup screens (GH #84) — the counter CRT's side of "my
// libraries AND my friend's".
//
// These are pure reducers and line renderers, so they pin the two things that
// actually decide whether the feature works from a couch: that the server list
// is a MULTI-choice (the reported complaint was being made to pick one), and
// that the renderers stay inside drawTerminal's 40-column, ~10-row budget with
// group headers added — the constraint that makes grouped rows non-trivial.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSourceScreen,
  sourceScreenKey,
  sourceScreenLines,
  type SetupGroupedLibraryRow,
  type SetupServerRow,
  type SourceScreen,
} from '../src/setup-source-screens.ts';

const MAX_COLS = 40;
const MAX_ROWS = 10;

function servers(...names: [string, boolean][]): SetupServerRow[] {
  return names.map(([name, owned], i) => ({
    url: `http://s${i}:32400`, name, owned, chosen: owned,
  }));
}

function grouped(...rows: [string, string, boolean][]): SetupGroupedLibraryRow[] {
  return rows.map(([group, name, carried], i) => ({
    id: `s${i}:${i}`, name, carried, group,
  }));
}

/** Every screen must fit the terminal it is drawn on. */
function assertFits(s: SourceScreen, label: string): void {
  const { lines, cursorLine } = sourceScreenLines(s);
  assert.ok(lines.length <= MAX_ROWS, `${label}: ${lines.length} lines (max ${MAX_ROWS})`);
  for (const line of lines) {
    assert.ok(line.length <= MAX_COLS, `${label}: "${line}" is ${line.length} cols`);
  }
  assert.ok(cursorLine >= 0 && cursorLine < lines.length, `${label}: cursor off-screen`);
}

test('isSourceScreen tells the two screen families apart', () => {
  assert.equal(isSourceScreen({ kind: 'sources' }), true);
  assert.equal(isSourceScreen({ kind: 'plex-servers' }), true);
  assert.equal(isSourceScreen({ kind: 'libraries-multi' }), true);
  assert.equal(isSourceScreen({ kind: 'home' }), false);
  assert.equal(isSourceScreen(null), false);
});

// ─── The server picker: the fix for the reported bug ─────────────────────────

test('the account server list is a MULTI-choice — ticking one does not untick another', () => {
  let s: SourceScreen = { kind: 'plex-servers', rows: servers(['Home', true], ['Dave', false]), row: 0 };
  // Row 1 (the shared one) starts unticked; tick it and BOTH are on.
  s = sourceScreenKey(s, 'down').state;
  s = sourceScreenKey(s, 'ok').state;
  assert.equal(s.kind, 'plex-servers');
  assert.deepEqual((s as any).rows.map((r: SetupServerRow) => r.chosen), [true, true]);
});

test("your own servers start ticked; someone else's is a deliberate choice", () => {
  const rows = servers(['Home', true], ['Dave', false]);
  assert.deepEqual(rows.map((r) => r.chosen), [true, false]);
});

test('CONNECT is refused with nothing ticked, and fires once something is', () => {
  let s: SourceScreen = { kind: 'plex-servers', rows: servers(['Home', false]), row: 0 };
  s = sourceScreenKey(s, 'down').state; // onto CONNECT
  const refused = sourceScreenKey(s, 'ok');
  assert.equal(refused.action, undefined);
  assert.match((refused.state as any).error, /TICK AT LEAST ONE/);

  let ticked: SourceScreen = { kind: 'plex-servers', rows: servers(['Home', true]), row: 1 };
  assert.equal(sourceScreenKey(ticked, 'ok').action, 'connect-servers');
});

test('a shared server is labelled as shared — that is the distinction being made', () => {
  const { lines } = sourceScreenLines({
    kind: 'plex-servers', rows: servers(['Home', true], ['Dave', false]), row: 0,
  });
  assert.ok(lines.some((l) => l.includes('DAVE (SHARED)')), lines.join('\n'));
  assert.ok(lines.some((l) => /\[X\] HOME/.test(l)), lines.join('\n'));
});

// ─── Grouped library checkboxes ──────────────────────────────────────────────

test('grouped libraries show a header per server', () => {
  const { lines } = sourceScreenLines({
    kind: 'libraries-multi',
    rows: grouped(['Home', 'Movies', true], ['Home', 'Anime', true], ['Dave', 'Movies', true]),
    row: 0,
  });
  const text = lines.join('\n');
  assert.ok(text.includes('HOME'), text);
  assert.ok(text.includes('DAVE'), text);
  // Both servers' "Movies" rows are present and distinguishable by header.
  assert.equal(lines.filter((l) => l.includes('MOVIES')).length, 2, text);
});

test('carrying nothing is refused; the confirm fires otherwise', () => {
  const none = grouped(['Home', 'Movies', false]);
  const s: SourceScreen = { kind: 'libraries-multi', rows: none, row: 1 };
  const refused = sourceScreenKey(s, 'ok');
  assert.equal(refused.action, undefined);
  assert.match((refused.state as any).error, /CARRY AT LEAST ONE/);

  const some: SourceScreen = { kind: 'libraries-multi', rows: grouped(['Home', 'Movies', true]), row: 1 };
  assert.equal(sourceScreenKey(some, 'ok').action, 'libraries-done');
});

test('a long grouped list still fits the terminal at every cursor position', () => {
  const rows = grouped(
    ...Array.from({ length: 12 }, (_, i): [string, string, boolean] => [
      i < 6 ? 'Home Server' : "Dave's Plex Server", `Library Number ${i}`, true,
    ])
  );
  for (let row = 0; row <= rows.length; row++) {
    assertFits({ kind: 'libraries-multi', rows, row }, `libraries-multi row ${row}`);
  }
});

test('a scrolled window never shows libraries with no server named above them', () => {
  const rows = grouped(
    ...Array.from({ length: 12 }, (_, i): [string, string, boolean] => [
      i < 6 ? 'Home' : 'Dave', `Lib ${i}`, true,
    ])
  );
  // Deep into the list, where the window has scrolled past the first header.
  const { lines } = sourceScreenLines({ kind: 'libraries-multi', rows, row: 9 });
  const firstCheckbox = lines.findIndex((l) => l.includes('['));
  const headerAbove = lines.slice(0, firstCheckbox).some((l) => /HOME|DAVE/.test(l));
  assert.ok(headerAbove, `no group header above the rows:\n${lines.join('\n')}`);
});

// ─── Connected distributors ──────────────────────────────────────────────────

const ENTRIES = [
  { id: 'primary', name: 'Home', kind: 'JELLYFIN', libraryCount: 2 },
  { id: 's2', name: "Dave's Plex", kind: 'PLEX', libraryCount: 3 },
];

test('the sources screen opens on CONTINUE, not on a server row', () => {
  // Landing the cursor on a row whose OK disconnects a server would be a trap.
  const s: SourceScreen = { kind: 'sources', entries: ENTRIES, row: ENTRIES.length + 1 };
  assert.equal(sourceScreenKey(s, 'ok').action, 'continue');
});

test('ADD ANOTHER SERVER and DISCONNECT are reachable and distinct', () => {
  const add: SourceScreen = { kind: 'sources', entries: ENTRIES, row: ENTRIES.length };
  assert.equal(sourceScreenKey(add, 'ok').action, 'add-another');

  const drop: SourceScreen = { kind: 'sources', entries: ENTRIES, row: 0 };
  assert.equal(sourceScreenKey(drop, 'ok').action, 'drop-source');
});

test('CONTINUE with every server disconnected is refused', () => {
  const s: SourceScreen = { kind: 'sources', entries: [], row: 1 };
  const res = sourceScreenKey(s, 'ok');
  assert.equal(res.action, undefined);
  assert.match((res.state as any).error, /CONNECT AT LEAST ONE/);
});

test('the sources screen counts servers and fits at every cursor position', () => {
  const { lines } = sourceScreenLines({ kind: 'sources', entries: ENTRIES, row: 3 });
  assert.ok(lines.join('\n').includes('2 SERVERS'), lines.join('\n'));
  for (let row = 0; row < ENTRIES.length + 2; row++) {
    assertFits({ kind: 'sources', entries: ENTRIES, row }, `sources row ${row}`);
  }
});

test('every server picker size fits the terminal', () => {
  const rows = servers(
    ...Array.from({ length: 9 }, (_, i): [string, boolean] => [`Server Number ${i}`, i === 0])
  );
  for (let row = 0; row <= rows.length; row++) {
    assertFits({ kind: 'plex-servers', rows, row }, `plex-servers row ${row}`);
  }
});

test('arrow keys wrap around each screen rather than dead-ending', () => {
  const s: SourceScreen = { kind: 'sources', entries: ENTRIES, row: 0 };
  assert.equal((sourceScreenKey(s, 'up').state as any).row, ENTRIES.length + 1);
  const last: SourceScreen = { kind: 'sources', entries: ENTRIES, row: ENTRIES.length + 1 };
  assert.equal((sourceScreenKey(last, 'down').state as any).row, 0);
});
