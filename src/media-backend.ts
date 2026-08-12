// THE MEDIA LAYER'S SEAM (issue #32). Everything the store needs from a media
// server, expressed once, so Jellyfin and Plex are two implementations of one
// contract rather than two code paths threaded through the app.
//
// Shape of the split:
//   media-types.ts   the domain model (Movie, Episode, ...) — no server in it
//   media-shared.ts  logic that belongs to the store or the webview, not the
//                    server (version collapse, direct-play safety, ceilings)
//   media-backend.ts THIS FILE — the contract, the active-backend registry,
//                    and a facade whose functions carry the same names and
//                    signatures the app has always called
//   jellyfin.ts      backend #1
//   plex.ts          backend #2
//
// Callers keep calling free functions (`fetchSeriesEpisodes(url, token, ...)`)
// and the facade at the bottom routes each one to whichever backend the store
// is currently pointed at. That is deliberate: it kept the migration to ~8
// touched files instead of ~60, and it means a call site never has to know
// which server it is talking to.
//
// Note the (url, token, userId) arguments threaded through nearly every
// method. They are NOT redundant with the stored session: playback code paths
// legitimately hold a url/token pair for a title while the store is being
// re-pointed elsewhere, and the boot flow authenticates against an address
// that isn't persisted yet. The backend is stateless about credentials on
// purpose; only `activeBackendKind()` is remembered.
import type {
  Episode,
  HlsStreamOptions,
  MediaStreamInfo,
  LibrarySummary,
  MediaLibrary,
  MediaPlaybackInfo,
  MediaSession,
  PublicUser,
} from './media-types.ts';

import type { SubtitleDelivery } from './media-shared.ts';

export type MediaServerKind = 'jellyfin' | 'plex';

/** Minimal handle on a playable episode — see fetchFirstEpisodeOfSeries. */
export interface EpisodeRef {
  id: string;
  path: string;
}

/** A sign-in-by-code flow (Plex's plex.tv/link). See MediaBackend.beginLink. */
export interface LinkFlow {
  /** Short code the user types on the verification page — goes on the CRT. */
  code: string;
  /** Human-readable page the code is entered at, e.g. "plex.tv/link". */
  verificationUrl: string;
  /** Epoch ms after which `code` stops working and a new flow is needed. */
  expiresAt: number;
  /**
   * Polls until the user approves the code. Resolves with the session, or null
   * if the code expired or `cancel()` was called first. Never rejects on a
   * transient network blip — a linking HTPC that loses the LAN for a moment
   * should keep waiting, not drop the user back to a form.
   */
  wait(): Promise<MediaSession | null>;
  /** Abandon the flow (user backed out of the screen). */
  cancel(): void;
}

export interface CatalogSyncOptions {
  /**
   * Library ids this store does NOT carry (#41): their item sync is skipped
   * entirely, not fetched-and-hidden. Sourced from the Store Libraries
   * toggles (Settings → Connection / the setup terminal's checkbox rows).
   */
  excludeLibraryIds?: ReadonlySet<string>;
}

export interface MediaBackend {
  readonly kind: MediaServerKind;
  /** Server name as the user knows it, for UI copy: "Jellyfin" / "Plex". */
  readonly label: string;

  // ─── Address + identity ────────────────────────────────────────────────────

  normalizeUrl(url: string): string;
  /**
   * Unauthenticated "is a server of MY kind here?" probe, used by the setup
   * terminal to work out what the user just typed the address of instead of
   * making them pick from a menu first. Resolves false (never throws) when the
   * address answers as something else or doesn't answer at all.
   */
  identify(url: string): Promise<boolean>;

  // ─── Sign-in ───────────────────────────────────────────────────────────────

