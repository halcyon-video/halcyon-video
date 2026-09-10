// Streaming-service sections (GH #86): movies that live on the owner's
// streaming subscriptions get shelved and organized like any other stock, but
// picking one hands off to the service's page for it instead of playing --
// the store never pretends it can play them.
//
// This module is the SAME shape as jellyseerr.ts's discovery/collection-gap
// pattern (synthetic Movie objects, no rental copy), scoped to TMDB
// watch-provider data. It is pure data/selection logic on purpose -- no Tauri,
// no settings.ts, no jellyseerr.ts import -- so it keeps running under bare
// `node --test` with type stripping (tests/streaming-catalog.test.ts), the
// same reason promo-campaigns.ts and staff-picks.ts stay import-light. The
// network round trip (jellyseerr.ts's private request transport, which does
// carry Tauri/DOM imports) lives in jellyseerr.ts's fetchStreamingMovies,
// which imports the helpers below rather than the other way around.
import type { Movie, JellyfinLibrary } from './jellyfin';

/** One default streaming service: how to find it in Jellyseerr's watch-provider
 *  list, and how to link a title on it. */
export interface StreamingServiceDef {
  /** Stable slug -- library id (`streaming:<id>`), movie id prefix, and the
   *  `bb_streaming_services` override value. */
  id: string;
  /** Shelf/section display name, already upper-case (shelving.ts prints a
   *  library's `name` as-is -- see GAME_PLATFORMS in demo-library.ts for the
   *  same convention). Also the "WATCH ON <name>" corner-label text. */
  name: string;
  /** Exact-match candidates (case-insensitive) against the `name` field
   *  Jellyseerr's GET /api/v1/watchproviders/movies returns. More than one
   *  covers a rename TMDB has made (Max was HBO Max) without guessing. */
  aliases: string[];
  /** Title-search URL for one title on this service. Omitted = every title on
   *  this service falls back to the TMDB watch-page link (buildStreamingUrl). */
  urlTemplate?: (title: string, tmdbId: number) => string;
}

function searchTemplate(base: string, param: string): (title: string) => string {
  return (title: string) => `${base}?${param}=${encodeURIComponent(title)}`;
}

/**
 * The eight majors named in the owner's 2026-08-20 directive. Verified against
 * the Jellyseerr/Overseerr source (server/routes/index.ts's /watchproviders/
 * movies handler, server/models/common.ts's mapWatchProviderDetails) that the
 * provider list is a plain array of {id, name, logoPath, displayPriority} --
 * `aliases` below match against that `name` field.
 *
 * `urlTemplate` is set only where the search-URL shape is well-established
 * (Netflix/Hulu/Disney+'s plain "/search?q=" pattern) -- confidence on the
 * other five's exact query param name is LOW (no live instance to verify
 * against in this environment, and at least one of them has changed brand
 * name/URL scheme more than once), so they deliberately fall back to the
 * TMDB watch page rather than ship a guessed link. Flagged as a follow-up.
 */
