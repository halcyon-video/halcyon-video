// PLEX BACKEND (issue #32) — the second implementation of MediaBackend.
//
// Everything here was written against a real 1.41.5 server (339 films, 125
// series, 3 Home users) rather than from documentation, because Plex's API is
// only semi-documented and several of the shapes below are not what the docs
// would lead you to expect. The load-bearing findings, so the next person
// doesn't have to re-derive them:
//
//   * A section listing returns the WHOLE section in one response — no paging
//     token, no continuation. What it does NOT return is per-track streams or
//     cast portraits, which is why the sync makes a second pass (below).
//   * /library/metadata accepts COMMA-SEPARATED rating keys. That turns "full
//     metadata for 339 films" into ~7 requests instead of 339, and is what
//     makes the second pass affordable at all.
//   * A section listing mixes `type: "collection"` rows in with the movies.
//     They are filtered out here and re-read separately for their artwork.
//   * Collection MEMBERSHIP rides on the item itself (a `Collection` tag), so
//     unlike Jellyfin there is no membership pass to run.
//   * Durations and positions are MILLISECONDS. The store's model is ticks
//     (100 ns), so everything crossing this boundary is scaled by 10_000.
//   * Track selection is keyed on Stream.id, NOT Stream.index (that one is the
//     ffmpeg index and selecting on it silently picks the wrong track).
//   * Direct play needs a PART id, which a rating key alone can't give you —
//     see partIdFor() and the note above it.
//   * The server reflects Origin in Access-Control-Allow-Origin, so the
//     browser build talks to it directly with no proxy.
import { invoke } from '@tauri-apps/api/core';
import type {
  Episode,
  HlsStreamOptions,
  LibrarySummary,
  MediaLibrary,
  MediaPlaybackInfo,
  MediaSession,
  MediaStreamInfo,
  Movie,
  MovieVersion,
  PublicUser,
} from './media-types.ts';
import {
  COPY_VIDEO_BITRATE,
  DEFAULT_VIDEO_BITRATE,
  collapseDuplicateVersions,
  collectionArt,
  collectionSyncStats,
  collectionTmdbIds,
  formatBytes,
  is4kFrame,
  isHevcMain10Supported,
  isHevcPassThroughEnabled,
  qualityTag,
  resetCollectionState,
} from './media-shared.ts';
import {
  normalizeUrl,
  rememberKnownLibraries,
  type CatalogSyncOptions,
  type EpisodeRef,
  type LinkFlow,
  type MediaBackend,
} from './media-backend.ts';

const PRODUCT = 'Halcyon Video';
const DEVICE = 'HTPC';
const VERSION = '0.3.1';
const PLATFORM = 'Web';
const PLEX_TV = 'https://plex.tv';

// Ticks per millisecond — the store counts in 100 ns ticks, Plex in ms.
const TICKS_PER_MS = 10_000;

// How many rating keys to put in one /library/metadata batch. 50 keeps the
// request line comfortably inside every proxy's URL limit while still cutting
// a 2,000-title library to 40 round-trips.
const METADATA_BATCH = 50;

// Plex stream types.
const STREAM_VIDEO = 1;
const STREAM_AUDIO = 2;
const STREAM_SUBTITLE = 3;

// ─── Client identity ──────────────────────────────────────────────────────────

// Plex ties an auth token to the client identifier that requested it, so this
// MUST be stable across restarts — regenerating it invalidates every token the
// store holds and silently signs the user out. Persisted on first use.
const CLIENT_ID_KEY = 'plex_client_id';

function clientIdentifier(): string {
  try {
    const existing = localStorage?.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
  } catch { /* private mode — fall through to an ephemeral id */ }
  // crypto.randomUUID is present in every webview this app runs in; the
  // fallback only matters for a non-browser test context.
  const fresh =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `halcyon-${crypto.randomUUID()}`
      : `halcyon-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  try {
    localStorage?.setItem(CLIENT_ID_KEY, fresh);
  } catch { /* ditto */ }
  return fresh;
}

/** The X-Plex-* identity every request carries. */
function plexHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json', // without this Plex answers in XML
    'X-Plex-Product': PRODUCT,
    'X-Plex-Version': VERSION,
    'X-Plex-Client-Identifier': clientIdentifier(),
    'X-Plex-Device': DEVICE,
    'X-Plex-Device-Name': PRODUCT,
    'X-Plex-Platform': PLATFORM,
  };
  if (token) headers['X-Plex-Token'] = token;
  return headers;
}

// ─── Transport ────────────────────────────────────────────────────────────────

/**
 * One request to a Plex endpoint (the media server or plex.tv), routed through
 * Tauri when running packaged and plain fetch in the browser — the same split
 * jellyfin.ts makes, for the same reason: the packaged build has no origin a
 * server would allow, so it can't use fetch.
 */
async function plexRequest(
  method: string,
  url: string,
  token?: string,
  body?: string
): Promise<string> {
  const headers = plexHeaders(token);
  const hasTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
  if (hasTauri) {
    return await invoke<string>('plex_request', { method, url, headers, body });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body || undefined,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP error ${response.status}: ${text}`);
    }
    return await response.text();
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e?.name === 'AbortError') throw new Error(`Request to ${url} timed out after 60 seconds`);
    throw e;
  }
}

/** GET a Plex endpoint and return its MediaContainer (never null). */
async function plexGet(url: string, token?: string): Promise<any> {
  const raw = await plexRequest('GET', url, token);
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(raw || 'Plex returned an invalid response.');
  }
  return parsed?.MediaContainer ?? {};
}

/** MediaContainer.Metadata as an array, whatever the server returned. */
function metadataOf(container: any): any[] {
  const meta = container?.Metadata;
  return Array.isArray(meta) ? meta : [];
}

/** Append the token as a query param — for URLs handed to <img>/<video>/hls.js,
 *  which can't carry an X-Plex-Token header. */
