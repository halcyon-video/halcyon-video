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
  JellyfinLibrary,
} from './jellyfin';
import {
  activeProvider as provider,
  resetActiveProvider,
  sessionOf,
  PROVIDER_KIND_KEY,
} from './providers/active-provider';
import {
  forgetPlexAccount,
  plexAccountToken,
  plexServerNameFor,
  selectedBackendKind,
  selectedPlexServerUrls,
  setupPlexSignInHandlers,
} from './plex-signin';
import { forgetPlexClientIdentity } from './plex';
import { blurFocusWithin } from './text-entry-focus';
import {
  openMembershipCardPicker,
  closeMembershipCardPicker,
  type MembershipLoginSession,
} from './membership-cards';
import { buildDemoLibraries, buildDemoGames } from './demo-library';
import { getSetting } from './settings';
import { operatorDefault, type OperatorServiceId } from './operator-defaults';
import { isDemoMode } from './demo-mode';
import { fetchCatalogFromAllSources } from './catalog-sync';
import { hydrateStoreConfig, resetStoreConfigSync } from './store-config-sync';
import {
  addMediaSource,
  clearMediaSources,
  labelForUrl,
  listMediaSources,
  primaryMediaSource,
} from './media-sources';
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
  /** GH #86: streaming-service sections (Jellyseerr watch-provider data). */
  loadStreaming: () => Promise<void>;
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
        // EVERY connected server, not just the primary (GH #84) — "change
        // server" on a two-server store that leaves the second one connected
        // would re-stock from a distributor the person just walked away from.
        clearMediaSources();
        forgetPlexAccount();
        // A different distributor holds a different saved store (GH #123):
        // re-arm the hydrate so the next connection reads ITS settings rather
        // than assuming this boot already read the right ones.
        resetStoreConfigSync();
        localStorage.removeItem('jellyfin_username');
        d.log('[Setup] Saved servers dropped — pick a new distributor.', 'system');
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

/** Whether an opening-day setup terminal is queued for this reveal (#137: a shared-place link is meaningless over an empty store, and would fight the terminal for the camera). */
export function isSetupPending(): boolean {
  return pendingSetup !== null;
}

/**
 * CHANGE SERVER / LOG OUT (#41): the empty-store setup terminal is the
 * re-entry point, not the old DOM form. Flat mode (no 3D counter to dock to)
 * keeps the form.
 */
export function logOutToOpeningDay(): void {
  if (!deps) return;
  const count = listMediaSources().length;
  deps.log(
    `[System] Logging out and resetting ${count > 1 ? `${count} server sessions` : `${provider().displayName} session`}...`,
    'system'
  );
  clearMediaSources();
  forgetPlexAccount();
  localStorage.removeItem('jellyfin_username');
  localStorage.removeItem('jellyfin_password');
  deps.teardownScene();
  if (getSetting<string>('bb_render_mode') === 'flat') {
    showLoginOverlay();
    return;
  }
  enterOpeningDay();
}

/** Settings-drawer key for FORGET THIS SERVER & START OVER (main.ts's Account
 *  group, #124) — exported so main.ts's row and this module's arm/confirm
 *  logic agree on the same DOM id. */
export const FORGET_SERVER_KEY = '__forget_server__';

let forgetArmed = false;
let forgetDisarmTimer: ReturnType<typeof setTimeout> | null = null;

function forgetServerValueEl(): Element | null | undefined {
  return document.getElementById(`setting-row-${FORGET_SERVER_KEY}`)?.querySelector('.settings-row-value');
}

function disarmForgetServer(): void {
  forgetArmed = false;
  if (forgetDisarmTimer) {
    clearTimeout(forgetDisarmTimer);
    forgetDisarmTimer = null;
  }
  const value = forgetServerValueEl();
  if (value) value.textContent = '';
}

/**
 * FORGET THIS SERVER & START OVER (#124): a two-tap confirm on its own
 * settings row rather than a modal overlay — every row already has working
 * Up/Down/Enter navigation, remote and mouse alike, and a destructive wipe
 * still wants a genuine second step. Re-reads the row's own rendered text
 * (not just the module-level flag) before treating a press as the confirm:
 * the settings drawer regenerates its DOM on every page change, so a stale
 * flag surviving a navigate-away-and-back must not fire on what reads to the
 * player as a first press.
 *
 * Returns whether this press actually fired the wipe (the second, confirming
 * one) — main.ts's dispatch uses that to decide whether to close the settings
 * drawer: closing it on the arming press would hide the "press again" label
 * the player is meant to read.
 */