export const DEFAULT_STREAMING_SERVICES: StreamingServiceDef[] = [
  {
    id: 'netflix', name: 'NETFLIX', aliases: ['Netflix'],
    urlTemplate: searchTemplate('https://www.netflix.com/search', 'q'),
  },
  {
    id: 'prime', name: 'AMAZON PRIME VIDEO',
    aliases: ['Amazon Prime Video', 'Prime Video'],
  },
  {
    id: 'disney', name: 'DISNEY+', aliases: ['Disney Plus', 'Disney+'],
    urlTemplate: searchTemplate('https://www.disneyplus.com/search', 'q'),
  },
  {
    id: 'hulu', name: 'HULU', aliases: ['Hulu'],
    urlTemplate: searchTemplate('https://www.hulu.com/search', 'q'),
  },
  {
    id: 'max', name: 'MAX', aliases: ['Max', 'HBO Max'],
  },
  // Verified live against Jellyseerr/TMDB 2026-08-21 (GH #86 bundled-snapshot
  // follow-up): both of these renamed since the aliases above were first
  // written, which is exactly why they were silently missing from the
  // snapshot -- matchProviderId is an EXACT match, so a stale alias just
  // finds nothing rather than erroring. Apple TV's subscription tier is now
  // plain "Apple TV" (id 350 in the US region list) -- the transactional
  // rent/buy store picked up the "Store" suffix instead ("Apple TV Store",
  // id 2), so adding the bare name back is safe: it can no longer collide
  // with the transactional one the way it could under the old naming.
  // Paramount+ no longer has a plain "Paramount Plus" entry at all -- TMDB
  // splits it into ad-tier SKUs; both are listed so either resolves.
  {
    id: 'appletv', name: 'APPLE TV+', aliases: ['Apple TV Plus', 'Apple TV+', 'Apple TV'],
  },
  {
    id: 'paramount', name: 'PARAMOUNT+',
    aliases: ['Paramount Plus', 'Paramount+', 'Paramount Plus Premium', 'Paramount Plus Essential'],
  },
  {
    id: 'peacock', name: 'PEACOCK',
    aliases: ['Peacock', 'Peacock Premium', 'Peacock Premium Plus'],
  },
];

/** `id`/name -> lower-case slug, for a custom `bb_streaming_services` entry
 *  outside the default eight (no aliases table, no URL template -- every title
 *  falls back to the TMDB watch page, same as an unmatched default service). */
function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'service';
}

/**
 * The CHOSEN service set to build sections for -- exactly the services named
 * in `overrideCsv` (bb_streaming_services), matched against the defaults by
 * id or alias first and synthesized as a custom (template-less) def
 * otherwise. Blank/undefined/whitespace-only means NONE chosen (owner ruling
 * 2026-08-21: a fresh local install boots with no streaming aisles at all --
 * the opening-day setup terminal is where a normie picks which services they
 * actually have). The hosted demo build supplies ALL_DEFAULT_STREAMING_SERVICES_CSV
 * below as its OWN setting default (see settings.ts) rather than leaning on
 * this function ever treating blank as "everything".
 */
