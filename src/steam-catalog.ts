import type { Title, Library } from './providers/media-source-provider.ts';
export const STEAM_REVIEW_TIERS = [
  { id: 'all', label: 'Everything' },
  { id: '9', label: 'Overwhelmingly Positive' },
  { id: '8', label: 'Very Positive' },
  { id: '7', label: 'Positive' },
  { id: '6', label: 'Mostly Positive' },
  { id: '5', label: 'Mixed' },
  { id: '4', label: 'Mostly Negative' },
  { id: '3', label: 'Negative' },
  { id: '2', label: 'Very Negative' },
  { id: '1', label: 'Overwhelmingly Negative' },
  { id: '0', label: 'Not enough reviews' },
];
export interface SteamGame { appid: number; name: string; playtime_forever?: number }
export interface SteamReview { score: number; total: number; positive: number }
export function steamTitle(game: SteamGame, review?: SteamReview): Title {
  const score = review?.score;
  return {
    id: `steam:${game.appid}`, steamAppId: game.appid, steamReviewScore: score,
    title: game.name, year: 0, duration: '', rating: '', director: '', actors: [], genres: [],
    localPath: '', game: true, platform: 'PC GAMES', libraryName: 'PC GAMES',
    posterUrl: `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/library_600x900.jpg`,
    overview: review ? `${STEAM_REVIEW_TIERS.find(t => t.id === String(score))?.label ?? 'Unrated'} · ${review.total.toLocaleString()} Steam reviews.` : 'From your Steam library. Check out to play with Steam.',
    communityRating: review && review.total > 0 ? review.positive / review.total * 10 : undefined,
  };
}
export function filterSteamTitles(titles: Title[], tier: string): Title[] {
  if (tier === 'all') return titles;
  if (!STEAM_REVIEW_TIERS.some(t => t.id === tier)) return [];
  return titles.filter(t => t.steamReviewScore === Number(tier));
}
export function expandedSteamCatalog(libraries: Library[], games: Title[]): { libraries: Library[]; games: Title[] } {
  const steam = games.filter(g => g.steamAppId !== undefined);
  if (!steam.length) return { libraries, games };
  return { libraries: [...libraries.filter(l => l.id !== 'games:steam'), { id: 'games:steam', name: 'PC GAMES', movies: steam, genres: [], games: true }], games: games.filter(g => g.steamAppId === undefined) };
}
