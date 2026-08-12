import type Hls from 'hls.js';
import { stopActiveEncoding, getLastHlsPlaySessionId, isStreamCopyUrl } from './media-backend.ts';

let HlsMod: typeof import('hls.js').default | null = null;
async function loadHls() {
  HlsMod ??= (await import('hls.js')).default;
  return HlsMod;
}

// Jellyfin rejects any SEGMENT request whose query carries StartTimeTicks
// ("StartTimeTicks is not allowed", ArgumentException in GetDynamicSegment).
// When a stream is built at a resume/seek position, the media playlist's
// segment URIs (and the fMP4 EXT-X-MAP init URI) inherit the playlist
// request's query verbatim — so every fetch hls.js makes gets rejected and
// playback dies in a silent retry loop ("buffering forever"). StartTimeTicks
// is a playlist-level parameter (it tells the server where to start the
// transcode job); segments are addressed purely by index, so dropping it from
// segment fetches is always safe. Playlist (.m3u8) requests keep it.
let segmentFixLoader: unknown = null;
// Matches /hls1/<name>/<segmentIndex>.<container> — including the fMP4 init
// segment, which Jellyfin addresses as index -1.
const HLS_SEGMENT_PATH = /\/hls1\/[^/]+\/-?\d+\.[a-z0-9]+$/i;
function getSegmentFixLoader(HlsClass: typeof import('hls.js').default): unknown {
  if (segmentFixLoader) return segmentFixLoader;
  const Base = HlsClass.DefaultConfig.loader as new (...args: any[]) => any;
  segmentFixLoader = class extends Base {
    load(context: any, config: any, callbacks: any) {
      if (typeof context?.url === 'string') {
        try {
          const u = new URL(context.url);
          if (HLS_SEGMENT_PATH.test(u.pathname) && u.searchParams.has('StartTimeTicks')) {
            u.searchParams.delete('StartTimeTicks');
            context.url = u.toString();
          }
        } catch {
          // Not an absolute URL — leave it untouched.
        }
      }
      super.load(context, config, callbacks);
    }
  };
  return segmentFixLoader;
}

const TICKS_PER_SECOND = 10_000_000;
const CONTROLS_HIDE_MS = 3500;
const PROGRESS_REPORT_MS = 5000;

// Stall watchdog cadence and escalation ladder (see stallTimer). The first
// threshold has to clear a normal rebuffer on a slow transcode without firing,
// hence 8s rather than something twitchier; each rung then gets more invasive.
const STALL_POLL_MS = 1000;
const STALL_NUDGE_MS = 8000;    // seek past a buffer hole / kick the loader
const STALL_RELOAD_MS = 16000;  // reload the same source at the same position
const STALL_GIVEUP_MS = 28000;  // abandon this source (→ next source → mpv)
// Playhead progress that counts as "this stream is genuinely healthy again",
// clearing the recovery budget.
const STALL_RECOVERY_CLEAR_SECONDS = 10;
// How long a pending stream-swap may hold seeks hostage before seekTo stops
// trusting it (see pendingLocalSeekSetAtMs). Comfortably longer than a healthy
// same-URL reload, shorter than a user's patience.
const PENDING_SEEK_MAX_MS = 20000;

export interface TrackChoice {
  /** Jellyfin MediaStream index. */
  index: number;
  label: string;
}

export interface StreamSelection {
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
  maxBitrate?: number;
  maxWidth?: number;
  /** Absolute item position (ticks) the rebuilt stream should start at. */
  startPositionTicks?: number;
}

export interface VideoPlayerOptions {
  /** Transcoded HLS master playlist — the fallback that plays any format,
   *  at the cost of server-side transcoding. */
  hlsSrc: string;
  /** Direct file stream — tried first so the server doesn't transcode files
   *  the webview can already decode (e.g. H.264/AAC MP4). */
  staticSrc: string;
  /** Whether the item's container/video codec/every audio codec are all
   *  within WebKitGTK's known-safe allowlist (see isDirectPlaySafe in
   *  jellyfin.ts), computed by the caller BEFORE playback starts. When false,
   *  staticSrc is skipped entirely and only the HLS transcode is tried:
   *  WebKitGTK silently DROPS audio tracks whose codec isn't in its allowlist
   *  (AC3/EAC3/DTS, typical movie-rip audio) with no error, so the normal
   *  direct→HLS error fallback below never gets a chance to fire. */
  directPlayable: boolean;
  /** One-line container/codec summary logged at open(), e.g.
   *  "container=mkv video=h264 audio=ac3". Never contains tokens/URLs. */
  mediaInfoSummary: string;
  /** Title shown in the control bar. */
  title: string;
  /** Where to resume from, in Jellyfin ticks (1s = 10,000,000). */
  startPositionTicks?: number;
  /** Audio tracks selectable in the picker (from the item's MediaStreams). */
  audioTracks?: TrackChoice[];
  /** Subtitle tracks selectable in the picker. */
  subtitleTracks?: TrackChoice[];
  /** WebVTT sidecar for the initially-selected subtitle, when it's a text
   *  track. Hung on the <video> as a <track>, so the server never re-encodes
   *  the film just to show captions. */
  subtitleTrackUrl?: string;
  /** Ask how a newly-picked subtitle should be delivered: a URL means text
   *  (swap the sidecar, keep playing), null means bitmap (only a burned-in
   *  re-encode can render it, so rebuild the stream the old way). */
  buildSubtitleTrack?: (streamIndex: number) => string | null;
  /** Initial audio MediaStream index (Settings ▸ Playback language pref).
   *  Pre-selects the picker row and rides along on every stream rebuild.
   *  The caller bakes it into the initial hlsSrc itself. */
  defaultAudioIndex?: number;
  /** Initial subtitle MediaStream index when captions default on (burned in
   *  server-side, so the caller also forces the HLS path + initial URL). */
  defaultSubtitleIndex?: number;
  /** Captions-on-by-default for the DIRECT-play path: show the first native
   *  text track (if the container carries one) instead of starting hidden. */
  subtitlesDefaultOn?: boolean;
  /** Rebuild the HLS URL for a new track/quality selection. When provided,
   *  the quality/audio/subtitle picker button appears; the player reloads the
   *  returned URL at the current position. */
  buildStream?: (sel: StreamSelection) => string;
  /** T23 diegetic mode: hide the fullscreen <video> surface and make the
   *  overlay transparent so only the control bars float over the 3D scene —
   *  the picture is presented elsewhere (the back room CRT samples this
   *  player's <video> into a VideoTexture; see BackRoom.attachVideo). */
  hideVideoSurface?: boolean;
  /** Ask "are you sure?" before a USER-initiated exit (Back button/key).
   *  Set for non-diegetic playback, where closing tears the session down and
   *  drops the viewer back at the store entrance — a stray Back press meant
   *  to dismiss the on-screen controls shouldn't cost them their spot in the
   *  movie. Natural end-of-video and fatal errors always close directly. */
  confirmExit?: boolean;
  /** Fired when the user backs out or the video ends. `endedNaturally` is true
   *  only when playback ran to the end of the stream, which is what lets a
   *  series roll into its next episode instead of returning to the store. */
  onClose: (positionTicks: number, endedNaturally: boolean) => void;
  /** Periodic + on pause/seek position updates (drives Continue Watching). */
  onProgress?: (positionTicks: number, isPaused: boolean) => void;
  /** Both HLS and the direct stream failed to play in-app. */
  onFatalError?: () => void;
  /** Optional diagnostic narration, wired to the in-app console (main.ts's
   *  logToConsole). Every line is prefixed `[Player]`. Never pass through
   *  URLs' api_key/token/PlaySessionId — log the params that matter instead. */
  log?: (msg: string) => void;
}

// Bitrate/resolution ladder for the picker's QUALITY group. "Auto" is the
// full-quality stream: direct play, or a stream copy when the source codec is
// one the webview decodes (COPY_VIDEO_BITRATE in jellyfin.ts lifts the ceiling
// so 4K remuxes are passed through untouched rather than re-encoded), else a
// transcode capped at DEFAULT_VIDEO_BITRATE. The explicit rungs below always
// force a re-encode down to their bitrate — including for sources that would
// otherwise have been copied.
const QUALITY_PRESETS: Array<{ label: string; maxBitrate?: number; maxWidth?: number }> = [
  { label: 'Auto' },
  { label: '1080p · 8 Mbps', maxBitrate: 8_000_000, maxWidth: 1920 },
  { label: '720p · 4 Mbps', maxBitrate: 4_000_000, maxWidth: 1280 },
  { label: '480p · 1.5 Mbps', maxBitrate: 1_500_000, maxWidth: 854 },
];

interface MenuRow {
  kind: 'header' | 'item';
  label: string;
  group?: 'quality' | 'audio' | 'subs';
  /** quality: preset idx; audio/subs: MediaStream index (null = subtitles off). */
  value?: number | null;
}

/**
 * Fullscreen, in-app movie player with streaming-service-style controls
 * (play/pause, scrub bar, ±10s seek, volume, subtitles, fullscreen). It lives
 * entirely inside the app window — no external process — so playback feels
 * like browsing and watching on Netflix rather than handing off to mpv.
 */
