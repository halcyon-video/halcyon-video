// Orchestration for the staff-picks engine (staff-picks.ts): watched anchors
// -> per-anchor TMDB recommendation lists (Jellyseerr, or the deterministic
// synthetic stand-in) -> aggregate -> split against the shelf -> enrich the
// winners -> cache. Separated from the engine so the pure math stays
// node-testable (this file imports jellyseerr.ts, which pulls the Tauri API).
import type { JellyfinLibrary, Movie } from './jellyfin';
import {
  RecommendationSeed,
  fetchMovieDetailFields,
  fetchRecommendationSeeds,
  getDismissedTitleIds,
  getJellyseerrConfig,
  getRequestedDiscoveryIds,
  isJellyseerrAvailable,
} from './jellyseerr';
import {
  AggregatedPick,
  aggregateSeeds,
  discoveryPickToMovie,
  pickAnchors,
  splitPicks,
  syntheticSeedsFor,
} from './staff-picks';

export interface StaffPicks {
  /** Owned, unwatched winners (ranked best-first). Deliberately unmarked on
   *  the shelf — no flag, no sticker (user direction after pin 012). */
  ownedPicks: Movie[];
  /** Synthesized not-in-library endcap titles (ranked best-first). */
  discoveryPicks: Movie[];
}

export const EMPTY_STAFF_PICKS: StaffPicks = { ownedPicks: [], discoveryPicks: [] };

// The aggregation re-runs free off this cache on every boot until the watch
// history changes (new anchorKey) or a day passes — ~50 Jellyseerr round
// trips otherwise, which is real time on a slow server and pure waste when
// nothing was watched since yesterday.
const CACHE_KEY = 'bb_staff_picks_v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_PICK_CAP = 120;
const FETCH_CONCURRENCY = 6;
const OWNED_PICK_CAP = 24;
const DISCOVERY_PICK_CAP = 24;

interface PickCache {
  anchorKey: string;
  at: number;
  picks: AggregatedPick[];
}

function readCache(anchorKey: string): AggregatedPick[] | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as PickCache;
    if (cache?.anchorKey !== anchorKey) return null;
    if (typeof cache.at !== 'number' || Date.now() - cache.at > CACHE_TTL_MS) return null;
    return Array.isArray(cache.picks) ? cache.picks : null;
  } catch {
    return null;
  }
}

function writeCache(anchorKey: string, picks: AggregatedPick[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const cache: PickCache = { anchorKey, at: Date.now(), picks: picks.slice(0, CACHE_PICK_CAP) };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Quota or serialization failure just means a re-fetch next boot.
  }
}

// Split + synthesize: the shared tail of both the real and synthetic paths.
// Owned winners are NOT flagged or stickered — an owned title on the shelf
// looks like any other (user direction after pin 012: no picks sticker on
// owned items). The ranked owned list still rides along for non-visual
// consumers. Only the not-in-library discovery picks wear the FOR YOU
// starburst (set inside discoveryPickToMovie).
function finalizePicks(
  anchorsCount: number,
  picks: AggregatedPick[],
  libraries: JellyfinLibrary[],
  note: string
): { result: StaffPicks; owned: ReturnType<typeof splitPicks>['owned']; discovery: AggregatedPick[] } {
  const { owned, discovery } = splitPicks(picks, libraries, {
    dismissed: getDismissedTitleIds(),
    ownedCap: OWNED_PICK_CAP,
    discoveryCap: DISCOVERY_PICK_CAP,
    minDiscoverySources: anchorsCount >= 4 ? 2 : 1,
  });
  const requested = getRequestedDiscoveryIds();
  const discoveryPicks = discovery.map((p) => discoveryPickToMovie(p, requested));
  console.log(
    `[StaffPicks] ${anchorsCount} watched anchor(s) → ${owned.length} on-shelf staff pick(s), ` +
      `${discoveryPicks.length} order candidate(s)${note}.`
  );
  return { result: { ownedPicks: owned.map((o) => o.movie), discoveryPicks }, owned, discovery };
}

/**
 * Synchronous synthetic path (demo/harness — the synthetic Jellyseerr mark
 * with no real server): deterministic seeds, no cache, no network. Kept sync
 * so the harness can stock endcaps before its module-scope StoreScene
 * construction (no top-level await under the ES2020 target).
 */
