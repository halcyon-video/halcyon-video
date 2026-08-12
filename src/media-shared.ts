// Media logic that is NOT a property of any one server: duplicate-version
// collapsing, direct-play safety, and the collection side-tables. All of it
// used to live in jellyfin.ts; it moved here when plex.ts arrived, because
// every piece below reasons about the STORE's domain model (Movie,
// MediaPlaybackInfo) or about THIS WEBVIEW's decoding ability — neither of
// which changes with the server on the other end.
//
// jellyfin.ts re-exports the public names, so existing importers are
// unaffected. New code should import from here.
import type { Movie, MovieVersion, MediaPlaybackInfo, MediaStreamInfo } from './media-types.ts';

// ─── Quality labelling ────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/** Resolution bucket name — width AND height checked so scope (1920x800) and
 *  4:3 (1440x1080) content both land in the right bucket. */
export function qualityTag(width?: number, height?: number): string | undefined {
  const w = width ?? 0;
  const h = height ?? 0;
  if (w >= 3200 || h >= 2000) return "4K";
  if (w >= 1800 || h >= 1030) return "1080p";
  if (w >= 1150 || h >= 690) return "720p";
  if (w > 0 || h > 0) return "SD";
  return undefined;
}

/** Whether a frame size counts as 4K for the case's 4K sticker. Shared so both
 *  backends agree on the threshold even though they learn the size differently
 *  (Jellyfin: per-source Width/Height; Plex: Media.videoResolution === '4k',
 *  which it cross-checks against this). */
export function is4kFrame(width?: number, height?: number): boolean {
  return (width ?? 0) >= 3200 || (height ?? 0) >= 2000;
}

// ─── Duplicate-version collapsing ─────────────────────────────────────────────

// Trailing resolution/format markers stripped when matching duplicate items of
// the same film ("Heat (4K)" and "Heat" are one movie). Only quality markers —
// cut markers (Extended, Director's Cut) are left alone: those are genuinely
// different films content-wise and keep their own shelf box.
const RES_MARKER_RE =
  /[\s\-–·]*[[({]?\s*\b(4k|uhd|2160p|1440p|1080[pi]|720p|480p|576p|hdr10\+?|hdr|dolby\s*vision|dv|remux|blu-?ray|web-?(dl|rip)|x26[45]|h\.?26[45]|hevc|av1)\b\s*[\])}]?\s*$/i;

function versionGroupKey(m: Movie): string {
  let t = m.title.toLowerCase().trim();
  for (;;) {
    const stripped = t.replace(RES_MARKER_RE, "").trim();
    if (stripped === t || stripped.length === 0) break;
    t = stripped;
  }
  return `${t}|${m.year}`;
}

/** Best-first version order: bigger frame wins; 16:9-normalized so a width-only
 *  entry still ranks against a height-only one. */
function versionRank(v: MovieVersion): number {
  return Math.max(v.width ?? 0, ((v.height ?? 0) * 16) / 9, v.is4k ? 3840 : 0);
}

/** Sort/dedupe a movie's accumulated versions; below 2 real choices the array
 *  is dropped entirely so single-file movies stay exactly as before. */
