// MULTI-SERVER SETUP SCREENS (GH #84) — the three counter-CRT screens a store
// stocked from more than one distributor needs, as a pure state machine.
//
// Same split and the same renderer contract as store-setup-screens.ts (which
// this deliberately does NOT extend): drawTerminal clips at 40 characters and
// shows ~10 body rows, so every screen here budgets 10 lines. Kept as its own
// module because these screens are a feature, not a variant — and because the
// base screens' union is shared ground that a second flow has no business
// widening.
//
// The reported case drives the shape: two libraries on your own server, three
// on a friend's, both hanging off one Plex account. So the account's server
// list is a CHECKBOX screen rather than a pick-one — the whole complaint was
// being made to choose — and the library screen groups by whose server the
// library is, because "Movies" appearing twice with no attribution is worse
// than not offering it at all.
import type { SetupKey } from './store-setup-screens';

/** One server offered by an account, as the picker shows it. */
export interface SetupServerRow {
  /** Base URL to connect to (a server's best connection). */
  url: string;
  name: string;
  chosen: boolean;
  /** False = shared with you by someone else. Worth showing: it is the whole
   *  reason the list has more than one entry. */
  owned: boolean;
}

/** One library checkbox, attributed to the server that shelves it. */
export interface SetupGroupedLibraryRow {
  /** Namespaced `<sourceId>:<libraryId>` — see media-sources.ts. */
  id: string;
  name: string;
  carried: boolean;
  /** Display name of the owning server; the group header. */
  group: string;
}

/** One already-connected server on the CONNECTED DISTRIBUTORS screen. */
export interface SetupSourceEntry {
  id: string;
  name: string;
  /** e.g. 'JELLYFIN' / 'PLEX', shown so a mixed store reads honestly. */
  kind: string;
  libraryCount: number;
}

export type SourceScreen =
  | { kind: 'plex-servers'; rows: SetupServerRow[]; row: number; error?: string }
  | { kind: 'sources'; entries: SetupSourceEntry[]; row: number; error?: string }
  | { kind: 'libraries-multi'; rows: SetupGroupedLibraryRow[]; row: number; error?: string };

export type SourceAction =
  | 'connect-servers'  // plex-servers: sign in to every ticked server
  | 'libraries-done'   // libraries-multi: choices made, move on
  | 'add-another'      // sources: back to the distributor home screen
  | 'drop-source'      // sources: disconnect the highlighted server
  | 'continue';        // sources: done connecting, go stock the store

export function isSourceScreen(s: { kind: string } | null | undefined): s is SourceScreen {
  return s?.kind === 'plex-servers' || s?.kind === 'sources' || s?.kind === 'libraries-multi';
}

// Grouped lists spend lines on their headers, so they window fewer rows than
// the flat checklists in store-setup-screens.ts (6) to stay inside the same
// ~10-line budget.
const GROUPED_WINDOW = 5;
const SERVER_WINDOW = 6;

export function sourceScreenKey(
  s: SourceScreen,
  key: SetupKey
): { state: SourceScreen; action?: SourceAction } {
  switch (s.kind) {
    case 'plex-servers': {
      const total = s.rows.length + 1; // + CONNECT
      if (key === 'up' || key === 'down') {
        return { state: { ...s, row: (s.row + (key === 'up' ? -1 : 1) + total) % total } };
      }
      if (key === 'ok') {
        if (s.row < s.rows.length) {
          const rows = s.rows.map((r, i) => (i === s.row ? { ...r, chosen: !r.chosen } : r));
          return { state: { ...s, rows, error: undefined } };
        }
        if (!s.rows.some((r) => r.chosen)) {
          return { state: { ...s, error: 'TICK AT LEAST ONE SERVER.' } };
        }
        return { state: s, action: 'connect-servers' };
      }
      return { state: s };
    }
    case 'libraries-multi': {
      const total = s.rows.length + 1; // + CONTINUE
      if (key === 'up' || key === 'down') {
        return { state: { ...s, row: (s.row + (key === 'up' ? -1 : 1) + total) % total } };
      }
      if (key === 'ok') {
        if (s.row < s.rows.length) {
          const rows = s.rows.map((r, i) => (i === s.row ? { ...r, carried: !r.carried } : r));
          return { state: { ...s, rows, error: undefined } };
        }
        if (!s.rows.some((r) => r.carried)) {
          return { state: { ...s, error: 'CARRY AT LEAST ONE LIBRARY.' } };
        }
        return { state: s, action: 'libraries-done' };
      }
      return { state: s };
    }
    case 'sources': {
      const total = s.entries.length + 2; // + ADD ANOTHER + CONTINUE
      if (key === 'up' || key === 'down') {
        return { state: { ...s, row: (s.row + (key === 'up' ? -1 : 1) + total) % total } };
      }
      if (key === 'ok') {
        if (s.row < s.entries.length) return { state: s, action: 'drop-source' };
        if (s.row === s.entries.length) return { state: s, action: 'add-another' };
        if (!s.entries.length) {
          return { state: { ...s, error: 'CONNECT AT LEAST ONE SERVER.' } };
        }
        return { state: s, action: 'continue' };
      }
      return { state: s };
    }
  }
}