  /**
   * Liveness/auth check for a stored token. Resolves true on a clean success;
   * resolves false ONLY when the server definitively rejected the token
   * (HTTP 401/403). Anything else — network blip, timeout, 5xx — throws, so
   * callers can tell "token is stale" apart from "server unreachable" and
   * never tear down a session over a transient failure (issue #125).
   */
  validateToken(url: string, token: string): Promise<boolean>;
  /** Classic name+password sign-in. */
  authenticateUser(url: string, username: string, password?: string): Promise<MediaSession>;
  /**
   * Users to fan out as membership cards. `token` is optional because Jellyfin
   * serves its list unauthenticated (/Users/Public) while Plex's Home users
   * come from the account — pass whatever session token is already in hand.
   * Callers must treat a throw or an empty array as "fall back to signing in
   * by name": plenty of servers legitimately have no list to give.
   */
  fetchPublicUsers(url: string, token?: string): Promise<PublicUser[]>;
  /** Avatar for a listed user, or null when they have none set. */
  buildUserAvatarUrl(url: string, user: PublicUser): string | null;
  /**
   * Complete a card sign-in for a user the list already named. `secret` is the
   * user's password (Jellyfin) or Home PIN (Plex); omit for unprotected users.
   * `token` is the session token the list was fetched with, which Plex needs
   * to perform the switch and Jellyfin ignores.
   */
  signInAsPublicUser(
    url: string,
    user: PublicUser,
    secret?: string,
    token?: string
  ): Promise<MediaSession>;
  /**
   * Begin a sign-in-by-code flow, on backends that have one. Undefined on
   * backends that don't (Jellyfin) — callers must feature-detect and fall back
   * to authenticateUser.
   */
  beginLink?(url: string): Promise<LinkFlow>;
  /**
   * Adopt a token the user pasted in by hand, resolving whatever identity the
   * server attaches to it. The escape hatch for when the link flow can't run
   * (no route to plex.tv, headless setup, a scripted deploy).
   */
  adoptToken?(url: string, token: string): Promise<MediaSession>;

  // ─── Catalog ───────────────────────────────────────────────────────────────

  /**
   * Names-only library listing for the first-run setup terminal (#41): no item
   * sync, so the checkbox screen can appear the moment a member signs in — the
   * expensive per-library item fetch then runs only for the libraries the
   * store actually carries.
   */
  fetchLibraryList(url: string, token: string, userId: string): Promise<LibrarySummary[]>;
  /**
   * Full catalog sync. `onProgress` is called at each milestone and callers
   * use it as a LIVENESS signal: a big library legitimately takes minutes, so
   * a caller must be able to tell "still working" from "server is gone"
   * without a wall-clock deadline that a large enough catalog can never beat.
   */
  fetchLibrariesAndMovies(
    url: string,
    token: string,
    userId: string,
    onProgress?: (stage: string) => void,
    opts?: CatalogSyncOptions
  ): Promise<MediaLibrary[]>;

  // ─── Series ────────────────────────────────────────────────────────────────

  fetchSeriesEpisodes(url: string, token: string, userId: string, seriesId: string): Promise<Episode[]>;
  /**
   * Just enough of the earliest episode to start playing a series the user
   * picked off the shelf without opening the episode list. Deliberately NOT a
   * full Episode: callers only ever need the id to stream and the path for the
   * external-player fallback, and resolving the rest would cost a second
   * round-trip on a hot path.
   */
  fetchFirstEpisodeOfSeries(
    url: string,
    token: string,
    userId: string,
    seriesId: string
  ): Promise<EpisodeRef | null>;

  // ─── Playback ──────────────────────────────────────────────────────────────

