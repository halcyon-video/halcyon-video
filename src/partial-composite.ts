// PARTIAL COMPOSITE — the "parked in the store with a ceiling TV playing" path.
//
// The render-on-demand tiers (see animate() in three-scene.ts) drop to VIDEO
// while a ceiling set plays and nothing else moves: one FULL composite every
// ~24th of a second, forever, to update a few hundred pixels of tube face.
// Measured cost of that composite (RX-class GPU, 3620x2036 buffer, AO off):
//
//     scene draw (RenderPass)  6.06 ms   ← redundant: NOTHING but the TV moved
//     bloom                    0.22 ms
//     output (tone map + sRGB) 0.11 ms
//     FXAA                     0.27 ms
//     photo grade              0.10 ms
//     ─────────────────────────────────
//     whole composite          6.83 ms
//
// So ~89% of the frame is re-drawing a scene that is pixel-identical to the one
// already sitting in the beauty buffer. This module skips exactly that draw:
//
//   1. re-draw ONLY the TV screen meshes (layer TV_PATCH_LAYER) into the beauty
//      buffer the last full frame left behind, with autoClear off so everything
//      else survives, and with the buffer's own DEPTH intact so anything in
//      front of a set (shelf top, hanging sign, the tube's own shell) occludes
//      the patch exactly as it did in the full frame;
//   2. run the REST of the real chain — AO composite, bloom, output, FXAA,
//      photo grade — over that patched beauty, unchanged.
//
// Step 2 is why this is pixel-exact rather than a reconstruction: AO, bloom
// bleed, FXAA edges and the animated grain are computed by the same passes with
// the same inputs they would have had. The only thing that differs from a full
// frame is the one thing we know is identical — the scene draw.
//
// The whole design therefore rests on ONE invariant: on a partial frame nothing
// visible may have changed except the TV picture. Everything that could break
// that forces the full path for that frame; the gate lives in animate() (see
// `patchable` there) and is deliberately over-broad — a missed saving costs
// nothing, a missed invalidation is a visibly stale frame. This module adds one
// more veto of its own: an overlay that draws WITHOUT writing depth (glazing,
// any transparent sign) sitting on a tube is invisible to the patch's depth
// test and would be wiped by it, so canPatch() checks for that and gives up.
//
// Measured against the full path, frame for frame, by rendering the same
// changed picture both ways in one tick (window.debugPartialAB →
// scratch/tvpatch-ab.mjs): BYTE-IDENTICAL at low/medium/high, with and without
// N8AO, close-up (TV peek) and with a shelf-style occluder across the tube.
// Cost, parked in view of a set: 0.80 ms vs 4.21 ms per composite at 'high'
// (2176x1224), 0.17 ms vs 0.83 ms at 'low' — 29 draw calls instead of ~3800.
//
// Escape hatch: localStorage bb_partial_composite=0 disables this entirely and
// every frame goes back through the full composer (service-mode A/B switch).
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import { TV_PATCH_LAYER } from './scene-shared';

// Screen-space footprint of one renderable: the NDC rectangle it covers and how
// near/far it is. Used to decide whether an overlay sits ON a patched mesh.
interface Footprint { x0: number; y0: number; x1: number; y1: number; near: number; far: number }

// Scratch — the scan runs at most once per patch streak, but nothing animate()
// can reach may allocate.
const _corner = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _viewPts: THREE.Vector3[] = [];
for (let i = 0; i < 8; i++) _viewPts.push(new THREE.Vector3());
// The 12 edges of a box, as index pairs into the corner list below.
const BOX_EDGES = [0, 1, 0, 2, 0, 4, 1, 3, 1, 5, 2, 3, 2, 6, 3, 7, 4, 5, 4, 6, 5, 7, 6, 7];

/**
 * Project a renderable's bounding box into NDC, CLIPPED against the near plane.
 *
 * A bounding SPHERE was tried first and is useless here: the store's glazing is
 * long flat panes whose sphere has a 16 ft radius, so a pane on a side wall
 * "overlapped" a ceiling TV 30 ft away and vetoed the patch everywhere. A box
 * is tight enough to tell a pane beside you from one across the tube.
 *
 * Returns false when the object is entirely behind the eye (nothing it can
 * cover). Straddling boxes are clipped edge by edge rather than projected
 * naively — a point behind the eye projects MIRRORED, which silently produces
 * a rectangle on the wrong side of the screen.
 */
