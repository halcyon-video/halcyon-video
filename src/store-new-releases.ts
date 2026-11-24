import type { Movie } from './providers/media-source-provider.ts';
import type { NewReleasesSection } from './scene-shared.ts';
import { movieAddedTime, titleReleasedBy } from './media-release-date.ts';
import { planNrBays, type NrBay } from './store-nr-bays.ts';
import { WALL_SHELF_HEIGHTS } from './store-layout.ts';

// The same recent batch stocks the wall and the flat New Releases row.
const NEW_RELEASE_LIMIT = 20;

function releaseTime(movie: Movie): number {
  const premiere = Date.parse(movie.premiereDate ?? '');
  if (Number.isFinite(premiere)) return premiere;
  return movie.year > 0 ? new Date(movie.year, 0, 1).getTime() : NaN;
}

/** Rank eligible titles before allocating displays. A personal movie library never
 * competes with streaming suggestions, TV series or games for its recent row. */
export function selectNewReleases(movies: Movie[], cutoff: Date | null): Movie[] {
  const stock = movies.filter(movie => !movie.discovery && !movie.collectionGap && !movie.comingSoon
    && (!cutoff || titleReleasedBy(movie, cutoff)));
  const owned = stock.filter(movie => !movie.streaming && !movie.game);
  const films = owned.filter(movie => !movie.isSeries);
  const catalog = films.length ? films : owned.length ? owned : stock;

  // An explicitly historical store follows its premiere timeline. Streaming-only
  // and game stores have release metadata but generally have no library add dates.
  const ranked: { movie: Movie; time: number }[] = [];
  for (const movie of catalog) {
    let time = cutoff ? releaseTime(movie) : movieAddedTime(movie, NaN);
    if (!Number.isFinite(time)) {
      if (owned.length || cutoff) continue;
      // Keep even undated stock browsable in an external-only store, after
      // titles for which the service supplies a release date.
      const release = releaseTime(movie);
      time = Number.isFinite(release) ? release : -Infinity;
    }
    ranked.push({ movie, time });
  }
  ranked.sort((a, b) => b.time - a.time || a.movie.title.localeCompare(b.movie.title)
    || a.movie.id.localeCompare(b.movie.id));

  const selected: Movie[] = [];
  const seen = new Set<string>();
  for (const { movie } of ranked) {
    if (selected.length === NEW_RELEASE_LIMIT) break;
    // Two servers can carry the same movie. Keep its newest dated copy and
    // preserve separately titled cuts as distinct catalog entries.
    const key = movie.tmdbId && !movie.game
      ? [movie.isSeries ? 'series' : 'movie', movie.tmdbId, movie.title.trim().toLowerCase()].join(':')
      : 'item:' + movie.id;
    if (seen.has(key)) continue;
    selected.push(movie);
    seen.add(key);
  }
  return selected;
}

/** Choose the recent batch first. Features and additional facing copies can only
 * use spare space after every selected title has a place on the wall. */
export function stockNewReleaseBays(bays: NrBay[], ranked: Movie[], allowFeatures: boolean) {
  const tiers = WALL_SHELF_HEIGHTS.length;
  const rows = bays.length * tiers;
  const movies = ranked.slice(0, rows);
  const features = allowFeatures ? movies.filter(movie => (movie.criticRating ?? 0) >= 90) : [];
  const doubleFeatures = features.filter(movie => (movie.communityRating ?? 0) >= 8);
  // A double replaces two normal bays (2 * tiers titles) with a single face.
  // A single feature replaces one. Both must also fit complete physical bays.
  const spare = rows - movies.length;
  const wantDoubles = Math.min(doubleFeatures.length, Math.floor(spare / (2 * tiers - 1)));
  const doubles = planNrBays(bays, wantDoubles, 0).doubleStarts.length;
  const remaining = spare - doubles * (2 * tiers - 1);
  const singles = Math.min(features.length - doubles, Math.floor(remaining / (tiers - 1)));
  const plan = planNrBays(bays, doubles, singles);
  // Assign titles once, before expanding their facing copies. Sorting a
  // wall-wide list of repeated copies can spill one title over several dividers.
  const ordered = [...movies].sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }));
  let regularTitlesLeft = movies.length - plan.doubleStarts.length - plan.superBays.length;
  let regularBaysLeft = plan.regularBays.length;

  const sections: NewReleasesSection[] = [];
  const doubleStarts = new Set(plan.doubleStarts);
  const singleBays = new Set(plan.superBays);
  let next = 0;
  for (let i = 0; i < bays.length; i++) {
    const { startCol, endCol } = bays[i];
    if (doubleStarts.has(i)) {
      sections.push({ type: 'double-feature', movie: ordered[next++], startCol, endCol: bays[++i].endCol });
    } else if (singleBays.has(i)) {
      sections.push({ type: 'super-feature', movie: ordered[next++], startCol, endCol });
    } else {
      // Share distinct titles across the remaining regular bays. Face them
      // out on this bay's tiers only, in contiguous groups from top to bottom.
      const count = Math.ceil(regularTitlesLeft / regularBaysLeft);
      const titles = ordered.slice(next, next + count);
      const rows = count ? Array.from({ length: tiers }, (_, row) => titles[Math.floor(row * count / tiers)]) : [];
      sections.push({ type: 'regular', movies: rows, startCol, endCol });
      next += count;
      regularTitlesLeft -= count;
      regularBaysLeft--;
    }
  }
  return { sections, movies };
}