  /**
   * On-demand probe for an item whose playback info isn't already in memory.
   * TV episodes are the case in practice: the episode fetchers never request
   * media sources (a series can have hundreds of episodes, and the picker
   * never needs codec info), so launchVideoPlayback calls this for the one
   * episode it's about to play. Returns undefined on any failure —
   * isDirectPlaySafe treats that as not-safe, defaulting to HLS.
   */
  fetchItemPlaybackInfo(
    url: string,
    token: string,
    userId: string,
    itemId: string
  ): Promise<MediaPlaybackInfo | undefined>;
  /**
   * How a chosen subtitle track should be delivered. Backend-aware because the
   * cheap road isn't universally available: Jellyfin converts a text track to
   * a WebVTT sidecar on demand, so only bitmap subtitles need burning in;
   * plex.ts has no verified sidecar endpoint yet and so burns every track in,
   * which is what it did before this interface existed.
   */
  subtitleDelivery(streams: MediaStreamInfo[] | undefined, streamIndex: number | undefined): SubtitleDelivery;
  /**
   * WebVTT sidecar URL for a text subtitle track, or null on a backend that
   * can't serve one — callers must treat null as "burn it in instead".
   */
  buildSubtitleTrackUrl(
    url: string,
    token: string,
    itemId: string,
    streamIndex: number,
    mediaSourceId?: string
  ): string | null;
  /** Direct stream of the original file — only safe per isDirectPlaySafe. */
  buildStaticStreamUrl(url: string, token: string, itemId: string, mediaSourceId?: string): string;
  /** HLS playlist the in-app player can always handle. */
  buildHlsStreamUrl(url: string, token: string, itemId: string, opts?: HlsStreamOptions): string;
  /**
   * Session handle baked into the most recently built HLS URL, so a caller
   * that only has the URL (the player's buildStream callback returns a plain
   * string) can still learn which session to tear down before rebuilding it.
   */
  lastHlsPlaySessionId(): string | undefined;
  /**
   * Tell the server to stop transcoding immediately rather than waiting for
   * its idle timeout — called right before abandoning an HLS stream for a
   * rebuilt one (seek, quality/track change) so the old ffmpeg process isn't
   * left encoding a stream nobody is reading.
   */
  stopActiveEncoding(playSessionId: string, log?: (msg: string) => void): Promise<void>;
  /**
   * Whether an HLS URL was built to let the server STREAM-COPY the video, i.e.
   * it may carry a full-bitrate 4K remux rather than a capped stream. The
   * player uses this to pick a buffer profile that keeps such a stream inside
   * the webview's SourceBuffer budget.
   */
  isStreamCopyUrl(src: string): boolean;

  // ─── Progress reporting ────────────────────────────────────────────────────

  reportPlaybackStart(url: string, token: string, itemId: string): Promise<void>;
  reportPlaybackProgress(
    url: string,
    token: string,
    itemId: string,
    positionTicks: number,
    isPaused: boolean
  ): Promise<void>;
  reportPlaybackStopped(url: string, token: string, itemId: string, positionTicks: number): Promise<void>;
}

// ─── Stored connection ────────────────────────────────────────────────────────

// The url/token/userid keys keep their historical `jellyfin_` spelling on
// purpose: renaming them would sign every existing install out on upgrade for
// no user-visible gain. Only the SERVER KIND is a new key, and its absence
// means Jellyfin — which is exactly right for every store that existed before
// Plex support landed.
const KIND_KEY = 'media_server_kind';
export const URL_KEY = 'jellyfin_url';
export const TOKEN_KEY = 'jellyfin_token';
export const USER_ID_KEY = 'jellyfin_userid';
export const LAST_USER_ID_KEY = 'jellyfin_last_userid';
export const USERNAME_KEY = 'jellyfin_username';

function readLocal(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage?.setItem(key, value);
  } catch { /* private mode / quota — the session just doesn't survive a reload */ }
}

export function activeBackendKind(): MediaServerKind {
  return readLocal(KIND_KEY) === 'plex' ? 'plex' : 'jellyfin';
}

export function setActiveBackendKind(kind: MediaServerKind): void {
  writeLocal(KIND_KEY, kind);
}

/** Stored connection, or nulls before first run. */
export function storedConnection(): { url: string | null; token: string | null; userId: string | null } {
  return { url: readLocal(URL_KEY), token: readLocal(TOKEN_KEY), userId: readLocal(USER_ID_KEY) };
}