export class VideoPlayer {
  private overlay: HTMLElement;
  private video: HTMLVideoElement;
  private titleEl: HTMLElement;
  private mediaStatusEl: HTMLElement;
  private playPauseBtn: HTMLElement;
  private backBtn: HTMLElement;
  private back10Btn: HTMLElement;
  private fwd10Btn: HTMLElement;
  private muteBtn: HTMLElement;
  private volumeSlider: HTMLInputElement;
  private subtitlesBtn: HTMLElement;
  private fullscreenBtn: HTMLElement;
  private progressTrack: HTMLElement;
  private progressFilled: HTMLElement;
  private progressBuffered: HTMLElement;
  private currentTimeEl: HTMLElement;
  private durationEl: HTMLElement;
  private spinner: HTMLElement;

  private hls: Hls | null = null;
  private opts: VideoPlayerOptions | null = null;
  private hideTimer: number | null = null;
  private progressTimer: number | null = null;
  private sources: Array<{ src: string; isHls: boolean }> = [];
  private sourceIndex = 0;
  private _isOpen = false;
  /** Set by the <video> 'ended' listener so close() can tell "the movie
   *  finished" apart from "the user backed out" — see onClose. */
  private endedNaturally = false;
  private activeSubtitleTrack: TextTrack | null = null;
  // The <track> carrying the WebVTT sidecar, when subtitles are delivered as
  // text rather than burned into the video (see setSubtitleSidecar).
  private subtitleTrackEl: HTMLTrackElement | null = null;
  // Subtitle stream index the CURRENT stream has burned into the picture
  // (bitmap tracks only). Non-null means captions are pixels: changing or
  // removing them costs a new stream, which is what the sidecar path avoids.
  private burnedInSubtitleIndex: number | null = null;
  private nativeLoadedMetadataListener: (() => void) | null = null;
  private isHidden = false;
  private preHiddenVolume = 1.0;
  // Remote/keyboard focus: which zone owns the highlight (the scrub bar is
  // the default — left/right seek there, Android-TV style), plus the index
  // within the button row when that zone is active (-1 = nothing focused).
  private focusZone: 'timeline' | 'buttons' = 'timeline';
  private focusIndex = -1;
  // Stop-watching confirmation (see VideoPlayerOptions.confirmExit).
  private exitConfirmEl: HTMLElement;
  private exitConfirmBtns: HTMLElement[];
  private exitConfirmIndex = 1; // default focus = "KEEP WATCHING"
  private hlsRecoveryAttempts = 0;
  // Monotonic id for loadSource() calls. loadSource awaits the hls.js module
  // before touching the media element; a close() or a newer load can land in
  // that gap, and the stale continuation would then attach a second,
  // invisible hls.js instance whose segment requests resurrect the abandoned
  // encode — one of the "doubled stream" paths. Each continuation re-checks
  // it still owns the latest sequence number after the await.
  private loadSeq = 0;

  // The item's true total runtime in seconds, captured on first load. Every
  // Jellyfin stream we open is a full-runtime VOD playlist (built from 0:00,
  // never with StartTimeTicks — see seekTo), so video.duration is always the
  // whole movie; this is just a stable cache for the progress bar's total.
  private knownDurationSeconds = 0;
  // PlaySessionId of the currently-loaded HLS stream, so a track/quality
  // change can tell the server to stop transcoding it before starting the
  // replacement.
  private currentPlaySessionId: string | undefined;
  // video.currentTime (seconds) to restore once a fresh HLS source becomes
  // playable. Set by the two paths that swap the underlying stream out from
  // under the playhead: the audio-restore in-place reload, and a track/quality
  // change. A seek that lands while one of these is in flight redirects its
  // target here (see seekTo) instead of racing the torn-down media element.
  private pendingLocalSeekSeconds: number | null = null;
  // Wall clock when the latch above was armed, so a swap that never becomes
  // playable can't disable seeking permanently (see seekTo).
  private pendingLocalSeekSetAtMs = 0;

  // ── Stall watchdog ────────────────────────────────────────────────────────
  // hls.js only reports *fatal* errors, and the two ways this player actually
  // hangs are both non-fatal: a buffer hole punched ahead of the playhead when
  // the SourceBuffer evicts (the documented HEVC pass-through freeze), and a
  // transcode whose server-side ffmpeg job was reaped, leaving segment fetches
  // to spin. Both present identically — spinner up, playhead frozen, no error
  // event — so nothing downstream ever fired and the spinner ran forever.
  // This poll is the only thing that notices, escalating nudge → reload →
  // next source so playback either recovers or surfaces the mpv fallback.
  private stallTimer: number | null = null;
  private lastPlayheadSeconds = -1;
  private lastAdvanceAtMs = 0;
  private stallNudges = 0;
  // Playhead position at the last recovery attempt. The recovery counter used
  // to reset on every FRAG_LOADED/playing, so a stream that loaded one fragment
  // between stalls could recover forever without ever reaching the give-up
  // branch — an infinite spinner whose escape hatch was structurally
  // unreachable. It now only resets after genuine sustained progress.
  private lastRecoveryPlayheadSeconds = -1;

  // ── Diagnostic-narration bookkeeping (see log() below) ──────────────────
  // Set right before the audio-restore workaround reloads the source; the
  // next onMediaReady() consumes it to log the post-reload muted/volume/paused
  // state, then clears it — so the completion line is only ever attributed to
  // an actual restore-triggered reload, not any other source load.
  private pendingAudioRestoreCompletionLog = false;

  // Quality / audio / subtitle picker state.
  private tracksBtn: HTMLElement;
  private tracksMenu: HTMLElement;
  private menuRows: MenuRow[] = [];
  private menuIndex = 0;
  private qualityPresetIdx = 0;
  private audioIndex: number | undefined = undefined;
  private subtitleIndex: number | null = null;