// ─── Renderers ────────────────────────────────────────────────────────────────

function sel(active: boolean, label: string): string {
  return `${active ? '>' : ' '} ${label}`;
}

/** Slide a window of `size` rows so the cursor stays inside it. */
function windowStart(cursorRow: number, count: number, size: number): number {
  if (count <= size) return 0;
  let start = Math.max(0, Math.min(cursorRow - (size - 1), count - size));
  if (cursorRow < start) start = cursorRow;
  return start;
}

export function sourceScreenLines(s: SourceScreen): { lines: string[]; cursorLine: number } {
  switch (s.kind) {
    case 'plex-servers': {
      const onConnect = s.row >= s.rows.length;
      const cursorRow = onConnect ? Math.max(0, s.rows.length - 1) : s.row;
      const start = windowStart(cursorRow, s.rows.length, SERVER_WINDOW);
      const visible = s.rows.slice(start, start + SERVER_WINDOW);
      const chosen = s.rows.filter((r) => r.chosen).length;
      const lines = [
        'SERVERS ON THIS ACCOUNT',
        `TICK EVERY ONE TO STOCK FROM. (${chosen} OF ${s.rows.length})`,
      ];
      visible.forEach((r, i) => {
        const idx = start + i;
        // 'SHARED' earns its column: it is how you tell your own box from the
        // one a friend gave you access to, which is the entire distinction
        // the person came to this screen to make.
        const tag = r.owned ? '' : ' (SHARED)';
        const name = r.name.toUpperCase().slice(0, 30 - tag.length);
        lines.push(sel(!onConnect && idx === s.row, `[${r.chosen ? 'X' : ' '}] ${name}${tag}`));
      });
      const connectIdx = lines.length;
      lines.push(sel(onConnect, s.error ? s.error : 'CONNECT'));
      return { lines, cursorLine: onConnect ? connectIdx : 2 + (s.row - start) };
    }

    case 'libraries-multi': {
      const onConfirm = s.row >= s.rows.length;
      const cursorRow = onConfirm ? Math.max(0, s.rows.length - 1) : s.row;
      const start = windowStart(cursorRow, s.rows.length, GROUPED_WINDOW);
      const visible = s.rows.slice(start, start + GROUPED_WINDOW);
      const carried = s.rows.filter((r) => r.carried).length;
      const lines = [
        `CHOOSE THIS STORE'S LIBRARIES (${carried}/${s.rows.length})`,
      ];
      let cursorLine = 0;
      // A header whenever the server changes — including at the top of the
      // window, so a scrolled list never shows nameless libraries.
      let lastGroup: string | null = start > 0 ? null : '';
      visible.forEach((r, i) => {
        const idx = start + i;
        if (r.group !== lastGroup) {
          lines.push(`  ${r.group.toUpperCase().slice(0, 36)}`);
          lastGroup = r.group;
        }
        const active = !onConfirm && idx === s.row;
        lines.push(sel(active, `[${r.carried ? 'X' : ' '}] ${r.name.toUpperCase().slice(0, 32)}`));
        if (active) cursorLine = lines.length - 1;
      });
      const confirmIdx = lines.length;
      lines.push(sel(onConfirm, s.error ? s.error : 'CONTINUE'));
      return { lines, cursorLine: onConfirm ? confirmIdx : cursorLine };
    }

    case 'sources': {
      const addIdx = s.entries.length;
      const continueIdx = s.entries.length + 1;
      const lines = [
        'CONNECTED DISTRIBUTORS',
        s.entries.length === 1
          ? '1 SERVER SUPPLYING THIS STORE.'
          : `${s.entries.length} SERVERS SUPPLYING THIS STORE.`,
        '',
      ];
      s.entries.forEach((e, i) => {
        const count = `${e.libraryCount} LIB`;
        const name = e.name.toUpperCase().slice(0, 24);
        lines.push(sel(s.row === i, `${name.padEnd(24)} ${count}`));
      });
      const firstEntryLine = 3;
      lines.push(sel(s.row === addIdx, '+ ADD ANOTHER SERVER'));
      lines.push(sel(s.row === continueIdx, s.error ? s.error : 'CONTINUE'));
      if (s.row < s.entries.length) lines.push('OK DISCONNECTS THE HIGHLIGHTED ONE.');
      const cursorLine =
        s.row < s.entries.length
          ? firstEntryLine + s.row
          : firstEntryLine + s.entries.length + (s.row - addIdx);
      return { lines, cursorLine };
    }
  }
}
