// Ceiling-hung CRT TVs playing an ambient movie streamed from the store's media
// server, with HRTF positional audio. Self-contained fixture: owns its <video>
// element, HLS pipeline, VideoTexture, and AudioContext, and tears them all down
// in dispose(). Swap this class out (via FixtureContext) for a different TV
// layout.
import * as THREE from 'three';
import type Hls from 'hls.js';

let HlsMod: typeof import('hls.js').default | null = null;
async function loadHls() {
  HlsMod ??= (await import('hls.js')).default;
  return HlsMod;
}
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Movie } from './jellyfin';
import { CENTER_WALKWAY } from './store-layout';
import { FixtureContext, StoreFixture } from './fixtures';
import { loadProp } from './props';
import { getActiveTheme } from './themes';
import { makeCurvedScreenGeometry, makeTubeOverlayMaterial, makeCrtTestCardTexture } from './crt-tube';
import { makeCrtGlassMaterial } from './glass-reflection';
import { tvPoolLibraryIds } from './library-settings';
import { TV_PATCH_LAYER } from './scene-shared';
import { assetUrl } from './asset-url';
import {
  activeProvider,
  providerForKind,
  providerForSource,
  sessionOf,
} from './providers/active-provider';
import { connectionForTitle } from './media-sources';
import type { ProviderSession } from './providers/media-source-provider';
import type { PlaybackRequestOptions } from './providers/media-source-provider';
import { getSegmentFixLoader } from './hls-segment-fix';

// Media-server position unit: 100ns ticks, the currency PlaybackRequestOptions
// speaks in (Jellyfin StartTimeTicks; the Plex adapter divides back down to the
// seconds its transcoder wants).
const TICKS_PER_SECOND = 10_000_000;

// What this fixture asks the server to encode. The CRT screen mesh covers a few
// hundred pixels on-screen — decoding and re-uploading it at source resolution
// wastes decode CPU, HLS bandwidth, and server transcode capacity for no visible
// gain. (A backend whose transcoder ignores one of these, as Plex's does with
// width, simply sends more than we need.)
const TV_STREAM_MAX_WIDTH = 640;
const TV_STREAM_BITRATE = 600_000;

// How long the server gets to put a first frame on the glass before the
// fixture stops waiting on it — see armStreamWatchdog.
const STREAM_WATCHDOG_MS = 20_000;

// How long a source gets, once the element itself claims a picture is ready
// (readyState >= HAVE_CURRENT_DATA / 'loadeddata'), to actually present one
// decoded frame — see armDecodeLivenessCheck. Deliberately far shorter than
// STREAM_WATCHDOG_MS: that timer covers a slow SERVER (a NAS spinning up a
// transcode, a manifest that takes a while to arrive), where readyState
// staying low for seconds is normal. This one only starts once the element
// says it already has data, so a healthy decoder has nothing left to wait
// on — the first frame of anything playable lands in well under a second.
// (#72: on this project's own broken-hardware-decode test box, readyState
// reaches HAVE_ENOUGH_DATA almost immediately and then nothing ever decodes —
// the 20s watchdog's `readyState >= 2` early-out treats that as success and
// never fires, which is exactly how a dead decoder was able to sit on the
// page indefinitely, poisoning Remote Play's canvas capture the whole time.)
const DECODE_LIVENESS_MS = 3_000;

// Dead tube: near-black phosphor. It carries NO reflection of its own — the
// glass pane in front owns every reflection on this set, so an off screen and
// a playing screen catch the room identically. Built by two paths (a set that
// never had a source, and one that gave up on the picture it had), hence a
// module-level maker rather than a literal in buildHardware.
function makeDeadTubeMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0x0b0e14, roughness: 0.4, metalness: 0 });
}

// The bundled in-store promo loop the screens fall back to with no server to
// stream from — a 30s Big Buck Bunny extract, CC BY 3.0 (Blender Foundation).
// Full provenance and the exact ffmpeg recipe: public/demo-clip/ATTRIBUTION.md.
//
// VP9/Opus, deliberately, where the STREAMED path asks Jellyfin for H.264/AAC.
// That path has no choice — H.264 is what the server transcodes to — but a file
// this project ships does, and royalty-free means it plays on the distro
// Chromium builds that omit the proprietary codecs, with no licensing question
// hanging over a bundled asset in a GPL repo.
const DEMO_LOOP_PATH = 'demo-clip/big-buck-bunny.webm';

/**
 * How far into a title to drop in — you never walk into a store and find every
 * monitor at frame one. A fraction of the RUNTIME, and only when the runtime is
 * actually known: `runTimeTicks` first (both backends set it), the display
 * string second, and otherwise the beginning.
 *
 * The old code guessed 90 minutes for anything it couldn't parse and leaned on
 * a client-side `min(seek, duration * 0.7)` clamp once metadata arrived to undo
 * the guess. The offset is a server-side request parameter now (it has to be —
 * it's how Plex's transcoder takes it), so there is no second chance to correct
 * it: an offset past the end is a transcode that never produces a frame. Guess
 * nothing.
 */
function tvStartOffsetSec(movie: Movie): number {
  // A series container's runtime, where a backend reports one at all, describes
  // the SHOW — it says nothing about the length of the one episode that is
  // about to play. Start those at the beginning.
  if (movie.isSeries) return 0;
  let runtimeSec = 0;
  if (movie.runTimeTicks && movie.runTimeTicks > 0) {
    runtimeSec = movie.runTimeTicks / TICKS_PER_SECOND;
  } else {
    const mins = parseInt(movie.duration, 10);
    if (Number.isFinite(mins) && mins > 0) runtimeSec = mins * 60;
  }
  if (runtimeSec <= 0) return 0;
  return runtimeSec * (0.05 + Math.random() * 0.60);
}

/**
 * Whether the bundled loop may play. On unless `bb_tv_demo_loop=0` — the switch
 * exists so a run can insist on dead glass: the screenshot harness defaults it
 * off, since a decoding video makes every still it takes differ frame to frame.
 */
function demoLoopEnabled(): boolean {
  try {
    return localStorage.getItem('bb_tv_demo_loop') !== '0';
  } catch {
    return true; // no storage (SSR/worker) — the loop is the friendlier default
  }
}

// Front bezel: a flat rounded-rect frame with a rectangular aperture, extruded
// a little proud of the shell's front face. Shared by the ceiling sets and the
// 2000 wall bank (module-level so both paths build the same frame).
function makeBezelFrame(outerW: number, outerH: number, innerW: number, innerH: number, depth: number, radius = 0.10): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const ow = outerW / 2, oh = outerH / 2;
  shape.moveTo(-ow + radius, -oh);
  shape.lineTo(ow - radius, -oh);
  shape.quadraticCurveTo(ow, -oh, ow, -oh + radius);
  shape.lineTo(ow, oh - radius);
  shape.quadraticCurveTo(ow, oh, ow - radius, oh);
  shape.lineTo(-ow + radius, oh);
  shape.quadraticCurveTo(-ow, oh, -ow, oh - radius);
  shape.lineTo(-ow, -oh + radius);
  shape.quadraticCurveTo(-ow, -oh, -ow + radius, -oh);

  const hole = new THREE.Path();
  const iw = innerW / 2, ih = innerH / 2;
  hole.moveTo(-iw, -ih);
  hole.lineTo(iw, -ih);
  hole.lineTo(iw, ih);
  hole.lineTo(-iw, ih);
  hole.lineTo(-iw, -ih);
  shape.holes.push(hole);

  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6, steps: 1 });
}

// Outward bulge of the curved CRT "glass" the video is mapped onto. The
// curved geometry itself now lives in crt-tube.ts (makeCurvedScreenGeometry),
// shared with every other in-scene CRT; the emissive video material sits
// directly on that mesh so it reads as the tube face, not a floating plane.
const SCREEN_BULGE = 0.035;
// See the gloss-pane comments below: extra reflection gain for the ambient
// sets, which are flatter and further away than the desk terminals.
const CEILING_GLASS_GAIN = 1.7;

/**
 * Conform the picture to the tube face: FIT VERTICALLY (owner ruling
 * 2026-08-16). The movie's full HEIGHT spans the full height of the glass, its
 * aspect ratio is preserved, and whatever hangs off the sides is cropped evenly
 * — which for any widescreen source on these 4:3 tubes means losing a slice of
 * the outer left and right edges. That is the intended trade: a real store's
 * monitors were fed a 4:3 pan-and-scan feed, and both alternatives read as
 * faults — letterbox bars look like broken glass at this size, and the former
 * edge-to-edge stretch squashed every face on screen.
 *
 * Implemented as a UV rect on the shared VideoTexture, so it costs nothing per
 * frame and every set fed by this texture picks it up at once. A source
 * NARROWER than the tube (4:3 or academy content) can't be cropped sideways, so
 * it fills the width and gives up a sliver of top and bottom instead — the one
 * rule that always holds is that the picture is never distorted. Note the UV
 * rect can only ever crop: repeat > 1 would sample outside the frame and smear
 * clamped edge pixels, hence the min().
 *
 * Called with no decoded frame yet (videoWidth 0), it leaves the identity rect
 * in place; the 'resize'/'loadedmetadata' listeners re-run it the moment the
 * real dimensions land.
 */
