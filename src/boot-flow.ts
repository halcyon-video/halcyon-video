// The boot / credentials flow — every path from "the app just loaded" to "the
// store is stocked and revealed": saved-session auto-connect with its stall
// watchdog and backoff retry, the membership-card picker hand-off, the classic
// DOM login form's handlers, demo-mode stocking, and the login/boot overlay
// show/hide pairs.
//
// Extracted from main.ts (which sits at its enforced line budget) as the
// prerequisite step of the first-run opening-day work (#41): main.ts keeps the
// store-facing state (libraries, games, scene) and hands this module setters
// and loaders through initBootFlow(deps); nothing here reaches back into
// main.ts directly, so the two can't tangle.
import {
  fetchPublicUsers,
  normalizeUrl,
  JellyfinLibrary,
} from './jellyfin';
import {
  activeProvider as provider,
  resetActiveProvider,
  sessionOf,
  PROVIDER_KIND_KEY,
} from './providers/active-provider';
import { plexAccountToken, selectedBackendKind, setupPlexSignInHandlers } from './plex-signin';
import { blurFocusWithin } from './text-entry-focus';
import {
  openMembershipCardPicker,
  closeMembershipCardPicker,
  type MembershipLoginSession,
} from './membership-cards';
import { buildDemoLibraries, buildDemoGames } from './demo-library';
import { getSetting } from './settings';
import { isDemoMode } from './demo-mode';
import { excludedLibraryIds } from './library-settings';
import {
  initSetupFlow,
  openSetupTerminal,
  openSetupNotice,
  closeSetupTerminal,
  type SetupTerminalScene,
} from './store-setup-flow';

// Backend access is `provider()` throughout this module (see
// providers/active-provider.ts). One exception, deliberate: the membership-card
// picker still reads Jellyfin's public-user shape directly in showLoginOrCards,
// because the cards want an image tag where AccountSummary carries a resolved
// URL. Converting it is the multiUserPicker capability's own step — it is also
// the flow Plex can't support at all, so it wants designing rather than
// renaming.

export interface BootFlowDeps {
  log: (message: string, type?: 'system' | 'cec' | 'video') => void;
  /** main.ts's ui-state object — this flow owns isLoginOpen and isSetupOpen. */
  ui: { isLoginOpen: boolean; isSetupOpen: boolean };
  /** The live scene (or null before reveal) — the setup terminal's CRT dock. */
  scene: () => SetupTerminalScene | null;
  keyClick: () => void;
  /** Publish a fetched/synthesized library list into main.ts's state. */
  setLibraries: (libs: JellyfinLibrary[]) => void;
  /** Publish demo game stock (main.ts's gameMovies). */
  setGames: (games: import('./jellyfin').Movie[]) => void;
  /** The optional sidecar loaders (Jellyseerr coming-soon/discovery, Romm). */
  loadComingSoon: () => Promise<void>;
  loadDiscovery: () => Promise<void>;
  loadGames: () => Promise<void>;
  mergeCollectionGaps: (libs: JellyfinLibrary[]) => Promise<number>;
  logJellyseerrStatus: (gapCount: number) => Promise<void>;
  gameCount: () => number;
  /** waitForFontsAndInit — the font gate + scene build funnel. */
  launchStore: () => void;
  /** Destroy the live scene + HUD timers (log-out / switch-member teardown). */
  teardownScene: () => void;
}

let deps: BootFlowDeps | null = null;

// Opening-day (#41) plumbing: what the setup terminal should show once the
// empty scene has revealed, and hooks into the auto-retry loop below so the
// notice screen's RETRY NOW / CHANGE SERVER rows can drive it.
let pendingSetup: { notice?: { address: string; detail: string } } | null = null;
let retryNowHook: (() => void) | null = null;
let cancelRetryHook: (() => void) | null = null;

export function initBootFlow(d: BootFlowDeps): void {
  deps = d;
  initSetupFlow({
    scene: d.scene,
    ui: d.ui,
    log: d.log,
    keyClick: d.keyClick,
    callbacks: {
      tryDemo: () => {
        hideLoginOverlay();
        closeMembershipCardPicker();
        showBootOverlay();
        startDemoAndLoad();
      },
      sync: syncForSetup,
      openStore: () => {
        showBootOverlay();
        d.launchStore();
      },
      changeServer: () => {
        cancelRetryHook?.();
        localStorage.removeItem('jellyfin_url');
        localStorage.removeItem('jellyfin_username');
        localStorage.removeItem('jellyfin_token');
        localStorage.removeItem('jellyfin_userid');
        d.log('[Setup] Saved server dropped — pick a new distributor.', 'system');
      },
      retryNow: () => retryNowHook?.(),
    },
  });
}

