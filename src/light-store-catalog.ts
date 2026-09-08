// The opt-in phone prototype uses the same zero-setup snapshot as the store.
// Provider identities stay internal; the small catalog is one copy per title.
import { fetchStreamingMoviesFromSnapshot } from './streaming-snapshot';
import { ALL_DEFAULT_STREAMING_SERVICES_CSV } from './streaming-catalog';
import type { Movie, JellyfinLibrary } from './jellyfin';

export async function lightStoreCatalog(): Promise<JellyfinLibrary[]> {
  const selected = localStorage.getItem('bb_streaming_services');
  const stock = await fetchStreamingMoviesFromSnapshot(selected ?? ALL_DEFAULT_STREAMING_SERVICES_CSV);
  const unique = [...new Map(stock.map(movie => [movie.tmdbId, movie])).values()];
  unique.sort((a, b) => b.year - a.year || a.title.localeCompare(b.title));
  // A deliberately small browsing prototype, with four date-based sections.
  // No made-up genre or availability metadata, and no provider-labelled aisles.
  const groups: { name: string; test: (movie: Movie) => boolean }[] = [
    { name: 'New arrivals', test: m => m.year >= 2026 },
    { name: 'Last year', test: m => m.year === 2025 },
    { name: 'Modern movies', test: m => m.year >= 2000 && m.year < 2025 },
    { name: 'Earlier movies', test: m => m.year < 2000 },
  ];
  return groups.map((group, index) => ({
    id: `light-${index}`, name: group.name, genres: [], movies: unique.filter(group.test).slice(0, 24),
  })).filter(group => group.movies.length > 0);
}

/** Restrict the thumbnail transform to the existing TMDB image provider. */
export function lightPosterUrl(movie: Movie, width: 92 | 342): string | undefined {
  if (!movie.posterUrl) return undefined;
  try {
    const url = new URL(movie.posterUrl);
    if (url.hostname !== 'image.tmdb.org') return movie.posterUrl;
    url.pathname = url.pathname.replace(/^\/t\/p\/w\d+\//, `/t/p/w${width}/`);
    return url.href;
  } catch { return undefined; }
}
