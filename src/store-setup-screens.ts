// NEW STORE SETUP (#41) — the pure state machine behind the opening-day
// counter terminal. Same split as the media-date screen (#42): this module is
// state + reducers + line renderers only (no DOM, no network, no scene), so
// it unit-tests under node and the harness can render any screen verbatim;
// store-setup-flow.ts owns the wiring (camera dock, Jellyfin calls, typed-key
// capture, persistence).
//
// Renderer contract: drawTerminal (entrance/index.ts) hard-clips lines at 40
// characters and shows ~10 body rows under its banner, so every screen here
// budgets 10 lines and pre-clips what matters (addresses clip from the LEFT —
// the end of a URL is the part being typed).

export type SetupKey = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back';

export type SetupAction =
  | 'connect'       // home: dial the typed address
  | 'demo'          // stock the demo store instead
  | 'retry'         // notice: retry the saved server now
  | 'change-server' // notice: drop the saved server, back to a blank home
  | 'open-store'    // libraries: choices made, sync + stock
  | 'sign-in'       // manual-auth: authenticate the typed name/password
  | 'back-home';    // manual-auth: abandon sign-in

/** The DISTRIBUTOR row's choices, in registry order. Display names here; the
 *  provider kinds they map to are SETUP_PROVIDER_KINDS below (the terminal is
 *  40 columns of upper-case, the registry is lower-case ids — keeping the two
 *  lists adjacent is what stops them drifting apart). */
export const SETUP_PROVIDERS = ['JELLYFIN', 'PLEX'] as const;
export const SETUP_PROVIDER_KINDS = ['jellyfin', 'plex'] as const;
/** Whether CONNECT needs an address typed first — false for a backend whose
 *  account tells us where its servers are (see the guard in setupScreenKey). */
export const PROVIDER_NEEDS_ADDRESS = [true, false] as const;

export interface SetupLibraryRow {
  id: string;
  name: string;
  carried: boolean;
}

export type SetupHomeScreen = { kind: 'home'; row: number; provider: number; address: string; error?: string };

export type SetupScreen =
  | SetupHomeScreen
  | { kind: 'dialing'; address: string; step: string }
  | { kind: 'members'; count: number }
  | { kind: 'manual-auth'; row: number; username: string; password: string; error?: string }
  // Plex authorizes through plex.tv rather than against the server, so the
  // terminal reads out a code to type somewhere else — the closest thing this
  // store has to phoning the distributor and quoting an account number.
  | { kind: 'plex-link'; code: string; step: string; error?: string }
  | { kind: 'libraries'; rows: SetupLibraryRow[]; row: number; error?: string }
  // GH #86 zero-setup follow-up (owner ruling 2026-08-21): which streaming
  // apps the player has, right after the library checkboxes and before the
  // catalog sync. Same checkbox-list shape as 'libraries' (reuses
  // SetupLibraryRow), but zero chosen is a legitimate answer -- unlike an
  // empty library list, it never blocks OPEN THE STORE.
  // `confirm` overrides the last row's label (#96): the manager terminal
  // shows this same screen to a store that is already open, where OPEN THE
  // STORE would be a lie -- see streaming-choice.ts, which builds it for both.
  | { kind: 'streaming'; rows: SetupLibraryRow[]; row: number; confirm?: string }
  | { kind: 'sync'; stage: string; pages: number }
  | { kind: 'arriving' }
  | { kind: 'notice'; address: string; detail: string; row: number };

export function initialHomeScreen(savedAddress?: string | null): SetupHomeScreen {
  return { kind: 'home', row: 1, provider: 0, address: savedAddress || 'http://' };
}

// Home rows: 0 DISTRIBUTOR / 1 SERVER ADDRESS / 2 CONNECT / 3 TRY A DEMO STORE
const HOME_ROWS = 4;
// Manual-auth rows: 0 MEMBER NAME / 1 PASSWORD / 2 SIGN IN / 3 BACK
const AUTH_ROWS = 4;
// Notice rows: 0 RETRY NOW / 1 CHANGE SERVER / 2 TRY A DEMO STORE
const NOTICE_ROWS = 3;
// The libraries/streaming checkbox screens window their rows into this many
// visible lines (header + this + the confirm row budgets to ~10 total).
const CHECKLIST_WINDOW = 6;

