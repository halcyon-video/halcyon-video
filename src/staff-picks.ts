// The staff-picks engine: watch-history recommendations.
//
// TMDB's per-title "recommendations" list is behavioural — "people who liked
// X also liked Y". One list is a fact about a film; the OVERLAP of the lists
// for everything you've actually watched is a fact about YOU. This module
// aggregates those lists across the user's Jellyfin watch history (played /
// lastPlayedDate, see jellyfin.ts's extractWatchState) and ranks the hits:
// a title recommended off three films you watched beats one recommended off
// one, however popular. The winners become
//   - a ranked owned pool (deliberately unmarked on the shelf — no flag, no
//     sticker; user direction after pin 012), and
//   - synthesized not-in-library Movies for the genre endcaps
//     (genre-endcap.ts), orderable through the same requestMovie flow as
//     collection gaps — these DO wear the FOR YOU starburst.
//
// Pure functions over plain data, no THREE import and no runtime import of
// jellyseerr.ts (type-only), so it runs under `node --test` with type
// stripping. Unit tests: npm run test:picks. Network + cache orchestration
// lives in staff-picks-loader.ts.
import type { JellyfinLibrary, Movie } from './jellyfin';
import type { RecommendationSeed } from './jellyseerr';

/** Watched titles the aggregation runs over, most-recently-watched first. */
export const MAX_ANCHORS = 24;

export interface AggregatedPick {
  tmdbId: number;
  /** Recency- and rank-weighted vote mass across all anchors. */
  score: number;
  /** Titles of the watched films whose lists surfaced this — the overlap. */
  sources: string[];
  seed: RecommendationSeed;
  /** Cast/crew fill-in for a pick that made the cut (see fetchMovieDetailFields). */
  detail?: Partial<Movie>;
}

/** A title on the shelf counts as watch-history evidence only if it's a real,
 *  owned, played film — not an empty-box synth or a series container. */
export function pickAnchors(libraries: JellyfinLibrary[], cap = MAX_ANCHORS): Movie[] {
  const anchors = libraries
    .flatMap((l) => l.movies)
    .filter(
      (m) =>
        m.played &&
        typeof m.tmdbId === 'number' &&
        !m.isSeries &&
        !m.collectionGap &&
        !m.discovery &&
        !m.comingSoon &&
        !m.game
    );
  anchors.sort((a, b) => {
    const ta = a.lastPlayedDate ? Date.parse(a.lastPlayedDate) || 0 : 0;
    const tb = b.lastPlayedDate ? Date.parse(b.lastPlayedDate) || 0 : 0;
    if (tb !== ta) return tb - ta;
    if ((b.playCount || 0) !== (a.playCount || 0)) return (b.playCount || 0) - (a.playCount || 0);
    return a.title.localeCompare(b.title);
  });
  return anchors.slice(0, cap);
}

/**
 * Merge every anchor's recommendation list into one ranked pool. Sorting is
 * overlap-first: how many of your watched films voted for it dominates, the
 * weighted score refines within a tier, audience rating breaks the last ties.
 */
export function aggregateSeeds(
  anchors: Movie[],
  seedsByAnchor: Map<number, RecommendationSeed[]>
): AggregatedPick[] {
  const byId = new Map<number, AggregatedPick>();
  const anchorSpan = Math.max(1, anchors.length - 1);
  anchors.forEach((anchor, anchorIdx) => {
    const seeds = seedsByAnchor.get(anchor.tmdbId as number) || [];
    // Your latest watches steer hardest — gently (1.0 down to 0.5).
    const recencyW = 1 - 0.5 * (anchorIdx / anchorSpan);
    const posSpan = Math.max(1, seeds.length - 1);
    seeds.forEach((seed, pos) => {
      if (seed.tmdbId === anchor.tmdbId) return;
      // TMDB orders its list; the head is worth about twice the tail.
      const posW = 1 - 0.5 * (pos / posSpan);
      let pick = byId.get(seed.tmdbId);
      if (!pick) {
        pick = { tmdbId: seed.tmdbId, score: 0, sources: [], seed };
        byId.set(seed.tmdbId, pick);
      }
      pick.score += recencyW * posW;
      if (!pick.sources.includes(anchor.title)) pick.sources.push(anchor.title);
    });
  });
  const picks = [...byId.values()];
  picks.sort(
    (a, b) =>
      b.sources.length - a.sources.length ||
      b.score - a.score ||
      (b.seed.communityRating ?? 0) - (a.seed.communityRating ?? 0) ||
      a.tmdbId - b.tmdbId
  );
  return picks;
}

export interface SplitPicksOptions {
  /** tmdbIds the user marked "not interested" — never resurface. */
  dismissed?: Set<number>;
  ownedCap?: number;
  discoveryCap?: number;
  /** Overlap floor for an ORDER-candidate: one watched film's echo isn't
   *  enough to put an empty box on an endcap once there's real history. */
  minDiscoverySources?: number;
}

export interface OwnedPick {
  movie: Movie;
  pick: AggregatedPick;
}

