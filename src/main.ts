import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { measureDisplayHz } from './display-hz';
import { installDebugLog, debugLogPath } from './debug-log';

// Before anything else that might fail: a packaged build has no devtools and
// no stdout, so without this every console line is written to nowhere.
installDebugLog();

// Sample the compositor's real refresh rate while the boot overlay is up, so
// the dynamic resolution scaler chases 120fps on a 120Hz display instead of
// its historical 60Hz-tuned thresholds.
measureDisplayHz();

const isTauri = !!(window as any).__TAURI_INTERNALS__;
function closeApp() { isTauri ? getCurrentWindow().close() : window.close(); }
import {
  fetchJellyfinLibrariesAndMovies,
  authenticateUser,
  validateToken,
  fetchPublicUsers,
  normalizeUrl,
  Movie,
  JellyfinLibrary,
  fetchFirstEpisodeOfSeries,
  fetchSeriesEpisodes,
  reportPlaybackStart,
  reportPlaybackStopped,
  reportPlaybackProgress,
  buildHlsStreamUrl,
  isHevcPassThroughEnabled,
  buildStaticStreamUrl,
  isDirectPlaySafe,
  fetchItemPlaybackInfo,
  MediaPlaybackInfo,
  MovieVersion,
  Episode,
  collectionTmdbIds,
  collectionSyncStats
} from './jellyfin';
import {
  fetchComingSoonMovies,
  fetchDiscoverMovies,
  fetchCollectionGaps,
  resolveCollectionTmdbIds,
  CollectionGapTarget,
  requestMovie,
  isDiscoveryRequested,
  getJellyseerrConfig,
  pingJellyseerr
} from './jellyseerr';
import { fetchGames, launchGame } from './romm';
import { isGamesOnly, storeCatalog } from './games-only';
import {
  openMembershipCardPicker,
  closeMembershipCardPicker,
  isMembershipPickerOpen,
  type MembershipLoginSession,
} from './membership-cards';
import { getActiveTheme, applyThemeCssVars } from './themes';
import { retailAudio } from './audio';
import { BB_ARCHIVO_BLACK, bundledFontsReady } from './bundled-fonts';
import { brandString, loadBrandPack } from './brand-pack';
import type { StoreScene } from './three-scene';
import { InputManager } from './input';
import type { InputCallbacks } from './input';
import { refreshHoldHints, setHoldCheckoutProgress, setHoldDismissProgress } from './hold-hints';
import { setupRemotePlay, isRemoteInstance, isRemotelyDriven } from './remote-play';
import { enableFpsMeter, FPS_METER_KEY } from './fps-meter';
import { VideoPlayer } from './video-player';
// initCaseMedium and refreshPosterCrop are dynamically imported to avoid loading Three.js on boot in 2.5D mode.
import {
  registerCoreSettings,
  allSettings,
  settingsInSubpage,
  serviceSettings,
  visibleGroups,
  getSetting,
  setSetting,
  getSettingDef,
  nextCycleValue,
  currentValueLabel,
  buildStoreBrandPanel,
  activateBrandRow,
  BRAND_ROW_PREFIX,
  createSettingThumb,
  refreshSettingThumb,
} from './settings';
import type { SettingDef, SettingGroup } from './settings';
import { counterTerminalLines } from './counter-terminal';
import type { CandyRow } from './fixtures/period-fixtures';
import { getCandyDeliveryAdapter } from './candy-delivery';
import { isDemoMode } from './demo-mode';
import { startScreensaverAnimation, stopScreensaverAnimation } from './screensaver';
import { buildDemoLibraries, buildDemoDiscovery, buildDemoGames, makeSyntheticEpisodes, demoPoster } from './demo-library';
import { EMPTY_STAFF_PICKS, loadStaffPicks, StaffPicks } from './staff-picks-loader';
import { titleMatchKeys } from './staff-picks';

// ─── Application State ────────────────────────────────────────────────────────

let librariesList: JellyfinLibrary[] = [];
// Requested-but-not-yet-downloaded titles from an (optional) Jellyseerr server
// -- see jellyseerr.ts. Populated alongside librariesList right before the
// store scene is built; stays [] if Jellyseerr isn't configured or unreachable.
let comingSoonMovies: Movie[] = [];
// Jellyseerr trending/popular suggestions NOT in the library — shelved inline
// with the regular stock as REQUEST-stickered cases (see StoreScene's merge).
// Stays [] if Jellyseerr isn't configured/reachable, same as comingSoonMovies.
let discoveryMovies: Movie[] = [];
// T18: video-game stock from an (optional) Romm server, for the VIDEO GAMES
// section -- see romm.ts. Stays [] if Romm isn't configured/reachable, same
// never-block-boot treatment as the Jellyseerr lists above.
let gameMovies: Movie[] = [];
// What the STORE is built from, as opposed to what was fetched. Normally these
// alias librariesList/gameMovies exactly; with GAMES ONLY on (games-only.ts)
// the Romm platforms stand in as the libraries and the game department empties,
// because its stock is already out on every aisle. Refreshed at the single
// scene-build funnel (initializeStoreScene), so every consumer below — search,
// checkout lookup, staff picks, the flat store — sees one consistent catalog.
// The fetched lists are left untouched, which is what makes toggling back off
// a rebuild rather than a full re-sync.
let storeLibraries: JellyfinLibrary[] = [];
let storeGameMovies: Movie[] = [];
function refreshStoreCatalog() {
  const catalog = storeCatalog(librariesList, gameMovies);
  storeLibraries = catalog.libraries;
  storeGameMovies = catalog.games;
}
// Watch-history staff picks (stickers + genre endcaps) -- see staff-picks.ts.
// Computed right before the 3D scene is built; stays empty without watch
// history or a Jellyseerr integration (real or synthetic).
let staffPicks: StaffPicks = EMPTY_STAFF_PICKS;
let storeScene: StoreScene | null = null;
let videoPlayer: VideoPlayer | null = null;
// WebGL context died during playback; reload when the player closes (issue #70).
let pendingContextLostReload = false;

/**
 * Fetch Jellyseerr's coming-soon titles without ever letting a failure there
 * block Jellyfin login/sync -- the feature is purely additive.
 */
async function loadComingSoonMovies(): Promise<void> {
  const TIMEOUT_MS = 15_000;
  const timeoutPromise = new Promise<Movie[]>((resolve) =>
    setTimeout(() => resolve([]), TIMEOUT_MS)
  );
  try {
    comingSoonMovies = await Promise.race([fetchComingSoonMovies(), timeoutPromise]);
  } catch (e) {
    console.warn('[Jellyseerr] Failed to load coming-soon titles:', e);
    comingSoonMovies = [];
  }
}

/**
 * Fetch Jellyseerr's discovery (trending/popular) suggestions for the inline
 * REQUEST-stickered shelf cases, same never-block-boot treatment as
 * loadComingSoonMovies.
 */
async function loadDiscoveryMovies(): Promise<void> {
  // Demo: no Jellyseerr server, but the shelved suggestions and the clerk's
  // "want me to order it?" dialog should still be showcased.
  if (isDemoMode) {
    discoveryMovies = buildDemoDiscovery(24);
    return;
  }
  const TIMEOUT_MS = 15_000;
  const timeoutPromise = new Promise<Movie[]>((resolve) =>
    setTimeout(() => resolve([]), TIMEOUT_MS)
  );
  try {
    discoveryMovies = await Promise.race([fetchDiscoverMovies(), timeoutPromise]);
  } catch (e) {
    console.warn('[Jellyseerr] Failed to load discovery titles:', e);
    discoveryMovies = [];
  }
}

/**
 * One boot-console line that always states where Jellyseerr stands. The
 * loaders above swallow every failure (never-block-boot), so without this a
 * rejected API key or unreachable server is indistinguishable from "nothing
 * to show" — the user stares at a store with no request-stickered cases, no
 * clasps, and no clue why.
 */
let loggedDebugPath = false;

/** Tell the player where the session log lives, once the sink has resolved it. */
function logDebugLogPath(): void {
  if (loggedDebugPath) return;
  const path = debugLogPath();
  if (!path) return;
  loggedDebugPath = true;
  logToConsole(`[System] Session log: ${path}`, 'system');
}

async function logJellyseerrStatus(gapCount: number): Promise<void> {
  logDebugLogPath();
  if (gapCount > 0) {
    logToConsole(`[System] Jellyseerr: ${gapCount} missing title(s) shelved in partly-owned collections.`, 'system');
  }
  if (comingSoonMovies.length > 0) {
    logToConsole(`[System] Jellyseerr: ${comingSoonMovies.length} coming-soon title(s) found.`, 'system');
  }
  if (discoveryMovies.length > 0) {
    logToConsole(`[System] Jellyseerr: ${discoveryMovies.length} trending title(s) shelved with a REQUEST sticker.`, 'system');
  }
  if (isDemoMode || gapCount + comingSoonMovies.length + discoveryMovies.length > 0) return;

  if (!getJellyseerrConfig()) {
    logToConsole('[System] Jellyseerr: not configured — coming-soon and recommendations disabled.', 'system');
    return;
  }
  const ping = await pingJellyseerr();
  if (ping.ok) {
    logToConsole('[System] Jellyseerr: connected, but no requests or discoveries to shelve.', 'system');
  } else {
    logToConsole(`[System] Jellyseerr ERROR: ${ping.reason} — coming-soon and recommendations are OFF. Re-check the URL and API key on the membership screen.`, 'system');
  }
}

/**
 * Fill the holes in partly-owned collections: for every Jellyfin BoxSet that
 * carries a TMDB collection id, ask Jellyseerr for the full member list and
 * splice the titles you DON'T own into the same library's movie list, so they
 * take their real chronological place on the shelf (see fetchCollectionGaps).
 *
 * Must run after the Jellyfin sync — it reads collectionTmdbIds, which the
 * membership pass populates — and before StoreScene builds its layouts, since
 * StorePlan.buildLibraryLayouts() memoizes on first use.
 *
 * Same never-block-boot treatment as the loaders above: any failure just means
 * shelves with no gap cases on them.
 */
async function mergeCollectionGaps(libraries: JellyfinLibrary[]): Promise<number> {
  const TIMEOUT_MS = 15_000;
  const stats = collectionSyncStats;

  // Only ask about collections actually represented on these shelves, and let
  // the owned members supply the library + genres each gap should inherit.
  const targets: CollectionGapTarget[] = [];
  const genresByCollection = new Map<string, Set<string>>();
  const libraryByCollection = new Map<string, string>();
  // One owned member's own TMDB id per collection, to recover a collection id
  // for BoxSets that carry none (the common case for hand-made collections).
  const memberTmdbByCollection = new Map<string, number>();
  for (const lib of libraries) {
    for (const m of lib.movies) {
      if (!m.collectionName) continue;
      if (!libraryByCollection.has(m.collectionName)) libraryByCollection.set(m.collectionName, lib.name);
      if (typeof m.tmdbId === 'number' && !memberTmdbByCollection.has(m.collectionName)) {
        memberTmdbByCollection.set(m.collectionName, m.tmdbId);
      }
      let genres = genresByCollection.get(m.collectionName);
      if (!genres) { genres = new Set<string>(); genresByCollection.set(m.collectionName, genres); }
      for (const g of m.genres || []) genres.add(g);
    }
  }

  // A BoxSet id is the fast path, not the only path: anything shelved but
  // unscraped gets its collection id looked up through a member instead.
  const collectionIds = new Map(collectionTmdbIds);
  const unresolved: { collectionName: string; memberTmdbId: number }[] = [];
  for (const [collectionName, memberTmdbId] of memberTmdbByCollection) {
    if (collectionIds.has(collectionName)) continue;
    unresolved.push({ collectionName, memberTmdbId });
  }
  if (unresolved.length > 0) {
    logToConsole(
      `[System] Collections: ${unresolved.length} of ${stats.boxSets} carry no TMDB collection id — ` +
      'looking them up through a title you own.',
      'system'
    );
    try {
      // Same never-block-boot contract as every other loader here: one lookup
      // per collection is a lot of round trips, so cap the whole step rather
      // than let a slow server hold the store closed. Partial results are
      // fine — whatever resolved in time still gets its gaps.
      const recovered = await Promise.race([
        resolveCollectionTmdbIds(unresolved),
        new Promise<Map<string, number>>((resolve) =>
          setTimeout(() => resolve(new Map()), TIMEOUT_MS)
        ),
      ]);
      recovered.forEach((id, name) => collectionIds.set(name, id));
    } catch (e) {
      console.warn('[Jellyseerr] Collection id recovery failed:', e);
    }
  }

  if (collectionIds.size === 0) {
    logToConsole(
      `[System] Collections: ${stats.boxSets} found, none could be matched to a TMDB collection — ` +
      'no missing-entry cases possible.',
      'system'
    );
    return 0;
  }

  for (const [collectionName, tmdbCollectionId] of collectionIds) {
    if (!libraryByCollection.has(collectionName)) continue; // BoxSet with no synced members
    targets.push({
      collectionName,
      tmdbCollectionId,
      libraryName: libraryByCollection.get(collectionName),
      genres: [...(genresByCollection.get(collectionName) || [])],
    });
  }
  if (targets.length === 0) {
    logToConsole(
      `[System] Collections: ${collectionIds.size} matched collection(s), but none has a title ` +
      'on these shelves to hang its missing entries beside — no missing-entry cases possible.',
      'system'
    );
    return 0;
  }
  logToConsole(
    `[System] Collections: checking ${targets.length} of ${stats.boxSets} for missing entries.`,
    'system'
  );

  let gaps: Movie[] = [];
  try {
    const timeoutPromise = new Promise<Movie[]>((resolve) =>
      setTimeout(() => resolve([]), TIMEOUT_MS)
    );
    gaps = await Promise.race([fetchCollectionGaps(targets), timeoutPromise]);
  } catch (e) {
    console.warn('[Jellyseerr] Failed to load collection gaps:', e);
    return 0;
  }

  // Local ownership join before shelving: Jellyseerr already skipped entries
  // its own records call available, but a Jellyfin item scraped with no (or a
  // different) Tmdb provider id slips that check — and a "missing" case for a
  // film standing two slots over is the worst lie a shelf can tell. Same
  // title within a year counts as the same film; a conflicting year is a
  // genuinely different entry (collections hold same-named remakes) and keeps
  // its gap case.
  const ownedTmdbIds = new Set<number>();
  const ownedYearsByTitle = new Map<string, number[]>();
  for (const lib of libraries) {
    for (const m of lib.movies) {
      if (m.collectionGap || m.discovery || m.comingSoon || m.game) continue;
      if (typeof m.tmdbId === 'number') ownedTmdbIds.add(m.tmdbId);
      for (const key of titleMatchKeys(m.title)) {
        const years = ownedYearsByTitle.get(key);
        if (years) years.push(m.year);
        else ownedYearsByTitle.set(key, [m.year]);
      }
    }
  }
  let merged = 0;
  const skippedOwned: string[] = [];
  for (const gap of gaps) {
    const lib = libraries.find((l) => l.name === gap.libraryName) || libraries[0];
    if (!lib) continue;
    const years: number[] = [];
    for (const key of titleMatchKeys(gap.title)) {
      const ys = ownedYearsByTitle.get(key);
      if (ys) years.push(...ys);
    }
    if (
      (typeof gap.tmdbId === 'number' && ownedTmdbIds.has(gap.tmdbId)) ||
      years.some((y) => !(y > 0) || !(gap.year > 0) || Math.abs(y - gap.year) <= 1)
    ) {
      skippedOwned.push(`"${gap.title}" (${gap.year || '?'})`);
      continue;
    }
    lib.movies.push(gap);
    merged++;
  }
  if (skippedOwned.length > 0) {
    logToConsole(
      `[System] Collections: skipped ${skippedOwned.length} "missing" entr(ies) already on the shelf: ` +
      `${skippedOwned.join(', ')}.`,
      'system'
    );
  }
  // Collections to check but nothing missing in any of them is either a
  // complete library or a failed Jellyseerr lookup — the loaders swallow the
  // difference, so at least don't leave the shelf silently unchanged.
  if (merged === 0) {
    logToConsole(
      `[System] Collections: checked ${targets.length}, found nothing missing — ` +
      'either you own them complete, or Jellyseerr rejected the lookup (see its status line).',
      'system'
    );
  }
  return merged;
}

/**
 * Fetch the Romm video-game library for the T18 VIDEO GAMES section, same
 * never-block-boot treatment as the Jellyseerr loaders. No-op / [] when Romm
 * isn't configured, so an unconfigured store issues zero game requests. Also
 * a no-op — zero Romm requests, no game section — while the Video Games
 * feature itself is switched off (bb_games_enabled, default false): fetchGames()
 * would otherwise happily return demo titles even with no Romm server
 * configured, so the section has to be gated here rather than on config alone.
 */
async function loadGameMovies(): Promise<void> {
  // Like the Jellyseerr loader, always leave ONE console line saying where
  // the VIDEO GAMES department stands — an empty corner with no explanation
  // reads as a layout bug (feedback pin 010), not an integration state.
  if (!getSetting<boolean>('bb_games_enabled')) {
    gameMovies = [];
    logToConsole('[System] Video games: off — enable in Settings to build the department.', 'system');
    return;
  }
  // Games-only asks Romm for the WHOLE library rather than a 192-case slice —
  // measured at ~7k roms / ~45 MB of JSON on this store, which does not fit in
  // the department's 20s budget. The timeout is a never-block-boot guard, not a
  // performance target, so widen it in proportion instead of half-loading the
  // only catalog the store has.
  // Must exceed romm.ts's own per-request ceiling, or this race would fire
  // first and the per-request budget could never do its job — the whole
  // catalog would be discarded for one slow platform.
  const TIMEOUT_MS = isGamesOnly() ? 240_000 : 20_000;
  const TIMED_OUT = Symbol('romm-timeout');
  const timeoutPromise = new Promise<typeof TIMED_OUT>((resolve) =>
    setTimeout(() => resolve(TIMED_OUT), TIMEOUT_MS)
  );
  try {
    const result = await Promise.race([fetchGames(), timeoutPromise]);
    // On timeout, leave gameMovies as whatever it already held rather than
    // wiping a previously-successful fetch to [] — this matters on a settings
    // rebuild, where a hung refetch shouldn't blank out the games shelf.
    if (result === TIMED_OUT) {
      logToConsole(
        `[System] Video games: Romm timed out after ${TIMEOUT_MS / 1000}s — keeping ${gameMovies.length} loaded title(s).`,
        'system'
      );
    } else {
      gameMovies = result;
      // Games-only owns the whole floor plan, so an empty fetch is not a bare
      // corner — it's a store with nothing in it. storeCatalog() keeps the
      // movies up in that case; say so rather than leaving the user to wonder
      // why the toggle did nothing.
      logToConsole(
        gameMovies.length > 0
          ? `[System] Video games: ${gameMovies.length} title(s) from Romm${isGamesOnly() ? ' — GAMES ONLY: the whole store is the game store.' : '.'}`
          : isGamesOnly()
          ? '[System] Video games: GAMES ONLY is on but Romm returned no titles (check romm_url) — keeping the movie shelves.'
          : '[System] Video games: enabled, but Romm returned no titles (check romm_url and platform toggles) — no department built.',
        'system'
      );
    }
  } catch (e) {
    console.warn('[Romm] Failed to load games:', e);
    gameMovies = [];
    logToConsole('[System] Video games: Romm fetch failed — no department built (see browser console).', 'system');
  }
}

/**
 * Consolidated UI state — replaces the scattered individual booleans.
 */
const ui = {
  isPowerMenuOpen: false,
  isSettingsDrawerOpen: false,
  isLoginOpen: false,
  isExitConfirmOpen: false,
  isPlaybackActive: false,
  isScreensaverActive: false,
  isVersionPickerOpen: false,
  isSearchOpen: false,
  isCandyCheckoutOpen: false,
  isFeedbackOpen: false,
  // The clerk's terminal at the checkout counter, showing the same options as
  // the power menu but drawn on the desk CRT (see openCounterTerminal). Not an
  // overlay — it's in-scene — but it owns the arrow keys while docked, so it
  // joins isAnyOverlayOpen to keep shelf navigation from running underneath.
  isCounterTerminalOpen: false,

  /** True if any overlay is blocking main navigation */
  get isAnyOverlayOpen(): boolean {
    return this.isPowerMenuOpen || this.isSettingsDrawerOpen || this.isLoginOpen || this.isExitConfirmOpen
      || this.isVersionPickerOpen || this.isSearchOpen || this.isCandyCheckoutOpen
      || this.isFeedbackOpen || this.isCounterTerminalOpen || isMembershipPickerOpen();
  }
};

let powerMenuIndex = 0;
// The demo has no Jellyfin session to log out of and no app window to close —
// those rows leave the keyboard-nav ring too (their DOM is hidden in main()).
const powerButtons = ['btn-settings', 'btn-flat-mode', 'btn-suspend', 'btn-cec-toggle', 'btn-logout', 'btn-exit', 'btn-cancel']
  .filter((id) => !(isDemoMode && (id === 'btn-logout' || id === 'btn-exit')));

// The single CEC row toggles the display: we track the last state WE commanded
// (there's no CEC status read-back) and alternate standby/wake. If reality
// drifts (someone used the TV remote), one extra press resyncs — both CEC
// commands are idempotent no-ops when the display is already in that state.
let cecDisplayAssumedOn = true;

// The counter CRT carries one extra row the glass power menu doesn't:
// MANAGER OVERRIDE, the diegetic (and only couch-reachable) entry into the
// SERVICE MODE settings page (review §4.3). Inserted just above RETURN TO
// STORE so the safe exit stays last.
const counterTerminalButtons = (() => {
  const ids = [...powerButtons];
  ids.splice(ids.indexOf('btn-cancel'), 0, 'btn-service');
  return ids;
})();

