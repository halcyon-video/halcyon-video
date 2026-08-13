// NEW STORE SETUP (#41) — the CONTROLLER behind the opening-day counter
// terminal. The empty store boots, the camera docks at the checkout CRT (the
// manager-terminal camera dock), and this flow walks the player from "bare
// shelves" to a stocked store: distributor row → server address typed on the
// CRT → membership card pick (the existing DOM picker; CRT sign-in when the
// server lists no public users) → library checkbox rows (which aisles this
// store carries, persisted via library-settings) → FIRST SHIPMENT ARRIVING.
//
// Same split as counter-terminal-flow.ts: the screens themselves are pure
// (store-setup-screens.ts, unit-tested); this file is only glue — render onto
// the scene's CRT, route remote presses and typed keys, run the Jellyfin
// calls, persist choices, and hand the stocked-store launch back to
// boot-flow.ts through the callbacks it was initialized with.
import {
  fetchPublicUsers,
  fetchLibraryList,
  normalizeUrl,
} from './jellyfin';
// Sign-in goes through the provider (GH #32). fetchPublicUsers stays direct:
// it feeds the membership cards, which want an image tag rather than
// AccountSummary's resolved URL — the multiUserPicker capability's own step.
import { activeProvider } from './providers/active-provider';
import {
  openMembershipCardPicker,
  isMembershipPickerOpen,
  type MembershipLoginSession,
} from './membership-cards';
import { excludedLibraryIds, setLibraryCarried } from './library-settings';
import {
  SetupScreen,
  SetupKey,
  initialHomeScreen,
  setupScreenKey,
  setupScreenChar,
  setupScreenBackspace,
  setupScreenLines,
} from './store-setup-screens';

export interface SetupTerminalScene {
  setTerminalText(lines: string[] | null, cursorLine?: number): void;
  enterSearchMode(): void;
  exitSearchMode(): void;
}

export interface SetupFlowDeps {
  scene: () => SetupTerminalScene | null;
  /** main.ts's ui-state object — the flow owns its isSetupOpen flag. */
  ui: { isSetupOpen: boolean };
  log: (message: string, type?: 'system' | 'cec' | 'video') => void;
  keyClick: () => void;
  callbacks: {
    /** TRY A DEMO STORE — boot-flow's demo path (scene rebuilds stocked). */
    tryDemo(): void;
    /**
     * Full catalog sync for the chosen server/member, honoring the carried-
     * library exclusions just persisted. Progress lands back on the CRT via
     * onStage. Resolves with the catalog loaded into main.ts state; throws on
     * failure (the flow returns to the home screen with the error).
     */
    sync(
      url: string,
      session: MembershipLoginSession,
      onStage: (stage: string, pages: number) => void
    ): Promise<void>;
    /** Reveal the stocked store (boot overlay + scene rebuild). */
    openStore(): void;
    /** Notice screen's CHANGE SERVER: drop the saved server + stop retries. */
    changeServer(): void;
    /** Notice screen's RETRY NOW: kick the auto-retry immediately. */
    retryNow(): void;
  };
}

let deps: SetupFlowDeps | null = null;
let screen: SetupScreen = initialHomeScreen();
// The authenticated connection carried between the member pick and the sync.
let pendingUrl = '';
let pendingSession: MembershipLoginSession | null = null;

export function initSetupFlow(d: SetupFlowDeps): void {
  deps = d;
}

function render(): void {
  if (!deps?.ui.isSetupOpen) return;
  const scene = deps.scene();
  if (!scene) return;
  const { lines, cursorLine } = setupScreenLines(screen);
  scene.setTerminalText(lines, cursorLine);
  // Verification hook (same idiom as __promoStands & co): what the setup CRT
  // is showing right now, for scripts that drive the real first-run flow.
  (window as any).__setupScreen = { kind: screen.kind, lines, cursorLine };
}

// Typed characters for the address / member-name / password fields — captured
// ahead of InputManager's bubble listener, exactly like the search terminal.
// Arrows, OK and Back are NOT handled here: they arrive through main.ts's
// input callbacks (setupTerminalInput below), so remotes and gamepads drive
// the menus identically to a keyboard.
function onTypedKey(e: KeyboardEvent): void {
  if (!deps?.ui.isSetupOpen || isMembershipPickerOpen()) return;
  const typing =
    (screen.kind === 'home' && screen.row === 1) ||
    (screen.kind === 'manual-auth' && (screen.row === 0 || screen.row === 1));
  if (!typing) return;
  if (e.key === 'Backspace') {
    screen = setupScreenBackspace(screen);
  } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
    const next = setupScreenChar(screen, e.key);
    if (next === screen) return;
    screen = next;
  } else {
    return;
  }
  deps.keyClick();
  render();
  e.preventDefault();
  e.stopPropagation();
}