function projectFootprint(o: THREE.Object3D, camera: THREE.Camera, out: Footprint): boolean {
  const geo = (o as THREE.Mesh).geometry;
  if (!geo) return false;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox;
  if (!bb || !Number.isFinite(bb.min.x) || !Number.isFinite(bb.max.x)) return false;
  const cam = camera as THREE.PerspectiveCamera;
  const near = cam.near ?? 0.1;
  for (let i = 0; i < 8; i++) {
    _corner.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z);
    _viewPts[i].copy(_corner).applyMatrix4(o.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
  }
  out.x0 = out.y0 = Infinity; out.x1 = out.y1 = -Infinity;
  out.near = Infinity; out.far = -Infinity;
  let any = false;
  const add = (p: THREE.Vector3) => {
    const d = -p.z;
    if (d < out.near) out.near = d;
    if (d > out.far) out.far = d;
    _a.copy(p).applyMatrix4(cam.projectionMatrix); // perspective divide included
    if (_a.x < out.x0) out.x0 = _a.x;
    if (_a.x > out.x1) out.x1 = _a.x;
    if (_a.y < out.y0) out.y0 = _a.y;
    if (_a.y > out.y1) out.y1 = _a.y;
    any = true;
  };
  for (let e = 0; e < BOX_EDGES.length; e += 2) {
    const p = _viewPts[BOX_EDGES[e]], q = _viewPts[BOX_EDGES[e + 1]];
    const pIn = -p.z >= near, qIn = -q.z >= near;
    if (pIn) add(p);
    if (pIn !== qIn) { // crosses the near plane — add the crossing point
      const t = (-p.z - near) / ((-p.z) - (-q.z));
      add(_b.copy(p).lerp(q, t));
    }
  }
  return any;
}

/** Pooled footprint at `i`, grown on demand (scans allocate nothing steady-state). */
function slot(pool: Footprint[], i: number): Footprint {
  let fp = pool[i];
  if (!fp) { fp = { x0: 0, y0: 0, x1: 0, y1: 0, near: 0, far: 0 }; pool[i] = fp; }
  return fp;
}

/** A full-screen copy quad, shared by BeautyPass and the patch path. */
function makeCopyQuad(): { mat: THREE.ShaderMaterial; quad: FullScreenQuad } {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms),
    vertexShader: CopyShader.vertexShader,
    fragmentShader: CopyShader.fragmentShader,
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
  });
  mat.uniforms['opacity'].value = 1.0;
  return { mat, quad: new FullScreenQuad(mat) };
}

/**
 * Drop-in replacement for RenderPass on every tier that doesn't run N8AO —
 * identical output, but the scene lands in a render target of OUR OWN before
 * being handed to the chain.
 *
 * Why it can't just be RenderPass: that draws straight into the composer's
 * ping-pong buffer, and later passes both CLEAR that buffer (every ShaderPass
 * goes through renderer.render(), which honours autoClear) and overwrite its
 * colour. By the end of the frame neither the beauty nor — fatally — the scene
 * DEPTH survives, and the partial composite needs both. A dedicated target is
 * touched by nothing else, so it still holds last frame's beauty and depth when
 * the next frame wants to patch a TV screen into it.
 *
 * Cost on the full path: one full-screen blit (measured 0.07 ms of a 6.8 ms
 * composite) and one render target. `skipScene` is what the partial path sets
 * to keep everything except the scene draw.
 */
export class BeautyPass extends Pass {
  public readonly beautyRT: THREE.WebGLRenderTarget;
  public skipScene = false;
  private readonly copy = makeCopyQuad();

  constructor(private scene: THREE.Scene, private camera: THREE.Camera,
              template: THREE.WebGLRenderTarget) {
    super();
    this.needsSwap = false; // writes into readBuffer, exactly like RenderPass
    // Cloned from the composer's own buffer: same format/type/size, and its
    // depth buffer comes along. EffectComposer.setSize() drives setSize()
    // below with the effective (pixel-ratio'd) size from then on.
    this.beautyRT = template.clone();
    this.beautyRT.texture.name = 'BeautyPass.beauty';
  }

  setSize(width: number, height: number): void {
    this.beautyRT.setSize(Math.max(1, width), Math.max(1, height));
  }