/**
 * Boot (or rebuild) into the EMPTY store — bare shelves, no posters — and
 * queue the setup terminal to dock once the scene reveals (#41). Serves both
 * the true first run and the unreachable-server failure state.
 */
export function enterOpeningDay(opts?: { notice?: { address: string; detail: string } }): void {
  if (!deps) return;
  pendingSetup = { notice: opts?.notice };
  deps.setLibraries([]);
  deps.setGames([]);
  // The empty build takes a second or two; the boot overlay (already up on
  // first paint, re-raised here for live re-entries like log-out) covers the
  // teardown/build and drops the moment the bare store is ready.
  showBootOverlay();
  deps.launchStore();
}

/**
 * Called by main.ts at the scene-reveal moment (textures ready, overlay about
 * to drop): if an opening-day boot queued the setup terminal, dock it now so
 * the player wakes at the counter CRT.
 */
export function maybeOpenSetupTerminal(): void {
  if (!pendingSetup) return;
  const p = pendingSetup;
  pendingSetup = null;
  if (p.notice) openSetupNotice(p.notice.address, p.notice.detail);
  else openSetupTerminal();
}

/**
 * CHANGE SERVER / LOG OUT (#41): the empty-store setup terminal is the
 * re-entry point, not the old DOM form. Flat mode (no 3D counter to dock to)
 * keeps the form.
 */
export function logOutToOpeningDay(): void {
  if (!deps) return;
  deps.log(`[System] Logging out and resetting ${provider().displayName} session...`, 'system');
  localStorage.removeItem('jellyfin_url');
  localStorage.removeItem('jellyfin_username');
  localStorage.removeItem('jellyfin_password');
  localStorage.removeItem('jellyfin_token');
  localStorage.removeItem('jellyfin_userid');
  deps.teardownScene();
  if (getSetting<string>('bb_render_mode') === 'flat') {
    showLoginOverlay();
    return;
  }
  enterOpeningDay();
}

/**
 * The setup terminal's catalog sync: same stall watchdog + sidecar loaders as
 * finishLoginAndLaunch, but progress renders as a CRT readout instead of the
 * boot console, and the carried-library exclusions just chosen on the
 * checkbox screen are honored (their item sync is skipped entirely).
 */
async function syncForSetup(
  url: string,
  session: MembershipLoginSession,
  onStage: (stage: string, pages: number) => void
): Promise<void> {
  if (!deps) throw new Error('Boot flow not initialized.');
  const d = deps;
  const LOGIN_STALL_MS = 45_000;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  let onStall: (() => void) | null = null;
  const armStall = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => onStall?.(), LOGIN_STALL_MS);
  };
  const stallPromise = new Promise<never>((_, reject) => {
    onStall = () => reject(new Error(`No response from ${provider().displayName} for ${LOGIN_STALL_MS / 1000}s`));
    armStall();
  });
  let pages = 0;
  let lastStage = 'CONTACTING DISTRIBUTOR...';
  const onProgress = (stage: string) => {
    armStall();
    if (stage === 'page') pages++;
    else lastStage = `SYNCING ${stage.toUpperCase()}`;
    onStage(lastStage, pages);
  };
  let libs: JellyfinLibrary[];
  try {
    [libs] = await Promise.all([
      Promise.race([
        provider().fetchLibraries(url, session, onProgress, {
          excludeLibraryIds: excludedLibraryIds(),
        }),
        stallPromise,
      ]),
      d.loadComingSoon(),
      d.loadDiscovery(),
      d.loadGames(),
    ]);
  } finally {
    if (stallTimer) clearTimeout(stallTimer);
  }
  d.setLibraries(libs);
  const gapCount = await d.mergeCollectionGaps(libs);
  const totalMoviesCount = libs.reduce((acc, lib) => acc + lib.movies.length, 0);
  d.log(`[System] Loaded ${libs.length} libraries (${totalMoviesCount} titles total). Opening the store...`, 'system');
  await d.logJellyseerrStatus(gapCount);
  if (d.gameCount() > 0) {
    d.log(`[System] Romm: ${d.gameCount()} game(s) loaded for the Video Games section.`, 'system');
  }
}

// ─── Login / boot overlays ────────────────────────────────────────────────────