export function loadSyntheticStaffPicks(
  libraries: JellyfinLibrary[],
  opts: { posterFor?: (i: number) => string } = {}
): StaffPicks {
  try {
    if (!isJellyseerrAvailable() || getJellyseerrConfig()) return EMPTY_STAFF_PICKS;
    const anchors = pickAnchors(libraries);
    if (anchors.length === 0) return EMPTY_STAFF_PICKS;
    const all = libraries.flatMap((l) => l.movies);
    const seedsByAnchor = new Map<number, RecommendationSeed[]>(
      anchors.map((a) => [a.tmdbId as number, syntheticSeedsFor(a, all, opts.posterFor)])
    );
    const picks = aggregateSeeds(anchors, seedsByAnchor);
    return finalizePicks(anchors.length, picks, libraries, ' (synthetic)').result;
  } catch (e) {
    console.warn('[StaffPicks] Synthetic staff picks failed:', e);
    return EMPTY_STAFF_PICKS;
  }
}

/**
 * The whole pipeline. Never throws: no watch history, no Jellyseerr, or a
 * dead server all resolve to empty pools and the store simply builds without
 * the feature.
 */
export async function loadStaffPicks(
  libraries: JellyfinLibrary[],
  opts: { posterFor?: (i: number) => string } = {}
): Promise<StaffPicks> {
  try {
    const config = getJellyseerrConfig();
    if (!config) return loadSyntheticStaffPicks(libraries, opts);

    const anchors = pickAnchors(libraries);
    if (anchors.length === 0) return EMPTY_STAFF_PICKS;
    const anchorKey = anchors
      .map((a) => a.tmdbId as number)
      .sort((x, y) => x - y)
      .join('|');

    let picks = readCache(anchorKey);
    const fromCache = !!picks;
    if (!picks) {
      const seedsByAnchor = new Map<number, RecommendationSeed[]>();
      for (let i = 0; i < anchors.length; i += FETCH_CONCURRENCY) {
        await Promise.all(
          anchors.slice(i, i + FETCH_CONCURRENCY).map(async (a) => {
            seedsByAnchor.set(a.tmdbId as number, await fetchRecommendationSeeds(a.tmdbId as number));
          })
        );
      }
      picks = aggregateSeeds(anchors, seedsByAnchor);
    }

    // First pass decides the winners; then EVERY order candidate pays the
    // per-title detail round trip — it fills cast/crew for the inspect view,
    // and its mediaInfo is Jellyseerr's authoritative "already in the
    // library" answer, catching titles the shelf join in splitPicks can't
    // (Jellyfin entries with no/other provider ids, variant titles). The
    // verification runs even off cached picks: a title downloaded yesterday
    // must fall off the endcap today.
    const first = finalizePicks(anchors.length, picks, libraries, fromCache ? ' (cached)' : '');
    const ownedNow = new Set<number>();
    const pendingNow = new Set<number>();
    for (let i = 0; i < first.discovery.length; i += FETCH_CONCURRENCY) {
      await Promise.all(
        first.discovery.slice(i, i + FETCH_CONCURRENCY).map(async (p) => {
          const d = await fetchMovieDetailFields(p.tmdbId);
          if (!d) return;
          p.detail = d.detail;
          if (d.libraryStatus === 'available') ownedNow.add(p.tmdbId);
          else if (d.libraryStatus === 'pending') pendingNow.add(p.tmdbId);
        })
      );
    }
    if (ownedNow.size > 0) {
      const dropped = first.discovery.filter((p) => ownedNow.has(p.tmdbId));
      first.discovery = first.discovery.filter((p) => !ownedNow.has(p.tmdbId));
      console.log(
        `[StaffPicks] Dropped ${dropped.length} order candidate(s) already in the library: ` +
          dropped.map((p) => `"${p.seed.title}"`).join(', ')
      );
    }
    // A candidate someone already ordered (through this app or Jellyseerr
    // directly) keeps its endcap spot, restyled REQUESTED instead of orderable.
    const requested = getRequestedDiscoveryIds();
    for (const id of pendingNow) requested.add(id);
    first.result.discoveryPicks = first.discovery.map((p) => discoveryPickToMovie(p, requested));
    if (first.result.discoveryPicks.length > 0) {
      console.log(
        '[StaffPicks] Endcap order candidates: ' +
          first.result.discoveryPicks.map((m) => `"${m.title}" (${m.year})`).join(', ')
      );
    }
    writeCache(anchorKey, picks);
    return first.result;
  } catch (e) {
    console.warn('[StaffPicks] Watch-history recommendations failed:', e);
    return EMPTY_STAFF_PICKS;
  }
}