  constructor() {
    this.overlay = document.getElementById('video-player-overlay')!;
    this.video = document.getElementById('vp-video') as HTMLVideoElement;
    this.titleEl = document.getElementById('vp-title')!;
    this.mediaStatusEl = document.getElementById('vp-media-status')!;
    this.playPauseBtn = document.getElementById('vp-playpause')!;
    this.backBtn = document.getElementById('vp-back')!;
    this.back10Btn = document.getElementById('vp-back10')!;
    this.fwd10Btn = document.getElementById('vp-fwd10')!;
    this.muteBtn = document.getElementById('vp-mute')!;
    this.volumeSlider = document.getElementById('vp-volume-slider') as HTMLInputElement;
    this.subtitlesBtn = document.getElementById('vp-subtitles')!;
    this.tracksBtn = document.getElementById('vp-tracks')!;
    this.tracksMenu = document.getElementById('vp-tracks-menu')!;
    this.fullscreenBtn = document.getElementById('vp-fullscreen')!;
    this.progressTrack = document.getElementById('vp-progress')!;
    this.progressFilled = document.getElementById('vp-progress-filled')!;
    this.progressBuffered = document.getElementById('vp-progress-buffered')!;
    this.currentTimeEl = document.getElementById('vp-current')!;
    this.durationEl = document.getElementById('vp-duration')!;
    this.spinner = document.getElementById('vp-spinner')!;
    this.exitConfirmEl = document.getElementById('vp-exit-confirm')!;
    this.exitConfirmBtns = [
      document.getElementById('vp-exit-yes')!,
      document.getElementById('vp-exit-no')!,
    ];
    this.exitConfirmBtns[0].addEventListener('click', () => this.close());
    this.exitConfirmBtns[1].addEventListener('click', () => this.hideExitConfirm());

    this.bindDomEvents();
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  /** The player's <video> — T23's back room maps it onto the CRT screen plane. */
  get videoElement(): HTMLVideoElement {
    return this.video;
  }

  /** Diagnostic narration to the in-app console (no-op if the caller didn't
   *  wire opts.log). Cheap, one-shot decision-point logging only — never call
   *  this from a per-frame/timeupdate path. */
  private log(msg: string): void {
    this.opts?.log?.(msg);
  }

  // ── Public control surface (driven by the remote/keyboard in main.ts) ──────

  open(opts: VideoPlayerOptions, startHidden = false): void {
    // Defensive: no normal UI path opens on top of a live player (close()
    // always runs first), but if one ever does, the previous stream's encode
    // and hls.js instance must be torn down or they'd keep running behind
    // the new title — the "doubled stream" failure mode.
    if (this._isOpen) {
      this.stopCurrentEncode();
      this.teardownPlayback();
    }
    this.opts = opts;
    this._isOpen = true;
    this.endedNaturally = false;
    this.isHidden = startHidden;
    // T23 diegetic mode (see VideoPlayerOptions.hideVideoSurface).
    this.overlay.classList.toggle('vp-diegetic', !!opts.hideVideoSurface);

    // Try cheap direct play first; only fall back to server-side HLS transcode
    // if the webview can't decode the original file. When the caller has
    // already determined direct play is unsafe (directPlayable === false),
    // skip staticSrc entirely and go straight to HLS — see directPlayable's
    // doc comment for why the error-fallback below can't be relied on alone.
    this.sources = opts.directPlayable
      ? [
          { src: opts.staticSrc, isHls: false },
          { src: opts.hlsSrc, isHls: true },
        ]
      : [
          { src: opts.hlsSrc, isHls: true },
        ];
    this.sourceIndex = 0;
    this.log(`[Player] media: ${opts.mediaInfoSummary} → ${opts.directPlayable ? 'direct play' : 'HLS transcode (direct play unsafe)'}`);

    // New title: no reload/track-change history yet, and any pending seek
    // restore from a previous title is meaningless now.
    this.knownDurationSeconds = 0;
    this.currentPlaySessionId = undefined;
    this.pendingLocalSeekSeconds = null;
    // A stale flag from a previous title's in-flight reload must not get
    // misattributed to this new title's first onMediaReady().
    this.pendingAudioRestoreCompletionLog = false;

    this.titleEl.innerText = opts.title;
    this.mediaStatusEl.innerText =
      `${opts.directPlayable ? '● DIRECT PLAY' : '● TRANSCODE'} — ${opts.mediaInfoSummary}`;
    this.mediaStatusEl.classList.toggle('is-direct', opts.directPlayable);
    this.mediaStatusEl.classList.toggle('is-transcode', !opts.directPlayable);
    this.currentTimeEl.innerText = '0:00';
    this.durationEl.innerText = '0:00';
    this.progressFilled.style.width = '0%';
    this.progressBuffered.style.width = '0%';
    this.activeSubtitleTrack = null;
    this.subtitlesBtn.setAttribute('hidden', '');
    this.subtitlesBtn.classList.remove('is-active');
    // A new title must never inherit the previous one's captions. A sidecar
    // URL means the caller chose text delivery, so nothing is baked into the
    // picture; a default index with no sidecar means it is.
    this.burnedInSubtitleIndex =
      !opts.subtitleTrackUrl && opts.defaultSubtitleIndex !== undefined ? opts.defaultSubtitleIndex : null;
    this.setSubtitleSidecar(opts.subtitleTrackUrl ?? null);
    // Default focus for a fresh player: the timeline, ready to seek.
    this.focusTimeline();

    // Reset the track picker to defaults for the new title. The Playback
    // settings' language/CC picks (already baked into the caller's initial
    // hlsSrc) seed the picker state so the menu shows them selected and any
    // later rebuild keeps them.
    this.qualityPresetIdx = 0;
    this.audioIndex = opts.defaultAudioIndex;
    this.subtitleIndex = opts.defaultSubtitleIndex ?? null;
    this.closeTracksMenu();
    this.tracksBtn.toggleAttribute('hidden', !opts.buildStream);

    // Store current volume from slider before overriding it
    this.preHiddenVolume = parseFloat(this.volumeSlider.value);
    if (isNaN(this.preHiddenVolume)) this.preHiddenVolume = 1.0;

    if (this.isHidden) {
      // Strictly muted while hidden: autoplay policy only allows background
      // playback for muted video. Volume/unmute are restored in reveal().
      this.video.muted = true;
      this.video.volume = 0;
    } else {
      this.video.volume = this.preHiddenVolume;
      this.video.muted = this.preHiddenVolume <= 0;
      this.overlay.classList.add('visible');
    }

    this.updateVolumeUI();

    this.tryCurrentSource();
    this.nudgeControls();
    this.startProgressReporting();
    this.startStallWatchdog();
  }

  reveal(): void {
    if (!this._isOpen || !this.isHidden) return;
    this.isHidden = false;

    // Restore normal volume
    this.video.volume = this.preHiddenVolume;
    this.video.muted = this.preHiddenVolume <= 0;

    // Seek back to start so they don't miss the beginning of the movie
    this.video.currentTime = 0;

    this.updateVolumeUI();
    this.overlay.classList.add('visible');

    // Make sure it is playing. Reveal happens long after the original user
    // gesture (a 3D animation ran in between), so an unmuted play() may be
    // blocked — fall back to retrying on the first user input.
    this.video.play().then(
      () => this.log('[Player] play() ok'),
      (err) => {
        this.log(`[Player] play() blocked: ${err?.name ?? err}`);
        this.unmuteOnNextGesture();
      }
    );

    // The item began playing muted-in-the-background during the "insert tape"
    // animation. Unmuting here (outside any user gesture) is silently ignored
    // by strict autoplay engines (WebKitGTK/Tauri): the picture keeps running
    // so play() above does NOT reject, meaning the catch-based fallback never
    // arms — audio then stays dead until some *other* gesture-driven reload
    // (historically only a track change) happened to replay the stream. Always
    // re-assert the unmuted volume on the first real user input so sound comes
    // up on the very first keypress/click rather than never. (audio-on-first-open)
    this.restoreAudioOnNextGesture();
  }

  // Autoplay-policy fallback: if unmuted playback was blocked at reveal(),
  // keep it muted-safe and retry with full volume on the next real user input
  // (which carries a fresh gesture token).
  private unmuteOnNextGesture(): void {
    // Keep the picture running muted (always allowed) until the gesture lands.
    this.video.muted = true;
    this.video.play().catch(() => {});
    const retry = () => {
      window.removeEventListener('pointerdown', retry, true);
      window.removeEventListener('keydown', retry, true);
      window.removeEventListener('gamepad-activity', retry, true);
      if (!this._isOpen) return;
      this.video.volume = this.preHiddenVolume;
      this.video.muted = this.preHiddenVolume <= 0;
      this.video.play().catch(() => {});
    };
    window.addEventListener('pointerdown', retry, true);
    window.addEventListener('keydown', retry, true);
    // Gamepad input never dispatches pointerdown/keydown (see input.ts's
    // synthetic 'gamepad-activity' event), so without this a controller-only
    // user could never retrigger the retry above.
    window.addEventListener('gamepad-activity', retry, true);
  }

  // Re-assert unmuted playback on the first user input after a reveal. Unlike
  // unmuteOnNextGesture() this does NOT force-mute in the meantime — on engines
  // that already allowed the unmute at reveal() this is a harmless no-op; on
  // strict ones it restores audio the instant the user touches anything. One
  // shot, self-removing, and cheap enough to leave armed if the player closes
  // first (it just no-ops on the next stray gesture and detaches).
  private restoreAudioOnNextGesture(): void {
    const restore = (e: Event) => {
      window.removeEventListener('pointerdown', restore, true);
      window.removeEventListener('keydown', restore, true);
      window.removeEventListener('gamepad-activity', restore, true);
      this.log(`[Player] audio-restore fired via ${e.type}`);
      if (!this._isOpen || this.isHidden) return;
      this.video.volume = this.preHiddenVolume;
      this.video.muted = this.preHiddenVolume <= 0;
      this.updateVolumeUI();
      // Setting .muted=false alone is silently ignored by strict autoplay
      // engines (WebKitGTK/Tauri) once the stream started muted: the element
      // reports unmuted but the audio pipeline stays dead until the source is
      // actually reloaded. That reload is why a track change historically
      // "fixed" the sound. Do the same reload here — under this fresh gesture
      // token — so audio comes up on the first open, not only after a swap.
      this.pendingAudioRestoreCompletionLog = true;
      this.reloadCurrentSource();
    };
    this.log('[Player] audio-restore armed (waiting for input)');
    window.addEventListener('pointerdown', restore, true);
    window.addEventListener('keydown', restore, true);
    // See unmuteOnNextGesture(): a gamepad-only user never fires pointerdown
    // or keydown, so this workaround would otherwise never arm for them.
    window.addEventListener('gamepad-activity', restore, true);
  }

  // Reload the current source at the current position — no track/quality
  // change. Direct play just re-plays the same src in place. HLS reloads the
  // SAME URL: the unchanged PlaySessionId makes Jellyfin reuse the running
  // transcode and serve its already-written segments, so the reload is
  // near-instant and no new ffmpeg job spawns. (This used to rebuild a brand
  // new stream via buildStream, which tore down the transcode and — when the
  // reload fired before playback had advanced, i.e. right after reveal() —
  // restarted the movie at 0:00 with a long cold-start spinner.) The one
  // thing a same-URL reload loses is the playhead, so stash the local
  // position for onMediaReady() to restore.
  private reloadCurrentSource(): void {
    if (!this.opts || this.sources.length === 0) return;
    const entry = this.sources[this.sourceIndex];
    if (entry?.isHls) {
      this.pendingLocalSeekSeconds = this.video.currentTime || 0;
      this.pendingLocalSeekSetAtMs = Date.now();
      this.setSpinner(true);
      this.tryCurrentSource();
      return;
    }
    this.opts.startPositionTicks = this.currentPositionTicks();
    this.setSpinner(true);
    this.tryCurrentSource();
  }

  // ── Stop-watching confirmation ─────────────────────────────────────────────

  get isExitConfirmOpen(): boolean {
    return !this.exitConfirmEl.hidden;
  }

  /** User-initiated exit (Back button/key). With opts.confirmExit this puts
   *  up the "STOP WATCHING?" card instead of closing; everything else
   *  (video ended, fatal error, programmatic close) calls close() directly. */
  requestClose(): void {
    if (!this._isOpen) return;
    if (this.opts?.confirmExit && !this.isExitConfirmOpen) {
      this.showExitConfirm();
      return;
    }
    this.close();
  }

  private showExitConfirm(): void {
    this.exitConfirmIndex = 1; // default to "KEEP WATCHING"
    this.applyExitConfirmHighlight();
    this.exitConfirmEl.hidden = false;
  }

  private hideExitConfirm(): void {
    this.exitConfirmEl.hidden = true;
    if (this._isOpen) this.nudgeControls();
  }

  private applyExitConfirmHighlight(): void {
    this.exitConfirmBtns.forEach((el, i) =>
      el.classList.toggle('selected', i === this.exitConfirmIndex));
  }

  close(): void {
    if (!this._isOpen) return;
    this.exitConfirmEl.hidden = true;
    const ticks = this.currentPositionTicks();
    const onClose = this.opts?.onClose;
    const endedNaturally = this.endedNaturally;

    // Flip _isOpen before teardown so the resulting <video> error event (from
    // clearing src) isn't mistaken for a playback failure and retried.
    this._isOpen = false;
    // Back/exit must not leave ffmpeg encoding for a player that no longer
    // exists — the server would keep the job alive until its idle timeout,
    // and the next open() would stack a second encode on top of it.
    this.stopCurrentEncode();
    this.teardownPlayback();
    this.closeTracksMenu();
    this.overlay.classList.remove('visible');
    this.overlay.classList.remove('vp-diegetic');
    this.opts = null;

    onClose?.(ticks, endedNaturally);
  }

  /** Hold the overlay up, spinner running, between two episodes of a binge.
   *  close() tears the player all the way down before onClose fires, and
   *  resolving the next stream takes a beat (token refresh + a playback-info
   *  probe) — without this the viewer gets a flash of the frozen store between
   *  every episode. The following open() inherits the visible overlay; if the
   *  launch never gets there, the caller must call endTransition(). */
  beginTransition(label: string): void {
    if (this._isOpen) return;
    this.titleEl.textContent = label;
    this.mediaStatusEl.innerText = '';
    this.overlay.classList.add('visible');
    this.setSpinner(true);
  }

  /** Undo beginTransition when the next episode never opened. */
  endTransition(): void {
    if (this._isOpen) return; // open() took over — leave the overlay alone
    this.setSpinner(false);
    this.overlay.classList.remove('visible');
  }

  togglePlayPause(): void {
    if (this.video.paused) {
      this.video.play().catch(() => {});
    } else {
      this.video.pause();
    }
    this.nudgeControls();
  }

  /** Seek relative to the current position (e.g. +10 / -10 seconds). Builds
   *  on any not-yet-applied seek/reload target — currentAbsoluteSeconds()
   *  folds those in — so repeated presses accumulate (3× ⏩ during a
   *  rebuild/debounce = +30s, not +10s three times over) and a seek that
   *  lands during the audio-restore reload starts from the real playhead,
   *  not the torn-down media element's 0. */
  seekBy(seconds: number): void {
    this.seekTo(this.currentAbsoluteSeconds() + seconds);
    this.nudgeControls();
  }

  // ── Remote/keyboard control navigation ─────────────────────────────────────
  // Android-TV-style two-row focus model. The timeline (scrub bar) is the
  // default focused control: left/right SEEK while it's focused, and Enter
  // toggles play/pause. Down moves focus to the button row, where left/right
  // walk the visible buttons and Enter activates one; Up returns to the
  // timeline. Whenever the controls re-appear after auto-hiding, focus resets
  // to the timeline so a bare ⯈ press always means "skip ahead".

  private focusableControls(): HTMLElement[] {
    // Order must match the visual left-to-right layout in index.html, or
    // arrow-key focus appears to skip/teleport between buttons.
    return [
      this.backBtn, this.back10Btn, this.playPauseBtn, this.fwd10Btn,
      this.muteBtn, this.tracksBtn, this.subtitlesBtn, this.fullscreenBtn,
    ].filter((el) => !el.hasAttribute('hidden'));
  }

  private applyFocusHighlight(items: HTMLElement[]): void {
    items.forEach((el, i) => el.classList.toggle('vp-focused', i === this.focusIndex));
  }

  private focusTimeline(): void {
    this.focusZone = 'timeline';
    this.focusIndex = -1;
    this.focusableControls().forEach((el) => el.classList.remove('vp-focused'));
    this.progressTrack.classList.add('vp-focused');
  }

  private focusButtons(): void {
    this.focusZone = 'buttons';
    this.progressTrack.classList.remove('vp-focused');
    const items = this.focusableControls();
    if (items.length === 0) return;
    if (this.focusIndex < 0 || this.focusIndex >= items.length) {
      this.focusIndex = Math.max(items.indexOf(this.playPauseBtn), 0);
    }
    this.applyFocusHighlight(items);
  }

  /** Left/right from the remote: seek ±10s while the timeline is focused
   *  (the default), walk the button row when a button is focused. */
  navigateHorizontal(dir: -1 | 1): void {
    if (this.isHidden) return; // pre-reveal input belongs to the 3D animation
    if (this.isExitConfirmOpen) {
      // Two buttons: either direction toggles the selection.
      this.exitConfirmIndex = (this.exitConfirmIndex + 1) % 2;
      this.applyExitConfirmHighlight();
      return;
    }
    if (this.isMenuOpen()) { this.nudgeControls(); return; }
    // Nudge first: if the controls were hidden this resets focus to the
    // timeline, so the press that wakes the controls already seeks.
    this.nudgeControls();
    if (this.focusZone === 'timeline') {
      this.seekBy(dir * 10);
      return;
    }
    this.navigateControls(dir);
  }

  /** Up/down from the remote: menu rows while the track picker is open,
   *  otherwise move focus between the timeline (up) and button row (down). */
  navigateVertical(dir: -1 | 1): void {
    if (this.isHidden) return;
    if (this.isExitConfirmOpen) return; // the confirm is a two-button row
    if (this.navigateMenu(dir)) return;
    this.nudgeControls();
    if (dir > 0) this.focusButtons();
    else this.focusTimeline();
  }

  /** Move button-row focus left (-1) or right (+1). Reveals the controls. */
  navigateControls(dir: -1 | 1): void {
    const items = this.focusableControls();
    if (items.length === 0) return;
    this.nudgeControls();
    if (this.focusIndex < 0) {
      this.focusIndex = Math.max(items.indexOf(this.playPauseBtn), 0);
    } else {
      this.focusIndex = (this.focusIndex + dir + items.length) % items.length;
    }
    this.applyFocusHighlight(items);
  }

  /** Activate the focused control. Returns false if nothing is focused. */
  activateFocused(): boolean {
    if (this.isExitConfirmOpen) {
      this.exitConfirmBtns[this.exitConfirmIndex].click();
      return true;
    }
    if (this.isMenuOpen()) {
      this.activateMenuRow();
      return true;
    }
    if (this.focusZone === 'timeline') {
      // Enter on the focused timeline = play/pause, Android-TV style.
      this.togglePlayPause();
      return true;
    }
    const items = this.focusableControls();
    if (this.focusIndex < 0 || this.focusIndex >= items.length) return false;
    items[this.focusIndex].click();
    if (this._isOpen) this.nudgeControls();
    return true;
  }

  /** Up/down while the track picker is open moves its row focus; returns
   *  false when the menu is closed so the caller can fall back. */
  navigateMenu(dir: -1 | 1): boolean {
    if (!this.isMenuOpen()) return false;
    this.nudgeControls();
    const count = this.menuRows.length;
    if (count === 0) return true;
    let next = this.menuIndex;
    do {
      next = (next + dir + count) % count;
    } while (this.menuRows[next].kind === 'header' && next !== this.menuIndex);
    this.menuIndex = next;
    this.renderTracksMenu();
    return true;
  }

  /** Back/escape closes the track picker first; returns false when there was
   *  no menu to close (caller then closes the player itself). */
  handleBack(): boolean {
    if (this.isExitConfirmOpen) {
      this.hideExitConfirm();
      return true;
    }
    if (this.isMenuOpen()) {
      this.closeTracksMenu();
      this.nudgeControls();
      return true;
    }
    return false;
  }

  /** Reveal the controls and (re)start the auto-hide countdown. */
  nudgeControls(): void {
    const wereHidden = this.overlay.classList.contains('controls-hidden');
    this.overlay.classList.remove('controls-hidden');
    // Controls re-appearing after an auto-hide reset to the default focus:
    // the timeline, so the next left/right press seeks immediately.
    if (wereHidden) this.focusTimeline();
    if (this.hideTimer !== null) clearTimeout(this.hideTimer);
    // Keep controls up while paused or while the track picker is open;
    // otherwise fade them after inactivity.
    if (!this.video.paused && !this.isMenuOpen()) {
      this.hideTimer = window.setTimeout(() => {
        this.overlay.classList.add('controls-hidden');
      }, CONTROLS_HIDE_MS);
    }
  }

  // ── Source loading + fallback ──────────────────────────────────────────────

  private tryCurrentSource(): void {
    const entry = this.sources[this.sourceIndex];
    if (!entry) return;
    this.setSpinner(true);
    // loadSource awaits a dynamic import; an unhandled rejection there (chunk
    // fetch failure) used to vanish into the void with the spinner already up
    // and no error path left to fire — another silent forever-buffer.
    this.loadSource(entry.src, entry.isHls).catch((err) => {
      console.error('[VideoPlayer] source load threw:', err);
      this.log(`[Player] source load failed: ${err?.message ?? err}`);
      this.tryNextSource();
    });
  }

  // ── Stall watchdog ─────────────────────────────────────────────────────────

  private startStallWatchdog(): void {
    this.stopStallWatchdog();
    this.lastPlayheadSeconds = -1;
    this.lastAdvanceAtMs = Date.now();
    this.stallNudges = 0;
    this.lastRecoveryPlayheadSeconds = -1;
    this.stallTimer = window.setInterval(() => this.checkForStall(), STALL_POLL_MS);
  }

  private stopStallWatchdog(): void {
    if (this.stallTimer !== null) {
      clearInterval(this.stallTimer);
      this.stallTimer = null;
    }
  }

  /**
   * One watchdog tick. "Stalled" means: we want to be playing, and the playhead
   * has not moved for long enough that a normal rebuffer would have finished.
   */
  private checkForStall(): void {
    if (!this._isOpen) return;
    const now = Date.now();
    const t = this.video.currentTime;

    // Paused (or deliberately not playing) is not a stall — keep the clock
    // parked so unpausing doesn't instantly trip the ladder.
    if (this.video.paused || this.video.ended) {
      this.lastAdvanceAtMs = now;
      this.lastPlayheadSeconds = t;
      return;
    }

    if (t !== this.lastPlayheadSeconds) {
      this.lastPlayheadSeconds = t;
      this.lastAdvanceAtMs = now;
      // Sustained progress since the last recovery: the stream is healthy, so
      // give back the recovery budget and reset the escalation ladder.
      if (
        this.lastRecoveryPlayheadSeconds >= 0 &&
        t - this.lastRecoveryPlayheadSeconds > STALL_RECOVERY_CLEAR_SECONDS
      ) {
        this.hlsRecoveryAttempts = 0;
        this.lastRecoveryPlayheadSeconds = -1;
        this.stallNudges = 0;
      }
      return;
    }

    const stalledMs = now - this.lastAdvanceAtMs;
    if (stalledMs < STALL_NUDGE_MS) return;

    this.setSpinner(true);

    if (stalledMs >= STALL_GIVEUP_MS) {
      this.log(`[Player] stalled ${Math.round(stalledMs / 1000)}s at ${t.toFixed(1)}s — abandoning this source`);
      this.lastAdvanceAtMs = now;
      this.tryNextSource();
      return;
    }

    if (stalledMs >= STALL_RELOAD_MS) {
      // Rung 2: rebuild the stream at the current position. Covers a server
      // transcode that died under us — the segments will never arrive on the
      // old PlaySessionId no matter how long we wait.
      this.log(`[Player] stalled ${Math.round(stalledMs / 1000)}s at ${t.toFixed(1)}s — reloading source`);
      this.lastAdvanceAtMs = now;
      this.lastRecoveryPlayheadSeconds = t;
      this.reloadCurrentSource();
      return;
    }

    // Rung 1: nudge. A SourceBuffer eviction can punch a hole *ahead* of the
    // playhead, and the media element will sit at the near edge forever rather
    // than skipping it. If there's buffered data further on, jump into it;
    // otherwise kick the loader, which may simply have given up.
    this.stallNudges++;
    this.lastAdvanceAtMs = now;
    this.lastRecoveryPlayheadSeconds = t;
    const gapTarget = this.bufferedRangeStartAfter(t);
    if (gapTarget !== null) {
      this.log(`[Player] buffer hole at ${t.toFixed(1)}s — skipping to ${gapTarget.toFixed(1)}s`);
      // Land just inside the range; landing exactly on the boundary can
      // re-stall on the same gap.
      this.video.currentTime = gapTarget + 0.1;
    } else {
      this.log(`[Player] stalled ${Math.round(stalledMs / 1000)}s at ${t.toFixed(1)}s — kicking the loader`);
      this.hls?.startLoad();
    }
    this.video.play().catch(() => { /* autoplay policy; the ladder continues */ });
  }

  /** Start of the first buffered range that begins after `t`, if any. */
  private bufferedRangeStartAfter(t: number): number | null {
    const b = this.video.buffered;
    for (let i = 0; i < b.length; i++) {
      // Only a range strictly ahead of the playhead is a hole worth skipping;
      // a range we're already inside means the stall is not a gap.
      if (b.start(i) > t + 0.5) return b.start(i);
      if (b.start(i) <= t && b.end(i) > t) return null;
    }
    return null;
  }

  /** Advance to the next playback source, or give up if there are none left. */
  private tryNextSource(): void {
    if (!this.opts || !this._isOpen) return;
    this.sourceIndex++;
    const entry = this.sources[this.sourceIndex];
    if (entry) {
      console.warn(`[VideoPlayer] Source failed; trying ${entry.isHls ? 'HLS transcode' : 'direct stream'}.`);
      this.tryCurrentSource();
      return;
    }
    // Everything failed; let the caller decide (e.g. offer external player).
    console.error('[VideoPlayer] All in-app playback sources failed.');
    this.opts.onFatalError?.();
  }

  private removeNativeListener(): void {
    if (this.nativeLoadedMetadataListener) {
      this.video.removeEventListener('loadedmetadata', this.nativeLoadedMetadataListener);
      this.nativeLoadedMetadataListener = null;
    }
  }

  /**
   * Pin playback to the stream-COPIED variant of a multi-variant Jellyfin
   * master playlist — the HEVC rendition, which the server passes through
   * untouched (original resolution, original HDR10 metadata) instead of
   * re-encoding to H.264 SDR. Jellyfin advertises both at the same BANDWIDTH,
   * so without this hls.js's ABR picks the re-encode. Setting startLevel (not
   * currentLevel) states the preference without disabling ABR, so a rendition
   * that genuinely fails can still be switched away from.
   */
  private pinCopyLevel(hls: Hls): void {
    const idx = hls.levels.findIndex((l) => /^(hvc1|hev1)/i.test(l.videoCodec ?? ''));
    if (idx < 0) {
      this.log('[Player] no stream-copy (HEVC) rendition offered — using re-encode');
      return;
    }
    const lvl = hls.levels[idx];
    hls.startLevel = idx;
    this.log(`[Player] pinned copy rendition ${idx}: ${lvl.width}x${lvl.height} ${lvl.videoCodec}`);
  }

  private async loadSource(src: string, isHls: boolean): Promise<void> {
    const seq = ++this.loadSeq;
    this.disposeHls();
    this.removeNativeListener();
    this.hlsRecoveryAttempts = 0;

    const HlsClass = await loadHls();
    // The player may have been closed, or a newer loadSource issued, while
    // the module import above was in flight (the first-ever playback pays a
    // real dynamic-import here). Proceeding would attach a stale stream to
    // the media element — a zombie the user can't see or stop. (see loadSeq)
    if (seq !== this.loadSeq || !this._isOpen) return;
    if (isHls && HlsClass && HlsClass.isSupported()) {
      this.log(`[Player] HLS transcode stream starting (StartTimeTicks=${extractStartTimeTicks(src)})`);
      // Buffer profile. Brave caps a single video SourceBuffer at ~250 MB;
      // overrun makes hls.js flush-evict and punch a hole in front of the
      // playhead (the freeze-at-~39s bug). The default profile is sized for a
      // <=20 Mbps re-encode, where 90s of buffer is ~225 MB. A stream-copied
      // 4K remux runs ~94 Mbps = ~11.75 MB/s, so the same 90s would be ~1 GB —
      // it needs a much shorter window (~20s total ≈ 235 MB) to fit. Seeking
      // stays cheap either way: since the July-12 native-seek rework, Jellyfin
      // serves any segment on demand in ~1s, so a short buffer costs nothing.
      // On a copy-eligible source Jellyfin advertises BOTH variants at the
      // same BANDWIDTH — the stream-copied HEVC/PQ one and an H.264 SDR
      // re-encode. Identical bandwidth gives ABR no reason to prefer either,
      // and it picks the re-encode (measured). preferHDR biases it to the copy;
      // pickCopyLevel below pins that choice from the first fragment so
      // playback doesn't open on the re-encode and switch mid-scene.
      const copyStream = isStreamCopyUrl(src);
      const buffer = copyStream
        ? {
            maxBufferLength: 20,
            backBufferLength: 0,
            maxMaxBufferLength: 20,
            maxBufferSize: 220 * 1024 * 1024,
            videoPreference: { preferHDR: true },
          }
        : { maxBufferLength: 60, backBufferLength: 30 };
      this.log(`[Player] HLS buffer profile: ${copyStream ? 'stream-copy (short)' : 'transcode (default)'}`);
      const hls = new HlsClass({
        enableWorker: true,
        lowLatencyMode: false,
        ...buffer,
        loader: getSegmentFixLoader(HlsClass) as any,
      });
      this.hls = hls;
      hls.loadSource(src);
      hls.attachMedia(this.video); // sets video.src to its MediaSource blob
      
      // Call play synchronously to capture user gesture!
      this.video.play().catch((err) => {
        console.warn('[VideoPlayer] synchronous HLS play rejected:', err);
      });
      
      hls.on(HlsClass.Events.MANIFEST_PARSED, () => {
        this.hlsRecoveryAttempts = 0;
        if (copyStream) this.pinCopyLevel(hls);
        this.onMediaReady();
      });
      // NB: FRAG_LOADED deliberately does NOT clear hlsRecoveryAttempts. A
      // stream that loads one fragment between stalls would reset the budget
      // every cycle and recover forever, so tryNextSource() (and with it the
      // mpv fallback) could never be reached. The watchdog clears the budget
      // instead, and only after STALL_RECOVERY_CLEAR_SECONDS of real progress.
      hls.on(HlsClass.Events.ERROR, (_evt, data) => {
        if (!data.fatal) {
          // Non-fatal, but the two that actually hang playback are worth a log
          // line — the watchdog is what recovers them.
          if (data.details === 'bufferStalledError' || data.details === 'bufferSeekOverHole') {
            this.log(`[Player] non-fatal HLS ${data.details} at ${this.video.currentTime.toFixed(1)}s`);
          }
          return;
        }
        if (data.fatal) {
          console.warn('[VideoPlayer] HLS fatal error:', data.type, data.details);
          this.log(`[Player] HLS error: ${data.type}/${data.details}`);
          if (data.type === HlsClass.ErrorTypes.MEDIA_ERROR || data.type === HlsClass.ErrorTypes.NETWORK_ERROR) {
            if (this.hlsRecoveryAttempts < 3) {
              this.hlsRecoveryAttempts++;
              console.warn(`[VideoPlayer] Attempting HLS recovery (attempt ${this.hlsRecoveryAttempts}/3) for error type: ${data.type}`);
              if (data.type === HlsClass.ErrorTypes.MEDIA_ERROR) {
                hls.recoverMediaError();
              } else {
                hls.startLoad();
              }
            } else {
              console.error('[VideoPlayer] Maximum HLS recovery attempts reached.');
              this.tryNextSource();
            }
          } else {
            this.tryNextSource();
          }
        }
      });
      return;
    }

    // Native HLS (e.g. WebKit) or a direct/static stream.
    this.log(
      isHls
        ? `[Player] HLS transcode stream starting (StartTimeTicks=${extractStartTimeTicks(src)})`
        : '[Player] trying direct stream'
    );
    this.nativeLoadedMetadataListener = () => {
      this.removeNativeListener();
      this.onMediaReady();
    };
    this.video.addEventListener('loadedmetadata', this.nativeLoadedMetadataListener);
    this.video.src = src;
    
    // Call play synchronously to capture user gesture!
    this.video.play().catch((err) => {
      console.warn('[VideoPlayer] synchronous native play rejected:', err);
    });
    
    this.video.load();
  }

  private onMediaReady(): void {
    const entry = this.sources[this.sourceIndex];
    const audioTracksLen = (this.video as any).audioTracks?.length;
    this.log(
      `[Player] playing via ${entry?.isHls ? 'HLS' : 'direct'} — muted=${this.video.muted} volume=${this.video.volume} audioTracks=${audioTracksLen ?? 'n/a'}`
    );
    if (entry?.isHls) {
      // Remember which encode session is now live so a later track/quality
      // change can tell the server to stop it before starting the replacement.
      this.currentPlaySessionId = getLastHlsPlaySessionId();
    }
    // Restore the playhead once the fresh source is playable. This runs for a
    // full stream swap (audio-restore reload or track/quality change, which
    // stash the position in pendingLocalSeekSeconds) and for a plain resume
    // (opts.startPositionTicks). It's a NATIVE seek: the stream is a full VOD
    // playlist from 0:00, so hls.js just fetches the target segment — Jellyfin
    // serves it (restarting the transcode server-side at that point if the
    // encoder hasn't reached it yet) in ~1s. No client-side rebuild, so the
    // movie can never bounce back to 0:00.
    const restoreTo =
      this.pendingLocalSeekSeconds ??
      (this.opts?.startPositionTicks ? this.opts.startPositionTicks / TICKS_PER_SECOND : 0);
    this.pendingLocalSeekSeconds = null;
    if (restoreTo > 0.5 && Math.abs((this.video.currentTime || 0) - restoreTo) > 0.5) {
      this.video.currentTime = restoreTo;
    }
    // Only call play if paused to avoid redundant calls
    if (this.video.paused) {
      this.video.play().catch((err) => {
        console.warn('[VideoPlayer] play() rejected in onMediaReady:', err);
      });
    }
    if (this.pendingAudioRestoreCompletionLog) {
      this.pendingAudioRestoreCompletionLog = false;
      this.log(
        `[Player] audio-restore reload live — muted=${this.video.muted} volume=${this.video.volume} paused=${this.video.paused}`
      );
    }
  }

  // ── DOM events ─────────────────────────────────────────────────────────────

  private bindDomEvents(): void {
    this.backBtn.addEventListener('click', () => this.requestClose());
    this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
    this.back10Btn.addEventListener('click', () => this.seekBy(-10));
    this.fwd10Btn.addEventListener('click', () => this.seekBy(10));

    // Click/drag anywhere on the track to seek.
    this.progressTrack.addEventListener('click', (e) => {
      const dur = this.totalDurationSeconds();
      if (!isFinite(dur) || dur <= 0) return;
      const rect = this.progressTrack.getBoundingClientRect();
      const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
      this.seekTo(ratio * dur);
      this.nudgeControls();
    });

    // Volume: icon toggles mute, slider drives the level directly.
    this.muteBtn.addEventListener('click', () => this.toggleMute());
    this.volumeSlider.addEventListener('input', () => {
      const value = parseFloat(this.volumeSlider.value);
      this.video.volume = value;
      this.video.muted = value <= 0;
      this.updateVolumeUI();
      this.nudgeControls();
    });
    this.video.addEventListener('volumechange', () => this.updateVolumeUI());

    // Subtitles: only shown once the loaded media actually exposes a track.
    this.subtitlesBtn.addEventListener('click', () => this.toggleSubtitles());

    // Quality / audio / subtitle picker.
    this.tracksBtn.addEventListener('click', () => this.toggleTracksMenu());

    // Fullscreen.
    this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
    document.addEventListener('fullscreenchange', () => this.updateFullscreenUI());

    // Extra shortcuts not already routed through the global remote/keyboard
    // system (space/arrows/escape are wired in main.ts via InputManager).
    document.addEventListener('keydown', (e) => {
      if (!this._isOpen || this.isHidden) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      switch (e.key) {
        case 'f':
        case 'F':
          this.toggleFullscreen();
          this.nudgeControls();
          break;
        case 'm':
        case 'M':
          this.toggleMute();
          this.nudgeControls();
          break;
      }
    });

    // Any mouse movement reveals the controls.
    this.overlay.addEventListener('mousemove', () => this.nudgeControls());

    this.video.addEventListener('loadedmetadata', () => {
      // Every stream is a full-runtime VOD playlist, so video.duration is the
      // item's true runtime — cache it so the progress bar total stays put
      // across an audio-restore reload or a track/quality change.
      if (isFinite(this.video.duration) && this.video.duration > 0) {
        this.knownDurationSeconds = this.video.duration;
      }
      this.durationEl.innerText = formatTime(this.totalDurationSeconds());
      this.updateProgressUI();
      this.setupSubtitlesIfAvailable();
    });
    this.video.addEventListener('timeupdate', () => this.updateProgressUI());
    this.video.addEventListener('progress', () => this.updateBufferedUI());
    this.video.addEventListener('playing', () => {
      // Not a recovery-budget reset: a stream that stutters back to life for a
      // moment between stalls must still burn through its budget so the
      // fallback ladder can be reached. The watchdog clears it on real
      // progress instead.
      this.setSpinner(false);
      this.setPlayIcon(false);
      this.nudgeControls();
    });
    this.video.addEventListener('play', () => this.setPlayIcon(false));
    this.video.addEventListener('pause', () => {
      this.setPlayIcon(true);
      this.nudgeControls();
      this.reportProgressNow();
    });
    this.video.addEventListener('waiting', () => this.setSpinner(true));
    this.video.addEventListener('canplay', () => this.setSpinner(false));
    this.video.addEventListener('ended', () => {
      this.endedNaturally = true;
      this.close();
    });
    this.video.addEventListener('error', () => {
      // A direct <video src> failure (e.g. unsupported codec) lands here and
      // pushes us to the HLS transcode fallback. hls.js reports its own errors,
      // and teardown clears src — guard against both.
      if (!this._isOpen || this.hls) return;
      if (this.video.error) {
        const entry = this.sources[this.sourceIndex];
        if (entry && !entry.isHls) {
          const err = this.video.error;
          this.log(
            `[Player] direct stream failed (code ${err.code}: ${err.message || 'no message'}) — falling back to HLS transcode`
          );
        }
        this.tryNextSource();
      }
    });
  }

  // ── Position helpers ────────────────────────────────────────────────────────

  /** Current playhead in the item's full runtime. Streams always start at
   *  0:00 (no StartTimeTicks — see seekTo), so video.currentTime IS the
   *  absolute position. While a stream swap (audio-restore reload or a
   *  track/quality change) is in flight the media element has been torn down
   *  and reads currentTime === 0; pendingLocalSeekSeconds — where playback
   *  really was, and where the fresh stream will resume — takes precedence so
   *  progress reports and a seek landing in that window use the real position,
   *  not a spurious 0. */
  private currentAbsoluteSeconds(): number {
    if (this.pendingLocalSeekSeconds !== null) return this.pendingLocalSeekSeconds;
    return this.video.currentTime || 0;
  }

  /** The progress bar's total: the item's true runtime. */
  private totalDurationSeconds(): number {
    return this.knownDurationSeconds > 0 ? this.knownDurationSeconds : this.video.duration;
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────

  private updateProgressUI(): void {
    const dur = this.totalDurationSeconds();
    const cur = this.currentAbsoluteSeconds();
    this.currentTimeEl.innerText = formatTime(cur);
    if (isFinite(dur) && dur > 0) {
      this.progressFilled.style.width = `${(cur / dur) * 100}%`;
    }
  }

  private updateBufferedUI(): void {
    const dur = this.totalDurationSeconds();
    if (!isFinite(dur) || dur <= 0 || this.video.buffered.length === 0) return;
    // Streams start at 0:00, so the buffered range is already in absolute time.
    const bufferedEnd = this.video.buffered.end(this.video.buffered.length - 1);
    this.progressBuffered.style.width = `${Math.min((bufferedEnd / dur) * 100, 100)}%`;
  }

  private setPlayIcon(showPlay: boolean): void {
    this.playPauseBtn.classList.toggle('is-paused', showPlay);
    this.playPauseBtn.setAttribute('aria-label', showPlay ? 'Play' : 'Pause');
  }

  private setSpinner(show: boolean): void {
    this.spinner.classList.toggle('visible', show);
  }

  private toggleMute(): void {
    this.video.muted = !this.video.muted;
    // Unmuting a video whose level was dragged to 0 should give back some sound.
    if (!this.video.muted && this.video.volume === 0) {
      this.video.volume = 1;
    }
    this.updateVolumeUI();
  }

  private updateVolumeUI(): void {
    if (this.isHidden) {
      const muted = this.preHiddenVolume <= 0;
      this.muteBtn.classList.toggle('is-muted', muted);
      this.muteBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
      this.volumeSlider.value = String(this.preHiddenVolume);
      return;
    }
    const muted = this.video.muted || this.video.volume === 0;
    this.muteBtn.classList.toggle('is-muted', muted);
    this.muteBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    this.volumeSlider.value = String(this.video.muted ? 0 : this.video.volume);
  }

  private toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      this.overlay.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  private updateFullscreenUI(): void {
    const isFullscreen = document.fullscreenElement === this.overlay;
    this.fullscreenBtn.classList.toggle('is-fullscreen', isFullscreen);
    this.fullscreenBtn.setAttribute('aria-label', isFullscreen ? 'Exit fullscreen' : 'Fullscreen');
  }

  /**
   * Hang a WebVTT sidecar on the <video> (or clear it). This is what replaced
   * asking the server to burn subtitles into the picture: a <track> costs the
   * server a text fetch instead of a full re-encode of the film, and swapping
   * or clearing it needs no new stream, so switching subtitles is instant and
   * never interrupts playback.
   *
   * The element is recreated rather than re-`src`'d because a <track> that has
   * already loaded keeps its cues when only the src changes in some engines —
   * leaving the old language's captions on screen under the new one's name.
   */
  private setSubtitleSidecar(url: string | null): void {
    this.subtitleTrackEl?.remove();
    this.subtitleTrackEl = null;
    if (!url) {
      this.activeSubtitleTrack = null;
      this.subtitlesBtn.setAttribute('hidden', '');
      this.subtitlesBtn.classList.remove('is-active');
      return;
    }
    const el = document.createElement('track');
    el.kind = 'subtitles';
    el.label = 'Subtitles';
    el.default = true;
    el.src = url;
    // A sidecar that 404s (wrong index, server without the converter) must not
    // take the film down with it — log and leave the picture playing.
    el.addEventListener('error', () => {
      this.opts?.log?.('[Video] Subtitle track failed to load; playing without captions.');
      this.subtitlesBtn.setAttribute('hidden', '');
    });
    this.video.appendChild(el);
    this.subtitleTrackEl = el;
    // The TextTrack behind a freshly-appended <track> only becomes usable once
    // the browser has registered it, hence the deferred hookup.
    setTimeout(() => this.setupSubtitlesIfAvailable(), 0);
  }

  /** Subtitles are only ever surfaced if the loaded media actually carries a text track. */
  private setupSubtitlesIfAvailable(): void {
    const tracks = this.video.textTracks;
    if (tracks.length === 0) {
      this.subtitlesBtn.setAttribute('hidden', '');
      this.activeSubtitleTrack = null;
      return;
    }
    for (let i = 0; i < tracks.length; i++) tracks[i].mode = 'hidden';
    this.activeSubtitleTrack = tracks[0];
    this.subtitlesBtn.removeAttribute('hidden');
    if (this.opts?.subtitlesDefaultOn) {
      this.activeSubtitleTrack.mode = 'showing';
      this.subtitlesBtn.classList.add('is-active');
    } else {
      this.subtitlesBtn.classList.remove('is-active');
    }
  }

  private toggleSubtitles(): void {
    if (!this.activeSubtitleTrack) return;
    const showing = this.activeSubtitleTrack.mode === 'showing';
    this.activeSubtitleTrack.mode = showing ? 'hidden' : 'showing';
    this.subtitlesBtn.classList.toggle('is-active', !showing);
    this.nudgeControls();
  }

  // ── Quality / audio / subtitle picker ────────────────────────────────────────

  private isMenuOpen(): boolean {
    return !this.tracksMenu.hasAttribute('hidden');
  }

  private toggleTracksMenu(): void {
    if (this.isMenuOpen()) {
      this.closeTracksMenu();
    } else {
      this.buildMenuRows();
      this.menuIndex = this.menuRows.findIndex((r) => r.kind === 'item');
      this.tracksMenu.removeAttribute('hidden');
      this.renderTracksMenu();
    }
    this.nudgeControls();
  }

  private closeTracksMenu(): void {
    this.tracksMenu.setAttribute('hidden', '');
    this.tracksBtn.classList.remove('is-active');
  }

  private buildMenuRows(): void {
    const rows: MenuRow[] = [];
    rows.push({ kind: 'header', label: 'Quality' });
    QUALITY_PRESETS.forEach((p, i) => rows.push({ kind: 'item', label: p.label, group: 'quality', value: i }));
    const audio = this.opts?.audioTracks ?? [];
    if (audio.length > 1) {
      rows.push({ kind: 'header', label: 'Audio' });
      audio.forEach((t) => rows.push({ kind: 'item', label: t.label, group: 'audio', value: t.index }));
    }
    const subs = this.opts?.subtitleTracks ?? [];
    if (subs.length > 0) {
      rows.push({ kind: 'header', label: 'Subtitles' });
      rows.push({ kind: 'item', label: 'Off', group: 'subs', value: null });
      subs.forEach((t) => rows.push({ kind: 'item', label: t.label, group: 'subs', value: t.index }));
    }
    this.menuRows = rows;
  }

  private isRowSelected(row: MenuRow): boolean {
    if (row.group === 'quality') return row.value === this.qualityPresetIdx;
    if (row.group === 'audio') {
      // Until the user picks one, the first listed track (Jellyfin's default) is current.
      const current = this.audioIndex ?? this.opts?.audioTracks?.[0]?.index;
      return row.value === current;
    }
    if (row.group === 'subs') return row.value === this.subtitleIndex;
    return false;
  }

  private renderTracksMenu(): void {
    this.tracksMenu.textContent = '';
    this.menuRows.forEach((row, i) => {
      const el = document.createElement('div');
      if (row.kind === 'header') {
        el.className = 'vp-menu-header';
        el.textContent = row.label;
      } else {
        el.className = 'vp-menu-row';
        el.classList.toggle('is-selected', this.isRowSelected(row));
        el.classList.toggle('vp-focused', i === this.menuIndex);
        el.textContent = row.label;
        el.addEventListener('click', () => {
          this.menuIndex = i;
          this.activateMenuRow();
        });
      }
      this.tracksMenu.appendChild(el);
    });
    this.tracksBtn.classList.add('is-active');
  }

  private activateMenuRow(): void {
    const row = this.menuRows[this.menuIndex];
    if (!row || row.kind !== 'item') return;
    if (row.group === 'quality') this.qualityPresetIdx = row.value as number;
    else if (row.group === 'audio') this.audioIndex = row.value as number;
    else if (row.group === 'subs') {
      this.subtitleIndex = row.value as number | null;
      // A text subtitle (or turning them off) needs no new stream at all —
      // swap the sidecar and keep playing. Only a bitmap track, or dropping a
      // burn-in already baked into the picture, has to go back to the server.
      if (this.applySubtitleWithoutReload(this.subtitleIndex)) {
        this.renderTracksMenu();
        this.nudgeControls();
        return;
      }
    }
    this.renderTracksMenu(); // reflect the new checkmark immediately
    this.applyStreamSelection();
    this.nudgeControls();
  }

  /**
   * Try to honour a subtitle pick without rebuilding the stream.
   * Returns false when only a server-side re-encode can do it, in which case
   * the caller falls through to applyStreamSelection().
   */
  private applySubtitleWithoutReload(streamIndex: number | null): boolean {
    // Pixels already baked into the video can only be removed or changed by
    // encoding a new stream.
    if (this.burnedInSubtitleIndex !== null) return false;
    if (streamIndex === null) {
      this.setSubtitleSidecar(null);
      return true;
    }
    const url = this.opts?.buildSubtitleTrack?.(streamIndex);
    if (!url) return false; // bitmap subtitle — burn-in is the only renderer
    this.setSubtitleSidecar(url);
    this.subtitlesBtn.classList.add('is-active');
    return true;
  }

  // Rebuild the HLS stream for the current quality/audio/subtitle picks, then
  // resume where we were. Any explicit pick forces the transcode path — the
  // direct stream can't change tracks or bitrate.
  //
  // The rebuilt URL is a full VOD stream from 0:00 (NO StartTimeTicks): we
  // stash the current position in pendingLocalSeekSeconds and let onMediaReady
  // native-seek there once the new stream is playable. Jellyfin restarts the
  // encode server-side at that segment (~1s), so the new tracks come up at the
  // current spot without StartTimeTicks (and its segment-rejection bug) and
  // without ever bouncing the picture back to 0:00.
  private applyStreamSelection(): void {
    const build = this.opts?.buildStream;
    if (!this.opts || !build) return;
    const resumeAt = this.currentAbsoluteSeconds();
    // Stop the encode we're replacing so ffmpeg jobs don't pile up (one
    // orphaned job per track change, all reading the same file concurrently).
    this.stopCurrentEncode();
    const preset = QUALITY_PRESETS[this.qualityPresetIdx] ?? QUALITY_PRESETS[0];
    // Only ask the server to burn a subtitle in when the client genuinely
    // cannot draw it. Passing a TEXT track's index here would force a full
    // re-encode for captions the <track> sidecar renders for free — the exact
    // cost this path exists to avoid.
    const burnIn = this.subtitleIndex !== null && this.opts?.buildSubtitleTrack?.(this.subtitleIndex) == null
      ? this.subtitleIndex
      : undefined;
    this.burnedInSubtitleIndex = burnIn ?? null;
    // The new stream carries its own captions (or none); drop any sidecar so
    // the two can't both be on screen.
    if (burnIn !== undefined) this.setSubtitleSidecar(null);
    else if (this.subtitleIndex !== null) {
      const url = this.opts?.buildSubtitleTrack?.(this.subtitleIndex);
      if (url) this.setSubtitleSidecar(url);
    }
    const sel: StreamSelection = {
      maxBitrate: preset.maxBitrate,
      maxWidth: preset.maxWidth,
      audioStreamIndex: this.audioIndex,
      subtitleStreamIndex: burnIn,
    };
    const src = build(sel);
    // Adopt the new session id immediately: a second change before this stream
    // goes live must stop THIS job, not the one before it.
    this.currentPlaySessionId = getLastHlsPlaySessionId();
    this.pendingLocalSeekSeconds = resumeAt > 0.5 ? resumeAt : null;
    this.pendingLocalSeekSetAtMs = Date.now();
    this.sources = [{ src, isHls: true }];
    this.sourceIndex = 0;
    this.setSpinner(true);
    this.tryCurrentSource();
  }

  /** Seek to an ABSOLUTE position in the item's full runtime — the single
   *  entry point for ±10s, progress-bar clicks, and resume.
   *
   *  Both direct play and HLS seek NATIVELY: set video.currentTime and let the
   *  media element / hls.js do the rest. The Jellyfin HLS stream is a full VOD
   *  playlist that lists every segment, so hls.js just fetches the one at the
   *  target; if the encoder hasn't reached it, Jellyfin restarts the transcode
   *  server-side at that point and serves it in ~1s (measured against the live
   *  server). There is no client-side stream rebuild, so a seek can never
   *  restart the movie at 0:00 or churn a fresh PlaySessionId. The 'waiting' /
   *  'canplay' media events drive the spinner during the fetch. */
  private seekTo(absoluteSeconds: number): void {
    const dur = this.totalDurationSeconds();
    if (!isFinite(dur) || dur <= 0) return;
    const target = Math.min(Math.max(absoluteSeconds, 0), dur);
    // A stream swap (audio-restore reload or track/quality change) is mid-air:
    // the media element was just torn down and reads currentTime 0. Redirect
    // the seek into the resume position so the fresh stream comes up at the
    // target instead of racing a write onto a dead element.
    //
    // The redirect expires: this latch is cleared only by onMediaReady(), so a
    // swap that never became playable used to leave it set forever — and then
    // every ±10s press and every scrub silently updated a variable and
    // returned, with the movie frozen behind the spinner. Past the deadline we
    // assume the swap is dead and drive the element directly; the watchdog is
    // separately working to get a live stream back under it.
    if (this.pendingLocalSeekSeconds !== null && Date.now() - this.pendingLocalSeekSetAtMs < PENDING_SEEK_MAX_MS) {
      this.pendingLocalSeekSeconds = target;
      this.updateProgressUI();
      this.reportProgressNow();
      return;
    }
    this.log(`[Player] seek → ${target.toFixed(1)}s (native)`);
    this.video.currentTime = target;
    this.updateProgressUI();
    this.reportProgressNow();
  }

  // ── Progress reporting ───────────────────────────────────────────────────────

  private currentPositionTicks(): number {
    return Math.round(this.currentAbsoluteSeconds() * TICKS_PER_SECOND);
  }

  private reportProgressNow(): void {
    this.opts?.onProgress?.(this.currentPositionTicks(), this.video.paused);
  }

  private startProgressReporting(): void {
    if (this.progressTimer !== null) clearInterval(this.progressTimer);
    this.progressTimer = window.setInterval(() => {
      if (!this.video.paused) this.reportProgressNow();
    }, PROGRESS_REPORT_MS);
  }

  // ── Teardown ─────────────────────────────────────────────────────────────────

  /** Fire-and-forget: tell the server to kill the ffmpeg job of the HLS
   *  stream we're abandoning. Every abandon path — rebuild, close(), and a
   *  defensive re-open — funnels through here so at most one encode is ever
   *  live for this player, and the session id can't be double-stopped. */
  private stopCurrentEncode(): void {
    if (!this.currentPlaySessionId) return;
    void stopActiveEncoding(this.currentPlaySessionId, (msg) => this.log(msg)).catch(() => {});
    this.currentPlaySessionId = undefined;
  }

  private disposeHls(): void {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
  }

  private teardownPlayback(): void {
    if (this.hideTimer !== null) { clearTimeout(this.hideTimer); this.hideTimer = null; }
    if (this.progressTimer !== null) { clearInterval(this.progressTimer); this.progressTimer = null; }
    this.stopStallWatchdog();
    this.pendingLocalSeekSeconds = null;
    this.video.pause();
    this.disposeHls();
    this.removeNativeListener();
    this.video.removeAttribute('src');
    this.video.load(); // release the decoder / network connection
    this.setSpinner(false);
  }
}

/** Format seconds as H:MM:SS or M:SS. */
function formatTime(totalSeconds: number): string {
  if (!isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor((totalSeconds / 60) % 60);
  const h = Math.floor(totalSeconds / 3600);
  const ss = s.toString().padStart(2, '0');
  if (h > 0) {
    const mm = m.toString().padStart(2, '0');
    return `${h}:${mm}:${ss}`;
  }
  return `${m}:${ss}`;
}

/** Pull just the StartTimeTicks query param out of a built stream URL for
 *  logging — never log the full URL (it carries api_key/PlaySessionId). */
function extractStartTimeTicks(src: string): number {
  try {
    const raw = new URL(src, window.location.href).searchParams.get('StartTimeTicks');
    return raw ? Number(raw) : 0;
  } catch {
    return 0;
  }
}