/** First-run entry: dock the camera and show NEW STORE SETUP. */
export function openSetupTerminal(): void {
  if (!deps) return;
  openWith(initialHomeScreen(localStorage.getItem('jellyfin_url')));
  deps.log('[Setup] Opening day — NEW STORE SETUP is on the counter CRT.');
}

/**
 * Later-boot failure entry (#41: the empty store doubles as the failure
 * state): same dock, but the terminal reports the unreachable distributor.
 * Safe to call again while open — a failed background retry just updates the
 * detail line.
 */
export function openSetupNotice(address: string, detail: string): void {
  if (!deps) return;
  const row = screen.kind === 'notice' ? screen.row : 0;
  openWith({ kind: 'notice', address, detail: detail.toUpperCase(), row });
}

function openWith(s: SetupScreen): void {
  if (!deps) return;
  screen = s;
  if (!deps.ui.isSetupOpen) {
    deps.ui.isSetupOpen = true;
    window.addEventListener('keydown', onTypedKey, true);
    deps.scene()?.enterSearchMode(); // camera dock only — the text is ours
  }
  render();
}

/**
 * Leave setup. keepCamera=true when the scene is about to be torn down and
 * rebuilt stocked (demo / FIRST SHIPMENT) — snapping the camera back or
 * resetting the CRT would flash for one frame under the boot overlay.
 */
export function closeSetupTerminal(opts?: { keepCamera?: boolean }): void {
  if (!deps?.ui.isSetupOpen) return;
  deps.ui.isSetupOpen = false;
  window.removeEventListener('keydown', onTypedKey, true);
  if (!opts?.keepCamera) deps.scene()?.exitSearchMode();
}

async function dial(address: string): Promise<void> {
  if (!deps) return;
  const url = normalizeUrl(address.trim());
  // Remember the dialed server IMMEDIATELY, not at afterAuth(): both routes to
  // the CRT sign-in screen below (an empty card list, a refused one) skip
  // afterAuth entirely, and manualSignIn() reads pendingUrl. Without this it
  // fell back to localStorage's jellyfin_url — unset on a true first run — and
  // authenticated against '', i.e. the app's own origin, so a single-user
  // Jellyfin (public card list empty) could NEVER be connected to from here.
  pendingUrl = url;
  screen = { kind: 'dialing', address: url, step: 'LOOKING UP MEMBERSHIP CARDS...' };
  render();
  let users;
  try {
    users = await fetchPublicUsers(url);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    deps.log(`[Setup] No membership card list from ${url}: ${msg}`);
    // A server that ANSWERED and refused the list (public users switched off,
    // a reverse proxy blocking /Users/Public) is perfectly usable — it just
    // can't fan the cards out. Sign in by name instead of dead-ending on the
    // home screen, which is what the DOM login form has always done. Only a
    // server that said nothing at all is a bad address.
    screen = /HTTP error \d+/.test(msg)
      ? { kind: 'manual-auth', row: 0, username: '', password: '',
          error: 'NO CARD LIST HERE. SIGN IN BY NAME.' }
      : { ...initialHomeScreen(address), row: 1, error: 'NO ANSWER. CHECK THE ADDRESS + CORS.' };
    render();
    return;
  }
  if (users.length > 0) {
    deps.log(`[Setup] Found ${users.length} membership card(s) on ${url}.`);
    screen = { kind: 'members', count: users.length };
    render();
    openMembershipCardPicker({
      serverUrl: url,
      users,
      lastUserId: localStorage.getItem('jellyfin_last_userid'),
      onLogin: (session) => afterAuth(url, session),
      // "Sign in manually" from the picker lands on the CRT sign-in screen —
      // the DOM login form is no longer part of first-run.
      onManualLogin: () => {
        screen = { kind: 'manual-auth', row: 0, username: '', password: '' };
        render();
      },
      onDemoMode: () => runDemo(),
      log: (msg) => deps?.log(msg),
    });
  } else {
    screen = { kind: 'manual-auth', row: 0, username: '', password: '' };
    render();
  }
}