function fitVideoToTube(tex: THREE.Texture, video: HTMLVideoElement, screenAspect: number): void {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh || !isFinite(screenAspect) || screenAspect <= 0) {
    tex.repeat.set(1, 1);
    tex.offset.set(0, 0);
    return;
  }
  const videoAspect = vw / vh;
  const repeatX = Math.min(1, screenAspect / videoAspect); // < 1 => sides cropped
  const repeatY = Math.min(1, videoAspect / screenAspect); // < 1 => top/bottom cropped
  tex.repeat.set(repeatX, repeatY);
  tex.offset.set((1 - repeatX) / 2, (1 - repeatY) / 2); // centre the crop
  (window as any).__tvVideoFit = { vw, vh, videoAspect, screenAspect, repeatX, repeatY };
}

// Tag one whole SET for the partial-composite patch (see
// src/partial-composite.ts): while the camera is parked and the picture is the
// only thing moving, these meshes are re-drawn on their own over the cached
// beauty buffer instead of the whole store. layers.enable is additive — bit 0
// stays set, so the normal render, the mirrors and the AO pass never notice.
//
// The WHOLE set, not just the screen stack. The scanline overlay and the glass
// pane are transparent and cover the tube's full silhouette, so wherever the
// bezel rim (or the shell) beats the picture on depth they would blend a SECOND
// time over a cached pixel that already contains them. Re-drawing the set's
// opaque parts too refreshes that base, so every transparent overlay lands on a
// fresh pixel exactly once — measured: rim error 45/255 over ~50 px with the
// screen stack alone, 0 with the set. (The opaque re-draws are pinned to their
// own pixels by EqualDepth — see PartialComposite.patchDraw.)
function markPatchLayer(root: THREE.Object3D): void {
  root.traverse((o) => o.layers.enable(TV_PATCH_LAYER));
}

// The pieces of one ceiling TV that the async GLB upgrade needs to touch:
// hide/remove the procedural shell, re-fit the screen stack to the real tube.
interface TvParts {
  tvG: THREE.Group;
  body: THREE.Mesh;
  bezel: THREE.Mesh;
  screen: THREE.Mesh;
  scan: THREE.Mesh;
  gloss: THREE.Mesh;
}

export class AmbientTvs implements StoreFixture {
  // Aspect of the glass the video is mapped onto, w/h. Both built tube shapes
  // are 4:3, but the async GLB upgrade re-cuts the ceiling screens to the real
  // model's glass rect — so this is a field the crop reads at call time, not a
  // constant. Set by buildHardware/buildWallBank and again at the GLB swap.
  private screenAspect = 4 / 3;
  // Re-applies the fit-vertically UV crop (fitVideoToTube) to the live video
  // texture: on an HLS rendition switch (the <video> 'resize' event) and after
  // the GLB swap reshapes the screen, both of which change one side of the
  // ratio the crop is solved from. Null when there's no video.
  private refitVideoCrop: (() => void) | null = null;

  private hls: Hls | null = null;
  // Handle on the server-side encode feeding the sets, when the backend gave
  // one back (PlaybackSource.sessionId). Null on a direct stream, on the
  // bundled loop, and once the encode has been cancelled.
  private transcodeSessionId: string | null = null;
  // Which backend that encode is running on (GH #84) — on a multi-server store
  // the tube's current title may belong to a different server (and a different
  // provider kind) than the primary, and tearing the encode down through the
  // wrong one leaves it pinning CPU until it times out.
  private transcodeSourceKind: string | null = null;
  /** …and WHERE, so the DELETE lands on the box actually encoding. */
  private transcodeConn: { server: string; session: ProviderSession } | null = null;
  // What the shared <video> is currently carrying. 'stream' = the media
  // server's; 'loop' = the bundled promo clip; 'dead' = nothing, tubes dark.
  // The fallback ladder only ever descends, so this doubles as the guard that
  // keeps a late error from re-running a step already taken.
  private pictureSource: 'stream' | 'loop' | 'dead' = 'dead';
  private streamWatchdog: ReturnType<typeof setTimeout> | null = null;
  // Fast decoder-liveness timer — see DECODE_LIVENESS_MS / armDecodeLivenessCheck.
  private livenessWatchdog: ReturnType<typeof setTimeout> | null = null;
  // The library this fixture is allowed to draw from (build()'s `pool`,
  // retained so a title reaching its end (#70) can pick another one from the
  // same set without recomputing the library selection).
  private pool: Movie[] = [];
  // Every built screen, and the one material they share, so the picture can be
  // replaced by the dead-tube phosphor after the fact — see goDeadGlass.
  private screenMeshes: THREE.Mesh[] = [];
  private pictureMat: THREE.Material | null = null;
  private video: HTMLVideoElement | null = null;
  // Bundled-loop deferral (see playDemoLoop / releaseDeferredMedia).
  private mediaReleased = false;
  private deferredLoop: HTMLVideoElement | null = null;
  private videoTex: THREE.VideoTexture | null = null;
  // Last video time we uploaded, so we skip redundant GPU re-uploads of an
  // unchanged frame when the compositor runs above the video's frame rate.
  private lastVideoTime = -1;
  private audioCtx: AudioContext | null = null;
  private gestureUnlock: (() => void) | null = null;
  private readonly camFwd = new THREE.Vector3();
  private readonly camUp = new THREE.Vector3();
  // scratch (no per-frame allocation) — reused by isAnyTvInFrustum()
  private readonly _frustum = new THREE.Frustum();
  private readonly _projScreen = new THREE.Matrix4();
  private tvWorldSpheres: THREE.Sphere[] = [];
  private wasInFrustum = false;
  // Procedural-shell pieces per TV, for the async GLB body upgrade (T24).
  private tvParts: TvParts[] = [];
  private bodyMat: THREE.MeshStandardMaterial | null = null;
  private bezelMat: THREE.MeshStandardMaterial | null = null;
  // World-space screen poses (centre/normal/size), for the harness's tvclose
  // framing state. Built once per buildHardware; static thereafter.
  private screenPoses: { center: THREE.Vector3; normal: THREE.Vector3; width: number; height: number }[] = [];
  // Harness/dev-only static test card (bb_tv_testcard=1) standing in for the
  // video so the tube treatment is verifiable without a Jellyfin stream.
  private testCardTex: THREE.CanvasTexture | null = null;
  private disposed = false;
  // The one movie streaming to every set (all screens share a single video
  // element — see makeVideoTexture) — null when there's no stream (dead
  // glass / test card). Read by the TV peek's Select action (store-tv-peek.ts)
  // to jump straight to this title's box.
  private playingMovie: Movie | null = null;

  constructor(private ctx: FixtureContext) {}

  build(): void {
    // What the overhead sets may play (#39): libraries the user explicitly
    // selected (Settings → Playback → Overhead TVs, bb_tvlib_* toggles via
    // library-settings.ts) — or, with nothing selected, the original
    // family-genre heuristic over the whole catalog, so existing stores keep
    // their behavior. A selection that matches no loaded library (say, the
    // store stopped carrying it) falls back the same way rather than going
    // dark. Same gate for live streaming and the test-card stand-in below.
    const chosen = tvPoolLibraryIds();
    const allMovies: Movie[] = [];
    const chosenMovies: Movie[] = [];
    this.ctx.libraries.forEach(lib => lib.movies.forEach(m => {
      // A library the user EXPLICITLY picked contributes everything it shelves,
      // series containers included (#67). Dropping those before the library
      // check meant a TV-Shows library contributed nothing whatever its toggle
      // said — the first reporter had switched TV shows on and it could never
      // have done anything. A series container isn't itself streamable, but it
      // names an episode that is; openStream resolves one.
      if (chosen.has(lib.id)) chosenMovies.push(m);
      // The unselected default is still films only. That heuristic is what runs
      // on every store that has never opened the drawer, and quietly putting
      // television on their monitors is not this fix's to make.
      if (m.isSeries) return;
      allMovies.push(m);
    }));
    let pool: Movie[];
    if (chosenMovies.length > 0) {
      pool = chosenMovies;
      this.ctx.log(`[System] CRT TVs: drawing from ${chosen.size} selected library(ies).`, 'system');
    } else {
      const FAMILY_GENRES = new Set(['Family']);
      pool = allMovies.filter(m => m.genres.some(g => FAMILY_GENRES.has(g)));
      if (pool.length === 0) pool = allMovies;
    }
    (window as any).__tvPool = {
      selected: chosen.size,
      size: pool.length,
      libs: [...new Set(pool.map(m => m.libraryName))].sort(),
    };
    this.pool = pool;

    // The TVs are store furniture — they hang from the ceiling regardless of
    // whether a stream is available; without a server they just show dead glass.
    let videoTex: THREE.VideoTexture | null = null;
    if (pool.length > 0 && this.ctx.jellyfinUrl && this.ctx.jellyfinToken) {
      const movie = this.pickPoolTitle(null);
      const seekSec = tvStartOffsetSec(movie);
      videoTex = this.makeVideoTexture(movie, seekSec);
      if (videoTex) {
        this.playingMovie = movie;
        this.ctx.log(`[System] CRT TVs: "${movie.title}" from ~${Math.round(seekSec / 60)}min`, 'system');
      }
    } else if (pool.length > 0) {
      // No server to stream from at all: the public demo, or a store whose
      // credentials have been cleared (the change-server / logged-out path).
      // Both fields are provider-neutral — boot-flow.ts writes jellyfin_url /
      // jellyfin_token for WHICHEVER backend authenticated — so reaching here
      // means there is nothing configured, not that the backend is unfamiliar.
      //
      // A video store's monitors always had SOMETHING on them, and a dark tube
      // reads as broken hardware — so run the bundled 30-second promo loop.
      //
      // Resolving a "playing" identity here regardless keeps the TV-peek Select
      // action (jump to the box of what's playing) working offline; the loop is
      // house promo footage, not that title, exactly as the test card was.
      this.playingMovie = this.pickPoolTitle(null);
      // bb_tv_testcard wins when set: the static card is the DETERMINISTIC
      // stand-in the screenshot rigs pin the tube treatment against, and a
      // moving picture would make those shots differ frame to frame.
      if (localStorage.getItem('bb_tv_testcard') !== '1' && demoLoopEnabled()) {
        videoTex = this.makeDemoLoopTexture();
      }
    }
    this.buildHardware(videoTex);
  }