export function showLoginOverlay() {
  if (isDemoMode) return; // the demo never logs in
  closeMembershipCardPicker(); // defensive: idempotent if it wasn't open
  if (deps) deps.ui.isLoginOpen = true;
  const overlay = document.getElementById('login-overlay');
  if (overlay) {
    overlay.classList.add('visible');

    const envUrl = typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_JELLYFIN_URL : undefined;
    const savedUrl = localStorage.getItem('jellyfin_url') || envUrl;
    if (savedUrl) {
      const urlInput = document.getElementById('login-url') as HTMLInputElement;
      if (urlInput) urlInput.value = savedUrl;
    }

    const envUser = typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_JELLYFIN_USERNAME : undefined;
    const savedUsername = localStorage.getItem('jellyfin_username') || envUser;
    const userInput = document.getElementById('login-user') as HTMLInputElement;
    if (userInput) {
      if (savedUsername) userInput.value = savedUsername;
      userInput.focus();
    }

    const envPass = typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_JELLYFIN_PASSWORD : undefined;
    const passInput = document.getElementById('login-pass') as HTMLInputElement;
    if (passInput && envPass) {
      passInput.value = envPass;
    }

    // Jellyseerr (optional) -- same persistence mechanism as the Jellyfin
    // fields above, just two extra fields that stay blank when unused.
    const envJellyseerrUrl = typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_JELLYSEERR_URL : undefined;
    const savedJellyseerrUrl = localStorage.getItem('jellyseerr_url') || envJellyseerrUrl;
    const jellyseerrUrlInput = document.getElementById('login-jellyseerr-url') as HTMLInputElement;
    if (jellyseerrUrlInput) jellyseerrUrlInput.value = savedJellyseerrUrl || '';

    const envJellyseerrKey = typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_JELLYSEERR_APIKEY : undefined;
    const savedJellyseerrKey = localStorage.getItem('jellyseerr_apikey') || envJellyseerrKey;
    const jellyseerrKeyInput = document.getElementById('login-jellyseerr-key') as HTMLInputElement;
    if (jellyseerrKeyInput) jellyseerrKeyInput.value = savedJellyseerrKey || '';

    // T18: Romm (optional) -- same prefill treatment as Jellyseerr. Column
    // stays hidden (values still prefilled, just not shown) unless the Video
    // Games section is switched on in Settings, so opting in still requires a
    // deliberate settings-drawer toggle before Romm creds are even offered.
    const envRommUrl = typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_ROMM_URL : undefined;
    const envRommKey = typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_ROMM_APIKEY : undefined;
    const rommUrlInput = document.getElementById('login-romm-url') as HTMLInputElement | null;
    if (rommUrlInput) rommUrlInput.value = localStorage.getItem('romm_url') || envRommUrl || '';
    const rommKeyInput = document.getElementById('login-romm-key') as HTMLInputElement | null;
    if (rommKeyInput) rommKeyInput.value = localStorage.getItem('romm_apikey') || envRommKey || '';
    const rommColumn = document.getElementById('login-romm-column');
    if (rommColumn) rommColumn.style.display = getSetting<boolean>('bb_games_enabled') ? '' : 'none';
  }
}

export function hideLoginOverlay() {
  if (deps) deps.ui.isLoginOpen = false;
  const overlay = document.getElementById('login-overlay');
  if (overlay) {
    // The overlay hides by opacity alone — display stays flex and visibility
    // stays visible — so the field showLoginOverlay() focused would otherwise
    // keep focus straight into the store, where every keyboard guard bails on
    // it and the remote goes dead for the whole session. Hand focus back
    // before the form goes down.
    blurFocusWithin(overlay);
    overlay.classList.remove('visible');
  }
}

export function hideBootOverlay() {
  const overlay = document.getElementById('boot-overlay');
  if (overlay) {
    // Restore the stylesheet's fade for the way OUT (showBootOverlay suppresses
    // it for the way in — see there).
    overlay.style.transition = '';
    overlay.classList.remove('visible');
  }
}

// Re-shown after a manual login (the boot overlay is only up by default on the
// very first paint) so the scene has somewhere opaque to load behind while its
// textures stream in.
export function showBootOverlay() {
  const overlay = document.getElementById('boot-overlay');
  if (overlay) {
    // Raise it INSTANTLY, not over the stylesheet's 0.6s fade. What follows a
    // showBootOverlay() call is always the store build, which holds the main
    // thread for seconds at catalog scale — so a fade that has not finished by
    // then is frozen part-way, and on a webview whose compositor does not
    // advance without the main thread it never starts at all, leaving the
    // player looking at the screen underneath (the counter CRT's CATALOG SYNC
    // readout) for the entire build. The fade OUT, which runs when the store is
    // ready and the thread is free, is the one worth keeping; hideBootOverlay
    // puts it back. Debug-only override, never surfaced in Settings: set
    // bb_debug_no_boot_paint=1 to restore the old behaviour for A/B runs.
    if (!localStorage.getItem('bb_debug_no_boot_paint')) {
      overlay.style.transition = 'none';
      overlay.classList.add('visible');
      void overlay.offsetHeight; // flush the style change into this frame
      return;
    }
    overlay.classList.add('visible');
  }
}