// Settings drawer navigation state. `settingsRowKeys` is the flat top-to-bottom
// order of focusable rows generated from the registry, with the sentinel
// '__close__' appended for the Apply & Close button. Rebuild/reload intents
// accumulate as look/performance settings change and fire once on close.
let settingsRowKeys: string[] = [];
let settingsIndex = 0;
let settingsPendingRebuild = false;
let settingsPendingReload = false;
// Set alongside settingsPendingRebuild when a bb_platform_* toggle changes —
// those are the only rebuild-triggering settings that affect what fetchGames()
// returns (platform filtering happens at request time, see romm.ts), so a
// rebuild only needs to refetch the Romm catalog when this is set. Every other
// rebuild-scene setting (theme/arrangement/medium/...) reuses the in-memory
// gameMovies list instead of paying a network round trip to redraw the wall.
let settingsPendingGameRefetch = false;
// Connection edits made in the drawer: a new Jellyfin password typed there is
// held here (never persisted — checkCredentialsAndLoad purges any plaintext
// password at boot) and exchanged for a fresh token on drawer close; a
// server/username change committed WITHOUT a new password sets the reset flag
// so the stale token is dropped and boot goes straight to the login/cards
// picker instead of retry-looping against the new server.
let settingsPendingJellyfinPassword: string | null = null;
let settingsPendingAuthReset = false;

let exitConfirmIndex = 1; // Default to "No, Return"
const exitButtons = ['btn-confirm-exit', 'btn-confirm-cancel'];

// Aisle indicator interval (tracked so it can be cleared on scene rebuild)
let aisleIndicatorInterval: number | null = null;

// Candy checkout state (T19). Focus index walks [candy rows..., Order btn,
// Skip btn] as one flat list, matching the settings drawer's single-column
// nav rather than adding a second axis just for two buttons.
const CANDY_ZIP_KEY = 'candy_delivery_zip';
let candyCheckoutRows: CandyRow[] = [];
let candyCheckoutSelected: Set<string> = new Set();
let candyCheckoutIndex = 0;
let candyCheckoutOnDone: (() => void) | null = null;

// Search state — the terminal lives on the clerk's monitor (see entrance.ts /
// StoreScene.setTerminalText), so the query itself is tracked here rather
// than read out of a DOM <input>.
let searchQuery = '';
let searchResults: Movie[] = [];
let searchResultIndex = 0;

// ─── UI Helpers ───────────────────────────────────────────────────────────────

const MAX_LOG_ENTRIES = 200;

// Ring buffer of recent log lines, attached to F8 feedback pins (saved as
// log.txt next to the pin) so playback narration reaches disk even when the
// on-screen log is hidden behind the video overlay.
const recentLogLines: string[] = [];

function logToConsole(message: string, type: 'system' | 'cec' | 'video' = 'system') {
  const container = document.getElementById('console-logs-container');
  const bootContainer = document.getElementById('boot-console-logs-container');

  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];
  const formattedText = `[${timeStr}] ${message}`;

  console.log(`[UI Log] ${formattedText}`);
  recentLogLines.push(formattedText);
  if (recentLogLines.length > MAX_LOG_ENTRIES) recentLogLines.shift();

  if (container) {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerText = formattedText;
    container.appendChild(entry);
    while (container.childNodes.length > MAX_LOG_ENTRIES) {
      container.removeChild(container.firstChild!);
    }
    container.scrollTop = container.scrollHeight;
  }

  if (bootContainer) {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerText = formattedText;
    bootContainer.appendChild(entry);
    while (bootContainer.childNodes.length > MAX_LOG_ENTRIES) {
      bootContainer.removeChild(bootContainer.firstChild!);
    }
    bootContainer.scrollTop = bootContainer.scrollHeight;
  }
}

// Global error listener to dump frontend crashes to terminal
window.addEventListener('error', (e) => {
  console.error(`[Frontend Crash] ${e.message} at ${e.filename}:${e.lineno}:${e.colno}`);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error(`[Frontend Unhandled Rejection] ${e.reason?.message || e.reason}`);
});

function updateMovieHUD(movie: Movie | null) {
  if (!movie) return;

  const isInspecting = storeScene && storeScene.mode === 'inspect';
  const isRequestedDiscovery = (movie.discovery || movie.collectionGap) &&
    (movie.discoveryRequested || isDiscoveryRequested(movie.tmdbId));

  // Update the floating bottom hint with movie-specific detail (e.g. "coming
  // soon" titles can't be played yet, so their hint differs from a normal one).
  // Remote-truthful copy (review §4.5): the couch remote has arrows, OK and
  // BACK only — never advertise letter keys, clicks, or hold gestures here.
  const hint = document.getElementById('browse-hint');
  if (hint) {
    if (isInspecting) {
      if (movie.game) {
        hint.textContent = 'FLIP CASE  •  OK TO RENT & PLAY THIS GAME';
      } else if (movie.discovery) {
        hint.textContent = isRequestedDiscovery
          ? 'FLIP CASE  •  ALREADY REQUESTED'
          : 'FLIP CASE  •  NOT IN STOCK — OK TO ORDER IT OR PASS';
      } else if (movie.collectionGap) {
        hint.textContent = isRequestedDiscovery
          ? 'FLIP CASE  •  ON ORDER — COMING SOON'
          : 'FLIP CASE  •  NOT IN STOCK — OK TO ORDER IT OR PASS';
      } else {
        hint.textContent = movie.comingSoon
          ? 'FLIP CASE  •  COMING SOON — NOT YET AVAILABLE'
          : 'FLIP CASE  •  OK TO PLAY  •  PICK A NAME ON THE BACK';
      }
    } else {
      hint.textContent = 'OK TO EXAMINE  •  BACK OUT  •  OPTIONS AT THE COUNTER';
    }
  }
}

/**
 * Sets the single-line, low-opacity floating hint shown near the bottom of
 * the screen. Only the hints that are actually valid in the given mode are
 * shown — no persistent full-width tips bar. Visibility (fade in/out) is
 * handled separately by updateBrowseHUDVisibility(), which runs continuously
 * so the hint (and the locator above it) disappear smoothly behind menus,
 * search, video playback, etc.
 */
function updateHUDForMode(mode: string) {
  const hint = document.getElementById('browse-hint');
  if (!hint) return;

  // Remote-truthful copy (review §4.5): arrows/OK/BACK vocabulary only. The
  // checkout path advertised is the one a momentary remote can actually
  // drive — BACK up to the shelf cursors, point at CHECKOUT, OK. Keyboards
  // quietly keep their extras (HOLD ENTER, C, R, X, /) unadvertised.
  let text = '';
  switch (mode) {
    case 'library-select':
      text = 'OK TO BROWSE THIS SECTION  •  BACK TO EXIT';
      break;
    case 'overview':
      text = 'ARROWS TO LOOK  •  OK TO FLY TO A SHELF  •  BACK FOR SECTIONS';
      break;
    case 'genre-select':
      // Genre picker is its own full overlay with its own chrome.
      text = '';
      break;
    case 'browse':
      // T22: with a tape in hand, surface the route to the counter.
      text = storeScene?.canHoldToCheckout()
        ? 'OK TO EXAMINE  •  CHECK OUT: BACK, THEN THE COUNTER'
        : 'OK TO EXAMINE  •  BACK OUT  •  OPTIONS AT THE COUNTER';
      break;
    case 'inspect':
      // T22: with carry mode on, the confirm takes the tape instead of playing.
      text = storeScene?.carryMode
        ? (storeScene.canHoldToCheckout()
          ? 'OK TO TAKE IT  •  CHECK OUT: BACK, THEN THE COUNTER'
          : 'OK TO TAKE IT  •  BACK TO THE SHELF')
        : 'OK TO PLAY  •  BACK TO THE SHELF  •  PICK A NAME ON THE BACK';
      break;
    case 'checkout':
      text = 'OK TO CHECK OUT  •  BACK TO KEEP BROWSING';
      break;
    case 'backroom':
      // T23: home with the rentals. Arrows pick a tape, OK reads/plays it,
      // BACK tries the door (locked until the due-back time).
      text = 'ARROWS PICK A TAPE  •  OK TO READ OR PLAY  •  BACK FOR THE DOOR';
      break;
    case 'person-endcap':
      text = 'OK TO GO TO THE MOVIE  •  BACK TO RETURN';
      break;
    case 'walk-around':
      // Desktop-only surface (walk mode needs a keyboard to enter at all) —
      // the one hint that may keep its desktop vocabulary.
      text = 'WASD TO WALK  •  MOUSE / ARROWS TO LOOK  •  F TO EXIT WALK MODE';
      break;
    default:
      text = '';
  }
  hint.textContent = text;
}

/**
 * Runs continuously (see aisleIndicatorInterval) to fade the floating browse
 * locator + hint in/out based on whatever's currently on top — any modal
 * overlay, video playback, the screensaver, or the genre-select overlay
 * (which isn't tracked by `ui.*` since it's driven entirely by scene.mode).
 * Also keeps the locator's section/aisle name fresh, since library/aisle
 * changes while browsing don't otherwise push an update (only library-select
 * does, via onLibrarySelectUpdate).
 */
// Cached refs + last-written state for updateBrowseHUDVisibility: the 200 ms
// poll runs for the life of the scene (including days of deep idle), so each
// tick must cost ~nothing when nothing changed — no element lookups, and no
// classList/textContent writes that dirty style/layout with the same values.
// The elements are static in index.html and never rebuilt, so caching is safe.
let browseHudVisible: boolean | null = null;
let browseHudName: string | null = null;

function updateBrowseHUDVisibility() {
  refreshHoldCheckoutHint(); // piggyback on the same 200ms poll (cheap when unchanged)
  const locator = document.getElementById('browse-locator');
  const hint = document.getElementById('browse-hint');
  if (!storeScene || !locator || !hint) return;

  const suppressed = ui.isAnyOverlayOpen || ui.isPlaybackActive || ui.isScreensaverActive
    || storeScene.mode === 'genre-select'
    // The sub-nav jump index (▼ at the bottom shelf row) owns the bottom of
    // the screen and the arrow keys while it's up — same treatment as any
    // other overlay, but it's scene-driven so `ui.*` doesn't track it.
    || storeScene.isSubNavOpen();

  if (suppressed) {
    if (browseHudVisible !== false) {
      browseHudVisible = false;
      locator.classList.remove('visible');
      hint.classList.remove('visible');
    }
    return;
  }

  if (browseHudVisible !== true) {
    browseHudVisible = true;
    locator.classList.add('visible');
    hint.classList.add('visible');
  }

  const name = storeScene.getActiveAisleName();
  if (name !== browseHudName) {
    browseHudName = name;
    const nameEl = document.getElementById('browse-locator-name');
    if (nameEl) nameEl.textContent = name;
  }
}

// ─── Action prompt pills (live in hold-hints.ts) ─────────────────────────────
// Two extra actions advertise themselves while they're available: checking
// out with a tape in hand (T22), and crossing off a not-in-stock case ("not
// interested"). The pill copy names the remote path (review §4.5 — momentary
// buttons can't hold); the keyboard/gamepad HOLD ENTER / HOLD ▼ gestures keep
// working and the fill bars still double as their live hold-progress meters.

/** True when nothing modal/immersive should be eating the hold shortcuts. */
function holdHintsAllowed(): boolean {
  return !!storeScene && !storeScene.isWalkAroundMode
    && !ui.isAnyOverlayOpen && !ui.isPlaybackActive && !ui.isScreensaverActive;
}

/** Show/hide the pills; cheap no-op when nothing changed (called from the HUD poll). */
function refreshHoldCheckoutHint() {
  const allowed = holdHintsAllowed();
  refreshHoldHints({
    checkout: allowed && !!storeScene?.canHoldToCheckout(),
    dismiss: allowed && !!storeScene?.canDismissSelected(),
  });
}

/** Briefly flashes/bounces a locator arrow as feedback for a left/right key press. */
function flashLocatorArrow(direction: 'left' | 'right') {
  const el = document.getElementById(`browse-locator-arrow-${direction}`);
  if (!el || el.classList.contains('hidden')) return;
  el.classList.remove('flash');
  // Force reflow so re-adding the class restarts the animation.
  void (el as HTMLElement).offsetWidth;
  el.classList.add('flash');
}

// ─── Power Menu ───────────────────────────────────────────────────────────────

function setPowerMenuSelection(index: number) {
  powerMenuIndex = index;
  powerButtons.forEach((id, idx) => {
    const btn = document.getElementById(id);
    if (btn) {
      if (idx === index) {
        btn.classList.add('selected');
        btn.focus();
      } else {
        btn.classList.remove('selected');
      }
    }
  });
}

function openPowerMenu() {
  if (ui.isExitConfirmOpen) closeExitConfirm();
  ui.isPowerMenuOpen = true;
  document.getElementById('power-menu-overlay')!.classList.add('visible');
  setPowerMenuSelection(0);
  logToConsole('[Power] Opened System Control menu.', 'system');
}

function closePowerMenu() {
  ui.isPowerMenuOpen = false;
  document.getElementById('power-menu-overlay')!.classList.remove('visible');
  logToConsole('[Power] Closed System Control menu.', 'system');
}

// ─── Counter terminal (diegetic power menu) ──────────────────────────────────
//
// The same actions as the power menu above, drawn on the clerk's desk CRT
// instead of a glass overlay: press Left at the checkout counter and the camera
// docks to the terminal (reusing the diegetic-search dock, see
// StoreScene.enterSearchMode) with the options rendered in amber phosphor.
//
// Rows are the SAME `powerButtons` ids the overlay uses (plus the CRT-only
// MANAGER OVERRIDE row — see counterTerminalButtons) and dispatch through
// the same executePowerMenuAction(), so the two views can never drift out of
// sync — including the demo-mode filter that drops logout/exit. Only the labels
// differ: the CRT is 40 columns wide, so they're shortened here.
// Row text lives in src/counter-terminal.ts so the 3D harness (which boots
// StoreScene without this DOM shell) renders the identical menu.
let counterTerminalIndex = 0;

function renderCounterTerminal() {
  const { lines, cursorLine } = counterTerminalLines(counterTerminalButtons, counterTerminalIndex);
  storeScene?.setTerminalText(lines, cursorLine);
}

function openCounterTerminal() {
  if (!storeScene || ui.isAnyOverlayOpen) return;
  ui.isCounterTerminalOpen = true;
  counterTerminalIndex = 0;
  storeScene.enterSearchMode(); // camera dock only — the text is ours
  renderCounterTerminal();
  logToConsole('[Terminal] Manager terminal open at the counter.', 'system');
}

function closeCounterTerminal() {
  if (!ui.isCounterTerminalOpen) return;
  ui.isCounterTerminalOpen = false;
  // Hands the camera back and resets the CRT to its idle rental screen.
  storeScene?.exitSearchMode();
  logToConsole('[Terminal] Manager terminal closed.', 'system');
}

function stepCounterTerminal(delta: number) {
  const n = counterTerminalButtons.length;
  counterTerminalIndex = (counterTerminalIndex + delta + n) % n;
  retailAudio.playKeyClick();
  renderCounterTerminal();
}

async function activateCounterTerminal() {
  const btnId = counterTerminalButtons[counterTerminalIndex];
  // Close first: several actions (settings drawer, logout) take over the
  // screen, and the docked camera must be handed back before they do.
  closeCounterTerminal();
  await executePowerMenuAction(btnId);
}

// ─── Settings Drawer ───────────────────────────────────────────────────────
//
// A single schema-driven drawer generated from the settings registry
// (src/settings.ts), replacing the old per-option overlays that each called
// location.reload(). Changes accumulate while the drawer is open: 'live'
// settings apply instantly, while 'rebuild-scene' and 'reload' settings just
// persist and flag their intent, so an entire drawer session collapses into at
// most one scene rebuild (no page reload) or one reload — never one per toggle.

const SETTINGS_CLOSE_KEY = '__close__';
const SWITCH_MEMBER_KEY = '__switch_member__';
const SETTINGS_BACK_KEY = '__back__';
const SETTINGS_GROUP_PREFIX = '__group__:';
const SETTINGS_SUBPAGE_PREFIX = '__subpage__:';

// The drawer is paginated: a category index page (settingsPage === null) with
// one row per settings group, and one sub-page per group. Keeping each area
// (store layout vs. game platforms vs. connection...) on its own page stops
// the drawer from being a single overwhelming scroll of every setting.
// 'Service' is the staff-only page listing every `hidden:true` registration —
// it has no row on the index and is reached only through the counter CRT's
// MANAGER OVERRIDE row (review §4.3). Groups can also nest one level of
// sub-pages (settingsSubpage, e.g. Video Games → Platforms).
let settingsPage: SettingGroup | 'Service' | null = null;
let settingsSubpage: string | null = null;

/** One-line blurbs under each category row on the index page. */
const GROUP_HINTS: Record<SettingGroup, string> = {
  'Store Look': 'Theme, shelf arrangement, and store layout.',
  'Store Brand': 'Design your own video-store logo and signage.',
  'Playback': 'Audio language, captions, and candy delivery.',
  'Video Games': 'Enable the game section and pick platforms.',
  'Performance': 'Graphics quality, render mode, FPS cap and counter.',
  'Connection': 'Jellyfin, Jellyseerr and Romm servers.',
};

/** One-line blurbs under each sub-page's "›" row on its group page. */
const SUBPAGE_HINTS: Record<string, string> = {
  'Building & Storefront': 'Ceiling, corner step, walls, bulbs, storefront style.',
  'Platforms': 'Which consoles get a section on the Video Games shelf.',
};

/** Build the drawer DOM for the current page. Rows are updated in place. */
function generateSettingsDrawer() {
  const groupsEl = document.getElementById('settings-groups');
  if (!groupsEl) return;
  groupsEl.innerHTML = '';
  settingsRowKeys = [];

  const titleEl = document.querySelector('#settings-drawer-overlay .settings-title');
  if (titleEl) {
    titleEl.textContent =
      settingsPage === 'Service' ? 'SERVICE MODE — STAFF ONLY'
        : settingsSubpage ? settingsSubpage.toUpperCase()
          : settingsPage ? settingsPage.toUpperCase()
            : 'STORE SETTINGS';
  }

  const makeRow = (key: string, label: string, hint: string | undefined, value: string, valueId?: string) => {
    const row = document.createElement('button');
    row.className = 'settings-row';
    row.id = `setting-row-${key}`;
    row.type = 'button';
    // Hints render as ONE line in the gold footer bar for the selected row
    // only (updateSettingsCrtChrome) — never as a paragraph inside the row.
    if (hint) row.dataset.hint = hint;
    row.innerHTML = `
      <span class="settings-row-main">
        <span class="settings-row-label">${label}</span>
      </span>
      <span class="settings-row-leader" aria-hidden="true"></span>
      <span class="settings-row-value"${valueId ? ` id="${valueId}"` : ''}>${value}</span>
    `;
    // W3 option thumbnails: rows for visual settings show a pre-grabbed
    // snapshot of the CURRENT value beside the value label (lazy-loaded;
    // missing PNG = the img hides itself). Swapped by refreshSettingThumb.
    const thumbEl = createSettingThumb(key);
    if (thumbEl) row.insertBefore(thumbEl, row.querySelector('.settings-row-value'));
    const rowIndex = settingsRowKeys.length;
    row.addEventListener('click', () => {
      setSettingsSelection(rowIndex);
      activateSetting(key, 1);
    });
    row.addEventListener('pointerenter', () => setSettingsSelection(rowIndex));
    settingsRowKeys.push(key);
    return row;
  };

  // Text/secret settings (the Connection group) render an actual <input>
  // instead of a cycling value span. Commits happen on the input's 'change'
  // event — i.e. blur or Enter, never per keystroke — so editing a URL doesn't
  // queue a reload on every character.
  const makeTextRow = (def: SettingDef) => {
    const row = document.createElement('div');
    row.className = 'settings-row settings-text-row';
    row.id = `setting-row-${def.key}`;
    row.tabIndex = -1; // focusable by setSettingsSelection, not in tab order
    if (def.hint) row.dataset.hint = def.hint; // footer-bar hint, see makeRow
    const main = document.createElement('span');
    main.className = 'settings-row-main';
    main.innerHTML = `
      <span class="settings-row-label">${def.label}</span>
    `;
    const input = document.createElement('input');
    input.type = def.kind === 'secret' ? 'password' : 'text';
    input.className = 'settings-row-input';
    input.id = `setting-input-${def.key}`;
    input.autocomplete = 'off';
    input.spellcheck = false;
    // jellyfin_password is never persisted, so its input always starts blank.
    let committed = getSetting<string>(def.key) || '';
    input.value = committed;
    input.placeholder = def.kind === 'secret' ? '••••••••' : '(not set)';
    input.addEventListener('change', () => {
      committed = input.value.trim();
      input.value = committed;
      commitTextSetting(def.key, committed);
    });
    input.addEventListener('keydown', (e) => {
      // InputManager ignores all keys while an input has focus, so edit-mode
      // exits are handled here: Enter commits (via the change event), Escape
      // reverts; both hand focus back to the row so remote nav resumes.
      // stopPropagation, or the same keystroke reaches InputManager's window
      // listener AFTER focus moved back to the row and re-enters edit mode.
      if (e.key === 'Escape') input.value = committed;
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        input.blur();
        row.focus();
      }
    });
    const rowIndex = settingsRowKeys.length;
    row.addEventListener('pointerenter', () => setSettingsSelection(rowIndex));
    row.addEventListener('click', () => {
      setSettingsSelection(rowIndex);
      input.focus();
    });
    row.appendChild(main);
    row.appendChild(input);
    settingsRowKeys.push(def.key);
    return row;
  };

  if (settingsPage === null) {
    // Category index page: one row per group.
    const groupEl = document.createElement('div');
    groupEl.className = 'settings-group';
    for (const group of visibleGroups()) {
      groupEl.appendChild(makeRow(SETTINGS_GROUP_PREFIX + group, group, GROUP_HINTS[group], '›'));
    }
    groupsEl.appendChild(groupEl);

    // Account (T17): not a settings-registry entry -- switching who's logged
    // in isn't a persisted "value," it tears down the session and re-shows the
    // membership card picker. Only worth showing once we actually have a
    // server URL to fetch cards from.
    if (localStorage.getItem('jellyfin_url')) {
      const accountGroupEl = document.createElement('div');
      accountGroupEl.className = 'settings-group';
      const accountTitleEl = document.createElement('div');
      accountTitleEl.className = 'settings-group-title';
      accountTitleEl.textContent = 'Account';
      accountGroupEl.appendChild(accountTitleEl);
      accountGroupEl.appendChild(
        makeRow(SWITCH_MEMBER_KEY, 'Switch Member', 'Return to the membership card picker.', '')
      );
      groupsEl.appendChild(accountGroupEl);
    }

    // Advanced (UX pass 2026-08): SERVICE MODE used to be reachable only via
    // the counter CRT's MANAGER OVERRIDE row — a door nothing on screen ever
    // advertised. The CRT entry stays the diegetic path; this row is its
    // findable twin on the couch tree.
    const serviceGroupEl = document.createElement('div');
    serviceGroupEl.className = 'settings-group';
    const serviceTitleEl = document.createElement('div');
    serviceTitleEl.className = 'settings-group-title';
    serviceTitleEl.textContent = 'Advanced';
    serviceGroupEl.appendChild(serviceTitleEl);
    serviceGroupEl.appendChild(makeRow(
      SETTINGS_GROUP_PREFIX + 'Service', 'Service Mode (Manager Override)',
      'Staff overrides and diagnostics — also on the counter CRT.', '›'));
    groupsEl.appendChild(serviceGroupEl);
  } else {
    // One group's settings (or a sub-page / the service page), headed by a
    // Back row.
    const groupEl = document.createElement('div');
    groupEl.className = 'settings-group';
    groupEl.appendChild(makeRow(SETTINGS_BACK_KEY, '‹ Back', 'Return to all settings.', ''));
    const appendDefRow = (def: SettingDef) => {
      if (def.kind === 'text' || def.kind === 'secret') {
        groupEl.appendChild(makeTextRow(def));
      } else {
        groupEl.appendChild(makeRow(def.key, def.label, def.hint, '', `setting-value-${def.key}`));
      }
    };
    if (settingsPage === 'Store Brand') {
      // Custom LogoSpec editor page (live preview, presets, pickers/sliders) —
      // built by settings.ts; its rows join settingsRowKeys / the selection
      // flow here, and activateSetting() delegates back via activateBrandRow.
      buildStoreBrandPanel(groupEl, {
        onDirty: () => {
          settingsPendingRebuild = true;
          updateSettingsStatus();
        },
        // W3 custom-wrap uploads change box-panel art cached on shared +
        // per-title materials a no-reload rebuild preserves — full reload,
        // same as the bb_cover_* rows.
        onNeedsReload: () => {
          settingsPendingReload = true;
          updateSettingsStatus();
        },
        registerRow: (key) => {
          settingsRowKeys.push(key);
          return settingsRowKeys.length - 1;
        },
        selectRow: (idx) => setSettingsSelection(idx),
      });
    } else if (settingsPage === 'Service') {
      // SERVICE MODE — STAFF ONLY: every `hidden:true` registration, exactly
      // the knobs kept off the couch tree. Only reachable via the counter
      // CRT's MANAGER OVERRIDE row, never from the index page.
      for (const def of serviceSettings()) appendDefRow(def);
    } else if (settingsSubpage !== null) {
      for (const def of settingsInSubpage(settingsPage, settingsSubpage)) appendDefRow(def);
    } else {
      // Group page: plain rows in registration order, with each sub-page
      // collapsed into a single "<name> ›" row at its first member's slot.
      const subpagesSeen = new Set<string>();
      for (const def of allSettings()) {
        if (def.group !== settingsPage || def.hidden) continue;
        if (def.visibleWhen && !def.visibleWhen()) continue;
        if (def.subpage) {
          if (!subpagesSeen.has(def.subpage)) {
            subpagesSeen.add(def.subpage);
            groupEl.appendChild(makeRow(
              SETTINGS_SUBPAGE_PREFIX + def.subpage, def.subpage,
              SUBPAGE_HINTS[def.subpage], '›'));
          }
          continue;
        }
        appendDefRow(def);
      }
    }
    groupsEl.appendChild(groupEl);
  }

  settingsRowKeys.push(SETTINGS_CLOSE_KEY);
  const closeBtn = document.getElementById('btn-settings-close');
  if (closeBtn) {
    // Property assignment (not addEventListener): the drawer regenerates on
    // every page change and the fixed close button must not stack listeners.
    const closeIndex = settingsRowKeys.length - 1;
    closeBtn.dataset.hint = 'Save your choices and return to the store.';
    closeBtn.onclick = () => closeSettingsDrawer();
    closeBtn.onpointerenter = () => setSettingsSelection(closeIndex);
  }
}

