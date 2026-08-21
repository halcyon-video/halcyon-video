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
  return names.map((name): StreamingServiceDef => {
    const lower = name.toLowerCase();
    const known = DEFAULT_STREAMING_SERVICES.find((d) =>
      d.id === lower || d.aliases.some((a) => a.toLowerCase() === lower));
    return known ?? { id: slugify(name), name: name.toUpperCase(), aliases: [name] };
  });
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

/** One raw entry off Jellyseerr's GET /api/v1/discover/movies `results`
 *  array -- same camelCased shape jellyseerr.ts's fetchDiscoverMovies already
 *  parses (verified against overseerr's mapMovieResult). */
export interface RawDiscoverItem {
  id?: number;
  title?: string;
  name?: string;
  releaseDate?: string;
  posterPath?: string;
  overview?: string;
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
  const year = releaseDate ? new Date(releaseDate).getFullYear() : new Date().getFullYear();
  return {
    id: `streaming_${def.id}_${tmdbId}`,
    title,
    year: Number.isFinite(year) ? year : new Date().getFullYear(),
    premiereDate: releaseDate || undefined,
    duration: 'N/A',
    rating: 'NR',
    overview: item.overview || 'No synopsis available yet.',
    director: 'Unknown Director',
    actors: [],
    genres: genreNames(item.genreIds),
    localPath: '',
    posterUrl: item.posterPath ? `${TMDB_POSTER_BASE}${item.posterPath}` : undefined,
    communityRating: typeof item.voteAverage === 'number' ? item.voteAverage : undefined,
    libraryName: def.name,
    tmdbId,
    streaming: true,
    streamingServiceId: def.id,
    streamingServiceName: def.name,
    streamingUrl: buildStreamingUrl(def, title, tmdbId),
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
 * Group synthesized streaming movies into one synthetic Library per service
 * (mirrors games-only.ts's buildGameLibraries -- one un-sectioned aisle per
 * key, signed with the key's own name), ordered per `order` (the resolved
 * enabled-service list) so the shelves come out in a stable, configured
 * left-to-right order rather than whatever order titles happened to resolve
 * in. A service with no surviving stock builds no library at all -- an empty
 * aisle would be a lie, same as every other synthetic source in this app.
 */
export function buildStreamingLibraries(
  movies: Movie[],
  order: StreamingServiceDef[],
): JellyfinLibrary[] {
  const byService = new Map<string, Movie[]>();
  for (const m of movies) {
    if (!m.streamingServiceId) continue;
    let list = byService.get(m.streamingServiceId);
    if (!list) byService.set(m.streamingServiceId, (list = []));
    list.push(m);
  }
  const orderIdx = new Map(order.map((d, i) => [d.id, i]));
  return [...byService.entries()]
    .sort((a, b) => (orderIdx.get(a[0]) ?? Infinity) - (orderIdx.get(b[0]) ?? Infinity))
    .map(([serviceId, serviceMovies]) => ({
      id: `streaming:${serviceId}`,
      name: serviceMovies[0].streamingServiceName || serviceId.toUpperCase(),
      movies: serviceMovies,
      genres: [],
      streaming: true,
    }));
}