// ─── Credentials / Boot ───────────────────────────────────────────────────────

/**
 * Shared "we're authenticated, now go load the store" tail used by both the
 * classic login form and the membership card picker (T17). Never stores a
 * password -- only the resulting session token/userid.
 */
async function finishLoginAndLaunch(urlInput: string, session: MembershipLoginSession) {
  if (!deps) return;
  deps.log(`[System] Authenticated successfully as ${session.userName}.`, 'system');
  localStorage.setItem('jellyfin_url', urlInput);
  localStorage.setItem('jellyfin_token', session.accessToken);
  localStorage.setItem('jellyfin_userid', session.userId);
  localStorage.setItem('jellyfin_last_userid', session.userId); // remembered for next boot's card highlight

  deps.log('[System] Downloading movie libraries and catalog metadata...', 'system');
  // Stall watchdog, not a deadline — see the auto-login path for why a fixed
  // cap on total sync duration is unsurvivable for a large enough library.
  const LOGIN_STALL_MS = 45_000;
  let loginStallTimer: ReturnType<typeof setTimeout> | null = null;
  let onLoginStall: (() => void) | null = null;
  const armLoginStall = () => {
    if (loginStallTimer) clearTimeout(loginStallTimer);
    loginStallTimer = setTimeout(() => onLoginStall?.(), LOGIN_STALL_MS);
  };
  const loginTimeout = new Promise<never>((_, reject) => {
    onLoginStall = () => reject(new Error(`No response from ${provider().displayName} for ${LOGIN_STALL_MS / 1000}s`));
    armLoginStall();
  });
  let libs: JellyfinLibrary[];
  try {
    [libs] = await Promise.all([
      Promise.race([
        provider().fetchLibraries(urlInput, session, armLoginStall, {
          excludeLibraryIds: excludedLibraryIds(),
        }),
        loginTimeout
      ]),
      deps.loadComingSoon(),
      deps.loadDiscovery(),
      deps.loadGames()
    ]);
  } finally {
    if (loginStallTimer) clearTimeout(loginStallTimer);
  }
  deps.setLibraries(libs);
  const gapCount = await deps.mergeCollectionGaps(libs);
  const totalMoviesCount = libs.reduce((acc, lib) => acc + lib.movies.length, 0);

  deps.log(`[System] Loaded ${libs.length} libraries (${totalMoviesCount} titles total). Launching store...`, 'system');
  await deps.logJellyseerrStatus(gapCount);
  if (deps.gameCount() > 0) {
    deps.log(`[System] Romm: ${deps.gameCount()} game(s) loaded for the Video Games section.`, 'system');
  }
  hideLoginOverlay();
  // Bring the boot overlay back up as an opaque loading screen -- it stays
  // visible (see initializeStoreScene) until every cover texture has loaded.
  showBootOverlay();
  deps.launchStore();
}

/**
 * Boot/re-login entry point (T17): if we know a server URL, try its public
 * user list first and show the fanned membership-card picker; only fall back
 * to the classic single-login form if the server has no saved URL yet, the
 * public user list is disabled, or it comes back empty (single-user server).
 */
export async function showLoginOrCards(reason?: string) {
  if (isDemoMode || !deps) return; // the demo never logs in
  const savedUrl = localStorage.getItem('jellyfin_url');
  if (savedUrl) {
    try {
      const users = await fetchPublicUsers(savedUrl);
      if (users.length > 0) {
        if (reason) deps.log(`[System] ${reason}`, 'system');
        deps.log(`[System] Found ${users.length} membership card(s) on ${savedUrl}.`, 'system');
        openMembershipCardPicker({
          serverUrl: savedUrl,
          users,
          lastUserId: localStorage.getItem('jellyfin_last_userid'),
          onLogin: (session) => finishLoginAndLaunch(savedUrl, session),
          onManualLogin: () => abortBootToLogin(reason),
          onDemoMode: () => {
            hideLoginOverlay();
            closeMembershipCardPicker();
            showBootOverlay();
            startDemoAndLoad();
          },
          log: (msg) => deps?.log(msg, 'system'),
        });
        return;
      }
    } catch (e: any) {
      deps.log(`[System] Public user list unavailable (${e?.message ?? e}); falling back to login form.`, 'system');
    }
  }
  abortBootToLogin(reason);
}