/** A typed printable character lands in whichever field the cursor is on. */
export function setupScreenChar(s: SetupScreen, ch: string): SetupScreen {
  if (ch.length !== 1) return s;
  if (s.kind === 'home' && s.row === 1 && ch !== ' ') {
    return { ...s, address: s.address + ch, error: undefined };
  }
  if (s.kind === 'manual-auth' && s.row === 0) return { ...s, username: s.username + ch, error: undefined };
  if (s.kind === 'manual-auth' && s.row === 1) return { ...s, password: s.password + ch, error: undefined };
  return s;
}

export function setupScreenBackspace(s: SetupScreen): SetupScreen {
  if (s.kind === 'home' && s.row === 1) return { ...s, address: s.address.slice(0, -1), error: undefined };
  if (s.kind === 'manual-auth' && s.row === 0) return { ...s, username: s.username.slice(0, -1), error: undefined };
  if (s.kind === 'manual-auth' && s.row === 1) return { ...s, password: s.password.slice(0, -1), error: undefined };
  return s;
}

export function setupScreenKey(s: SetupScreen, key: SetupKey): { state: SetupScreen; action?: SetupAction } {
  switch (s.kind) {
    case 'home': {
      if (key === 'up' || key === 'down') {
        const row = (s.row + (key === 'up' ? -1 : 1) + HOME_ROWS) % HOME_ROWS;
        return { state: { ...s, row } };
      }
      if (key === 'ok') {
        if (s.row === 0 || s.row === 1) return { state: { ...s, row: s.row + 1 } }; // BIOS-style: OK advances
        if (s.row === 2) {
          const addr = s.address.trim();
          const blank = !addr || addr === 'http://' || addr === 'https://';
          // A blank address is fatal for a distributor you sign into directly,
          // and fine for one that hands you a server list after you sign in to
          // the ACCOUNT — Plex discovers its own address, so demanding one up
          // front would ask for something the person may genuinely not know.
          if (blank && PROVIDER_NEEDS_ADDRESS[s.provider] !== false) {
            return { state: { ...s, row: 1, error: 'TYPE THE SERVER ADDRESS FIRST.' } };
          }
          return { state: s, action: 'connect' };
        }
        return { state: s, action: 'demo' };
      }
      // left/right on the DISTRIBUTOR row cycle providers (one today).
      if ((key === 'left' || key === 'right') && s.row === 0) {
        const n = SETUP_PROVIDERS.length;
        return { state: { ...s, provider: (s.provider + (key === 'left' ? -1 : 1) + n) % n } };
      }
      return { state: s };
    }
    case 'dialing':
    case 'members':
    case 'sync':
    case 'arriving':
    case 'plex-link':
      return { state: s }; // in-flight screens take no menu input
    case 'manual-auth': {
      if (key === 'up' || key === 'down') {
        const row = (s.row + (key === 'up' ? -1 : 1) + AUTH_ROWS) % AUTH_ROWS;
        return { state: { ...s, row } };
      }
      if (key === 'ok') {
        if (s.row === 0 || s.row === 1) return { state: { ...s, row: s.row + 1 } };
        if (s.row === 2) {
          if (!s.username.trim()) return { state: { ...s, row: 0, error: 'TYPE A MEMBER NAME FIRST.' } };
          return { state: s, action: 'sign-in' };
        }
        return { state: s, action: 'back-home' };
      }
      if (key === 'back') return { state: s, action: 'back-home' };
      return { state: s };
    }
    case 'libraries': {
      const total = s.rows.length + 1; // + OPEN THE STORE
      if (key === 'up' || key === 'down') {
        const row = (s.row + (key === 'up' ? -1 : 1) + total) % total;
        return { state: { ...s, row } };
      }
      if (key === 'ok') {
        if (s.row < s.rows.length) {
          const rows = s.rows.map((r, i) => (i === s.row ? { ...r, carried: !r.carried } : r));
          return { state: { ...s, rows, error: undefined } };
        }
        if (!s.rows.some((r) => r.carried)) {
          return { state: { ...s, error: 'CARRY AT LEAST ONE LIBRARY.' } };
        }
        return { state: s, action: 'open-store' };
      }
      return { state: s };
    }
    case 'streaming': {
      const total = s.rows.length + 1; // + OPEN THE STORE
      if (key === 'up' || key === 'down') {
        const row = (s.row + (key === 'up' ? -1 : 1) + total) % total;
        return { state: { ...s, row } };
      }
      if (key === 'ok') {
        if (s.row < s.rows.length) {
          const rows = s.rows.map((r, i) => (i === s.row ? { ...r, carried: !r.carried } : r));
          return { state: { ...s, rows } };
        }
        // Zero chosen is a legitimate answer here -- unlike 'libraries',
        // never blocks on an empty selection.
        return { state: s, action: 'open-store' };
      }
      return { state: s };
    }
    case 'notice': {
      if (key === 'up' || key === 'down') {
        const row = (s.row + (key === 'up' ? -1 : 1) + NOTICE_ROWS) % NOTICE_ROWS;
        return { state: { ...s, row } };
      }
      if (key === 'ok') {
        if (s.row === 0) return { state: s, action: 'retry' };
        if (s.row === 1) return { state: s, action: 'change-server' };
        return { state: s, action: 'demo' };
      }
      return { state: s };
    }
  }
}