// ─── Drawer CRT chrome: paging + footer bar (review §4.4) ────────────────────
//
// The CRT page never scrolls: rows show in fixed pages of 8 and the gold
// footer bar carries "PAGE n/m" plus the SELECTED row's hint as one line.
// Purely presentational — selection still wraps through every row in order
// (Up/Down), and the visible page simply follows the selection.

const SETTINGS_PAGE_SIZE = 8;
let settingsCrtPage = 0;

function settingsRowEl(index: number): HTMLElement | null {
  const key = settingsRowKeys[index];
  if (key === undefined) return null;
  return document.getElementById(key === SETTINGS_CLOSE_KEY ? 'btn-settings-close' : `setting-row-${key}`);
}

function updateSettingsCrtChrome() {
  // The close button is pinned below the row area and never pages out. The
  // Store Brand page runs shorter pages: its live preview canvas (always
  // visible, not a focus row) takes the top half of the body.
  const pageSize = settingsPage === 'Store Brand' ? 5 : SETTINGS_PAGE_SIZE;
  const pageable = settingsRowKeys.length - 1;
  const pages = Math.max(1, Math.ceil(pageable / pageSize));
  if (settingsIndex < pageable) settingsCrtPage = Math.floor(settingsIndex / pageSize);
  settingsCrtPage = Math.min(settingsCrtPage, pages - 1);
  const rowPage = new Map<HTMLElement, number>();
  for (let i = 0; i < pageable; i++) {
    const el = settingsRowEl(i);
    if (!el) continue;
    const page = Math.floor(i / pageSize);
    rowPage.set(el, page);
    el.classList.toggle('crt-page-hidden', page !== settingsCrtPage);
  }

  // Non-row furniture (group titles, the custom-wrap spec paragraph) follows
  // the page of the first focusable row BELOW it, so headings never orphan
  // onto the wrong page. The brand preview row stays pinned on every page.
  const groupsEl = document.getElementById('settings-groups');
  if (groupsEl) {
    const items = Array.from(groupsEl.querySelectorAll<HTMLElement>('.settings-group > *'));
    let nextPage = pages - 1;
    for (let i = items.length - 1; i >= 0; i--) {
      const el = items[i];
      if (rowPage.has(el)) {
        nextPage = rowPage.get(el)!;
        continue;
      }
      if (el.classList.contains('settings-brand-preview')) continue;
      el.classList.toggle('crt-page-hidden', nextPage !== settingsCrtPage);
    }
  }

  const pageEl = document.getElementById('settings-footer-page');
  if (pageEl) {
    pageEl.textContent = pages > 1
      ? `PAGE ${settingsCrtPage + 1}/${pages} ${settingsCrtPage > 0 ? '▲' : ''}${settingsCrtPage < pages - 1 ? '▼' : ''}`.trimEnd()
      : '';
  }

  const hintEl = document.getElementById('settings-footer-hint');
  if (hintEl) {
    const row = settingsRowEl(settingsIndex);
    // makeRow/makeTextRow put hints on dataset; the Store Brand rows built in
    // settings.ts still embed a (CSS-hidden) .settings-row-hint span instead.
    let hint = (row?.dataset.hint || row?.querySelector('.settings-row-hint')?.textContent || '').trim();
    if (hint.length > 62) hint = hint.slice(0, 59).trimEnd() + '…';
    hintEl.textContent = hint || 'UP/DOWN SELECT • LEFT/RIGHT CHANGE • BACK RETURNS';
  }
}

/** Refresh every row's displayed value from the registry / live scene state. */
function refreshSettingsValues() {
  // Mirror live scene state back into the registry so the rows show reality
  // (e.g. the outside mode randomized at boot) rather than stale defaults.
  if (storeScene) {
    setSetting('bb_outside', storeScene.getOutsideMode());
  }
  // No hidden-flag skip here: hidden defs render on the SERVICE MODE page,
  // and rows that aren't on the current page simply have no element to update.
  for (const def of allSettings()) {
    const el = document.getElementById(`setting-value-${def.key}`);
    if (el) el.textContent = currentValueLabel(def.key);
    refreshSettingThumb(def.key);
  }
}

function setSettingsSelection(index: number) {
  settingsIndex = index;
  // Flip to the page holding the selection FIRST (focus() below is a no-op on
  // a row that's still display:none on a paged-out page), then refresh the
  // footer-bar hint for the newly selected row.
  updateSettingsCrtChrome();
  settingsRowKeys.forEach((key, idx) => {
    const id = key === SETTINGS_CLOSE_KEY ? 'btn-settings-close' : `setting-row-${key}`;
    const el = document.getElementById(id);
    if (!el) return;
    if (idx === index) {
      el.classList.add('selected');
      el.focus();
    } else {
      el.classList.remove('selected');
    }
  });
}

/** Apply a change to one setting. `dir` is +1 (next) or -1 (previous). */
function activateSetting(key: string, dir: number) {
  if (key === SETTINGS_CLOSE_KEY) {
    closeSettingsDrawer();
    return;
  }
  if (key === SETTINGS_BACK_KEY) {
    if (settingsSubpage !== null) {
      // Back off a sub-page: return to its group page, on the sub-page's row.
      const fromSub = settingsSubpage;
      settingsSubpage = null;
      generateSettingsDrawer();
      refreshSettingsValues();
      const idx = settingsRowKeys.indexOf(SETTINGS_SUBPAGE_PREFIX + fromSub);
      setSettingsSelection(Math.max(0, idx));
      return;
    }
    const fromPage = settingsPage;
    settingsPage = null;
    generateSettingsDrawer();
    refreshSettingsValues();
    // Land back on the category row we came from (Service has no index row —
    // indexOf misses and the selection safely lands on the first row).
    const idx = settingsRowKeys.indexOf(SETTINGS_GROUP_PREFIX + fromPage);
    setSettingsSelection(Math.max(0, idx));
    return;
  }
  if (key.startsWith(SETTINGS_GROUP_PREFIX)) {
    if (dir < 0) return; // Left on a category row shouldn't open its page
    settingsPage = key.slice(SETTINGS_GROUP_PREFIX.length) as SettingGroup;
    settingsSubpage = null;
    generateSettingsDrawer();
    refreshSettingsValues();
    // Row 0 is Back; land on the first actual setting.
    setSettingsSelection(settingsRowKeys.length > 2 ? 1 : 0);
    return;
  }
  if (key.startsWith(SETTINGS_SUBPAGE_PREFIX)) {
    if (dir < 0) return; // Left on a sub-page row shouldn't open it
    settingsSubpage = key.slice(SETTINGS_SUBPAGE_PREFIX.length);
    generateSettingsDrawer();
    refreshSettingsValues();
    setSettingsSelection(settingsRowKeys.length > 2 ? 1 : 0);
    return;
  }
  if (key === SWITCH_MEMBER_KEY) {
    closeSettingsDrawer();
    switchMember();
    return;
  }
  if (key.startsWith(BRAND_ROW_PREFIX)) {
    // Store Brand rows carry their own controls; settings.ts routes dir.
    activateBrandRow(key, dir);
    return;
  }
  const def = allSettings().find((d) => d.key === key);
  if (!def) return;

  if (def.kind === 'toggle') {
    setSetting(key, !getSetting<boolean>(key));
  } else if (def.kind === 'cycle') {
    // nextCycleValue wraps forward; for a backward step, walk to the entry
    // before the current one.
    if (dir < 0 && def.values && def.values.length > 0) {
      const cur = String(getSetting(key));
      const i = def.values.findIndex((v) => v.id === cur);
      const prev = def.values[(i - 1 + def.values.length) % def.values.length];
      setSetting(key, prev.id);
    } else {
      setSetting(key, nextCycleValue(key));
    }
  } else {
    // text/secret: activation just moves focus into the row's input; the
    // commit happens on the input's change event (see commitTextSetting).
    document.getElementById(`setting-input-${key}`)?.focus();
    return;
  }

  if (key === 'bb_theme') {
    applyThemeCssVars(getActiveTheme());
  }

  // Route the change by apply mode.
  if (def.applyMode === 'live' && def.apply && storeScene) {
    def.apply(getSetting(def.key), storeScene);
    // Render-on-demand (issue #24): a live settings tweak changes the picture but
    // doesn't move the camera, so wake the throttled renderer explicitly.
    storeScene.requestRender();
  } else if (def.applyMode === 'rebuild-scene') {
    settingsPendingRebuild = true;
    // Arrangement changes must be marked as an explicit user choice, or the
    // next boot resets bb_arrangement to herringbone (see initializeStoreScene).
    if (key === 'bb_arrangement') localStorage.setItem('bb_arrangement_user', '1');
    // Platform toggles change what fetchGames() returns, so the rebuild needs
    // a fresh Romm fetch; every other rebuild-scene setting can reuse gameMovies.
    // GAMES ONLY changes it the most of all — it swaps a 192-case budgeted
    // slice for the entire Romm library (and back) — so it refetches too.
    if (key.startsWith('bb_platform_') || key === 'bb_games_only') settingsPendingGameRefetch = true;
  } else if (def.applyMode === 'reload') {
    settingsPendingReload = true;
  }

  // The FPS overlay is scene-independent (a DOM box fed by the perf tracer), so
  // apply it even when the live branch above bailed for want of a StoreScene —
  // i.e. from the drawer in 2.5D mode. enableFpsMeter is idempotent.
  if (key === FPS_METER_KEY) enableFpsMeter(getSetting<boolean>(key));

  // Toggling the games master switch changes which rows exist on this page
  // (platform toggles and Romm fields are gated on it via visibleWhen), so
  // rebuild the page in place to reveal/hide them immediately. GAMES ONLY does
  // the same to the Platforms sub-page, which it overrides.
  if (key === 'bb_games_enabled' || key === 'bb_games_only') {
    generateSettingsDrawer();
    refreshSettingsValues();
    setSettingsSelection(Math.max(0, settingsRowKeys.indexOf(key)));
  }

  const el = document.getElementById(`setting-value-${key}`);
  if (el) el.textContent = currentValueLabel(key);
  refreshSettingThumb(key); // swap the option thumbnail to the new value
  updateSettingsStatus();
  logToConsole(`[Settings] ${def.label}: ${currentValueLabel(key)}`, 'system');
}

/**
 * Commit a text/secret drawer edit (fires on the input's change event — i.e.
 * blur or Enter, never per keystroke). An empty value clears the stored key,
 * same as leaving the matching login-form field blank.
 */
function commitTextSetting(key: string, raw: string) {
  const def = getSettingDef(key);
  if (!def) return;
  const value = raw.trim();
  if (key === 'jellyfin_password') {
    // Never persisted: held in memory and exchanged for a fresh token on
    // drawer close (see finishConnectionEditsAndReload). Blank = keep session.
    settingsPendingJellyfinPassword = value || null;
    if (value) settingsPendingReload = true;
    updateSettingsStatus();
    return;
  }
  const prev = getSetting<string>(key) || '';
  if (value === prev) return; // no-op edit — don't queue a reload
  if (value) setSetting(key, value);
  else localStorage.removeItem(key);
  // A different server or user invalidates the saved token; flag it so the
  // reload path can drop the token unless a new password re-auths first.
  if (key === 'jellyfin_url' || key === 'jellyfin_username') settingsPendingAuthReset = true;
  if (def.applyMode === 'reload') settingsPendingReload = true;
  updateSettingsStatus();
  logToConsole(`[Settings] ${def.label} updated.`, 'system');
}

/** Advance / activate whatever row is currently selected. */
function activateSelectedSetting(dir: number = 1) {
  activateSetting(settingsRowKeys[settingsIndex], dir);
}

function updateSettingsStatus() {
  const status = document.getElementById('settings-status');
  if (!status) return;
  if (settingsPendingReload) {
    status.textContent = 'Connection changed — the app will restart when you close this menu.';
  } else if (settingsPendingRebuild) {
    status.textContent = 'Store look will update when you close this menu.';
  } else {
    status.textContent = 'Changes apply as you make them.';
  }
}

let elementBeforeSettingsOpened: HTMLElement | null = null;

/**
 * Open the drawer, by default on the category index page. `page` opens
 * straight onto a specific page instead — the counter CRT's MANAGER OVERRIDE
 * row passes 'Service' (the staff page has no index row to navigate from).
 */
function openSettingsDrawer(page: SettingGroup | 'Service' | null = null) {
  if (ui.isPowerMenuOpen) closePowerMenu();

  if (getSetting<string>('bb_render_mode') === 'flat') {
    elementBeforeSettingsOpened = document.querySelector('.case.is-focused, .flat-library-card.is-focused') as HTMLElement;
    if (elementBeforeSettingsOpened) {
      elementBeforeSettingsOpened.classList.remove('is-focused');
    }
  }

  ui.isSettingsDrawerOpen = true;
  settingsPendingRebuild = false;
  settingsPendingReload = false;
  settingsPendingGameRefetch = false;
  settingsPendingJellyfinPassword = null;
  settingsPendingAuthReset = false;
  settingsPage = page;
  settingsSubpage = null;
  generateSettingsDrawer();
  refreshSettingsValues();
  updateSettingsStatus();
  document.getElementById('settings-drawer-overlay')!.classList.add('visible');
  // Opening straight onto a page: row 0 is Back, land on the first setting.
  setSettingsSelection(page !== null && settingsRowKeys.length > 2 ? 1 : 0);
  logToConsole(page === 'Service'
    ? '[Settings] MANAGER OVERRIDE — service mode open.'
    : '[Settings] Opened store settings.', 'system');
}

function closeSettingsDrawer() {
  ui.isSettingsDrawerOpen = false;
  document.getElementById('settings-drawer-overlay')!.classList.remove('visible');
  logToConsole('[Settings] Closed store settings.', 'system');

  if (getSetting<string>('bb_render_mode') === 'flat' && elementBeforeSettingsOpened) {
    if (document.body.contains(elementBeforeSettingsOpened)) {
      elementBeforeSettingsOpened.classList.add('is-focused');
      elementBeforeSettingsOpened.focus();
    }
    elementBeforeSettingsOpened = null;
  }

  if (settingsPendingReload) {
    settingsPendingReload = false;
    settingsPendingRebuild = false;
    settingsPendingGameRefetch = false;
    logToConsole('[Settings] Restarting to apply connection changes...', 'system');
    showBootOverlay();
    void finishConnectionEditsAndReload();
    return;
  }
  if (settingsPendingRebuild) {
    settingsPendingRebuild = false;
    rebuildStoreScene();
  }
}

/**
 * Reload tail for drawer connection edits. If the user typed a new Jellyfin
 * password, exchange it for a fresh token right now (it only ever lives in
 * memory); otherwise, if the server/username changed, drop the stale token so
 * boot goes straight to the login/cards flow instead of retry-looping against
 * the new server with the old session. Non-Jellyfin edits (Jellyseerr/Romm)
 * fall through to a plain reload.
 */
async function finishConnectionEditsAndReload() {
  const password = settingsPendingJellyfinPassword;
  settingsPendingJellyfinPassword = null;
  const url = localStorage.getItem('jellyfin_url');
  const username = localStorage.getItem('jellyfin_username');
  if (password && url && username) {
    try {
      const session = await authenticateUser(url, username, password);
      localStorage.setItem('jellyfin_token', session.accessToken);
      localStorage.setItem('jellyfin_userid', session.userId);
      localStorage.setItem('jellyfin_last_userid', session.userId);
      logToConsole('[Settings] Re-authenticated with the new credentials.', 'system');
    } catch (e: any) {
      logToConsole(`[Settings] Re-auth failed (${e?.message ?? e}) — boot will show the login screen.`, 'system');
      localStorage.removeItem('jellyfin_token');
      localStorage.removeItem('jellyfin_userid');
    }
  } else if (settingsPendingAuthReset) {
    localStorage.removeItem('jellyfin_token');
    localStorage.removeItem('jellyfin_userid');
  }
  settingsPendingAuthReset = false;
  setTimeout(() => location.reload(), 400);
}

// ─── Login Overlay ────────────────────────────────────────────────────────────

function showLoginOverlay() {
  if (isDemoMode) return; // the demo never logs in
  closeMembershipCardPicker(); // defensive: idempotent if it wasn't open
  ui.isLoginOpen = true;
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

function hideLoginOverlay() {
  ui.isLoginOpen = false;
  const overlay = document.getElementById('login-overlay');
  if (overlay) {
    overlay.classList.remove('visible');
  }
}

function hideBootOverlay() {
  const overlay = document.getElementById('boot-overlay');
  if (overlay) {
    overlay.classList.remove('visible');
  }
}

// Re-shown after a manual login (the boot overlay is only up by default on the
// very first paint) so the scene has somewhere opaque to load behind while its
// textures stream in.
function showBootOverlay() {
  const overlay = document.getElementById('boot-overlay');
  if (overlay) {
    overlay.classList.add('visible');
  }
}

// ─── Feedback Pin (F8) ────────────────────────────────────────────────────────
// Lets a user who can't read code flag a visual bug in place: F8 grabs the
// exact camera pose + a screenshot via StoreScene.captureFeedbackSnapshot()
// (called before this overlay can show, so the camera hasn't moved yet), then
// this textarea collects what looks wrong. Saved via the vite dev-server
// middleware in vite.config.ts, which writes it to feedback/NNN/.
const FEEDBACK_CONFIG_KEYS = [
  'bb_theme', 'bb_medium', 'bb_arrangement', 'bb_outside', 'bb_corner',
  'bb_ceiling', 'bb_storefront', 'bb_render_mode', 'bb_quality', 'bb_walldecor',
] as const;

let feedbackOverlayEl: HTMLDivElement | null = null;
let feedbackTextareaEl: HTMLTextAreaElement | null = null;
let feedbackSnapshot: { walk: string; png: string } | null = null;
let feedbackSaving = false;

function buildFeedbackOverlay(): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.id = 'feedback-pin-overlay';
  overlay.innerHTML = `
    <div class="feedback-pin-card">
      <h2 class="feedback-pin-title">Feedback pin</h2>
      <textarea id="feedback-pin-textarea" class="feedback-pin-textarea" rows="4"
        placeholder="Describe what looks wrong — view + screenshot are attached automatically"></textarea>
      <p class="feedback-pin-status" id="feedback-pin-status"></p>
      <div class="feedback-pin-options">
        <button class="feedback-pin-btn" id="feedback-pin-save" type="button">SAVE</button>
        <button class="feedback-pin-btn" id="feedback-pin-cancel" type="button">CANCEL</button>
      </div>
      <p class="episode-card-hint">CTRL+ENTER Save &nbsp;|&nbsp; ESC Cancel</p>
    </div>
  `;
  document.body.appendChild(overlay);

  const textarea = overlay.querySelector('#feedback-pin-textarea') as HTMLTextAreaElement;
  textarea.addEventListener('keydown', (e) => {
    // Mirror makeTextRow's edit-mode pattern (settings drawer text inputs):
    // stopPropagation so the keystroke doesn't also reach the window-level
    // F8/InputManager listeners.
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeFeedbackPin();
      return;
    }
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      e.stopPropagation();
      void saveFeedbackPin();
    }
  });

  overlay.querySelector('#feedback-pin-save')?.addEventListener('click', () => void saveFeedbackPin());
  overlay.querySelector('#feedback-pin-cancel')?.addEventListener('click', () => closeFeedbackPin());

  feedbackTextareaEl = textarea;
  return overlay;
}