/**
 * "Switch Member" affordance (T17), reachable from the settings drawer:
 * tears down the current session/scene (like logging out) but keeps the
 * server URL, then re-shows the membership card picker so another
 * household member can pick their own card without re-typing the server.
 */
export function switchMember() {
  if (!deps) return;
  deps.log('[System] Switching membership card...', 'system');
  localStorage.removeItem('jellyfin_token');
  localStorage.removeItem('jellyfin_userid');
  deps.teardownScene();
  void showLoginOrCards();
}

function abortBootToLogin(reason?: string) {
  hideBootOverlay();
  showLoginOverlay();
  if (reason) {
    const errorMsg = document.getElementById('login-error-msg') as HTMLDivElement;
    const submitBtn = document.getElementById('btn-login-submit') as HTMLButtonElement;
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = 'Connect & Sync'; }
    if (errorMsg) { errorMsg.style.color = 'red'; errorMsg.innerText = reason; }
  }
}

/**
 * Demo-mode boot (see src/demo-mode.ts): no credential gate, no Jellyfin
 * fetch, no login overlay ever — stock the store from the synthetic demo
 * library and hand off to the normal texture-gated reveal.
 */
export function startDemoAndLoad() {
  if (!deps) return;
  // First visit defaults to daytime out the windows (the scene otherwise
  // rolls day/night 50/50 per boot); user-changeable in Store Look after.
  if (!localStorage.getItem('bb_outside')) localStorage.setItem('bb_outside', 'day');
  // The games department is off by default (bb_games_enabled, main.ts fetchGames)
  // because it costs a RomM round-trip nobody asked for. The demo has no RomM and
  // no round trip — buildDemoGames() is synchronous and local — so that default
  // was buying nothing here and cost us the whole department: every visitor to
  // the Pages demo saw a store with no VIDEO GAMES section, which is why the
  // feature reads as missing to people who have only ever seen the demo. Opt in
  // on first boot only, so a visitor who switches it off keeps it off.
  if (!localStorage.getItem('bb_games_enabled')) localStorage.setItem('bb_games_enabled', '1');
  deps.log('[System] Demo mode: stocking the store with a placeholder library (no media server).', 'system');
  deps.setLibraries(buildDemoLibraries(900));
  deps.setGames(buildDemoGames(60));
  deps.launchStore();
}

