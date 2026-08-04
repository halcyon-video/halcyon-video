import { JellyfinLibrary, Movie } from '../jellyfin';
import { createCase } from './flat-case';

export function buildLibraryRows(
  library: JellyfinLibrary,
  gameMovies: Movie[] = [],
  discoveryMovies: Movie[] = []
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'flat-rows-container';

  // 1. New Releases Row
  // Filter movies that have a dateCreated, sort them desc
  const moviesWithDate = library.movies.filter(m => m.dateCreated);
  const sortedNew = [...moviesWithDate].sort((a, b) => {
    return new Date(b.dateCreated!).getTime() - new Date(a.dateCreated!).getTime();
  });

  const newReleasesList = sortedNew.length > 0 ? sortedNew.slice(0, 20) : library.movies.slice(0, 20);

  if (newReleasesList.length > 0) {
    const newReleasesRow = createRowElement('New Releases', newReleasesList);
    container.appendChild(newReleasesRow);
  }

  // 2. Genre Rows
  const genreMap = new Map<string, Movie[]>();
  library.movies.forEach(movie => {
    if (movie.genres && movie.genres.length > 0) {
      movie.genres.forEach(genre => {
        if (!genreMap.has(genre)) {
          genreMap.set(genre, []);
        }
        genreMap.get(genre)!.push(movie);
      });
    }
  });

  // Sort genres alphabetically
  const genres = Array.from(genreMap.keys()).sort();

  genres.forEach(genre => {
    const genreMovies = genreMap.get(genre)!;
    if (genreMovies.length > 0) {
      // Cap at 60 cases
      const cappedMovies = genreMovies.slice(0, 60);
      const genreRow = createRowElement(genre, cappedMovies);
      container.appendChild(genreRow);
    }
  });

  // 3. Game Rows (one row per platform)
  if (gameMovies.length > 0) {
    const platformMap = new Map<string, Movie[]>();
    gameMovies.forEach(game => {
      if (game.platform) {
        if (!platformMap.has(game.platform)) {
          platformMap.set(game.platform, []);
        }
        platformMap.get(game.platform)!.push(game);
      }
    });

    // Sort platform names alphabetically
    const platforms = Array.from(platformMap.keys()).sort();

    platforms.forEach(platform => {
      const platformGames = platformMap.get(platform)!;
      if (platformGames.length > 0) {
        const cappedGames = platformGames.slice(0, 60);
        const gameRow = createRowElement(platform, cappedGames);
        container.appendChild(gameRow);
      }
    });
  }

  // 4. Discovery Row
  if (discoveryMovies.length > 0) {
    const discoveryRow = createRowElement('COMING SOON / REQUEST IT', discoveryMovies.slice(0, 60));
    container.appendChild(discoveryRow);
  }

  return container;
}

function createRowElement(title: string, movies: Movie[]): HTMLElement {
  const row = document.createElement('div');
  row.className = 'flat-row';

  const rowTitle = document.createElement('h3');
  rowTitle.className = 'flat-row-title';
  rowTitle.textContent = title;
  row.appendChild(rowTitle);

  const scrollContainer = document.createElement('div');
  scrollContainer.className = 'flat-row-scroll-container';

  movies.forEach(movie => {
    const caseEl = createCase(movie);
    scrollContainer.appendChild(caseEl);
  });

  row.appendChild(scrollContainer);
  return row;
}