  /**
   * The ONE hidden <video> every set shares, and the VideoTexture on it.
   *
   * Deliberately independent of where the picture comes from: the audio graph,
   * the UV crop, the frame-upload chain and dispose() all bind to the ELEMENT,
   * so its source can arrive late and can be swapped out again mid-life without
   * any of them noticing. That is what lets a stream that turns out to be
   * unobtainable hand over to the bundled loop on the same glass.
   */
  private makeSharedVideo(): { video: HTMLVideoElement; videoTex: THREE.VideoTexture } {
    const video = document.createElement('video');
    video.setAttribute('style', 'position:fixed;left:-9999px;width:1px;height:1px;');
    video.crossOrigin = 'anonymous';
    // OFF by default (#70): a looping stream that wraps around can make
    // hls.js reload a manifest whose earliest segments have already fallen
    // out of the server's window, which is what turned into a fatal
    // manifestLoadError. The honest behaviour on reaching the end of a title
    // is to play a DIFFERENT one — see the 'ended' listener below — so the
    // stream path leaves this false and lets 'ended' fire the normal way.
    // playDemoLoop turns it back on for the one bundled clip, which has
    // nowhere else to advance to and is meant to run forever.
    video.loop = false;
    video.volume = 1.0; // gain controlled by Web Audio PannerNode
    video.muted = true; // autoplay policy: boot muted; unmuted on first user gesture
    video.playsInline = true;
    document.body.appendChild(video);
    this.video = video;

    const videoTex = new THREE.VideoTexture(video);
    videoTex.colorSpace = THREE.SRGBColorSpace;
    this.videoTex = videoTex;

    // Fit the picture VERTICALLY to the tube, cropping the widescreen overhang
    // off both sides — see fitVideoToTube.
    const applyFit = () => fitVideoToTube(videoTex, video, this.screenAspect);
    // 'resize' fires whenever the decoded frame size changes (e.g. an HLS ABR
    // ladder switch to a rendition with a different shape) — re-solve the crop
    // against the new source dimensions.
    video.addEventListener('resize', applyFit);
    this.refitVideoCrop = applyFit;

    // One error listener for the element's whole life, routed on which source
    // is currently loaded — the stream steps down to the loop, the loop steps
    // down to dark. Registered here rather than per-source so a swap can't
    // leave a stale handler behind that fires for the wrong phase.
    //
    // MEDIA_ERR_DECODE (#72) is flagged as a decoder fault: the element is
    // telling us the pipeline itself broke, not that a URL 404'd or a
    // connection was refused, and a broken decoder will fail identically on
    // the next source too — see giveUpOnStream's decoderFault branch.
    video.addEventListener('error', () => {
      const mediaError = video.error;
      const code = mediaError ? `media error ${mediaError.code}` : 'media error';
      const decoderFault = mediaError?.code === MediaError.MEDIA_ERR_DECODE;
      if (this.pictureSource === 'stream') this.giveUpOnStream(code, { decoderFault });
      else if (this.pictureSource === 'loop') this.goDeadGlass(`demo loop ${code}`);
    });
    // The stream reached its natural end (only fires with loop off, i.e. on
    // the stream path — see the comment above). Move on to another title
    // rather than sitting on a black/frozen tube (#70).
    video.addEventListener('ended', () => {
      if (this.pictureSource === 'stream') void this.advanceToNextTitle();
    });
    // First decoded frame of ANY source: the element THINKS the picture is
    // real, so stand the slow watchdog down and re-solve the crop against the
    // true frame size — but that belief is exactly what #72 found lying on a
    // broken decoder, so arm the fast liveness check before trusting it.
    video.addEventListener('loadeddata', () => {
      this.clearStreamWatchdog();
      this.refitVideoCrop?.();
      // The other half of the breadcrumb giveUpOnStream writes: what actually
      // ended up on the glass, decided by a decoded frame rather than by
      // configuration. Cheap, and it is the one question a support log about
      // the ceiling TVs always has to answer first.
      (window as any).__tvStream = {
        ok: true,
        source: this.pictureSource,
        title: this.playingMovie?.title ?? null,
      };
      this.armDecodeLivenessCheck(video);
    });

    return { video, videoTex };
  }

  // Spin up the shared <video> against the server's stream. The element and its
  // texture are created synchronously — build() has to hand buildHardware() a
  // texture in the same turn — while the URL resolves through the provider,
  // which is necessarily async.
  private makeVideoTexture(movie: Movie, seekSec: number): THREE.VideoTexture {
    const { video, videoTex } = this.makeSharedVideo();
    this.pictureSource = 'stream';
    this.armStreamWatchdog();
    void this.openStream(movie, seekSec, video);
    return videoTex;
  }

  // Pick a title from the pool this fixture was built against, preferring
  // not to immediately repeat `exclude` when there's another option — used
  // both for the opening choice (exclude: null) and for moving on at the end
  // of a title (#70).
  private pickPoolTitle(exclude: Movie | null): Movie {
    const pool = this.pool;
    let next = pool[Math.floor(Math.random() * pool.length)];
    if (exclude && pool.length > 1) {
      for (let tries = 0; tries < 5 && next.id === exclude.id; tries++) {
        next = pool[Math.floor(Math.random() * pool.length)];
      }
    }
    return next;
  }

  /**
   * A title reached its end honestly (#70) — not a network failure, just the
   * runtime running out. `video.loop` is off for the stream path exactly so
   * this can happen: a real store's monitors didn't freeze on the last frame
   * or silently rewind, they moved to another tape.
   *
   * All the screens this fixture builds — the two ceiling sets, or the 2000
   * theme's three-wide wall bank — already share this ONE <video>/HLS
   * pipeline (see the class comment); that sharing predates this fix and
   * settles the "independent or in step" question the ticket raises before
   * it's even asked here. There is only ever one active transcode for the
   * whole fixture, so advancing every screen together isn't a design choice
   * made in this method — it's what the existing architecture already does.
   * Giving each screen its own encode would multiply the transcode cost #69
   * is about, for a loop-desync nobody watching a wall of monitors would
   * ever register.
   */
  private async advanceToNextTitle(): Promise<void> {
    if (this.disposed || this.pictureSource !== 'stream') return;
    const video = this.video;
    if (!video || this.pool.length === 0) {
      this.goDeadGlass('title ended, no next title to advance to');
      return;
    }
    // The title that just finished stops billing the server NOW, same as
    // every other step-down here — not deferred to the next teardown.
    this.cancelTranscode();
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    const next = this.pickPoolTitle(this.playingMovie);
    this.playingMovie = next;
    const seekSec = tvStartOffsetSec(next);
    this.ctx.log(`[System] CRT TVs: "${next.title}" from ~${Math.round(seekSec / 60)}min`, 'system');
    this.armStreamWatchdog();
    await this.openStream(next, seekSec, video);
  }

  /**
   * Give the server a bounded amount of time to actually produce a picture.
   *
   * The error handlers below catch the loud failures — a 404, a refused
   * connection, an undecodable segment — and they catch them in milliseconds.
   * This covers the quiet ones: a server that accepts the request and then
   * never finishes starting the encode, a transcode the box hasn't the CPU to
   * begin, a manifest that parses and yields no media. Generous on purpose,
   * because a NAS spinning up a transcode is slow but not broken; the point is
   * only that a tube is never left black forever with nothing said.
   */
  private armStreamWatchdog(): void {
    this.clearStreamWatchdog();
    this.streamWatchdog = setTimeout(() => {
      this.streamWatchdog = null;
      const video = this.video;
      if (video && video.readyState >= 2) return; // a picture arrived; nothing to do
      this.giveUpOnStream(`no picture after ${Math.round(STREAM_WATCHDOG_MS / 1000)}s`);
    }, STREAM_WATCHDOG_MS);
  }

  private clearStreamWatchdog(): void {
    if (this.streamWatchdog !== null) {
      clearTimeout(this.streamWatchdog);
      this.streamWatchdog = null;
    }
  }