// Word-boundary Roman numerals → digits, unambiguous forms only: "I", "V"
// and "X" alone are real film titles and stay untouched.
const ROMAN_NUMERALS: Record<string, string> = {
  ii: '2', iii: '3', iv: '4', vi: '6', vii: '7', viii: '8', ix: '9',
  xi: '11', xii: '12', xiii: '13',
};

/**
 * Normalize a title for identity comparison across metadata sources:
 * lowercase, accents folded, "&" read as "and", Roman sequel numerals read
 * as digits, punctuation collapsed to single spaces. "Amélie"/"amelie",
 * "Barbie & the Diamond Castle"/"Barbie and the Diamond Castle" and
 * "Frozen II"/"Frozen 2" all come out equal — exactly the spelling drift
 * between Jellyfin names and TMDB names that made owned titles read as
 * not-owned.
 */
export function normalizeTitleKey(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\b(ii|iii|iv|vi|vii|viii|ix|xi|xii|xiii)\b/g, (m) => ROMAN_NUMERALS[m]);
}

/**
 * Every identity key a title answers to: the full normalized string, plus —
 * for "Franchise: Subtitle" shapes — the subtitle alone, because Jellyfin
 * and TMDB routinely disagree on whether the franchise prefix is part of the
 * name ("Beauty and the Beast: Belle's Magical World" vs "Belle's Magical
 * World"). Only the SUBTITLE side is added (a prefix key would collide with
 * the franchise's own main film), and short fragments are dropped — a
 * "part 2"-shaped subtitle would collide across every franchise.
 */
export function titleMatchKeys(title: string): string[] {
  const keys = new Set<string>();
  const full = normalizeTitleKey(title);
  if (full) keys.add(full);
  const sep = /^(.+?)(?::| - )(.+)$/.exec(title);
  if (sep) {
    const sub = normalizeTitleKey(sep[2]);
    if (sub.length >= 10) keys.add(sub);
  }
  return [...keys];
}

/**
 * Divide the ranked pool against what's actually on the shelf: picks you own
 * (and haven't watched) go to the unmarked owned pool; picks you don't own
 * become endcap order-candidates. Rank order is preserved in both outputs.
 */
export function splitPicks(
  picks: AggregatedPick[],
  libraries: JellyfinLibrary[],
  opts: SplitPicksOptions = {}
): { owned: OwnedPick[]; discovery: AggregatedPick[] } {
  const dismissed = opts.dismissed ?? new Set<number>();
  const ownedCap = opts.ownedCap ?? 18;
  const discoveryCap = opts.discoveryCap ?? 24;
  const minSources = opts.minDiscoverySources ?? 1;

  const byTmdb = new Map<number, Movie>();
  // TMDB id alone is not enough to recognize your own shelf: a Jellyfin item
  // scraped without a Tmdb provider id (or with a different edition's id)
  // would read as not-owned, and its pick would surface as a "we don't have
  // this, order it?" endcap case for a film standing three aisles over. The
  // title+year index below is the fallback join for exactly those.
  const byTitle = new Map<string, Movie[]>();
  for (const lib of libraries) {
    for (const m of lib.movies) {
      if (m.collectionGap || m.discovery || m.comingSoon || m.game) continue;
      if (typeof m.tmdbId === 'number' && !byTmdb.has(m.tmdbId)) {
        byTmdb.set(m.tmdbId, m);
      }
      for (const key of titleMatchKeys(m.title)) {
        const list = byTitle.get(key);
        if (list) list.push(m);
        else byTitle.set(key, [m]);
      }
    }
  }
  // Same title counts as the same film when the years agree within a year
  // (regional release dates drift) — or when either side has no usable year,
  // where mistaking a remake for owned merely understocks the endcap, the
  // safe direction. A same-titled shelf entry with a CONFLICTING year is a
  // different film (a remake) — but it must not become an order candidate
  // either: a second "Aladdin" case wearing a REQUEST sticker beside the
  // "Aladdin" you own reads as the store lying about your own shelf, whatever
  // the years say in the fine print. Those picks are dropped outright.
  const matchByTitle = (pick: AggregatedPick): { owned?: Movie; sameNameOnly: boolean } => {
    const candidates: Movie[] = [];
    for (const key of titleMatchKeys(pick.seed.title || '')) {
      const list = byTitle.get(key);
      if (list) candidates.push(...list);
    }
    if (candidates.length === 0) return { sameNameOnly: false };
    const seedYear = pick.seed.year;
    const owned = candidates.find(
      (m) =>
        !(typeof seedYear === 'number' && seedYear > 0 && m.year > 0) ||
        Math.abs(m.year - seedYear) <= 1
    );
    return { owned, sameNameOnly: !owned };
  };

  const owned: OwnedPick[] = [];
  const discovery: AggregatedPick[] = [];
  for (const pick of picks) {
    if (owned.length >= ownedCap && discovery.length >= discoveryCap) break;
    let m = byTmdb.get(pick.tmdbId);
    if (!m) {
      const t = matchByTitle(pick);
      if (t.sameNameOnly) continue; // same-named shelf twin — never advertise
      m = t.owned;
    }
    if (m) {
      // Already watched = the recommendation landed; nothing to point at.
      if (!m.played && !m.isSeries && owned.length < ownedCap) owned.push({ movie: m, pick });
    } else if (
      discovery.length < discoveryCap &&
      !dismissed.has(pick.tmdbId) &&
      !pick.seed.hasMediaInfo &&
      pick.sources.length >= minSources
    ) {
      discovery.push(pick);
    }
  }
  return { owned, discovery };
}

