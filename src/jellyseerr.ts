// Jellyseerr integration: an optional "coming soon" data source layered on top
// of the Jellyfin catalog. If a Jellyseerr server isn't configured, every
// export here is a no-op / returns an empty list -- callers never need to
// branch on whether the feature is enabled.
//
// Config (base URL + API key) is entered/stored the same way the Jellyfin
// connection is (see main.ts's login overlay, which persists jellyfin_url /
// jellyfin_token / etc. to localStorage): two additional optional fields,
// `jellyseerr_url` and `jellyseerr_apikey`.
import { invoke } from '@tauri-apps/api/core';
import { Movie } from './jellyfin';
import { isDemoMode } from './demo-mode';
import { resolveSeerrConfig as resolveSeerr, type SeerrConfig } from './seerr-config';
import { activeSuggestionWindow, titleInWindow, windowGteParam, windowLteParam } from './media-release-date';
import {
  type StreamingServiceDef, type RawDiscoverItem,
  resolveEnabledServices, matchProviderId, ingestStreamingResults, STREAMING_CAP_PER_SERVICE,
} from './streaming-catalog';

// Re-exported under the historical name so existing importers are untouched.
export type JellyseerrConfig = SeerrConfig;
export { resolveSeerrConfig } from './seerr-config';

const TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/w342';

// TMDB's movie genre list is a fixed, closed set, and the /discover endpoints
// return it as bare `genreIds` rather than names. Resolving those host-side
// would cost one detail request per discovery title (36 extra round trips at
// boot) to recover a mapping that never changes -- so keep it static. Names
// match TMDB's own strings, which is what storeCategoryCandidates()
// lowercases and matches on (store-layout.ts).
const TMDB_MOVIE_GENRES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance',
  878: 'Science Fiction', 10770: 'TV Movie', 53: 'Thriller', 10752: 'War',
  37: 'Western',
};

/** TMDB genre ids -> names. Unknown ids are dropped rather than guessed. */
function genreNames(genreIds: unknown): string[] {
  if (!Array.isArray(genreIds)) return [];
  return genreIds
    .map((id) => (typeof id === 'number' ? TMDB_MOVIE_GENRES[id] : undefined))
    .filter((n): n is string => !!n);
}

// Jellyseerr/Overseerr MediaStatus enum (as returned on a request's `media`
// object): 1=unknown, 2=pending, 3=processing, 4=partially available,
// 5=available. Anything short of "available" means the title has been
// requested but hasn't fully landed in the library yet -- what this module
// surfaces as a coming-soon title. (Jellyfin will already have picked up
// anything truly available, so those are skipped here to avoid duplicates.)
const MEDIA_STATUS_AVAILABLE = 5;

// Config resolution (which keys, which aliases, the base64 padding repair)
// lives in seerr-config.ts so it can be unit-tested without this module's
// Tauri/DOM imports — see tests/seerr-config.test.ts.
export function getJellyseerrConfig(): JellyseerrConfig | null {
  // import.meta.env members must be referenced literally — vite substitutes
  // them at build time, so a computed lookup would resolve to nothing.
  const env: Record<string, string | undefined> = typeof import.meta.env !== 'undefined' ? {
    jellyseerr_url: import.meta.env.VITE_JELLYSEERR_URL,
    jellyseerr_apikey: import.meta.env.VITE_JELLYSEERR_APIKEY,
    seerr_url: import.meta.env.VITE_SEERR_URL,
    seerr_apikey: import.meta.env.VITE_SEERR_APIKEY,
    overseerr_url: import.meta.env.VITE_OVERSEERR_URL,
    overseerr_apikey: import.meta.env.VITE_OVERSEERR_APIKEY,
  } : {};
  return resolveSeerr((key) =>
    (typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null) ?? env[key] ?? null);
}

// Fixtures that exist to surface recommendations — the shelf-lip "ASK FOR
// RECOMMENDATIONS!" clasps that summon the clerk — should only be built when
// the integration is really there to back them; an ask-me button in a store
// with no recommendation source is a promise the clerk can't keep. The demo
// build and the visual-verification harness have no server but synthesize
// Jellyseerr-shaped stock (collection gaps, discovery titles), so they mark
// themselves synthetic and keep the fixtures.
let syntheticJellyseerr = isDemoMode;

export function markSyntheticJellyseerr(): void {
  syntheticJellyseerr = true;
}

/** Is the integration live enough to hang recommendation fixtures on? */
export function isJellyseerrAvailable(): boolean {
  return syntheticJellyseerr || getJellyseerrConfig() !== null;
}