// ─── Renderers ────────────────────────────────────────────────────────────────

/** Clip from the LEFT so the character being typed stays on screen. */
function clipTail(text: string, max: number): string {
  return text.length <= max ? text : '…' + text.slice(-(max - 1));
}

function sel(active: boolean, label: string): string {
  return `${active ? '>' : ' '} ${label}`;
}

export function setupScreenLines(s: SetupScreen): { lines: string[]; cursorLine: number } {
  switch (s.kind) {
    case 'home': {
      const provider = SETUP_PROVIDERS[s.provider];
      // Short labels on purpose: the value column gets 25 of the 40 chars, so
      // a typical http://<lan-ip>:8096 shows whole instead of clipped.
      const addr = clipTail(s.address, s.row === 1 ? 24 : 25) + (s.row === 1 ? '_' : '');
      const lines = [
        'NEW STORE SETUP — OPENING DAY',
        '',
        'BARE SHELVES, NO STOCK. PICK A',
        'DISTRIBUTOR TO SUPPLY THIS STORE.',
        '',
        sel(s.row === 0, `DISTRIBUTOR  ${provider}`),
        sel(s.row === 1, `ADDRESS      ${addr}`),
        sel(s.row === 2, 'CONNECT'),
        sel(s.row === 3, 'TRY A DEMO STORE'),
      ];
      if (s.error) lines.push(s.error.slice(0, 40));
      return { lines, cursorLine: 5 + s.row };
    }
    case 'plex-link': {
      const lines = [
        'NEW STORE SETUP — OPENING DAY',
        '',
        'THE DISTRIBUTOR WANTS AN ACCOUNT',
        'CODE. GO TO PLEX.TV/LINK AND',
        'QUOTE THIS:',
        '',
        `      ${s.code.toUpperCase()}`,
        '',
        s.step.slice(0, 40),
      ];
      if (s.error) lines.push(s.error.slice(0, 40));
      return { lines, cursorLine: 6 };
    }
    case 'dialing':
      return {
        lines: [
          'NEW STORE SETUP — OPENING DAY',
          '',
          'DIALING DISTRIBUTOR...',
          clipTail(s.address, 40),
          '',
          s.step.slice(0, 40),
        ],
        cursorLine: 5,
      };
    case 'members':
      return {
        lines: [
          'MEMBERSHIP CHECK',
          '',
          `${s.count} MEMBERSHIP CARD(S) ON FILE.`,
          'PICK YOURS ON THE COUNTER.',
        ],
        cursorLine: 3,
      };
    case 'manual-auth': {
      const user = clipTail(s.username, 20) + (s.row === 0 ? '_' : '');
      const pass = '*'.repeat(Math.min(s.password.length, 20)) + (s.row === 1 ? '_' : '');
      const lines = [
        'MEMBERSHIP SIGN-IN',
        '',
        'NO MEMBERSHIP CARDS ON FILE HERE.',
        'SIGN IN BY NAME.',
        '',
        sel(s.row === 0, `MEMBER NAME   ${user}`),
        sel(s.row === 1, `PASSWORD      ${pass}`),
        sel(s.row === 2, 'SIGN IN'),
        sel(s.row === 3, 'BACK'),
      ];
      if (s.error) lines.push(s.error.slice(0, 40));
      return { lines, cursorLine: 5 + s.row };
    }
    case 'libraries': {
      // Window the checkbox rows around the cursor; CONTINUE stays last.
      const onOpen = s.row >= s.rows.length;
      const cursorRow = onOpen ? Math.max(0, s.rows.length - 1) : s.row;
      let start = Math.max(0, Math.min(cursorRow - (CHECKLIST_WINDOW - 1), s.rows.length - CHECKLIST_WINDOW));
      if (s.rows.length <= CHECKLIST_WINDOW) start = 0;
      // Keep the cursor inside the window when it walks upward too.
      if (cursorRow < start) start = cursorRow;
      const visible = s.rows.slice(start, start + CHECKLIST_WINDOW);
      const carriedCount = s.rows.filter((r) => r.carried).length;
      const lines = [
        "CHOOSE THIS STORE'S LIBRARIES",
        'OK TICKS A BOX. AISLES BUILD FOR',
        `EVERY LIBRARY CARRIED. (${carriedCount} OF ${s.rows.length})`,
      ];
      visible.forEach((r, i) => {
        const idx = start + i;
        lines.push(sel(!onOpen && idx === s.row, `[${r.carried ? 'X' : ' '}] ${r.name.toUpperCase().slice(0, 32)}`));
      });
      const openLineIdx = lines.length;
      lines.push(sel(onOpen, s.error ? s.error : 'CONTINUE'));
      const cursorLine = onOpen ? openLineIdx : 3 + (s.row - start);
      return { lines, cursorLine };
    }
    case 'streaming': {
      // Same windowed-checkbox idiom as 'libraries' -- see there. Zero chosen
      // never errors, so there is no error line to budget for.
      const onOpen = s.row >= s.rows.length;
      const cursorRow = onOpen ? Math.max(0, s.rows.length - 1) : s.row;
      let start = Math.max(0, Math.min(cursorRow - (CHECKLIST_WINDOW - 1), s.rows.length - CHECKLIST_WINDOW));
      if (s.rows.length <= CHECKLIST_WINDOW) start = 0;
      if (cursorRow < start) start = cursorRow;
      const visible = s.rows.slice(start, start + CHECKLIST_WINDOW);
      const carriedCount = s.rows.filter((r) => r.carried).length;
      const lines = [
        'STREAMING SERVICES YOU HAVE',
        'OK TICKS A BOX. AISLES STOCK FOR',
        `EVERY SERVICE CHOSEN. (${carriedCount} OF ${s.rows.length})`,
      ];
      visible.forEach((r, i) => {
        const idx = start + i;
        lines.push(sel(!onOpen && idx === s.row, `[${r.carried ? 'X' : ' '}] ${r.name.toUpperCase().slice(0, 32)}`));
      });
      const openLineIdx = lines.length;
      lines.push(sel(onOpen, (s.confirm || 'OPEN THE STORE').slice(0, 38)));
      const cursorLine = onOpen ? openLineIdx : 3 + (s.row - start);
      return { lines, cursorLine };
    }
    case 'sync':
      return {
        lines: [
          'CATALOG SYNC IN PROGRESS',
          '',
          s.stage.slice(0, 40),
          s.pages > 0 ? `PAGES RECEIVED: ${s.pages}` : '',
          '',
          'A LARGE CATALOG TAKES A MINUTE.',
          'THE STORE OPENS WHEN STOCK LANDS.',
        ],
        cursorLine: 2,
      };
    case 'arriving':
      return {
        lines: ['FIRST SHIPMENT ARRIVING', '', 'STOCKING SHELVES...'],
        cursorLine: 2,
      };
    case 'notice': {
      const lines = [
        'DISTRIBUTOR NOT ANSWERING',
        clipTail(s.address, 40),
        s.detail.slice(0, 40),
        '',
        sel(s.row === 0, 'RETRY NOW'),
        sel(s.row === 1, 'CHANGE SERVER'),
        sel(s.row === 2, 'TRY A DEMO STORE'),
        '',
        'RETRYING QUIETLY IN THE BACKGROUND.',
      ];
      return { lines, cursorLine: 4 + s.row };
    }
  }
}