function withToken(url: string, token: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}X-Plex-Token=${encodeURIComponent(token)}`;
}

// ─── Reaching the media server from a browser ─────────────────────────────────

// A Plex Media Server reflects the request Origin only for loopback callers.
// Every other origin gets a fixed `Access-Control-Allow-Origin:
// https://app.plex.tv`, so a store served at http://<lan-ip>:1420 — the
// documented HTPC deployment — has every request to the server blocked by the
// browser, including ones the server answered 200. Plex, unlike Jellyfin, has
// no setting to allow another origin.
//
// So when the page itself isn't on loopback, media-server traffic goes through
// the dev/preview server's /plex-proxy middleware (vite.config.ts) instead:
// same-origin to the browser, forwarded host-side where CORS doesn't apply.
// This covers the API, poster textures (loaded with crossOrigin='anonymous',
// so they genuinely need it) and HLS.
//
// plex.tv is NOT proxied — it answers `Access-Control-Allow-Origin: *`, so
// sign-in, the link flow and the Home user list all work directly.
//
// The Tauri build never takes this road: its requests go through the Rust-side
// plex_request, which no browser policy applies to.
const PROXY_PREFIX = '/plex-proxy';

function needsServerProxy(): boolean {
  if (typeof window === 'undefined' || typeof location === 'undefined') return false;
  if ((window as any).__TAURI_INTERNALS__ !== undefined) return false;
  return !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
}

// Which base a media-server URL should be built against from here.
function pmsUrl(realBase: string, path: string): string {
  return (needsServerProxy() ? PROXY_PREFIX : realBase) + path;
}

// The proxy forwards to ONE registered base (see the plugin's note on why the
// target isn't in the URL). Registration is memoized per base and re-run when
// the store is pointed somewhere else.
let registeredBase: string | null = null;
let registering: Promise<void> | null = null;

async function ensurePmsProxy(realBase: string): Promise<void> {
  if (!needsServerProxy() || registeredBase === realBase) return;
  if (!registering) {
    registering = (async () => {
      try {
        await fetch(`${PROXY_PREFIX}/__target`, {
          method: 'POST',
          headers: { 'X-Proxy-Target': realBase },
        });
        registeredBase = realBase;
      } catch (e) {
        console.warn('[Plex] Could not register the proxy target:', e);
      } finally {
        registering = null;
      }
    })();
  }
  await registering;
}

/** GET a media-server endpoint, through the proxy when the origin needs it. */
async function pmsGet(realBase: string, path: string, token?: string): Promise<any> {
  await ensurePmsProxy(realBase);
  return plexGet(pmsUrl(realBase, path), token);
}

/** Non-GET media-server request, same routing as pmsGet. */
async function pmsRequest(
  method: string,
  realBase: string,
  path: string,
  token?: string,
  body?: string
): Promise<string> {
  await ensurePmsProxy(realBase);
  return plexRequest(method, pmsUrl(realBase, path), token, body);
}

// ─── Part-id bookkeeping ──────────────────────────────────────────────────────

// Direct play streams `/library/parts/{partId}/file.ext`, and a rating key
// alone cannot produce a part id — only the item's own metadata carries it.
// buildStaticStreamUrl is synchronous (it's called before the playback-info
// probe, see launchVideoPlayback), so the id has to already be known by then.
//
// Every route that reaches playback passes through one of the fetchers below
// first — catalog sync for a film, fetchSeriesEpisodes / fetchFirstEpisode for
// an episode, fetchItemPlaybackInfo for anything probed on demand — so each of
// them records what it saw here. The invariant that makes a miss harmless:
// playbackInfoFromMedia() only reports a `container` for a part it has
// recorded, and isDirectPlaySafe() refuses anything with no container. A miss
// therefore degrades to HLS, which always works, instead of building a URL
// that 404s.
const partIds = new Map<string, number>();

function partKey(itemId: string, mediaIndex = 0): string {
  return `${itemId}:${mediaIndex}`;
}

function rememberPart(itemId: string, mediaIndex: number, partId: unknown): void {
  if (typeof partId === 'number') partIds.set(partKey(itemId, mediaIndex), partId);
}

function partIdFor(itemId: string, mediaIndex = 0): number | undefined {
  return partIds.get(partKey(itemId, mediaIndex));
}

// ─── Field mapping ────────────────────────────────────────────────────────────

/** Plex tag arrays ([{tag: "Action"}, ...]) as plain names. */
function tags(list: any): string[] {
  return Array.isArray(list)
    ? list.map((t: any) => (typeof t === 'string' ? t : t?.tag)).filter((t: any): t is string => !!t)
    : [];
}

/** TMDB id out of the item's Guid array ([{id: "tmdb://646"}, ...]). */
function tmdbIdOf(item: any): number | undefined {
  const guids: any[] = Array.isArray(item?.Guid) ? item.Guid : [];
  for (const g of guids) {
    const m = /^tmdb:\/\/(\d+)/.exec(String(g?.id ?? ''));
    if (m) return Number(m[1]);
  }
  return undefined;
}

/** Absolute URL for a Plex image path, sized through the photo transcoder.
 *
 *  Going through /photo/:/transcode is not an optimization detail — a raw
 *  poster off this server measured 1.4 MB, and the transcoded 400x600 version
 *  51 KB. At a couple of thousand cases on the shelves that is the difference
 *  between a store that boots and one that eats a gigabyte of texture memory
 *  in posters alone. */
function imageUrl(
  base: string,
  token: string,
  path: string | undefined,
  width: number,
  height: number
): string | undefined {
  if (!path) return undefined;
  const inner = encodeURIComponent(path);
  // Queued, not awaited: this is sync, and every route that produces image URLs
  // has already run a catalog fetch through pmsGet, which registers the target.
  void ensurePmsProxy(base);
  return withToken(
    pmsUrl(base, `/photo/:/transcode?width=${width}&height=${height}&minSize=1&upscale=1&url=${inner}`),
    token
  );
}