export async function checkCredentialsAndLoad() {
  if (!deps) return;
  const d = deps;
  // Security hardening: Purge any stored plaintext password
  localStorage.removeItem('jellyfin_password');

  const envUrl = (typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_JELLYFIN_URL : undefined) || '';
  const envUser = (typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_JELLYFIN_USERNAME : undefined) || '';
  const envPass = (typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_JELLYFIN_PASSWORD : undefined) || '';

  let jellyfinUrl = localStorage.getItem('jellyfin_url') || envUrl;
  let token = localStorage.getItem('jellyfin_token');
  let userId = localStorage.getItem('jellyfin_userid');

  // If no saved token/userId, attempt auto-authentication using credentials stored in .env.local / env
  if ((!token || !userId || !jellyfinUrl) && envUrl && envUser && envPass) {
    d.log('[System] File credentials (.env.local) found. Authenticating automatically...', 'system');
    try {
      const session = await provider().authenticate(envUrl, { username: envUser, password: envPass });
      localStorage.setItem('jellyfin_url', envUrl);
      localStorage.setItem('jellyfin_username', envUser);
      localStorage.setItem('jellyfin_token', session.accessToken);
      localStorage.setItem('jellyfin_userid', session.userId);
      localStorage.setItem('jellyfin_last_userid', session.userId);
      jellyfinUrl = envUrl;
      token = session.accessToken;
      userId = session.userId;
      d.log(`[System] Auto-authenticated successfully as ${session.userName}.`, 'system');

      if (typeof import.meta.env !== 'undefined') {
        if (import.meta.env.VITE_JELLYSEERR_URL && import.meta.env.VITE_JELLYSEERR_APIKEY) {
          localStorage.setItem('jellyseerr_url', import.meta.env.VITE_JELLYSEERR_URL);
          localStorage.setItem('jellyseerr_apikey', import.meta.env.VITE_JELLYSEERR_APIKEY);
        }
        if (import.meta.env.VITE_ROMM_URL && import.meta.env.VITE_ROMM_APIKEY) {
          localStorage.setItem('romm_url', import.meta.env.VITE_ROMM_URL);
          localStorage.setItem('romm_apikey', import.meta.env.VITE_ROMM_APIKEY);
          if (!localStorage.getItem('bb_games_enabled')) {
            localStorage.setItem('bb_games_enabled', '1');
          }
        }
      }
    } catch (err: any) {
      d.log(`[System] Auto-authentication from file credentials failed: ${err?.message || err}`, 'system');
    }
  }

  let escaped = false;
  let retryTimeoutId: any = null;

  // Any keypress or click on the boot screen skips auto-connect and goes to login.
  const bootEscape = (e: Event) => {
    if (e.type === 'keydown' && (e as KeyboardEvent).key === 'Tab') return; // ignore tab
    escaped = true;
    if (retryTimeoutId) {
      clearTimeout(retryTimeoutId);
      retryTimeoutId = null;
    }
    document.removeEventListener('keydown', bootEscape);
    document.removeEventListener('click', bootEscape);
    hideBootOverlay();
    showLoginOrCards();
  };
  document.addEventListener('keydown', bootEscape);
  document.addEventListener('click', bootEscape);

  // Address and token, never userId (GH #66). A user id is a JELLYFIN concept:
  // a Plex session's is a server machineIdentifier that resolves to '' whenever
  // the plex.tv resource lookup fails or the saved address isn't byte-equal to
  // an advertised connection URI — i.e. any LAN-reached NAS, the reported case.
  // Requiring it here asked "did plex.tv answer?" and, on a no, disowned a
  // perfectly good saved session and dropped the user on the login screen on
  // EVERY launch. Nothing is loosened by removing it: every path that clears
  // the user id (switchMember, logOutToOpeningDay, changeServer, expireSession,
  // the two connection-edit tails) clears the token in the same breath, so a
  // real "no session" still fails the `token` test and still lands on the card
  // picker below.
  if (jellyfinUrl && token) {
    d.log(`[System] Saved ${provider().displayName} credentials found. Connecting...`, 'system');

    // A STALL timeout, not a deadline. This was a flat 20s cap on the whole
    // multi-library sync, which a large enough catalog can never beat: the
    // sync would be killed mid-flight, retried, and killed again forever, so
    // boot never reached the store and every post-login step (collection
    // gaps, the Jellyseerr status line, the scene itself) simply never ran.
    // Sync duration scales with library size and is not a fault; silence is.
    // The watchdog therefore fires only when the server has sent nothing at
    // all for this long, and every page resets it.
    const STALL_MS = 45_000;
    let currentDelay = 10_000; // starts at 10s
    const MAX_DELAY = 5 * 60 * 1000; // 5min cap
    let noticeShown = false; // the empty-store failure notice (#41), once

    const attemptSync = async () => {
      if (escaped) return;

      const activeToken = localStorage.getItem('jellyfin_token') || token;
      // Falls back to '' rather than null: reaching here with no stored user id
      // is now normal (Plex), and ProviderSession.userId is typed a string —
      // the Jellyfin provider interpolates it straight into /Users/<id>/Items,
      // where a null would have gone out as the literal "null".
      const activeUserId = localStorage.getItem('jellyfin_userid') || userId || '';

      let stallTimer: ReturnType<typeof setTimeout> | null = null;
      let onStall: (() => void) | null = null;
      const armStall = () => {
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = setTimeout(() => onStall?.(), STALL_MS);
      };
      const stallPromise = new Promise<never>((_, reject) => {
        onStall = () => reject(new Error(`No response from ${provider().displayName} for ${STALL_MS / 1000}s`));
        armStall();
      });

      try {
        let libs: JellyfinLibrary[];
        [libs] = await Promise.all([
          Promise.race([
            provider().fetchLibraries(jellyfinUrl, sessionOf(activeToken!, activeUserId), armStall, {
              excludeLibraryIds: excludedLibraryIds(),
            }),
            stallPromise
          ]),
          d.loadComingSoon(),
          d.loadDiscovery(),
          d.loadGames()
        ]);
        if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }

        if (escaped) return;

        document.removeEventListener('keydown', bootEscape);
        document.removeEventListener('click', bootEscape);
        if (retryTimeoutId) {
          clearTimeout(retryTimeoutId);
          retryTimeoutId = null;
        }

        d.setLibraries(libs);
        const gapCount = await d.mergeCollectionGaps(libs);
        const totalMoviesCount = libs.reduce((acc, lib) => acc + lib.movies.length, 0);
        d.log(`[System] Connected to ${provider().displayName}. Sync'd ${libs.length} libraries (${totalMoviesCount} movies total).`, 'system');
        await d.logJellyseerrStatus(gapCount);
        if (d.gameCount() > 0) {
          d.log(`[System] Romm: ${d.gameCount()} game(s) loaded for the Video Games section.`, 'system');
        }

        hideLoginOverlay(); // in case user clicked to dismiss boot screen
        closeMembershipCardPicker();
        // A recovered notice-mode boot (#41) is docked at the empty store's
        // setup terminal — leave it cleanly, and re-raise the boot overlay it
        // hid so the stocked rebuild happens behind the usual reveal.
        closeSetupTerminal({ keepCamera: true });
        showBootOverlay();
        // Boot overlay stays up (see waitForFontsAndInit/initializeStoreScene) until
        // every cover texture has loaded, so the store is never revealed mid-load.
        d.launchStore();
      } catch (err: any) {
        if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
        if (escaped) return;

        const msg = err?.message ?? (typeof err === 'string' ? err : String(err));
        d.log(`[System] Auto-login failed: ${msg}. Retrying in ${currentDelay / 1000}s...`, 'system');

        // #41: the empty store doubles as the failure state — never a modal
        // error or an endless dark overlay. The first failure boots the empty
        // shell with the DISTRIBUTOR NOT ANSWERING notice on the counter CRT
        // (auto-retry keeps running underneath); later failures just refresh
        // the notice line. Flat mode has no counter to dock to and keeps the
        // classic behavior. The boot-escape listener comes off first — its
        // any-key jump to the card picker would fight the notice menu.
        if (getSetting<string>('bb_render_mode') !== 'flat') {
          if (!noticeShown) {
            noticeShown = true;
            document.removeEventListener('keydown', bootEscape);
            document.removeEventListener('click', bootEscape);
            enterOpeningDay({ notice: { address: jellyfinUrl, detail: msg } });
          } else {
            openSetupNotice(jellyfinUrl, msg);
          }
        }

        retryTimeoutId = setTimeout(async () => {
          if (escaped) return;

          // Before each retry, check if cached token fails validation. If so, attempt to re-auth from cached credentials.
          const freshToken = localStorage.getItem('jellyfin_token') || token;
          try {
            const isValid = await provider().validateSession(jellyfinUrl, sessionOf(freshToken!, activeUserId));
            if (!isValid) {
              const user = localStorage.getItem('jellyfin_username') || envUser;
              const pass = localStorage.getItem('jellyfin_password') || envPass;
              if (user && pass && jellyfinUrl) {
                d.log(`[System] ${provider().displayName} token stale — re-authenticating...`, 'system');
                const session = await provider().authenticate(jellyfinUrl, { username: user, password: pass });
                localStorage.setItem('jellyfin_token', session.accessToken);
                localStorage.setItem('jellyfin_userid', session.userId);
                d.log('[System] Re-auth OK.', 'system');
              }
            }
          } catch (e: any) {
            d.log(`[System] Silent re-auth check failed: ${e.message || e}`, 'system');
          }

          // Double the delay for exponential backoff up to the cap
          const nextDelay = Math.min(currentDelay * 2, MAX_DELAY);
          currentDelay = nextDelay;

          attemptSync();
        }, currentDelay);
      }
    };

    // The notice screen's rows reach into this loop (#41): RETRY NOW fires an
    // immediate attempt, CHANGE SERVER stops the loop for good.
    retryNowHook = () => {
      if (retryTimeoutId) {
        clearTimeout(retryTimeoutId);
        retryTimeoutId = null;
      }
      void attemptSync();
    };
    cancelRetryHook = () => {
      escaped = true;
      if (retryTimeoutId) {
        clearTimeout(retryTimeoutId);
        retryTimeoutId = null;
      }
      document.removeEventListener('keydown', bootEscape);
      document.removeEventListener('click', bootEscape);
    };

    attemptSync();
  } else if (jellyfinUrl) {
    // A saved server with no session (e.g. after Switch Member): the fanned
    // membership-card picker, exactly as before.
    d.log('[System] No saved credentials. Showing Login screen.', 'system');
    document.removeEventListener('keydown', bootEscape);
    document.removeEventListener('click', bootEscape);
    setTimeout(() => { hideBootOverlay(); showLoginOrCards(); }, 500);
  } else {
    // Nothing saved at all — this is the store's OPENING DAY (#41): boot the
    // empty shell and wake at the counter CRT's NEW STORE SETUP. No DOM form.
    // Flat mode (no 3D counter) keeps the classic login overlay.
    document.removeEventListener('keydown', bootEscape);
    document.removeEventListener('click', bootEscape);
    if (getSetting<string>('bb_render_mode') === 'flat') {
      d.log('[System] No saved credentials. Showing Login screen.', 'system');
      setTimeout(() => { hideBootOverlay(); showLoginOrCards(); }, 500);
      return;
    }
    d.log('[System] First run — opening day. Setting up at the counter terminal.', 'system');
    enterOpeningDay();
  }
}

