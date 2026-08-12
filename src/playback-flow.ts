// Playback orchestration shared by (or exclusive to) the local-mpv path.
//
// Extracted from main.ts, which sits at its enforced line budget: the mpv
// exit handler needed the same "did this end naturally, and if so what's
// next" logic the in-app HTML5 player's onClose already had, and mpv itself
// needed the local file handed off to it (playLocalWithMpv) to actually gain
// resume, next-episode autoplay, and the Settings ▸ Playback language/caption
// preferences the HTML5 path already honored. Moving playLocalWithMpv here
// wholesale — rather than just adding params to it in place — is what pays
// for those three features without growing main.ts at all.
// Explicit .ts specifiers: tests/playback-flow.test.ts loads this module
// under `node --test`'s type-stripping loader, which can't resolve a bare
// sibling specifier (same note as jellyfin.ts's own media-release-date.ts import).
import type { Movie, Episode } from './media-types.ts';
import { reportPlaybackStart, reportPlaybackProgress, reportPlaybackStopped } from './media-backend.ts';

const TICKS_PER_SECOND = 10_000_000;

/** The up-next queue launchVideoPlayback keeps for the series currently
 *  playing (main.ts's module-level `seriesQueue`). */
export interface SeriesQueue {
  seriesId: string;
  episodes: Episode[];
}

/** The episode after `currentItemId` in the active series queue, if any. */
export function nextEpisodeInQueue(queue: SeriesQueue | null, movie: Movie, currentItemId: string): Episode | null {
  if (!movie.isSeries || queue?.seriesId !== movie.id) return null;
  const i = queue.episodes.findIndex((e) => e.id === currentItemId);
  return i >= 0 ? (queue.episodes[i + 1] ?? null) : null;
}

/** "S02E05 · Title" for console/log lines. */
export function episodeLabel(ep: Episode): string {
  const num = `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`;
  return ep.name ? `${num} · ${ep.name}` : num;
}

/** Where to start, and how long the item runs, in Jellyfin ticks. An episode
 *  played by override id looks itself up in the queue main.ts just built (it
 *  carries the same per-user UserData fields the movie-level fetch does);
 *  everything else falls back to the movie's own synced fields. Both are
 *  simply absent (0) when unknown — the caller treats 0 duration as "can't
 *  tell a natural end from a quit" and 0 resume as "start from 0:00", which
 *  is exactly the safe default in each case. */
export function resolveActiveItemTiming(
  movie: Movie,
  overrideItemId: string | undefined,
  queue: SeriesQueue | null
): { resumeTicks: number; durationTicks: number } {
  const ep = overrideItemId ? queue?.episodes.find((e) => e.id === overrideItemId) : undefined;
  if (ep) return { resumeTicks: ep.resumePositionTicks ?? 0, durationTicks: ep.runTimeTicks ?? 0 };
  return {
    resumeTicks: overrideItemId ? 0 : movie.resumePositionTicks ?? 0,
    durationTicks: overrideItemId ? 0 : movie.runTimeTicks ?? 0,
  };
}

/**
 * Optimistic local watch-state update + up-next lookup, shared by both
 * playback paths' exit handling (feedback/055's fix, now with a second
 * caller): reportPlaybackStopped is fire-and-forget and nothing re-fetches
 * the library afterwards, so without this the Movie object the store already
 * holds a reference to never learns it was watched this session. Only a
 * natural end counts as "watched" — backing out (or quitting mpv) early
 * shouldn't bump play count, reorder PREVIOUSLY VIEWED, or roll into the next
 * episode.
 */
export function markWatchedAndFindNext(
  movie: Movie,
  endedNaturally: boolean,
  queue: SeriesQueue | null,
  playbackId: string,
  restock: () => void
): Episode | null {
  if (!endedNaturally) return null;
  movie.played = true;
  movie.playCount = (movie.playCount ?? 0) + 1;
  movie.lastPlayedDate = new Date().toISOString();
  restock();
  return nextEpisodeInQueue(queue, movie, playbackId);
}

/**
 * Settings ▸ Playback's audio-language and default-captions preferences,
 * translated to mpv launch args. mpv opens the raw local file directly (no
 * Jellyfin MediaStreams list to pick an index from, unlike the in-app HLS
 * path's track picker), so a language preference goes straight through as an
 * ffmpeg-style language code; "captions off" is the more precise --sid=no
 * rather than an empty --slang, which would just leave mpv's own default
 * subtitle selection in charge.
 *
 * settings.ts is imported lazily (rather than at module scope) so this file
 * stays loadable by tests/playback-flow.test.ts under `node --test`'s
 * type-stripping loader — settings.ts pulls in a much larger, DOM/scene-heavy
 * import graph than the rest of this module needs.
 */