export function resolveEnabledServices(overrideCsv: string | undefined | null): StreamingServiceDef[] {
  const names = (overrideCsv ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (names.length === 0) return [];
  const seen = new Set<string>();
  const out: StreamingServiceDef[] = [];
  for (const name of names) {
    const lower = name.toLowerCase();
    const known = DEFAULT_STREAMING_SERVICES.find((d) =>
      d.id === lower || d.aliases.some((a) => a.toLowerCase() === lower));
    const def = known ?? { id: slugify(name), name: name.toUpperCase(), aliases: [name] };
    if (!seen.has(def.id)) {
      seen.add(def.id);
      out.push(def);
    }
  }
  return out;
}

/** CSV of every default service's id, in order -- a concrete, non-blank
 *  spelling of "all eight chosen" for the demo build's bb_streaming_services
 *  default (settings.ts), now that a blank CSV means "none" instead. */
export const ALL_DEFAULT_STREAMING_SERVICES_CSV = DEFAULT_STREAMING_SERVICES.map((d) => d.id).join(',');

/**
 * Which network source stocks the streaming sections (owner correction
 * 2026-08-21, GH #86 follow-up): a direct TMDB key is no longer optional
 * icing on top of Jellyseerr -- it is a full replacement source, so the
 * feature works with NEITHER Jellyseerr NOR a request server installed.
 * TMDB wins when both are configured, because only the direct
 * `/discover/movie` call can filter to subscription (flatrate) titles via
 * `with_watch_monetization_types` -- Jellyseerr's proxied discover endpoint
 * has no equivalent param, so its results mix in rent/buy titles the owner
 * doesn't actually subscribe to. Neither configured falls back to the
 * bundled snapshot (src/streaming-snapshot.ts, GH #86 zero-setup follow-up,
 * owner ruling 2026-08-21) -- the floor of the ladder, so a CHOSEN service
 * always stocks even with nothing configured at all.
 */
export type StreamingSource = 'tmdb' | 'jellyseerr' | 'snapshot';

export function resolveStreamingSource(hasTmdbKey: boolean, hasJellyseerr: boolean): StreamingSource {
  if (hasTmdbKey) return 'tmdb';
  if (hasJellyseerr) return 'jellyseerr';
  return 'snapshot';
}

/**
 * Recovery behavior when a network streaming provider fails or returns zero titles
 * (issue #292 / zero-setup normie path): falls back to the bundled snapshot rather
 * than leaving the chosen streaming aisles completely empty.
 */
export async function fallbackToSnapshotOnFailure(
  primaryMovies: Movie[],
  source: StreamingSource,
  fallbackFn: () => Promise<Movie[]>
): Promise<Movie[]> {
  if (primaryMovies.length > 0 || source === 'snapshot') {
    return primaryMovies;
  }
  return fallbackFn();
}

/** Match a service def against Jellyseerr's watch-provider list by exact
 *  (case-insensitive) name. `null` when none of its aliases appear -- logged
 *  once by the caller so a naming drift shows up on the boot console instead
 *  of a silently absent aisle. */
export function matchProviderId(
  def: StreamingServiceDef,
  providers: { id: number; name: string }[],
): number | null {
  const aliasesLower = def.aliases.map((a) => a.toLowerCase());
  const hit = providers.find((p) => p && typeof p.name === 'string' && aliasesLower.includes(p.name.toLowerCase()));
  return hit ? hit.id : null;
}

/** Every title falls back here when its service has no `urlTemplate` --
 *  TMDB's own "where to watch" page, which is guaranteed to resolve and lists
 *  every service (including ones this store never sectioned). */
export function tmdbWatchFallbackUrl(tmdbId: number): string {
  return `https://www.themoviedb.org/movie/${tmdbId}/watch`;
}

export function buildStreamingUrl(def: StreamingServiceDef, title: string, tmdbId: number): string {
  return def.urlTemplate ? def.urlTemplate(title, tmdbId) : tmdbWatchFallbackUrl(tmdbId);
}

// TMDB's movie genre list, id -> name -- a deliberate duplicate of the same
// static table in jellyseerr.ts (see that file's comment): resolving genre
// names host-side would cost a detail request per title, and keeping this
// module import-free of jellyseerr.ts is what keeps it node-test-safe (that
// file carries the Tauri/DOM imports the network round trip needs).
const TMDB_MOVIE_GENRES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance',
  878: 'Science Fiction', 10770: 'TV Movie', 53: 'Thriller', 10752: 'War',
  37: 'Western',
};

function genreNames(genreIds: unknown): string[] {
  if (!Array.isArray(genreIds)) return [];
  return genreIds
    .map((id) => (typeof id === 'number' ? TMDB_MOVIE_GENRES[id] : undefined))
    .filter((n): n is string => !!n);
}

const TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/w342';
const TMDB_BACKDROP_BASE = 'https://image.tmdb.org/t/p/w780';

export const DEFAULT_STREAMING_WATCH_REGION = 'US';

export function resolveStreamingWatchRegion(region?: string | null): string {
  return (region && region.trim().toUpperCase()) || DEFAULT_STREAMING_WATCH_REGION;
}

/** One raw entry off Jellyseerr's GET /api/v1/discover/movies `results`
 *  array -- same camelCased shape jellyseerr.ts's fetchDiscoverMovies already
 *  parses (verified against overseerr's mapMovieResult). */
export interface RawDiscoverItem {
  id?: number;
  title?: string;
  name?: string;
  releaseDate?: string;
  posterPath?: string;
  backdropPath?: string;
  overview?: string;
  duration?: string;
  rating?: string;
  director?: string;
  actors?: string[];
  genres?: string[];
  voteAverage?: number;
  genreIds?: number[];
  /** Present once Jellyseerr already tracks the title (owned or requested) --
   *  ingestStreamingResults skips these; there is nothing to send you offsite
   *  for if the store already has it or has it on order. */
  mediaInfo?: unknown;
}