export function activateForgetServer(): boolean {
  const value = forgetServerValueEl();
  if (!forgetArmed || value?.textContent !== 'PRESS AGAIN TO CONFIRM') {
    forgetArmed = true;
    if (value) value.textContent = 'PRESS AGAIN TO CONFIRM';
    if (forgetDisarmTimer) clearTimeout(forgetDisarmTimer);
    forgetDisarmTimer = setTimeout(disarmForgetServer, 5000);
    return false;
  }
  disarmForgetServer();
  forgetEverythingAndStartOver();
  return true;
}

/**
 * The actual wipe. CHANGE SERVER / LOG OUT (logOutToOpeningDay, above)
 * deliberately keeps provider_kind (so a reconnect doesn't silently revert
 * Plex back to Jellyfin) and the Plex client id (plex.tv keys a device's
 * authorization to it — a fresh one on every ordinary log-out would look
 * like a new device every session). This is "start completely fresh": those
 * two, plus every Jellyseerr/Romm credential, cleared as well (#124).
 */
function forgetEverythingAndStartOver(): void {
  if (!deps) return;
  deps.log('[System] Forgetting this server — wiping every saved credential...', 'system');
  clearMediaSources();
  forgetPlexAccount();
  forgetPlexClientIdentity();
  resetStoreConfigSync();
  resetActiveProvider();
  for (const key of [
    'jellyfin_username', 'jellyfin_password', 'jellyfin_last_userid',
    'jellyseerr_url', 'jellyseerr_apikey', 'romm_url', 'romm_apikey',
    PROVIDER_KIND_KEY,
  ]) {
    localStorage.removeItem(key);
  }
  deps.teardownScene();
  if (getSetting<string>('bb_render_mode') === 'flat') {
    showLoginOverlay();
    return;
  }
  enterOpeningDay();
}

/**
 * The blunt stall watchdog's error, shared by all three sync entry points
 * (GH #128). By the time this fires, plexJson's/jellyfin's own per-request
 * timeouts have already had their chance to fail with a specific cause — this
 * is what's left for a stage that genuinely never returns anything at all, so
 * it names what was in flight and what's worth checking, rather than the bare
 * "No response from Plex for 45s" that gave a real report nothing to go on.
 */
function stallMessage(displayName: string, stallMs: number, lastStage: string): string {
  return (
    `No response from ${displayName} for ${stallMs / 1000}s (last step: ${lastStage}). ` +
    `Check that the server is awake, not mid-scan, and reachable from this device.`
  );
}

/**
 * Sync every connected server (GH #84) and say what happened.
 *
 * The one place all three boot paths get their catalog, so the multi-server
 * reporting reads the same whether you arrived by setup terminal, login form
 * or saved session. A source that failed is NAMED rather than folded into a
 * total: "3 of 5 libraries" with no explanation is how a friend's sleeping
 * server turns into a bug report about missing shelves.
 */
async function syncAllSources(onProgress?: (stage: string) => void): Promise<JellyfinLibrary[]> {
  // BEFORE the catalog, not after (GH #123): the carried-library choices are
  // part of the configuration being fetched, and they decide which libraries
  // are worth syncing at all. Hydrating afterwards would have this machine pay
  // to fetch libraries the person switched off on their other one, then hide
  // them. Cheap and silent when there is nothing to fetch from — the demo, a
  // Plex store, a server with no record yet — and never fatal: a store that
  // opens on local settings beats a store that doesn't open.
  onProgress?.('settings');
  const config = await hydrateStoreConfig();
  if (config.status === 'applied') {
    deps?.log(
      `[System] Store settings restored from your account (${config.written} applied` +
      `${config.removed ? `, ${config.removed} cleared` : ''}).`,
      'system'
    );
  } else if (config.status === 'failed') {
    deps?.log(`[System] Could not read your saved store settings: ${config.error}`, 'system');
  }
  const result = await fetchCatalogFromAllSources({ onProgress });
  for (const failure of result.failures) {
    deps?.log(`[System] ${failure.source.name} did not answer: ${failure.error}`, 'system');
  }
  if (result.synced.length > 1) {
    const names = result.synced.map((s) => s.name).join(', ');
    deps?.log(`[System] Stocked from ${result.synced.length} servers: ${names}.`, 'system');
  }
  return result.libraries;
}

