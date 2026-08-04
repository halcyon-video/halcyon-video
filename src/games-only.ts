// GAMES ONLY mode: the whole store turns into the video game store.
//
// Normally the Romm catalog is a DEPARTMENT — a fixed 2x2 block of game-section
// fixtures parked in one corner (store-fixtures-config.ts gameSectionPlacements),
// stocked from a 192-case budget while the aisles carry the Jellyfin movies.
// That department is a corner of the store no matter how big the rom library
// gets, so most of a real library can never be on a shelf.
//
// With `bb_games_only` on, the trade flips: the movies step out entirely and the
// games take the FLOOR PLAN. Each Romm platform becomes a synthetic
// JellyfinLibrary, so `StorePlan` hatches aisles for it exactly like a movie
// library — its own contiguous run of gondolas, its own signboards (an
// uncategorized library labels every section with its own name, see
// shelving.ts, so the boards read SNES / GAME BOY ADVANCE / PLAYSTATION), its
// own browse cursor, endcaps, camera framing and clerk pathing. Nothing
// downstream needs a games branch: the rest of the app only ever sees
// "libraries of Movies", and a game has been a Movie with `game: true` since
// T18.
//
// The corollary is that the separate game DEPARTMENT must not build in this
// mode (main.ts hands the scene an empty `gameMovies`) — every one of its cases
// is already out on the floor, and a second copy of the catalog would double
// the poster budget to show the same games twice.
import { Movie, JellyfinLibrary } from './jellyfin';
import { getSetting } from './settings';

/**
 * Is the store showing games and nothing else? Gated on the Video Games feature
 * itself, so the sub-toggle can never strand a store with no catalog at all
 * when the master switch is off.
 */
export function isGamesOnly(): boolean {
  return !!getSetting<boolean>('bb_games_enabled') && !!getSetting<boolean>('bb_games_only');
}

/**
 * One synthetic library per Romm platform, biggest platform first.
 *
 * Order is load-bearing: `StorePlan.planRuns` pours libraries into the run
 * fields in list order and the RIGHT field is filled first, so this puts the
 * platform with the deepest catalog on the store's main right-hand aisles and
 * lets the one-off systems (a 4-game Wii U shelf) trail off to the left —
 * which is how a real store with wildly uneven stock reads.
 *
 * Platform-less stock (a Romm platform with no `platformLabel` match still
 * carries its own name, so this is only ever demo/mock data) collects under one
 * GAMES sign rather than being dropped.
 */
/**
 * What the store is actually built from, for the current toggle state.
 *
 * Games-only swaps the movie libraries out for the platform libraries AND
 * empties the game list: the separate department (store-fixtures-config.ts
 * gameSectionPlacements, built only when `scene.gameMovies` is non-empty) would
 * otherwise shelve a second copy of stock that is already out on every aisle.
 *
 * Falls through to the movies untouched when the toggle is off — and also when
 * it's on but no games loaded, because an empty catalog builds a store with no
 * shelves at all, and a Romm server that's briefly down should leave the user
 * with their movies rather than an empty room.
 *
 * The result is memoised on the game list's identity so repeated calls (a
 * settings rebuild, a mode swap) hand back the same library objects rather than
 * fresh clones of several thousand titles.
 */
let catalogCache: { games: Movie[]; libraries: JellyfinLibrary[] } | null = null;

export function storeCatalog(
  libraries: JellyfinLibrary[],
  games: Movie[]
): { libraries: JellyfinLibrary[]; games: Movie[] } {
  if (!isGamesOnly() || games.length === 0) return { libraries, games };
  if (catalogCache?.games !== games) {
    catalogCache = { games, libraries: buildGameLibraries(games) };
  }
  return { libraries: catalogCache.libraries, games: [] };
}

export function buildGameLibraries(games: Movie[]): JellyfinLibrary[] {
  const byPlatform = new Map<string, Movie[]>();
  for (const g of games) {
    const key = g.platform || 'GAMES';
    let list = byPlatform.get(key);
    if (!list) byPlatform.set(key, (list = []));
    list.push(g);
  }

  return [...byPlatform.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([platform, movies]) => ({
      id: `games:${platform.toLowerCase().replace(/\s+/g, '-')}`,
      name: platform,
      // `libraryName` is what the HUD and the clerk read back to the user, and
      // it's also the 'Animated Movies' probe store-stock uses to pick the
      // animated case variant — a platform name never matches that, which is
      // correct: a game wears its retail carton, not a VHS clamshell.
      movies: movies.map((m) => (m.libraryName === platform ? m : { ...m, libraryName: platform })),
      genres: [],
      games: true,
    }));
}