function openFeedbackPin() {
  if (!storeScene || ui.isFeedbackOpen) return;
  // Capture BEFORE the overlay paints, so the screenshot is the view the user
  // was actually looking at, not the feedback card.
  feedbackSnapshot = storeScene.captureFeedbackSnapshot();
  if (!feedbackOverlayEl) feedbackOverlayEl = buildFeedbackOverlay();
  const status = document.getElementById('feedback-pin-status');
  if (status) status.textContent = '';
  if (feedbackTextareaEl) feedbackTextareaEl.value = '';
  ui.isFeedbackOpen = true;
  feedbackOverlayEl.classList.add('visible');
  feedbackTextareaEl?.focus();
}

function closeFeedbackPin() {
  ui.isFeedbackOpen = false;
  feedbackOverlayEl?.classList.remove('visible');
  feedbackSnapshot = null;
}

async function saveFeedbackPin() {
  if (feedbackSaving || !feedbackSnapshot || !feedbackTextareaEl) return;
  const comment = feedbackTextareaEl.value.trim();
  const status = document.getElementById('feedback-pin-status');
  const config: Record<string, string | null> = {};
  for (const key of FEEDBACK_CONFIG_KEYS) config[key] = localStorage.getItem(key);

  feedbackSaving = true;
  if (status) status.textContent = 'Saving...';
  try {
    const res = await fetch('/__feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        comment,
        walk: feedbackSnapshot.walk,
        config,
        timestamp: new Date().toISOString(),
        png: feedbackSnapshot.png,
        log: recentLogLines.slice(-100),
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    logToConsole(`[Feedback] saved as #${data.id}`, 'system');
    closeFeedbackPin();
  } catch (err) {
    // The endpoint lives on the vite dev AND preview servers (npm run dev /
    // npm run serve — the desktop launcher), so this only fires with no local
    // server behind the page at all (a bundled Tauri app) or a transient fetch
    // failure. Keep the overlay open either way so the comment the user just
    // typed isn't lost.
    console.warn('[Feedback] save failed:', err);
    if (status) status.textContent = 'Could not save — feedback pins need the local server (npm run dev / the desktop launcher).';
  } finally {
    feedbackSaving = false;
  }
}

// ─── Exit Confirmation ────────────────────────────────────────────────────────

function openExitConfirm() {
  if (ui.isPowerMenuOpen) closePowerMenu();
  ui.isExitConfirmOpen = true;
  document.getElementById('exit-confirm-overlay')!.classList.add('visible');
  setExitConfirmSelection(1); // Default to NO, RETURN
  logToConsole('[System] Opened Exit Confirmation menu.', 'system');
}

function closeExitConfirm() {
  ui.isExitConfirmOpen = false;
  document.getElementById('exit-confirm-overlay')!.classList.remove('visible');
  logToConsole('[System] Closed Exit Confirmation menu.', 'system');
}

function setExitConfirmSelection(index: number) {
  exitConfirmIndex = index;
  exitButtons.forEach((id, idx) => {
    const btn = document.getElementById(id);
    if (btn) {
      if (idx === index) {
        btn.classList.add('selected');
        btn.focus();
      } else {
        btn.classList.remove('selected');
      }
    }
  });
}

async function executeExitConfirmAction(btnId: string) {
  closeExitConfirm();
  
  if (btnId === 'btn-confirm-exit') {
    logToConsole(`[System] ${brandString('app-closing-log', 'Closing Halcyon app...')}`, 'system');
    setTimeout(() => {
      closeApp();
    }, 500);
  }
}

// The DOM episode-picker overlay (and its nav state/handlers) is retired: a
// TV series now presents as a 3D season boxset whose episode-list side panel
// is the picker (see three-scene.ts's rotateHeroFace/getSelectedEpisode and
// video-case.ts's drawSeriesEpisodePanel).

// ─── Version Picker (4K / 1080p) ─────────────────────────────────────────────
//
// Shown at play time for a title with 2+ quality versions (Movie.versions —
// a server-side-merged item's MediaSources and/or duplicate 4K/1080p entries
// collapsed to one shelf box at sync). One box on the shelf, the quality
// choice at the counter. Escape/Back cancels the play entirely; the picker
// resolves BEFORE any candy checkout / play flourish starts, so cancelling
// leaves the store exactly where it was.
//
// Input routing: gamepad arrives through the InputManager callback branches
// below (3D mode). Keyboard uses the capture-phase listener here instead —
// in flat mode InputManager deliberately ignores the keyboard while a
// .flat-detail-overlay is up, and this picker must work on top of that
// overlay too. The capture listener stops propagation, so in 3D mode the
// InputManager never double-handles the same keypress.

// Generic rows: the same overlay also serves the not-in-stock ORDER / NOT
// INTERESTED choice (see resolveGapChoice) — any short remote-drivable list.
let versionPickerRows: { code: string; name: string }[] = [];
let versionPickerIndex = 0;
let versionPickerItemEls: HTMLDivElement[] = [];
let versionPickerResolve: ((idx: number | null) => void) | null = null;

function updateVersionPickerSelection(prevIndex: number) {
  versionPickerItemEls[prevIndex]?.classList.remove('selected');
  const current = versionPickerItemEls[versionPickerIndex];
  current?.classList.add('selected');
  current?.scrollIntoView({ block: 'nearest' });
}

function moveVersionPickerSelection(delta: number) {
  if (versionPickerRows.length === 0) return;
  const prevIndex = versionPickerIndex;
  versionPickerIndex = (versionPickerIndex + delta + versionPickerRows.length) % versionPickerRows.length;
  updateVersionPickerSelection(prevIndex);
}

/** Resolve the pending openListPicker promise and tear the overlay down. */
function closeVersionPicker(result: number | null) {
  if (!ui.isVersionPickerOpen) return;
  ui.isVersionPickerOpen = false;
  document.getElementById('version-picker-overlay')!.classList.remove('visible');
  const resolve = versionPickerResolve;
  versionPickerResolve = null;
  versionPickerRows = [];
  versionPickerItemEls = [];
  resolve?.(result);
}

function chooseVersionPickerSelection() {
  closeVersionPicker(versionPickerRows.length > 0 ? versionPickerIndex : null);
}

/**
 * Arrow-driven list choice on the version-picker overlay: resolves the picked
 * row index, or null on cancel (Back). Fully remote-drivable — Up/Down/OK/Back.
 */
function openListPicker(title: string, rows: { code: string; name: string }[], label = 'CHOOSE A VERSION'): Promise<number | null> {
  // A picker somehow already up (double-tapped play): settle the old promise
  // as cancelled before the state is reused.
  closeVersionPicker(null);

  versionPickerRows = rows;
  versionPickerIndex = 0;
  versionPickerItemEls = [];

  const labelEl = document.getElementById('version-picker-label');
  if (labelEl) labelEl.textContent = label;
  document.getElementById('version-picker-title')!.textContent = title.toUpperCase();
  const container = document.getElementById('version-list-container')!;
  container.innerHTML = '';
  rows.forEach((r, idx) => {
    const row = document.createElement('div');
    row.className = 'episode-item' + (idx === 0 ? ' selected' : '');
    const code = document.createElement('span');
    code.className = 'episode-code';
    code.textContent = r.code;
    const name = document.createElement('span');
    name.className = 'episode-name';
    name.textContent = r.name;
    row.appendChild(code);
    row.appendChild(name);
    row.addEventListener('click', () => {
      versionPickerIndex = idx;
      chooseVersionPickerSelection();
    });
    container.appendChild(row);
    versionPickerItemEls.push(row);
  });

  ui.isVersionPickerOpen = true;
  document.getElementById('version-picker-overlay')!.classList.add('visible');
  return new Promise<number | null>((resolve) => {
    versionPickerResolve = resolve;
  });
}

/** "Which version tonight?" — resolves the chosen version, or null on cancel. */
async function openVersionPicker(movie: Movie, versions: MovieVersion[]): Promise<MovieVersion | null> {
  const idx = await openListPicker(movie.title,
    versions.map((v) => ({ code: v.is4k ? '4K' : 'HD', name: v.label })));
  return idx === null ? null : versions[idx] ?? null;
}

/**
 * The not-in-stock case's confirm choice (review §4.5): a momentary remote
 * can't HOLD ▼, so the deliberate OK press asks instead of ordering blind —
 * order the title, or cross it off ("not interested"). Back = neither.
 * Keyboards keep their shortcuts (X dismisses, HOLD ▼ still works).
 */
async function resolveGapChoice(movie: Movie): Promise<'order' | 'dismiss' | null> {
  const idx = await openListPicker(movie.title, [
    { code: 'ORDER', name: 'Order it — the store will get a copy in' },
    { code: 'PASS', name: 'Not interested — never show me this title again' },
  ], 'NOT IN STOCK');
  return idx === 0 ? 'order' : idx === 1 ? 'dismiss' : null;
}

// Capture-phase keyboard driver (see the routing note above). Registered once
// at module load; a no-op unless the picker is up.
window.addEventListener(
  'keydown',
  (e: KeyboardEvent) => {
    if (!ui.isVersionPickerOpen) return;
    switch (e.key) {
      case 'ArrowUp': case 'w': case 'W':
        moveVersionPickerSelection(-1);
        break;
      case 'ArrowDown': case 's': case 'S':
        moveVersionPickerSelection(1);
        break;
      case 'Enter': case ' ': case 'e': case 'E':
        if (!e.repeat) chooseVersionPickerSelection();
        break;
      case 'Escape': case 'Backspace': case 'q': case 'Q':
        closeVersionPicker(null);
        break;
      default:
        return; // let unrelated keys through untouched
    }
    e.preventDefault();
    e.stopPropagation();
  },
  true,
);

/**
 * Play-time version resolution, shared by every fresh-launch call site.
 * Returns undefined when there's nothing to choose (single-version title —
 * launch proceeds exactly as before), the picked version, or null when the
 * user backed out (callers abort the launch).
 */
async function resolvePlayVersion(movie: Movie): Promise<MovieVersion | null | undefined> {
  if (movie.isSeries || movie.game || movie.discovery || movie.comingSoon) return undefined;
  const versions = movie.versions;
  if (!versions || versions.length < 2) return undefined;
  return openVersionPicker(movie, versions);
}

// ─── Candy Checkout (T19) ───────────────────────────────────────────────────
//
// Gate in front of the two "rent this movie" call sites below. Off (default)
// or no candy rack on the floor -> onDone() runs immediately and the rental
// flow is byte-for-byte what it was before this ticket. On + candy rows
// present -> a "Snacks for tonight?" screen lets the player pick candy and
// either hand it to the DoorDash deep-link adapter (candy-delivery.ts) or
// skip; either way onDone() (the actual rental/playback kickoff) runs once
// the screen closes.
function maybeRunCandyCheckout(onDone: () => void) {
  if (!getSetting<boolean>('candy_delivery_enabled')) {
    onDone();
    return;
  }
  const rows = storeScene?.getCandyRows() ?? [];
  if (rows.length === 0) {
    onDone();
    return;
  }
  openCandyCheckout(rows, onDone);
}

function openCandyCheckout(rows: CandyRow[], onDone: () => void) {
  candyCheckoutRows = rows;
  candyCheckoutSelected = new Set();
  candyCheckoutIndex = rows.length + 1; // default focus: "No thanks" — safe default, never orders on a stray Enter
  candyCheckoutOnDone = onDone;
  ui.isCandyCheckoutOpen = true;

  const zipInput = document.getElementById('candy-zip-input') as HTMLInputElement | null;
  if (zipInput) zipInput.value = localStorage.getItem(CANDY_ZIP_KEY) || '';
  const statusEl = document.getElementById('candy-status-msg');
  if (statusEl) statusEl.textContent = '';

  renderCandyCheckout();
  document.getElementById('candy-checkout-overlay')!.classList.add('visible');
  logToConsole(`[Checkout] "Snacks for tonight?" — ${rows.length} candy row(s) available.`, 'system');
}

function renderCandyCheckout() {
  const listEl = document.getElementById('candy-list-container');
  if (listEl) {
    listEl.innerHTML = '';
    candyCheckoutRows.forEach((row, idx) => {
      const item = document.createElement('div');
      const checked = candyCheckoutSelected.has(row.id);
      item.className = 'candy-item' + (idx === candyCheckoutIndex ? ' focused' : '') + (checked ? ' checked' : '');
      item.innerHTML = `
        <span class="candy-item-check"></span>
        <span class="candy-item-name">${row.name}</span>
        <span class="candy-item-size">${row.size}</span>
      `;
      item.addEventListener('click', () => {
        candyCheckoutIndex = idx;
        toggleCandyItem(row.id);
      });
      item.addEventListener('pointerenter', () => {
        candyCheckoutIndex = idx;
        renderCandyCheckout();
      });
      listEl.appendChild(item);
    });
  }

  const orderBtn = document.getElementById('btn-candy-order');
  const skipBtn = document.getElementById('btn-candy-skip');
  orderBtn?.classList.toggle('focused', candyCheckoutIndex === candyCheckoutRows.length);
  skipBtn?.classList.toggle('focused', candyCheckoutIndex === candyCheckoutRows.length + 1);
}

function toggleCandyItem(id: string) {
  if (candyCheckoutSelected.has(id)) candyCheckoutSelected.delete(id);
  else candyCheckoutSelected.add(id);
  renderCandyCheckout();
}

function candyCheckoutMoveFocus(dir: number) {
  const total = candyCheckoutRows.length + 2; // + Order btn + Skip btn
  candyCheckoutIndex = (candyCheckoutIndex + dir + total) % total;
  renderCandyCheckout();
}

function candyCheckoutActivate() {
  if (candyCheckoutIndex < candyCheckoutRows.length) {
    toggleCandyItem(candyCheckoutRows[candyCheckoutIndex].id);
  } else if (candyCheckoutIndex === candyCheckoutRows.length) {
    confirmCandyOrder();
  } else {
    skipCandyCheckout();
  }
}

async function confirmCandyOrder() {
  const items = candyCheckoutRows.filter((r) => candyCheckoutSelected.has(r.id));
  if (items.length === 0) {
    // Nothing picked — equivalent to skipping, no reason to hit the adapter.
    skipCandyCheckout();
    return;
  }
  const zipInput = document.getElementById('candy-zip-input') as HTMLInputElement | null;
  const zip = zipInput?.value.trim() || '';
  if (zip) localStorage.setItem(CANDY_ZIP_KEY, zip);

  const statusEl = document.getElementById('candy-status-msg');
  if (statusEl) statusEl.textContent = 'Opening DoorDash…';

  const orderItems = items.map((r) => ({ id: r.id, name: r.name, size: r.size, qty: 1 }));
  const result = await getCandyDeliveryAdapter().order(orderItems, zip);
  logToConsole(`[CandyDelivery] ${result.message}`, 'system');

  storeScene?.dropCandyIntoBag(items.length);
  closeCandyCheckout();
}

function skipCandyCheckout() {
  closeCandyCheckout();
}

function closeCandyCheckout() {
  ui.isCandyCheckoutOpen = false;
  document.getElementById('candy-checkout-overlay')!.classList.remove('visible');
  const onDone = candyCheckoutOnDone;
  candyCheckoutOnDone = null;
  candyCheckoutRows = [];
  candyCheckoutSelected = new Set();
  if (onDone) onDone();
}

// ─── Text Search ──────────────────────────────────────────────────────────────

async function openSearch() {
  if (getSetting<string>('bb_render_mode') === 'flat') {
    ui.isSearchOpen = true;
    const { openFlatSearchOverlay } = await import('./flat/flat-search');
    const mount = document.getElementById('canvas-container') as HTMLElement;
    const activeContent = document.querySelector('.flat-content') as HTMLElement;
    const activeLibraryId = activeContent?.dataset.activeLibraryId || null;
    openFlatSearchOverlay(storeLibraries, activeLibraryId, mount);
    logToConsole('[Search] Flat search overlay opened.', 'system');
    return;
  }

  ui.isSearchOpen = true;
  searchQuery = '';
  searchResults = [];
  searchResultIndex = 0;
  storeScene?.enterSearchMode(); // camera glides in behind the counter to the monitor
  updateSearchTerminal();
  logToConsole('[Search] Search terminal opened.', 'system');
}

async function closeSearch() {
  if (getSetting<string>('bb_render_mode') === 'flat') {
    ui.isSearchOpen = false;
    const { closeFlatSearchOverlay } = await import('./flat/flat-search');
    closeFlatSearchOverlay();
    logToConsole('[Search] Flat search overlay closed.', 'system');
    return;
  }

  ui.isSearchOpen = false;
  storeScene?.exitSearchMode(); // camera returns to where the player was, desk CRT goes idle
  logToConsole('[Search] Search terminal closed.', 'system');
}

async function openSearchWithQuery(initialQuery: string) {
  ui.isSearchOpen = true;
  const { openFlatSearchOverlay } = await import('./flat/flat-search');
  const mount = document.getElementById('canvas-container') as HTMLElement;
  const activeContent = document.querySelector('.flat-content') as HTMLElement;
  const activeLibraryId = activeContent?.dataset.activeLibraryId || null;
  openFlatSearchOverlay(storeLibraries, activeLibraryId, mount, initialQuery);
  logToConsole('[Search] Flat search overlay opened with query: ' + initialQuery, 'system');
}

// Redraw the clerk monitor's search terminal (query line + result list) to
// match the current searchQuery/searchResults/searchResultIndex. The cursor
// is pinned to line 0 (the query line) so it doesn't wander into the results.
function updateSearchTerminal() {
  if (!storeScene) return;
  const lines: string[] = [`SEARCH> ${searchQuery.toUpperCase()}`, ''];
  if (searchQuery.trim() === '') {
    lines.push('AWAITING QUERY...');
  } else if (searchResults.length === 0) {
    lines.push('NO MATCHES FOUND.');
  } else {
    lines.push(`${searchResults.length} MATCH(ES):`);
    searchResults.slice(0, 6).forEach((m, i) => {
      lines.push(`${i === searchResultIndex ? '>' : ' '} ${m.title.toUpperCase().slice(0, 30)} (${m.year})`);
    });
  }
  storeScene.setTerminalText(lines, 0);
}

// Recompute searchResults from searchQuery against the loaded library, then
// redraw the terminal. Mirrors the old DOM overlay's filter exactly.
function updateSearchResults() {
  const q = searchQuery.trim().toLowerCase();
  if (q === '') {
    searchResults = [];
    searchResultIndex = 0;
    updateSearchTerminal();
    return;
  }

  const results: Movie[] = [];
  storeLibraries.forEach(lib => {
    lib.movies.forEach(m => {
      if (m.title.toLowerCase().includes(q) || m.director.toLowerCase().includes(q) ||
          m.genres.some(g => g.toLowerCase().includes(q))) {
        results.push(m);
      }
    });
  });

  // Deduplicate by id
  const seen = new Set<string>();
  searchResults = results.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
  searchResultIndex = 0;
  updateSearchTerminal();
}

// While the search terminal is open, this owns every keystroke: it's
// registered on the capture phase so it runs (and stops propagation) before
// InputManager's own bubble-phase listener ever sees the event -- the same
// job the old focused <input> did implicitly (InputManager already ignores
// keydowns while an <input>/<textarea>/<select> is focused; there's no DOM
// input anymore, so this listener is what stands in for that).
function handleSearchKeydown(e: KeyboardEvent) {
  if (!ui.isSearchOpen) return;
  if (getSetting<string>('bb_render_mode') === 'flat') return;
  e.preventDefault();
  e.stopPropagation();

  if (e.key === 'Escape') {
    closeSearch();
    return;
  }
  if (e.key === 'Enter') {
    confirmSearchSelection();
    return;
  }
  if (e.key === 'ArrowDown') {
    if (searchResults.length > 0) {
      searchResultIndex = (searchResultIndex + 1) % searchResults.length;
      updateSearchTerminal();
    }
    return;
  }
  if (e.key === 'ArrowUp') {
    if (searchResults.length > 0) {
      searchResultIndex = (searchResultIndex - 1 + searchResults.length) % searchResults.length;
      updateSearchTerminal();
    }
    return;
  }
  if (e.key === 'Backspace') {
    if (searchQuery.length > 0) {
      searchQuery = searchQuery.slice(0, -1);
      retailAudio.playKeyClick();
      updateSearchResults();
    }
    return;
  }
  if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
    searchQuery += e.key;
    retailAudio.playKeyClick();
    updateSearchResults();
  }
  // Any other key (Tab, Shift, function keys, ...) is simply swallowed.
}

function setupSearchInputCapture() {
  window.addEventListener('keydown', handleSearchKeydown, true);
}

async function confirmSearchSelection() {
  if (searchResults.length === 0) return;
  const movie = searchResults[searchResultIndex];
  closeSearch();
  logToConsole(`[Search] Selected: "${movie.title}"`, 'system');
  if (movie.isSeries && storeScene?.jumpToTitle(movie.id)) {
    // Land on the series' 3D boxset in inspect mode — its episode-list side
    // panel replaced the DOM episode picker.
    updateMovieHUD(storeScene.getSelectedMovie() || null);
  } else {
    await launchVideoPlayback(movie);
  }
}

// ─── Scene / Store ────────────────────────────────────────────────────────────

/**
 * Re-apply every 'live' setting the user has explicitly chosen to a freshly
 * built scene. Guarded on an explicit localStorage value so behaviors that are
 * intentionally randomized at boot (e.g. day/night outside mode) aren't forced
 * to a default on the very first build.
 */