  /**
   * The fast half of the fallback machinery (#72). armStreamWatchdog only
   * ever fires while `readyState < 2` — the moment the element claims to
   * have *any* current data it bails out and trusts that a picture is on the
   * way. On this project's broken-hardware-decode test box that claim is
   * false: readyState reaches HAVE_ENOUGH_DATA almost immediately and then
   * nothing ever actually decodes, so the slow watchdog's early-out let a
   * dead decoder sit on the page indefinitely — which is what starved Remote
   * Play's canvas capture to zero frames while the store rendered fine.
   *
   * So once 'loadeddata' fires, this asks the one question the fast way:
   * did an actual frame reach the screen? `requestVideoFrameCallback` is the
   * precise signal — it only runs for a frame that was really decoded and
   * presented — with a `currentTime` delta as the fallback for a webview
   * that lacks it. Three seconds is generous for ANY working decoder (first-
   * frame latency on buffered data is normally well under one) and eighteen
   * times shorter than the no-data watchdog it complements, because there is
   * nothing left to wait ON here — the element already claims the data is in
   * hand.
   */
  private armDecodeLivenessCheck(video: HTMLVideoElement): void {
    this.clearLivenessWatchdog();
    let sawFrame = false;
    const rvfc = (video as any).requestVideoFrameCallback;
    if (typeof rvfc === 'function') {
      rvfc.call(video, () => { sawFrame = true; });
    }
    const startTime = video.currentTime;
    this.livenessWatchdog = setTimeout(() => {
      this.livenessWatchdog = null;
      if (this.disposed || this.pictureSource === 'dead') return;
      if (sawFrame || video.currentTime - startTime > 0.05) return; // a real frame landed
      this.onDecoderFault(`no frame decoded ${Math.round(DECODE_LIVENESS_MS / 1000)}s after data claimed ready`);
    }, DECODE_LIVENESS_MS);
  }

  private clearLivenessWatchdog(): void {
    if (this.livenessWatchdog !== null) {
      clearTimeout(this.livenessWatchdog);
      this.livenessWatchdog = null;
    }
  }

  /**
   * The liveness check came up empty: whatever is attached to the element
   * cannot actually be decoded. Route it through the SAME step-down ladder a
   * network failure uses (giveUpOnStream), tagged as a decoder fault so it
   * skips the demo-loop rung — see that method's decoderFault branch for why.
   * Reached on the loop source itself (no stream configured at all — the
   * demo, or a store with no server) goes straight to dead glass: it is
   * already the bottom rung, there is nothing lower to fall back to.
   */
  private onDecoderFault(reason: string): void {
    if (this.disposed || this.pictureSource === 'dead') return;
    if (this.pictureSource === 'stream') {
      this.giveUpOnStream(reason, { decoderFault: true });
    } else {
      this.goDeadGlass(reason);
    }
  }

  /**
   * The stream is not going to happen — put SOMETHING on the glass (#67).
   *
   * The old code decided between "stream" and "bundled loop" once, up front, on
   * whether a URL and a token existed. That is the wrong question: it can only
   * ever describe the store's configuration, never whether a picture came back.
   * A store configured against a server that cannot serve this fixture — the
   * whole of the Plex bug, but equally an unreachable server, a refused
   * transcode, a codec a distro Chromium omits — committed to a doomed stream
   * and then had no second move, because the loop lived in the ELSE of that
   * same gate. The configured-but-broken case got the worst outcome available
   * and the unconfigured case got the graceful one.
   *
   * So the question asked here is the honest one, and it is asked late: did we
   * get a playable stream? Any answer of no lands on the loop, or on the
   * dead-tube look when the loop is switched off.
   *
   * And it says so at WARNING level, every time. Reaching this method at all
   * means the store IS configured against a server — the stream path is only
   * entered with a URL and a token in hand — so a failure here is never the
   * ordinary offline case, it is a server that was asked for a picture and did
   * not produce one. The fallback below is deliberately invisible (that is its
   * job: the ceiling is never blank), and for one evening that invisibility hid
   * a total Jellyfin outage behind a cheerfully playing promo loop. console.warn
   * is what puts the reason and the backend into the session log
   * (debug-log.ts tees it to disk, tagged [WARN]), so the next silent failure
   * is one grep away instead of a rebuild away.
   */
  private giveUpOnStream(reason: string, opts: { decoderFault?: boolean } = {}): void {
    if (this.disposed || this.pictureSource !== 'stream') return;
    this.clearStreamWatchdog();
    this.clearLivenessWatchdog();
    let backend = 'unknown backend';
    try {
      backend = localStorage.getItem('provider_kind') ?? 'jellyfin';
    } catch { /* no storage — the label is a nicety, not a gate */ }
    console.warn(
      `[ambient-tvs] ${backend}: the configured server produced no picture for ` +
      `"${this.playingMovie?.title ?? 'the chosen title'}" (${reason}) — falling back.`
    );
    (window as any).__tvStream = { backend, ok: false, reason, title: this.playingMovie?.title ?? null };
    this.ctx.log(`[System] CRT TVs: no picture from the server (${reason}).`, 'system');
    // The encode is abandoned NOW, not at teardown — the server is still
    // burning CPU on a stream nobody will ever read.
    this.cancelTranscode();
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    const video = this.video;
    // decoderFault (#72) skips the demo-loop rung entirely: every OTHER
    // reason this method runs is about THIS stream (a bad URL, a refused
    // connection, a manifest that never arrived), so trying a different
    // source is reasonable. A dead decoder is the machine's video pipeline,
    // not the stream's fault — handing it the loop file would just feed the
    // same broken pipeline another video and keep a dead decoder attached to
    // the page, which is precisely what starved Remote Play's canvas capture
    // to zero frames while the store rendered fine.
    if (opts.decoderFault || !video || !demoLoopEnabled()) {
      this.goDeadGlass(reason);
      return;
    }
    this.ctx.log('[System] CRT TVs: running the in-store promo loop instead.', 'system');
    this.pictureSource = 'loop';
    this.playDemoLoop(video);
  }

  /**
   * Nothing left to show: retire the video pipeline and put the dead-tube
   * phosphor on the glass — the same near-black material the fixture builds
   * when there was never a source, rather than a MeshBasicMaterial holding an
   * empty VideoTexture. They are not the same thing to look at: one is a switched
   * -off television catching the room, the other is a hole cut in the set.
   */
  private goDeadGlass(reason: string): void {
    if (this.disposed || this.pictureSource === 'dead') return;
    this.pictureSource = 'dead';
    console.warn(`[ambient-tvs] ${reason} — screens stay dark`);
    this.teardownVideo();
    const dead = makeDeadTubeMaterial();
    for (const mesh of this.screenMeshes) mesh.material = dead;
    // The scene-wide teardown disposes whatever material is ATTACHED to a mesh,
    // so the one just detached would otherwise never be freed.
    this.pictureMat?.dispose();
    this.pictureMat = dead;
    this.ctx.requestRender();
  }

  // Start playing whatever source has just been attached: re-solve the crop now
  // that a real frame size is known, and let it run.
  private startPlayback(video: HTMLVideoElement): void {
    this.refitVideoCrop?.();
    video.play().catch(() => {});
  }

  /**
   * Ask THE STORE'S BACKEND for a stream — never a hand-built URL (#67).
   *
   * This fixture used to assemble `${server}/Videos/${id}/master.m3u8` itself
   * and gate on `jellyfinUrl && jellyfinToken`. Those two fields are shared by
   * every backend (boot-flow.ts writes them for whichever provider
   * authenticated), so on a Plex install the gate passed with a Plex address, a
   * Plex token and a ratingKey, and requested a route Plex does not have: 404,
   * and two independent field reports of black glass over the aisles. Exactly
   * the bug class playback-routing.ts was created to kill for the main player.
   *
   * The provider's async resolvePlaybackSource is the seam taken here rather
   * than that module's synchronous builders, because it is the one that hands
   * back the transcode's SESSION ID — see cancelTranscode(). The player can't
   * await (its URL is rebuilt inside a user-gesture chain); a fixture building
   * at scene-build time can.
   */
  private async openStream(movie: Movie, seekSec: number, video: HTMLVideoElement): Promise<void> {
    let url: string;
    let kind: 'direct' | 'transcode';
    try {
      // Routed to the server THIS title came from (GH #84). The pool draws
      // from the whole merged catalog, so on a two-server store roughly half
      // the ceiling's picks belong to the other box — asking the primary for
      // them is the same 404-into-black-glass failure #67 fixed for Plex,
      // just arriving by a different route.
      const conn = connectionForTitle(movie);
      const provider = providerForSource(conn?.source);
      const session = conn
        ? conn.session
        : sessionOf(this.ctx.jellyfinToken, localStorage.getItem('jellyfin_userid') ?? '');
      const server = conn?.url ?? this.ctx.jellyfinUrl;

      // A series container has no file behind it — what a TV-Shows library
      // actually contributes to the monitors is an EPISODE (#67). The first one
      // of the run: an ambient screen wants somewhere sensible to come in, and
      // dropping a stranger into the middle of a season is not it.
      let itemId = movie.id;
      if (movie.isSeries) {
        const episode = await provider.fetchFirstEpisodeOfSeries(
          server,
          session,
          movie.id
        );
        if (this.disposed) return;
        if (!episode) {
          this.giveUpOnStream(`"${movie.title}" has no episodes to play`);
          return;
        }
        itemId = episode.id;
      }

      // Both built-in providers accept a `kind` alongside PlaybackRequestOptions
      // (jellyfin-provider.ts, plex-provider.ts) but the interface hasn't grown
      // it, so it rides in on a widening intersection rather than a cast. It
      // matters: without it a backend defaults to DIRECT play, and handing a
      // 40 Mbps remux to a screen this size is the opposite of what's wanted.
      const req: PlaybackRequestOptions & { kind: 'transcode' } = {
        kind: 'transcode',
        maxWidth: TV_STREAM_MAX_WIDTH,
        maxBitrate: TV_STREAM_BITRATE,
        // Drop in mid-film SERVER-side. The old code seeked the element after
        // metadata arrived; expressing it as an offset in the request is what
        // both backends actually take (Jellyfin StartTimeTicks, Plex `offset`),
        // and it saves the seek round-trip on a stream that is already being
        // transcoded to order.
        startPositionTicks: Math.round(seekSec * TICKS_PER_SECOND),
      };
      const source = await provider.resolvePlaybackSource(
        server,
        session,
        itemId,
        req
      );
      url = source.url;
      kind = source.kind;
      // Held so the encode can be torn down again — see cancelTranscode().
      if (source.kind === 'transcode') {
        this.transcodeSessionId = source.sessionId ?? null;
        this.transcodeSourceKind = conn?.source.kind ?? null;
        this.transcodeConn = { server, session };
      }
    } catch (e: any) {
      console.warn('[ambient-tvs] could not resolve a stream:', e);
      this.giveUpOnStream(`server would not name a stream (${e?.message ?? e})`);
      return;
    }
    if (this.disposed) return;

    if (kind === 'direct') {
      // A backend with no transcoder hands back the file itself; the element
      // plays it with no HLS pipeline to build.
      video.src = url;
      video.addEventListener('loadedmetadata', () => this.startPlayback(video), { once: true });
      return;
    }

    const HlsClass = await loadHls();
    if (this.disposed) return;
    if (HlsClass && HlsClass.isSupported()) {
      const hls = new HlsClass({
        startLevel: -1,
        // The SAME loader the full-screen player uses (hls-segment-fix.ts), and
        // for the same reason: this fixture asks the server to start the encode
        // at an offset, and Jellyfin then 400s every segment request that
        // inherits StartTimeTicks from the playlist query. Without it a real
        // Jellyfin store loses essentially EVERY movie stream — tvStartOffsetSec
        // never returns 0 for a film — while a series, which starts at 0, plays
        // fine and hides the fault (#67).
        loader: getSegmentFixLoader(HlsClass) as any,
      });
      // The missing handler that made the Plex 404 invisible. hls.js reports
      // its own failures here and NOWHERE else — a manifest that 404s never
      // reaches the <video>, so the element's error event never fires and the
      // tube just sits black. Only fatal errors step down; hls.js recovers from
      // the rest on its own and a stutter is not a reason to drop the film.
      hls.on(HlsClass.Events.ERROR, (_evt: unknown, data: { fatal?: boolean; details?: string; type?: string }) => {
        if (!data?.fatal) return;
        // hls.js already sorts its own fatal errors into network vs. media —
        // MEDIA_ERROR is its name for the decode-pipeline class (#72), the
        // same distinction the plain <video> 'error' listener draws from
        // MediaError.MEDIA_ERR_DECODE. A manifest 404 or a refused connection
        // still falls through to the demo loop as before.
        const decoderFault = data.type === HlsClass.ErrorTypes.MEDIA_ERROR;
        this.giveUpOnStream(`hls ${data.details ?? 'fatal error'}`, { decoderFault });
      });
      hls.on(HlsClass.Events.MANIFEST_PARSED, () => {
        video.addEventListener('loadedmetadata', () => this.startPlayback(video), { once: true });
      });
      hls.loadSource(url);
      hls.attachMedia(video);
      this.hls = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.addEventListener('loadedmetadata', () => this.startPlayback(video), { once: true });
    } else {
      // No MSE and no native HLS: this webview cannot play the only thing the
      // server offered.
      this.giveUpOnStream('no HLS support in this webview');
    }
  }

