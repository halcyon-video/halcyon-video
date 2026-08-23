// Which backend's playback endpoints the player talks to (GH #32).
//
// The catalog went through the provider in 0.5.3, but PLAYBACK did not:
// main.ts still called jellyfin.ts's stream builders and report functions
// directly. That was harmless while Jellyfin was the only backend and became a
// real bug the moment Plex landed — a Plex install browsed fine and then built
// `/Videos/<id>/stream` URLs against a server that has no such route, so
// pressing play did nothing and no resume point was ever written.
//
// This module is the seam, and its URL builders come in two shapes: the
// player rebuilds its stream URL inside a user-gesture chain (`buildStream`)
// and inside track-switch callbacks, and awaiting there would sever the
// gesture and trip autoplay policy — that path uses the SYNCHRONOUS builders
// (transcodeStreamUrlSync, directStreamUrl). Everywhere else (the player's
// INITIAL stream build, which already awaits several things before it;
// MediaSourceProvider.resolvePlaybackSource, async because a backend may have
// to probe) can afford to await, which transcodeStreamUrl does on Plex to
// run the /decision pre-flight PMS 1.43 requires before start.m3u8 (#76) —
// see plex.ts's preflightPlexTranscodeDecision.
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
  preflightPlexTranscodeDecision,
  fetchPlexItemPlaybackInfo,
  reportPlexPlaybackProgress,
  reportPlexPlaybackStopped,
} from './plex.ts';
import { isDirectPlaySafe as codecsAreDirectPlaySafe } from './playback-capability.ts';
import type { MediaPlaybackInfo } from './providers/media-source-provider.ts';

// WHICH backend's endpoint shapes to use. `kind` names the source being
// addressed (GH #84): a store can be stocked from a Jellyfin box and a Plex box
// at once, so the install-wide provider_kind is only the right answer for the
// primary one — reading it for every title is how a second, different backend
// would get Jellyfin-shaped URLs pointed at it, the same failure #66 fixed.
// Falls back to the install-wide kind, so every single-backend store behaves
// exactly as before.
const isPlex = (kind?: string) => (kind ?? activeProviderKind()) === 'plex';

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
export function playbackIsDirectSafe(
  info: MediaPlaybackInfo | undefined | null,
  kind?: string
): boolean {
  if (isPlex(kind)) return false;
  return codecsAreDirectPlaySafe(info);
}

/** The untouched-file URL. Only ever consulted when playbackIsDirectSafe(). */
export function directStreamUrl(
  server: string,
  token: string,
  itemId: string,
  mediaSourceId?: string,
  kind?: string
): string {
  if (isPlex(kind)) {
    // Unreachable while playbackIsDirectSafe() is false for Plex; kept correct
    // rather than throwing, so a future direct path can't silently serve a
    // Jellyfin URL.
    return buildPlexHlsStreamUrl(server, token, itemId, { mediaSourceId }).url;
  }
  return buildStaticStreamUrl(server, token, itemId, mediaSourceId);
}

/**
 * The transcode/HLS URL, fully resolved: on Plex this AWAITS the /decision
 * pre-flight PMS 1.43 needs before it will answer start.m3u8 with 200
 * instead of a bare 400 (issue #76) — see preflightPlexTranscodeDecision.
 * Safe anywhere the caller isn't inside a user-gesture chain, i.e. the
 * player's INITIAL stream build (main.ts already awaits several things
 * before that point). For the mid-playback track/quality switch, which
 * can't await (see this module's header comment), use
 * transcodeStreamUrlSync below instead.
 */
export async function transcodeStreamUrl(
  server: string,
  token: string,
  itemId: string,
  opts: StreamUrlOptions,
  kind?: string
): Promise<string> {
  if (isPlex(kind)) {
    // Plex selects audio/subtitle tracks through its own transcode-decision
    // parameters rather than the stream indices Jellyfin takes; the picker's
    // per-track switching is Jellyfin-only for now (see the README note).
    const sessionId = `halcyon-${Date.now().toString(36)}`;
    const plexOpts = {
      maxBitrate: opts.maxBitrate,
      startPositionTicks: opts.startPositionTicks,
      mediaSourceId: opts.mediaSourceId,
      sessionId,
    };
    await preflightPlexTranscodeDecision(server, token, itemId, sessionId, plexOpts);
    return buildPlexHlsStreamUrl(server, token, itemId, plexOpts).url;
  }
  return buildHlsStreamUrl(server, token, itemId, opts);
}

/**
 * Same URL transcodeStreamUrl would build, but SYNCHRONOUS — for the two
 * call sites that can't await: the player's buildStream callback and
 * track-switch handlers (see this module's header comment; video-player.ts's
 * applyStreamSelection calls this inside a click/key handler and immediately
 * calls video.play()). On Plex the /decision pre-flight is fired with the
 * identical params and session id but NOT awaited — best-effort. A lost race
 * falls through to hls.js's own fatal-error recovery ladder in
 * video-player.ts (the same ladder any other transient HLS hiccup hits),
 * rather than leaving the switch with no pre-flight at all.
 */
export function transcodeStreamUrlSync(
  server: string,
  token: string,
  itemId: string,
  opts: StreamUrlOptions,
  kind?: string
): string {
  if (isPlex(kind)) {
    const sessionId = `halcyon-${Date.now().toString(36)}`;
    const plexOpts = {
      maxBitrate: opts.maxBitrate,
      startPositionTicks: opts.startPositionTicks,
      mediaSourceId: opts.mediaSourceId,
      sessionId,
    };
    void preflightPlexTranscodeDecision(server, token, itemId, sessionId, plexOpts).catch((e) => {
      console.warn('[Plex] transcode decision pre-flight failed (mid-playback switch):', e);
    });
    return buildPlexHlsStreamUrl(server, token, itemId, plexOpts).url;
  }
  return buildHlsStreamUrl(server, token, itemId, opts);
}

/** Codec/container probe for an item the catalog didn't carry one for. */
export async function probeItemPlaybackInfo(
  server: string,
  token: string,
  userId: string,
  itemId: string,
  kind?: string
): Promise<MediaPlaybackInfo | undefined> {
  if (isPlex(kind)) {
    return (await fetchPlexItemPlaybackInfo(server, token, itemId)).info;
  }
  return fetchItemPlaybackInfo(server, token, userId, itemId);
}

export function playbackStarted(server: string, token: string, itemId: string, kind?: string): void {
  // Plex has no "started" write outside a timeline session; its first progress
  // ping is what registers the play. See plex.ts's note on /:/timeline.
  if (isPlex(kind)) return;
  void reportPlaybackStart(server, token, itemId);
}

export function playbackProgressed(
  server: string,
  token: string,
  itemId: string,
  positionTicks: number,
  isPaused: boolean,
  kind?: string
): void {
  if (isPlex(kind)) {
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
  runTimeTicks?: number,
  kind?: string
): void {
  if (isPlex(kind)) {
    void reportPlexPlaybackStopped(server, token, itemId, positionTicks, runTimeTicks);
    return;
  }
  void reportPlaybackStopped(server, token, itemId, positionTicks);
}