/** One raw discover result -> a shelvable streaming Movie, or null for a
 *  malformed entry (no id/title). */
export function synthesizeStreamingMovie(item: RawDiscoverItem, def: StreamingServiceDef): Movie | null {
  const tmdbId = item.id;
  const title = item.title || item.name;
  if (typeof tmdbId !== 'number' || !title) return null;
  const releaseDate = item.releaseDate || '';
  const year = releaseDate ? new Date(releaseDate).getUTCFullYear() : new Date().getFullYear();
  const streamingUrl = buildStreamingUrl(def, title, tmdbId);
  return {
    id: `streaming_${def.id}_${tmdbId}`,
    title,
    year: Number.isFinite(year) ? year : new Date().getFullYear(),
    premiereDate: releaseDate || undefined,
    duration: item.duration || 'N/A',
    rating: item.rating || 'NR',
    overview: item.overview || 'No synopsis available yet.',
    director: item.director || 'Unknown Director',
    actors: Array.isArray(item.actors) ? item.actors : [],
    genres: Array.isArray(item.genres) && item.genres.length > 0 ? item.genres : genreNames(item.genreIds),
    localPath: '',
    posterUrl: item.posterPath ? `${TMDB_POSTER_BASE}${item.posterPath}` : undefined,
    backdropUrl: item.backdropPath ? `${TMDB_BACKDROP_BASE}${item.backdropPath}` : undefined,
    communityRating: typeof item.voteAverage === 'number' ? item.voteAverage : undefined,
    libraryName: 'Movies',
    tmdbId,
    streaming: true,
    streamingServiceId: def.id,
    streamingServiceName: def.name,
    streamingUrl,
    streamingServices: [{
      id: def.id,
      name: def.name,
      url: streamingUrl,
    }],
  };
}

/** Poster-budget cap per service (design brief: "~24") -- one TMDB discover
 *  page (20 results) comfortably fits under it, so a single-page fetch per
 *  service never needs a second round trip to reach it. */
export const STREAMING_CAP_PER_SERVICE = 24;

/**
 * Raw discover results for one service -> shelvable Movies: skips malformed
 * entries, anything Jellyseerr already tracks (mediaInfo present -- owned or
 * requested), anything "not interested"-dismissed (shared jellyseerr_dismissed_ids
 * pool, same as discovery/collection-gap titles), and duplicate tmdbIds, capped
 * at `cap`.
 */
export function ingestStreamingResults(
  items: RawDiscoverItem[],
  def: StreamingServiceDef,
  opts: { dismissed?: Set<number>; cap?: number } = {},
): Movie[] {
  const cap = opts.cap ?? STREAMING_CAP_PER_SERVICE;
  const dismissed = opts.dismissed ?? new Set<number>();
  const seen = new Set<number>();
  const out: Movie[] = [];
  for (const item of items) {
    if (out.length >= cap) break;
    if (!item || item.mediaInfo) continue;
    const tmdbId = item.id;
    if (typeof tmdbId !== 'number' || seen.has(tmdbId) || dismissed.has(tmdbId)) continue;
    const movie = synthesizeStreamingMovie(item, def);
    if (!movie) continue;
    seen.add(tmdbId);
    out.push(movie);
  }
  return out;
}

/**
 * Deduplicates streaming movies across services (GH #297):
 * Consolidates duplicate titles by tmdbId (or normalized title + year), merges
 * their streaming services into `streamingServices`, preserves enriched metadata,
 * ensures `libraryName` is unified ('Movies'), and orders `streamingServices`
 * according to the configured service order.
 */
