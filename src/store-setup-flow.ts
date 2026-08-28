// NEW STORE SETUP (#41) — the CONTROLLER behind the opening-day counter
// terminal. The empty store boots, the camera docks at the checkout CRT (the
// manager-terminal camera dock), and this flow walks the player from "bare
// shelves" to a stocked store: distributor row → server address typed on the
// CRT → membership card pick (the existing DOM picker; CRT sign-in when the
// server lists no public users) → library checkbox rows (which aisles this
// store carries, persisted via library-settings) → streaming-service
// checkbox rows (GH #86 zero-setup follow-up, owner ruling 2026-08-21: which
// streaming apps the player has, persisted to bb_streaming_services -- blank
// stays this local install's default of NO streaming aisles) → FIRST
// SHIPMENT ARRIVING.
//
// Same split as counter-terminal-flow.ts: the screens themselves are pure
// (store-setup-screens.ts, unit-tested); this file is only glue — render onto
// the scene's CRT, route remote presses and typed keys, run the Jellyfin
// calls, persist choices, and hand the stocked-store launch back to
// boot-flow.ts through the callbacks it was initialized with.
import {
  fetchPublicUsers,
  rememberKnownLibraries,
  normalizeUrl,
} from './jellyfin';
// Sign-in goes through the provider (GH #32). fetchPublicUsers stays direct:
// it feeds the membership cards, which want an image tag rather than
// AccountSummary's resolved URL — the multiUserPicker capability's own step.
import {
  activeProvider,
  resetActiveProvider,
  PROVIDER_KIND_KEY,
} from './providers/active-provider';
import { createPlexPin, fetchPlexServers, pollPlexPin } from './plex';
import { PLEX_ACCOUNT_TOKEN_KEY } from './plex-signin';
import {
  openMembershipCardPicker,
  isMembershipPickerOpen,
  type MembershipLoginSession,
} from './membership-cards';
import { isLibraryCarried, setLibraryCarried } from './library-settings';
import {
  addMediaSource,
  knownLibrariesBySource,
  rememberSourceLibraries,
  labelForUrl,
  listMediaSources,
  namespaceLibraryId,
  removeMediaSource,
  type MediaSource,
} from './media-sources';
import {
  isSourceScreen,
  sourceScreenKey,
  sourceScreenLines,
  type SetupGroupedLibraryRow,
  type SetupServerRow,
  type SourceScreen,
} from './setup-source-screens';
import {
  STREAMING_SERVICES_KEY,
  streamingChoiceCsv,
  streamingChoiceScreen,
} from './streaming-choice';
import { getSetting, setSetting } from './settings';
import { flushConfigPush, hydrateStoreConfig } from './store-config-sync';
import {
  SetupScreen,
  SetupKey,
  SetupLibraryRow,
  initialHomeScreen,
  setupScreenKey,
  setupScreenChar,
  setupScreenBackspace,
  setupScreenLines,
  wrapSetupError,
  SETUP_PROVIDER_KINDS,
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
// Widened for the multi-server screens (GH #84). They live in their own module
// (setup-source-screens.ts) rather than in store-setup-screens.ts's union: this
// flow drives both, and the base screens are shared ground the counter terminal
// renders too.
let screen: SetupScreen | SourceScreen = initialHomeScreen();
// The authenticated connection carried between the member pick and the sync.
let pendingUrl = '';
let pendingSession: MembershipLoginSession | null = null;
// The plex.tv account token from THIS sign-in, held so every server ticked on
// the account's server list can be authenticated in turn (GH #84).
let pendingPlexToken: string | null = null;

export function initSetupFlow(d: SetupFlowDeps): void {
  deps = d;
}

function render(): void {
  if (!deps?.ui.isSetupOpen) return;
  const scene = deps.scene();
  if (!scene) return;
  const { lines, cursorLine } = isSourceScreen(screen)
    ? sourceScreenLines(screen)
    : setupScreenLines(screen);
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
  // No multi-server screen has a text field — they are all checkbox lists and
  // menus — so a source screen never takes typed characters (GH #84).
  if (isSourceScreen(screen)) return;
  const active: SetupScreen = screen;
  const typing =
    (active.kind === 'home' && active.row === 1) ||
    (active.kind === 'manual-auth' && (active.row === 0 || active.row === 1));
  if (!typing) return;
  if (e.key === 'Backspace') {
    screen = setupScreenBackspace(active);
  } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
    const next = setupScreenChar(active, e.key);
    if (next === active) return;
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

/**
 * The Plex route through the terminal. Different in shape from dial(): there is
 * no card list to look up, because Plex home users don't come from the server
 * (capabilities.multiUserPicker is false) — so this goes code → account →
 * server → libraries, and the membership-card rack never opens.
 *
 * The address the person typed is optional here. If they left it blank, the
 * account's own server list supplies one, which is the whole reason Plex asks
 * for an account before a server.
 */
async function dialPlex(address: string): Promise<void> {
  if (!deps) return;
  // The PROVIDER's rule, not Jellyfin's: normalizeUrl forces http:// on a bare
  // address, which on a hosted HTTPS build is an address the browser refuses to
  // send and the person only ever sees as a timeout (#125).
  const typed = activeProvider().normalizeServerAddress(address.trim());
  try {
    const pin = await createPlexPin();
    screen = { kind: 'plex-link', code: pin.code, step: 'WAITING FOR AUTHORIZATION...' };
    render();
    deps.log(`[Setup] Plex sign-in code: ${pin.code}`);

    const deadline = Date.now() + 15 * 60 * 1000;
    let token: string | null = null;
    while (Date.now() < deadline && !token) {
      await new Promise((r) => setTimeout(r, 2000));
      token = await pollPlexPin(pin.id);
    }
    if (!token) {
      screen = { kind: 'plex-link', code: pin.code, step: '', error: 'THAT CODE EXPIRED. TRY AGAIN.' };
      render();
      return;
    }
    localStorage.setItem(PLEX_ACCOUNT_TOKEN_KEY, token);
    pendingPlexToken = token;

    screen = { kind: 'dialing', address: typed || 'PLEX.TV', step: 'LOOKING UP YOUR SERVERS...' };
    render();

    let url = typed;
    if (!url || url === 'http://' || url === 'https://') {
      const servers = await fetchPlexServers(token);
      const offerable = servers.filter((s) => s.connections.length);
      if (!offerable.length) {
        screen = { ...initialHomeScreen(address), row: 1,
          error: 'NO SERVERS ON THAT ACCOUNT. TYPE ONE.' };
        render();
        return;
      }
      // MORE THAN ONE SERVER ON THE ACCOUNT = ASK (GH #84). This used to take
      // `servers[0].connections[0]` and log "using <url>", which is precisely
      // the reported bug: an account carrying your own server AND ones shared
      // with you silently stocked from whichever came back first, and there
      // was no way to say "both". Sharing makes this the normal case on Plex,
      // not an edge one.
      if (offerable.length > 1) {
        deps.log(`[Setup] Plex account supplied ${offerable.length} server(s) — pick which to stock from.`);
        screen = {
          kind: 'plex-servers',
          rows: offerable.map((srv, i): SetupServerRow => ({
            url: activeProvider().normalizeServerAddress(srv.connections[0]),
            name: srv.name,
            owned: srv.owned,
            // Your own servers start ticked; a shared one is a deliberate
            // choice, not a default.
            chosen: srv.owned || i === 0,
          })),
          row: 0,
        };
        render();
        return;
      }
      url = activeProvider().normalizeServerAddress(offerable[0].connections[0]);
      deps.log(`[Setup] Plex account supplied 1 server; using ${url}.`);
    }

    pendingUrl = url;
    const session = await activeProvider().authenticate(url, { accountToken: token });
    await afterAuth(url, session as MembershipLoginSession);
  } catch (e: any) {
    deps.log(`[Setup] Plex sign-in failed: ${e?.message ?? e}`);
    // The whole reason, wrapped — a connect that failed because the browser
    // refuses plain HTTP from an HTTPS page has to be able to SAY that (#125),
    // and 40 clipped characters of it said nothing.
    screen = { ...initialHomeScreen(address), row: 1,
      error: wrapSetupError(String(e?.message ?? e)) };
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
async function afterAuth(
  url: string,
  session: MembershipLoginSession,
  opts?: { displayName?: string }
): Promise<void> {
  if (!deps) return;
  // A provider may have connected on a DIFFERENT address than the one asked
  // for — same server, a connection this page can actually use (#125). Every
  // line below persists or calls against an address, so take that one.
  if (session.serverAddress && session.serverAddress !== url) {
    deps.log(`[Setup] Connected on ${session.serverAddress} (${url} was not reachable from here).`);
    url = session.serverAddress;
  } else {
    // Always state the address in use (GH #128) — the setup log used to say
    // nothing here at all when the typed address just worked, which is most
    // connects, and left "which address did it actually use?" unanswerable
    // from a bug report alone.
    deps.log(`[Setup] Connected on ${url}.`);
  }
  if (session.raw?.isRelay) {
    deps.log(
      `[Setup] This connection is routed through Plex Relay, which answers ` +
      `quickly but is far too slow to carry a real library sync (GH #128). ` +
      `A direct LAN or plex.direct address works much better if one is reachable.`
    );
  }
  pendingUrl = url;
  pendingSession = session;
  // CONNECT, don't overwrite (GH #84): addMediaSource appends a new server or
  // refreshes one already known, and mirrors the primary back into the legacy
  // jellyfin_* keys so everything that still reads them is fed.
  const source = addMediaSource({
    kind: activeProvider().id,
    url,
    token: session.accessToken,
    userId: session.userId,
    userName: session.userName,
    name: opts?.displayName || labelForUrl(url),
  });
  localStorage.setItem('jellyfin_last_userid', session.userId);
  deps.log(`[Setup] Authenticated as ${session.userName} on ${source.name}.`);
  // Ask the server what this person's store already looks like, BEFORE the
  // checkbox screens (GH #123). Get the order wrong and setup is worse than
  // useless here: the boxes would show defaults, the person would re-tick the
  // libraries they already chose on their other machine, and the sync's later
  // hydrate would then be the thing overwriting a choice they just made.
  // Hydrating first means the boxes come up already right, and anything they
  // change from here is genuinely newer than the server's copy — which is what
  // makes the once-per-boot guard in hydrateStoreConfig correct rather than
  // merely convenient.
  screen = { kind: 'dialing', address: url, step: 'READING YOUR STORE SETTINGS...' };
  render();
  const restored = await hydrateStoreConfig();
  if (restored.status === 'applied') {
    deps.log(`[Setup] Restored ${restored.written} store setting(s) from your account.`);
  } else if (restored.status === 'failed') {
    deps.log(`[Setup] No saved store settings read back: ${restored.error}`);
  }
  screen = { kind: 'dialing', address: url, step: 'PULLING THE CATALOG LIST...' };
  render();
  try {
    // Through the provider: this used to call jellyfin.ts's fetchLibraryList
    // directly, which asks for /Users/<id>/Views — a route no Plex server has,
    // so every Plex install failed setup here with COULD NOT LIST LIBRARIES
    // however healthy the connection was.
    const libs = await activeProvider().listLibraries(url, session);
    rememberSourceLibraries(source, libs);
    rememberKnownLibraries(libs); // legacy single-server memory, kept in step
    if (libs.length === 0) {
      screen = { ...initialHomeScreen(url), error: 'THE DISTRIBUTOR LISTS NO LIBRARIES.' };
      render();
      return;
    }
    showLibraryChoices();
  } catch (e: any) {
    const reason = String(e?.message ?? e);
    deps.log(`[Setup] Library list failed: ${reason}`);
    screen = { ...initialHomeScreen(url), error: wrapSetupError(reason || 'Could not list libraries. Retry.') };
    render();
  }
}

/**
 * The carried-library checkboxes, over EVERY connected server (GH #84).
 *
 * One server keeps the original flat screen; two or more get the grouped one,
 * because "Movies" listed twice with nothing to say whose it is would be worse
 * than not offering the choice. Ids are namespaced either way, so a Plex
 * section key of "1" on both servers stays two distinct rows.
 */
function showLibraryChoices(): void {
  const remembered = knownLibrariesBySource();
  const rows: SetupGroupedLibraryRow[] = remembered.flatMap((entry) =>
    entry.libraries.map((l) => ({
      id: namespaceLibraryId(entry.sourceId, l.id),
      name: l.name,
      carried: isLibraryCarried(entry.sourceId, l.id),
      group: entry.sourceName,
    }))
  );
  if (!rows.length) return;
  screen = remembered.length > 1
    ? { kind: 'libraries-multi', rows, row: 0 }
    : { kind: 'libraries', rows: rows.map(({ id, name, carried }) => ({ id, name, carried })), row: 0 };
  render();
}

/**
 * CONNECTED DISTRIBUTORS — what this store is stocked from, with the door open
 * to another one. This screen is the whole point of #84 at the terminal: the
 * setup flow used to end at one server with no way back in short of starting
 * over, so "my libraries AND my friend's" was unreachable however many servers
 * the account had.
 */
function showSourcesScreen(error?: string): void {
  const counts = new Map(knownLibrariesBySource().map((e) => [e.sourceId, e.libraries.length]));
  const entries = listMediaSources().map((src: MediaSource) => ({
    id: src.id,
    name: src.name,
    kind: src.kind.toUpperCase(),
    libraryCount: counts.get(src.id) ?? 0,
  }));
  screen = { kind: 'sources', entries, row: entries.length ? entries.length + 1 : 0, error };
  render();
}

/** Sign in to every server ticked on the account's list, then carry on. */
async function connectChosenPlexServers(rows: SetupServerRow[]): Promise<void> {
  if (!deps) return;
  const token = pendingPlexToken || localStorage.getItem(PLEX_ACCOUNT_TOKEN_KEY);
  const chosen = rows.filter((r) => r.chosen);
  if (!token || !chosen.length) return;
  let connected = 0;
  let lastError = '';
  for (const row of chosen) {
    screen = { kind: 'dialing', address: row.url, step: `SIGNING IN AT ${row.name.toUpperCase().slice(0, 22)}...` };
    render();
    try {
      const session = await activeProvider().authenticate(row.url, { accountToken: token });
      // afterAuth registers the source and remembers its libraries; the last
      // one through also leaves the library checkboxes on screen.
      await afterAuth(row.url, session as MembershipLoginSession, { displayName: row.name });
      connected++;
    } catch (e: any) {
      // One unreachable server must not sink the rest — a friend's box being
      // asleep is the ordinary condition, not a setup failure.
      lastError = String(e?.message ?? e);
      deps.log(`[Setup] Could not connect ${row.name}: ${lastError}`);
    }
  }
  if (!connected) {
    screen = { ...initialHomeScreen(), row: 1,
      error: wrapSetupError(lastError || 'No server would connect.') };
    render();
  }
}

/**
 * GH #86 zero-setup follow-up (owner ruling 2026-08-21): which streaming apps
 * the player has, offered right after the library checkboxes. Pre-checked
 * against whatever is already persisted (a "Change Server" re-entry keeps
 * an earlier choice) -- a true first run reads blank, i.e. none checked,
 * per the local-install default. The rows themselves come from
 * streaming-choice.ts, shared with the manager terminal's re-entry (#96), so
 * the two pickers can never offer different lists.
 */
function initialStreamingScreen(): SetupScreen {
  return streamingChoiceScreen(getSetting<string>(STREAMING_SERVICES_KEY));
}

function persistStreamingChoice(rows: SetupLibraryRow[]): void {
  setSetting(STREAMING_SERVICES_KEY, streamingChoiceCsv(rows));
}

async function runSync(): Promise<void> {
  if (!deps || !pendingSession) return;
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
    const reason = String(e?.message ?? e);
    deps.log(`[Setup] Catalog sync failed: ${reason}`);
    screen = { ...initialHomeScreen(url), error: wrapSetupError(reason || 'Catalog sync failed. Try again.') };
    render();
    return;
  }
  // Everything ticked on the way through — carried libraries, streaming
  // services — scheduled a debounced save. Land it before the terminal closes
  // rather than trusting a timer to outlive the scene rebuild that follows
  // (GH #123): this is the one flow where the whole point is that the person
  // never has to do it again.
  await flushConfigPush();
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
  if (isSourceScreen(screen)) {
    await sourceTerminalInput(screen, kind);
    return;
  }
  const { state, action } = setupScreenKey(screen, kind);
  if (state !== screen || action) deps.keyClick();
  screen = state;
  if (!action) {
    render();
    return;
  }
  switch (action) {
    case 'connect':
      if (screen.kind === 'home') {
        const kind = SETUP_PROVIDER_KINDS[screen.provider] ?? 'jellyfin';
        // The choice has to be stored BEFORE authenticating: activeProvider()
        // reads provider_kind, and the cached instance predates this press.
        try {
          localStorage.setItem(PROVIDER_KIND_KEY, kind);
        } catch {
          /* the session still connects on the chosen backend */
        }
        resetActiveProvider();
        await (kind === 'plex' ? dialPlex(screen.address) : dial(screen.address));
      }
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
      // Two screens funnel through this one action: 'libraries' confirming
      // moves on to the streaming checkboxes; 'streaming' confirming is the
      // real "go" -- persist the choice and run the catalog sync.
      if (screen.kind === 'libraries') {
        for (const row of screen.rows) setLibraryCarried(row.id, row.carried);
        // The CONNECTED DISTRIBUTORS screen sits between the library choice
        // and the streaming one (GH #84) — it is the only place the terminal
        // offers to add a SECOND server, and it also confirms what the store
        // is about to be stocked from.
        showSourcesScreen();
        return;
      }
      if (screen.kind === 'streaming') {
        persistStreamingChoice(screen.rows);
        await runSync();
      }
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

/** One press on a multi-server screen (GH #84). */
async function sourceTerminalInput(current: SourceScreen, key: SetupKey): Promise<void> {
  if (!deps) return;
  const { state, action } = sourceScreenKey(current, key);
  if (state !== current || action) deps.keyClick();
  screen = state;
  if (!action) {
    render();
    return;
  }
  switch (action) {
    case 'connect-servers':
      if (state.kind === 'plex-servers') await connectChosenPlexServers(state.rows);
      return;
    case 'libraries-done':
      if (state.kind === 'libraries-multi') {
        for (const row of state.rows) setLibraryCarried(row.id, row.carried);
        showSourcesScreen();
      }
      return;
    case 'add-another':
      // Back to the distributor home screen with a BLANK address: the point is
      // a different server, so prefilling the one already connected would only
      // invite reconnecting it. The sources already registered stay put.
      pendingUrl = '';
      pendingSession = null;
      screen = initialHomeScreen();
      render();
      return;
    case 'drop-source':
      if (state.kind === 'sources') {
        const entry = state.entries[state.row];
        if (entry) {
          removeMediaSource(entry.id);
          deps.log(`[Setup] Disconnected ${entry.name}.`);
        }
        showSourcesScreen();
      }
      return;
    case 'continue':
      screen = initialStreamingScreen();
      render();
      return;
  }
}