/** HDR class from a video stream, in the vocabulary MediaPlaybackInfo uses. */
function videoRangeOf(stream: any): string | undefined {
  if (!stream) return undefined;
  if (stream.DOVIPresent) return 'DOVI';
  const trc = String(stream.colorTrc ?? '').toLowerCase();
  if (trc === 'smpte2084') return 'HDR10';
  if (trc === 'arib-std-b67') return 'HLG';
  // A 10-bit source with no transfer function declared is still meaningfully
  // "not plain SDR", but calling it HDR would put an HDR badge on ordinary
  // 10-bit encodes — so only the explicit signals above count.
  return 'SDR';
}

/** Audio + subtitle tracks of one Plex part, for the player's track picker. */
function streamsFromPart(part: any): MediaStreamInfo[] | undefined {
  const raw = part?.Stream;
  if (!Array.isArray(raw)) return undefined;
  const streams: MediaStreamInfo[] = raw
    .filter((s: any) => s?.streamType === STREAM_AUDIO || s?.streamType === STREAM_SUBTITLE)
    .filter((s: any) => typeof s?.id === 'number')
    .map((s: any) => ({
      // Stream.id, deliberately — see the header note. Plex's own `index` is
      // the ffmpeg stream index and is NOT what /library/parts selects on.
      index: s.id,
      type: s.streamType === STREAM_AUDIO ? ('Audio' as const) : ('Subtitle' as const),
      language: s.language || undefined,
      displayTitle: s.extendedDisplayTitle || s.displayTitle || undefined,
      codec: s.codec || undefined,
      isDefault: !!s.default,
      channels: s.streamType === STREAM_AUDIO && typeof s.channels === 'number' ? s.channels : undefined,
    }));
  return streams.length > 0 ? streams : undefined;
}

/** Container/codec info of one Plex Media entry. */
function playbackInfoFromMedia(media: any, itemId: string, mediaIndex: number): MediaPlaybackInfo | undefined {
  if (!media) return undefined;
  const part = Array.isArray(media.Part) ? media.Part[0] : undefined;
  const videoStream = Array.isArray(part?.Stream)
    ? part.Stream.find((s: any) => s?.streamType === STREAM_VIDEO)
    : undefined;
  const audioCodecs: string[] = Array.isArray(part?.Stream)
    ? part.Stream.filter((s: any) => s?.streamType === STREAM_AUDIO && s?.codec).map((s: any) =>
        String(s.codec).toLowerCase()
      )
    : media.audioCodec
      ? [String(media.audioCodec).toLowerCase()]
      : [];
  // Only claim a container when the part id is known — see the partIds note.
  // Without it direct play can't be built, and isDirectPlaySafe treats a
  // missing container as "not safe", which routes the title to HLS instead.
  const known = partIdFor(itemId, mediaIndex) !== undefined;
  return {
    container: known && media.container ? String(media.container).toLowerCase() : undefined,
    videoCodec: media.videoCodec ? String(media.videoCodec).toLowerCase() : undefined,
    audioCodecs,
    width: typeof media.width === 'number' ? media.width : undefined,
    height: typeof media.height === 'number' ? media.height : undefined,
    // Plex reports aspect ratio as a number (1.66); the model wants the
    // printable form the tech-specs table shows.
    aspectRatio: typeof media.aspectRatio === 'number' ? `${media.aspectRatio.toFixed(2)}:1` : undefined,
    videoRange: videoRangeOf(videoStream),
  };
}

/** Is this Media entry 4K? Plex's own bucket, cross-checked against the frame
 *  size so an oddly-tagged entry still lands where the store expects. */
function mediaIs4k(media: any): boolean {
  if (String(media?.videoResolution ?? '').toLowerCase() === '4k') return true;
  return is4kFrame(media?.width, media?.height);
}

/**
 * One MovieVersion per Plex Media entry. Plex models alternate editions
 * exactly the way the store does — several Media entries under one item — so
 * this is a direct translation rather than the reconstruction Jellyfin needs.
 * The 2+-only pruning happens later, in collapseDuplicateVersions.
 */
function buildVersions(item: any, itemId: string): MovieVersion[] | undefined {
  const media: any[] = Array.isArray(item?.Media) ? item.Media : [];
  if (media.length === 0) return undefined;
  const versions = media.map((m: any, idx: number) => {
    const part = Array.isArray(m.Part) ? m.Part[0] : undefined;
    rememberPart(itemId, idx, part?.id);
    const is4k = mediaIs4k(m);
    const bits = [
      qualityTag(m.width, m.height) ?? (is4k ? '4K' : undefined),
      videoRangeOf(Array.isArray(part?.Stream) ? part.Stream.find((s: any) => s?.streamType === STREAM_VIDEO) : undefined) !== 'SDR'
        ? videoRangeOf(Array.isArray(part?.Stream) ? part.Stream.find((s: any) => s?.streamType === STREAM_VIDEO) : undefined)
        : undefined,
      m.videoCodec ? String(m.videoCodec).toUpperCase() : undefined,
      typeof part?.size === 'number' ? formatBytes(part.size) : undefined,
    ].filter(Boolean);
    return {
      itemId,
      // The transcoder addresses an alternate edition by its POSITION in
      // Media[] (mediaIndex), not by Media.id — so the position is what the
      // store carries as the opaque source handle.
      mediaSourceId: String(idx),
      label: bits.join(' · ') || 'Version',
      is4k,
      width: typeof m.width === 'number' ? m.width : undefined,
      height: typeof m.height === 'number' ? m.height : undefined,
      localPath: part?.file || undefined,
      mediaStreams: streamsFromPart(part),
      mediaPlaybackInfo: playbackInfoFromMedia(m, itemId, idx),
    } satisfies MovieVersion;
  });
  // Two rips of the same film at the same resolution, codec and rounded size
  // produce the same label — real in any library that ingested a file twice,
  // and a picker row that reads identically to its neighbour tells the user
  // nothing. Fall back to the file name, which is the thing that actually
  // differs, and only then to a positional suffix.
  const counts = new Map<string, number>();
  for (const v of versions) counts.set(v.label, (counts.get(v.label) ?? 0) + 1);
  for (const [i, v] of versions.entries()) {
    if ((counts.get(v.label) ?? 0) < 2) continue;
    const fileName = v.localPath?.split('/').pop();
    v.label = fileName ? `${v.label} · ${fileName}` : `${v.label} · #${i + 1}`;
  }
  return versions;
}