export function deduplicateStreamingMovies(
  movies: Movie[],
  order?: StreamingServiceDef[],
): Movie[] {
  if (!movies || movies.length === 0) return [];
  const orderIdx = order ? new Map(order.map((d, i) => [d.id, i])) : null;
  const byKey = new Map<string, Movie>();

  for (const m of movies) {
    const key = (m.tmdbId && m.tmdbId > 0)
      ? `tmdb:${m.tmdbId}`
      : `title:${m.title.trim().toLowerCase()}:${m.year}`;

    const existing = byKey.get(key);
    if (!existing) {
      const services = m.streamingServices ? [...m.streamingServices] : [];
      if (services.length === 0 && m.streamingServiceId) {
        services.push({
          id: m.streamingServiceId,
          name: m.streamingServiceName || m.streamingServiceId.toUpperCase(),
          url: m.streamingUrl || (m.tmdbId ? tmdbWatchFallbackUrl(m.tmdbId) : ''),
        });
      }
      const cloned: Movie = {
        ...m,
        libraryName: 'Movies',
        streamingServices: services,
      };
      byKey.set(key, cloned);
    } else {
      const servicesToAdd = m.streamingServices && m.streamingServices.length > 0
        ? m.streamingServices
        : (m.streamingServiceId ? [{
            id: m.streamingServiceId,
            name: m.streamingServiceName || m.streamingServiceId.toUpperCase(),
            url: m.streamingUrl || (m.tmdbId ? tmdbWatchFallbackUrl(m.tmdbId) : ''),
          }] : []);

      for (const s of servicesToAdd) {
        if (!existing.streamingServices!.some((x) => x.id === s.id)) {
          existing.streamingServices!.push(s);
        }
      }

      if ((existing.duration === 'N/A' || !existing.duration) && m.duration && m.duration !== 'N/A') {
        existing.duration = m.duration;
      }
      if ((existing.rating === 'NR' || !existing.rating) && m.rating && m.rating !== 'NR') {
        existing.rating = m.rating;
      }
      if ((existing.director === 'Unknown Director' || !existing.director) && m.director && m.director !== 'Unknown Director') {
        existing.director = m.director;
      }
      if ((!existing.actors || existing.actors.length === 0) && m.actors && m.actors.length > 0) {
        existing.actors = [...m.actors];
      }
      if ((!existing.genres || existing.genres.length === 0) && m.genres && m.genres.length > 0) {
        existing.genres = [...m.genres];
      }
      if (!existing.backdropUrl && m.backdropUrl) {
        existing.backdropUrl = m.backdropUrl;
      }
      if ((!existing.overview || existing.overview === 'No synopsis available yet.') && m.overview && m.overview !== 'No synopsis available yet.') {
        existing.overview = m.overview;
      }
      if (existing.communityRating === undefined && m.communityRating !== undefined) {
        existing.communityRating = m.communityRating;
      }
    }
  }

  const result = [...byKey.values()];
  for (const movie of result) {
    if (orderIdx && movie.streamingServices && movie.streamingServices.length > 1) {
      movie.streamingServices.sort((a, b) => (orderIdx.get(a.id) ?? 999) - (orderIdx.get(b.id) ?? 999));
    }
    if (movie.streamingServices && movie.streamingServices.length > 0) {
      movie.streamingServiceId = movie.streamingServices[0].id;
      movie.streamingServiceName = movie.streamingServices[0].name;
      movie.streamingUrl = movie.streamingServices[0].url;
    }
  }

  return result;
}

/**
 * Builds the unified streaming library (GH #297):
 * Returns a single shared "Movies" library containing all deduplicated titles
 * across the enabled services, so provider identities are hidden while browsing
 * and aisles are unified rather than branded per provider.
 */
export function buildStreamingLibraries(
  movies: Movie[],
  order: StreamingServiceDef[],
): JellyfinLibrary[] {
  if (!movies || movies.length === 0) return [];
  const deduplicated = deduplicateStreamingMovies(movies, order);
  if (deduplicated.length === 0) return [];
  return [{
    id: 'streaming:movies',
    name: 'Movies',
    movies: deduplicated,
    genres: [],
    streaming: true,
  }];
}