  /**
   * Tear down the server-side encode this fixture started. An abandoned
   * transcode pins the user's server CPU until it times out on its own, and the
   * ceiling TVs abandon one every time the scene is rebuilt — which the Overhead
   * TVs toggles themselves do, being applyMode 'rebuild-scene'.
   *
   * Capability-gated rather than probed, per the note on the interface. As of
   * #69, PlexProvider remembers its own connection internally (invoked from
   * authenticate()/fetchLibraries()/resolvePlaybackSource()), so this call is
   * effective on both backends — no separate wiring needed here.
   */
  private cancelTranscode(): void {
    const sessionId = this.transcodeSessionId;
    const kind = this.transcodeSourceKind;
    const conn = this.transcodeConn;
    this.transcodeSessionId = null;
    this.transcodeSourceKind = null;
    this.transcodeConn = null;
    if (!sessionId) return;
    try {
      const provider = kind ? providerForKind(kind) : activeProvider();
      if (!provider.capabilities.transcoding) return;
      provider.cancelActiveTranscode?.(sessionId, undefined, conn ?? undefined)?.catch(() => {});
    } catch {
      // Teardown never throws: an unknown provider kind here would mean the
      // install was downgraded mid-session, and the encode times out anyway.
    }
  }

  /**
   * The no-server path: the bundled promo loop instead of an HLS stream. Same
   * <video> + VideoTexture contract as makeVideoTexture (so setupTvAudio, the
   * pause/resume gates, the frame-upload chain and dispose() all work on it
   * unchanged) — just a plain looping file source, no HLS, no seek.
   *
   * The clip is already 640 wide and in the screens' own ballpark, so there is
   * nothing to negotiate: it starts at 0 and loops forever.
   */
  private makeDemoLoopTexture(): THREE.VideoTexture {
    const { video, videoTex } = this.makeSharedVideo();
    this.pictureSource = 'loop';
    this.playDemoLoop(video);
    return videoTex;
  }

  /**
   * Point the shared element at the bundled clip. Reached two ways: as the
   * opening source when there is no server at all, and as the step down from a
   * stream that never produced a picture (#67) — which is why it works on an
   * element that may already have had another source on it.
   *
   * The clip is already 640 wide and in the screens' own ballpark, so there is
   * nothing to negotiate: it starts at 0 and loops forever. A missing or
   * undecodable file falls through to the element's error handler and the
   * dead-tube look, and never blocks the store build.
   */
  private playDemoLoop(video: HTMLVideoElement): void {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    // Held back until the store has revealed (releaseDeferredMedia, called
    // off the boot's texture wait): the clip is ~1.9MB with preload=auto, and
    // at construction time every cover in the store is still downloading
    // behind the boot overlay — on a home connection it was streaming for the
    // whole texture wait, competing with the posters the reveal was gated on,
    // for screens nobody could see yet. After the reveal it starts at once;
    // the #67 step-down from a dead stream (always post-reveal) is unchanged.
    if (!this.mediaReleased) {
      this.deferredLoop = video;
      return;
    }
    video.removeAttribute('src'); // drop any MediaSource blob hls.js attached
    video.loop = true;
    video.preload = 'auto';
    video.src = assetUrl(DEMO_LOOP_PATH);
    video.addEventListener('loadedmetadata', () => this.startPlayback(video), { once: true });
    video.load();
  }

  /**
   * The store is on screen: start any media that was waiting for the covers
   * to finish (see playDemoLoop). Idempotent; a later playDemoLoop runs
   * immediately once this has been called.
   */
  public releaseDeferredMedia(): void {
    this.mediaReleased = true;
    const video = this.deferredLoop;
    this.deferredLoop = null;
    if (video && video === this.video) this.playDemoLoop(video);
  }

