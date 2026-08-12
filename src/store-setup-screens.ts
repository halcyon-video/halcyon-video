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
  | 'cancel-link'   // link: abandon the pending code and go back
  | 'back-home';    // manual-auth: abandon sign-in

/** Distributors this store can be supplied by (#32). The row is a manual
 *  override AND the fallback: dial() probes the typed address and switches to
 *  whatever actually answers, so the row only decides the default port and
 *  what to assume when nothing identifiable answers. */
export const SETUP_PROVIDERS = ['JELLYFIN', 'PLEX'] as const;

export type SetupProvider = (typeof SETUP_PROVIDERS)[number];

/** Default address per provider, offered before the user types their own. */
export const SETUP_PROVIDER_DEFAULTS: Record<SetupProvider, string> = {
  JELLYFIN: 'http://localhost:8096',
  PLEX: 'http://localhost:32400',
};

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
  | { kind: 'libraries'; rows: SetupLibraryRow[]; row: number; error?: string }
  | { kind: 'link'; provider: string; code: string; verificationUrl: string; step: string }
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
// The libraries screen windows its checkbox rows into this many visible lines.
const LIB_WINDOW = 6;

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
          if (!addr || addr === 'http://' || addr === 'https://') {
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
    case 'link':
      // The code is live and being polled; the only thing to decide here is
      // whether to abandon it.
      return key === 'back' ? { state: s, action: 'cancel-link' } : { state: s };
    case 'dialing':
    case 'members':
    case 'sync':
    case 'arriving':
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
    case 'link':
      return {
        lines: [
          'NEW STORE SETUP — OPENING DAY',
          '',
          `LINK THIS STORE TO ${s.provider}.`.slice(0, 40),
          '',
          'ON ANOTHER DEVICE, OPEN',
          `  ${s.verificationUrl}`.slice(0, 40),
          'AND ENTER THIS CODE:',
          '',
          // The code is the whole point of the screen — centred and spaced so
          // it reads across a room from the CRT.
          `        ${s.code.split('').join(' ')}`.slice(0, 40),
          s.step.slice(0, 40),
        ],
        cursorLine: 8,
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
      // Window the checkbox rows around the cursor; OPEN THE STORE stays last.
      const onOpen = s.row >= s.rows.length;
      const cursorRow = onOpen ? Math.max(0, s.rows.length - 1) : s.row;
      let start = Math.max(0, Math.min(cursorRow - (LIB_WINDOW - 1), s.rows.length - LIB_WINDOW));
      if (s.rows.length <= LIB_WINDOW) start = 0;
      // Keep the cursor inside the window when it walks upward too.
      if (cursorRow < start) start = cursorRow;
      const visible = s.rows.slice(start, start + LIB_WINDOW);
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
      lines.push(sel(onOpen, s.error ? s.error : 'OPEN THE STORE'));
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