/** Per-user watch state off the item's own fields. */
function watchState(item: any): Partial<Movie> {
  const viewCount = typeof item?.viewCount === 'number' ? item.viewCount : 0;
  const lastViewedAt = typeof item?.lastViewedAt === 'number' ? item.lastViewedAt : undefined;
  const viewOffset = typeof item?.viewOffset === 'number' ? item.viewOffset : 0;
  return {
    played: viewCount > 0,
    playCount: viewCount || undefined,
    // Plex stamps epoch SECONDS; the model wants ISO.
    lastPlayedDate: lastViewedAt ? new Date(lastViewedAt * 1000).toISOString() : undefined,
    resumePositionTicks: viewOffset > 0 ? viewOffset * TICKS_PER_MS : undefined,
  };
}

/** One Plex movie/show row as the store's Movie. Exported for unit tests. */
export function toMovie(item: any, base: string, token: string, libraryName: string): Movie {
  const id = String(item.ratingKey);
  const isSeries = item.type === 'show';
  const durationMs = typeof item.duration === 'number' ? item.duration : 0;
  const durationMin = Math.round(durationMs / 60000);
  const media: any[] = Array.isArray(item.Media) ? item.Media : [];
  const primary = media[0];
  const roles: any[] = Array.isArray(item.Role) ? item.Role : [];
  const versions = isSeries ? undefined : buildVersions(item, id);

  return {
    id,
    title: item.title ?? 'Untitled',
    year: typeof item.year === 'number' ? item.year : 2000,
    premiereDate: item.originallyAvailableAt || undefined,
    duration: isSeries ? 'Series' : durationMin > 0 ? `${durationMin}m` : 'N/A',
    rating: item.contentRating || 'NR',
    overview: item.summary || 'No description available.',
    director: tags(item.Director)[0] || 'Unknown Director',
    actors: roles.map((r: any) => r?.tag).filter(Boolean).slice(0, 5),
    // Portraits live on plex.tv's metadata CDN and need no token, so they are
    // used verbatim. Only present after the metadata pass — a section listing
    // gives role tags with no id or thumb.
    castPeople: roles
      .filter((r: any) => r?.tag && r?.id !== undefined)
      .slice(0, 5)
      .map((r: any) => ({
        id: String(r.id),
        name: String(r.tag),
        imageUrl: typeof r.thumb === 'string' && r.thumb ? r.thumb : undefined,
      })),
    genres: tags(item.Genre),
    localPath: (Array.isArray(primary?.Part) ? primary.Part[0]?.file : undefined) || '',
    posterUrl: imageUrl(base, token, item.thumb, 400, 600),
    backdropUrl: imageUrl(base, token, item.art, 1280, 720),
    // Plex stamps epoch SECONDS; the model (and the New Releases wall's
    // ordering) wants ISO.
    dateCreated: typeof item.addedAt === 'number' ? new Date(item.addedAt * 1000).toISOString() : '',
    isSeries,
    is4k: !isSeries && !!primary && mediaIs4k(primary),
    // `audienceRating` is the viewer score on Plex's 0-10 scale, which is what
    // the shelf's star rating expects. `rating` is the CRITIC score on the
    // same 0-10 scale — the store's criticRating is 0-100, hence the x10.
    // ratingImage/audienceRatingImage name the source (rottentomatoes://...)
    // but the scales are fixed regardless of which agent supplied them.
    communityRating: typeof item.audienceRating === 'number' ? item.audienceRating : undefined,
    criticRating: typeof item.rating === 'number' ? Math.round(item.rating * 10) : undefined,
    libraryName,
    studios: item.studio ? [String(item.studio)] : [],
    mediaStreams: isSeries ? undefined : streamsFromPart(Array.isArray(primary?.Part) ? primary.Part[0] : undefined),
    mediaPlaybackInfo: isSeries ? undefined : playbackInfoFromMedia(primary, id, 0),
    // Plex reports no per-item poster aspect ratio; its posters are uniformly
    // 2:3, which is flat mode's own default, so leaving this unset is correct
    // rather than merely convenient.
    primaryImageAspectRatio: undefined,
    versions,
    // Membership rides on the item — no second pass, unlike Jellyfin. A film
    // in several collections keeps the first one: one shelf spot.
    collectionName: tags(item.Collection)[0] || undefined,
    tmdbId: tmdbIdOf(item),
    runTimeTicks: isSeries || durationMs <= 0 ? undefined : durationMs * TICKS_PER_MS,
    ...watchState(item),
  };
}

/** One Plex episode row as the store's Episode. Exported for unit tests. */
export function toEpisode(item: any, base: string, token: string): Episode {
  const id = String(item.ratingKey);
  const media: any[] = Array.isArray(item.Media) ? item.Media : [];
  const part = Array.isArray(media[0]?.Part) ? media[0].Part[0] : undefined;
  rememberPart(id, 0, part?.id);
  const durationMs = typeof item.duration === 'number' ? item.duration : 0;
  const viewOffset = typeof item.viewOffset === 'number' ? item.viewOffset : 0;
  return {
    id,
    seriesId: String(item.grandparentRatingKey ?? ''),
    seriesName: item.grandparentTitle ?? '',
    seasonNumber: typeof item.parentIndex === 'number' ? item.parentIndex : 0,
    episodeNumber: typeof item.index === 'number' ? item.index : 0,
    name: item.title ?? '',
    overview: item.summary ?? '',
    path: part?.file ?? '',
    runTimeTicks: durationMs > 0 ? durationMs * TICKS_PER_MS : undefined,
    resumePositionTicks: viewOffset > 0 ? viewOffset * TICKS_PER_MS : undefined,
    thumbUrl: imageUrl(base, token, item.thumb, 480, 270),
    seasonId: item.parentRatingKey !== undefined ? String(item.parentRatingKey) : undefined,
    seasonPrimaryUrl: imageUrl(base, token, item.parentThumb, 400, 600),
  };
}

