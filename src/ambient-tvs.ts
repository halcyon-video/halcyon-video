// Ceiling-hung CRT TVs playing an ambient family movie streamed from Jellyfin,
// with HRTF positional audio. Self-contained fixture: owns its <video> element,
// HLS pipeline, VideoTexture, and AudioContext, and tears them all down in
// dispose(). Swap this class out (via FixtureContext) for a different TV layout.
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
import { TV_PATCH_LAYER } from './scene-shared';

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
  // The CRT tube face is ~4:3; the video is stretched to FILL it edge to edge
  // (see makeVideoTexture), so no stored screen-aspect drives any UV crop.
  // Re-asserts the full-frame FILL UV mapping (set up by makeVideoTexture;
  // re-invoked after the GLB swap reshapes the screen) so the movie always
  // covers the whole tube edge to edge with no bars.
  private refitVideoCrop: (() => void) | null = null;

  private hls: Hls | null = null;
  private video: HTMLVideoElement | null = null;
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
    const FAMILY_GENRES = new Set(['Family']);
    const allMovies: Movie[] = [];
    this.ctx.libraries.forEach(lib => lib.movies.forEach(m => { if (!m.isSeries) allMovies.push(m); }));
    let pool = allMovies.filter(m => m.genres.some(g => FAMILY_GENRES.has(g)));
    if (pool.length === 0) pool = allMovies;

    // The TVs are store furniture — they hang from the ceiling regardless of
    // whether a stream is available; without a server they just show dead glass.
    let videoTex: THREE.VideoTexture | null = null;
    if (pool.length > 0 && this.ctx.jellyfinUrl && this.ctx.jellyfinToken) {
      const movie = pool[Math.floor(Math.random() * pool.length)];
      const durationMin = parseInt(movie.duration) || 90;
      const seekSec = durationMin * 60 * (0.05 + Math.random() * 0.60);
      videoTex = this.makeVideoTexture(movie, durationMin, seekSec);
      if (videoTex) {
        this.playingMovie = movie;
        this.ctx.log(`[System] CRT TVs: "${movie.title}" from ~${Math.round(seekSec / 60)}min`, 'system');
      }
    } else if (pool.length > 0 && localStorage.getItem('bb_tv_testcard') === '1') {
      // Same harness/dev stand-in as the test-card picture below: with no
      // Jellyfin stream there's nothing to actually decode, but resolving a
      // "playing" identity too keeps the TV-peek Select action (jump to the
      // box of what's playing) testable offline.
      this.playingMovie = pool[Math.floor(Math.random() * pool.length)];
    }
    this.buildHardware(videoTex);
  }

  // Spin up the hidden <video> + HLS pipeline feeding the ceiling TVs. Returns
  // null when streaming isn't possible (no server, no MSE) — the TVs still get
  // built, just with dead screens.
  private makeVideoTexture(movie: Movie, durationMin: number, seekSec: number): THREE.VideoTexture | null {
    const base = this.ctx.jellyfinUrl.replace(/\/$/, '');
    const qs = new URLSearchParams({
      api_key: this.ctx.jellyfinToken,
      MediaSourceId: movie.id,
      VideoCodec: 'h264', AudioCodec: 'aac',
      // The CRT screen mesh covers a few hundred pixels on-screen — decoding
      // and re-uploading it at source resolution wastes decode CPU, HLS
      // bandwidth, and server transcode capacity for no visible gain.
      MaxWidth: '640', VideoBitrate: '600000', AudioBitrate: '128000',
      MaxAudioChannels: '2', TranscodingProtocol: 'hls',
      TranscodingContainer: 'ts', MinSegments: '1', BreakOnNonKeyFrames: 'true',
    });
    const hlsSrc = `${base}/Videos/${movie.id}/master.m3u8?${qs}`;

    const video = document.createElement('video');
    video.setAttribute('style', 'position:fixed;left:-9999px;width:1px;height:1px;');
    video.crossOrigin = 'anonymous';
    video.loop = true;
    video.volume = 1.0; // gain controlled by Web Audio PannerNode
    video.muted = true; // autoplay policy: boot muted; unmuted on first user gesture
    video.playsInline = true;
    document.body.appendChild(video);
    this.video = video;

    const videoTex = new THREE.VideoTexture(video);
    videoTex.colorSpace = THREE.SRGBColorSpace;
    this.videoTex = videoTex;

    // Full-frame FILL (CSS object-fit: fill): stretch the WHOLE video across
    // the TV's 4:3 face (default 0..1 UV) so the picture reaches every edge with
    // NO letterbox/pillarbox bars and NO cropping — the movie is conformed to
    // the TV's own aspect ratio, exactly what the user wants for these ambient
    // sets. This neutralizes the former crop-to-fill (issue #142) while keeping
    // the function + its callsites (the 'resize' listener and refitVideoCrop /
    // GLB-swap re-fit at buildRealTube) intact and harmless — they just re-assert
    // the identity UV rect after a rendition switch or screen-shape change.
    const applyFullFill = () => {
      // Reset to the identity UV rect: whole frame → whole quad, filled edge to
      // edge in the screen's aspect (screenAspect no longer participates).
      videoTex.repeat.set(1, 1);
      videoTex.offset.set(0, 0);
    };
    // 'resize' fires whenever the decoded frame size changes (e.g. an HLS ABR
    // ladder switch to a different rendition) — harmless to re-run; keeps the
    // full-fill mapping in force if the source dimensions ever change.
    video.addEventListener('resize', applyFullFill);
    this.refitVideoCrop = applyFullFill;

    const seekAndPlay = () => {
      applyFullFill(); // re-assert the full-frame fill once metadata is available
      const maxSec = isFinite(video.duration) ? video.duration * 0.70 : durationMin * 60;
      video.currentTime = Math.min(seekSec, maxSec);
      video.play().catch(() => {});
    };

    loadHls().then((HlsClass) => {
      if (HlsClass && HlsClass.isSupported()) {
        const hls = new HlsClass({ startLevel: -1 });
        hls.loadSource(hlsSrc);
        hls.attachMedia(video);
        hls.on(HlsClass.Events.MANIFEST_PARSED, () => {
          video.addEventListener('loadedmetadata', seekAndPlay, { once: true });
        });
        this.hls = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = hlsSrc;
        video.addEventListener('loadedmetadata', seekAndPlay, { once: true });
      }
    });

    return videoTex;
  }

  // Build the two ceiling-hung TVs themselves (pole mounts, shells, screens,
  // positional audio). Kept separate from the streaming setup so the hardware
  // exists even when there's nothing to play.
  private buildHardware(videoTex: THREE.VideoTexture | null): void {
    this.tvWorldSpheres = [];
    this.tvParts = [];
    this.screenPoses = [];

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
      // Dead tube: near-black phosphor. It carries NO reflection of its own —
      // the glass pane in front owns every reflection on this set, so an off
      // screen and a playing screen catch the room identically.
      : new THREE.MeshStandardMaterial({ color: 0x0b0e14, roughness: 0.4, metalness: 0 });
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
      this.refitVideoCrop?.(); // re-assert full-frame FILL on the reshaped screen
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

  dispose(): void {
    this.disposed = true; // gates the async GLB upgrade against a dead scene
    this.refitVideoCrop = null;
    if (this.gestureUnlock) {
      window.removeEventListener('pointerdown', this.gestureUnlock, true);
      window.removeEventListener('keydown', this.gestureUnlock, true);
      this.gestureUnlock = null;
    }
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
    if (this.testCardTex) {
      this.testCardTex.dispose();
      this.testCardTex = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }
}