function applyLiveSettings(scene: StoreScene) {
  if (typeof localStorage === 'undefined') return;
  for (const def of allSettings()) {
    if (def.applyMode !== 'live' || !def.apply) continue;
    if (localStorage.getItem(def.key) === null) continue; // no explicit user choice
    try {
      def.apply(getSetting(def.key), scene);
    } catch (e) {
      console.warn(`[Settings] live apply failed for ${def.key}:`, e);
    }
  }
}

/**
 * Rebuild the 3D store in place with the current settings — no page reload, no
 * Jellyfin refetch, no poster re-download. The old scene is disposed with its
 * poster cache preserved and reconstructed from the already-fetched
 * `librariesList`. Used by the settings drawer to apply batched look/quality
 * changes on close.
 */
async function rebuildStoreScene() {
  if (librariesList.length === 0 && gameMovies.length === 0) return; // nothing loaded yet
  logToConsole('[System] Applying store changes (rebuilding scene, no reload)...', 'system');
  showBootOverlay();
  // Nothing is interactive behind the overlay — drain texture uploads at burst
  // rate instead of letting the just-pressed drawer key hold them to the polite
  // interactive budget. Self-clears when the queue empties.
  (await import('./video-case')).beginRebuildDrain();
  // Let the overlay actually paint before the synchronous scene rebuild below
  // freezes the main thread — without an awaited tick here, a settings change
  // with no network await in front of it (the common case now that the games
  // refetch is skipped below) would commit the freeze against a stale frame.
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

  // Platform filtering happens at request time inside fetchGames(), so only a
  // bb_platform_* toggle actually requires a fresh Romm round trip; every other
  // rebuild-scene setting (theme/arrangement/medium/...) reuses the in-memory
  // gameMovies list instead of blocking the rebuild behind a ~20s-worst-case fetch.
  if (settingsPendingGameRefetch) {
    settingsPendingGameRefetch = false;
    await loadGameMovies();
  }

  const mode = getSetting<string>('bb_render_mode');
  if (mode !== 'flat') {
    // Pick up a media-format change: recompute case geometry + poster crop, and
    // push the new crop into the persisted global shaders.
    const { initCaseMedium, refreshPosterCrop } = await import('./video-case');
    initCaseMedium();
    refreshPosterCrop();
  }
  await initializeStoreScene(true);
}

let isSwitchingMode = false;
/**
 * Swap between the 3D store and the flat 2.5D shelf in-process — no page reload,
 * no Jellyfin re-fetch, no poster re-download. Reuses rebuildStoreScene()'s
 * boot-wipe + in-place initializeStoreScene(), which now disposes the outgoing
 * mode and builds the incoming one from the already-loaded catalog. Replaces the
 * old location.reload() path that cost ~2 minutes of full cold re-sync. Exposed
 * on window.HTPC so the flat menu's "3D Store Mode" item can call it too.
 */
async function switchRenderMode(target: 'flat' | '3d') {
  if (isSwitchingMode || getSetting<string>('bb_render_mode') === target) return;
  isSwitchingMode = true;
  try {
    closePowerMenu(); // dismiss the manager-terminal/power overlay if it's up
    setSetting('bb_render_mode', target);
    await rebuildStoreScene();
  } finally {
    isSwitchingMode = false;
  }
}

async function initializeStoreScene(preservePosterCache = false) {
  // Single funnel for every boot and rebuild, 3D and flat — resolve which
  // catalog this store is made of before anything reads it.
  refreshStoreCatalog();
  const mode = getSetting<string>('bb_render_mode');
  if (mode === 'flat') {
    // Swapping in from the 3D store: dispose its scene first (keeping the poster
    // cache so a later swap back is fast) so the three.js render loop and GPU
    // resources don't keep running underneath the flat DOM. No-op on a cold
    // flat boot where no scene was ever built.
    if (storeScene) {
      storeScene.destroy(true);
      storeScene = null;
    }
    const canvasContainer = document.getElementById('canvas-container') as HTMLDivElement;
    if (canvasContainer) {
      canvasContainer.innerHTML = '';
    }
    const hud = document.getElementById('hud-overlay');
    if (hud) {
      hud.style.display = 'none';
    }
    const { bootFlatStore } = await import('./flat/flat-store');
    const { registerPlaybackLauncher } = await import('./flat/flat-detail');
    // Flat-mode plays route through the same version resolution as the 3D
    // store: multi-version titles open the picker (its capture-phase keyboard
    // driver works over the flat detail overlay), single-version titles
    // launch exactly as before. Episode plays (overrideItemId) skip it.
    registerPlaybackLauncher(async (movie, overrideItemId, overridePath) => {
      if (overrideItemId) {
        await launchVideoPlayback(movie, overrideItemId, overridePath);
        return;
      }
      const version = await resolvePlayVersion(movie);
      if (version === null) return; // user backed out of the version picker
      await launchVideoPlayback(movie, undefined, undefined, false, false, version);
    });
    // A prior 3D boot merges discovery suggestions into the library lists
    // (StoreScene's constructor); the flat store shows them as its own row
    // instead, so strip any merged copies before booting it.
    for (const lib of storeLibraries) {
      for (let i = lib.movies.length - 1; i >= 0; i--) {
        if (lib.movies[i].discovery) lib.movies.splice(i, 1);
      }
    }
    bootFlatStore(storeLibraries, canvasContainer, storeGameMovies, discoveryMovies);
    hideBootOverlay();
    return;
  }
  // Swapping in from flat mode: abort its window listeners, clear its DOM, and
  // restore the HUD before we build the 3D scene into the same container. The
  // dynamic import only fires when flat was actually mounted (so a cold 3D boot
  // never pulls in the flat modules / CSS).
  const flatMount = document.getElementById('canvas-container') as HTMLDivElement;
  if (flatMount?.classList.contains('flat-store-root')) {
    const { teardownFlatStore } = await import('./flat/flat-store');
    teardownFlatStore(flatMount);
  }
  if (storeScene) {
    storeScene.destroy(preservePosterCache);
    storeScene = null;
  }

  // The shelf arrangement defaults to herringbone and only sticks when the user
  // picked one in the arrangement menu (bb_arrangement_user marker). Screenshot
  // scripts and other tooling write bb_arrangement on this same origin, which
  // used to silently re-lay the store between launches.
  if (localStorage.getItem('bb_arrangement') && !localStorage.getItem('bb_arrangement_user')) {
    localStorage.setItem('bb_arrangement', 'herringbone');
  }

  // Clear any existing aisle indicator interval to prevent leaks on scene rebuild
  if (aisleIndicatorInterval !== null) {
    clearInterval(aisleIndicatorInterval);
    aisleIndicatorInterval = null;
  }

  const canvasContainer = document.getElementById('canvas-container') as HTMLDivElement;
  try {
    const jfUrl = localStorage.getItem('jellyfin_url') ?? '';
    const jfToken = localStorage.getItem('jellyfin_token') ?? '';
    // Built into a local `scene` first and only published to the module-level
    // `storeScene` (and revealed to the user) once every cover has finished
    // loading — see the texturesReadyPromise handoff below. Until then, the
    // boot overlay stays up and `storeScene?.` call sites elsewhere are all
    // no-ops, so neither the view nor input can reach the half-dressed scene.
    // Watch-history staff picks (stickers + genre endcaps, see
    // staff-picks.ts): computed here so login, demo, and settings-rebuild
    // boots all get them. Raced like the other Jellyseerr loaders — never
    // blocks boot; a lost race still stickers the shelves live on arrival
    // (endcaps then appear next boot, instantly, off the loader's cache).
    {
      const TIMEOUT_MS = 15_000;
      const work = loadStaffPicks(storeLibraries, isDemoMode ? { posterFor: demoPoster } : {})
        .catch(() => EMPTY_STAFF_PICKS);
      const budget = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS));
      const result = await Promise.race([work, budget]);
      if (result) {
        staffPicks = result;
      } else {
        work.then((late) => {
          staffPicks = late;
          if (late.ownedPicks.length > 0) storeScene?.applyStaffPicks(late);
        });
      }
    }

    // Measured GPU quality calibration (src/quality-calibrate.ts), behind the
    // boot overlay and BEFORE the real (expensive) renderer exists. Dynamic
    // import keeps it out of 2.5D flat-mode's chunk (this line is already
    // past the flat-mode early return above) and out of the harness, which
    // never calls initializeStoreScene() at all. No-ops instantly when an
    // explicit bb_quality is set or a cached calibration still matches.
    const { calibrateQualityIfNeeded, armQualityBackstop } = await import('./quality-calibrate');
    await calibrateQualityIfNeeded();

    const { StoreScene } = await import('./three-scene');
    const scene = new StoreScene(canvasContainer, storeLibraries, logToConsole, jfUrl, jfToken, comingSoonMovies, discoveryMovies, storeGameMovies, staffPicks);
    armQualityBackstop();

    let lastLoggedPct = -1;
    scene.onTextureLoadProgress = (loaded, total) => {
      if (total === 0) return;
      const pct = Math.floor((loaded / total) * 100);
      if (pct !== lastLoggedPct && (pct % 10 === 0 || loaded === total)) {
        lastLoggedPct = pct;
        logToConsole(`[System] Loading store textures... ${pct}% (${loaded}/${total})`, 'system');
      }
    };

    // Wire up selection change callback
    scene.onSelectionChange = (movie) => {
      updateMovieHUD(movie);
    };

    // Episode list for the series-boxset side panel — fetched lazily, only
    // when a series is actually inspected (never at boot).
    scene.onFetchEpisodes = async (movie) => {
      if (isDemoMode) return makeSyntheticEpisodes(movie);
      const jellyfinUrl = localStorage.getItem('jellyfin_url');
      const token = localStorage.getItem('jellyfin_token');
      const userId = localStorage.getItem('jellyfin_userid');
      if (!jellyfinUrl || !token || !userId) return [];
      return fetchSeriesEpisodes(jellyfinUrl, token, userId, movie.id);
    };

    // Canvas click on an already-selected slot: confirm selection directly,
    // bypassing the global keyboard event path so no overlay state can intercept.
    scene.onBrowseConfirm = async () => {
      if (ui.isAnyOverlayOpen || ui.isPlaybackActive) return;
      const action = storeScene?.selectAction();
      const movie = storeScene?.getSelectedMovie();
      if (action === 'inspect') {
        updateMovieHUD(movie || null);
      } else if (action === 'play' && movie) {
        // Version choice resolves before the candy checkout / flourish — see
        // the onEnter play path.
        const version = await resolvePlayVersion(movie);
        if (version === null) return;
        const scene = storeScene;
        if (scene) {
          maybeRunCandyCheckout(() => {
            launchVideoPlayback(movie, undefined, undefined, true, false, version);
            scene.startPlayAnimation(() => { revealVideoPlayback(); });
          });
        } else {
          await launchVideoPlayback(movie, undefined, undefined, false, false, version);
        }
      } else if (action === 'request' && movie) {
        // Same explicit ORDER / NOT INTERESTED choice as the onEnter path.
        const choice = await resolveGapChoice(movie);
        if (choice === 'order') await handleDiscoveryRequest(movie);
        else if (choice === 'dismiss') handleGapDismiss();
      } else if (action === 'launch' && movie) {
        await handleGameLaunch(movie);
      }
    };

    // T22: checkout completed at the front counter — the carried titles'
    // ids arrive here. The T23 rental handoff (bb_rental write + fade into
    // the back room) runs inside StoreScene.finishCheckout, right after this
    // event fires, so it works identically in the harness.
    // Non-rental carry mode: checking out IS choosing tonight's movie, so
    // start playback of the checked-out title immediately through the normal
    // player path (launchVideoPlayback resolves a series to its selected/first
    // episode exactly like every other play entry point).
    scene.onCheckoutComplete = (items) => {
      logToConsole(`[System] Checkout complete: ${items.length} title(s) rented (${items.join(', ')}).`, 'system');
      if (scene.rentalMode || items.length === 0) return; // rental continues into the back room
      const movie = storeLibraries.flatMap((l) => l.movies).find((m) => m.id === items[0]);
      if (!movie) {
        logToConsole(`[Video] Checked-out title ${items[0]} not found in any library — cannot start playback.`, 'video');
        // The exit walk already carried the bag out under the whiteout —
        // without a player to open over it, fade back in at the doors.
        scene.returnToEntrance();
        return;
      }
      void launchVideoPlayback(movie);
    };

    // T22: carried-count changes retune the control hint (the route to the
    // counter appears with a tape in hand) and the checkout-shortcut pill.
    scene.onCarriedChange = () => {
      updateHUDForMode(scene.mode);
      refreshHoldCheckoutHint();
    };

    // T23: a rented tape confirmed from the couch (after the insert beat) —
    // start the in-app player in diegetic mode and map its <video> onto the
    // room's CRT. If the player never opened (no Jellyfin — external mpv
    // fallback), eject the tape so the room isn't stuck "watching" nothing.
    scene.onBackRoomPlay = (movie) => {
      void launchVideoPlayback(movie, undefined, undefined, false, true).then(() => {
        if (videoPlayer?.isOpen) {
          scene.attachBackRoomVideo(videoPlayer.videoElement);
        } else {
          scene.detachBackRoomVideo();
        }
      });
    };

    // Wire up state machine callbacks
    scene.onModeChange = (mode) => {
      logToConsole(`[System] Mode changed to: ${mode}`, 'system');
      // Set the generic per-mode hint first; for browse/inspect,
      // updateMovieHUD() below immediately refines it with movie-specific
      // detail (e.g. "coming soon" titles), so it must run last.
      updateHUDForMode(mode);
      if (mode === 'browse' || mode === 'inspect') {
        updateMovieHUD(storeScene?.getSelectedMovie() || null);
      }
    };

    // Left at the checkout counter reaches for the clerk's terminal.
    scene.onCounterTerminal = () => openCounterTerminal();
    scene.onEnterFlatMode = () => executePowerMenuAction('btn-flat-mode');

    // Library-select (end-cap) left/right nav arrows on the floating locator.
    // hasLeft/hasRight only apply while actually choosing a section, so the
    // arrows fade to nothing outside that mode instead of showing stale state.
    scene.onLibrarySelectUpdate = (libraryName, hasLeft, hasRight, hasUp, hasDown, visible) => {
      const leftArrow = document.getElementById('browse-locator-arrow-left');
      const rightArrow = document.getElementById('browse-locator-arrow-right');
      const upArrow = document.getElementById('browse-locator-arrow-up');
      const downArrow = document.getElementById('browse-locator-arrow-down');
      leftArrow?.classList.toggle('hidden', !(visible && hasLeft));
      rightArrow?.classList.toggle('hidden', !(visible && hasRight));
      upArrow?.classList.toggle('hidden', !(visible && hasUp));
      downArrow?.classList.toggle('hidden', !(visible && hasDown));

      if (visible) {
        const nameEl = document.getElementById('browse-locator-name');
        if (nameEl) nameEl.textContent = libraryName;
        browseHudName = libraryName; // keep the poll's last-written cache coherent
      }
    };

    scene.onGenreMenuUpdate = (libraryName, genres, selectedIdx, visible) => {
      const overlay = document.getElementById('genre-menu-overlay')!;
      if (!visible) {
        overlay.classList.remove('visible');
        return;
      }

      overlay.classList.add('visible');
      document.getElementById('genre-library-indicator')!.innerText = libraryName.toUpperCase();

      const listContainer = document.getElementById('genre-list-container')!;
      listContainer.innerHTML = '';

      genres.forEach((genre, idx) => {
        const item = document.createElement('div');
        item.className = 'genre-item';
        if (idx === selectedIdx) {
          item.className += ' selected';
        }
        item.innerText = genre.toUpperCase();

        item.addEventListener('click', () => {
          storeScene?.selectGenre(idx);
        });

        listContainer.appendChild(item);

        if (idx === selectedIdx) {
          item.scrollIntoView({ block: 'nearest' });
        }
      });
    };

    logToConsole('[System] Loading store textures...', 'system');

    scene.texturesReadyPromise.then(() => {
      storeScene = scene;
      (window as any).storeScene = storeScene;
      (window as any).librariesList = storeLibraries;

      // Re-apply the user's explicit live preferences (outside mode, library
      // view) to the fresh scene so a rebuild preserves them.
      applyLiveSettings(scene);

      updateMovieHUD(scene.getSelectedMovie());
      updateHUDForMode(scene.mode);
      scene.triggerLibrarySelectUpdate(true);

      // Keep the floating browse locator/hint fresh and faded in/out correctly
      // as menus, search, playback, etc. come and go. Runs frequently (rather
      // than being wired into every single overlay open/close call site) so
      // the fade reacts quickly no matter which path caused it.
      updateBrowseHUDVisibility();
      aisleIndicatorInterval = window.setInterval(updateBrowseHUDVisibility, 200);

      logToConsole('[System] All textures loaded. Store ready.', 'system');
      hideBootOverlay();
      // You've just come in through the doors — ring the entry chime. (May stay
      // silent if the browser hasn't seen a user gesture yet; that's fine.)
      scene.playDoorChime();

      // WebGL context-loss recovery. On a 24/7 kiosk the GPU context can be
      // lost (driver reset, GPU hang, VRAM pressure). Without handling this the
      // scene silently freezes/blanks forever. We can't cheaply restore all GPU
      // resources, so the simplest robust recovery is a full front-end reload.
      // Skip the auto-reload during active playback so we don't interrupt a
      // movie for a transient loss the player itself may survive.
      const glCanvas = canvasContainer.querySelector('canvas');
      glCanvas?.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        if (ui.isPlaybackActive) {
          // Don't interrupt the movie — but re-arm the reload so the store
          // doesn't come back as a permanently dead context when playback
          // ends (the player's onClose checks this flag). Issue #70.
          pendingContextLostReload = true;
          logToConsole('[System] WebGL context lost during playback — reload deferred to playback end.', 'system');
          return;
        }
        logToConsole('[System] WebGL context lost — restarting front-end...', 'system');
        setTimeout(() => location.reload(), 1000);
      });
    });

  } catch (err: any) {
    console.error('[System] Failed to initialize 3D Store Scene:', err);
    logToConsole(`[System] 3D graphics initialization failed: ${err.message || err}. Falling back to 2D UI.`, 'system');
    hideBootOverlay();
  }
}

async function waitForFontsAndInit() {
  if (document.fonts) {
    try {
      // Explicitly wait for the display face used in canvas texture rendering.
      // document.fonts.ready has a race condition with @import stylesheets — it can
      // resolve before the browser has even started fetching the font file, causing
      // canvas text to fall back to sans-serif and bake the wrong glyphs into textures.
      await document.fonts.load(`normal 16px ${BB_ARCHIVO_BLACK}`);
    } catch (e) {
      // Proceed even if the font fails to load rather than blocking the app.
    }
  }
  // The installed brand pack's manifest, BEFORE the font gate below: it may
  // declare faces of its own, and registering them here is what puts them in
  // bundledFontsReady()'s wait rather than a repaint that never comes. Never
  // rejects — no pack installed is the normal case (src/brand-pack.ts).
  await loadBrandPack();
  // Same reason, for the bundled display faces (Anton / Archivo Black / Outfit /
  // Orbitron / Yellowtail): most of the canvases that set them are painted once
  // into a texture cache and never repainted, so a face landing after the store
  // build bakes a fallback in permanently. These are local bundle assets, so
  // the wait is a decode, not a fetch.
  await bundledFontsReady();
  await initializeStoreScene();
}

// ─── Credentials / Boot ───────────────────────────────────────────────────────

/**
 * Shared "we're authenticated, now go load the store" tail used by both the
 * classic login form and the membership card picker (T17). Never stores a
 * password -- only the resulting session token/userid.
 */
async function finishLoginAndLaunch(urlInput: string, session: MembershipLoginSession) {
  logToConsole(`[System] Authenticated successfully as ${session.userName}.`, 'system');
  localStorage.setItem('jellyfin_url', urlInput);
  localStorage.setItem('jellyfin_token', session.accessToken);
  localStorage.setItem('jellyfin_userid', session.userId);
  localStorage.setItem('jellyfin_last_userid', session.userId); // remembered for next boot's card highlight

  logToConsole('[System] Downloading movie libraries and catalog metadata...', 'system');
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
    onLoginStall = () => reject(new Error(`No response from Jellyfin for ${LOGIN_STALL_MS / 1000}s`));
    armLoginStall();
  });
  try {
    [librariesList] = await Promise.all([
      Promise.race([
        fetchJellyfinLibrariesAndMovies(urlInput, session.accessToken, session.userId, armLoginStall),
        loginTimeout
      ]),
      loadComingSoonMovies(),
      loadDiscoveryMovies(),
      loadGameMovies()
    ]);
  } finally {
    if (loginStallTimer) clearTimeout(loginStallTimer);
  }
  const gapCount = await mergeCollectionGaps(librariesList);
  const totalMoviesCount = librariesList.reduce((acc, lib) => acc + lib.movies.length, 0);

  logToConsole(`[System] Loaded ${librariesList.length} libraries (${totalMoviesCount} titles total). Launching store...`, 'system');
  await logJellyseerrStatus(gapCount);
  if (gameMovies.length > 0) {
    logToConsole(`[System] Romm: ${gameMovies.length} game(s) loaded for the Video Games section.`, 'system');
  }
  hideLoginOverlay();
  // Bring the boot overlay back up as an opaque loading screen -- it stays
  // visible (see initializeStoreScene) until every cover texture has loaded.
  showBootOverlay();
  waitForFontsAndInit();
}

/**
 * Boot/re-login entry point (T17): if we know a server URL, try its public
 * user list first and show the fanned membership-card picker; only fall back
 * to the classic single-login form if the server has no saved URL yet, the
 * public user list is disabled, or it comes back empty (single-user server).
 */