export function setupLoginHandlers() {
  const form = document.getElementById('login-form') as HTMLFormElement;
  const errorMsg = document.getElementById('login-error-msg') as HTMLDivElement;

  // The backend picker and the plex.tv PIN flow own the rest of column 1.
  setupPlexSignInHandlers((m) => deps?.log(m, 'system'));

  const demoBtn = document.getElementById('btn-demo-submit') as HTMLButtonElement | null;
  if (demoBtn) {
    demoBtn.addEventListener('click', () => {
      hideLoginOverlay();
      closeMembershipCardPicker();
      showBootOverlay();
      startDemoAndLoad();
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (errorMsg) errorMsg.innerText = '';

      const submitBtn = document.getElementById('btn-login-submit') as HTMLButtonElement;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Connecting...';
      }

      const rawUrl = (document.getElementById('login-url') as HTMLInputElement).value.trim();
      const urlInput = normalizeUrl(rawUrl);
      const userInput = (document.getElementById('login-user') as HTMLInputElement).value.trim();
      const passInput = (document.getElementById('login-pass') as HTMLInputElement).value;
      // Jellyseerr is entirely optional -- both fields are blank by default and
      // saving an empty value clears any previously-saved config, so leaving
      // them blank silently disables the coming-soon feature.
      const jellyseerrUrlEl = document.getElementById('login-jellyseerr-url') as HTMLInputElement | null;
      const jellyseerrKeyEl = document.getElementById('login-jellyseerr-key') as HTMLInputElement | null;
      const jellyseerrUrlInput = jellyseerrUrlEl?.value.trim() ?? '';
      const jellyseerrKeyInput = jellyseerrKeyEl?.value.trim() ?? '';

      // Which backend the form is pointed at decides BOTH the credential shape
      // and which provider instance handles it. resetActiveProvider() is what
      // makes switching Jellyfin→Plex take effect without a reload: the active
      // provider is cached, and the cache predates the choice just made.
      const backendKind = selectedBackendKind();
      let creds: { username?: string; password?: string; accountToken?: string };
      if (backendKind === 'plex') {
        const token = plexAccountToken();
        if (!token) {
          if (errorMsg) errorMsg.innerText = 'Get a Plex sign-in code first.';
          if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = 'Connect & Sync'; }
          return;
        }
        creds = { accountToken: token };
      } else {
        creds = { username: userInput, password: passInput };
      }
      try {
        localStorage.setItem(PROVIDER_KIND_KEY, backendKind);
      } catch {
        /* the session still connects on the chosen backend */
      }
      resetActiveProvider();

      try {
        deps?.log(`[System] Contacting ${backendKind} server: ${urlInput}`, 'system');
        const session = await provider().authenticate(urlInput, creds);

        // Only the manual single-login form remembers username (to prefill);
        // the password is never persisted in plaintext localStorage. Plex has
        // no username to remember — the account token is the credential.
        if (userInput) localStorage.setItem('jellyfin_username', userInput);

        if (jellyseerrUrlInput && jellyseerrKeyInput) {
          localStorage.setItem('jellyseerr_url', jellyseerrUrlInput);
          localStorage.setItem('jellyseerr_apikey', jellyseerrKeyInput);
        } else {
          localStorage.removeItem('jellyseerr_url');
          localStorage.removeItem('jellyseerr_apikey');
        }

        // T18: Romm (optional) -- same persistence pattern as Jellyseerr above.
        // Both fields blank clears any saved config, disabling the game section.
        const rommUrlInput = (document.getElementById('login-romm-url') as HTMLInputElement | null)?.value.trim() ?? '';
        const rommKeyInput = (document.getElementById('login-romm-key') as HTMLInputElement | null)?.value.trim() ?? '';
        if (rommUrlInput && rommKeyInput) {
          localStorage.setItem('romm_url', rommUrlInput);
          localStorage.setItem('romm_apikey', rommKeyInput);
        } else {
          localStorage.removeItem('romm_url');
          localStorage.removeItem('romm_apikey');
        }

        await finishLoginAndLaunch(urlInput, session);
      } catch (err: any) {
        deps?.log(`[System] Connection error: ${err.message}`, 'system');
        if (errorMsg) {
          let userMsg = err.message || `Failed to connect to ${provider().displayName} server`;
          if (userMsg.includes('HTTP error 401')) {
            userMsg = 'Invalid username or password.';
          } else if (userMsg.includes('Failed to fetch') || userMsg.includes('NetworkError')) {
            userMsg = `Unable to connect to "${urlInput}". Check the server address, CORS settings, and verify ${provider().displayName} is online.`;
          }
          errorMsg.innerText = userMsg;
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = 'Connect & Sync';
        }
      }
    });
  }
}