/**
 * The setup terminal's catalog sync: same stall watchdog + sidecar loaders as
 * finishLoginAndLaunch, but progress renders as a CRT readout instead of the
 * boot console, and the carried-library exclusions just chosen on the
 * checkbox screen are honored (their item sync is skipped entirely).
 */
async function syncForSetup(
  // The server the terminal finished on is already persisted as a connected
  // source by afterAuth, and the sync fans out over ALL of them (GH #84) — so
  // these two are now only part of the callback's shape, not its input.
  _url: string,
  _session: MembershipLoginSession,
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
  let pages = 0;
  let lastStage = 'CONTACTING DISTRIBUTOR...';
  const stallPromise = new Promise<never>((_, reject) => {
    // Named cause, not a blank stall (GH #128): plexJson/jellyfin's own
    // per-request timeouts now fail fast with a specific reason before this
    // ever fires, so reaching here means the last stage itself never even
    // returned an error — worth saying which one it was.
    onStall = () => reject(new Error(stallMessage(provider().displayName, LOGIN_STALL_MS, lastStage)));
    armStall();
  });
  const onProgress = (stage: string) => {
    armStall();
    if (stage === 'page') pages++;
    else lastStage = `SYNCING ${stage.toUpperCase()}`;
    onStage(lastStage, pages);
  };
  let libs: JellyfinLibrary[];
  try {
    [libs] = await Promise.all([
      // `url`/`session` are already persisted as a connected source by
      // afterAuth — the sync fans out over ALL of them, not just the one the
      // terminal happened to finish on (GH #84).
      Promise.race([syncAllSources(onProgress), stallPromise]),
      d.loadComingSoon(),
      d.loadDiscovery(),
      d.loadGames(),
      d.loadStreaming(),
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

/**
 * Replace a login column's credential boxes with a line saying the server
 * already supplies this service (#129).
 *
 * Skipped when the visitor has a value of their own, so their fields stay
 * editable and their own server keeps winning — the operator's default is a
 * default, not a lock. Idempotent: showLoginOverlay() can run several times in
 * a session, so the note is keyed by id and never stacks up.
 */
function hideIfOperatorManaged(
  id: OperatorServiceId,
  ownValue: string | null | undefined,
  inputs: (HTMLInputElement | null)[]
): void {
  const operator = operatorDefault(id);
  const column = inputs.find((i) => i)?.closest('.login-column') as HTMLElement | null;
  const noteId = `login-${id}-operator-note`;
  document.getElementById(noteId)?.remove();
  for (const input of inputs) {
    const group = input?.closest('.input-group') as HTMLElement | null;
    if (group) group.style.display = operator && !ownValue ? 'none' : '';
  }
  if (!operator || ownValue || !column) return;
  const note = document.createElement('p');
  note.id = noteId;
  note.className = 'column-desc';
  note.textContent = `Provided by this store's server (${operator.url}). Nothing to enter — `
    + 'the API key stays on the server and is never sent to your browser.';
  column.appendChild(note);
}

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

    // Don't ask for what this server already supplies (#129). An
    // operator-managed service has no key to type — asking for one invites a
    // visitor to paste a credential that would only override a working
    // connection with their own.
    hideIfOperatorManaged('jellyseerr', savedJellyseerrUrl, [jellyseerrUrlInput, jellyseerrKeyInput]);

    // T18: Romm (optional) -- same prefill treatment as Jellyseerr. Column
    // stays hidden (values still prefilled, just not shown) unless the Video
    // Games section is switched on in Settings, so opting in still requires a
    // deliberate settings-drawer toggle before Romm creds are even offered.
    const envRommUrl = typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_ROMM_URL : undefined;
    const envRommKey = typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_ROMM_APIKEY : undefined;
    const rommUrlInput = document.getElementById('login-romm-url') as HTMLInputElement | null;
    const savedRommUrl = localStorage.getItem('romm_url') || envRommUrl || '';
    if (rommUrlInput) rommUrlInput.value = savedRommUrl;
    const rommKeyInput = document.getElementById('login-romm-key') as HTMLInputElement | null;
    if (rommKeyInput) rommKeyInput.value = localStorage.getItem('romm_apikey') || envRommKey || '';
    hideIfOperatorManaged('romm', savedRommUrl, [rommUrlInput, rommKeyInput]);
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
  // Connect (or refresh) this server as a source rather than overwriting the
  // singleton keys (GH #84) — addMediaSource mirrors the primary back into
  // them, so everything that still reads jellyfin_url/token/userid is fed.
  // Matching on (kind, url) means re-authenticating a server the store already
  // knows keeps its id, and therefore its carried-library choices.
  addMediaSource({
    kind: provider().id,
    url: urlInput,
    token: session.accessToken,
    userId: session.userId,
    userName: session.userName,
    name: labelForUrl(urlInput),
  });
  localStorage.setItem('jellyfin_last_userid', session.userId); // remembered for next boot's card highlight

  deps.log('[System] Downloading movie libraries and catalog metadata...', 'system');
  // Stall watchdog, not a deadline — see the auto-login path for why a fixed
  // cap on total sync duration is unsurvivable for a large enough library.
  const LOGIN_STALL_MS = 45_000;
  let loginStallTimer: ReturnType<typeof setTimeout> | null = null;
  let onLoginStall: (() => void) | null = null;
  let lastLoginStage = 'Contacting server';
  const armLoginStall = (stage?: string) => {
    if (stage && stage !== 'page') lastLoginStage = stage;
    if (loginStallTimer) clearTimeout(loginStallTimer);
    loginStallTimer = setTimeout(() => onLoginStall?.(), LOGIN_STALL_MS);
  };
  const loginTimeout = new Promise<never>((_, reject) => {
    onLoginStall = () => reject(new Error(stallMessage(provider().displayName, LOGIN_STALL_MS, lastLoginStage)));
    armLoginStall();
  });
  let libs: JellyfinLibrary[];
  try {
    [libs] = await Promise.all([
      Promise.race([syncAllSources(armLoginStall), loginTimeout]),
      deps.loadComingSoon(),
      deps.loadDiscovery(),
      deps.loadGames(),
      deps.loadStreaming()
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
  // Clears the SINGLETON session only, deliberately: the connected-source list
  // keeps every server (and every carried-library choice) so the card just
  // picked lands back on the same store. checkCredentialsAndLoad still gates on
  // these keys, so a reload in this state shows the card picker rather than
  // syncing on the outgoing member's token; finishLoginAndLaunch then refreshes
  // the primary source in place, matching it by (kind, url).
  localStorage.removeItem('jellyfin_token');
  localStorage.removeItem('jellyfin_userid');
  // The next person gets THEIR store, not a skipped hydrate onto the outgoing
  // member's settings — and any save still pending is dropped rather than
  // landing on whoever just picked up the remote (GH #123).
  resetStoreConfigSync();
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

// Movies-library title count fed to buildDemoLibraries() as its baseCount
// (the other two synthetic libraries scale off it — see demo-library.ts).
// FULL is today's fixed build (~2,000 titles total, unchanged for anyone an
// actual constrained-device signal doesn't flag). LOW still clears every
// collection/saga/promo-campaign slot demo-library.ts hand-places (their
// highest indices top out at 76), so a visitor gated down to it still walks
// a complete store, just a smaller one.
const DEMO_BASE_COUNT_FULL = 900;
const DEMO_BASE_COUNT_MEDIUM = 360; // ~800 titles total
const DEMO_BASE_COUNT_LOW = 140; // ~300 titles total

/**
 * Sizes the public demo's synthetic catalog to what THIS visitor's device can
 * actually carry (GH #138), instead of always building the same ~2,000-title
 * store regardless of whether it landed on the owner's dev box or a phone on
 * a cell connection — the scenario the README's own front-page heads-up used
 * to warn about. Two independent signals, either enough on its own to shrink
 * the catalog:
 *  - a phone-shaped viewport (small + coarse-pointer + no hover — the exact
 *    test device-gate.ts asks before offering flat 2D as an alternative; a
 *    visitor who chose 3D anyway there is still on a phone) or
 *    navigator.deviceMemory reporting <=4GB (Chrome/Android only, undefined
 *    everywhere else — it only ever ADDS a signal, never removes one);
 *  - the SAME measured GPU tier the real boot uses for render quality
 *    (quality-calibrate.ts) — a weak/software GPU means less texture-array
 *    headroom too, not just a lower render tier. Skipped entirely in flat
 *    (2.5D) mode, which never touches WebGL (matches main.ts's own
 *    dynamic-import-after-flat-early-return for this module).
 * Anything inconclusive defaults to the full catalog — this only ever
 * shrinks the store for a visitor a real signal flagged, never a downgrade
 * for anyone else (see GH #138's non-goals).
 */
async function demoCatalogBaseCount(): Promise<number> {
  const phoneShaped = typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches &&
    window.matchMedia('(hover: none)').matches &&
    Math.min(window.innerWidth, window.innerHeight) < 700;
  const deviceMemory = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  const lowMemory = typeof deviceMemory === 'number' && deviceMemory <= 4;
  if (phoneShaped || lowMemory) {
    console.log(`[demo] phone-shaped=${phoneShaped} deviceMemory=${deviceMemory ?? 'n/a'} — sizing catalog to ${DEMO_BASE_COUNT_LOW}`);
    return DEMO_BASE_COUNT_LOW;
  }

  if (getSetting<string>('bb_render_mode') === 'flat') return DEMO_BASE_COUNT_FULL;
  const { calibrateQualityIfNeeded } = await import('./quality-calibrate');
  const tier = await calibrateQualityIfNeeded();
  const baseCount = tier === 'low' ? DEMO_BASE_COUNT_LOW
    : tier === 'medium' ? DEMO_BASE_COUNT_MEDIUM
    : DEMO_BASE_COUNT_FULL;
  console.log(`[demo] GPU quality tier=${tier ?? 'n/a'} — sizing catalog to ${baseCount}`);
  return baseCount;
}

/**
 * Demo-mode boot (see src/demo-mode.ts): no credential gate, no Jellyfin
 * fetch, no login overlay ever — stock the store from the synthetic demo
 * library and hand off to the normal texture-gated reveal.
 */
export async function startDemoAndLoad() {
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
  const baseCount = await demoCatalogBaseCount();
  deps.log(`[System] Demo mode: stocking the store with a placeholder library (${baseCount === DEMO_BASE_COUNT_FULL ? 'full' : 'downsized for this device'}, no media server).`, 'system');
  deps.setLibraries(buildDemoLibraries(baseCount));
  deps.setGames(buildDemoGames(60));
  // GH #86 zero-setup follow-up (owner ruling 2026-08-21): the demo's own
  // bb_streaming_services setting default is the full eight (settings.ts),
  // and this is the ONE loader that was never wired into the demo boot at
  // all — every other credential path races it alongside the sync, but the
  // demo has no sync to race it into. Awaited (not raced against a timeout
  // here) because loadStreamingMovies() already races its own network calls
  // against a 15s cap internally, and the bundled-snapshot path it lands on
  // with no config makes no network call to begin with.
  await deps.loadStreaming();
  deps.launchStore();
}

/** Marker for "this browser has already been offered the build's defaults". */
const DEFAULTS_SEEDED_KEY = 'halcyon_defaults_seeded';

/**
 * Connection defaults an OPERATOR set for everyone on their instance (#129),
 * applied on this visitor's first boot and reported plainly, because the two
 * tiers expose very different things:
 *
 *   TIER 1, build-time `VITE_ROMM_*` / `VITE_JELLYSEERR_*`: seeded into this
 *     browser's localStorage here. The key is inside the bundle — every
 *     visitor can read it. Right for a household, wrong for a public instance,
 *     and the log line says so rather than letting an operator assume secrecy
 *     they don't have.
 *   TIER 2, server-side `HALCYON_*`: nothing to seed. The browser was told the
 *     addresses and no key at all (operator-defaults.ts), and getRommConfig()/
 *     getJellyseerrConfig() fall back to them at read time.
 *
 * Seeding was previously nested inside the `VITE_JELLYFIN_*` auto-login branch,
 * so an operator who set Romm/Jellyseerr defaults but no file credentials for
 * Jellyfin — every operator whose visitors sign in as themselves — saw them
 * silently ignored. It runs on its own now, once per browser: only ever
 * filling a key that is absent, and never a second time, so a field the
 * visitor deliberately cleared stays cleared.
 */
function seedConnectionDefaults(log: BootFlowDeps['log']): void {
  const managed = [
    operatorDefault('romm') ? 'Romm' : '',
    operatorDefault('jellyseerr') ? 'Jellyseerr / Overseerr' : '',
  ].filter(Boolean);
  if (managed.length) {
    log(
      `[System] ${managed.join(' and ')} ${managed.length > 1 ? 'are' : 'is'} provided by this server — `
      + 'its API key stays server-side and never reaches this browser.',
      'system'
    );
  }
  if (operatorDefault('romm') && !localStorage.getItem('bb_games_enabled')) {
    // Same reasoning as the seeded case below: an operator who pointed their
    // instance at a Romm meant for the game department to be there.
    localStorage.setItem('bb_games_enabled', '1');
  }

  if (typeof import.meta.env === 'undefined') return;
  if (localStorage.getItem(DEFAULTS_SEEDED_KEY)) return;
  localStorage.setItem(DEFAULTS_SEEDED_KEY, '1');

  const seed = (key: string, value: string | undefined): boolean => {
    if (!value || localStorage.getItem(key)) return false;
    localStorage.setItem(key, value);
    return true;
  };
  const seeded: string[] = [];
  // A service the SERVER manages is never seeded from the bundle: writing the
  // build's copy of the key into this browser would win over the operator's
  // (both halves present beats the operator fallback) and put the credential
  // back in the visitor's hands — losing the whole point of tier 2 to a
  // leftover .env.local.
  if (!operatorDefault('jellyseerr')
      && import.meta.env.VITE_JELLYSEERR_URL && import.meta.env.VITE_JELLYSEERR_APIKEY) {
    const a = seed('jellyseerr_url', import.meta.env.VITE_JELLYSEERR_URL);
    const b = seed('jellyseerr_apikey', import.meta.env.VITE_JELLYSEERR_APIKEY);
    if (a || b) seeded.push('Jellyseerr / Overseerr');
  }
  if (!operatorDefault('romm')
      && import.meta.env.VITE_ROMM_URL && import.meta.env.VITE_ROMM_APIKEY) {
    const a = seed('romm_url', import.meta.env.VITE_ROMM_URL);
    const b = seed('romm_apikey', import.meta.env.VITE_ROMM_APIKEY);
    if (a || b) {
      seeded.push('Romm');
      // A seeded Romm with the game section still off would stock nothing.
      if (!localStorage.getItem('bb_games_enabled')) localStorage.setItem('bb_games_enabled', '1');
    }
  }
  if (seeded.length) {
    log(
      `[System] ${seeded.join(' and ')} configured from this build's env. Note the API key ships `
      + 'inside the bundle: anyone using this store can read it.',
      'system'
    );
  }
}

export async function checkCredentialsAndLoad() {
  if (!deps) return;
  const d = deps;
  // Security hardening: Purge any stored plaintext password
  localStorage.removeItem('jellyfin_password');

  // Before the credential checks below, and before any shelf reads a config:
  // an operator's defaults are what an arriving visitor is meant to boot into.
  seedConnectionDefaults(d.log);

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
      // (The Jellyseerr/Romm seed that used to live here now runs for every
      // boot, in seedConnectionDefaults above — GH #129.)
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

      // The token/user id below are only for the PRIMARY source's stale-session
      // re-auth in the retry tail; the sync itself reads each source's own
      // credentials out of the connected-source list (GH #84).
      // Falls back to '' rather than null: reaching here with no stored user id
      // is now normal (Plex), and ProviderSession.userId is typed a string —
      // the Jellyfin provider interpolates it straight into /Users/<id>/Items,
      // where a null would have gone out as the literal "null".
      const activeUserId = localStorage.getItem('jellyfin_userid') || userId || '';

      let stallTimer: ReturnType<typeof setTimeout> | null = null;
      let onStall: (() => void) | null = null;
      let lastSyncStage = 'Contacting server';
      const armStall = (stage?: string) => {
        if (stage && stage !== 'page') lastSyncStage = stage;
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = setTimeout(() => onStall?.(), STALL_MS);
      };
      const stallPromise = new Promise<never>((_, reject) => {
        onStall = () => reject(new Error(stallMessage(provider().displayName, STALL_MS, lastSyncStage)));
        armStall();
      });

      try {
        let libs: JellyfinLibrary[];
        [libs] = await Promise.all([
          Promise.race([syncAllSources(armStall), stallPromise]),
          d.loadComingSoon(),
          d.loadDiscovery(),
          d.loadGames(),
          d.loadStreaming()
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
                // Through the source list, not the bare keys: the sync reads
                // its credentials from there now, so writing only the legacy
                // keys would refresh a token nothing goes on to use and retry
                // forever against the stale one (GH #84).
                const stale = primaryMediaSource();
                addMediaSource({
                  id: stale?.id,
                  kind: stale?.kind ?? provider().id,
                  url: jellyfinUrl,
                  token: session.accessToken,
                  userId: session.userId,
                  userName: session.userName,
                  name: stale?.name ?? labelForUrl(jellyfinUrl),
                });
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

      // Normalised by the PROVIDER, not by Jellyfin's helper: a bare address
      // becomes http:// on Jellyfin and follows the page's own scheme on Plex,
      // where an unconditional http:// is an address a hosted HTTPS build can
      // never send (#125).
      const urlInput = provider().normalizeServerAddress(rawUrl);

      try {
        deps?.log(`[System] Contacting ${backendKind} server: ${urlInput}`, 'system');
        const session = await provider().authenticate(urlInput, creds);
        // The address that ANSWERED. A provider may fall through to a sibling
        // connection for the same server (see ProviderSession.serverAddress),
        // and everything below persists an address — so persist that one.
        const connectedUrl = session.serverAddress || urlInput;
        if (connectedUrl !== urlInput) {
          deps?.log(`[System] Connected on ${connectedUrl} instead — ${urlInput} was not reachable from this page.`, 'system');
        }

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

        // MULTI-SERVER (GH #84): the Plex list is a multi-select, so connect
        // every OTHER ticked server too before the sync runs. The one the
        // form's address field holds is registered first and stays primary —
        // it is the one the person actually typed or picked first, and the
        // singleton consumers (Jellyseerr, remote play, the Settings rows)
        // resolve to it.
        addMediaSource({
          kind: backendKind,
          url: connectedUrl,
          token: session.accessToken,
          userId: session.userId,
          userName: session.userName,
          name: (backendKind === 'plex' ? (plexServerNameFor(urlInput) || plexServerNameFor(connectedUrl)) : '')
            || labelForUrl(connectedUrl),
        });
        if (backendKind === 'plex') {
          const extras = selectedPlexServerUrls()
            .map((u) => provider().normalizeServerAddress(u))
            .filter((u) => u && u !== urlInput && u !== connectedUrl);
          for (const extra of extras) {
            try {
              const extraSession = await provider().authenticate(extra, creds);
              const extraUrl = extraSession.serverAddress || extra;
              addMediaSource({
                kind: backendKind,
                url: extraUrl,
                token: extraSession.accessToken,
                userId: extraSession.userId,
                userName: extraSession.userName,
                name: plexServerNameFor(extra) || labelForUrl(extraUrl),
              });
              deps?.log(`[System] Also connected ${plexServerNameFor(extra) || extra}.`, 'system');
            } catch (e: any) {
              // One unreachable extra must not sink a connect that otherwise
              // worked — a shared server being asleep is the ordinary case.
              deps?.log(`[System] Could not connect ${extra}: ${e?.message ?? e}`, 'system');
            }
          }
        }

        await finishLoginAndLaunch(connectedUrl, session);
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