  render(renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget,
         readBuffer: THREE.WebGLRenderTarget): void {
    const prevAutoClear = renderer.autoClear;
    if (!this.skipScene) {
      // Same clear semantics RenderPass uses (explicit, through the autoClear*
      // flags) so a background/fog setup behaves identically.
      renderer.setRenderTarget(this.beautyRT);
      renderer.autoClear = false;
      renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
      renderer.render(this.scene, this.camera);
    }
    this.copy.mat.uniforms['tDiffuse'].value = this.beautyRT.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    renderer.autoClear = false; // never clear the destination's depth (see above)
    this.copy.quad.render(renderer);
    renderer.autoClear = prevAutoClear;
  }

  dispose(): void {
    this.beautyRT.dispose();
    this.copy.mat.dispose();
    this.copy.quad.dispose();
  }
}

/** Minimal structural types — this module never imports StoreScene (cycle). */
interface ComposerLike {
  render(): void;
  /** Read only for its size, to notice a resize since the arming frame. */
  renderTarget1: THREE.WebGLRenderTarget;
}
/** N8AOPass keeps its own beauty target; `autoRenderBeauty` is the skip switch. */
interface N8AOLike {
  beautyRenderTarget: THREE.WebGLRenderTarget;
  configuration: { autoRenderBeauty: boolean };
}

export interface PartialCompositeDeps {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  composer: ComposerLike;
  /** High tier: N8AO owns a dedicated beauty target we can patch in place. */
  n8aoPass: N8AOLike | null;
  /** Every other tier: BeautyPass, which owns one for us. */
  beautyPass: BeautyPass | null;
}

export class PartialComposite {
  private readonly deps: PartialCompositeDeps;
  /** Kill switch (bb_partial_composite=0) — read once, no per-frame storage hit. */
  public readonly enabled: boolean;

  private isArmed = false;
  private armedW = 0;
  private armedH = 0;
  /** Re-scan the scene before the next patch (lights / patch materials). */
  private needsScan = true;

  /** Composites served by this path since boot (perf reporting). */
  public frames = 0;

  // Rebuilt by scanScene(): the opaque materials worn by patch-layer meshes
  // (re-drawn with EqualDepth), the world spheres of everything the patch
  // re-draws, and the world spheres of every depth-invisible overlay that
  // could be sitting on top of one. `blocked` is their verdict.
  private readonly opaquePatchMats: THREE.Material[] = [];
  private readonly opaquePatchFuncs: THREE.DepthModes[] = []; // their own depthFunc, restored after the draw
  // Footprint pools (grown once, reused): a scan can look at a few hundred
  // objects and this module never allocates in anything the loop reaches.
  private readonly patchFootprints: Footprint[] = [];
  private readonly hazardFootprints: Footprint[] = [];
  private patchCount = 0;
  private hazardCount = 0;
  private blocked = false;
  private readonly patchLayers = new THREE.Layers();

  constructor(deps: PartialCompositeDeps) {
    this.deps = deps;
    this.patchLayers.set(TV_PATCH_LAYER);
    let on = true;
    try { on = localStorage.getItem('bb_partial_composite') !== '0'; } catch { /* no storage */ }
    this.enabled = on;
  }

  /** The cached beauty this path patches — whoever owns it on this tier. */
  private beautyTarget(): THREE.WebGLRenderTarget | null {
    return this.deps.n8aoPass?.beautyRenderTarget ?? this.deps.beautyPass?.beautyRT ?? null;
  }

  /** True once a full composite has left a beauty buffer we can legally patch. */
  get armed(): boolean {
    if (!this.isArmed || !this.enabled) return false;
    const rt = this.deps.composer.renderTarget1;
    // A resize between the arming frame and now means the cached beauty (and
    // its depth) is gone — applyRenderResolution() already forces a composite,
    // but never trust that from here.
    return rt.width === this.armedW && rt.height === this.armedH;
  }

  /**
   * The caller's final question: may THIS frame be served by the patch? Runs
   * the deferred scene scan (lights, patch materials, overlay hazards) the
   * first time it is asked after anything changed, so the verdict is always
   * computed with the camera the patch will actually use.
   */
  canPatch(): boolean {
    if (!this.armed) return false;
    if (this.needsScan) {
      this.blocked = false;
      this.scanScene();
      this.needsScan = false;
    }
    return !this.blocked;
  }

  disarm(): void {
    this.isArmed = false;
  }