// Mirrors jellyfin.ts's jellyfinRequest transport: Tauri invoke when running
// inside the app shell (so CORS never applies and the request happens on the
// host, not the sandboxed webview), plain fetch with a timeout otherwise.
// `method`/`body` extend this beyond read-only GETs so requestMovie() below
// can POST a real Jellyseerr request through the same plumbing.
async function jellyseerrRequest(
  config: JellyseerrConfig,
  path: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown
): Promise<any> {
  const url = `${config.url}${path}`;
  const hasTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
  const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;

  let responseStr: string;
  if (hasTauri) {
    responseStr = await invoke<string>('jellyseerr_request', {
      method,
      url,
      apiKey: config.apiKey,
      body: bodyStr,
    });
  } else {
    // Browser build: Jellyseerr never answers the CORS preflight the
    // X-Api-Key header triggers, so a direct fetch dies in the browser every
    // time. Route through the vite dev/preview server's /dev-proxy middleware
    // (vite.config.ts) instead, which forwards to the real URL host-side.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch('/dev-proxy', {
        method,
        headers: {
          'X-Proxy-Target': url,
          'X-Api-Key': config.apiKey,
          'Content-Type': 'application/json',
        },
        body: bodyStr,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP error ${response.status}: ${text}`);
      }
      responseStr = await response.text();
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        throw new Error(`Request to ${url} timed out.`);
      }
      throw e;
    }
  }

  try {
    return JSON.parse(responseStr);
  } catch (e) {
    throw new Error(responseStr || 'Jellyseerr returned an invalid response.');
  }
}

/**
 * One cheap authenticated round-trip answering "does Jellyseerr actually
 * accept this URL + API key?". The sync loaders below all swallow failures by
 * design (the integration must never block boot), which historically meant a
 * rejected key produced zero visible evidence anywhere — the boot console uses
 * this to print a definitive status line instead.
 */
export async function pingJellyseerr(): Promise<{ ok: boolean; reason?: string }> {
  const config = getJellyseerrConfig();
  if (!config) return { ok: false, reason: 'not configured' };
  try {
    await jellyseerrRequest(config, '/api/v1/auth/me');
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || e) };
  }
}

/**
 * Fetch every movie request from Jellyseerr that hasn't fully landed in the
 * library yet (status < 5/"available"), synthesized into Movie objects
 * (id `jellyseerr_<requestId>`, `comingSoon: true`, no localPath/rentable
 * copy) ready to flow into the New Releases wall pipeline alongside the
 * regular Jellyfin catalog.
 *
 * Never throws: if Jellyseerr isn't configured, is unreachable, or a
 * particular request's detail lookup fails, this logs a warning and
 * continues (or returns []) so the rest of the app is unaffected.
 */
export async function fetchComingSoonMovies(): Promise<Movie[]> {
  const config = getJellyseerrConfig();
  if (!config) return [];

  const movies: Movie[] = [];
  const PAGE_SIZE = 50;
  let skip = 0;
  let total = Infinity;

  try {
    while (skip < total) {
      const data = await jellyseerrRequest(config, `/api/v1/request?take=${PAGE_SIZE}&skip=${skip}&filter=all`);
      const items: any[] = Array.isArray(data?.results) ? data.results : [];
      if (typeof data?.pageInfo?.results === 'number') total = data.pageInfo.results;
      if (items.length === 0) break;

      // Fetch each request's movie details concurrently -- sequential N+1
      // lookups would otherwise make boot latency scale with the size of the
      // Jellyseerr request queue.
      const detailResults = await Promise.all(items.map(async (req): Promise<Movie | null> => {
        const media = req?.media;
        if (!media || media.mediaType !== 'movie') return null;

        const status = typeof media.status === 'number' ? media.status : 1;
        if (status >= MEDIA_STATUS_AVAILABLE) return null; // Jellyfin already has it

        const tmdbId = media.tmdbId;
        const requestId = req.id;
        if (!tmdbId || requestId === undefined || requestId === null) return null;

        try {
          const details = await jellyseerrRequest(config, `/api/v1/movie/${tmdbId}`);
          const title: string | undefined = details?.title;
          if (!title) return null;

          const releaseDate: string = details?.releaseDate || '';
          const year = releaseDate ? new Date(releaseDate).getFullYear() : new Date().getFullYear();
          const posterPath: string | undefined = details?.posterPath || undefined;
          const voteAverage = typeof details?.voteAverage === 'number' ? details.voteAverage : undefined;

          return {
            id: `jellyseerr_${requestId}`,
            title,
            year: Number.isFinite(year) ? year : new Date().getFullYear(),
            // Kept, not just year-reduced: a request whose film hasn't come
            // out yet is the one case where the model knows a real STREET
            // DATE, which is what the counter COMING SOON board sets its date
            // column from (coming-soon-feed.ts).
            premiereDate: releaseDate || undefined,
            duration: 'N/A',
            rating: 'NR',
            overview: details?.overview || 'Coming soon.',
            director: 'Unknown Director',
            actors: [],
            // The detail lookup already carries full genre objects; without
            // these the title buckets as GENERAL and never matches a genre
            // section (see storeCategory).
            genres: (details?.genres || []).map((g: any) => g?.name).filter(Boolean),
            localPath: '',
            posterUrl: posterPath ? `${TMDB_POSTER_BASE}${posterPath}` : undefined,
            communityRating: voteAverage,
            comingSoon: true,
            tmdbId,
          };
        } catch (detailErr) {
          console.warn(`[Jellyseerr] Failed to fetch movie details for tmdbId ${tmdbId}:`, detailErr);
          return null;
        }
      }));

      for (const m of detailResults) {
        if (m) movies.push(m);
      }

      skip += items.length;
    }
  } catch (e) {
    console.warn('[Jellyseerr] Failed to fetch coming-soon titles (server unreachable or misconfigured):', e);
    return movies; // whatever we gathered before the failure
  }

  console.log(`[Jellyseerr] Found ${movies.length} coming-soon title(s).`);
  return movies;
}

// ─── Discovery suggestions (trending/popular titles NOT in the library) ────

// Cap how many discovery titles get shelved so poster loads through the
// shared posterQueue never starve the library's own shelves.
const DISCOVERY_CAP = 36;

/**
 * Fetch Jellyseerr's trending + popular movie suggestions and synthesize them
 * into Movie objects (id `discover_<tmdbId>`, `discovery: true`, no
 * localPath/rentable copy). They shelve inline with the regular stock wearing
 * the REQUEST corner sticker (see StoreScene's merge). Titles Jellyseerr
 * already knows about (`mediaInfo` present -- already in Jellyfin or already
 * requested) are filtered out so the shelves never duplicate the library.
 *
 * Never throws: if Jellyseerr isn't configured or is unreachable this logs a
 * warning and resolves to [] (or whatever was gathered before a failure), so
 * no suggestion cases build -- the rest of the app is unaffected.
 */
export async function fetchDiscoverMovies(): Promise<Movie[]> {
  const config = getJellyseerrConfig();
  if (!config) return [];

  const seenTmdbIds = new Set<number>();
  const movies: Movie[] = [];
  const dismissed = getDismissedTitleIds();
  // Release window (#42): the permanent suggestion bounds with the rolling
  // Media Release Date pin folded into the ceiling (tighter wins). Applied
  // client-side on every ingested item — the server-side params below are an
  // efficiency, not the gate, and /discover/trending takes no date params.
  const win = activeSuggestionWindow();

  const ingest = (items: any[]) => {
    for (const item of items) {
      if (movies.length >= DISCOVERY_CAP) return;
      if (!item) continue;
      if (item.mediaType && item.mediaType !== 'movie') continue; // trending mixes in TV
      const tmdbId: number | undefined = item.id;
      if (typeof tmdbId !== 'number' || seenTmdbIds.has(tmdbId)) continue;
      if (dismissed.has(tmdbId)) continue; // "not interested" — never resurface
      // Jellyseerr attaches `mediaInfo` once it knows the title exists in (or
      // has been requested into) the library -- never duplicate those here.
      if (item.mediaInfo) continue;
      if (!titleInWindow({ premiereDate: item.releaseDate || undefined }, win)) continue;
      const title: string | undefined = item.title || item.name;
      if (!title) continue;

      seenTmdbIds.add(tmdbId);
      const releaseDate: string = item.releaseDate || '';
      const year = releaseDate ? new Date(releaseDate).getFullYear() : new Date().getFullYear();
      movies.push({
        id: `discover_${tmdbId}`,
        title,
        year: Number.isFinite(year) ? year : new Date().getFullYear(),
        // Trending lists carry not-yet-released films; keeping the full date
        // (not just the year) is what lets the COMING SOON board date them.
        premiereDate: releaseDate || undefined,
        duration: 'N/A',
        rating: 'NR',
        overview: item.overview || 'No synopsis available yet.',
        director: 'Unknown Director',
        actors: [],
        // /discover returns bare genre ids; a discovery title with no genres
        // buckets as GENERAL, which matches no signboard section, so the
        // clerk's clasp suggestions filter it straight back out.
        genres: genreNames(item.genreIds),
        localPath: '',
        posterUrl: item.posterPath ? `${TMDB_POSTER_BASE}${item.posterPath}` : undefined,
        communityRating: typeof item.voteAverage === 'number' ? item.voteAverage : undefined,
        tmdbId,
        discovery: true,
      });
    }
  };

  try {
    // /discover/movies forwards TMDB's primary-release-date bounds, so ask the
    // server to pre-trim its page — otherwise a tight window could see a whole
    // page of out-of-window titles and shelve nothing despite eligible films
    // one page deeper. Trending has no such params; ingest() gates it.
    const lte = windowLteParam(win);
    const gte = windowGteParam(win);
    const datedMovies = '/api/v1/discover/movies?page=1'
      + (gte ? `&primaryReleaseDateGte=${gte}` : '')
      + (lte ? `&primaryReleaseDateLte=${lte}` : '');
    const [trending, popular] = await Promise.all([
      jellyseerrRequest(config, '/api/v1/discover/trending?page=1').catch((e) => {
        console.warn('[Jellyseerr] Trending discovery fetch failed:', e);
        return null;
      }),
      jellyseerrRequest(config, datedMovies).catch((e) => {
        console.warn('[Jellyseerr] Popular discovery fetch failed:', e);
        return null;
      }),
    ]);
    if (Array.isArray(trending?.results)) ingest(trending.results);
    if (Array.isArray(popular?.results)) ingest(popular.results);
  } catch (e) {
    console.warn('[Jellyseerr] Failed to load discovery titles (server unreachable or misconfigured):', e);
    return movies;
  }

  console.log(`[Jellyseerr] Found ${movies.length} discovery title(s) not yet in the library.`);
  return movies;
}

// ─── Collection gaps (entries of a partly-owned collection) ────────────────

// Every missing entry of every partly-owned collection gets a case — no
// per-collection or global cap. There used to be both (6 per collection, 40
// total), and the total cap in particular made real gaps silently absent:
// whichever collections happened to resolve first ate the whole budget and
// the rest showed nothing. A bigger store is preferred over a lying one. The
// pressure valve is the persisted "not interested" list (markTitleDismissed):
// a dismissed title never synthesizes again.
// Jellyseerr proxies TMDB behind its own rate limiter, so fan out in modest
// batches instead of firing one request per collection at once.
const GAP_FETCH_CONCURRENCY = 8;

/** One partly-owned collection to look up the full member list for. */
/**
 * Recover a TMDB collection id for collections whose BoxSet doesn't carry one.
 *
 * Only collections Jellyfin scraped from TMDB get a TmdbCollection provider
 * id; ones assembled by hand in the Jellyfin UI never do, and for a lot of
 * libraries that's ALL of them (108 BoxSets, zero ids, in the case that
 * prompted this). Depending on that id alone meant those users could never see
 * a missing-entry case however complete the rest of the integration was.
 *
 * A movie you own knows its own TMDB id, and TMDB knows which collection that
 * movie belongs to — so ask about one member and read the collection off the
 * answer. That works regardless of how the BoxSet was built.
 *
 * One request per collection, batched; failures are skipped rather than
 * retried (a member Jellyseerr can't resolve just means no gaps for that set).
 */
export async function resolveCollectionTmdbIds(
  candidates: { collectionName: string; memberTmdbId: number }[]
): Promise<Map<string, number>> {
  const resolved = new Map<string, number>();
  const config = getJellyseerrConfig();
  if (!config || candidates.length === 0) return resolved;

  const CONCURRENCY = 8;
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    await Promise.all(
      candidates.slice(i, i + CONCURRENCY).map(async ({ collectionName, memberTmdbId }) => {
        try {
          const d = await jellyseerrRequest(config, `/api/v1/movie/${memberTmdbId}`);
          const id = d?.collection?.id;
          if (typeof id === 'number' && id > 0) resolved.set(collectionName, id);
        } catch {
          // Jellyseerr 500s on titles TMDB can't serve; that collection simply
          // shows no gaps, exactly as an unscraped one did before.
        }
      })
    );
  }
  console.log(
    `[Jellyseerr] Recovered ${resolved.size} TMDB collection id(s) from ${candidates.length} ` +
    'collection(s) whose BoxSet carried none.'
  );
  return resolved;
}

export interface CollectionGapTarget {
  /** Jellyfin BoxSet name — the synthesized gaps file under this. */
  collectionName: string;
  /** TMDB *collection* id, from the BoxSet's ProviderIds. */
  tmdbCollectionId: number;
  /** Library the owned members live in, so gaps land on the same shelves. */
  libraryName?: string;
  /**
   * Genres of the owned members. Gaps inherit them so that store-layout's
   * majority-category vote (which decides the whole collection's wall section)
   * comes out the same with the gaps present as without — a gap must never
   * relocate a saga.
   */
  genres?: string[];
}

/**
 * For each partly-owned collection, ask Jellyseerr (really TMDB) for the full
 * member list and synthesize a Movie for every entry NOT in the library —
 * `collectionGap: true`, id `gap_<tmdbId>`, no localPath. These file into
 * their correct chronological shelf position alongside the owned members
 * (premiereDate drives the tiebreak in shelfTitleCompare) and carry a corner
 * sticker instead of backstock copies.
 *
 * Entries Jellyfin already has (`mediaInfo` at status "available") are
 * skipped, so this never duplicates a title that's really on the shelf.
 * Entries merely REQUESTED (mediaInfo short of available) stay as gaps but
 * carry `discoveryRequested: true`, so the case keeps its shelf spot wearing
 * the gold COMING SOON label across reloads instead of vanishing.
 *
 * Never throws: unconfigured, unreachable, or a single collection failing all
 * resolve to fewer gaps, never a broken boot.
 */
export async function fetchCollectionGaps(targets: CollectionGapTarget[]): Promise<Movie[]> {
  const config = getJellyseerrConfig();
  if (!config || targets.length === 0) return [];

  const movies: Movie[] = [];
  const seenTmdbIds = new Set<number>();
  const dismissed = getDismissedTitleIds();
  // Release window (#42): a gap case is a suggestion ("order it?"), so the
  // suggestion bounds gate it — EXCEPT one the player already ordered, whose
  // case must keep standing (the rolling pin still absents post-cutoff ones
  // at the scene-build funnel regardless).
  const win = activeSuggestionWindow();
  let dismissedCount = 0;

  const fetchOne = async (target: CollectionGapTarget): Promise<void> => {
    let data: any;
    try {
      data = await jellyseerrRequest(config, `/api/v1/collection/${target.tmdbCollectionId}`);
    } catch (e) {
      console.warn(`[Jellyseerr] Collection lookup failed for "${target.collectionName}":`, e);
      return;
    }

    const parts: any[] = Array.isArray(data?.parts) ? data.parts : [];

    for (const part of parts) {
      if (!part) continue;
      // mediaInfo present => Jellyseerr already tracks it. Fully available
      // means Jellyfin has it on the shelf for real — not a gap. Anything
      // SHORT of available is a title someone already ordered: keep its case
      // standing in its chronological spot wearing the gold COMING SOON
      // restyle (discoveryRequested) rather than vanishing it — the player
      // put that order in at this very shelf, possibly yesterday.
      const infoStatus = typeof part.mediaInfo?.status === 'number' ? part.mediaInfo.status : null;
      if (infoStatus !== null && infoStatus >= MEDIA_STATUS_AVAILABLE) continue;
      const alreadyRequested = part.mediaInfo != null;
      const tmdbId: number | undefined = part.id;
      if (typeof tmdbId !== 'number' || seenTmdbIds.has(tmdbId)) continue;
      if (dismissed.has(tmdbId)) { dismissedCount++; continue; }
      const title: string | undefined = part.title || part.name;
      if (!title) continue;
      if (!alreadyRequested && !titleInWindow({ premiereDate: part.releaseDate || undefined }, win)) continue;

      seenTmdbIds.add(tmdbId);

      const releaseDate: string = part.releaseDate || '';
      const year = releaseDate ? new Date(releaseDate).getFullYear() : NaN;
      movies.push({
        id: `gap_${tmdbId}`,
        title,
        // A gap with no release date would sort unpredictably against its
        // siblings, so fall back to 0 — it files at the head of the
        // collection rather than at a random point inside it.
        year: Number.isFinite(year) ? year : 0,
        premiereDate: releaseDate || undefined,
        collectionName: target.collectionName,
        libraryName: target.libraryName,
        duration: 'N/A',
        rating: 'NR',
        overview: part.overview || 'Not in this store yet.',
        director: 'Unknown Director',
        actors: [],
        genres: target.genres ? [...target.genres] : [],
        localPath: '',
        posterUrl: part.posterPath ? `${TMDB_POSTER_BASE}${part.posterPath}` : undefined,
        communityRating: typeof part.voteAverage === 'number' ? part.voteAverage : undefined,
        tmdbId,
        collectionGap: true,
        ...(alreadyRequested ? { discoveryRequested: true } : {}),
      });
    }
  };

  try {
    for (let i = 0; i < targets.length; i += GAP_FETCH_CONCURRENCY) {
      await Promise.all(targets.slice(i, i + GAP_FETCH_CONCURRENCY).map(fetchOne));
    }
  } catch (e) {
    console.warn('[Jellyseerr] Collection-gap sync failed:', e);
    return movies;
  }

  console.log(
    `[Jellyseerr] Found ${movies.length} missing title(s) across ${targets.length} partly-owned collection(s).`
  );
  if (dismissedCount > 0) {
    console.log(`[Jellyseerr] ${dismissedCount} missing entr(ies) skipped — marked "not interested".`);
  }
  return movies;
}

// ─── Watch-history recommendation seeds (staff-picks engine) ──────────────

/**
 * One raw entry off TMDB's per-title recommendations list — deliberately
 * NOT a Movie: the staff-picks engine (staff-picks.ts) aggregates thousands
 * of these across every watched anchor before anything is worth the N+1
 * detail lookup, so seeds stay as cheap JSON-shaped facts.
 */
export interface RecommendationSeed {
  tmdbId: number;
  title: string;
  year: number;
  posterUrl?: string;
  overview?: string;
  communityRating?: number;
  genres: string[];
  premiereDate?: string;
  /** Jellyseerr knows this title (in the library, or already requested). */
  hasMediaInfo: boolean;
}

const seedCache = new Map<number, RecommendationSeed[]>();

/**
 * TMDB's "people who liked this also liked" list for one watched anchor, via
 * Jellyseerr. ONLY the /recommendations endpoint on purpose — that's the
 * behavioural people-also-liked signal the staff-picks aggregation is about;
 * /similar's content matching would dilute it. Never throws; unconfigured or
 * unreachable resolve to [].
 */
export async function fetchRecommendationSeeds(anchorTmdbId: number): Promise<RecommendationSeed[]> {
  const config = getJellyseerrConfig();
  if (!config) return [];
  // Release window (#42): staff-pick seeds obey the same suggestion bounds as
  // the discovery shelves. The cache keeps the RAW list and the filter runs on
  // the way out, so a pin set after the cache warmed still bites.
  const win = activeSuggestionWindow();
  const inWindow = (list: RecommendationSeed[]) => list.filter((s) => titleInWindow(s, win));
  const cached = seedCache.get(anchorTmdbId);
  if (cached) return inWindow(cached);
  const seeds: RecommendationSeed[] = [];
  try {
    const res = await jellyseerrRequest(config, `/api/v1/movie/${anchorTmdbId}/recommendations?page=1`);
    const list: any[] = Array.isArray(res?.results) ? res.results : [];
    const seen = new Set<number>();
    for (const item of list) {
      if (!item || typeof item.id !== 'number' || seen.has(item.id)) continue;
      if (!(item.title || item.name)) continue;
      seen.add(item.id);
      seeds.push({
        tmdbId: item.id,
        title: item.title || item.name,
        year: item.releaseDate ? new Date(item.releaseDate).getFullYear() || 0 : 0,
        posterUrl: item.posterPath ? `${TMDB_POSTER_BASE}${item.posterPath}` : undefined,
        overview: item.overview || undefined,
        communityRating: typeof item.voteAverage === 'number' ? item.voteAverage : undefined,
        genres: genreNames(item.genreIds),
        premiereDate: item.releaseDate || undefined,
        hasMediaInfo: !!item.mediaInfo,
      });
    }
  } catch (e) {
    console.warn(`[Jellyseerr] Recommendation seeds failed for tmdbId ${anchorTmdbId}:`, e);
    return [];
  }
  seedCache.set(anchorTmdbId, seeds);
  return inWindow(seeds);
}

export interface MovieDetailResult {
  detail: Partial<Movie>;
  /**
   * Jellyseerr's word on the title: 'available' means it's in the Jellyfin
   * library right now (either quality profile), 'pending' means tracked but
   * not yet available (someone ordered it), null means Jellyseerr doesn't
   * know it at all.
   */
  libraryStatus: 'available' | 'pending' | null;
}

/**
 * Cast/crew/genre detail for a title the staff-picks engine actually chose —
 * per-title cast/crew/genre enrichment as a reusable helper so
 * only the FINAL endcap picks pay the extra round-trip. Also surfaces the
 * response's mediaInfo as `libraryStatus`: the per-title lookup is the
 * authoritative "do we already have this" answer, keyed by the candidate's
 * own tmdb id — immune to the missing-provider-id and variant-title drift
 * that can defeat a client-side shelf join. Never throws.
 */
export async function fetchMovieDetailFields(tmdbId: number): Promise<MovieDetailResult | null> {
  const config = getJellyseerrConfig();
  if (!config) return null;
  try {
    const d = await jellyseerrRequest(config, `/api/v1/movie/${tmdbId}`);
    const crew: any[] = d?.credits?.crew || [];
    const cast: any[] = d?.credits?.cast || [];
    const out: Partial<Movie> = {};
    const director = crew.find((c) => c?.job === 'Director')?.name;
    if (director) out.director = director;
    const actors = cast.filter((c) => c?.name).slice(0, 5).map((c) => c.name);
    if (actors.length) out.actors = actors;
    const genres = (d?.genres || []).map((g: any) => g?.name).filter(Boolean);
    if (genres.length) out.genres = genres;
    const studios = (d?.productionCompanies || []).map((s: any) => s?.name).filter(Boolean);
    if (studios.length) out.studios = studios;
    if (d?.collection?.name) out.collectionName = d.collection.name;
    if (d?.releaseDate) out.premiereDate = d.releaseDate;
    if (typeof d?.runtime === 'number' && d.runtime > 0) out.duration = `${d.runtime}m`;
    // Owning either quality profile counts as owning the film.
    const status = Math.max(
      typeof d?.mediaInfo?.status === 'number' ? d.mediaInfo.status : 0,
      typeof d?.mediaInfo?.status4k === 'number' ? d.mediaInfo.status4k : 0
    );
    const libraryStatus = status >= MEDIA_STATUS_AVAILABLE ? 'available' : status > 0 ? 'pending' : null;
    return { detail: out, libraryStatus };
  } catch {
    return null;
  }
}

// ─── "the order book moved" notification ───────────────────────────────────
// Ordering a title, or crossing one off, is the only runtime event that
// changes what this app considers coming soon. Fixtures that display that
// answer (the counter letterboard) subscribe here instead of polling their
// data every frame — the store idles for days, so a re-letter must cost
// nothing at all until the data really moves. Listeners are long-lived
// singletons by construction (one per fixture kind, swapped on scene rebuild),
// so the set never grows.
const requestChangeListeners = new Set<() => void>();

export function onJellyseerrRequestChange(cb: () => void): () => void {
  requestChangeListeners.add(cb);
  return () => { requestChangeListeners.delete(cb); };
}

function notifyRequestChange(): void {
  for (const cb of requestChangeListeners) {
    try { cb(); } catch (e) { console.warn('[Jellyseerr] request-change listener threw:', e); }
  }
}

const REQUESTED_IDS_KEY = 'jellyseerr_requested_ids';

// Persisted (localStorage) set of tmdbIds this app instance has requested
// through the discovery rack, so a case's "REQUESTED" restyle survives reload
// even before Jellyseerr's own request list would reflect it back to us.
export function getRequestedDiscoveryIds(): Set<number> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(REQUESTED_IDS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x: unknown) => typeof x === 'number') : []);
  } catch {
    return new Set();
  }
}

export function isDiscoveryRequested(tmdbId: number | undefined): boolean {
  if (typeof tmdbId !== 'number') return false;
  return getRequestedDiscoveryIds().has(tmdbId);
}

function markDiscoveryRequested(tmdbId: number) {
  if (typeof localStorage === 'undefined') return;
  const ids = getRequestedDiscoveryIds();
  ids.add(tmdbId);
  localStorage.setItem(REQUESTED_IDS_KEY, JSON.stringify(Array.from(ids)));
  notifyRequestChange();
}

const DISMISSED_IDS_KEY = 'jellyseerr_dismissed_ids';

// Persisted (localStorage) set of tmdbIds the user marked "not interested" on
// a missing-entry case (X in the inspect view). Every synth path — collection
// gaps and the discovery rack — filters against it, so a dismissed title is
// gone for good, not just for this session.
export function getDismissedTitleIds(): Set<number> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(DISMISSED_IDS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x: unknown) => typeof x === 'number') : []);
  } catch {
    return new Set();
  }
}

export function markTitleDismissed(tmdbId: number) {
  if (typeof localStorage === 'undefined') return;
  const ids = getDismissedTitleIds();
  ids.add(tmdbId);
  localStorage.setItem(DISMISSED_IDS_KEY, JSON.stringify(Array.from(ids)));
  notifyRequestChange();
}

/**
 * Request a discovery title through Jellyseerr (POST /api/v1/request). Marks
 * the tmdbId as requested (see isDiscoveryRequested) on success so the
 * discovery rack case restyles immediately and stays restyled across reload.
 * Never throws -- returns false on any failure (unconfigured, unreachable,
 * server-side rejection) so callers can show a simple retry hint.
 */
export async function requestMovie(tmdbId: number): Promise<boolean> {
  const config = getJellyseerrConfig();
  if (!config) {
    // Demo/harness builds run a SYNTHETIC Jellyseerr (markSyntheticJellyseerr)
    // with no server to POST to. Succeed locally so the whole order flow --
    // clerk line, chime, gold restyle, persisted requested-id -- is the same
    // one a real store shows; there's nothing real to order from anyway.
    if (syntheticJellyseerr) {
      markDiscoveryRequested(tmdbId);
      return true;
    }
    return false;
  }
  try {
    await jellyseerrRequest(config, '/api/v1/request', 'POST', { mediaType: 'movie', mediaId: tmdbId });
    markDiscoveryRequested(tmdbId);
    return true;
  } catch (e) {
    console.warn(`[Jellyseerr] Failed to request tmdbId ${tmdbId}:`, e);
    return false;
  }
}

// ─── Streaming-service sections (GH #86) ───────────────────────────────────
// Movies on the owner's streaming subscriptions, sourced from TMDB
// watch-provider data (Jellyseerr proxies both endpoints -- see
// streaming-catalog.ts's header comment for the verified shapes). The
// selection/synthesis logic lives in streaming-catalog.ts, kept import-free
// of this module's Tauri/DOM transport so it stays node-test-safe; this
// function is just the network round trip.
//
// Owner correction 2026-08-21: this is now the FALLBACK source. A direct
// tmdb_apikey (src/tmdb.ts) wins when configured, because only the direct
// TMDB call can filter to subscription-only titles
// (with_watch_monetization_types=flatrate) -- this proxy has no equivalent
// param. See streaming-catalog.ts's resolveStreamingSource for the ladder.

// TMDB's watch-provider data is region-keyed; a hardcoded US default until a
// settings UI exists to pick one (GH #86 follow-up).
const STREAMING_WATCH_REGION = 'US';
// Round-trip fan-out for the per-service discover calls, matching the
// collection-gap loader's GAP_FETCH_CONCURRENCY -- Jellyseerr proxies TMDB
// behind its own rate limiter.
const STREAMING_FETCH_CONCURRENCY = 8;

/**
 * Fetch every enabled streaming service's watch-provider stock: resolve the
 * region's provider list, match the enabled service defs against it by name,
 * then fetch one page of /discover/movies per matched service concurrently.
 *
 * Never throws: unconfigured, unreachable, a rejected watch-provider list, or
 * a single service's discover call failing all resolve to fewer (or zero)
 * streaming titles, never a broken boot. A service whose name doesn't match
 * anything in the region's provider list is logged once (not per-title) so a
 * TMDB rename shows up on the boot console instead of a silently empty aisle.
 */
export async function fetchStreamingMovies(servicesOverrideCsv?: string | null): Promise<Movie[]> {
  const config = getJellyseerrConfig();
  if (!config) return [];

  const wanted = resolveEnabledServices(servicesOverrideCsv);
  let providers: { id: number; name: string }[] = [];
  try {
    const list = await jellyseerrRequest(
      config, `/api/v1/watchproviders/movies?watchRegion=${STREAMING_WATCH_REGION}`
    );
    providers = Array.isArray(list) ? list : [];
  } catch (e) {
    console.warn('[Jellyseerr] Streaming: failed to load the watch-provider list -- no streaming sections built:', e);
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
      `[Jellyseerr] Streaming: no provider match in region ${STREAMING_WATCH_REGION} for: ${unmatched.join(', ')}` +
      ' -- check the name against Jellyseerr\'s own watch-provider list (a rename on TMDB\'s side, most likely).'
    );
  }
  if (matched.length === 0) return [];

  const dismissed = getDismissedTitleIds();
  const movies: Movie[] = [];
  for (let i = 0; i < matched.length; i += STREAMING_FETCH_CONCURRENCY) {
    const batch = matched.slice(i, i + STREAMING_FETCH_CONCURRENCY);
    const results = await Promise.all(batch.map(async ({ def, providerId }): Promise<Movie[]> => {
      try {
        const data = await jellyseerrRequest(
          config,
          `/api/v1/discover/movies?watchProviders=${providerId}&watchRegion=${STREAMING_WATCH_REGION}&page=1`
        );
        const items: RawDiscoverItem[] = Array.isArray(data?.results) ? data.results : [];
        return ingestStreamingResults(items, def, { dismissed, cap: STREAMING_CAP_PER_SERVICE });
      } catch (e) {
        console.warn(`[Jellyseerr] Streaming: discover fetch failed for ${def.name}:`, e);
        return [];
      }
    }));
    for (const r of results) movies.push(...r);
  }

  console.log(`[Jellyseerr] Streaming: ${movies.length} title(s) across ${matched.length} service(s).`);
  return movies;
}