function finalizeVersions(m: Movie): void {
  if (!m.versions || m.versions.length < 2) {
    m.versions = undefined;
    return;
  }
  const seen = new Set<string>();
  const versions = m.versions.filter((v) => {
    const key = `${v.itemId}|${v.mediaSourceId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (versions.length < 2) {
    m.versions = undefined;
    return;
  }
  versions.sort((a, b) => versionRank(b) - versionRank(a));
  m.versions = versions;
  // The single remaining box advertises the best available quality.
  if (versions.some((v) => v.is4k)) m.is4k = true;
}

/**
 * Collapse duplicate entries of the same film (same normalized title + year)
 * into ONE shelf box carrying every quality as a Movie.version — the fix for
 * a 4K and a 1080p rip of one movie standing side by side on the shelf. The
 * first-seen entry keeps the shelf spot and its metadata/poster; extra
 * entries contribute their versions and disappear from the catalog. Series,
 * games, and synthesized (discovery/coming-soon) entries never collapse.
 *
 * Both backends run this over their mapped catalog, and both need it for the
 * same reason: a server that ingested a 4K rip and a 1080p rip as separate
 * items has no idea they are one film. (An item whose versions were merged
 * SERVER-side arrives as one item with several sources and is already handled
 * by the backend's own version builder.)
 */
export function collapseDuplicateVersions(movies: Movie[], context: string): Movie[] {
  const byKey = new Map<string, Movie>();
  const out: Movie[] = [];
  let collapsed = 0;
  for (const m of movies) {
    if (m.isSeries || m.game || m.discovery || m.comingSoon || m.collectionGap) {
      out.push(m);
      continue;
    }
    const prior = byKey.get(versionGroupKey(m));
    if (!prior) {
      byKey.set(versionGroupKey(m), m);
      out.push(m);
      continue;
    }
    prior.versions = [...(prior.versions ?? []), ...(m.versions ?? [])];
    collapsed++;
  }
  for (const m of out) finalizeVersions(m);
  if (collapsed > 0) {
    console.info(`[Catalog] ${context}: collapsed ${collapsed} duplicate quality version(s) into their main title.`);
  }
  return out;
}

// ─── Collection side-tables ───────────────────────────────────────────────────

/**
 * Artwork for the collections that survived the version-pair filter, keyed by
 * collection name (the same key `Movie.collectionName` carries). Read by the
 * four-sided collection displays to build their signage. Empty when running
 * against the synthetic harness library, in which case the signs fall back to
 * a member title's backdrop.
 *
 * Filled by whichever backend synced last: jellyfin.ts walks each BoxSet's
 * children (membership isn't on the item in a list query); plex.ts reads the
 * section's own collection listing, since Plex tags membership on the item.
 */
export const collectionArt = new Map<string, { posterUrl?: string; backdropUrl?: string }>();

/**
 * Collection name -> TMDB *collection* id. This is the only bridge from a
 * server-side collection (which knows only what's on disk) to the collection's
 * full member list, so it's what lets fetchCollectionGaps work out which
 * entries are missing. Empty for collections the user assembled by hand (no
 * TMDB collection id) and in the synthetic harness library — those collections
 * simply show no gaps.
 */
export const collectionTmdbIds = new Map<string, number>();

/**
 * Counts from the last membership sync, for the boot console's collection-gap
 * status line. A backend can't call main.ts's logToConsole (circular), so it
 * records what it saw and main.ts does the talking.
 */
export const collectionSyncStats = { boxSets: 0, scraped: 0, rejectedVersionPairs: 0 };

/** Wipe the side-tables before a fresh sync, so a re-sync (or a switch to the
 *  other backend) never leaves a previous server's collections standing. */
export function resetCollectionState(): void {
  collectionArt.clear();
  collectionTmdbIds.clear();
  collectionSyncStats.boxSets = 0;
  collectionSyncStats.scraped = 0;
  collectionSyncStats.rejectedVersionPairs = 0;
}

// ─── Subtitle delivery ────────────────────────────────────────────────────────

/**
 * Subtitle codecs that are TEXT, and can therefore be fetched as a WebVTT
 * sidecar and rendered by the browser over the video. Everything else — PGS,
 * DVD, DVB, XSUB — is a bitmap the browser cannot draw, so it still has to be
 * burned into the picture server-side (see pickSubtitleDelivery).
 *
 * Both servers report the ffmpeg codec name, which is why both spellings of the
 * common ones are here (`subrip`/`srt`, `ssa`/`ass`); `mov_text` is the MP4
 * flavour and `webvtt`/`vtt` are already what we're asking for.
 */
const TEXT_SUBTITLE_CODECS = new Set([
  'subrip', 'srt', 'ass', 'ssa', 'mov_text', 'webvtt', 'vtt', 'text', 'subviewer', 'microdvd',
]);

/** Is this subtitle stream text (client-renderable) rather than a bitmap? */
export function isTextSubtitleCodec(codec: string | undefined): boolean {
  return !!codec && TEXT_SUBTITLE_CODECS.has(codec.toLowerCase());
}

/**
 * How a chosen subtitle track should be delivered.
 *
 * This is the whole point of the client-side subtitle work: asking the server
 * to burn subtitles in (`SubtitleMethod=Encode`) forces a full video re-encode,
 * so on the browser/Remote Play path merely defaulting captions ON turned every
 * direct-playable file into a transcode. A text track costs the server nothing
 * — it's a sidecar fetch — and switching or disabling it needs no new stream
 * at all. Bitmap subtitles have no client renderer, so they keep the old path
 * and pay the old price.
 */
export type SubtitleDelivery =
  | { kind: 'none' }
  | { kind: 'text'; streamIndex: number }
  | { kind: 'burn-in'; streamIndex: number };

export function pickSubtitleDelivery(
  streams: MediaStreamInfo[] | undefined,
  streamIndex: number | undefined,
): SubtitleDelivery {
  if (streamIndex === undefined) return { kind: 'none' };
  const stream = streams?.find((s) => s.type === 'Subtitle' && s.index === streamIndex);
  // Unknown stream, or a server that didn't report a codec: assume text and
  // try the cheap path. The two failure modes are not symmetric — a sidecar
  // that 404s costs one failed request and leaves the film playing, while a
  // needless burn-in costs a re-encode of the entire runtime.
  if (!stream || stream.codec === undefined) return { kind: 'text', streamIndex };
  return isTextSubtitleCodec(stream.codec)
    ? { kind: 'text', streamIndex }
    : { kind: 'burn-in', streamIndex };
}


// ─── Direct-play safety ───────────────────────────────────────────────────────

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
const HEVC_MAIN_SUPPORTED = mseSupports('video/mp4; codecs="hvc1.1.6.L153.B0"');
const HEVC_MAIN10_SUPPORTED = mseSupports('video/mp4; codecs="hvc1.2.4.L153.B0"');

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

/** Whether the webview decodes 10-bit HEVC — backends cap bit depth when not. */
export function isHevcMain10Supported(): boolean {
  return HEVC_MAIN10_SUPPORTED;
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

// ─── Transcode bitrate ceilings ───────────────────────────────────────────────

// Default video bitrate ceiling (bits/s) for the "Auto" HLS stream. This is
// NOT a bandwidth limit (the server is on the LAN) — it's a MEMORY limit for
// the client's MSE SourceBuffer. hls.js buffers ~60-80s ahead regardless of
// its maxBufferLength/maxBufferSize knobs (verified — it ignores them on a
// fast VOD source), and the Chromium/Brave webview caps a single video
// SourceBuffer at ~250 MB. A 38.5 Mbps Blu-ray remux stream-copied verbatim
// therefore overflows that cap ~35-40s in: hls.js flush-evicts the buffer,
// punches a hole right in front of the playhead, and playback FREEZES (the
// "freezes at ~39s" bug, reproduced in Brave). Capping at 20 Mbps keeps
// ~80s of buffer near ~200 MB, which Brave evicts cleanly with zero stalls
// (measured). A server stream-copies sources already under this ceiling and
// re-encodes heavier remuxes down to it (cheap on the box's QSV/VAAPI); it
// clamps the encode target to the source bitrate, so this never inflates
// output. 1080p H.264 at 20 Mbps is visually near-transparent.
export const DEFAULT_VIDEO_BITRATE = 20_000_000;

// Ceiling sent when the source video is being STREAM-COPIED. A server only
// copies when source bitrate <= requested bitrate, so the 20 Mbps re-encode
// ceiling above silently forced every 4K remux (94 Mbps for a typical 4K
// title) into a full re-encode — which also drags in a downscale AND, because
// HDR tonemapping doesn't engage on every box's decode pipeline, a bt709
// relabel that ships PQ / BT.2020 pixels tagged as Rec.709. That mislabel is
// what makes 4K HDR titles look washed out. Copying sidesteps all three: the
// bitstream is untouched, so resolution and HDR metadata arrive as mastered.
//
// The copy path's real constraint is MEMORY, not bandwidth (LAN server): see
// HLS_COPY_BUFFER in video-player.ts, which shrinks hls.js's buffer so a
// 94 Mbps stream stays under Brave's ~250 MB SourceBuffer cap. Keep the two in
// sync — raising this without shrinking that reintroduces the freeze-at-~39s
// eviction bug.
export const COPY_VIDEO_BITRATE = 200_000_000;
