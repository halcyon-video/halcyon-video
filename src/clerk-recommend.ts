import type { Movie } from './jellyfin';

/**
 * Clerk recommendation brain (T14 Phase C).
 *
 * Ranks the library by a blend of community rating, recency, and a genre
 * affinity learned from the titles the player has recently inspected. Pure,
 * allocation-light, and self-contained — the 3D scene only feeds it a movie
 * list and calls `recordInspect()` when the player opens a cover.
 */

const AFFINITY_KEY = 'clerk.genreAffinity.v1';
const RECENT_KEY = 'clerk.recentInspect.v1';
const RECENT_MAX = 20;

type Affinity = Record<string, number>;

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota — recommendations just fall back to rating+recency */
  }
}

/** Call when the player inspects a cover: bump genre affinity + remember the id. */
export function recordInspect(movie: Movie | null | undefined) {
  if (!movie) return;

  const affinity = readJSON<Affinity>(AFFINITY_KEY, {});
  // Gentle decay so tastes drift with recent behaviour rather than accumulating forever.
  for (const g of Object.keys(affinity)) affinity[g] *= 0.94;
  for (const g of movie.genres ?? []) affinity[g] = (affinity[g] ?? 0) + 1;
  writeJSON(AFFINITY_KEY, affinity);

  const recent = readJSON<string[]>(RECENT_KEY, []);
  const next = [movie.id, ...recent.filter((id) => id !== movie.id)].slice(0, RECENT_MAX);
  writeJSON(RECENT_KEY, next);
}

export interface Recommendation {
  movie: Movie;
  reason: string;
}

/**
 * Pick a single sensible title. Score = rating + recency + genre affinity.
 * Recently-inspected titles are demoted so she suggests something fresh.
 */
export function recommend(movies: Movie[]): Recommendation | null {
  if (!movies || movies.length === 0) return null;

  const affinity = readJSON<Affinity>(AFFINITY_KEY, {});
  const recent = new Set(readJSON<string[]>(RECENT_KEY, []));
  const maxAffinity = Math.max(1, ...Object.values(affinity));

  let years = movies.map((m) => m.year || 0).filter((y) => y > 0);
  const minYear = years.length ? Math.min(...years) : 1980;
  const maxYear = years.length ? Math.max(...years) : new Date().getFullYear();
  const yearSpan = Math.max(1, maxYear - minYear);

  let best: Movie | null = null;
  let bestScore = -Infinity;
  let bestAffinity = 0;

  for (const m of movies) {
    if (m.comingSoon) continue;
    const ratingNorm = (typeof m.communityRating === 'number' ? m.communityRating : 6) / 10;
    const recencyNorm = ((m.year || minYear) - minYear) / yearSpan;
    const affScore = (m.genres ?? []).reduce((s, g) => s + (affinity[g] ?? 0), 0) / maxAffinity;

    let score = ratingNorm * 1.0 + recencyNorm * 0.4 + Math.min(affScore, 3) * 0.5;
    if (recent.has(m.id)) score -= 1.5; // freshness demotion, not a hard exclude

    if (score > bestScore) {
      bestScore = score;
      best = m;
      bestAffinity = affScore;
    }
  }

  if (!best) return null;

  // Explain the pick in-character.
  let reason: string;
  const topGenre = (best.genres ?? []).find((g) => (affinity[g] ?? 0) > 0);
  if (bestAffinity > 0.3 && topGenre) {
    reason = `You've been eyeing a lot of ${topGenre.toLowerCase()} — this one's a keeper.`;
  } else if ((best.communityRating ?? 0) >= 7.5) {
    reason = `It's one of our highest-rated rentals right now.`;
  } else if (best.year && best.year >= maxYear - 1) {
    reason = `Just came in — it's flying off the shelf.`;
  } else {
    reason = `A staff favorite. You won't be disappointed.`;
  }

  return { movie: best, reason };
}