/**
 * An endcap case for a title the store doesn't have: same empty-box contract
 * as a collection gap (discovery: true, orderable via requestMovie), with the
 * overlap that earned it written into the overview so the inspect view says
 * WHY it's on the endcap.
 */
export function discoveryPickToMovie(pick: AggregatedPick, requestedIds: Set<number>): Movie {
  const s = pick.seed;
  const because = pick.sources.slice(0, 2).join(' and ');
  const why = because ? `Recommended because you watched ${because}.` : 'Recommended for you.';
  const movie: Movie = {
    id: `staffpick_${s.tmdbId}`,
    title: s.title,
    year: s.year,
    premiereDate: s.premiereDate,
    duration: 'N/A',
    rating: 'NR',
    overview: s.overview ? `${why} ${s.overview}` : why,
    director: 'Unknown Director',
    actors: [],
    genres: s.genres.slice(),
    localPath: '',
    posterUrl: s.posterUrl,
    communityRating: s.communityRating,
    tmdbId: s.tmdbId,
    discovery: true,
    staffPick: true,
  };
  if (requestedIds.has(s.tmdbId)) movie.discoveryRequested = true;
  if (pick.detail) {
    const d = pick.detail;
    if (d.director) movie.director = d.director;
    if (d.actors?.length) movie.actors = d.actors.slice();
    if (d.genres?.length) movie.genres = d.genres.slice();
    if (d.studios?.length) movie.studios = d.studios.slice();
    if (d.collectionName) movie.collectionName = d.collectionName;
    if (d.premiereDate) movie.premiereDate = d.premiereDate;
    if (d.duration) movie.duration = d.duration;
  }
  return movie;
}

// ─── Synthetic seeds (demo/harness — no Jellyseerr server) ────────────────

// Not-in-library candidates live in their own tmdb block, clear of the demo
// libraries (100000-400000+), the discovery rack (500000+), and the
// collection gaps (900000+).
export const SYNTHETIC_PICK_TMDB_BASE = 600000;

/**
 * Deterministic stand-in for TMDB's recommendations list: same-genre library
 * titles in a rotating window keyed off the anchor's tmdbId (so nearby
 * anchors of one genre produce OVERLAPPING lists — the aggregation's whole
 * point), plus three not-in-library "order it" candidates from a small
 * per-genre pool with the same overlap property.
 */
export function syntheticSeedsFor(
  anchor: Movie,
  allMovies: Movie[],
  posterFor?: (i: number) => string
): RecommendationSeed[] {
  const genre = anchor.genres[0];
  if (!genre || typeof anchor.tmdbId !== 'number') return [];
  const seeds: RecommendationSeed[] = [];

  const sameGenre = allMovies
    .filter(
      (m) =>
        m !== anchor &&
        typeof m.tmdbId === 'number' &&
        !m.isSeries &&
        !m.collectionGap &&
        !m.discovery &&
        !m.comingSoon &&
        !m.game &&
        m.genres.includes(genre)
    )
    .sort((a, b) => (a.tmdbId as number) - (b.tmdbId as number));
  if (sameGenre.length > 0) {
    const start = anchor.tmdbId % sameGenre.length;
    for (let k = 0; k < Math.min(10, sameGenre.length); k++) {
      const m = sameGenre[(start + k) % sameGenre.length];
      seeds.push({
        tmdbId: m.tmdbId as number,
        title: m.title,
        year: m.year,
        posterUrl: m.posterUrl,
        overview: m.overview,
        communityRating: m.communityRating,
        genres: m.genres.slice(),
        premiereDate: m.premiereDate,
        hasMediaInfo: false,
      });
    }
  }

  // Per-genre pool of 6 synthetic unowned titles; each anchor votes for a
  // 3-wide window so same-genre anchors overlap on ≥2 of them.
  const gIdx = Math.abs(genre.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) % 97;
  const windowStart = anchor.tmdbId % 50 >= 25 ? 1 : 0;
  for (let k = 0; k < 3; k++) {
    const n = windowStart + k;
    const id = SYNTHETIC_PICK_TMDB_BASE + gIdx * 10 + n;
    seeds.push({
      tmdbId: id,
      title: `${genre} Staff Pick ${n + 1}`,
      year: 2020 + (n % 6),
      overview: 'Synthetic staff-pick order candidate for harness testing.',
      communityRating: 6.5 + (n % 3),
      genres: [genre],
      posterUrl: posterFor?.(gIdx + n),
      hasMediaInfo: false,
    });
  }
  return seeds;
}