  // Build the two ceiling-hung TVs themselves (pole mounts, shells, screens,
  // positional audio). Kept separate from the streaming setup so the hardware
  // exists even when there's nothing to play.
  private buildHardware(videoTex: THREE.VideoTexture | null): void {
    this.tvWorldSpheres = [];
    this.tvParts = [];
    this.screenPoses = [];
    this.screenMeshes = [];

    // Harness/dev stand-in: with no Jellyfin stream the screens are dead
    // glass, which makes the curved-tube treatment unverifiable offline —
    // bb_tv_testcard=1 lights them with a static SMPTE-style card through the
    // exact material path the video uses. Zero per-frame cost (no <video>,
    // isPlaying() stays false, update() early-outs).
    let screenTex: THREE.Texture | null = videoTex;
    if (!screenTex && localStorage.getItem('bb_tv_testcard') === '1') {
      this.testCardTex = makeCrtTestCardTexture();
      screenTex = this.testCardTex;
    }

    // CRT dimensions: fat depth, tapered toward back
    const bodyW = 2.6, bodyH = 2.2, bodyD = 2.2;
    const screenW = 2.1, screenH = 1.575;
    const poleLen = 2.0;
    this.screenAspect = screenW / screenH; // what the video crop is solved against

    // CRT body: RoundedBoxGeometry gives soft plastic edges (boxier than before —
    // matches the squared-off desk-monitor shell rather than a rounded set), then
    // we squeeze the back vertices inward to get the characteristic CRT taper.
    const makeCrtBody = () => {
      const geo = new RoundedBoxGeometry(bodyW, bodyH, bodyD, 4, 0.08);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const z = pos.getZ(i);
        if (z < 0) {
          const t = (-z) / (bodyD / 2);       // 0 at centre, 1 at back face
          const sq = 1.0 - t * 0.24;          // 24% narrower at the very back
          pos.setX(i, pos.getX(i) * sq);
          pos.setY(i, pos.getY(i) * sq);
        }
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      return geo;
    };

    // (makeBezelFrame is now module-level, shared with the 2000 wall bank.)

    // Sony-PVM-style neutral grey shell — lighter than the old near-black so
    // the ceiling sets read as broadcast monitors, with the bezel a shade
    // darker to keep the frame/shell contrast.
    const bodyMat  = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.55, metalness: 0.04 });
    const bezelMat = new THREE.MeshStandardMaterial({ color: 0x9ba0a6, roughness: 0.6, metalness: 0.04 });
    this.bodyMat = bodyMat;
    this.bezelMat = bezelMat;
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x505050, roughness: 0.35, metalness: 0.88 });
    const screenMat = screenTex
      ? new THREE.MeshBasicMaterial({ map: screenTex })
      : makeDeadTubeMaterial();
    // Kept so goDeadGlass can retire the picture later: whether a source turns
    // out to be playable is not knowable at build time.
    this.pictureMat = screenMat;
    // Static tube overlay (crt-tube.ts): rounded corners falling off dark,
    // edge vignette, faint scanlines — the PHOSPHOR side of the tube, all of
    // which only darkens. The room reflection is the glass pane below.
    const scanMat = makeTubeOverlayMaterial();

    // 2000 store (Hamlet footage): a bank of THREE flush wall-mounted CRTs on
    // the back wall above the case grid, black bezels, all playing the same
    // feed — instead of the two ceiling-hung sets.
    if (getActiveTheme().id === 'bb-2000') {
      this.buildWallBank(screenMat, scanMat);
      return;
    }

    const storeWidth = this.ctx.storeWidth;
    const fieldLo   = 11.0 - storeWidth / 2 + 7.5;
    const fieldHi   = 11.0 + storeWidth / 2 - 7.5;
    const leftTvX   = (fieldLo + (11.0 - CENTER_WALKWAY / 2)) / 2;
    const rightTvX  = ((11.0 + CENTER_WALKWAY / 2) + fieldHi) / 2;
    const tvZ       = 15.0 - (15.0 - this.ctx.backWallZ) * 0.30;

    // screenNormal: the world-space direction the screen face points toward.
    // Build a "look-at with world-up constraint" so the TV stays landscape/upright.
    // setFromUnitVectors introduces an arbitrary roll; the matrix approach keeps +Y up.
    const makeTvRotation = (screenNormal: THREE.Vector3): THREE.Matrix4 => {
      const fwd   = screenNormal.clone().normalize();
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), fwd).normalize();
      const up    = new THREE.Vector3().crossVectors(fwd, right).normalize();
      return new THREE.Matrix4().makeBasis(right, up, fwd);
    };

    const addTv = (x: number, screenNormal: THREE.Vector3) => {
      const g = new THREE.Group();
      g.position.set(x, this.ctx.ceilingY, tvZ);

      // Ceiling plate
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.07, 14), poleMat);
      plate.position.y = -0.035;
      g.add(plate);

      // Vertical suspension pole
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, poleLen, 10), poleMat);
      pole.position.y = -poleLen / 2;
      g.add(pole);

      // Swivel joint knuckle at pole end
      const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.10, 10, 8), poleMat);
      knuckle.position.y = -poleLen;
      g.add(knuckle);

      // TV body sub-group: rotated to face screenNormal while staying upright.
      const tvG = new THREE.Group();
      const inwardUnit = new THREE.Vector3(screenNormal.x, 0, screenNormal.z).normalize();
      tvG.position.set(inwardUnit.x * 0.18, -poleLen - bodyH * 0.08, inwardUnit.z * 0.18);
      tvG.setRotationFromMatrix(makeTvRotation(screenNormal));

      const body = new THREE.Mesh(makeCrtBody(), bodyMat);
      body.castShadow = true;
      body.receiveShadow = true;
      tvG.add(body);
      this.ctx.addCollider(body);

      // Bezel: proud of the shell's front face, aperture sized a touch larger
      // than the screen so its rim overlaps the glass edge.
      const apertureW = screenW + 0.06, apertureH = screenH + 0.06;
      const bezelOuterW = bodyW - 0.08, bezelOuterH = bodyH - 0.08;
      const bezelDepth = 0.05;
      const bezel = new THREE.Mesh(
        makeBezelFrame(bezelOuterW, bezelOuterH, apertureW, apertureH, bezelDepth),
        bezelMat
      );
      bezel.position.z = bodyD / 2;
      bezel.castShadow = true;
      bezel.receiveShadow = true;
      tvG.add(bezel);

      // Screen: curved glass inset within the bezel aperture — its base sits
      // behind the bezel's front face, and the outward bulge brings the centre
      // up to just shy of flush with the frame.
      const screen = new THREE.Mesh(makeCurvedScreenGeometry(screenW, screenH, SCREEN_BULGE), screenMat);
      screen.position.z = bodyD / 2 + 0.01;
      tvG.add(screen);
      this.screenMeshes.push(screen);

      const scan = new THREE.Mesh(makeCurvedScreenGeometry(screenW, screenH, SCREEN_BULGE), scanMat);
      scan.position.z = screen.position.z + 0.002;
      tvG.add(scan);

      // Glass gloss goes outermost (past the scanlines) so reflections sit on
      // top of the picture the way they do on a real tube. One material PER
      // SET — teardown disposes materials, and these sets face opposite halves
      // of the store, so each wants its own reflection. Turned up relative to
      // the desk terminals: these tubes are nearly flat (SCREEN_BULGE is
      // shallow, so grazing angles are rare) and they hang across the room,
      // where a physical 4% head-on reflectance disappears entirely. The extra
      // gain buys the troffer rows back onto the glass.
      const gloss = new THREE.Mesh(makeCurvedScreenGeometry(screenW, screenH, SCREEN_BULGE), makeCrtGlassMaterial({ intensity: CEILING_GLASS_GAIN }));
      gloss.position.z = scan.position.z + 0.002;
      gloss.renderOrder = 1;
      tvG.add(gloss);

      this.tvParts.push({ tvG, body, bezel, screen, scan, gloss });

      g.add(tvG);
      markPatchLayer(g);
      this.ctx.scene.add(g);

      // Force update of matrixWorld so we can extract the correct world transform of the screen
      g.updateMatrixWorld(true);
      screen.geometry.computeBoundingSphere();
      if (screen.geometry.boundingSphere) {
        const worldSphere = screen.geometry.boundingSphere.clone();
        worldSphere.applyMatrix4(screen.matrixWorld);
        this.tvWorldSpheres.push(worldSphere);
      }
      this.pushScreenPose(screen, screenW, screenH);
    };

    // Screen normals: inward ±X, 45° downward, slight forward lean.
    // The makeTvRotation ensures the TV body stays landscape-upright (world-up constraint).
    addTv(leftTvX,  new THREE.Vector3( 0.8, -0.65, -0.3).normalize());
    addTv(rightTvX, new THREE.Vector3(-0.8, -0.65, -0.3).normalize());

    // T24: swap the procedural shells for the real CRT GLB once it loads.
    // Fire-and-forget — if models/tv_ceiling.glb hasn't been downloaded yet
    // (Sketchfab needs a human login), the procedural bodies above simply stay.
    void this.upgradeToGlbBodies();

    // Positional audio: route video through two PannerNodes at each TV's world position.
    // The listener position is updated every frame in update() so it tracks the camera.
    const video = this.video;
    if (!video || !videoTex) return; // dead-glass TVs are silent

    const tvBodyY = this.ctx.ceilingY - poleLen - bodyH * 0.08;
    try {
      const audioCtx = new AudioContext();
      this.audioCtx = audioCtx;
      audioCtx.resume().catch(() => {});

      const source = audioCtx.createMediaElementSource(video);
      const gain   = audioCtx.createGain();
      gain.gain.value = 0.35;
      source.connect(gain);

      const initPos = this.ctx.camera.position;
      if (audioCtx.listener.positionX !== undefined) {
        audioCtx.listener.positionX.value = initPos.x;
        audioCtx.listener.positionY.value = initPos.y;
        audioCtx.listener.positionZ.value = initPos.z;
      } else {
        audioCtx.listener.setPosition(initPos.x, initPos.y, initPos.z);
      }

      for (const tvX of [leftTvX, rightTvX]) {
        const panner = audioCtx.createPanner();
        panner.panningModel  = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance   = 5;
        panner.rolloffFactor = 1.8;
        panner.setPosition(tvX, tvBodyY, tvZ);
        gain.connect(panner);
        panner.connect(audioCtx.destination);
      }
    } catch (e) {
      // Web Audio unavailable — fall back to flat volume on the video element
      video.volume = 0.08;
    }

    // Autoplay policy: the video boots muted and the AudioContext starts
    // suspended. Unmute + resume on the first real user gesture (same idea as
    // retailAudio's lazy, gesture-driven context init).
    const unlock = () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      this.gestureUnlock = null;
      this.audioCtx?.resume().catch(() => {});
      if (this.video) {
        this.video.muted = false;
        if (this.video.paused) this.video.play().catch(() => {});
      }
    };
    this.gestureUnlock = unlock;
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
  }

  // 2000 store: a row of THREE flush wall-mounted CRTs on the back wall above
  // the case grid, black bezels, all sharing the one video feed — the Hamlet
  // footage's "wall of monitors playing the same trailer". No pole/ceiling
  // mount, no GLB upgrade (the ceiling GLB is a hanging set); the procedural
  // bezel + curved tube is the final look here.
  private buildWallBank(screenMat: THREE.Material, scanMat: THREE.Material): void {
    const screenW = 2.1, screenH = screenW * 0.75; // 4:3 — a substantial set
    this.screenAspect = screenW / screenH; // what the video crop is solved against
    const bezelPad = 0.2;
    const outerW = screenW + bezelPad * 2, outerH = screenH + bezelPad * 2;
    const pitch = outerW + 1.0; // + a stretch of periwinkle wall between sets
    const bezelDepth = 0.16;
    const outset = 0.5; // the housing cabinet juts this far off the wall (user)
    const bankZ = this.ctx.backWallZ + outset; // bezels sit on the housing front
    // High on the wall above the case grid (tops ~8ft) and above the New
    // Releases badges/promo band (~9.4), clamped clear of the ceiling — the
    // footage mounts the bank up in the clear upper wall.
    const CASE_TOP = 8.0, halfH = outerH / 2;
    // Sit lower on the wall (closer to the cases, per the footage), but the
    // ceiling clamp still wins so the housing never clips the deck up top.
    const bankY = Math.min(
      this.ctx.ceilingY - halfH - 1.1, // leave room for the taller housing surround
      Math.max(CASE_TOP + halfH + 0.9, CASE_TOP + (this.ctx.ceilingY - CASE_TOP) * 0.38),
    );
    const centerX = 11.0;

    // ── Grey housing cabinet that holds all three sets ───────────────────────
    // One box outset `outset` off the wall (user), with a slightly keystoned
    // front — wider along the top than the bottom, taller on the left than the
    // right — matching the footage's built-in monitor bank. The black-bezel TVs
    // sit proud of its front face.
    {
      const bankHalfW = pitch + outerW / 2; // half-span of the three sets
      const mX = 0.7, mYt = 0.85, mYb = 0.72; // surround (a touch more on top)
      const baseHalfW = bankHalfW + mX;
      const topY = bankY + outerH / 2 + mYt, botY = bankY - outerH / 2 - mYb;
      const midY = (topY + botY) / 2, baseHalfH = (topY - botY) / 2;
      // Skew: subtly wider on top, and clearly taller on the left (user).
      const topHalfW = baseHalfW * 1.03, botHalfW = baseHalfW * 0.97;
      const leftHalfH = baseHalfH * 1.1, rightHalfH = baseHalfH * 0.9;
      const corners: [number, number][] = [
        [centerX - botHalfW, midY - leftHalfH],  // bottom-left
        [centerX + botHalfW, midY - rightHalfH], // bottom-right
        [centerX + topHalfW, midY + rightHalfH], // top-right
        [centerX - topHalfW, midY + leftHalfH],  // top-left
      ];
      const hShape = new THREE.Shape();
      corners.forEach(([x, y], i) => (i === 0 ? hShape.moveTo(x, y) : hShape.lineTo(x, y)));
      hShape.closePath();
      // Extrudes +Z from the wall out to the front face at backWallZ + outset.
      const hGeo = new THREE.ExtrudeGeometry(hShape, { depth: outset, bevelEnabled: false });
      const housingMat = new THREE.MeshStandardMaterial({ color: 0xc4941f, roughness: 0.72, metalness: 0.05 }); // amber (user)
      const housing = new THREE.Mesh(hGeo, housingMat);
      housing.position.z = this.ctx.backWallZ;
      housing.castShadow = true;
      housing.receiveShadow = true;
      this.ctx.scene.add(housing);
      this.ctx.addCollider(housing);
    }

    const blackBezelMat = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.5, metalness: 0.1 });
    const positions: THREE.Vector3[] = [];

    for (let i = -1; i <= 1; i++) {
      const x = centerX + i * pitch;
      const g = new THREE.Group();
      g.position.set(x, bankY, bankZ); // screens face +Z (no rotation)

      const bezel = new THREE.Mesh(
        makeBezelFrame(outerW, outerH, screenW + 0.04, screenH + 0.04, bezelDepth, 0.06),
        blackBezelMat,
      );
      bezel.castShadow = true;
      bezel.receiveShadow = true;
      g.add(bezel);
      this.ctx.addCollider(bezel);

      // Play exactly what the ceiling sets play — the one shared video feed
      // (dead glass when there's no stream) — and recess it BEHIND the glass
      // pane, which sits at the bezel front (user).
      const screen = new THREE.Mesh(makeCurvedScreenGeometry(screenW, screenH, SCREEN_BULGE), screenMat);
      screen.position.z = 0.03; // deep in the aperture
      g.add(screen);
      this.screenMeshes.push(screen);
      const scan = new THREE.Mesh(makeCurvedScreenGeometry(screenW, screenH, SCREEN_BULGE), scanMat);
      scan.position.z = 0.036;
      g.add(scan);
      const gloss = new THREE.Mesh(makeCurvedScreenGeometry(screenW, screenH, SCREEN_BULGE), makeCrtGlassMaterial({ intensity: CEILING_GLASS_GAIN }));
      gloss.position.z = bezelDepth - 0.02; // glass pane up at the bezel front
      gloss.renderOrder = 1;
      g.add(gloss);

      markPatchLayer(g);
      this.ctx.scene.add(g);
      g.updateMatrixWorld(true);
      screen.geometry.computeBoundingSphere();
      if (screen.geometry.boundingSphere) {
        this.tvWorldSpheres.push(screen.geometry.boundingSphere.clone().applyMatrix4(screen.matrixWorld));
      }
      this.pushScreenPose(screen, screenW, screenH);
      positions.push(new THREE.Vector3(x, bankY, bankZ));
    }

    this.setupTvAudio(positions);
  }

  // Route the shared <video> through one HRTF panner per TV position. Shared by
  // the ceiling sets and the wall bank; a no-op (flat quiet fallback) when there
  // is no stream. Also arms the gesture unlock that unmutes on first input.
  private setupTvAudio(positions: THREE.Vector3[]): void {
    const video = this.video, videoTex = this.videoTex;
    if (!video || !videoTex) return; // dead-glass TVs are silent
    try {
      const audioCtx = new AudioContext();
      this.audioCtx = audioCtx;
      audioCtx.resume().catch(() => {});
      const source = audioCtx.createMediaElementSource(video);
      const gain = audioCtx.createGain();
      gain.gain.value = 0.35;
      source.connect(gain);
      const p = this.ctx.camera.position;
      if (audioCtx.listener.positionX !== undefined) {
        audioCtx.listener.positionX.value = p.x;
        audioCtx.listener.positionY.value = p.y;
        audioCtx.listener.positionZ.value = p.z;
      } else {
        audioCtx.listener.setPosition(p.x, p.y, p.z);
      }
      for (const pos of positions) {
        const panner = audioCtx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 5;
        panner.rolloffFactor = 1.8;
        panner.setPosition(pos.x, pos.y, pos.z);
        gain.connect(panner);
        panner.connect(audioCtx.destination);
      }
    } catch (e) {
      video.volume = 0.08;
    }
    const unlock = () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      this.gestureUnlock = null;
      this.audioCtx?.resume().catch(() => {});
      if (this.video) {
        this.video.muted = false;
        if (this.video.paused) this.video.play().catch(() => {});
      }
    };
    this.gestureUnlock = unlock;
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
  }

  // T24: replace each TV's procedural RoundedBox shell with the real CRT GLB
  // (models/tv_ceiling.glb — "Old Television from 90's", Zgon, CC-BY 4.0).
  // The GLB is loaded/prepped ONCE by the props registry; both TVs get clones
  // that share that single geometry + material set. The existing video screen
  // stack (picture / scanlines / gloss) is kept and re-fitted onto the model's
  // glass rect, and the model's own glass meshes are hidden so nothing
  // z-fights. When the file is missing (fresh checkout — Sketchfab downloads
  // are a human step) loadProp resolves null and the procedural shells stay.
  private async upgradeToGlbBodies(): Promise<void> {
    const handle = await loadProp('tv_ceiling');
    if (!handle || this.disposed || this.tvParts.length === 0) return;

    const SCREEN_W = 2.1; // keep the picture the same width as the procedural set
    let rect = handle.screenRect;
    // Extra uniform scale so the GLB's glass is exactly SCREEN_W wide. Sanity
    // gate: on a clean CRT model this lands near 1.0. Far outside that means
    // the screenMatch caught the wrong mesh or the GLB carries extra scene
    // junk that dwarfed the tube during fit-to-bbox — scaling the whole model
    // by it would produce a room-sized TV. Fall back to whole-body alignment.
    let extra = rect ? SCREEN_W / rect.width : 1;
    if (rect && (extra < 0.7 || extra > 1.5)) {
      console.warn(`[ambient-tvs] tv_ceiling glass rect ${rect.width.toFixed(2)}ft is implausible vs ${SCREEN_W}ft screen (scale ${extra.toFixed(2)}) — using whole-body alignment`);
      rect = null;
      extra = 1;
    }
    const newH = rect ? rect.height * extra : 0;

    for (const part of this.tvParts) {
      const wrapper = new THREE.Group();
      wrapper.add(handle.instantiate({ hideScreen: true }));
      // Prepped props face -Z (props.ts contract); the TV sub-group's screen
      // faces +Z, so turn the model around.
      wrapper.rotation.y = Math.PI;
      wrapper.scale.setScalar(extra);
      const planeZ = part.screen.position.z;
      if (rect) {
        // Map the glass-face centre through yaw-PI ((x,z) -> (-x,-z)) and the
        // extra scale, then offset the wrapper so that point lands centred
        // just behind the existing video plane. estimateFrontFaceRect() (props.ts)
        // anchors its z on the model's single frontmost vertex, then glassFrac's
        // inset (-0.02) pushes that reference 0.02ft PROUD of it — so naively
        // landing that point on the video plane puts the picture ~0.5in in FRONT
        // of the model's own shell (verified: model's true frontmost vertex maps
        // to tvG-local z≈1.068 vs the screen's fixed 1.11). A picture floating
        // ahead of the shell has no visible bezel behind it at grazing/underneath
        // angles (the F8-032 ceiling view) — the shell is fully hidden behind its
        // own screen, reading as a colour card pasted in mid-air. GLASS_RECESS_FIX
        // pushes the whole model forward so its real shell face sits proud of the
        // video plane by a believable ~0.6in CRT bezel-rim depth instead.
        const GLASS_RECESS_FIX = 0.085;
        wrapper.position.set(
          rect.center.x * extra,
          -rect.center.y * extra,
          (planeZ - 0.02 + GLASS_RECESS_FIX) + rect.center.z * extra,
        );
      } else {
        // No recognizable glass slot: centre the model on the screen axis and
        // bring its front face up to the video plane.
        wrapper.position.set(0, -handle.size.y / 2 * extra, (planeZ - 0.02) - handle.size.z / 2 * extra);
      }
      part.tvG.add(wrapper);
      markPatchLayer(wrapper); // the real tube joins the partial-composite patch

      // Retire the procedural shell. (addCollider only registers the mesh —
      // nothing raycasts the list — so removing it here is safe.)
      part.tvG.remove(part.body);
      part.body.geometry.dispose();
      part.tvG.remove(part.bezel);
      part.bezel.geometry.dispose();

      // Re-fit the screen stack to the real tube's aspect (width stays SCREEN_W).
      if (rect && newH > 0) {
        for (const m of [part.screen, part.scan, part.gloss]) {
          m.geometry.dispose();
          m.geometry = makeCurvedScreenGeometry(SCREEN_W, newH, SCREEN_BULGE);
        }
      }
    }
    this.bodyMat?.dispose();
    this.bodyMat = null;
    this.bezelMat?.dispose();
    this.bezelMat = null;

    if (rect && newH > 0) {
      // The real tube's glass is rarely exactly 4:3 — re-solve the vertical fit
      // against the shape actually on screen now.
      this.screenAspect = SCREEN_W / newH;
      this.refitVideoCrop?.();
    }

    // Recompute the frustum-gating spheres for the reshaped screens.
    this.tvWorldSpheres = [];
    for (const part of this.tvParts) {
      part.tvG.updateWorldMatrix(true, true);
      part.screen.geometry.computeBoundingSphere();
      const bs = part.screen.geometry.boundingSphere;
      if (bs) this.tvWorldSpheres.push(bs.clone().applyMatrix4(part.screen.matrixWorld));
    }
    this.wasInFrustum = false;
    this.ctx.requestShadowRefresh();
    this.ctx.requestRender();
  }

  // Record a built screen's world pose (assumes matrixWorld is current).
  // Screens face their local +Z; poses never change after build.
  private pushScreenPose(screen: THREE.Mesh, width: number, height: number): void {
    const center = new THREE.Vector3();
    screen.getWorldPosition(center);
    const quat = new THREE.Quaternion();
    screen.getWorldQuaternion(quat);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quat);
    this.screenPoses.push({ center, normal, width, height });
  }

  // Harness (tvclose state): world poses of every TV screen so the camera can
  // dock square in front of one without hand-hunting coordinates.
  getScreenPoses(): { center: THREE.Vector3; normal: THREE.Vector3; width: number; height: number }[] {
    return this.screenPoses;
  }

  // The title currently streaming to every set, or null with no stream
  // (dead glass) or the harness test card. Used by the TV peek's Select
  // action to jump to that title's box.
  getPlayingMovie(): Movie | null {
    return this.playingMovie;
  }

  // Per-frame: sync the Web Audio listener with the camera, and force the
  // VideoTexture upload (requestVideoFrameCallback chain can break after a seek
  // in Tauri's webview, so we drive needsUpdate manually).
  private isAnyTvInFrustum(): boolean {
    if (this.tvWorldSpheres.length === 0) return false;

    const camera = this.ctx.camera;
    camera.updateMatrixWorld();

    this._projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._projScreen);

    for (let i = 0; i < this.tvWorldSpheres.length; i++) {
      if (this._frustum.intersectsSphere(this.tvWorldSpheres[i])) {
        return true;
      }
    }
    return false;
  }

  private checkFrustumTransitions(): boolean {
    const inFrustum = this.isAnyTvInFrustum();
    if (inFrustum && !this.wasInFrustum) {
      this.ctx.requestRender();
    }
    this.wasInFrustum = inFrustum;
    return inFrustum;
  }

  // Per-frame: sync the Web Audio listener with the camera, and force the
  // VideoTexture upload (requestVideoFrameCallback chain can break after a seek
  // in Tauri's webview, so we drive needsUpdate manually).
  update(_timeMs: number): void {
    if (this.videoTex && this.video && !this.video.paused) {
      this.checkFrustumTransitions();
    }

    if (this.audioCtx && this.audioCtx.state === 'running') {
      const al = this.audioCtx.listener;
      const cam = this.ctx.camera;
      const p = cam.position;
      this.camFwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
      this.camUp.set(0, 1, 0).applyQuaternion(cam.quaternion);
      if (al.positionX !== undefined) {
        al.positionX.value = p.x; al.positionY.value = p.y; al.positionZ.value = p.z;
        al.forwardX.value = this.camFwd.x; al.forwardY.value = this.camFwd.y; al.forwardZ.value = this.camFwd.z;
        al.upX.value = this.camUp.x; al.upY.value = this.camUp.y; al.upZ.value = this.camUp.z;
      } else {
        al.setPosition(p.x, p.y, p.z);
        al.setOrientation(this.camFwd.x, this.camFwd.y, this.camFwd.z, this.camUp.x, this.camUp.y, this.camUp.z);
      }
    }

    if (this.videoTex && this.video && !this.video.paused) {
      // Only re-upload when the decoder has actually advanced to a new frame.
      // The composite can run at display refresh (clerk/browse/case-pop hold the
      // ACTIVE tier) while the HLS stream is ~24fps, so an unguarded needsUpdate
      // re-uploads the same frame via texImage2D several times over — pure waste
      // on the multi-day idle path.
      const t = this.video.currentTime;
      if (t !== this.lastVideoTime) {
        this.lastVideoTime = t;
        this.videoTex.needsUpdate = true;
      }
    }
  }

  // Render-on-demand (issue #24): true while the shared TV video is actively
  // presenting frames, so the scene keeps compositing at video rate (VIDEO tier)
  // even when nothing else moves. A paused/ended/unbuffered video reports false so
  // the scene can drop to the idle heartbeat.
  isPlaying(): boolean {
    const videoPlaying = this.forcePlaying ||
      !!(this.video && !this.video.paused && !this.video.ended && this.video.readyState >= 2);
    if (!videoPlaying) return false;
    return this.checkFrustumTransitions();
  }

  // ── Harness/dev hooks (no Jellyfin stream offline) ────────────────────────
  // The test card lights the tubes but never moves, so isPlaying() is false and
  // the VIDEO tier — and with it the partial-composite path — can't be reached
  // in a screenshot/probe run. These two let a probe stand in for a stream:
  // claim to be playing, and repaint the card so the picture actually changes.
  private forcePlaying = false;

  debugForcePlaying(on: boolean): void {
    this.forcePlaying = on;
    this.wasInFrustum = false; // re-announce the transition on the next tick
  }

  /** Repaint the test card (a sweeping bar) so the "picture changed" case is testable. */
  debugPokeTestCard(phase: number): boolean {
    if (!this.testCardTex) return false;
    const canvas = this.testCardTex.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const w = canvas.width, h = canvas.height;
    const x = (phase % 1) * w;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, h * 0.18, w, h * 0.30);
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(x, h * 0.18, w * 0.22, h * 0.30);
    ctx.fillStyle = '#ff2020';
    ctx.fillRect((x + w * 0.4) % w, h * 0.24, w * 0.10, h * 0.18);
    this.testCardTex.needsUpdate = true;
    return true;
  }

  pause(): void {
    this.video?.pause();
    // Screensaver/occlusion idle path: this AudioContext isn't reached by
    // retailAudio's suspendForIdle (that's a separate context), so without
    // this it stays 'running' — keeping the OS audio device open — for the
    // entire idle duration, including the occluded-window state where the
    // ambient TVs are the sole remaining audio stream.
    if (this.audioCtx && this.audioCtx.state === 'running') {
      this.audioCtx.suspend().catch(() => {});
    }
  }

  resume(): void {
    this.video?.play().catch(() => {});
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  }

  /**
   * Retire the whole video pipeline: the encode the server is running for us,
   * the HLS transmuxer, the element, its texture and the positional-audio
   * graph. Shared by dispose() and by goDeadGlass(), which reaches this same
   * state mid-life when there turns out to be nothing to show.
   */
  private teardownVideo(): void {
    this.clearStreamWatchdog();
    this.clearLivenessWatchdog();
    // Before the pipeline goes: tell the server to stop encoding for us.
    this.cancelTranscode();
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    if (this.video) {
      this.video.pause();
      this.video.src = '';
      this.video.remove();
      this.video = null;
    }
    if (this.videoTex) {
      this.videoTex.dispose();
      this.videoTex = null;
    }
    this.refitVideoCrop = null;
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }

  dispose(): void {
    this.disposed = true; // gates the async GLB upgrade against a dead scene
    if (this.gestureUnlock) {
      window.removeEventListener('pointerdown', this.gestureUnlock, true);
      window.removeEventListener('keydown', this.gestureUnlock, true);
      this.gestureUnlock = null;
    }
    this.teardownVideo();
    this.screenMeshes = [];
    this.pictureMat = null; // owned by the mesh it's on; the scene sweep frees it
    if (this.testCardTex) {
      this.testCardTex.dispose();
      this.testCardTex = null;
    }
  }
}