/** Persist an authenticated session (and the backend that produced it). */
export function persistSession(kind: MediaServerKind, url: string, session: MediaSession): void {
  setActiveBackendKind(kind);
  writeLocal(URL_KEY, url);
  writeLocal(TOKEN_KEY, session.accessToken);
  writeLocal(USER_ID_KEY, session.userId);
  writeLocal(LAST_USER_ID_KEY, session.userId); // remembered for next boot's card highlight
}

const KNOWN_LIBS_KEY = 'bb_known_libraries';

/**
 * Remember the server's FULL video-library list (id + name) whenever a fetch
 * sees it — the catalog fetchers are the only places that ever see the
 * complete list, exclusions and all. localStorage-persisted so the Store
 * Libraries settings page can offer EXCLUDED libraries for re-enabling on
 * every later boot (#41): an excluded library is absent from the synced
 * catalog by design, so the catalog alone can never list it again.
 */
export function rememberKnownLibraries(libs: ReadonlyArray<LibrarySummary>): void {
  writeLocal(KNOWN_LIBS_KEY, JSON.stringify(libs.map((l) => ({ id: l.id, name: l.name }))));
}

/** The last-remembered full server library list ([] before any real fetch). */
export function knownServerLibraries(): LibrarySummary[] {
  try {
    const raw = readLocal(KNOWN_LIBS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((l) => l && typeof l.id === 'string' && typeof l.name === 'string')
      : [];
  } catch {
    return [];
  }
}

// ─── Registry ─────────────────────────────────────────────────────────────────

// Backends register themselves at import time rather than being imported here
// directly: this module is imported by the domain-facing call sites, and a
// static import of both backends from here would drag the whole Plex client
// into a Jellyfin-only store's bundle (and vice versa) for no reason.
const registry = new Map<MediaServerKind, MediaBackend>();

export function registerBackend(backend: MediaBackend): void {
  registry.set(backend.kind, backend);
}

export function backendFor(kind: MediaServerKind): MediaBackend {
  const backend = registry.get(kind);
  if (!backend) {
    throw new Error(
      `No media backend registered for "${kind}". ` +
      `Import ./media-backends.ts once at startup to register them.`
    );
  }
  return backend;
}

/** Every registered backend, for screens that offer a choice of server. */
export function allBackends(): MediaBackend[] {
  return [...registry.values()];
}

export function activeBackend(): MediaBackend {
  return backendFor(activeBackendKind());
}

/**
 * Work out which kind of server is answering at an address by asking each
 * backend in turn, so the setup terminal can accept a bare address instead of
 * making the user declare the server type first. Resolves null when nothing
 * recognizable answers.
 */
export async function identifyServer(url: string): Promise<MediaServerKind | null> {
  // Sequential and short-circuiting, not a Promise.all race: a probe that
  // misses is a CROSS-ORIGIN request the browser logs as a CORS failure, and
  // firing every backend's probe at an address that only one of them owns fills
  // the console with alarming errors for a connection that then works fine.
  // Registration order puts the proxy-routed backend first for the same reason
  // (see media-backends.ts).
  for (const backend of allBackends()) {
    try {
      if (await backend.identify(url)) {
        console.info(`[Media] ${url} identified as ${backend.label}.`);
        return backend.kind;
      }
      console.info(`[Media] ${url} is not ${backend.label}.`);
    } catch (e) {
      console.info(`[Media] ${backend.label} probe of ${url} failed:`, e);
    }
  }
  return null;
}

// ─── Facade ───────────────────────────────────────────────────────────────────
// Same names and signatures the app has always called, now routed to whichever
// backend is active. Import these instead of reaching into jellyfin.ts.

export function normalizeUrl(url: string): string {
  // Address normalization is pure string work and identical across backends,
  // but it must stay callable BEFORE a backend is chosen (the setup terminal
  // normalizes what the user typed in order to probe it), so it can't go
  // through activeBackend().
  let cleaned = (url || '').trim().replace(/\/$/, '');
  if (!cleaned) return '';
  if (!/^https?:\/\//i.test(cleaned)) cleaned = `http://${cleaned}`;
  return cleaned;
}

export function validateToken(url: string, token: string): Promise<boolean> {
  if (!url || !token) return Promise.resolve(false);
  return activeBackend().validateToken(url, token);
}

export function authenticateUser(url: string, username: string, password?: string): Promise<MediaSession> {
  return activeBackend().authenticateUser(url, username, password);
}

export function fetchPublicUsers(url: string, token?: string): Promise<PublicUser[]> {
  return activeBackend().fetchPublicUsers(url, token);
}

export function buildUserAvatarUrl(url: string, user: PublicUser): string | null {
  return activeBackend().buildUserAvatarUrl(url, user);
}

export function signInAsPublicUser(
  url: string,
  user: PublicUser,
  secret?: string,
  token?: string
): Promise<MediaSession> {
  return activeBackend().signInAsPublicUser(url, user, secret, token);
}

export function fetchLibraryList(url: string, token: string, userId: string): Promise<LibrarySummary[]> {
  return activeBackend().fetchLibraryList(url, token, userId);
}

export function fetchLibrariesAndMovies(
  url: string,
  token: string,
  userId: string,
  onProgress?: (stage: string) => void,
  opts?: CatalogSyncOptions
): Promise<MediaLibrary[]> {
  return activeBackend().fetchLibrariesAndMovies(url, token, userId, onProgress, opts);
}

export function fetchSeriesEpisodes(
  url: string,
  token: string,
  userId: string,
  seriesId: string
): Promise<Episode[]> {
  return activeBackend().fetchSeriesEpisodes(url, token, userId, seriesId);
}

export function fetchFirstEpisodeOfSeries(
  url: string,
  token: string,
  userId: string,
  seriesId: string
): Promise<EpisodeRef | null> {
  return activeBackend().fetchFirstEpisodeOfSeries(url, token, userId, seriesId);
}

export function fetchItemPlaybackInfo(
  url: string,
  token: string,
  userId: string,
  itemId: string
): Promise<MediaPlaybackInfo | undefined> {
  return activeBackend().fetchItemPlaybackInfo(url, token, userId, itemId);
}

export function pickSubtitleDelivery(
  streams: MediaStreamInfo[] | undefined,
  streamIndex: number | undefined
): SubtitleDelivery {
  return activeBackend().subtitleDelivery(streams, streamIndex);
}

export function buildSubtitleTrackUrl(
  url: string,
  token: string,
  itemId: string,
  streamIndex: number,
  mediaSourceId?: string
): string | null {
  return activeBackend().buildSubtitleTrackUrl(url, token, itemId, streamIndex, mediaSourceId);
}

export function buildStaticStreamUrl(
  url: string,
  token: string,
  itemId: string,
  mediaSourceId?: string
): string {
  return activeBackend().buildStaticStreamUrl(url, token, itemId, mediaSourceId);
}

export function buildHlsStreamUrl(
  url: string,
  token: string,
  itemId: string,
  opts?: HlsStreamOptions
): string {
  return activeBackend().buildHlsStreamUrl(url, token, itemId, opts);
}

export function getLastHlsPlaySessionId(): string | undefined {
  return activeBackend().lastHlsPlaySessionId();
}

export function stopActiveEncoding(playSessionId: string, log?: (msg: string) => void): Promise<void> {
  return activeBackend().stopActiveEncoding(playSessionId, log);
}

export function isStreamCopyUrl(src: string): boolean {
  return activeBackend().isStreamCopyUrl(src);
}

export function reportPlaybackStart(url: string, token: string, itemId: string): Promise<void> {
  return activeBackend().reportPlaybackStart(url, token, itemId);
}

export function reportPlaybackProgress(
  url: string,
  token: string,
  itemId: string,
  positionTicks: number,
  isPaused: boolean
): Promise<void> {
  return activeBackend().reportPlaybackProgress(url, token, itemId, positionTicks, isPaused);
}

export function reportPlaybackStopped(
  url: string,
  token: string,
  itemId: string,
  positionTicks: number
): Promise<void> {
  return activeBackend().reportPlaybackStopped(url, token, itemId, positionTicks);
}
