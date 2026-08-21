// Direct-to-TMDB client for the streaming-service sections (GH #86 follow-up,
// owner correction 2026-08-21): gating "WATCH ON <SERVICE>" aisles on a
// Jellyseerr install was wrong -- a `tmdb_apikey` setting alone must be
// enough. This is the TMDB half of the source ladder resolved by
// streaming-catalog.ts's resolveStreamingSource(); jellyseerr.ts's
// fetchStreamingMovies is the other (now-fallback) half.
//
// Shaped like jellyseerr.ts (config resolution, network transport, reuse of
// streaming-catalog.ts's pure selection logic) but talks to
// api.themoviedb.org directly instead of proxying through a request server.
// That means it does NOT need jellyseerr.ts's Tauri-invoke / /dev-proxy
// detour: TMDB's CORS policy is wide open (`access-control-allow-origin: *`
// on both the plain response and the Authorization-header preflight,
// verified 2026-08-21 with `curl -sI` / `curl -sI -X OPTIONS` against
// api.themoviedb.org), so a browser can call it with a plain `fetch`.
//
// Kept free of any runtime import from jellyseerr.ts on purpose: that module
// pulls in `@tauri-apps/api/core` and extensionless local imports that only
// resolve under vite's bundler, which breaks this module's `node --test`
// story (tests/tmdb.test.ts) the same way it would for streaming-catalog.ts.
// getDismissedTmdbIds below duplicates jellyseerr.ts's getDismissedTitleIds
// (same localStorage key, same shape) for that reason -- see this module's
// header comment there for the file-size precedent (streaming-catalog.ts
// duplicates the TMDB genre table for the identical reason).
import type { Movie } from './jellyfin.ts';
import {
  type StreamingServiceDef, type RawDiscoverItem,
  resolveEnabledServices, matchProviderId, ingestStreamingResults, STREAMING_CAP_PER_SERVICE,
} from './streaming-catalog.ts';

const TMDB_API_BASE = 'https://api.themoviedb.org/3';
// TMDB's watch-provider data is region-keyed; matches jellyseerr.ts's
// fetchStreamingMovies hardcoded default until a settings UI exists to pick
// one (GH #86 follow-up).
const STREAMING_WATCH_REGION = 'US';
const STREAMING_FETCH_CONCURRENCY = 8;
const REQUEST_TIMEOUT_MS = 15_000;

export interface TmdbConfig {
  apiKey: string;
}

/**
 * Resolve the `tmdb_apikey` setting from any key store (localStorage by
 * default, or an injected reader for tests -- same shape as
 * seerr-config.ts's resolveSeerrConfig). Blank/whitespace-only reads as
 * unconfigured, same rule every other credential in this app follows.
 */
export function getTmdbConfig(
  read: (key: string) => string | null | undefined = (key) =>
    (typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null)
): TmdbConfig | null {
  const apiKey = (read('tmdb_apikey') || '').trim();
  return apiKey ? { apiKey } : null;
}

/**
 * TMDB issues two credential shapes: a v3 "API Key" (a plain 32-character
 * hex string, sent as the `api_key` query param) and a v4 "API Read Access
 * Token" (a JWT, sent as an `Authorization: Bearer` header). JWTs always
 * start with the fixed base64url header `{"alg":...` -> `eyJ`, which is
 * enough to tell the two apart without asking the owner which kind they
 * pasted.
 */
export function isV4ReadAccessToken(key: string): boolean {
  return key.startsWith('eyJ');
}

/**
 * One TMDB API round trip. Never includes the constructed URL (which, for a
 * v3 key, carries the key itself as a query param) in a thrown error or a
 * log line -- errors surface the HTTP status/message only.
 */
async function tmdbRequest(config: TmdbConfig, path: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${TMDB_API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (isV4ReadAccessToken(config.apiKey)) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  } else {
    url.searchParams.set('api_key', config.apiKey);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), { headers, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`TMDB request to ${path} failed: HTTP ${response.status}`);
    }
    return await response.json();
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error(`TMDB request to ${path} timed out.`);
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

const DISMISSED_IDS_KEY = 'jellyseerr_dismissed_ids';

/** Same pool jellyseerr.ts's getDismissedTitleIds reads -- a title "not
 *  interested"-dismissed through one source must stay dismissed through the
 *  other. */
function getDismissedTmdbIds(): Set<number> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(DISMISSED_IDS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x: unknown) => typeof x === 'number') : []);
  } catch {
    return new Set();
  }
}

/** One entry off TMDB's own (snake_case) `/watch/providers/movie` `results`
 *  array. */
interface TmdbProviderRaw {
  provider_id?: number;
  provider_name?: string;
}