// ─── Catalog sync ─────────────────────────────────────────────────────────────

/** Video sections of the server, with the non-video ones logged and dropped. */
async function fetchVideoSections(base: string, token: string): Promise<{ key: string; title: string; type: string }[]> {
  const container = await pmsGet(base, '/library/sections', token);
  const dirs: any[] = Array.isArray(container?.Directory) ? container.Directory : [];
  return dirs
    .filter((d: any) => {
      const keep = d?.type === 'movie' || d?.type === 'show';
      // Always log the verdict per section — "why is my library missing?"
      // should be answerable from the console without a debugger.
      console.info(
        `[Plex] Section "${d?.title}" (type=${d?.type}): ${keep ? 'syncing' : 'skipped (non-video)'}`
      );
      return keep;
    })
    .map((d: any) => ({ key: String(d.key), title: String(d.title), type: String(d.type) }));
}

/**
 * Second pass over a section's items: full metadata, comma-batched. This is
 * what supplies per-track streams and cast portraits, neither of which a
 * section listing carries. Failures degrade rather than abort — a batch that
 * doesn't come back just leaves those titles with listing-level detail, which
 * is enough to shelve and play them.
 */
async function enrichWithMetadata(
  base: string,
  token: string,
  items: any[],
  onProgress?: (stage: string) => void
): Promise<Map<string, any>> {
  const byId = new Map<string, any>();
  for (let i = 0; i < items.length; i += METADATA_BATCH) {
    const chunk = items.slice(i, i + METADATA_BATCH);
    const keys = chunk.map((it) => it.ratingKey).join(',');
    onProgress?.('page');
    try {
      const container = await pmsGet(base, `/library/metadata/${keys}`, token);
      for (const full of metadataOf(container)) byId.set(String(full.ratingKey), full);
    } catch (e) {
      console.warn(`[Plex] Metadata batch ${i / METADATA_BATCH + 1} failed; using listing detail:`, e);
    }
  }
  return byId;
}

/** Collection artwork + TMDB ids for one section, for the collection displays. */
async function syncCollections(base: string, token: string, sectionKey: string): Promise<void> {
  let container: any;
  try {
    container = await pmsGet(base, `/library/sections/${sectionKey}/collections?includeGuids=1`, token);
  } catch (e) {
    console.warn(`[Plex] Could not list collections for section ${sectionKey}:`, e);
    return;
  }
  for (const col of metadataOf(container)) {
    const name = col?.title;
    if (!name) continue;
    collectionSyncStats.boxSets++;
    collectionArt.set(String(name), {
      posterUrl: imageUrl(base, token, col.thumb, 400, 600),
      backdropUrl: imageUrl(base, token, col.art, 1280, 720),
    });
    const tmdb = tmdbIdOf(col);
    if (tmdb !== undefined) {
      collectionTmdbIds.set(String(name), tmdb);
      collectionSyncStats.scraped++;
    }
  }
}

async function fetchLibrariesAndMovies(
  rawUrl: string,
  token: string,
  _userId: string,
  onProgress?: (stage: string) => void,
  opts?: CatalogSyncOptions
): Promise<MediaLibrary[]> {
  if (!token || !rawUrl) throw new Error('Missing connection credentials.');
  const base = normalizeUrl(rawUrl);
  console.log(`[Plex] Querying sections on ${base}...`);
  resetCollectionState();

  const sections = await fetchVideoSections(base, token);
  rememberKnownLibraries(sections.map((s) => ({ id: s.key, name: s.title })));

  const excluded = opts?.excludeLibraryIds;
  const carried = excluded?.size
    ? sections.filter((s) => {
        const skip = excluded.has(s.key);
        if (skip) {
          console.info(
            `[Plex] Section "${s.title}": skipped (not carried by this store — Settings → Connection → Store Libraries)`
          );
        }
        return !skip;
      })
    : sections;

  const libraries: MediaLibrary[] = [];
  // Sections are synced one at a time rather than in parallel: a section
  // listing plus its metadata batches is already a lot of concurrent work for
  // a NAS-hosted server, and two sections racing measurably slowed the whole
  // sync on the box this was written against.
  for (const section of carried) {
    onProgress?.(`library "${section.title}"`);
    console.log(`[Plex] Syncing section "${section.title}" (${section.key})...`);
    try {
      // type=1 films / type=2 shows keeps the `collection` rows a bare /all
      // returns out of the catalog; they're read separately for artwork.
      const typeParam = section.type === 'show' ? '2' : '1';
      const container = await pmsGet(
        base,
        `/library/sections/${section.key}/all?type=${typeParam}&includeGuids=1&includeCollections=1`,
        token
      );
      const listing = metadataOf(container).filter((it: any) => it?.type === 'movie' || it?.type === 'show');
      if (listing.length === 0) continue;

      const full = await enrichWithMetadata(base, token, listing, onProgress);
      const movies = listing.map((it: any) => {
        // Prefer the enriched record, falling back to the listing row. The
        // listing carries watch state that a plain metadata fetch also has, so
        // either source is complete enough on its own.
        const merged = full.get(String(it.ratingKey)) ?? it;
        return toMovie(merged, base, token, section.title);
      });
      const collapsed = collapseDuplicateVersions(movies, `section "${section.title}"`);

      const genresSet = new Set<string>();
      collapsed.forEach((m) => m.genres.forEach((g) => genresSet.add(g)));

      libraries.push({
        id: section.key,
        name: section.title,
        movies: collapsed,
        genres: Array.from(genresSet).sort(),
      });

      onProgress?.('collection membership');
      await syncCollections(base, token, section.key);
    } catch (err) {
      console.error(`[Plex] Failed to sync section "${section.title}":`, err);
    }
  }

  if (libraries.length === 0) throw new Error('No movies found in your Plex libraries.');
  onProgress?.('done');
  console.log(`[Plex] Successfully mapped ${libraries.length} libraries.`);
  return libraries;
}