  /**
   * Called before a FULL composite with animate()'s verdict on whether anything
   * except the TV picture changed this frame. A frame that DID change something
   * may have changed the scene graph too (a light, a fixture), so the cached
   * scan is dropped; a clean streak never re-scans.
   */
  beforeFullFrame(patchable: boolean): void {
    if (!patchable) this.needsScan = true;
  }

  /**
   * Called after every FULL composite: it has left a complete beauty buffer, so
   * the frames after it may patch. Deliberately unconditional — arming only on
   * "clean" frames cost a SECOND full composite after every interruption (a
   * terminal cursor blink was measurably doubling the full-frame count), and a
   * beauty is a beauty whatever the frame that drew it was doing. Whether the
   * next frame may USE it is animate()'s gate, re-decided every frame.
   */
  afterFullFrame(): void {
    const rt = this.deps.composer.renderTarget1;
    this.isArmed = this.enabled && !!this.beautyTarget();
    this.armedW = rt.width;
    this.armedH = rt.height;
  }

  /**
   * Arm-time scene scan, for two things the patched draw has to match exactly.
   *
   * LIGHTS: three collects them in projectObject behind the SAME layer test as
   * geometry, so a camera masked to the patch layer would render the screen
   * stack with NO lights at all — the glass pane's direct specular would
   * vanish, and the light-count change would force a mid-session shader
   * recompile of a material the store is using. (Measured: without this the A/B
   * differed by up to 16/255 over the glass.)
   *
   * OPAQUE PATCH MATERIALS: collected (with their own depthFunc) so patchDraw
   * can re-draw them with EqualDepth — see there.
   *
   * OVERLAY HAZARDS: every renderable that draws without writing depth, so
   * anyHazardOverPatch() can veto a streak where one sits on a tube.
   *
   * Run lazily, on the first patch after any frame that changed something (see
   * beforeFullFrame): anything appearing mid-streak would be a visible change,
   * which by the render-on-demand contract comes with a requestRender() — that
   * forces a full frame, and that frame marks the scan stale.
   */
  private scanScene(): void {
    this.opaquePatchMats.length = 0;
    this.opaquePatchFuncs.length = 0;
    this.patchCount = 0;
    this.hazardCount = 0;
    const cam = this.deps.camera;
    cam.updateMatrixWorld();
    // traverseVisible, not traverse: it prunes hidden subtrees exactly the way
    // three's projectObject does, so this sees the same objects the draw will.
    this.deps.scene.traverseVisible((o) => {
      if ((o as THREE.Light).isLight) { o.layers.enable(TV_PATCH_LAYER); return; }
      const mat = (o as THREE.Mesh).material;
      if (!mat) return;
      const mats = Array.isArray(mat) ? mat : [mat];
      const onPatch = o.layers.test(this.patchLayers);
      if (onPatch) {
        for (const m of mats) {
          if (!m.transparent && this.opaquePatchMats.indexOf(m) < 0) {
            this.opaquePatchMats.push(m);
            this.opaquePatchFuncs.push(m.depthFunc);
          }
        }
        if (projectFootprint(o, cam, slot(this.patchFootprints, this.patchCount))) this.patchCount++;
        return;
      }
      // Anything that draws WITHOUT writing depth (every transparent overlay,
      // every additive glass pane) is invisible to the patch's depth test: it
      // sits in the cached beauty on top of the tube, and the opaque re-draw
      // would wipe it. Collect them and check below.
      if (!mats.some((m) => m.transparent || m.depthWrite === false)) return;
      if (projectFootprint(o, cam, slot(this.hazardFootprints, this.hazardCount))) this.hazardCount++;
    });
    this.blocked = this.blocked || this.anyHazardOverPatch();
  }

  /**
   * Is any depth-invisible overlay (see scanScene) between the eye and a
   * patched mesh? Screen-rectangle overlap plus a depth-order test per pair —
   * conservative (rectangles, not silhouettes) and cheap (measured: 128 such
   * objects in a built store, 6 patch meshes). Run once per patch streak, which
   * is sound because the camera cannot move inside one:
   * every camera change forces a non-patchable frame, which marks the scan
   * stale. A hit gives up the streak entirely rather than risk erasing an
   * overlay (verified failure mode: a translucent slab across a tube came back
   * 165/255 wrong over 51k pixels).
   */
  private anyHazardOverPatch(): boolean {
    for (let i = 0; i < this.hazardCount; i++) {
      const h = this.hazardFootprints[i];
      for (let j = 0; j < this.patchCount; j++) {
        const t = this.patchFootprints[j];
        if (h.near > t.far) continue;                    // entirely behind it
        if (h.x1 < t.x0 || h.x0 > t.x1) continue;        // no screen overlap
        if (h.y1 < t.y0 || h.y0 > t.y1) continue;
        return true;
      }
    }
    return false;
  }

