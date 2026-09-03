// Bundled video-game catalog snapshot (issue #147):
// Stocks the demo games aisle with authentic retro titles and platform-specific
// box art when no Romm server is configured, mirroring streaming-snapshot.ts.
import snapshotData from './data/games-snapshot.json' with { type: 'json' };
import type { Movie } from './jellyfin.ts';
import { isPlatformEnabled, isGamesOnly } from './game-platforms.ts';
import { generateGameCartonArt } from './game-carton-art.ts';

interface SnapshotGame {
  title: string;
  year: number;
  rating?: number;
  overview?: string;
}

interface SnapshotPlatform {
  id: string;
  label: string;
  name: string;
  titles: SnapshotGame[];
}

/**
 * Fetch video games from the bundled snapshot.
 * Respects platform toggles (unless games-only mode is active).
 */
export function fetchGamesFromSnapshot(maxCount?: number, wholeLibrary = false): Movie[] {
  const platforms = snapshotData.platforms as SnapshotPlatform[];
  const allPlatforms = wholeLibrary || isGamesOnly();
  const games: Movie[] = [];

  for (const plat of platforms) {
    if (allPlatforms || isPlatformEnabled(plat.label)) {
      for (let i = 0; i < plat.titles.length; i++) {
        const item = plat.titles[i];
        const id = `game_snap_${plat.id}_${i}`;
        const posterUrl = generateGameCartonArt({
          platform: plat.label,
          title: item.title,
          year: item.year,
          rating: item.rating,
        });

        games.push({
          id,
          title: item.title,
          year: item.year,
          duration: 'N/A',
          rating: 'NR',
          overview: item.overview || 'Rental cartridge. Blow on it if you have to, but please don’t tell us about it.',
          director: 'Unknown',
          actors: [],
          genres: [],
          localPath: '',
          posterUrl,
          game: true,
          platform: plat.label,
          launchPath: `/roms/${plat.id}/game_${i}.zip`,
          communityRating: item.rating,
          criticRating: item.rating ? item.rating * 10 : 0,
        });
      }
    }
  }

  if (typeof maxCount === 'number' && maxCount > 0 && games.length > maxCount) {
    return games.slice(0, maxCount);
  }

  return games;
}