export interface MpvPrefArgs {
  alang?: string;
  slang?: string;
  subsOff?: boolean;
}

export async function resolveMpvPrefArgs(): Promise<MpvPrefArgs> {
  const { getSetting } = await import('./settings.ts');
  const prefLang = String(getSetting<string>('bb_audio_lang') ?? '').trim().toLowerCase();
  const wantSubtitles = getSetting<boolean>('bb_subtitles_default');
  return {
    alang: prefLang || undefined,
    slang: wantSubtitles && prefLang ? prefLang : undefined,
    subsOff: !wantSubtitles,
  };
}

// How close the last known playhead has to land to the item's known runtime
// to count as "played to the end" rather than "quit". mpv reports position on
// a sub-second cadence (see vite.config.ts's BBPOS parsing) but the runtime
// this compares against is Jellyfin's own scanned RunTimeTicks, which can be
// a couple of seconds off a file's real last frame — wide enough to absorb
// that, narrow enough that backing out shortly before the credits never
// misreads as "finished".
const NATURAL_FINISH_TOLERANCE_TICKS = 3 * TICKS_PER_SECOND;

/** Natural end-of-file vs. a user quit for the mpv path, which — unlike the
 *  in-app player's native 'ended' event — has no such signal of its own.
 *  Duration unknown (0) always means "can't tell", never "finished". */
export function isMpvNaturalFinish(positionTicks: number, durationTicks: number): boolean {
  return durationTicks > 0 && durationTicks - positionTicks <= NATURAL_FINISH_TOLERANCE_TICKS;
}

/**
 * Play a title by handing mpv the file on disk, bypassing Jellyfin's streaming
 * path entirely. Only correct when the media, the server and this app are on
 * one machine — but that's this deployment, and it buys three things the
 * webview cannot do at all: genuine HDR output (Chromium has no HDR video
 * path, so it flattens an HDR10 master to SDR no matter how cleanly the file
 * reaches it), the original lossless multichannel audio instead of a stereo
 * AAC downmix, and seeking that doesn't wait on a server.
 *
 * It also stops Jellyfin writing the film to disk as HLS segments while you
 * watch — ~70 GB for a 4K remux — which it only ever did because the webview
 * can't demux Matroska.
 *
 * Returns false when the local endpoint isn't reachable (production bundle,
 * no dev/preview server) so the caller can fall back to in-app streaming.
 */
export async function playLocalWithMpv(
  filePath: string,
  itemId: string,
  startPositionTicks: number,
  durationTicks: number,
  prefs: MpvPrefArgs,
  onExit: (positionTicks: number, endedNaturally: boolean) => void,
  log: (msg: string) => void
): Promise<boolean> {
  const jellyfinUrl = localStorage.getItem('jellyfin_url');
  const token = localStorage.getItem('jellyfin_token');
  const startSeconds = Math.max(0, Math.floor(startPositionTicks / TICKS_PER_SECOND));

  let id: string;
  try {
    const res = await fetch('/__play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, startSeconds, ...prefs }),
    });
    if (!res.ok) {
      log(`[Video] Local player refused the file (${res.status}); streaming instead.`);
      return false;
    }
    id = (await res.json()).id;
  } catch {
    // No endpoint (production bundle) — caller falls back to the in-app player.
    return false;
  }

  log(`[Video] Playing off disk in mpv (from ${startSeconds}s).`);
  if (jellyfinUrl && token) reportPlaybackStart(jellyfinUrl, token, itemId);

  // Poll for position so Continue Watching still tracks, and so closing mpv
  // returns to the store the same way the in-app player's Back does.
  let lastTicks = startPositionTicks;
  const poll = window.setInterval(async () => {
    try {
      const res = await fetch(`/__play?id=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(String(res.status));
      const s = await res.json();
      lastTicks = Math.round((s.position ?? 0) * TICKS_PER_SECOND);
      if (!s.exited) {
        if (jellyfinUrl && token) reportPlaybackProgress(jellyfinUrl, token, itemId, lastTicks, false);
        return;
      }
      window.clearInterval(poll);
      if (s.error) log(`[Video] mpv error: ${s.error}`);
      if (jellyfinUrl && token) reportPlaybackStopped(jellyfinUrl, token, itemId, lastTicks);
      onExit(lastTicks, isMpvNaturalFinish(lastTicks, durationTicks));
    } catch {
      // Endpoint vanished (server restarted) — stop polling rather than spin.
      // Ambiguous exit: never autoplay on a guess.
      window.clearInterval(poll);
      onExit(lastTicks, false);
    }
  }, 5000);
  return true;
}
