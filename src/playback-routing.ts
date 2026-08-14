// Which backend's playback endpoints the player talks to (GH #32).
//
// The catalog went through the provider in 0.5.3, but PLAYBACK did not:
// main.ts still called jellyfin.ts's stream builders and report functions
// directly. That was harmless while Jellyfin was the only backend and became a
// real bug the moment Plex landed — a Plex install browsed fine and then built
// `/Videos/<id>/stream` URLs against a server that has no such route, so
// pressing play did nothing and no resume point was ever written.
//
// This module is the seam, deliberately SYNCHRONOUS for the URL builders: the
// player rebuilds its stream URL inside a user-gesture chain (`buildStream`)
// and inside track-switch callbacks, and awaiting there would sever the gesture
// and trip autoplay policy. MediaSourceProvider.resolvePlaybackSource is async
// because a backend may have to probe, so it is the wrong shape for those call
// sites; the per-backend sync builders are what this routes to.
//
// Jellyfin's path is byte-identical to what it was — same functions, same
// arguments, same order.
import { activeProviderKind } from './providers/provider-registry.ts';
import {
  buildStaticStreamUrl,
  buildHlsStreamUrl,
  fetchItemPlaybackInfo,
  reportPlaybackStart,
  reportPlaybackProgress,
  reportPlaybackStopped,
} from './jellyfin.ts';
import {
  buildPlexHlsStreamUrl,
  fetchPlexItemPlaybackInfo,
  reportPlexPlaybackProgress,
  reportPlexPlaybackStopped,
} from './plex.ts';
import { isDirectPlaySafe as codecsAreDirectPlaySafe } from './playback-capability.ts';
import type { MediaPlaybackInfo } from './providers/media-source-provider.ts';

const isPlex = () => activeProviderKind() === 'plex';

export interface StreamUrlOptions {
  sourceVideoCodec?: string;
  mediaSourceId?: string;
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
  startPositionTicks?: number;
  maxBitrate?: number;
  maxWidth?: number;
}

/**
 * Whether the raw file is safe to hand the webview.
 *
 * Always FALSE on Plex, and not because Plex can't direct-play: its direct URL
 * is addressed by a Part key that only a per-item metadata request returns, and
 * this decision is made synchronously with nothing but the item's codecs in
 * hand. Plex's `directStream=1` transcode stream-copies a compatible file
 * anyway, so the cost of routing every Plex title through it is a remux at
 * worst, not a re-encode — the wrong trade would be blocking the gesture chain
 * on a probe to save it.
 */
export function playbackIsDirectSafe(info: MediaPlaybackInfo | undefined | null): boolean {
  if (isPlex()) return false;
  return codecsAreDirectPlaySafe(info);
}

/** The untouched-file URL. Only ever consulted when playbackIsDirectSafe(). */
export function directStreamUrl(
  server: string,
  token: string,
  itemId: string,
  mediaSourceId?: string
): string {
  if (isPlex()) {
    // Unreachable while playbackIsDirectSafe() is false for Plex; kept correct
    // rather than throwing, so a future direct path can't silently serve a
    // Jellyfin URL.
    return buildPlexHlsStreamUrl(server, token, itemId, { mediaSourceId }).url;
  }
  return buildStaticStreamUrl(server, token, itemId, mediaSourceId);
}

/** The transcode/HLS URL. */
export function transcodeStreamUrl(
  server: string,
  token: string,
  itemId: string,
  opts: StreamUrlOptions
): string {
  if (isPlex()) {
    // Plex selects audio/subtitle tracks through its own transcode-decision
    // parameters rather than the stream indices Jellyfin takes; the picker's
    // per-track switching is Jellyfin-only for now (see the README note).
    return buildPlexHlsStreamUrl(server, token, itemId, {
      maxBitrate: opts.maxBitrate,
      startPositionTicks: opts.startPositionTicks,
      mediaSourceId: opts.mediaSourceId,
    }).url;
  }
  return buildHlsStreamUrl(server, token, itemId, opts);
}

/** Codec/container probe for an item the catalog didn't carry one for. */
export async function probeItemPlaybackInfo(
  server: string,
  token: string,
  userId: string,
  itemId: string
): Promise<MediaPlaybackInfo | undefined> {
  if (isPlex()) {
    return (await fetchPlexItemPlaybackInfo(server, token, itemId)).info;
  }
  return fetchItemPlaybackInfo(server, token, userId, itemId);
}

export function playbackStarted(server: string, token: string, itemId: string): void {
  // Plex has no "started" write outside a timeline session; its first progress
  // ping is what registers the play. See plex.ts's note on /:/timeline.
  if (isPlex()) return;
  void reportPlaybackStart(server, token, itemId);
}

export function playbackProgressed(
  server: string,
  token: string,
  itemId: string,
  positionTicks: number,
  isPaused: boolean
): void {
  if (isPlex()) {
    void reportPlexPlaybackProgress(server, token, itemId, positionTicks);
    return;
  }
  void reportPlaybackProgress(server, token, itemId, positionTicks, isPaused);
}

export function playbackStopped(
  server: string,
  token: string,
  itemId: string,
  positionTicks: number,
  runTimeTicks?: number
): void {
  if (isPlex()) {
    void reportPlexPlaybackStopped(server, token, itemId, positionTicks, runTimeTicks);
    return;
  }
  void reportPlaybackStopped(server, token, itemId, positionTicks);
}
