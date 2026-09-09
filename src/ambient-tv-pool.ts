// Streamable title pool resolution for overhead CRT TVs (ambient-tvs.ts).
//
// Extracted to keep ambient-tvs.ts modular and directly testable under
// `node --test`: the overhead TVs stream ambient video directly from the
// store's media server (Jellyfin/Plex). Synthetic items — titles on
// streaming services (GH #86), Jellyseerr discovery/gap/coming-soon titles,
// and video games — have no playable video on the media server. Letting them
// enter the streamable pool causes the TV fixture to request non-existent
// media IDs from the server, 404/fail, and permanently step down to the
// bundled promo loop or dead glass.

import type { Movie } from './jellyfin.ts';
import { isUnstockedTitle } from './store-layout.ts';

export interface TvPoolLibrary {
  id: string;
  name?: string;
  streaming?: boolean;
  games?: boolean;
  movies: Movie[];
}

export interface TvPoolResult {
  pool: Movie[];
  fromChosen: boolean;
}

/**
 * Whether a title is a real, streamable media-server item that the overhead
 * TVs can ask Jellyfin or Plex to encode.
 */
export function isTvStreamableTitle(
  movie: Movie,
  library?: { streaming?: boolean; games?: boolean }
): boolean {
  if (library?.streaming || library?.games) return false;
  if (isUnstockedTitle(movie)) return false;
  if (movie.game || (movie as { isGame?: boolean }).isGame) return false;
  return true;
}

/**
 * Build the list of media-server titles the overhead TVs may draw from.
 *
 * Honors explicitly chosen libraries (Settings → Playback → Overhead TVs)
 * when selected, including TV series containers (whose first episode is
 * resolved at stream time). When no libraries are chosen (the default),
 * filters to family-genre films across the catalog, falling back to all
 * streamable films if no family titles exist. Unstocked and synthetic titles
 * are always excluded.
 */
export function buildTvStreamablePool(
  libraries: TvPoolLibrary[],
  chosenLibIds: Set<string>
): TvPoolResult {
  const allMovies: Movie[] = [];
  const chosenMovies: Movie[] = [];
  const FAMILY_GENRES = new Set(['Family']);

  libraries.forEach((lib) => {
    if (lib.streaming || lib.games) return;
    lib.movies.forEach((m) => {
      if (!isTvStreamableTitle(m, lib)) return;

      // A library the user EXPLICITLY picked contributes everything it shelves,
      // series containers included (#67).
      if (chosenLibIds.has(lib.id)) chosenMovies.push(m);

      // The unselected default is still films only. That heuristic is what runs
      // on every store that has never opened the drawer.
      if (m.isSeries) return;
      allMovies.push(m);
    });
  });

  if (chosenMovies.length > 0) {
    return { pool: chosenMovies, fromChosen: true };
  }

  const family = allMovies.filter((m) => m.genres && m.genres.some((g) => FAMILY_GENRES.has(g)));
  const pool = family.length > 0 ? family : allMovies;
  return { pool, fromChosen: false };
}