// ─── Series ───────────────────────────────────────────────────────────────────

async function fetchSeriesEpisodes(
  rawUrl: string,
  token: string,
  _userId: string,
  seriesId: string
): Promise<Episode[]> {
  const base = normalizeUrl(rawUrl);
  try {
    // allLeaves returns every episode of the show across all seasons in one
    // response, already in season-then-episode order.
    const container = await pmsGet(base, `/library/metadata/${seriesId}/allLeaves`, token);
    return metadataOf(container).map((e: any) => toEpisode(e, base, token));
  } catch (e) {
    console.error(`[Plex] Failed to list episodes for series ${seriesId}:`, e);
    return [];
  }
}

async function fetchFirstEpisodeOfSeries(
  rawUrl: string,
  token: string,
  userId: string,
  seriesId: string
): Promise<EpisodeRef | null> {
  const episodes = await fetchSeriesEpisodes(rawUrl, token, userId, seriesId);
  const first = episodes[0];
  return first ? { id: first.id, path: first.path } : null;
}

async function fetchItemPlaybackInfo(
  rawUrl: string,
  token: string,
  _userId: string,
  itemId: string
): Promise<MediaPlaybackInfo | undefined> {
  const base = normalizeUrl(rawUrl);
  try {
    const container = await pmsGet(base, `/library/metadata/${itemId}`, token);
    const item = metadataOf(container)[0];
    const media = Array.isArray(item?.Media) ? item.Media[0] : undefined;
    const part = Array.isArray(media?.Part) ? media.Part[0] : undefined;
    rememberPart(itemId, 0, part?.id);
    return playbackInfoFromMedia(media, itemId, 0);
  } catch (e) {
    console.error(`[Plex] Failed to probe media info for item ${itemId}:`, e);
    return undefined;
  }
}

// ─── Streaming ────────────────────────────────────────────────────────────────

function buildStaticStreamUrl(rawUrl: string, token: string, itemId: string, mediaSourceId?: string): string {
  const base = normalizeUrl(rawUrl);
  const mediaIndex = mediaSourceId ? Number(mediaSourceId) || 0 : 0;
  const partId = partIdFor(itemId, mediaIndex);
  if (partId === undefined) {
    // Unreachable in practice (see the partIds note) — but if it ever happens,
    // say so rather than handing the player a URL that 404s. The caller only
    // uses this when isDirectPlaySafe passed, which needs a container, which
    // playbackInfoFromMedia withholds precisely when this is unknown.
    console.warn(`[Plex] No part id recorded for item ${itemId}; direct play unavailable.`);
    return '';
  }
  // The timestamp segment real Plex clients include is optional — verified
  // against 1.41.5, which serves the same 206 without it.
  void ensurePmsProxy(base);
  return withToken(pmsUrl(base, `/library/parts/${partId}/file`), token);
}

// Session handle baked into the most recently built HLS URL, so the player can
// tear the transcode down before rebuilding it. Same contract as the Jellyfin
// backend's PlaySessionId.
let lastSessionId: string | undefined;

function buildHlsStreamUrl(rawUrl: string, token: string, itemId: string, opts?: HlsStreamOptions): string {
  const base = normalizeUrl(rawUrl);
  const session = `halcyon-${itemId}-${Date.now()}`;
  lastSessionId = session;

  const hevcCopy =
    isHevcPassThroughEnabled() && (opts?.sourceVideoCodec === 'hevc' || opts?.sourceVideoCodec === 'h265');
  // Same reasoning as the Jellyfin path: a copy-eligible source gets the high
  // ceiling so the server remuxes instead of re-encoding down; everything else
  // gets the SourceBuffer-sized default. Plex counts in KILOBITS per second.
  const maxKbps = Math.round((opts?.maxBitrate ?? (hevcCopy ? COPY_VIDEO_BITRATE : DEFAULT_VIDEO_BITRATE)) / 1000);

  const params = new URLSearchParams({
    path: `/library/metadata/${itemId}`,
    mediaIndex: opts?.mediaSourceId ?? '0',
    partIndex: '0',
    protocol: 'hls',
    fastSeek: '1',
    // directPlay off, directStream on: let the server remux/copy whatever it
    // can and only re-encode what it must.
    directPlay: '0',
    directStream: hevcCopy ? '1' : '0',
    subtitleSize: '100',
    audioBoost: '100',
    location: 'lan',
    maxVideoBitrate: String(maxKbps),
    videoQuality: '100',
    session,
    'X-Plex-Client-Identifier': clientIdentifier(),
    'X-Plex-Platform': PLATFORM,
    'X-Plex-Token': token,
  });
  if (opts?.maxWidth) params.set('videoResolution', `${opts.maxWidth}x${Math.round((opts.maxWidth * 9) / 16)}`);
  // Plex seeks a transcode with an OFFSET IN SECONDS, not a start position in
  // the source's own units.
  if (opts?.startPositionTicks) params.set('offset', String(Math.floor(opts.startPositionTicks / 10_000_000)));
  // 10-bit HEVC can't be copied to a webview that only decodes Main.
  if (hevcCopy && !isHevcMain10Supported()) params.set('videoBitDepth', '8');

  // Track selection is NOT a stream-URL parameter on Plex — it's a property of
  // the part, set with a PUT before the stream is opened (see selectTracks).
  // Firing it here keeps buildHlsStreamUrl's synchronous signature while still
  // honoring the picker: the PUT lands well before the first segment request,
  // and a failed selection degrades to the container's default track rather
  // than breaking playback.
  if (opts?.audioStreamIndex !== undefined || opts?.subtitleStreamIndex !== undefined) {
    void selectTracks(base, token, itemId, opts.mediaSourceId, opts.audioStreamIndex, opts.subtitleStreamIndex);
  }

  void ensurePmsProxy(base);
  return pmsUrl(base, `/video/:/transcode/universal/start.m3u8?${params.toString()}`);
}

