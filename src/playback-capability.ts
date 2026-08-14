// What THIS CLIENT can decode — the webview's limits, not any server's.
//
// Extracted from jellyfin.ts when the Plex backend landed (GH #32): every
// statement here is about WebKitGTK/MSE, so a second backend needing the same
// direct-play-vs-transcode decision was the proof it never belonged to one
// server product. jellyfin.ts re-exports the two public functions, so its
// existing importers did not move.
import type { MediaPlaybackInfo } from './providers/media-source-provider';

/** MediaSource.isTypeSupported, guarded for non-browser contexts. */
function mseSupports(mime: string): boolean {
  try {
    return typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(mime);
  } catch {
    return false;
  }
}

// Whether this webview's MSE can decode HEVC, probed once at module load.
// hvc1.1.6.* = Main (8-bit), hvc1.2.4.* = Main 10 — movie remuxes (and anime
// especially) are typically 10-bit. When the webview can decode HEVC, HLS
// requests list it as an allowed codec so the server STREAM-COPIES the video
// instead of re-encoding it to H.264 — a cheap remux (audio-only transcode)
// instead of a full ffmpeg video transcode.
export const HEVC_MAIN_SUPPORTED = mseSupports('video/mp4; codecs="hvc1.1.6.L153.B0"');
export const HEVC_MAIN10_SUPPORTED = mseSupports('video/mp4; codecs="hvc1.2.4.L153.B0"');

const DIRECT_PLAY_SAFE_CONTAINERS = new Set(['mp4', 'm4v', 'mov', 'webm']);
const DIRECT_PLAY_SAFE_VIDEO_CODECS = new Set(['h264', 'vp8', 'vp9', 'av1']);
// HEVC direct play only when Main 10 decodes too: MediaPlaybackInfo doesn't
// carry bit depth, so we can't tell an 8-bit file from a 10-bit one here.
if (HEVC_MAIN10_SUPPORTED) {
  DIRECT_PLAY_SAFE_VIDEO_CODECS.add('hevc');
  DIRECT_PLAY_SAFE_VIDEO_CODECS.add('h265');
}
const DIRECT_PLAY_SAFE_AUDIO_CODECS = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac']);

/** Whether HLS requests allow HEVC stream copy (webview MSE decodes HEVC). */
export function isHevcPassThroughEnabled(): boolean {
  return HEVC_MAIN_SUPPORTED;
}

/**
 * True only when the item's container, video codec, and every audio codec are
 * all in WebKitGTK's known-safe allowlist — i.e. safe to try the raw
 * direct-file URL. WebKitGTK silently DROPS audio tracks whose codec isn't in
 * its allowlist (AC3/EAC3/DTS are typical movie-rip audio) regardless of
 * installed GStreamer decoders, with no error firing to trigger the normal
 * direct→HLS fallback — so anything missing or unrecognized must default to
 * NOT safe rather than risk silent audio. MKV is deliberately excluded even
 * when its codecs are otherwise fine: WebKit's range-seeking on Matroska is
 * what makes scrubbing take ages; HLS transcode seeks in ~2s by comparison.
 */
export function isDirectPlaySafe(info: MediaPlaybackInfo | undefined | null): boolean {
  if (!info) return false;
  const { container, videoCodec, audioCodecs } = info;
  if (!container || !DIRECT_PLAY_SAFE_CONTAINERS.has(container)) return false;
  if (!videoCodec || !DIRECT_PLAY_SAFE_VIDEO_CODECS.has(videoCodec)) return false;
  if (!audioCodecs || audioCodecs.length === 0) return false;
  return audioCodecs.every((c) => DIRECT_PLAY_SAFE_AUDIO_CODECS.has(c));
}