/** One entry off TMDB's own (snake_case) `/discover/movie` `results` array.
 *  Normalized into streaming-catalog.ts's RawDiscoverItem (which mirrors
 *  Jellyseerr's camelCased proxy shape) below. TMDB has no notion of "already
 *  in your Jellyfin library" the way Jellyseerr's proxy does -- there is no
 *  `mediaInfo` equivalent here, so normalizeDiscoverItem leaves that field
 *  undefined and ingestStreamingResults' owned/requested filter is simply a
 *  no-op on this path. */
interface TmdbDiscoverItemRaw {
  id?: number;
  title?: string;
  name?: string;
  release_date?: string;
  poster_path?: string;
  overview?: string;
  vote_average?: number;
  genre_ids?: number[];
}

export function normalizeDiscoverItem(raw: TmdbDiscoverItemRaw): RawDiscoverItem {
  return {
    id: raw.id,
    title: raw.title || raw.name,
    releaseDate: raw.release_date,
    posterPath: raw.poster_path,
    overview: raw.overview,
    voteAverage: raw.vote_average,
    genreIds: raw.genre_ids,
  };
}

/**
 * Fetch every enabled streaming service's watch-provider stock straight from
 * TMDB: resolve the region's provider list, match the enabled service defs
 * against it by name, then fetch one page of `/discover/movie` per matched
 * service concurrently -- filtered to `with_watch_monetization_types=flatrate`
 * (subscription titles only), the filter Jellyseerr's proxied discover
 * endpoint has no equivalent for.
 *
 * Never throws: unconfigured, unreachable, a rejected watch-provider list, or
 * a single service's discover call failing all resolve to fewer (or zero)
 * streaming titles, never a broken boot. A service whose name doesn't match
 * anything in the region's provider list is logged once (not per-title) so a
 * TMDB rename shows up on the boot console instead of a silently empty aisle.
 */
export async function fetchStreamingMoviesFromTmdb(servicesOverrideCsv?: string | null): Promise<Movie[]> {
  const config = getTmdbConfig();
  if (!config) return [];

  const wanted = resolveEnabledServices(servicesOverrideCsv);
  let providers: { id: number; name: string }[] = [];
  try {
    const list = await tmdbRequest(config, '/watch/providers/movie', { watch_region: STREAMING_WATCH_REGION });
    const results: TmdbProviderRaw[] = Array.isArray(list?.results) ? list.results : [];
    providers = results
      .filter((p) => typeof p?.provider_id === 'number' && typeof p?.provider_name === 'string')
      .map((p) => ({ id: p.provider_id as number, name: p.provider_name as string }));
  } catch (e) {
    console.warn('[TMDB] Streaming: failed to load the watch-provider list -- no streaming sections built:', e);
    return [];
  }

  const matched: { def: StreamingServiceDef; providerId: number }[] = [];
  const unmatched: string[] = [];
  for (const def of wanted) {
    const providerId = matchProviderId(def, providers);
    if (providerId !== null) matched.push({ def, providerId });
    else unmatched.push(def.name);
  }
  if (unmatched.length > 0) {
    console.warn(
      `[TMDB] Streaming: no provider match in region ${STREAMING_WATCH_REGION} for: ${unmatched.join(', ')}` +
      ' -- check the name against TMDB\'s own watch-provider list (a rename on TMDB\'s side, most likely).'
    );
  }
  if (matched.length === 0) return [];

  const dismissed = getDismissedTmdbIds();
  const movies: Movie[] = [];
  for (let i = 0; i < matched.length; i += STREAMING_FETCH_CONCURRENCY) {
    const batch = matched.slice(i, i + STREAMING_FETCH_CONCURRENCY);
    const results = await Promise.all(batch.map(async ({ def, providerId }): Promise<Movie[]> => {
      try {
        const data = await tmdbRequest(config, '/discover/movie', {
          with_watch_providers: String(providerId),
          watch_region: STREAMING_WATCH_REGION,
          with_watch_monetization_types: 'flatrate',
          page: '1',
        });
        const items: TmdbDiscoverItemRaw[] = Array.isArray(data?.results) ? data.results : [];
        return ingestStreamingResults(items.map(normalizeDiscoverItem), def, { dismissed, cap: STREAMING_CAP_PER_SERVICE });
      } catch (e) {
        console.warn(`[TMDB] Streaming: discover fetch failed for ${def.name}:`, e);
        return [];
      }
    }));
    for (const r of results) movies.push(...r);
  }

  console.log(`[TMDB] Streaming: ${movies.length} title(s) across ${matched.length} service(s).`);
  return movies;
}