  /**
   * The cheap frame: patch the TV screens into the cached beauty, then run the
   * real post chain over it. Caller must have checked `armed`.
   */
  render(): void {
    const { composer, n8aoPass, beautyPass } = this.deps;
    this.frames++;
    this.patchDraw(this.beautyTarget()!);
    // Everything downstream of the scene draw runs for real — that is what
    // makes the frame pixel-exact rather than a reconstruction.
    if (n8aoPass) n8aoPass.configuration.autoRenderBeauty = false;
    if (beautyPass) beautyPass.skipScene = true;
    try {
      composer.render();
    } finally {
      if (n8aoPass) n8aoPass.configuration.autoRenderBeauty = true;
      if (beautyPass) beautyPass.skipScene = false;
    }
  }

  /**
   * Verification hook (window.debugPartialAB, driven by scratch/tvpatch-ab.mjs).
   * Renders the SAME changed picture twice in one tick — once through the patch
   * path, once through the full composer — and hands back both canvases, so the
   * two can be diffed pixel for pixel with no timing or codec noise in between.
   * `poke` stands in for a video frame arriving (the harness has no stream).
   */
  debugAB(poke?: () => void): { cheap: string; full: string } | null {
    const { renderer, composer } = this.deps;
    if (!this.enabled) return null;
    const canvas = renderer.domElement;
    // 1. clean full frame — leaves the beauty exactly as a real hand-over frame
    //    would, and marks the scan stale the same way.
    this.beforeFullFrame(false);
    composer.render();
    this.afterFullFrame();
    if (!this.armed) return null;
    // 2. the picture changes, 3. patch path, 4. ground truth for the same picture.
    poke?.();
    if (!this.canPatch()) return null;
    this.render();
    const cheap = canvas.toDataURL('image/png');
    composer.render();
    const full = canvas.toDataURL('image/png');
    this.disarm();
    return { cheap, full };
  }

  dispose(): void {
    this.opaquePatchMats.length = 0;
    this.opaquePatchFuncs.length = 0;
    this.patchCount = 0;
    this.hazardCount = 0;
    this.isArmed = false;
    this.needsScan = true;
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /**
   * Draw the TV screen stack (picture / scanline overlay / glass) — and only
   * that — over the cached beauty. autoClear off keeps the rest of the frame;
   * scene.background is nulled because WebGLBackground force-clears the target
   * when a background exists, whatever autoClear says (the AO-mask pass in
   * three-scene.ts hit the same trap). The depth buffer is NOT cleared: it is
   * last frame's scene depth, so the re-drawn screens are occluded by whatever
   * occluded them then.
   *
   * The opaque members of the patch draw with EqualDepth (a depth-prepass
   * trick), NOT the default LessEqualDepth. The curved tube bulges through the
   * bezel aperture, so at the rim their depths meet and the pixel was won by
   * whichever the full frame drew last; re-drawing the screen with `<=` lets it
   * take pixels it lost, which measured as a 1px edge line off by up to 30/255.
   * Rasterisation is deterministic, so `==` passes exactly where the screen
   * won and nowhere else. The transparent overlays keep `<=` — they write no
   * depth and so can never take a pixel from anything.
   */
  private patchDraw(target: THREE.WebGLRenderTarget): void {
    const { renderer, scene, camera } = this.deps;
    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    const prevBackground = scene.background;
    const prevMask = camera.layers.mask;
    for (const m of this.opaquePatchMats) m.depthFunc = THREE.EqualDepth;
    renderer.setRenderTarget(target);
    renderer.autoClear = false;
    scene.background = null;
    camera.layers.set(TV_PATCH_LAYER);
    renderer.render(scene, camera);
    camera.layers.mask = prevMask;
    scene.background = prevBackground;
    renderer.autoClear = prevAutoClear;
    renderer.setRenderTarget(prevTarget);
    for (let i = 0; i < this.opaquePatchMats.length; i++) {
      this.opaquePatchMats[i].depthFunc = this.opaquePatchFuncs[i];
    }
  }
}