/**
 * Point the item's part at specific audio/subtitle streams. Plex remembers the
 * selection server-side per part, which is why it isn't a stream parameter.
 * `0` is Plex's "no subtitle" sentinel, so turning captions back off is an
 * explicit 0 rather than an omitted field.
 */
async function selectTracks(
  base: string,
  token: string,
  itemId: string,
  mediaSourceId?: string,
  audioStreamIndex?: number,
  subtitleStreamIndex?: number
): Promise<void> {
  const partId = partIdFor(itemId, mediaSourceId ? Number(mediaSourceId) || 0 : 0);
  if (partId === undefined) {
    console.warn(`[Plex] No part id for item ${itemId}; keeping the container's default tracks.`);
    return;
  }
  const params = new URLSearchParams({ allParts: '1' });
  if (audioStreamIndex !== undefined) params.set('audioStreamID', String(audioStreamIndex));
  if (subtitleStreamIndex !== undefined) params.set('subtitleStreamID', String(subtitleStreamIndex));
  try {
    await pmsRequest('PUT', base, `/library/parts/${partId}?${params.toString()}`, token);
  } catch (e) {
    console.warn(`[Plex] Track selection failed for part ${partId}:`, e);
  }
}

async function stopActiveEncoding(sessionId: string, log?: (msg: string) => void): Promise<void> {
  const url = localStorage?.getItem('jellyfin_url');
  const token = localStorage?.getItem('jellyfin_token');
  if (!url || !token) return;
  const base = normalizeUrl(url);
  try {
    await pmsRequest('GET', base, `/video/:/transcode/universal/stop?session=${encodeURIComponent(sessionId)}`, token);
  } catch (e: any) {
    console.warn('[Plex] Failed to stop active encoding:', e);
    log?.(`[Player] stopActiveEncoding failed: ${e?.message ?? e}`);
  }
}

function isStreamCopyUrl(src: string): boolean {
  try {
    const v = new URL(src, 'http://x').searchParams.get('maxVideoBitrate');
    // maxVideoBitrate is in kbps here, the ceiling constant in bits/s.
    return v !== null && Number(v) * 1000 >= COPY_VIDEO_BITRATE;
  } catch {
    return false;
  }
}

// ─── Progress reporting ───────────────────────────────────────────────────────

/** Plex's single timeline endpoint covers start, progress, and stop. */
async function reportTimeline(
  rawUrl: string,
  token: string,
  itemId: string,
  state: 'playing' | 'paused' | 'stopped',
  positionTicks: number
): Promise<void> {
  const base = normalizeUrl(rawUrl);
  const params = new URLSearchParams({
    ratingKey: itemId,
    key: `/library/metadata/${itemId}`,
    state,
    time: String(Math.max(0, Math.floor(positionTicks / TICKS_PER_MS))),
  });
  try {
    await pmsRequest('GET', base, `/:/timeline?${params.toString()}`, token);
  } catch (e) {
    console.warn(`[Plex] Failed to report ${state} for item ${itemId}:`, e);
  }
}

// ─── Sign-in ──────────────────────────────────────────────────────────────────

/** The account behind a token, as the store's session. */
async function sessionFromToken(token: string): Promise<MediaSession> {
  const raw = await plexRequest('GET', `${PLEX_TV}/api/v2/user`, token);
  let account: any;
  try {
    account = JSON.parse(raw);
  } catch {
    throw new Error('Plex returned an invalid account response.');
  }
  if (!account?.id) throw new Error('That token does not identify a Plex account.');
  return {
    accessToken: token,
    userId: String(account.id),
    userName: String(account.username || account.title || account.email || 'Plex user'),
  };
}

/**
 * Plex Home members, as membership cards. Requires the account token — unlike
 * Jellyfin there is no unauthenticated list on the server itself, because Plex
 * keeps the user list on the account rather than the server.
 *
 * `protected` members need their Home PIN to switch, which the card picker
 * collects the same way it collects a Jellyfin password.
 */
async function fetchPublicUsers(_url: string, token?: string): Promise<PublicUser[]> {
  if (!token) return []; // no session yet — caller falls back to signing in
  const raw = await plexRequest('GET', `${PLEX_TV}/api/v2/home/users`, token);
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('Plex returned an invalid Home user list.');
  }
  const users: any[] = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : [];
  return users
    .filter((u: any) => u?.id !== undefined && (u?.title || u?.username))
    .map((u: any) => ({
      id: String(u.id),
      name: String(u.title || u.username),
      hasPassword: !!u.protected,
      avatarUrl: typeof u.thumb === 'string' ? u.thumb : undefined,
      switchId: u.uuid ? String(u.uuid) : undefined,
    }));
}

/**
 * Swap the account token for THAT Home member's own token, so the catalog
 * carries their watch state and the timeline reports land on their history.
 * This is the step with no Jellyfin equivalent: Jellyfin authenticates each
 * user directly, Plex authenticates the account and then switches within it.
 */