async function showLoginOrCards(reason?: string) {
  if (isDemoMode) return; // the demo never logs in
  const savedUrl = localStorage.getItem('jellyfin_url');
  if (savedUrl) {
    try {
      const users = await fetchPublicUsers(savedUrl);
      if (users.length > 0) {
        if (reason) logToConsole(`[System] ${reason}`, 'system');
        logToConsole(`[System] Found ${users.length} membership card(s) on ${savedUrl}.`, 'system');
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
          log: (msg) => logToConsole(msg, 'system'),
        });
        return;
      }
    } catch (e: any) {
      logToConsole(`[System] Public user list unavailable (${e?.message ?? e}); falling back to login form.`, 'system');
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
function switchMember() {
  logToConsole('[System] Switching membership card...', 'system');
  localStorage.removeItem('jellyfin_token');
  localStorage.removeItem('jellyfin_userid');

  if (storeScene) {
    storeScene.destroy();
    storeScene = null;
  }
  if (aisleIndicatorInterval !== null) {
    clearInterval(aisleIndicatorInterval);
    aisleIndicatorInterval = null;
  }
  updateMovieHUD(null);
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
function startDemoAndLoad() {
  // First visit defaults to daytime out the windows (the scene otherwise
  // rolls day/night 50/50 per boot); user-changeable in Store Look after.
  if (!localStorage.getItem('bb_outside')) localStorage.setItem('bb_outside', 'day');
  logToConsole('[System] Demo mode: stocking the store with a placeholder library (no media server).', 'system');
  librariesList = buildDemoLibraries(900);
  gameMovies = buildDemoGames(60);
  waitForFontsAndInit();
}

async function checkCredentialsAndLoad() {
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
    logToConsole('[System] File credentials (.env.local) found. Authenticating automatically...', 'system');
    try {
      const session = await authenticateUser(envUrl, envUser, envPass);
      localStorage.setItem('jellyfin_url', envUrl);
      localStorage.setItem('jellyfin_username', envUser);
      localStorage.setItem('jellyfin_token', session.accessToken);
      localStorage.setItem('jellyfin_userid', session.userId);
      localStorage.setItem('jellyfin_last_userid', session.userId);
      jellyfinUrl = envUrl;
      token = session.accessToken;
      userId = session.userId;
      logToConsole(`[System] Auto-authenticated successfully as ${session.userName}.`, 'system');

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
      logToConsole(`[System] Auto-authentication from file credentials failed: ${err?.message || err}`, 'system');
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

  if (jellyfinUrl && token && userId) {
    logToConsole('[System] Saved Jellyfin credentials found. Connecting...', 'system');

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

    const attemptSync = async () => {
      if (escaped) return;

      const activeToken = localStorage.getItem('jellyfin_token') || token;
      const activeUserId = localStorage.getItem('jellyfin_userid') || userId;

      let stallTimer: ReturnType<typeof setTimeout> | null = null;
      let onStall: (() => void) | null = null;
      const armStall = () => {
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = setTimeout(() => onStall?.(), STALL_MS);
      };
      const stallPromise = new Promise<never>((_, reject) => {
        onStall = () => reject(new Error(`No response from Jellyfin for ${STALL_MS / 1000}s`));
        armStall();
      });

      try {
        [librariesList] = await Promise.all([
          Promise.race([
            fetchJellyfinLibrariesAndMovies(jellyfinUrl, activeToken, activeUserId, armStall),
            stallPromise
          ]),
          loadComingSoonMovies(),
          loadDiscoveryMovies(),
          loadGameMovies()
        ]);
        if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }

        if (escaped) return;

        document.removeEventListener('keydown', bootEscape);
        document.removeEventListener('click', bootEscape);
        if (retryTimeoutId) {
          clearTimeout(retryTimeoutId);
          retryTimeoutId = null;
        }

        const gapCount = await mergeCollectionGaps(librariesList);
        const totalMoviesCount = librariesList.reduce((acc, lib) => acc + lib.movies.length, 0);
        logToConsole(`[System] Connected to Jellyfin. Sync'd ${librariesList.length} libraries (${totalMoviesCount} movies total).`, 'system');
        await logJellyseerrStatus(gapCount);
        if (gameMovies.length > 0) {
          logToConsole(`[System] Romm: ${gameMovies.length} game(s) loaded for the Video Games section.`, 'system');
        }

        hideLoginOverlay(); // in case user clicked to dismiss boot screen
        closeMembershipCardPicker();
        // Boot overlay stays up (see waitForFontsAndInit/initializeStoreScene) until
        // every cover texture has loaded, so the store is never revealed mid-load.
        waitForFontsAndInit();
      } catch (err: any) {
        if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
        if (escaped) return;

        const msg = err?.message ?? (typeof err === 'string' ? err : String(err));
        logToConsole(`[System] Auto-login failed: ${msg}. Retrying in ${currentDelay / 1000}s...`, 'system');

        retryTimeoutId = setTimeout(async () => {
          if (escaped) return;

          // Before each retry, check if cached token fails validation. If so, attempt to re-auth from cached credentials.
          const freshToken = localStorage.getItem('jellyfin_token') || token;
          try {
            const isValid = await validateToken(jellyfinUrl, freshToken);
            if (!isValid) {
              const user = localStorage.getItem('jellyfin_username') || envUser;
              const pass = localStorage.getItem('jellyfin_password') || envPass;
              if (user && pass && jellyfinUrl) {
                logToConsole('[System] Jellyfin token stale — re-authenticating...', 'system');
                const session = await authenticateUser(jellyfinUrl, user, pass);
                localStorage.setItem('jellyfin_token', session.accessToken);
                localStorage.setItem('jellyfin_userid', session.userId);
                logToConsole('[System] Re-auth OK.', 'system');
              }
            }
          } catch (e: any) {
            logToConsole(`[System] Silent re-auth check failed: ${e.message || e}`, 'system');
          }

          // Double the delay for exponential backoff up to the cap
          const nextDelay = Math.min(currentDelay * 2, MAX_DELAY);
          currentDelay = nextDelay;

          attemptSync();
        }, currentDelay);
      }
    };

    attemptSync();
  } else {
    logToConsole('[System] No saved credentials. Showing Login screen.', 'system');
    document.removeEventListener('keydown', bootEscape);
    document.removeEventListener('click', bootEscape);
    setTimeout(() => { hideBootOverlay(); showLoginOrCards(); }, 500);
  }
}

function setupLoginHandlers() {
  const form = document.getElementById('login-form') as HTMLFormElement;
  const errorMsg = document.getElementById('login-error-msg') as HTMLDivElement;

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

      try {
        logToConsole(`[System] Contacting Jellyfin server: ${urlInput}`, 'system');
        const session = await authenticateUser(urlInput, userInput, passInput);

        // Only the manual single-login form remembers username (to prefill);
        // the password is never persisted in plaintext localStorage.
        localStorage.setItem('jellyfin_username', userInput);

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
        logToConsole(`[System] Connection error: ${err.message}`, 'system');
        if (errorMsg) {
          let userMsg = err.message || 'Failed to connect to Jellyfin server';
          if (userMsg.includes('HTTP error 401')) {
            userMsg = 'Invalid username or password.';
          } else if (userMsg.includes('Failed to fetch') || userMsg.includes('NetworkError')) {
            userMsg = `Unable to connect to "${urlInput}". Check the server address, CORS settings, and verify Jellyfin is online.`;
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

// ─── Power Action ─────────────────────────────────────────────────────────────

async function executePowerMenuAction(btnId: string) {
  switch (btnId) {
    case 'btn-settings':
      openSettingsDrawer();
      return;

    case 'btn-service':
      // MANAGER OVERRIDE (counter CRT only): straight onto the staff-only
      // SERVICE MODE page — the hidden developer/service knobs.
      openSettingsDrawer('Service');
      return;

    case 'btn-flat-mode':
      // Diegetic 2D-kiosk switch: flip the store into the flat "2.5D Shelf
      // Explorer" in-process — no reload, no Jellyfin re-fetch. switchRenderMode
      // tears the 3D scene down and rebuilds flat from the loaded catalog.
      await switchRenderMode('flat');
      return;

    case 'btn-suspend':
      closePowerMenu();
      if (!isTauri) {
        logToConsole('[Power] Suspend not available outside Tauri.', 'cec');
        break;
      }
      logToConsole('[Power] Invoking suspend_system...', 'cec');
      try {
        const res = await invoke<string>('suspend_system');
        logToConsole(`[Power] suspend_system result: ${res}`, 'cec');
      } catch (e) {
        logToConsole(`[Power] Failed to suspend: ${e}`, 'cec');
      }
      break;

    case 'btn-cec-toggle': {
      // One row, both directions (review §4.6): standby if we believe the
      // display is on, wake otherwise — see cecDisplayAssumedOn above.
      if (!isTauri) {
        logToConsole('[CEC] CEC not available outside Tauri.', 'cec');
        break;
      }
      const action = cecDisplayAssumedOn ? 'sleep' : 'wake';
      cecDisplayAssumedOn = !cecDisplayAssumedOn;
      logToConsole(`[CEC] Sending ${action === 'sleep' ? 'standby' : 'active source'} CEC commands...`, 'cec');
      try {
        const res = await invoke<string>('execute_cec_command', { action });
        logToConsole(`[CEC] result: ${res}`, 'cec');
      } catch (e) {
        logToConsole(`[CEC] Error: ${e}`, 'cec');
      }
      break;
    }

    case 'btn-logout':
      if (isDemoMode) break; // no session in the demo (button is hidden too)
      logToConsole('[System] Logging out and resetting Jellyfin session...', 'system');
      localStorage.removeItem('jellyfin_url');
      localStorage.removeItem('jellyfin_username');
      localStorage.removeItem('jellyfin_password');
      localStorage.removeItem('jellyfin_token');
      localStorage.removeItem('jellyfin_userid');
      
      if (storeScene) {
        storeScene.destroy();
        storeScene = null;
      }
      if (aisleIndicatorInterval !== null) {
        clearInterval(aisleIndicatorInterval);
        aisleIndicatorInterval = null;
      }
      updateMovieHUD(null);
      showLoginOverlay();
      break;

    case 'btn-exit':
      if (isDemoMode) break; // nothing to close in the demo (button is hidden too)
      logToConsole(`[System] ${brandString('app-closing-log', 'Closing Halcyon app...')}`, 'system');
      setTimeout(() => {
        closeApp();
      }, 500);
      break;

    case 'btn-cancel':
      closePowerMenu();
      return;
  }
}

// ─── Not-in-stock case requests ────────────────────────────────────────────

/**
 * The not-in-stock case's equivalent of "checkout": the same deliberate
 * confirm press used to rent a normal title instead sends a real Jellyseerr
 * request. Plays the existing checkout chime on success and restyles the
 * in-store case (both live, via StoreScene.markDiscoveryRequested, and
 * persisted, via jellyseerr.ts's localStorage-backed request-id set) so the
 * state survives a reload. Never throws -- logs and leaves the case
 * unrequested on failure so the player can just try again.
 */
async function handleDiscoveryRequest(movie: Movie) {
  if (typeof movie.tmdbId !== 'number') {
    logToConsole(`[System] "${movie.title}" can't be requested (missing TMDB id).`, 'system');
    return;
  }
  logToConsole(`[System] Requesting "${movie.title}" through Jellyseerr...`, 'system');
  // StoreScene.orderTitle owns the flow (POST, chime, case restyle, and the
  // clerk's "we don't have any copies" line for collection gaps) so the
  // harness/demo input path stays identical to this one. This handler only
  // runs from 3D-scene action callbacks, but keep a bare-request fallback so
  // a missing scene degrades to the old behavior instead of a dead button.
  const ok = storeScene
    ? await storeScene.orderTitle(movie)
    : await requestMovie(movie.tmdbId);
  if (ok) {
    movie.discoveryRequested = true; // keep this session's in-memory Movie in sync immediately
    logToConsole(`[System] Requested "${movie.title}" -- it'll show as REQUESTED here once it's picked up.`, 'system');
    updateMovieHUD(movie);
  } else {
    logToConsole(`[System] Failed to request "${movie.title}" (Jellyseerr unreachable or rejected the request).`, 'system');
  }
}

/**
 * "Not interested" (X) on an inspected not-in-stock case (missing collection
 * entry or inline discovery suggestion): the scene owns the whole flow
 * (persist the dismissed tmdbId, drop the case from the shelf live, clerk
 * line) — see StoreScene.dismissGapTitle. Guarded no-op for anything that
 * isn't an un-ordered shelved case, so the key is safe to press anywhere.
 */
function handleGapDismiss() {
  if (!storeScene || storeScene.mode !== 'inspect') return;
  const movie = storeScene.getSelectedMovie();
  if (!movie?.collectionGap && !movie?.discovery) return;
  if (storeScene.dismissGapTitle(movie)) {
    logToConsole(`[System] "${movie.title}" won't be stocked or suggested again.`, 'system');
    updateMovieHUD(storeScene.getSelectedMovie() || null);
  }
}

// ─── T18: Renting a game -> launch the emulator ─────────────────────────────
/**
 * The game-section equivalent of "checkout": renting a game shells out to the
 * configured emulator (Tauri only, via Tauri's argument-array spawn so the rom
 * path can never inject shell syntax), or — without one — opens the rom in
 * Romm's built-in browser emulator (EmulatorJS). Only mock/demo games with no
 * Romm server behind them fall back to the "take it to the counter" message.
 * Plays the checkout chime whenever the rental goes through. Never throws.
 */
async function handleGameLaunch(movie: Movie) {
  logToConsole(`[System] Renting "${movie.title}" (${movie.platform || 'game'})...`, 'system');
  const result = await launchGame(movie);
  if (result === 'launched') {
    retailAudio.playCheckoutChime();
    logToConsole(`[System] Launching "${movie.title}" in the emulator...`, 'system');
  } else if (result === 'webplayer') {
    retailAudio.playCheckoutChime();
    logToConsole(`[System] "${movie.title}" is playing in the Romm browser emulator — check the new tab.`, 'system');
  } else if (result === 'browser') {
    retailAudio.playCheckoutChime();
    logToConsole(`[System] "${movie.title}" is ready — take it to the counter to play (emulator launch is only available in the desktop app).`, 'system');
  } else {
    logToConsole(`[System] Couldn't launch "${movie.title}" — check the Romm launch command in settings.`, 'system');
  }
}

// ─── Video Playback ───────────────────────────────────────────────────────────

// Silent token/library resilience on wake (issue #16). A days-idle box holds a
// token the server may have rotated; validate it and, if stale, re-auth from
// the cached credentials and refresh localStorage (the playback path reads the
// token live from localStorage, so this heals streaming without a reload).
// Any network blip is swallowed — a wake must never wedge the UI.
let wakeRefreshInFlight = false;
async function wakeRefresh() {
  if (wakeRefreshInFlight) return;
  const url = localStorage.getItem('jellyfin_url');
  const token = localStorage.getItem('jellyfin_token');
  if (!url || !token) return;
  wakeRefreshInFlight = true;
  try {
    // validateToken resolves false only on a definitive 401/403; a merely
    // unreachable/wedged server throws instead and lands in the catch below,
    // so a network blip can never trigger the logout teardown (issue #125).
    if (await validateToken(url, token)) return; // still good — nothing to do
    logToConsole('[System] Jellyfin token stale after idle — returning to login screen.', 'system');
    
    // Clear stale token/userid credentials
    localStorage.removeItem('jellyfin_token');
    localStorage.removeItem('jellyfin_userid');
    
    if (storeScene) {
      storeScene.destroy();
      storeScene = null;
    }
    if (aisleIndicatorInterval !== null) {
      clearInterval(aisleIndicatorInterval);
      aisleIndicatorInterval = null;
    }
    updateMovieHUD(null);
    
    void showLoginOrCards('Session expired. Please log in again.');
  } catch {
    logToConsole('[System] Wake token check failed (will retry on next wake).', 'system');
  } finally {
    wakeRefreshInFlight = false;
  }
}


// ─── Video Playback ───────────────────────────────────────────────────────────

// `diegetic` (T23): the movie is presented on the back room's CRT screen plane
// instead of the fullscreen surface — the player overlay opens transparent
// (controls only, hideVideoSurface) and the 3D scene keeps rendering in the
// VIDEO tier. The caller attaches videoPlayer.videoElement to the room after
// this resolves; onClose detaches it and stays in the room.
// `version` (4K/1080p picker, see resolvePlayVersion): the specific quality
// version to stream. Absent on a multi-version title, the movie's own item /
// default media source plays — callers that can't sensibly show the picker
// (checkout-complete autoplay, the back-room couch) just get the default.
// Up-next queue for the series currently playing: the full episode list, in
// season-then-episode order (see fetchSeriesEpisodes), so an episode running to
// its end rolls into the next one — across season boundaries too. Rebuilt on
// every launch; a movie clears it.
let seriesQueue: { seriesId: string; episodes: Episode[] } | null = null;

/** The episode after `currentItemId` in the active series queue, if any. */
function nextEpisodeInQueue(movie: Movie, currentItemId: string): Episode | null {
  if (!movie.isSeries || seriesQueue?.seriesId !== movie.id) return null;
  const i = seriesQueue.episodes.findIndex((e) => e.id === currentItemId);
  return i >= 0 ? (seriesQueue.episodes[i + 1] ?? null) : null;
}

/** "S02E05 · Title" for console/log lines. */
function episodeLabel(ep: Episode): string {
  const num = `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`;
  return ep.name ? `${num} · ${ep.name}` : num;
}

export async function launchVideoPlayback(movie: Movie, overrideItemId?: string, overridePath?: string, startHidden = false, diegetic = false, version?: MovieVersion) {
  revealPendingHidden = false; // fresh launch — clear any stale reveal handshake

  // Demo mode: no media server, so no stream. Diegetic (back-room CRT) callers
  // check videoPlayer.isOpen right after this resolves and eject the tape
  // gracefully when the player never opened — keep that path overlay-free.
  // Everything else lands on the fullscreen PLAYBACK DISABLED card instead.
  if (isDemoMode) {
    if (diegetic) {
      logToConsole(`[Video] Demo mode: no media server to stream "${movie.title}" — the tape ejects.`, 'video');
      return;
    }
    openDemoPlaybackOverlay(movie, startHidden);
    return;
  }

  // Ensure the token is valid/refreshed before starting playback — but never
  // let a slow/wedged server hold the play action hostage (issue #125): after
  // a short grace period proceed with the cached token; wakeRefresh keeps
  // running in the background and heals a genuinely stale token on its own.
  await Promise.race([wakeRefresh(), new Promise<void>((resolve) => setTimeout(resolve, 1500))]);

  // A series with no specific episode resolves one from the 3D boxset: the
  // episode highlighted on the boxset's episode-list face if that's what the
  // user confirmed, otherwise the season's first episode (play-season face,
  // search selections, any other caller). This replaces the old DOM episode
  // picker overlay — the boxset side panel IS the picker now.
  if (movie.isSeries && !overrideItemId) {
    const selected = storeScene?.getSelectedEpisode();
    if (selected) {
      overrideItemId = selected.id;
      overridePath = selected.path || undefined;
    } else {
      const jellyfinUrl = localStorage.getItem('jellyfin_url');
      const token = localStorage.getItem('jellyfin_token');
      const userId = localStorage.getItem('jellyfin_userid');
      const first = (jellyfinUrl && token && userId)
        ? await fetchFirstEpisodeOfSeries(jellyfinUrl, token, userId, movie.id)
        : null;
      if (!first) {
        logToConsole(`[Video] Could not resolve an episode for "${movie.title}".`, 'video');
        return;
      }
      overrideItemId = first.id;
      overridePath = first.path || undefined;
    }
  }

  // An episode override (series) always wins; otherwise a picked version's
  // item + media source; otherwise the movie's own item.
  if (overrideItemId) version = undefined;
  const playbackId = overrideItemId || version?.itemId || movie.id;
  const mediaSourceId = version?.mediaSourceId;
  const localPath = overridePath || version?.localPath || movie.localPath;

  const jellyfinUrl = localStorage.getItem('jellyfin_url');
  const token = localStorage.getItem('jellyfin_token');
  const userId = localStorage.getItem('jellyfin_userid');

  // Without a Jellyfin endpoint there's nothing to stream into the webview —
  // fall back to the external player on the original file.
  if (!jellyfinUrl || !token) {
    logToConsole('[Video] No Jellyfin stream available; using external player.', 'video');
    await playExternally(localPath);
    return;
  }

  // Build the up-next queue. The inspected boxset already fetched the episode
  // list, so reuse it; every other entry point (search, checkout autoplay, the
  // back-room couch, an auto-advance step) fetches it once here.
  if (movie.isSeries) {
    let episodes = storeScene?.getSeriesEpisodes(movie.id) ?? null;
    if (!episodes?.length && userId) {
      episodes = await fetchSeriesEpisodes(jellyfinUrl, token, userId, movie.id);
    }
    seriesQueue = episodes?.length ? { seriesId: movie.id, episodes } : null;
  } else {
    seriesQueue = null;
  }

  // Local playback first. When the file is on this machine, mpv plays it
  // directly — the only path that gives real HDR and the original soundtrack,
  // and the only one that doesn't have Jellyfin spooling the film to disk as
  // it goes. Falls through to in-app streaming when there's no local path, no
  // local endpoint (production bundle), or the file is outside the media roots.
  // Diegetic (back-room CRT) playback is excluded: that one has to render into
  // a texture inside the scene, which an external window can't do.
  // /__play spawns mpv on the machine running the vite server, so a browser
  // visiting over the network (tailscale IP) must never take this branch —
  // it would start the movie on the server's screen, not the viewer's.
  // A Remote Play session defeats that hostname test on its own: the browser
  // driving it IS this machine's kiosk (or a headless instance on it), while
  // the human is somewhere else entirely — isRemotelyDriven() is what sees it.
  const clientIsServerMachine =
    isTauri || ['localhost', '127.0.0.1', '::1', '[::1]'].includes(window.location.hostname);
  if (localPath && !diegetic && clientIsServerMachine && !isRemotelyDriven()
      && getSetting<boolean>('bb_local_mpv') !== false) {
    const spawnMpv = async (): Promise<boolean> => {
      const started = await playLocalWithMpv(localPath, playbackId, 0, () => {
        ui.isPlaybackActive = false;
        storeScene?.resumeRendering();
        storeScene?.resumeAmbientTvs();
        storeScene?.returnToEntrance();
        updateMovieHUD(storeScene?.getSelectedMovie() || null);
        logToConsole(`[Video] Stopped "${movie.title}". Returned through the entrance.`, 'video');
      });
      if (started) {
        // The store is behind a fullscreen window now — stop drawing it.
        storeScene?.pauseAmbientTvs();
        storeScene?.pauseRendering();
      }
      return started;
    };
    // mpv is an external window — it can't open hidden the way the in-app
    // player can, so spawning it during the play flourish would slam it over
    // the tape-into-bag/carry-out ritual and pause the store mid-animation.
    // Park the spawn until revealVideoPlayback() fires at the end of the
    // walk-out; the flourish's whiteout masks mpv's startup beat.
    if (startHidden && !revealPendingHidden) {
      ui.isPlaybackActive = true; // input stays locked while the flourish runs
      pendingHiddenMpvLaunch = async () => {
        if (await spawnMpv()) return;
        // The local endpoint refused/vanished during the flourish — fall back
        // to the in-app player, revealed immediately (the ritual already ran).
        ui.isPlaybackActive = false;
        await launchVideoPlayback(movie, overrideItemId, overridePath, false, false, version);
      };
      return;
    }
    if (await spawnMpv()) {
      // The flourish may have already finished (revealPendingHidden) — mpv is
      // up now, so that pending reveal is satisfied.
      revealPendingHidden = false;
      return;
    }
  }

  ui.isPlaybackActive = true;

  const staticSrc = buildStaticStreamUrl(jellyfinUrl, token, playbackId, mediaSourceId);

  // Decide direct-play vs. HLS transcode from the item's real container/codecs
  // BEFORE playing: WebKitGTK silently drops audio tracks whose codec isn't in
  // its allowlist (AC3/EAC3/DTS, typical movie-rip audio) with no error, so
  // the player's own direct→HLS error fallback never has a chance to trigger.
  // Movies carry this info from the catalog sync (Fields=MediaSources); a
  // series episode (overrideItemId) isn't in the catalog, so probe it here.
  const mediaInfo: MediaPlaybackInfo | undefined = overrideItemId
    ? (userId ? await fetchItemPlaybackInfo(jellyfinUrl, token, userId, playbackId) : undefined)
    : (version?.mediaPlaybackInfo ?? movie.mediaPlaybackInfo);
  // Codec hint for buildHlsStreamUrl: HEVC sources get hevc pass-through
  // (fMP4) when the webview can decode it; everything else stays on TS.
  const sourceVideoCodec = mediaInfo?.videoCodec;

  // Track picker data: the item's audio/subtitle streams came in with the
  // catalog (Fields=MediaSources). For a series episode played by override id
  // the series container has no streams — the picker then offers quality only
  // and the Playback language/CC preferences below can't resolve a track.
  const streams = (overrideItemId ? [] : (version?.mediaStreams ?? movie.mediaStreams)) || [];
  const trackLabel = (s: { displayTitle?: string; language?: string; index: number }) =>
    s.displayTitle || s.language || `Track ${s.index}`;
  const audioTracks = streams.filter((s) => s.type === 'Audio').map((s) => ({ index: s.index, label: trackLabel(s) }));
  const subtitleTracks = streams.filter((s) => s.type === 'Subtitle').map((s) => ({ index: s.index, label: trackLabel(s) }));

  // Playback preferences (Settings ▸ Playback): resolve the preferred audio
  // language and default-captions state to concrete stream indices BEFORE the
  // first stream URL is built, so they hold from frame one rather than only
  // after a round-trip through the picker. Jellyfin's Language is usually an
  // ISO 639-2 code ("eng"), but users type anything from "en" to "English",
  // so match code prefixes and the display title.
  const prefLang = String(getSetting<string>('bb_audio_lang') ?? '').trim().toLowerCase();
  const matchesPrefLang = (s: { language?: string; displayTitle?: string }): boolean => {
    if (!prefLang) return false;
    const lang = (s.language ?? '').toLowerCase();
    if (lang && (lang.startsWith(prefLang) || prefLang.startsWith(lang))) return true;
    return (s.displayTitle ?? '').toLowerCase().includes(prefLang);
  };
  const audioStreams = streams.filter((s) => s.type === 'Audio');
  const containerDefaultAudio = audioStreams.find((s) => s.isDefault) ?? audioStreams[0];
  const preferredAudio = audioStreams.find(matchesPrefLang);
  // The container's default track plays without any index override — only a
  // DIFFERENT track needs one (and with it, the transcode path).
  const initialAudioIndex =
    preferredAudio && preferredAudio.index !== containerDefaultAudio?.index ? preferredAudio.index : undefined;
  const wantSubtitles = getSetting<boolean>('bb_subtitles_default');
  const subtitleStreams = streams.filter((s) => s.type === 'Subtitle');
  const initialSubtitleIndex = wantSubtitles
    ? (subtitleStreams.find(matchesPrefLang) ?? subtitleStreams.find((s) => s.isDefault) ?? subtitleStreams[0])?.index
    : undefined;
  if (initialAudioIndex !== undefined || initialSubtitleIndex !== undefined) {
    logToConsole(
      `[Video] Playback prefs: audio=${initialAudioIndex !== undefined ? trackLabel(preferredAudio!) : 'default'}, ` +
        `subtitles=${initialSubtitleIndex !== undefined ? 'on' : 'off'}.`,
      'video',
    );
  }

  // Direct play can't switch audio tracks, and default-on subtitles are
  // burned in server-side (SubtitleMethod=Encode) — either preference
  // forces the HLS transcode path.
  const directPlayable = isDirectPlaySafe(mediaInfo) && initialAudioIndex === undefined && initialSubtitleIndex === undefined;
  const hlsSrc = buildHlsStreamUrl(jellyfinUrl, token, playbackId, {
    sourceVideoCodec,
    mediaSourceId,
    audioStreamIndex: initialAudioIndex,
    subtitleStreamIndex: initialSubtitleIndex,
  });
  const hevcCopy = isHevcPassThroughEnabled() && (sourceVideoCodec === 'hevc' || sourceVideoCodec === 'h265');
  const mediaInfoSummary =
    `container=${mediaInfo?.container ?? 'unknown'} video=${mediaInfo?.videoCodec ?? 'unknown'} ` +
    `audio=${mediaInfo?.audioCodecs?.length ? mediaInfo.audioCodecs.join(',') : 'unknown'}`;

  logToConsole(
    `[Video] Streaming "${movie.title}"${version ? ` [${version.label}]` : ''} in-app (${directPlayable ? 'direct play' : `HLS, hevc pass-through ${hevcCopy ? 'on' : 'off'}`}): ${mediaInfoSummary}.`,
    'video',
  );
  // Fire-and-forget: awaiting here would sever the user-gesture chain before
  // video.play(), tripping autoplay policy. (It never rejects — errors are
  // caught and logged inside.)
  void reportPlaybackStart(jellyfinUrl, token, playbackId);

  // Yield GPU/CPU to the decoder (only if not hidden). Diegetic playback
  // keeps the renderer alive — the room IS the screen (ambient TVs are
  // already paused for the lockout).
  if (!diegetic && !startHidden) {
    storeScene?.pauseAmbientTvs();
    storeScene?.pauseRendering();
  }

  videoPlayer?.open({
    hlsSrc,
    staticSrc,
    directPlayable,
    mediaInfoSummary,
    title: movie.title,
    audioTracks,
    subtitleTracks,
    defaultAudioIndex: initialAudioIndex,
    defaultSubtitleIndex: initialSubtitleIndex,
    subtitlesDefaultOn: wantSubtitles,
    hideVideoSurface: diegetic,
    // Non-diegetic playback exits through returnToEntrance() (onClose below)
    // — gate user-initiated exits behind an "are you sure?" so a Back meant
    // to dismiss the controls doesn't dump the viewer at the storefront.
    // Couch playback (diegetic) just returns to the room, no confirm needed.
    confirmExit: !diegetic,
    buildStream: (sel) => buildHlsStreamUrl(jellyfinUrl, token, playbackId, { ...sel, sourceVideoCodec, mediaSourceId }),
    log: (msg) => logToConsole(msg, 'video'),
    onProgress: (positionTicks, isPaused) => {
      reportPlaybackProgress(jellyfinUrl, token, playbackId, positionTicks, isPaused);
    },
    onClose: (positionTicks, endedNaturally) => {
      ui.isPlaybackActive = false;
      if (pendingContextLostReload) {
        // The WebGL context died while the movie played; the store behind the
        // player is a dead canvas. Report the stop, then take the reload we
        // deferred instead of "resuming" a frozen scene. Issue #70.
        reportPlaybackStopped(jellyfinUrl, token, playbackId, positionTicks);
        logToConsole('[System] Applying deferred context-loss reload...', 'system');
        setTimeout(() => location.reload(), 250);
        return;
      }
      // Optimistic local watch-state update (feedback/055): reportPlaybackStopped
      // below is fire-and-forget and nothing re-fetches the library afterwards,
      // so without this the Movie object StoreScene already holds a reference
      // to never learns it was watched this session — the PREVIOUSLY VIEWED
      // drape table (pv-drape-table.ts) would stay frozen at whatever watch
      // history existed at boot. Only a natural end counts as "watched":
      // backing out early shouldn't bump play count or reorder the table.
      // restockSlottedFixtures() patches the already-built table in place
      // (see its header in store-stock.ts) — cheap enough to call here, before
      // the store is shown again below, so any texture swap is invisible.
      if (endedNaturally) {
        movie.played = true;
        movie.playCount = (movie.playCount ?? 0) + 1;
        movie.lastPlayedDate = new Date().toISOString();
        storeScene?.restockSlottedFixtures();
      }
      // A series behaves like a series: an episode that plays to the end rolls
      // straight into the next one (including into the next season — the queue
      // is season-then-episode ordered). Backing out early means "I'm done",
      // so only a natural end advances. The player reuses one <video> element,
      // so a diegetic (back-room CRT) advance keeps its existing VideoTexture
      // mapping — no re-attach needed. startHidden stays false: the tape
      // animation is the gesture for STARTING a title, not for continuing one.
      const nextEp = endedNaturally ? nextEpisodeInQueue(movie, playbackId) : null;
      if (nextEp) {
        reportPlaybackStopped(jellyfinUrl, token, playbackId, positionTicks);
        logToConsole(`[Video] "${movie.title}" — up next: ${episodeLabel(nextEp)}.`, 'video');
        // Diegetic playback keeps the room on screen (the overlay is
        // transparent there), so only the fullscreen path bridges the gap.
        if (!diegetic) videoPlayer?.beginTransition(`Up next — ${episodeLabel(nextEp)}`);
        void launchVideoPlayback(movie, nextEp.id, nextEp.path || undefined, false, diegetic)
          .finally(() => {
            // The next episode bailed before opening (no stream, external
            // fallback): drop the holding overlay so the store isn't stuck
            // behind a dead spinner.
            if (!videoPlayer?.isOpen) videoPlayer?.endTransition();
          });
        return;
      }
      // T23: stopping a couch movie returns to the room view (the CRT goes
      // dark, the tape ejects) — never through the store entrance, and the
      // renderer/ambient state was never paused for diegetic playback.
      if (diegetic) {
        storeScene?.detachBackRoomVideo();
        reportPlaybackStopped(jellyfinUrl, token, playbackId, positionTicks);
        logToConsole(`[Video] Stopped "${movie.title}". Back on the couch.`, 'video');
        return;
      }
      storeScene?.resumeRendering();
      storeScene?.resumeAmbientTvs();
      // Fade back in from white standing at the entrance, in library-select
      // so shelves can be picked right away.
      storeScene?.returnToEntrance();
      updateMovieHUD(storeScene?.getSelectedMovie() || null);
      reportPlaybackStopped(jellyfinUrl, token, playbackId, positionTicks);
      logToConsole(`[Video] Stopped "${movie.title}". Returned through the entrance.`, 'video');
    },
    onFatalError: () => {
      logToConsole('[Video] In-app playback failed; opening external player.', 'video');
      videoPlayer?.close(); // restores HUD + resumes rendering via onClose
      playExternally(localPath || staticSrc);
    },
  }, startHidden);

  // The play animation may already have finished while we waited on
  // wakeRefresh — its reveal no-op'd against a not-yet-open player, so
  // perform the reveal it left pending now that the player exists.
  if (startHidden && revealPendingHidden) revealVideoPlayback();
}

// Set when the play animation finishes before the hidden player has opened
// (e.g. wakeRefresh ate its grace period above) so launchVideoPlayback can
// perform the reveal itself once the player is ready — otherwise the player
// would open hidden with no reveal trigger left (issue #125).
let revealPendingHidden = false;

// A hidden mpv launch parked until the play flourish finishes: the external
// window can't be "revealed" like the in-app player, it has to be spawned at
// reveal time. Set only while the flourish runs; consumed (or replaced by the
// next launch) in revealVideoPlayback().
let pendingHiddenMpvLaunch: (() => Promise<void>) | null = null;

// ─── Demo playback block ─────────────────────────────────────────────────────
// The public demo has no media server, so every non-diegetic play lands on a
// fullscreen PLAYBACK DISABLED card instead of a stream. It follows the real
// player's lifecycle: honors startHidden until revealVideoPlayback() (so the
// walk-to-the-exit play animation still runs over a live scene), pauses
// rendering while up, and closes through the same Back/Power input paths and
// return-to-entrance tail the real player's onClose uses. Open/closed state
// rides on ui.isPlaybackActive — in demo mode the real player never opens.

function ensureDemoPlaybackOverlay(): HTMLElement {
  let el = document.getElementById('demo-playback-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'demo-playback-overlay';
    // Same layer as the real player overlay (above the exit-door whiteout).
    el.style.cssText =
      'position:fixed;inset:0;z-index:2000;background:#000;display:none;' +
      'align-items:center;justify-content:center;text-align:center;';
    el.innerHTML = `
      <div>
        <h1 style="font-family:${BB_ARCHIVO_BLACK},sans-serif;color:#ffa903;font-size:clamp(36px,6vw,84px);letter-spacing:0.06em;margin:0;">PLAYBACK DISABLED</h1>
        <p style="color:#8fa3c8;font-family:'Courier New',monospace;font-size:clamp(13px,1.5vw,19px);letter-spacing:0.25em;margin:20px 0 0;">THIS PUBLIC DEMO HAS NO MEDIA SERVER</p>
        <p style="color:#55607a;font-family:'Courier New',monospace;font-size:12px;letter-spacing:0.25em;margin:34px 0 0;">PRESS ESC — OR CLICK — TO RETURN TO THE STORE</p>
      </div>`;
    // Mouse-only demo visitors have no Back/Esc habit; any click dismisses.
    el.addEventListener('click', () => closeDemoPlaybackOverlay());
    document.body.appendChild(el);
  }
  return el;
}

function openDemoPlaybackOverlay(movie: Movie, startHidden: boolean) {
  ensureDemoPlaybackOverlay();
  ui.isPlaybackActive = true;
  logToConsole(`[Video] Demo mode: playback of "${movie.title}" is disabled (no media server).`, 'video');
  // Hidden launches are revealed by revealVideoPlayback() when the play
  // animation finishes — exactly like the real player's startHidden open.
  if (!startHidden) revealDemoPlaybackOverlay();
}

function revealDemoPlaybackOverlay() {
  // Same yields as the real reveal: park the renderer behind the card.
  storeScene?.pauseAmbientTvs();
  storeScene?.pauseRendering();
  ensureDemoPlaybackOverlay().style.display = 'flex';
}

function closeDemoPlaybackOverlay() {
  ui.isPlaybackActive = false;
  ensureDemoPlaybackOverlay().style.display = 'none';
  // Mirror the real player's onClose tail: resume rendering and fade back in
  // from white standing at the entrance, in library-select.
  storeScene?.resumeRendering();
  storeScene?.resumeAmbientTvs();
  storeScene?.returnToEntrance();
  updateMovieHUD(storeScene?.getSelectedMovie() || null);
  logToConsole('[Video] Demo playback screen dismissed. Returned through the entrance.', 'video');
}

/** Reveal the video player once the 3D transition animation finishes. */
function revealVideoPlayback() {
  // A hidden mpv launch parked itself until the flourish finished — spawn the
  // external player now (the flourish's whiteout is covering the screen).
  if (pendingHiddenMpvLaunch) {
    const launch = pendingHiddenMpvLaunch;
    pendingHiddenMpvLaunch = null;
    void launch();
    return;
  }
  // Demo launches never open the real player — reveal the disabled card the
  // same way the real path reveals the hidden player.
  if (isDemoMode && ui.isPlaybackActive && !videoPlayer?.isOpen) {
    revealDemoPlaybackOverlay();
    return;
  }
  if (!ui.isPlaybackActive || !videoPlayer?.isOpen) {
    revealPendingHidden = true;
    return;
  }
  revealPendingHidden = false;

  // Now perform the standard transition/pausing
  storeScene?.pauseAmbientTvs();
  storeScene?.pauseRendering();

  videoPlayer.reveal();
}

/** Launch the original file in the system media player (mpv/VLC) as a fallback. */
/**
 * Play a title by handing mpv the file on disk, bypassing Jellyfin's streaming
 * path entirely. Only correct when the media, the server and this app are on
 * one machine — but that's this deployment, and it buys three things the
 * webview cannot do at all: genuine HDR output (Chromium has no HDR video
 * path, so it flattens an HDR10 master to SDR no matter how cleanly the file
 * reaches it), the original lossless multichannel audio instead of a stereo
 * AAC downmix, and seeking that doesn't wait on a server.
 *
 * It also stops Jellyfin writing the film to disk as HLS segments while you
 * watch — ~70 GB for a 4K remux — which it only ever did because the webview
 * can't demux Matroska.
 *
 * Returns false when the local endpoint isn't reachable (production bundle,
 * no dev/preview server) so the caller can fall back to in-app streaming.
 */
async function playLocalWithMpv(
  filePath: string,
  itemId: string,
  startPositionTicks: number,
  onExit: (positionTicks: number) => void,
): Promise<boolean> {
  const jellyfinUrl = localStorage.getItem('jellyfin_url');
  const token = localStorage.getItem('jellyfin_token');
  const startSeconds = Math.max(0, Math.floor(startPositionTicks / 10_000_000));

  let id: string;
  try {
    const res = await fetch('/__play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, startSeconds }),
    });
    if (!res.ok) {
      logToConsole(`[Video] Local player refused the file (${res.status}); streaming instead.`, 'video');
      return false;
    }
    id = (await res.json()).id;
  } catch {
    // No endpoint (production bundle) — caller falls back to the in-app player.
    return false;
  }

  logToConsole(`[Video] Playing off disk in mpv (from ${startSeconds}s).`, 'video');
  ui.isPlaybackActive = true;
  if (jellyfinUrl && token) reportPlaybackStart(jellyfinUrl, token, itemId);

  // Poll for position so Continue Watching still tracks, and so closing mpv
  // returns to the store the same way the in-app player's Back does.
  let lastTicks = startPositionTicks;
  const poll = window.setInterval(async () => {
    try {
      const res = await fetch(`/__play?id=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(String(res.status));
      const s = await res.json();
      lastTicks = Math.round((s.position ?? 0) * 10_000_000);
      if (!s.exited) {
        if (jellyfinUrl && token) reportPlaybackProgress(jellyfinUrl, token, itemId, lastTicks, false);
        return;
      }
      window.clearInterval(poll);
      if (s.error) logToConsole(`[Video] mpv error: ${s.error}`, 'video');
      if (jellyfinUrl && token) reportPlaybackStopped(jellyfinUrl, token, itemId, lastTicks);
      onExit(lastTicks);
    } catch {
      // Endpoint vanished (server restarted) — stop polling rather than spin.
      window.clearInterval(poll);
      onExit(lastTicks);
    }
  }, 5000);
  return true;
}

async function playExternally(path: string) {
  if (!isTauri) {
    logToConsole('[Video] External player not available outside Tauri.', 'video');
    return;
  }
  try {
    const result = await invoke<string>('play_video', { path });
    logToConsole(`[Video] External player launched: ${result}`, 'video');
  } catch (error) {
    logToConsole(`[Video] External playback error: ${error}`, 'video');
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Also installs window.__fpsMeter and raises the FPS overlay if bb_fps_meter
  // (or ?fps=1) says so — see the tail of registerCoreSettings.
  registerCoreSettings();
  applyThemeCssVars(getActiveTheme());
  generateSettingsDrawer();
  // No manual video-case warmup here: video-case.ts self-runs initCaseMedium()
  // at module scope, and three-scene.ts statically imports video-case, so the
  // `await import('./three-scene')` inside initializeStoreScene loads and
  // initializes it exactly when it's actually needed. Fetching this chunk
  // eagerly here just serialized it ahead of checkCredentialsAndLoad() below
  // for no benefit (flat mode never imports three-scene, so it never paid this
  // cost either way).
  setupLoginHandlers();
  setupSearchInputCapture();
  
  // Register global keydown listener for typing letters to open search overlay in 2.5D
  window.addEventListener('keydown', (e) => {
    if (getSetting<string>('bb_render_mode') !== 'flat') return;
    if (ui.isSearchOpen || ui.isSettingsDrawerOpen || ui.isLoginOpen || document.querySelector('.flat-detail-overlay') || videoPlayer?.isOpen) {
      return;
    }
    if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) {
      return;
    }
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      return;
    }
    e.preventDefault();
    openSearchWithQuery(e.key);
  });

  // Feedback pin (F8): works in every render mode / camera state, unlike the
  // listener above. Ignored while an input/textarea has focus (so it doesn't
  // fire mid-typing elsewhere, e.g. the settings drawer's text rows) or while
  // the login overlay is up (no scene to screenshot yet).
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'F8') return;
    if (ui.isLoginOpen || ui.isFeedbackOpen) return;
    // Only text-entry fields block F8. A plain tag check would also match the
    // video player's volume slider (<input type=range>), which keeps focus
    // after a click and made F8 dead for the rest of playback.
    const el = document.activeElement as HTMLElement | null;
    const typing = el && (el.tagName === 'TEXTAREA' || el.isContentEditable ||
      (el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes((el as HTMLInputElement).type)));
    if (typing) return;
    e.preventDefault();
    openFeedbackPin();
  });

  // Demo mode: the logout/exit power rows are meaningless without a session
  // or an app window (see the powerButtons filter above for keyboard nav).
  if (isDemoMode) {
    for (const id of ['btn-logout', 'btn-exit']) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
  }

  videoPlayer = new VideoPlayer();
  logToConsole('[System] Initializing HTPC interface...', 'system');
  
  // Start up tauri app in full screen mode after a delay
  // to prevent WebKitGTK window realization deadlocks on startup on Linux.
  if (isTauri) setTimeout(() => {
    try {
      const win = getCurrentWindow();
      win.setFullscreen(true).then(() => {
        logToConsole('[System] Fullscreen mode activated.', 'system');
      }).catch((err) => {
        console.warn('[System] Failed to enter fullscreen mode:', err);
      });
    } catch (err) {
      console.warn('[System] Failed to enter fullscreen mode:', err);
    }
  }, 1000);

  // Input callback hooks mapping HTPC inputs.
  // Stored as a named object so the virtual remote can call them directly
  // instead of relying on fragile synthetic KeyboardEvent dispatch.
  const inputCallbacks: InputCallbacks = {
    onLeft: () => {
      if (storeScene?.isWalkAroundMode) return;
      if (isDemoMode && ui.isPlaybackActive) return; // demo PLAYBACK DISABLED card is up
      if (videoPlayer?.isOpen) { videoPlayer.navigateHorizontal(-1); return; }
      if (ui.isLoginOpen) return;
      if (ui.isSearchOpen) return;
      if (ui.isPowerMenuOpen) return;
      if (ui.isCounterTerminalOpen) return; // already docked; Left is what opened it
      if (ui.isSettingsDrawerOpen) {
        if (settingsRowKeys[settingsIndex] !== SETTINGS_CLOSE_KEY) activateSelectedSetting(-1);
        return;
      }
      if (ui.isVersionPickerOpen) return;
      if (ui.isCandyCheckoutOpen) return;
      if (ui.isExitConfirmOpen) {
        const nextIdx = (exitConfirmIndex - 1 + exitButtons.length) % exitButtons.length;
        setExitConfirmSelection(nextIdx);
        return;
      }
      flashLocatorArrow('left');
      storeScene?.moveLeft();
      updateMovieHUD(storeScene?.getSelectedMovie() || null);
    },
    onRight: () => {
      if (storeScene?.isWalkAroundMode) return;
      if (isDemoMode && ui.isPlaybackActive) return; // demo PLAYBACK DISABLED card is up
      if (videoPlayer?.isOpen) { videoPlayer.navigateHorizontal(1); return; }
      if (ui.isLoginOpen) return;
      if (ui.isSearchOpen) return;
      if (ui.isPowerMenuOpen) return;
      // Right steps back out of the terminal to the counter — the mirror of
      // the Left press that reached for it.
      if (ui.isCounterTerminalOpen) { closeCounterTerminal(); return; }
      if (ui.isSettingsDrawerOpen) {
        if (settingsRowKeys[settingsIndex] !== SETTINGS_CLOSE_KEY) activateSelectedSetting(1);
        return;
      }
      if (ui.isVersionPickerOpen) return;
      if (ui.isCandyCheckoutOpen) return;
      if (ui.isExitConfirmOpen) {
        const nextIdx = (exitConfirmIndex + 1) % exitButtons.length;
        setExitConfirmSelection(nextIdx);
        return;
      }
      flashLocatorArrow('right');
      storeScene?.moveRight();
      updateMovieHUD(storeScene?.getSelectedMovie() || null);
    },
    onUp: () => {
      if (storeScene?.isWalkAroundMode) return;
      if (isDemoMode && ui.isPlaybackActive) return; // demo PLAYBACK DISABLED card is up
      if (videoPlayer?.isOpen) { videoPlayer.navigateVertical(-1); return; }
      if (ui.isLoginOpen) return;
      if (ui.isSearchOpen) return;
      if (ui.isExitConfirmOpen) return;

      if (ui.isSettingsDrawerOpen) {
        const nextIdx = (settingsIndex - 1 + settingsRowKeys.length) % settingsRowKeys.length;
        setSettingsSelection(nextIdx);
      } else if (ui.isPowerMenuOpen) {
        const nextIdx = (powerMenuIndex - 1 + powerButtons.length) % powerButtons.length;
        setPowerMenuSelection(nextIdx);
        logToConsole(`[Input] Power menu selection: ${powerButtons[nextIdx]}`, 'system');
      } else if (ui.isCounterTerminalOpen) {
        stepCounterTerminal(-1);
      } else if (ui.isVersionPickerOpen) {
        moveVersionPickerSelection(-1);
      } else if (ui.isCandyCheckoutOpen) {
        candyCheckoutMoveFocus(-1);
      } else {
        storeScene?.moveUp();
        updateMovieHUD(storeScene?.getSelectedMovie() || null);
      }
    },
    onDown: () => {
      if (storeScene?.isWalkAroundMode) return;
      if (isDemoMode && ui.isPlaybackActive) return; // demo PLAYBACK DISABLED card is up
      if (videoPlayer?.isOpen) { videoPlayer.navigateVertical(1); return; }
      if (ui.isLoginOpen) return;
      if (ui.isSearchOpen) return;
      if (ui.isExitConfirmOpen) return;

      if (ui.isSettingsDrawerOpen) {
        const nextIdx = (settingsIndex + 1) % settingsRowKeys.length;
        setSettingsSelection(nextIdx);
      } else if (ui.isPowerMenuOpen) {
        const nextIdx = (powerMenuIndex + 1) % powerButtons.length;
        setPowerMenuSelection(nextIdx);
        logToConsole(`[Input] Power menu selection: ${powerButtons[nextIdx]}`, 'system');
      } else if (ui.isCounterTerminalOpen) {
        stepCounterTerminal(1);
      } else if (ui.isVersionPickerOpen) {
        moveVersionPickerSelection(1);
      } else if (ui.isCandyCheckoutOpen) {
        candyCheckoutMoveFocus(1);
      } else {
        storeScene?.moveDown();
        updateMovieHUD(storeScene?.getSelectedMovie() || null);
      }
    },
    onEnter: async () => {
      if (storeScene?.isWalkAroundMode) return;
      if (videoPlayer?.isOpen) {
        if (!videoPlayer.activateFocused()) videoPlayer.togglePlayPause();
        return;
      }
      if (ui.isLoginOpen) return;

      if (ui.isSettingsDrawerOpen) {
        activateSelectedSetting(1);
        return;
      }

      if (ui.isPowerMenuOpen) {
        await executePowerMenuAction(powerButtons[powerMenuIndex]);
        return;
      }

      // Docked at the counter terminal: Enter runs the highlighted row rather
      // than falling through to selectAction(), which in checkout mode would
      // confirm the rental.
      if (ui.isCounterTerminalOpen) {
        await activateCounterTerminal();
        return;
      }

      if (ui.isExitConfirmOpen) {
        await executeExitConfirmAction(exitButtons[exitConfirmIndex]);
        return;
      }

      if (ui.isVersionPickerOpen) {
        chooseVersionPickerSelection();
        return;
      }

      if (ui.isCandyCheckoutOpen) {
        candyCheckoutActivate();
        return;
      }

      if (ui.isSearchOpen) return; // keyboard handles it

      if (ui.isPlaybackActive) return;

      const action = storeScene?.selectAction();
      const movie = storeScene?.getSelectedMovie();

      if (action === 'inspect') {
        updateMovieHUD(movie || null);
      } else if (action === 'play' && movie) {
        // Multi-version titles (4K + 1080p) pick their quality FIRST — before
        // the candy checkout and the play flourish — so backing out of the
        // picker leaves the store untouched.
        const version = await resolvePlayVersion(movie);
        if (version === null) return; // user backed out of the version picker
        // Play the spin-and-fly flourish on the rental copy, then start playback.
        const scene = storeScene;
        if (scene) {
          maybeRunCandyCheckout(() => {
            launchVideoPlayback(movie, undefined, undefined, true, false, version);
            scene.startPlayAnimation(() => { revealVideoPlayback(); });
          });
        } else {
          await launchVideoPlayback(movie, undefined, undefined, false, false, version);
        }
      } else if (action === 'request' && movie) {
        // Remote-truthful path (review §4.5): OK on a not-in-stock case opens
        // an explicit ORDER / NOT INTERESTED choice — both actions land
        // without hold gestures or letter keys. Keyboards keep X and HOLD ▼.
        const choice = await resolveGapChoice(movie);
        if (choice === 'order') await handleDiscoveryRequest(movie);
        else if (choice === 'dismiss') handleGapDismiss();
      } else if (action === 'launch' && movie) {
        await handleGameLaunch(movie);
      }
    },
    onBack: () => {
      if (storeScene?.isWalkAroundMode) {
        storeScene.toggleWalkAround();
        return;
      }
      // Demo PLAYBACK DISABLED card: Back is the "stop watching" path.
      if (isDemoMode && ui.isPlaybackActive) { closeDemoPlaybackOverlay(); return; }
      if (videoPlayer?.isOpen) { if (!videoPlayer.handleBack()) videoPlayer.requestClose(); return; }
      if (ui.isLoginOpen) return;

      if (ui.isSettingsDrawerOpen) {
        // Back from a group page returns to the category index; back from the
        // index closes the drawer.
        if (settingsPage !== null) activateSetting(SETTINGS_BACK_KEY, 1);
        else closeSettingsDrawer();
        return;
      }

      if (ui.isSearchOpen) {
        closeSearch();
        return;
      }

      if (ui.isVersionPickerOpen) {
        closeVersionPicker(null); // cancel the launch entirely
        return;
      }

      if (ui.isCandyCheckoutOpen) {
        skipCandyCheckout(); // ESC = skip ordering but still proceed with the rental
        return;
      }

      if (ui.isCounterTerminalOpen) {
        closeCounterTerminal();
        return;
      }

      if (ui.isPowerMenuOpen) {
        closePowerMenu();
        return;
      }

      if (ui.isExitConfirmOpen) {
        closeExitConfirm();
        return;
      }

      const handled = storeScene?.backAction();
      if (handled) {
        updateMovieHUD(storeScene?.getSelectedMovie() || null);
      } else {
        if (storeScene && storeScene.mode === 'library-select') {
          openExitConfirm();
        }
      }
    },
    onPower: () => {
      if (storeScene?.isWalkAroundMode) return;
      // Same hard-stop the power key gives the real player.
      if (isDemoMode && ui.isPlaybackActive) { closeDemoPlaybackOverlay(); return; }
      if (videoPlayer?.isOpen) { videoPlayer.close(); return; }
      if (ui.isLoginOpen) return;

      if (ui.isSettingsDrawerOpen) {
        closeSettingsDrawer();
        return;
      }

      if (ui.isVersionPickerOpen) { closeVersionPicker(null); return; }
      if (ui.isCandyCheckoutOpen) { skipCandyCheckout(); return; }
      if (ui.isSearchOpen) { closeSearch(); return; }
      // P while the diegetic version is already up closes it rather than
      // stacking the glass overlay on top of the same options.
      if (ui.isCounterTerminalOpen) { closeCounterTerminal(); return; }

      if (ui.isExitConfirmOpen) {
        closeExitConfirm();
      }

      if (ui.isPowerMenuOpen) {
        closePowerMenu();
      } else {
        openPowerMenu();
      }
    },
    onSearch: () => {
      if (storeScene?.isWalkAroundMode) return;
      if (ui.isLoginOpen || ui.isPlaybackActive || ui.isCandyCheckoutOpen || ui.isVersionPickerOpen) return;
      if (ui.isSearchOpen) {
        closeSearch();
      } else {
        // Close other overlays before opening search
        if (ui.isPowerMenuOpen) closePowerMenu();
        if (ui.isExitConfirmOpen) closeExitConfirm();
        openSearch();
      }
    },
    onActivity: () => {
      if (ui.isScreensaverActive) {
        ui.isScreensaverActive = false;
        document.getElementById('screensaver-overlay')!.classList.remove('visible');
        stopScreensaverAnimation();
        retailAudio.resumeFromIdle();
        storeScene?.resumeRendering();
        storeScene?.resumeAmbientTvs();
        logToConsole('[System] HTPC woke up from screensaver.', 'system');
      } else if (!ui.isPlaybackActive && document.visibilityState !== 'hidden') {
        // A spurious blur (Wayland/kiosk focus quirks) can park the render loop
        // via onOcclude() with no matching focus event ever arriving — leaving
        // the store frozen while the user is right there pressing keys. Input
        // proves the window really is in the foreground, so treat it as a
        // reveal; resumeRendering() is a guarded no-op when already running.
        if (isOccluded) onReveal();
        else storeScene?.resumeRendering();
      }
    },
    onIdle: () => {
      // An abandoned exit-confirm must not pin the renderer/audio awake
      // forever (onIdle fires ONCE per idle period, so bailing here meant the
      // screensaver never engaged until the next input). The dialog is
      // dismissable — Back is its cancel — so auto-cancel it and let the
      // saver take over. Login keeps blocking: it's a typing session.
      if (ui.isExitConfirmOpen && !ui.isPlaybackActive && !ui.isLoginOpen) closeExitConfirm();
      if (!ui.isPlaybackActive && !ui.isScreensaverActive && !ui.isLoginOpen && !ui.isExitConfirmOpen) {
        ui.isScreensaverActive = true;
        document.getElementById('screensaver-overlay')!.classList.add('visible');
        retailAudio.suspendForIdle();
        storeScene?.suspendChimeForIdle();
        storeScene?.pauseAmbientTvs();
        storeScene?.pauseRendering();
        // The idle timer keeps running even while occluded (issue #102), so if
        // the window is already occluded there's no visible surface to animate
        // for -- onReveal() starts the rAF loop once the window is actually
        // shown again, rather than spinning it while backgrounded.
        if (!isOccluded) startScreensaverAnimation();
        logToConsole('[System] Inactivity detected. Entering screensaver...', 'system');
      }
    },
    onToggleWalkAround: () => {
      if (!ui.isPlaybackActive && !ui.isScreensaverActive && !ui.isLoginOpen && !ui.isExitConfirmOpen) {
        storeScene?.toggleWalkAround();
      }
    },
    // T22: carry-mode shortcuts. Both are guarded no-ops with the 'Carry &
    // checkout' toggle off (or while any overlay owns the keyboard).
    onCheckout: () => {
      if (ui.isAnyOverlayOpen || ui.isPlaybackActive || ui.isScreensaverActive) return;
      if (storeScene?.isWalkAroundMode) return;
      storeScene?.enterCheckout();
    },
    onReturnTape: () => {
      if (ui.isAnyOverlayOpen || ui.isPlaybackActive || ui.isScreensaverActive) return;
      storeScene?.returnCarriedTape();
    },
    onNotInterested: () => {
      if (ui.isAnyOverlayOpen || ui.isPlaybackActive || ui.isScreensaverActive) return;
      handleGapDismiss();
    },
    // T22: hold-select-to-checkout. While a tape is in hand (and nothing modal
    // is on top), holding Enter / gamepad A jumps straight to the counter; a
    // quick tap still performs the normal select action on release.
    isHoldSelectArmed: () => {
      if (ui.isAnyOverlayOpen || ui.isPlaybackActive || ui.isScreensaverActive) return false;
      if (videoPlayer?.isOpen) return false;
      if (storeScene?.isWalkAroundMode) return false;
      return !!storeScene?.canHoldToCheckout();
    },
    onHoldSelect: () => {
      setHoldCheckoutProgress(0);
      storeScene?.enterCheckout();
    },
    onHoldSelectProgress: (p) => setHoldCheckoutProgress(p),
    // Hold ▼ on an inspected not-in-stock case = "not interested". A tap still
    // does Down's normal job (flip the case), so the gesture only arms on the
    // cases it can actually cross off.
    isHoldDownArmed: () => holdHintsAllowed() && !!storeScene?.canDismissSelected(),
    onHoldDown: () => {
      setHoldDismissProgress(0);
      handleGapDismiss();
    },
    onHoldDownProgress: (p) => setHoldDismissProgress(p),
  };

  new InputManager(inputCallbacks);

  // Remote Play: stream the store to /remote.html viewers when the option is
  // on (Connection settings, or ?remote=1). The getter tracks storeScene
  // across settings rebuilds.
  setupRemotePlay(() => storeScene, () => videoPlayer?.videoElement ?? null);

  // ── Idle governor: window occlusion (issue #16) ──────────────────────────
  // When the box's window is hidden or loses OS focus (the user flipped to
  // IPTV or a game on the same HTPC) we drop to the deepest idle *immediately*,
  // instead of waiting out the input-idle timer: fully suspend the render loop
  // (the rAF stops — verify via storeScene.getPerfInfo().frames), pause the
  // ambient-TV video textures, and suspend the AudioContext so CPU + GPU fall
  // to near-zero while occluded. Wake is instant and silent. We deliberately
  // leave an in-app movie playing if the window merely lost focus.
  let isOccluded = false;
  function onOcclude() {
    if (isOccluded) return;
    isOccluded = true;
    retailAudio.suspendForIdle();
    // Door-chime context parks with the retail bus; playDoorChime() resumes
    // it on the next ring, so no matching call is needed in onReveal().
    storeScene?.suspendChimeForIdle();
    // The screensaver's DVD-bounce rAF loop (issue #102) has no visibility
    // check of its own -- freeze it here so a Wayland/kiosk blur that lands
    // while the screensaver is already up doesn't keep compositing a
    // background window indefinitely. isScreensaverActive stays true.
    if (ui.isScreensaverActive) stopScreensaverAnimation();
    if (ui.isPlaybackActive) return; // don't park a movie the user is watching
    storeScene?.pauseAmbientTvs();
    storeScene?.pauseRendering();
  }
  function onReveal() {
    if (!isOccluded) return;
    isOccluded = false;
    if (ui.isScreensaverActive) {
      // Still idle -- only restart the screensaver loop that onOcclude froze
      // (or that onIdle skipped while occluded). Audio/ambient/rendering stay
      // parked until real activity wakes the screensaver via onActivity.
      startScreensaverAnimation();
    } else {
      retailAudio.resumeFromIdle();
      if (!ui.isPlaybackActive) {
        storeScene?.resumeAmbientTvs();
        storeScene?.resumeRendering();
      }
    }
    void wakeRefresh();
  }
  // A spawned Remote Play instance (headless, never focused, nobody at ITS
  // screen) must not deep-idle on occlusion — its whole job is rendering for
  // a remote viewer. Input-idle tiers and the screensaver still apply there.
  if (!isRemoteInstance()) {
    document.addEventListener('visibilitychange', () => {
      document.visibilityState === 'hidden' ? onOcclude() : onReveal();
    });
    // window blur/focus catch the Wayland/X11 case where the compositor keeps the
    // surface "visible" but another app has the foreground — the Brave/kiosk path.
    window.addEventListener('blur', onOcclude);
    window.addEventListener('focus', onReveal);
    if (isTauri) {
      getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        focused ? onReveal() : onOcclude();
      }).catch(() => {});
    }
  }

  // The old on-screen perf HUD (#perf-monitor + ?perf=1 detail rows) is gone;
  // run-forever diagnostics stay available programmatically via
  // storeScene.getPerfInfo() and window.__perfTrace.report().

  // Neither kiosk-maintenance loop applies to the demo: there's no Jellyfin
  // library to refresh nor a token to keep alive.
  if (!isDemoMode) {
    // Nightly maintenance reload. The Jellyfin library is only fetched at boot,
    // so on a 24/7 box new media never appears until a reload. Once per day at
    // ~4 AM — while the screensaver is up and nothing is playing — reload the
    // front-end to pick up library changes. A localStorage date stamp guarantees
    // at most one reload per calendar day so the minute-poll can't loop.
    window.setInterval(() => {
      const now = new Date();
      if (now.getHours() !== 4) return;
      if (!ui.isScreensaverActive || ui.isPlaybackActive) return;
      const today = now.toDateString();
      if (localStorage.getItem('bb_last_nightly_reload') === today) return;
      localStorage.setItem('bb_last_nightly_reload', today);
      logToConsole('[System] Nightly maintenance — reloading to refresh library...', 'system');
      setTimeout(() => location.reload(), 1000);
    }, 60_000);

    // Periodic token self-heal (issue #68).
    // A kiosk running foreground 24/7 may never trigger the window focus/blur wake path.
    // Periodically refresh the token (every 6 hours) to prevent expiration.
    window.setInterval(() => {
      void wakeRefresh();
    }, 6 * 60 * 60 * 1000);
  }

  // Floating browse locator arrows — click-to-navigate for mouse users.
  // Wired once here (the arrows are static DOM elements now, not recreated
  // per update) rather than inside onLibrarySelectUpdate.
  document.getElementById('browse-locator-arrow-left')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if ((e.currentTarget as HTMLElement).classList.contains('hidden')) return;
    storeScene?.moveLeft();
  });
  document.getElementById('browse-locator-arrow-right')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if ((e.currentTarget as HTMLElement).classList.contains('hidden')) return;
    storeScene?.moveRight();
  });

  // Minimize / restore the HTPC Operations Log overlay.
  const devConsole = document.getElementById('dev-console');
  const devConsoleToggle = document.getElementById('dev-console-toggle');
  devConsoleToggle?.addEventListener('click', () => {
    const minimized = devConsole?.classList.toggle('minimized');
    if (devConsoleToggle) {
      devConsoleToggle.textContent = minimized ? '▢' : '_';
      devConsoleToggle.title = minimized ? 'Restore log' : 'Minimize log';
      devConsoleToggle.setAttribute('aria-label', minimized ? 'Restore log' : 'Minimize log');
    }
  });

  // Setup click and hover listeners for power buttons
  powerButtons.forEach((id, idx) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', () => {
        executePowerMenuAction(id);
      });
      el.addEventListener('pointerenter', () => {
        setPowerMenuSelection(idx);
      });
    }
  });

  // Setup hover listeners for exit confirmation buttons
  exitButtons.forEach((id, idx) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('pointerenter', () => {
        setExitConfirmSelection(idx);
      });
    }
  });

  // Register click events for exit confirmation buttons
  document.getElementById('btn-confirm-exit')?.addEventListener('click', () => {
    executeExitConfirmAction('btn-confirm-exit');
  });
  document.getElementById('btn-confirm-cancel')?.addEventListener('click', () => {
    executeExitConfirmAction('btn-confirm-cancel');
  });

  // Register click events for the candy checkout screen (T19)
  document.getElementById('btn-candy-order')?.addEventListener('click', () => { confirmCandyOrder(); });
  document.getElementById('btn-candy-order')?.addEventListener('pointerenter', () => {
    candyCheckoutIndex = candyCheckoutRows.length;
    renderCandyCheckout();
  });
  document.getElementById('btn-candy-skip')?.addEventListener('click', () => { skipCandyCheckout(); });
  document.getElementById('btn-candy-skip')?.addEventListener('pointerenter', () => {
    candyCheckoutIndex = candyCheckoutRows.length + 1;
    renderCandyCheckout();
  });

  // Check saved credentials and try connection in background (demo mode
  // skips the credential gate entirely and never shows the login overlay).
  if (isDemoMode) startDemoAndLoad();
  else checkCredentialsAndLoad();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    main();
  });
} else {
  main();
}

// Expose modal/settings triggers globally for flat store navigation
(window as any).HTPC = {
  openSettingsDrawer,
  openPowerMenu,
  switchMember,
  switchRenderMode,
};

