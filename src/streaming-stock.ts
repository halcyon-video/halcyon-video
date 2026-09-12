// THE STREAMING-SERVICE STOCK (GH #86), and the bookkeeping that keeps it
// honest across a rebuild.
//
// Extracted from main.ts, which owns the boot sequence and not the catalog:
// the fetched list, the source ladder that fills it, and the record of what it
// was fetched FOR belong together, and main.ts was over its line budget with
// them inside it. Module state on purpose -- one store, one stock list --
// reached through the accessors below rather than an exported `let`.
import { fetchStreamingMovies, getJellyseerrConfig } from './jellyseerr';
import type { Movie } from './providers/media-source-provider';
import {
  fallbackToSnapshotOnFailure,
  resolveEnabledServices,
  resolveStreamingSource,
  deduplicateStreamingMovies,
  resolveStreamingWatchRegion,
  type StreamingSource,
} from './streaming-catalog';
import { fetchStreamingMoviesFromSnapshot } from './streaming-snapshot';
import { getSetting } from './settings';
import { fetchStreamingMoviesFromTmdb, getTmdbConfig } from './tmdb';

// Streaming-service titles from TMDB watch-provider data, straight from TMDB
// (tmdb.ts), via Jellyseerr, or from the bundled snapshot (see the ladder in
// loadStreamingMovies). Stays [] when nothing is chosen or the master switch
// is off, same never-block-boot treatment as the Jellyseerr lists in main.ts.
let streamingMovies: Movie[] = [];

// WHAT THAT STOCK WAS FETCHED FOR. The chosen services are picked in two
// places long after boot -- the manager terminal (#96) and the settings
// drawer -- and both answer with a scene rebuild, not a reload. A rebuild
// re-derives the aisles from the list above, so without this key it re-derives
// them from whatever boot happened to fetch: on a local install that booted
// with nothing chosen, that is an empty list, and picking four apps at the
// counter puts four EMPTY aisles in the store. Compared by
// streamingStockIsStale() to decide whether the stock must be re-fetched.
// The sentinels can't collide with a real CSV, which is why they aren't ''.
const NEVER_LOADED = '\0never-loaded';
const SWITCHED_OFF = '\0off';
let streamingStockKey: string = NEVER_LOADED;

let streamingLoadedAt = 0;
let streamingLoadedSource: StreamingSource | null = null;
let streamingLoadedRegion = 'US';

/** `true` unless the owner switched streaming sections off (default ON). */
export function streamingEnabled(): boolean {
  return getSetting<boolean>('bb_streaming_enabled') !== false;
}

/** The chosen-services CSV and region, or a sentinel while the master switch is off. */
function streamingChoiceKey(): string {
  if (!streamingEnabled()) return SWITCHED_OFF;
  const services = getSetting<string>('bb_streaming_services') || '';
  const region = resolveStreamingWatchRegion(getSetting<string>('bb_watch_region'));
  return `${services}|${region}`;
}

/** The loaded stock, for whoever is building the aisles. */
export function getStreamingMovies(): Movie[] {
  return streamingMovies;
}

/** Has the choice or region moved since the stock was fetched? A rebuild asks this. */
export function streamingStockIsStale(): boolean {
  return streamingChoiceKey() !== streamingStockKey;
}

/** Metadata regarding currently loaded streaming stock provenance and freshness. */
export function getStreamingStockInfo(): {
  loadedAt: number;
  source: StreamingSource | null;
  region: string;
  titleCount: number;
  isStale: boolean;
} {
  return {
    loadedAt: streamingLoadedAt,
    source: streamingLoadedSource,
    region: streamingLoadedRegion,
    titleCount: streamingMovies.length,
    isStale: streamingStockIsStale(),
  };
}

/**
 * Fetch the CHOSEN streaming services' watch-provider stock, same
 * never-block-boot treatment as the other Jellyseerr loaders. A no-op — []
 * without a single request — while the master switch is off, or while
 * nothing is chosen (bb_streaming_services blank -- a fresh local install's
 * default, owner ruling 2026-08-21), so neither costs anything extra.
 *
 * Source ladder: a direct TMDB key (tmdb_apikey) is a full replacement
 * source, not icing on Jellyseerr — it wins when both are configured (see
 * streaming-catalog.ts's resolveStreamingSource for why), Jellyseerr is the
 * fallback, and neither configured falls back to the bundled snapshot
 * (streaming-snapshot.ts) — the floor of the ladder, so a chosen service
 * ALWAYS stocks, including the hosted demo and a bare local install with
 * nothing set up at all.
 */
export async function loadStreamingMovies(): Promise<void> {
  streamingStockKey = streamingChoiceKey();
  if (!streamingEnabled()) {
    streamingMovies = [];
    streamingLoadedAt = Date.now();
    streamingLoadedSource = null;
    return;
  }
  const servicesOverride = getSetting<string>('bb_streaming_services');
  const enabledDefs = resolveEnabledServices(servicesOverride);
  if (enabledDefs.length === 0) {
    streamingMovies = []; // nothing chosen -- no network round trip needed
    streamingLoadedAt = Date.now();
    streamingLoadedSource = null;
    return;
  }
  const region = resolveStreamingWatchRegion(getSetting<string>('bb_watch_region'));
  streamingLoadedRegion = region;
  const TIMEOUT_MS = 15_000;
  const timeoutPromise = new Promise<Movie[]>((resolve) => setTimeout(() => resolve([]), TIMEOUT_MS));
  const source = resolveStreamingSource(!!getTmdbConfig(), !!getJellyseerrConfig());
  const fetchPromise = source === 'tmdb' ? fetchStreamingMoviesFromTmdb(servicesOverride, region)
    : source === 'jellyseerr' ? fetchStreamingMovies(servicesOverride, region)
    : fetchStreamingMoviesFromSnapshot(servicesOverride);
  let rawMovies: Movie[] = [];
  try {
    const primary = await Promise.race([fetchPromise, timeoutPromise]);
    rawMovies = await fallbackToSnapshotOnFailure(
      primary,
      source,
      () => fetchStreamingMoviesFromSnapshot(servicesOverride)
    );
    streamingLoadedSource = (primary.length > 0 && source !== 'snapshot') ? source : 'snapshot';
  } catch (e) {
    console.warn('[Streaming] Failed to load streaming-service titles:', e);
    try {
      rawMovies = await fallbackToSnapshotOnFailure(
        [],
        source,
        () => fetchStreamingMoviesFromSnapshot(servicesOverride)
      );
      streamingLoadedSource = 'snapshot';
    } catch {
      rawMovies = [];
      streamingLoadedSource = null;
    }
  }
  streamingMovies = deduplicateStreamingMovies(rawMovies, enabledDefs);
  streamingLoadedAt = Date.now();
}
