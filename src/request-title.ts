import type { Title } from './providers/media-source-provider.ts';

/** Request stock is separate from a film already offered by a streaming service. */
export function isRequestTitle(movie: Pick<Title, 'collectionGap' | 'discovery' | 'streaming' | 'game' | 'tmdbId'>, configured: boolean): boolean {
  return configured && !movie.streaming && !movie.game
    && !!(movie.collectionGap || movie.discovery)
    && Number.isInteger(movie.tmdbId) && (movie.tmdbId ?? 0) > 0;
}
