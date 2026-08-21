// Bundled streaming-service snapshot -- the floor of the source ladder
// resolved by streaming-catalog.ts's resolveStreamingSource() (GH #86
// zero-setup follow-up, owner ruling 2026-08-21): "a user should be able to
// click into a hosted site and it just works", and a fresh local install
// must stock a CHOSEN service with nothing configured at all. TMDB
// (tmdb.ts) wins when a key is set, Jellyseerr (jellyseerr.ts) is the
// fallback; this is what runs when NEITHER is -- which is every hosted-demo
// visitor and every bare local install that has picked services at the
// opening-day terminal.
//
// src/data/streaming-snapshot.json is committed, text-only data (baked by
// tools/refresh-streaming-snapshot.mjs from a real Jellyseerr install) --
// tmdbId/title/year/posterPath per title, never a logo or an image asset.
// Posters hotlink from image.tmdb.org at render time (verified keyless with
// a plain `curl`), so this module makes no network request of its own; it is
// synchronous, but returns a Promise to match fetchStreamingMoviesFromTmdb /
// fetchStreamingMovies's shape at the main.ts call site.
//
// Imported with the `type: 'json'` attribute (not a bare `import ... from`)
// so this keeps working under `node --experimental-strip-types --test`
// (tests/streaming-snapshot.test.ts) as well as vite's bundler -- a bare
// JSON import throws ERR_IMPORT_ATTRIBUTE_MISSING under plain Node.
import snapshotData from './data/streaming-snapshot.json' with { type: 'json' };
import {
  type RawDiscoverItem,
  resolveEnabledServices, ingestStreamingResults, STREAMING_CAP_PER_SERVICE,
} from './streaming-catalog.ts';
import type { Movie } from './jellyfin.ts';

interface SnapshotTitle {
  tmdbId: number;
  title: string;
  year: number;
  posterPath?: string;
}

interface SnapshotService {
  id: string;
  name: string;
  titles: SnapshotTitle[];
}

interface Snapshot {
  generatedAt: string;
  watchRegion: string;
  services: SnapshotService[];
}

const SNAPSHOT = snapshotData as Snapshot;
const SNAPSHOT_BY_ID = new Map(SNAPSHOT.services.map((s) => [s.id, s]));

function normalizeSnapshotTitle(t: SnapshotTitle): RawDiscoverItem {
  return {
    id: t.tmdbId,
    title: t.title,
    releaseDate: t.year ? `${t.year}-01-01` : undefined,
    posterPath: t.posterPath,
  };
}

const DISMISSED_IDS_KEY = 'jellyseerr_dismissed_ids';

/** Same pool jellyseerr.ts's getDismissedTitleIds / tmdb.ts's
 *  getDismissedTmdbIds read -- a title dismissed through one source stays
 *  dismissed through every source. Duplicated here for the same reason
 *  tmdb.ts duplicates it: this module stays free of jellyseerr.ts's runtime
 *  imports so it keeps running under a bare `node --test`. */
function getDismissedSnapshotIds(): Set<number> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(DISMISSED_IDS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x: unknown) => typeof x === 'number') : []);
  } catch {
    return new Set();
  }
}

/**
 * The bundled-snapshot rung of the streaming source ladder: every CHOSEN
 * service (resolveEnabledServices(servicesOverrideCsv)) the snapshot
 * actually shipped data for, run through the same ingestStreamingResults
 * (dedup/dismissed/cap) every other source uses. A service missing from the
 * snapshot (a custom, non-default CSV entry) contributes nothing -- never
 * throws, same never-block-boot contract as the network sources.
 */
export async function fetchStreamingMoviesFromSnapshot(servicesOverrideCsv?: string | null): Promise<Movie[]> {
  const wanted = resolveEnabledServices(servicesOverrideCsv);
  if (wanted.length === 0) return [];
  const dismissed = getDismissedSnapshotIds();
  const movies: Movie[] = [];
  for (const def of wanted) {
    const svc = SNAPSHOT_BY_ID.get(def.id);
    if (!svc) continue;
    const items = svc.titles.map(normalizeSnapshotTitle);
    movies.push(...ingestStreamingResults(items, def, { dismissed, cap: STREAMING_CAP_PER_SERVICE }));
  }
  return movies;
}
