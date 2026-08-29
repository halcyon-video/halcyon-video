// The (itemId, path) pair the 2.5D detail overlay hands the player for one
// episode click (flat-detail.ts's playEpisode). Pulled out on its own so this
// is directly testable under `node --test` — flat-detail.ts's own import
// chain (active-provider -> providers/index -> jellyfin-provider) drags in
// Tauri/DOM globals a test process can't load, the same reason
// provider-registry.test.ts hand-rolls a fake provider instead of importing
// the real ones.
//
// GH #71 (P3, "latent, do not naively fix"): a prior version of playEpisode
// "recovered" a missing ep.path by calling
// fetchFirstEpisodeOfSeries(server, session, ep.id) — passing an EPISODE id
// where that method wants a SERIES id. On both backends that always came back
// empty (an episode has no episode children of its own: Jellyfin's
// ?ParentId=<episodeId> and Plex's /library/metadata/<episodeId>/allLeaves
// both return nothing), so the fallback never once fired in production, on
// either backend — see tests/flat-detail.test.ts for the regression coverage
// pinning that claim against real jellyfin.ts/plex.ts code.
//
// It was deleted rather than "fixed" because the id mismatch was never the
// only problem: main.ts's launchVideoPlayback (see playback-routing.ts)
// builds every stream URL — direct-play and HLS, on BOTH backends — from the
// item id alone. `path` is only ever consulted for the OPTIONAL local-mpv
// fast path, and an empty one there just skips it; playback falls straight
// through to the ordinary in-app stream, which needs no path at all. So the
// old fallback bought nothing even when it "worked."
//
// DO NOT resurrect a fix that passes ep.seriesId instead. On real data that
// argument resolves fine and starts returning the SERIES' FIRST episode's
// path, which then gets assigned as if it belonged to whichever episode was
// actually clicked (pick S03E07, play S01E01) — the one code path nobody
// tests, because it only runs when path is empty. This function's signature
// is the guard: it takes no server, no session, no provider, so a network
// call — right target or wrong — cannot be smuggled back into it without a
// reviewer noticing the new parameter.
import type { Episode, Movie } from '../jellyfin.ts';

export function resolveEpisodePlaybackArgs(ep: Episode): { itemId: string; path: string } {
  return { itemId: ep.id, path: ep.path };
}

export interface FlatDetailButtonState {
  text: string;
  icon: string;
  disabled: boolean;
}

/**
 * Pure button state resolution for the 2.5D detail overlay (flat-detail.ts):
 * games -> Rent (🎮)
 * discovery/collectionGap -> Request / Requested / Coming Soon (✦ / ✓)
 * streaming -> Watch on <SERVICE> (↗)
 * comingSoon -> Coming Soon (⏱, disabled)
 * library titles -> Play (▶)
 */
export function resolveDetailButtonState(movie: Partial<Movie>, isRequested = false): FlatDetailButtonState {
  if (movie.game) {
    return { text: 'Rent', icon: '🎮', disabled: false };
  }
  if (movie.discovery || movie.collectionGap) {
    return {
      text: isRequested ? (movie.collectionGap ? 'Coming Soon' : 'Requested') : 'Request',
      icon: isRequested ? '✓' : '✦',
      disabled: isRequested,
    };
  }
  if (movie.streaming) {
    return {
      text: `Watch on ${movie.streamingServiceName || 'Streaming'}`,
      icon: '↗',
      disabled: false,
    };
  }
  if (movie.comingSoon) {
    return { text: 'Coming Soon', icon: '⏱', disabled: true };
  }
  return { text: 'Play', icon: '▶', disabled: false };
}

