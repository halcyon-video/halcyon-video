/** A page copies references only; the source catalog remains the search index. */
export const CATALOG_PAGE_SIZE = 600;
export interface CatalogLibrary<T> { movies: T[] }

export function catalogSize<T>(libraries: CatalogLibrary<T>[]): number {
  return libraries.reduce((sum, library) => sum + library.movies.length, 0);
}

export function catalogPage<T, L extends CatalogLibrary<T>>(
  libraries: L[], requested: number, size = CATALOG_PAGE_SIZE,
): { libraries: L[]; page: number; pages: number; total: number } {
  if (!Number.isInteger(size) || size < 1) throw new RangeError('Invalid catalog page size');
  const total = catalogSize(libraries);
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.max(0, Math.min(pages - 1, Math.trunc(requested) || 0));
  const start = page * size, end = start + size;
  let offset = 0;
  const result: L[] = [];
  for (const library of libraries) {
    const from = Math.max(0, start - offset);
    const to = Math.min(library.movies.length, end - offset);
    if (to > from) result.push({ ...library, movies: library.movies.slice(from, to) });
    offset += library.movies.length;
    if (offset >= end) break;
  }
  return { libraries: total <= size ? libraries : result, page, pages, total };
}

/** Bounded search results without a second per-title index or lowercase cache. */
export async function findCatalogTitle<T extends { id: string; title: string }>(
  libraries: CatalogLibrary<T>[], query: string,
): Promise<{ movie: T; page: number } | null> {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  let offset = 0, bestRank = -1;
  let best: { movie: T; page: number } | null = null;
  for (const library of libraries) for (const movie of library.movies) {
    const title = movie.title.toLowerCase();
    const rank = movie.id === query || title === q ? 3 : title.startsWith(q) ? 2 : title.includes(q) ? 1 : -1;
    if (rank > bestRank) {
      bestRank = rank;
      best = { movie, page: Math.floor(offset / CATALOG_PAGE_SIZE) };
    }
    offset++;
    if (offset % 512 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  return best;
}