async function manualSignIn(): Promise<void> {
  if (!deps || screen.kind !== 'manual-auth') return;
  const { username, password } = screen;
  const url = pendingUrl || normalizeUrl(localStorage.getItem('jellyfin_url') || '');
  if (!url) {
    // Belt and braces for the bug the pendingUrl assignment in dial() fixes:
    // never authenticate against an empty URL (which resolves to the app's own
    // origin and fails forever) — send them back to type an address.
    screen = { ...initialHomeScreen(), row: 1, error: 'TYPE THE SERVER ADDRESS FIRST.' };
    render();
    return;
  }
  screen = { kind: 'dialing', address: url, step: `SIGNING IN ${username.toUpperCase().slice(0, 26)}...` };
  render();
  try {
    const session = await activeProvider().authenticate(url, {
      username: username.trim(),
      password,
    });
    await afterAuth(url, session);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    screen = {
      kind: 'manual-auth', row: 2, username, password: '',
      error: msg.includes('401') ? 'SIGN-IN REFUSED. CHECK NAME + PASSWORD.' : 'SIGN-IN FAILED. SERVER UNREACHABLE.',
    };
    render();
  }
}

/** Authenticated — persist the session, then offer the library checkboxes. */
async function afterAuth(url: string, session: MembershipLoginSession): Promise<void> {
  if (!deps) return;
  pendingUrl = url;
  pendingSession = session;
  localStorage.setItem('jellyfin_url', url);
  localStorage.setItem('jellyfin_token', session.accessToken);
  localStorage.setItem('jellyfin_userid', session.userId);
  localStorage.setItem('jellyfin_last_userid', session.userId);
  deps.log(`[Setup] Authenticated as ${session.userName}.`);
  screen = { kind: 'dialing', address: url, step: 'PULLING THE CATALOG LIST...' };
  render();
  try {
    const libs = await fetchLibraryList(url, session.accessToken, session.userId);
    if (libs.length === 0) {
      screen = { ...initialHomeScreen(url), error: 'THE DISTRIBUTOR LISTS NO LIBRARIES.' };
      render();
      return;
    }
    const excluded = excludedLibraryIds();
    screen = {
      kind: 'libraries',
      rows: libs.map((l) => ({ id: l.id, name: l.name, carried: !excluded.has(l.id) })),
      row: 0,
    };
    render();
  } catch (e: any) {
    deps.log(`[Setup] Library list failed: ${e?.message ?? e}`);
    screen = { ...initialHomeScreen(url), error: 'COULD NOT LIST LIBRARIES. RETRY.' };
    render();
  }
}

async function runSync(): Promise<void> {
  if (!deps || screen.kind !== 'libraries' || !pendingSession) return;
  for (const row of screen.rows) setLibraryCarried(row.id, row.carried);
  const url = pendingUrl;
  const session = pendingSession;
  screen = { kind: 'sync', stage: 'CONTACTING DISTRIBUTOR...', pages: 0 };
  render();
  try {
    await deps.callbacks.sync(url, session, (stage, pages) => {
      screen = { kind: 'sync', stage, pages };
      render();
    });
  } catch (e: any) {
    deps.log(`[Setup] Catalog sync failed: ${e?.message ?? e}`);
    screen = { ...initialHomeScreen(url), error: 'CATALOG SYNC FAILED. TRY AGAIN.' };
    render();
    return;
  }
  screen = { kind: 'arriving' };
  render();
  closeSetupTerminal({ keepCamera: true });
  deps.callbacks.openStore();
}

function runDemo(): void {
  if (!deps) return;
  closeSetupTerminal({ keepCamera: true });
  deps.callbacks.tryDemo();
}

/** One remote/keyboard press while the setup terminal is up. */
export async function setupTerminalInput(kind: SetupKey): Promise<void> {
  if (!deps?.ui.isSetupOpen || isMembershipPickerOpen()) return;
  const { state, action } = setupScreenKey(screen, kind);
  if (state !== screen || action) deps.keyClick();
  screen = state;
  if (!action) {
    render();
    return;
  }
  switch (action) {
    case 'connect':
      if (screen.kind === 'home') await dial(screen.address);
      return;
    case 'demo':
      runDemo();
      return;
    case 'sign-in':
      await manualSignIn();
      return;
    case 'back-home':
      screen = initialHomeScreen(pendingUrl || localStorage.getItem('jellyfin_url'));
      render();
      return;
    case 'open-store':
      await runSync();
      return;
    case 'retry':
      screen = { kind: 'dialing', address: localStorage.getItem('jellyfin_url') || '', step: 'RETRYING NOW...' };
      render();
      deps.callbacks.retryNow();
      return;
    case 'change-server':
      deps.callbacks.changeServer();
      screen = initialHomeScreen(localStorage.getItem('jellyfin_url'));
      render();
      return;
  }
}