async function signInAsPublicUser(
  _url: string,
  user: PublicUser,
  secret?: string,
  token?: string
): Promise<MediaSession> {
  if (!token) throw new Error('Sign in to the Plex account before picking a member.');
  if (!user.switchId) throw new Error(`No Home id for "${user.name}" — sign in by name instead.`);
  const pin = secret ? `?pin=${encodeURIComponent(secret)}` : '';
  const raw = await plexRequest('POST', `${PLEX_TV}/api/v2/home/users/${user.switchId}/switch${pin}`, token);
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('Plex refused the member switch.');
  }
  if (!data?.authToken) throw new Error(`Could not switch to "${user.name}". Check the PIN.`);
  return {
    accessToken: String(data.authToken),
    userId: String(data.id ?? user.id),
    userName: String(data.title || user.name),
  };
}

/**
 * Sign in with a plex.tv account name and password. Kept because the setup
 * terminal's manual screen offers it, but the link flow below is the better
 * road on an HTPC — and an account with 2FA can only use the link flow, since
 * this endpoint has nowhere to put the second factor.
 */
async function authenticateUser(_url: string, username: string, password?: string): Promise<MediaSession> {
  const raw = await plexRequest(
    'POST',
    `${PLEX_TV}/api/v2/users/signin`,
    undefined,
    JSON.stringify({ login: username, password: password ?? '' })
  );
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('Plex returned an invalid sign-in response.');
  }
  if (!data?.authToken) throw new Error('Plex refused those credentials.');
  return {
    accessToken: String(data.authToken),
    userId: String(data.id ?? ''),
    userName: String(data.username || data.title || username),
  };
}

/**
 * The plex.tv/link PIN flow — a four-character code the user types on another
 * device. This is the right road on an HTPC: no keyboard needed on the box
 * itself, and it's the only sign-in that works with 2FA.
 */
async function beginLink(): Promise<LinkFlow> {
  const raw = await plexRequest('POST', `${PLEX_TV}/api/v2/pins`);
  let pin: any;
  try {
    pin = JSON.parse(raw);
  } catch {
    throw new Error('Plex returned an invalid link code.');
  }
  if (!pin?.id || !pin?.code) throw new Error('Plex issued no link code.');

  const expiresAt = pin.expiresAt ? Date.parse(pin.expiresAt) : Date.now() + 15 * 60 * 1000;
  let cancelled = false;

  return {
    code: String(pin.code),
    verificationUrl: 'plex.tv/link',
    expiresAt,
    cancel() {
      cancelled = true;
    },
    async wait(): Promise<MediaSession | null> {
      // 3s between polls: fast enough that approval feels immediate on the
      // CRT, slow enough that a 15-minute code costs plex.tv ~300 requests.
      while (!cancelled && Date.now() < expiresAt) {
        await new Promise((r) => setTimeout(r, 3000));
        if (cancelled) return null;
        try {
          const body = await plexRequest('GET', `${PLEX_TV}/api/v2/pins/${pin.id}`);
          const state = JSON.parse(body);
          if (state?.authToken) return await sessionFromToken(String(state.authToken));
        } catch {
          // A blip must not drop a linking HTPC back to the form — keep
          // polling until the code genuinely expires.
        }
      }
      return null;
    },
  };
}

// ─── Backend ──────────────────────────────────────────────────────────────────

export const plexBackend: MediaBackend = {
  kind: 'plex',
  label: 'Plex',

  normalizeUrl,

  async identify(rawUrl: string): Promise<boolean> {
    // /identity is Plex's unauthenticated "who am I" endpoint — it answers
    // even on a claimed server that 401s everything else.
    try {
      const container = await pmsGet(normalizeUrl(rawUrl), '/identity');
      return typeof container?.machineIdentifier === 'string';
    } catch {
      return false;
    }
  },

  async validateToken(rawUrl: string, token: string): Promise<boolean> {
    if (!rawUrl || !token) return false;
    try {
      await pmsGet(normalizeUrl(rawUrl), '/', token);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/^HTTP error (401|403):/.test(msg)) return false;
      throw e; // transient — never tear down a session over a blip (#125)
    }
  },

  authenticateUser,
  fetchPublicUsers,
  buildUserAvatarUrl: (_url: string, user: PublicUser) => user.avatarUrl ?? null,
  signInAsPublicUser,
  beginLink,
  adoptToken: (_url: string, token: string) => sessionFromToken(token),

  async fetchLibraryList(rawUrl: string, token: string): Promise<LibrarySummary[]> {
    if (!token || !rawUrl) throw new Error('Missing connection credentials.');
    const sections = await fetchVideoSections(normalizeUrl(rawUrl), token);
    const list = sections.map((s) => ({ id: s.key, name: s.title }));
    rememberKnownLibraries(list);
    return list;
  },
  fetchLibrariesAndMovies,

  fetchSeriesEpisodes,
  fetchFirstEpisodeOfSeries,

  // Every subtitle track is burned in server-side. Plex does serve subtitle
  // streams, but no VTT-sidecar endpoint of its has been verified against a
  // real server, and shipping an unverified URL here would silently break
  // captions rather than merely cost a transcode. Burn-in is what this backend
  // has always done; the cheap road is a follow-up, gated on measuring it.
  subtitleDelivery: (_streams, streamIndex) =>
    streamIndex === undefined ? { kind: 'none' } : { kind: 'burn-in', streamIndex },
  buildSubtitleTrackUrl: () => null,

  fetchItemPlaybackInfo,
  buildStaticStreamUrl,
  buildHlsStreamUrl,
  lastHlsPlaySessionId: () => lastSessionId,
  stopActiveEncoding,
  isStreamCopyUrl,

  reportPlaybackStart: (url, token, itemId) => reportTimeline(url, token, itemId, 'playing', 0),
  reportPlaybackProgress: (url, token, itemId, positionTicks, isPaused) =>
    reportTimeline(url, token, itemId, isPaused ? 'paused' : 'playing', positionTicks),
  reportPlaybackStopped: (url, token, itemId, positionTicks) =>
    reportTimeline(url, token, itemId, 'stopped', positionTicks),
};
