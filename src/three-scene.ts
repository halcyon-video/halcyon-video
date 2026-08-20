import * as THREE from 'three';
import { Movie, JellyfinLibrary, Episode } from './jellyfin';
import { assetUrl } from './asset-url';
import {
  clearVideoCaseCache,
  InstancedMovieGroup,
  setReflectionProbes,
  setUploadRenderer,
  setTextureStreamWake,
  setPosterLoadedNotify,
  backCoverRegions,
  SERIES_DEPTH_MULT,
  posterPixelCache,
  textureArrayManager,
} from './video-case';
import { setSurfaceKtx2Renderer } from './surface-textures';
import { pendingTextureUploads } from './poster-textures';
import { keyboardOwnedByControl } from './text-entry-focus';
// @ts-ignore
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { N8AOPass } from 'n8ao';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import * as mirrors from './store-mirrors';
import { BeautyPass, PartialComposite } from './partial-composite';
import { FixtureContext, SlottedFixture } from './fixtures';
import { OverviewCursors, OverviewCursorTarget } from './overview-cursors';
import { resetBrandLive, setBrandRenderHook } from './brand-live';
import { AmbientTvs } from './ambient-tvs';
import { EntranceCheckout } from './entrance';
import { ExteriorEnvironment } from './exterior-environment';
import {
  NR_RUN_DEPTH,
  NR_LEFT_UNIT_STANDOFF,
  FIELD_Z_FRONT,
  AISLE_SHELF_HEIGHTS,
  WALL_SHELF_HEIGHTS,
  BOX_SPACING,
  STAGGER_OFFSET,
  SECTION_COLS,
  UNIT_SIDE_CAPACITY,
  BACK_WALL_UNIT_IDX,
  seededRandom01,
  isWallHighlyRated,
  LibraryLayout,
  ArrangementId,
  ShelvingUnit,
  MovieSlot,
  StoreShellSpec,
  getStoreShellSpec,
  StorefrontSpec,
  FixturePlacement,
} from './store-layout';
import { activeMediaCutoff } from './media-release-date';
import { titleMatchKeys } from './staff-picks';
import { OutdoorLightingRig, type OutsideMode } from './outdoor-lighting';
import { CandyDisplay, CandyRow } from './fixtures/period-fixtures';
import { TipJar } from './fixtures/tip-jar';
import { openTipOverlay } from './tip-jar';
import { gamepadEverConnected } from './gamepad-tracker';
import { StoreTheme } from './themes';
import {
  CASE_EULER_ORDER,
  NewReleasesSection,
  sectionColSpan,
  tempPosition,
  tempRotation,
  tempQuaternion,
  tempScale,
  tempMatrix,
  AO_MASK_LAYER,
  _bagFallback,
  _launchCarry,
  _bagBaseFallback,
  _checkoutBagFallback,
  _checkoutCarry,
  _checkoutStand,
  _checkoutWalkPos,
  _checkoutWalkAhead,
  CAMERA_GLIDE_LERP,
  HERO_SPINE_YAW,
  INSPECT_FAN_X,
  INSPECT_CASE_Z,
  INSPECT_RETAIL_Z_LEAD,
  updatedMeshes,
  CLERK_SLEEP_INPUT_MS,
} from './scene-shared';
import * as shell from './store-shell';
import * as stock from './store-stock';
import * as checkout from './store-checkout';
import * as rental from './store-rental';
import * as nav from './store-nav';
import type * as peek from './store-tv-peek';
import type * as subnav from './store-subnav';
import * as inspect from './store-inspect';
import * as clerkFlow from './store-clerk-flow';
import * as walk from './store-walk';
import * as overview from './store-overview';
import * as cam from './store-camera';
import * as grade from './store-grade';
import * as wallDecor from './wall-decor';
import { gradeNum } from './store-grade';
import { StorePlan } from './store-plan';
import { getLastUserActivity } from './user-activity';
import { Footprint } from './layout-validator';
import { SurfaceRegistry } from './mount-surfaces';
import { GondolaMaterials } from './shelving';
import { StoreClerk } from './clerk';
import { ClerkNavGrid, NavRect } from './clerk-nav';
import { setMaxAnisotropy, setCheapMaterials } from './canvas-textures';
import { readCalibratedQuality } from './quality-calibrate';
import {
  SIDE_RIBBON_FRONT_Z,
  SIDE_RIBBON_CLEARANCE,
  SIDE_RIBBON_PANE_W,
  SIDE_RIBBON_MIN_LEN,
} from './storefront-facade';
import { StorefrontLogo3D } from './logo-storefront';
import { retailAudio } from './audio';
import { clearActiveSignage } from './fixtures/signage';
import { CarriedTapes, CarryPose, showClerkToast, disposeClerkToast } from './carried-tapes';
import { BackRoom, disposeBackRoomFade } from './back-room';
import { RentalRecord, loadRentalRecord, clearRentalRecord, isLockedOut, formatUnlockLabel } from './rental-clock';
import { perfTrace, perfSlot } from './perf-trace';
import { ShelfClasps, type ClaspTarget } from './fixtures/shelf-clasp';
import { requestMovie } from './jellyseerr';
import { displayHz, computeFpsCap, computeScalerTargetFps } from './display-hz';
import { type LibraryIndex } from './recommend-why';
import type { ClerkSuggestion } from './clerk-interaction';

// Display-grade sweep knobs (gradeNum) now live in store-grade.ts alongside
// the photo-grade pass itself; three-scene keeps only the exposure read.

// Hitch-tracer slots (see perf-trace.ts): timing spans (…Ms) and per-frame
// event counters written from animate() and the render hot paths, so every
// captured hitch says WHAT the frame spent its time on.
const SP_SIM = perfSlot('simMs');          // animate() bookkeeping+simulation up to the composite
const SP_SLOTS = perfSlot('slotsMs');      // dirty-slot lerp/matrix pass (includes hero bind)
const SP_RENDER = perfSlot('renderMs');    // composer/renderer composite
const SP_AO = perfSlot('aoComputeMs');     // GTAO recompute inside the composite
const CT_SHADOW = perfSlot('shadowBake');  // full shadow-map rebake requested
const CT_AO = perfSlot('aoCompute');
const CT_RES = perfSlot('resScaleApply');  // drawing-buffer resize (render targets realloc)
const CT_PARTIAL = perfSlot('partialComposite'); // VIDEO frame served by the TV-screen patch path

// Module augmentation (MovieSlot itself lives in store-layout.ts): caches the
// per-slot back-box horizontal jitter. It's a pure function of slot.movie.id
// (seededRandom01 hashes the ~32-char id every call), so computing it once at
// slot-build/reassignment time and reading the cached value in the animate()
// dirty-slot pass avoids re-hashing every dirty slot on every rendered frame
// during placement waves / genre-filter rebuilds (issue #116).
declare module './store-layout' {
  interface MovieSlot {
    backJitter: number;
    // Per-case sideways lean (roll, radians) baked into the resting instance
    // matrix so a stocked shelf reads as hand-shelved rather than machine-perfect
    // — the single strongest "this isn't CGI" cue on the shelves. A pure function
    // of movie.id (deterministic across reloads), computed once on first
    // placement and cached here; applied only to the settled instanced cases, so
    // the case you pick up straightens (hero) and leans again when reshelved.
    leanRotZ?: number;
  }
}

// Max half-range of the per-case lean (radians). ~1.7° each way: enough to break
// the mechanical grid, small enough that the shelf never looks knocked-about.
const CASE_LEAN_JITTER = 0.06;





// Tolerant matrix compare for the AO view cache: the browse-mode camera lerp
// approaches its target asymptotically, so exact equals() would keep reading
// "moved" (and recomputing AO) for seconds of microscopic sub-visible drift.
// 1e-6 (units are feet) is far below anything visible.
function matrixAlmostEquals(a: THREE.Matrix4, b: THREE.Matrix4, eps = 1e-6): boolean {
  const ae = a.elements, be = b.elements;
  for (let i = 0; i < 16; i++) {
    if (Math.abs(ae[i] - be[i]) > eps) return false;
  }
  return true;
}

// Rounds to 2dp to keep repeated +/- 0.05 steps (issue #27's dynamic
// resolution scale) from drifting off the 0.70/0.75/.../1.00 ladder due to
// binary floating point (e.g. 0.7 + 0.05 !== 0.75 bit-for-bit).
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export class StoreScene {
  public container: HTMLDivElement;
  public renderer!: THREE.WebGLRenderer;
  public scene!: THREE.Scene;
  public camera!: THREE.PerspectiveCamera;
  public composer!: EffectComposer;
  private fxaaPass!: ShaderPass;
  public filmPass!: ShaderPass; // photo grade: vignette/grain/warmth/LUT (store-grade.ts)
  // AO control surface for animate()'s walk gating / settle fade / IDLE
  // safety. Structurally satisfied by GTAOPass directly (legacy engine); the
  // default N8AO engine plugs in an adapter that maps `enabled` to a pass
  // swap (N8AOPass replaces RenderPass, so it can't just be disabled) and
  // `blendIntensity` to the AO intensity exponent. Null when AO is off.
  private aoPass: { enabled: boolean; blendIntensity: number } | null = null;
  // AO is the single most expensive per-frame cost (its G-buffer prepass replays
  // every scene draw call), but this store is a static scene: the AO term only
  // changes when the camera or a box moves. So: OFF while walking (nobody reads
  // contact shadows mid-stride, and it's what was blowing the frame budget),
  // faded back in over ~250ms on settle, and while the view is static the
  // wrapped render() replays the cached AO term with two cheap quads instead of
  // recomputing it (see the wrapper in initThree).
  private aoFadeT = 1; // 0→1 blend fade after walk motion stops
  private aoNeedsRefresh = true; // buffers resized/cleared or scene geometry moved — recompute the AO term
  private lastWalkLookTime = -Infinity; // last walk-mode mouse-look event; looking is motion too
  private readonly aoCachedCamWorld = new THREE.Matrix4().makeScale(0, 0, 0); // never matches a real camera pose
  private readonly aoCachedCamProj = new THREE.Matrix4();
  private bloomPass: UnrealBloomPass | null = null; // null on 'low' quality, where it's skipped entirely
  // Partial composite (src/partial-composite.ts): the parked-with-a-TV-playing
  // fast path. Null when the pass chain can't support it (SMAA / the legacy
  // GTAO engine) or nothing built a composer. Its gate lives in animate().
  public partial: PartialComposite | null = null;
  // Composites served this session, split by path — read by getPerfInfo() (and
  // the perf probes) to price the VIDEO tier before/after.
  private fullComposites = 0;
  // Depth-of-field for the inspect/flip close-up ("product shot" look): the held
  // case stays sharp while the shelves behind it fall gently out of focus. null
  // except on 'high' quality. Its `enabled` flag is driven per-frame by the mode
  // (see animate): ON only in inspect, so EffectComposer skips it entirely — and
  // skips its extra depth render — in browse/walk. Because a settled inspect view
  // goes IDLE (composites nothing), the pass runs only during the zoom-in and the
  // flip animation, then the last blurred frame is left parked: zero idle cost.
  public bokehPass: BokehPass | null = null;

  // Dynamic resolution scaling (issue #27): scale the internal render buffer
  // down from the CSS/client size under load, independent of the pixelRatio
  // quality cap (which stays as the upper bound). Bounds chosen so FXAA + film
  // grain hide the softening: text on signage stays readable, if barely, at
  // the floor.
  private resScale = 1.0;
  // Motion-gated sharpness, applied ON TOP of resScale in applyRenderResolution().
  // qualityScale is 1.0 (today's capped ~1440p budget) for static/dwelling frames
  // and rises to sharpScale — the factor that lifts that budget up to native
  // display resolution — only while the camera is actually moving and on the
  // frame it settles on. sharpScale is clamped to >= 1, so on any window already
  // at or above native (every dev + screenshot window) it is exactly 1 and this
  // whole feature is a no-op. The point is the sub-native 4K kiosk: there the
  // 'high' budget solves pixelRatio down to ~0.67 (a 1440p buffer upscaled), so
  // moving around shredded thin/distant geometry (ceiling grid, far shelves) into
  // jaggies. Native only while moving keeps idle/dwelling power exactly where it
  // was — a still store already draws zero frames (render-on-demand).
  private qualityScale = 1.0;
  private sharpScale = 1.0;
  // Settle-frame SUPERSAMPLE. Rendering the kiosk at exactly 1:1 native (what
  // sharpScale alone buys) is the single worst case for edge aliasing: there is
  // no sub-pixel information anywhere and FXAA, a luma-edge blur, cannot invent
  // it — which is why "native while moving" still read as "unbelievably jaggy"
  // on the back-wall shelf rails and the ceiling T-bar grid. Render-on-demand
  // makes the cure nearly free: the frame you actually DWELL on is drawn once
  // and then persisted at zero GPU, so it can afford to cost several times a
  // normal frame. settleScale renders that one frame ABOVE native and lets the
  // browser box-filter it down — true supersampling, fixing geometry, specular
  // and texture aliasing at once. Motion keeps sharpScale (native, cheap);
  // only the parked image pays. bb_settle_ss = pixel multiplier over the moving
  // budget ('0' disables and restores the old native-only settle).
  private settleScale = 1.0;
  private settleSsFactor = StoreScene.SETTLE_SS_DEFAULT;
  // MOTION supersample. sharpScale only lifts a moving frame to 1:1 native —
  // which, per the settleScale note above, is precisely the worst case for
  // edge aliasing. So while the camera moves, the ceiling T-bar grid and the
  // back-wall shelf rails stayed jaggy, and every small nudge popped the view
  // from the supersampled settle frame down to that. motionScale supersamples
  // the moving frame too, on the same budget arithmetic as settleScale.
  //
  // Affordable because motion-frame cost here is largely pixel-INDEPENDENT
  // (AO recompute + draw-call submission dominate) — the same measurement
  // updateDynamicResolution's threshold comment already relies on. resScale
  // remains the safety valve: if the extra pixels DO cost frames, the scaler
  // walks them straight back off, which is exactly the intended trade.
  private motionScale = 1.0;
  private motionSsFactor = StoreScene.MOTION_SS_DEFAULT;
  private motionSharpDisabled = false; // localStorage bb_motion_sharp === '0'
  private lastCameraMotionTime = -Infinity;
  private lastSceneChangeTime = -Infinity;
  // Set once a static view has been composited, so the next stay-awake rAF
  // persists that (sharp) frame instead of re-drawing an identical one. Cleared
  // by any real change (see sceneChanging in animate()).
  private staticSettled = false;
  public effectiveQuality: 'high' | 'medium' | 'low' = 'high';
  // Software rasterizer (SwiftShader/llvmpipe/WARP): every fragment is CPU
  // work, so the whole render pipeline runs a dedicated budget path — see
  // initThree(). Frame cost scales ~linearly with buffer pixels there, which
  // is why the floor drops well below the GPU tiers'.
  public softwareGL = false;
  // WebKitGTK (the engine Tauri embeds on Linux): GL runs synchronously in
  // the web process — no Chromium-style pipelined GPU process — so the same
  // composite that costs ~8ms of submit time in Chromium blocks ~23ms here,
  // and each live Reflector's second full-scene pass blocks ~14ms more.
  // Measured on the same machine/GPU (RX 9070 XT): 30fps in the Tauri app vs
  // a locked 60 in the browser. Treated as a lower-throughput tier in
  // initThree(): medium pixel budget without the native-res floor, and the
  // softwareGL static-chrome mirrors instead of live Reflectors.
  public webkitGL = false;
  // bb_fps_cap override (see computeFpsCap in display-hz.ts), read once in
  // initThree() alongside the other bb_* boot flags.
  private fpsCapOverride: string | null = null;
  // Frame rate the dynamic scaler steers toward AND the ACTIVE tier composites
  // at (see activeFrameInterval below): the display's real refresh rate run
  // through computeFpsCap's even-divisor cap (default 60-target; bb_fps_cap
  // overrides) — except under WebKitGTK, whose threaded compositor presents
  // WebGL at most every other tick, a hard 60fps ceiling (measured: even a
  // bare gl.clear() at 640×360 caps there), so it skips the cap math entirely.
  // A live getter, not cached: displayHz() keeps returning the 60Hz default
  // until measureDisplayHz()'s async boot sample resolves, and this must pick
  // up the real rate the moment it does.
  public get targetFps(): number {
    return this.webkitGL ? 60 : computeFpsCap(displayHz(), this.fpsCapOverride);
  }
  // ACTIVE-tier composite spacing (see the frameInterval gate in animate()).
  // Subtracts half a vsync period of slack from the nominal 1000/targetFps:
  // without it, a rAF that lands a hair before the ideal instant fails the
  // strict `<` check and the frame is skipped, pushing the render out to the
  // NEXT vsync — the remainder discarded each cycle drifts real cadence below
  // the target instead of landing on it. When targetFps === displayHz() (the
  // uncapped case, or any display at/under the 60fps default divisor) this
  // resolves to less than one vsync and the gate never actually skips.
  private get activeFrameInterval(): number {
    return Math.max(0, 1000 / this.targetFps - 0.5 * (1000 / displayHz()));
  }
  private get resScaleMin(): number {
    if (this.softwareGL) return 0.4;
    return this.effectiveQuality === 'high' ? 0.7 : 0.5;
  }
  private static readonly RES_SCALE_MAX = 1.0;
  private static readonly RES_SCALE_STEP = 0.05;
  // Settle supersample: how many times the MOVING frame's pixel count the one
  // parked frame is drawn at. 2 = 1.41x linear, the classic 2xSS — measurably
  // cleaner on shelf rails / ceiling grid in a 4K A/B, and self-scaling (a
  // 1080p window gets 2x its pixels too, not a fixed 4K number).
  private static readonly SETTLE_SS_DEFAULT = 2.0;
  // Hard ceiling on the settle buffer. 17e6 keeps the largest dimension around
  // 5.5k (well inside every maxTextureSize) and the composer/bloom/AO target
  // set inside a sane VRAM envelope on the 4K kiosk.
  private static readonly SETTLE_PX_CAP = 17e6;
  // Motion supersample: multiple of the native/base budget a MOVING frame is
  // drawn at. Default set from measurement, not taste — see the perf note on
  // the commit that added it. Kept below SETTLE_SS_DEFAULT so the parked frame
  // is still the sharpest thing on screen, and capped well under SETTLE_PX_CAP
  // since this one is paid every frame.
  private static readonly MOTION_SS_DEFAULT = 2.0;
  // Hard ceiling on the MOVING buffer, deliberately below SETTLE_PX_CAP. 2.0x
  // was measured free up to ~7.4e6 px (see the commit's perf table); 12e6 is
  // as far as that measurement can honestly be extended, and it still buys the
  // 4K kiosk a 1.44x-native supersample where it used to render 1:1. resScale
  // handles anything the cap doesn't; bb_motion_ss raises it on a GPU with room.
  private static readonly MOTION_PX_CAP = 12e6;
  // Frame-time window used to drive resScale, counted separately from the FPS
  // HUD's own counters: it must only accumulate on ACTIVE-tier frames (issue
  // #24's render-on-demand). VIDEO-tier frames are deliberately throttled to
  // ~24fps and IDLE frames render nothing, so mixing either into this window
  // would misread throttling as a slow GPU and needlessly downscale.
  private resScaleFrames = 0;
  private resScaleWindowStart = performance.now();
  private resScaleGoodStreak = 0; // consecutive good-fps seconds before stepping up (avoids oscillation)

  // Scene components
  public meshes: THREE.Object3D[] = []; // Track all added meshes (including instanced ones) for disposal
  public ssaoExcludedObjects: THREE.Object3D[] = [];
  // Subset of the AO-excluded roots (userData.aoBlendMask) whose silhouettes are
  // additionally re-drawn each composited frame so the AO *blend* skips their
  // pixels. Exclusion alone hides an object from the GTAO G-buffer, but the AO
  // term — then computed from the geometry BEHIND it — still gets multiplied
  // over its beauty pixels (shelf shadows crossing the clerk sprite, counter
  // creases crossing the CRT terminals). See the GTAO render() wrapper.
  public aoMaskRoots: THREE.Object3D[] = [];
  // Spare layer bit used to draw ONLY the mask roots in the AO-mask pass
  // (layer 0 = everything, layer 1 = mirror-skip toppers/UI markers).
  public shelves: THREE.Object3D[] = [];
  public activeTheme!: StoreTheme;
  public gondolaMaterials!: GondolaMaterials;
  
  // First Person Walk Around Mode state
  public isWalkAroundMode = false;
  public savedModeBeforeWalk = 'library-select';
  // Walk-mode click-to-inspect (handleWalkClick): the standing pose to
  // restore when the user backs out of an inspect they entered by clicking a
  // case while walking. savedMode preserves what savedModeBeforeWalk was at
  // click time, so a later manual walk-exit still lands where it should.
  public walkReturnPose: { x: number; z: number; yaw: number; pitch: number; savedMode: string } | null = null;
  // Verification-only free camera (see teleportWalk's `free` param): while
  // true the walk update skips constrainWalkPosition() and the fixed 5.5ft
  // eye height, so harness shots can stand anywhere (e.g. far outside the
  // storefront to frame the whole facade). Cleared by any manual walk toggle.
  public walkFreecam = false;
  public walkKeys = {
    w: false,
    a: false,
    s: false,
    d: false,
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false
  };
  public yaw = 0.0;
  public pitch = 0.0;
  public lastUpdateTime = performance.now();
  public isPointerLocked = false;
  private isDragging = false;
  // Distance walked since the last footstep sound fired — cadence naturally
  // tracks movement speed since this accumulates real feet travelled per frame.
  private footstepDistAccum = 0;
  private nextFootstepDist = 3.0;
  // Walk head-bob (issue: realism). A gentle footstep-phased vertical bounce
  // while walking, so the eye reads its own gait instead of gliding on rails.
  // Phase advances with distance travelled (so cadence tracks speed); amplitude
  // eases 0→1 while moving and back to 0 when stopped, so a parked camera sits at
  // the exact 5.5ft eye height with zero residual offset. Only the y axis is
  // touched — x/z (and thus collision) are never perturbed. Computed only on
  // walking frames (never while idle), and the ~0.2s ease-down is kept ACTIVE
  // (see the tier decision) so the last frame settles flat, never frozen mid-bob.
  private bobPhase = 0;
  private bobAmount = 0;

  private headlight!: THREE.DirectionalLight;
  private topLights: THREE.DirectionalLight[] = [];
  // Interior overhead shadow casters (buildStore) — the troffer grid's stand-in
  // key lights. Kept so perf work can retune/regate them without a traverse.
  public trofferKeyLights: THREE.SpotLight[] = [];
  public libraryEndCaps: THREE.Mesh[] = [];
  private selectedSky: any = null;
  public activeSignageObjects: THREE.Object3D[] = [];

  // Dump-tub (bargain bin) browsing: the eye stays put at the tub's front and
  // the SELECTED case lifts out of the pile to this point, turned to face the
  // camera. Recomputed once per selection change in updateCameraTarget() — not
  // per frame — and consumed by the slot-pose pass in animate().
  public selectedFixtureLookDown = false;
  public lookDownCamera = new THREE.Vector3();
  public lookDownLookAt = new THREE.Vector3();
  public lookDownPresent = new THREE.Vector3();
  public lookDownPresentRotX = 0;
  public lookDownPresentRotY = 0;

  // Outside world + baked-environment pipeline (sky dome, per-visit sun,
  // day/night modes, PMREM env bakes) — see outdoor-lighting.ts. Getter-based
  // deps because renderer/scene/headlight don't exist until initThree runs.
  public outdoor = new OutdoorLightingRig({
    getScene: () => this.scene,
    getRenderer: () => this.renderer,
    getBackWallZ: () => this.backWallZ,
    getCeilingY: () => this.ceilingY,
    getHeadlight: () => this.headlight ?? null,
    getBakeHidden: () => (this.selectionArrow ? [this.selectionArrow] : []),
    onEnvironmentRebaked: () => {
      this.rebuildSSAOExclusionList();
      this.generateReflectionProbes();
      this.updateLOD();
      this.applyExteriorEnvClamp();
    },
    onModeLighting: (mode) => this.applyModeLighting(mode),
  });
  // Exterior dressing roots (facade, lot, cars, sidewalk furniture) whose
  // materials must NOT be lit by the interior-baked environment at full
  // strength — see applyExteriorEnvClamp().
  public exteriorEnvRoots: THREE.Object3D[] = [];

  // The baked scene.environment is an INTERIOR capture, and its display gain
  // is per-mode (night runs at 2.6 so the troffers can carry the room). A
  // static material envMapIntensity would therefore make the facade BRIGHTER
  // at night than day (0.22 × 2.6 vs 0.22 × 0.95). Retarget on every rebake
  // so the exterior's effective env contribution stays a constant faint fill
  // (~0.2), whatever the interior gain is doing. Re-traverses the roots each
  // time, which also catches the async-loaded car GLBs.
  private applyExteriorEnvClamp() {
    const gain = Math.max(0.2, this.scene.environmentIntensity);
    const intensity = 0.2 / gain;
    for (const root of this.exteriorEnvRoots) {
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (m instanceof THREE.MeshStandardMaterial) m.envMapIntensity = intensity;
        }
      });
    }
    // Architectural glass (userData.envGainTarget): near-mirror surfaces where
    // the env term IS the material. The per-mode display gain exists to scale
    // the room's DIFFUSE light (night runs it at 3.0 so the troffers can carry
    // the store), but on smooth glass it multiplies the whole reflection —
    // looking up through the vestibule at night hit fresnel-grazing panes at
    // 1.2 x 3.0 and the "ceiling" blew out white. Retarget so each pane's
    // effective reflection strength (envMapIntensity x gain) stays the
    // CONSTANT it was tuned to at the day gain, whatever mode is active.
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const target = (m as THREE.Material)?.userData?.envGainTarget;
        if (typeof target === 'number' && m instanceof THREE.MeshStandardMaterial) {
          m.envMapIntensity = target / gain;
        }
      }
    });
  }

  // Per-mode interior light retune (called by the rig from updateSkybox,
  // before the environment rebake folds it in). At night the sun is off and
  // the room leans on the baked env — but the env's ceiling hemisphere is
  // mostly dark acoustic tile, so the FLOOR (normal up, integrating exactly
  // that hemisphere) went near-black while vertical surfaces stayed lit
  // (user: "carpet is dark as night"). Real troffers pour direct light DOWN;
  // brighten the key spots after dark so the carpet actually receives it.
  private applyModeLighting(mode: OutsideMode) {
    // Day 110 -> 145 -> 180 chased a dark carpet by raising energy, but the
    // light was being thrown away by the spots' distance cutoff, not
    // under-supplied (see the SpotLight construction in buildStore). With the
    // cutoff gone each cone reaches the floor and neighbours overlap, so the
    // same numbers now read blown out — 180 -> 105 puts the pool directly under
    // a troffer back near its old peak while the gutters between them, which
    // used to receive nothing, fill in. Night still runs hotter: the sun is off
    // and the env's ceiling hemisphere is mostly dark acoustic tile, so the
    // floor (normal up, integrating exactly that hemisphere) has no other
    // source. Real troffers are what light a store floor; give them the energy.
    const spotIntensity = mode === 'night' ? 120 : 105; // candela — see trofferKeyLights
    for (const key of this.trofferKeyLights ?? []) key.intensity = spotIntensity;
    this.requestRender();
  }
  // T15: sidewalk/curb/lamps/cars/strip-mall backdrop beyond the glass — built
  // once in buildStore(), reacts to day/night via setOutsideMode() only (no
  // per-frame cost). See exterior-environment.ts.
  public exterior: ExteriorEnvironment | null = null;
  // One-shot: re-bake the environment once the initial async case placement has
  // settled, so the env/reflections include the stocked shelves (the constructor
  // bakes can only see the empty shell). Consumed by animate().
  private pendingStockedRebake = false;
  // Last requestRender() wall-clock — i.e. the last input/wake event. The
  // stocked rebake (a ~100ms probes+PMREM burst, see perf-trace baseline)
  // waits for this to go quiet so it can never land mid-interaction.
  private lastRenderRequestTime = 0;

  // Bootstrap-only PMREM (see initThree()): scene.environment needs *something*
  // before outdoor.bakeEnvironment() runs its first real bake a few lines later
  // in the constructor. These three references exist only to be disposed right
  // after that first bake replaces this texture — otherwise the render target,
  // its compiled PMREM blur programs, and the synthetic RoomEnvironment's
  // meshes/materials are orphaned for the whole session (issue #121).
  private bootstrapEnvRT: THREE.WebGLRenderTarget | null = null;
  private bootstrapPmremGen: THREE.PMREMGenerator | null = null;
  private bootstrapRoomEnv: RoomEnvironment | null = null;

  public troffers: { x: number; z: number }[] = []; // drop-ceiling light panel centers

  // Carpet material + its baked footprint-projection aoMap (see the
  // bakeFloorAO call in buildStore and docs/lightmap-pipeline.md Phase 1).
  public floorMat: THREE.MeshStandardMaterial | null = null;
  // The shared drywall material plus the frame its texture repeat is sized for,
  // so knee walls built elsewhere (createWindowSection, buildWindowBays) can
  // map onto the same surface. Set by buildStore before either runs.
  public wallSurface: { material: THREE.Material; storeWidth: number; roomHeight: number } | null = null;
  public floorAOTex: THREE.CanvasTexture | null = null;

  // Shared with buildCeilingFrame(): how far the chrome+mirror cornice

  // Front vestibule + walk-in checkout desk fixture (see entrance.ts). Its
  // deskApexZ frames the checkout camera move; bagMouthWorld receives the
  // launch flourish's case drop.
  public entrance: EntranceCheckout | null = null;
  // Named mount surfaces (window bays, counter top, back wall) — see
  // src/mount-surfaces.ts. Registered as the corresponding geometry is built
  // in buildStore(); exposed on window for debugging (ids + dims via
  // __surfaces.ids()/.get(id)).
  public surfaces = new SurfaceRegistry();
  private jellyfinUrl = '';
  private jellyfinToken = '';
  public ambientTvs: AmbientTvs | null = null;
  private chimeCtx: AudioContext | null = null; // lazy WebAudio for the door chime
  // Recorded shop-bell sample (public/sounds/door_bell.mp3) — the only door
  // sound. Fetched+decoded once (preloaded at boot); until it's ready the
  // doors are silent and the next chime retries the load.
  private doorBellBuffer: AudioBuffer | null = null;
  private doorBellLoad: Promise<void> | null = null;

  // T13: marquee bulbs (optional). One InstancedMesh covers every bulb in the
  // store (cornice rim + window poster frames) for a single draw call. Anchors
  // collected while building the window posters (posterMarqueeFrames) feed the
  // bulb-ring placement math in buildMarqueeBulbs(), called once the cornice
  // geometry constants are in scope. See buildMarqueeBulbs()'s header comment
  // for how bb_marquee_anim's 'chase' mode interacts with render-on-demand.
  public posterMarqueeFrames: Array<{ anchor: THREE.Object3D; width: number; height: number }> = [];
  public marqueeBulbsMesh: THREE.InstancedMesh | null = null;
  public marqueeAnimMode: 'off' | 'steady' | 'chase' = 'steady';
  public marqueeChaseStep = 0;
  public marqueeLastChaseUpdate = 0;
  private readonly _walkFwd = new THREE.Vector3();
  private readonly _walkRight = new THREE.Vector3();
  private readonly _walkMove = new THREE.Vector3();
  private readonly _walkCamFwd = new THREE.Vector3();
  public readonly _raycaster = new THREE.Raycaster();
  public readonly _mouse = new THREE.Vector2();

  // Camera state & interpolation targets
  public targetCameraPos = new THREE.Vector3(0, 0, 8);
  public currentCameraPos = new THREE.Vector3(0, 0, 8);
  public targetLookAt = new THREE.Vector3(0, 0, 0);
  public currentLookAt = new THREE.Vector3(0, 0, 0);
  // One-shot glide speed: wrapOverShelfTop() lowers this to TOP_WRAP_GLIDE_LERP
  // for its around-the-aisle swing; animate() restores the default on settle.
  public cameraGlideLerp = CAMERA_GLIDE_LERP;
  // Re-entry return-tapes beat: while true, the glide camera holds a pose
  // framing the RETURN TAPES HERE chute so the drop ritual plays ON SCREEN
  // (it used to run behind the spawn camera, invisibly). Auto-releases the
  // moment the ritual ends — the camera then glides to the normal target —
  // and any user navigation (updateCameraTarget) cancels it early.
  public returnDropWatch = false;
  public readonly returnDropWatchPos = new THREE.Vector3();
  public readonly returnDropWatchLook = new THREE.Vector3();
  // Saved camera target while the diegetic search terminal is docked, so
  // exitSearchMode() can hand the view straight back to wherever browsing
  // left off (see enterSearchMode()/exitSearchMode() below).
  private searchPreCameraPos: THREE.Vector3 | null = null;
  private searchPreLookAt: THREE.Vector3 | null = null;
  
  // Library and grid tracking
  public libraries: JellyfinLibrary[] = [];
  // Jellyseerr discovery suggestions (trending/popular, NOT in the library) --
  // see jellyseerr.ts's fetchDiscoverMovies. Shelved inline with the regular
  // stock (see the constructor's merge) and used as the clerk's suggestion
  // pool. Empty when Jellyseerr isn't configured/reachable.
  public discoveryMovies: Movie[] = [];
  // T18: Romm video-game stock for the VIDEO GAMES section (see romm.ts and the
  // game-section fixture). Empty when Romm isn't configured/reachable.
  public gameMovies: Movie[] = [];
  // Watch-history staff picks (see staff-picks.ts): owned titles wearing the
  // sticker (ranked), and not-in-library order candidates for the genre
  // endcaps. Both empty when there's no watch history / no Jellyseerr.
  // Public: read by store-clerk-flow's staffPickEndcapPlacements().
  public staffPickOwned: Movie[] = [];
  public staffPickMovies: Movie[] = [];
  // New Releases wall composition: `recentlyAddedMovies` fills the "row per
  // title" sections (recently-added, library-only titles -- see the
  // constructor); `nrSections` holds the sections for the New Releases wall.
  public recentlyAddedMovies: Movie[] = [];
  public nrSections: NewReleasesSection[] = [];
  // Global ribbon boundary columns (a boundary b sits between cols b-1 and b)
  // whose section divider is SUPPRESSED because it would bisect a
  // double-feature. Consulted by the wall-run geometry builders and by
  // nrDividerNudge so the doubled section reads as one continuous display.
  public nrSuppressedDividerCols = new Set<number>();

  // Hero cases: the selected slot's instanced boxes are swapped for these two
  // ordinary meshes carrying the movie's REAL artwork/metadata (the instanced
  // shelves share one placeholder texture set — see video-case.ts).
  public heroFrontMesh: THREE.Mesh | null = null;
  public heroBackMesh: THREE.Mesh | null = null;
  public heroMovieId: string | null = null;
  public heroSlotKey: string | null = null;

  // Series boxsets (TV titles): the inspected hero is one chunky season boxset
  // whose wide side panels carry the episode list (+X) and a "PLAY SEASON"
  // panel (-X). heroFace tracks which face the shopper has rotated to
  // (0 front, 1 episodes, 2 back, 3 play-season); heroFaceRot is the continuous
  // rotation target so cycling 3 -> 0 keeps turning instead of unwinding.
  public heroFace = 0;
  public heroFaceRot = 0;
  public heroEpisodes: Episode[] | null = null; // null = loading/not fetched
  public heroEpisodesMovieId: string | null = null;
  public heroEpisodeIdx = 0;
  // Injected by main.ts (real Jellyfin fetch) / harness.ts (synthetic data);
  // called lazily, only when a series is actually inspected — never at boot.
  public onFetchEpisodes: ((movie: Movie) => Promise<Episode[]>) | null = null;

  // Dynamic endcap built when a cast/crew name is tapped on a back cover.
  public personEndcap: {
    group: THREE.Group;
    person: string;
    kind: 'actor' | 'director';
    movies: Movie[];
    caseMeshes: THREE.Mesh[];
    cols: number;
    selectedIdx: number;
    x: number;
    z: number;
    leftCap?: THREE.Mesh;
    moviePositions: { row: number, col: number, rowCount: number }[];
    returnState: {
      mode: 'browse' | 'inspect';
      libraryIdx: number;
      unitIdx: number;
      side: 'front' | 'back' | 'left' | 'right';
      shelf: number;
      col: number;
      nrDirect: boolean;
      // Fixture-hosted cases are identified by these, not by unitIdx.
      unitSource: 'shelving' | 'fixture';
      fixtureId: string | null;
    };
  } | null = null;
  public slottedFixtures: SlottedFixture[] = [];
  // T19: candy-rack fixtures aren't slotted (no movie slots), so they're not
  // covered by slottedFixtures above -- kept separately so the candy
  // checkout screen can read their real-product rows.
  public candyDisplays: CandyDisplay[] = [];
  // Same reason as candyDisplays: the tip jar isn't slotted, and both the
  // walk-mode click test and the counter's Right press need to find it.
  public tipJars: TipJar[] = [];
  public selectedUnitSource: 'shelving' | 'fixture' = 'shelving';
  public selectedFixtureId: string | null = null;
  public clerk: StoreClerk | null = null;
  // The clerk's walkability grid + the footprint set it was built from, kept
  // for the harness path audit (debugClerkPathAudit).
  public clerkNavGrid: ClerkNavGrid | null = null;
  public clerkNavRects: NavRect[] = [];
  public movieInstancesMap: Map<string, InstancedMovieGroup> = new Map(); // key: movie.id
  // movie.id -> its shelf slots, so a poster landing can re-dirty exactly the
  // cases wearing it (see setPosterLoadedNotify). Built once per stock build;
  // a rebuild re-keys slots but never changes which movie a slot holds, so the
  // index survives it.
  public slotsByMovieId: Map<string, MovieSlot[]> = new Map();
  public unitSideFrontMeshMap: Map<string, THREE.InstancedMesh> = new Map();
  public unitSideBackMeshMap: Map<string, THREE.InstancedMesh> = new Map();
  public genericMovieMesh: THREE.InstancedMesh | null = null;
  // Static instanced mesh holding the extra stacked-behind copies for high-rated films
  // (see extraCopiesCount()). Rebuilt in place whenever slot resting positions change
  // (genre filtering, library rebuilds) so the copies stay behind the correct box.
  public extraCopiesMesh: THREE.InstancedMesh | null = null;
  public extraCopiesCapacity = 0;
  public slotsByPosition: Map<string, MovieSlot> = new Map(); // key: "libIdx_unitIdx_side_shelf_col"
  public dirtySlots = new Set<MovieSlot>(); // slots that need matrix updates this frame
  // Shadow refresh is on-demand (shadowMap.autoUpdate = false). Every mesh — structure,
  // shelves, dividers, and all movie case instances — casts and receives shadows. The
  // shadow map re-renders only when a caster moves: shadowRefreshFrames handles the
  // initial build and rebuildMovieBoxes; end-cap transitions trigger
  // per-frame re-bakes via shadowCastersMoved; case-pop animations instead rebake once
  // when they settle (see hadAnimatingSlots in animate()) — a lifting DVD case doesn't
  // visibly move its own shadow mid-lerp, so re-rendering the 4K map every frame of a
  // ~1s pop was wasted GPU time.
  private shadowRefreshFrames = 3;
  // Structural change (shelves rebuilt, fixtures added, endcap raised/torn
  // down): schedule the multi-frame sun rebake AND re-flag the troffer key
  // lights' opted-out maps (shadow.autoUpdate = false — see their creation in
  // buildStore) so fixture shadows follow the new geometry. Hot-path rebakes
  // (case-pop settles, launch flourish, end-cap lerps) deliberately do NOT
  // come through here: they refresh the sun's map alone.
  public queueStructuralShadowRefresh(frames = 3) {
    this.shadowRefreshFrames = frames;
    for (const key of this.trofferKeyLights) {
      if (key.castShadow) key.shadow.needsUpdate = true;
    }
  }
  // Tracks whether any movie-case slot was actually moving (isMoving) last frame, or a
  // launch flourish was in flight. When this transitions from true to false, exactly one
  // shadow map re-bake is requested — "settle once" instead of "re-bake every frame".
  private hadAnimatingSlots = false;
  // Floor plan: unit placement, category shelf order, arrangement, and the
  // layout-space transforms (see store-plan.ts). Created in the constructor once
  // the libraries are known; read everywhere through the delegation getters.
  public plan!: StorePlan;
  public colsCount = 7;

  // New Releases wall layout (computed from store width in the constructor).
  // The ribbon STARTS on the LEFT wall (a tall unit behind the left window
  // ribbon, back-aligned into the back-left corner) and continues contiguously
  // onto the back wall, which carries shelving spanning the whole wall and is
  // stepped: the right portion juts forward toward the viewer. The RIGHT wall
  // carries no New Releases — its stretch behind the window ribbon holds the
  // exterior side door instead.
  public nrLeftWallCols = 36;
  // Side-window ribbon z-span shared by BOTH side walls (null = no ribbon,
  // walls stay solid). Computed with the NR wall layout below; consumed by the
  // side-wall build in buildStore() and the exterior facade veneers.
  public sideRibbon: { frontZ: number; backZ: number } | null = null;
  public nrBackWallColsRun1 = 0;
  public nrBackWallColsRun2 = 0;
  private nrBackWallColsRun3 = 0;
  private nrBackWallCols = 36;
  public nrTotalCols = 72;
  public nrBackLeftX = -6.0;       // left X where back-wall shelving begins (after the left sliver)
  public nrBackRightEdgeX = 30.5;  // right X where back-wall shelving ends
  // Gap between the back-left corner and the first back-wall column: exactly
  // the left-wall New Releases unit's built depth from the wall face, so the
  // back run's left end panel (0.04 ft, extending past the run length) tucks
  // into the left unit's front face and the ribbon reads CONTIGUOUS around
  // the corner (left wall run -> back wall run) with no bare-wall wedge.
  private readonly LEFT_SLIVER = NR_LEFT_UNIT_STANDOFF + NR_RUN_DEPTH;
  public stepX = 15.0;             // X at which the back wall steps forward
  public stepDepth = 7.0;          // how far the right section comes toward the viewer (+Z)
  public hasStep = true;           // false when bb_corner === 'none' (flat back-right wall)

  // Data-driven room-shell options (T07): ceiling height, stepped-corner
  // footprint, and decorated wall zones. Read once at construction so a
  // settings-drawer rebuild picks up any change.
  public shellSpec: StoreShellSpec = getStoreShellSpec();
  public ceilingY: number = this.shellSpec.ceilingY;
  // Data-driven storefront options (T05): door style, window bay layout, and
  // counter style/top. Computed once buildStore() knows the store width (see
  // buildStore()); defaults reproduce the original storefront exactly.
  public storefrontSpec!: StorefrontSpec;
  
  // Selection state
  public selectedLibraryIdx = 0;
  public selectedUnitIdx = 0;
  public selectedSide: 'front' | 'back' | 'left' | 'right' = 'front';
  public selectedShelf = AISLE_SHELF_HEIGHTS.length - 1; // Start in top shelf
  public selectedCol = 0;
  public isFlipped = false; // Track whether the rental case is flipped
  // Third stop of the inspect flip cycle (front -> back -> spine -> front):
  // the rental copy turns its spine to the camera (see HERO_SPINE_YAW).
  public heroSpine = false;
  public selectedBackCoverRegionIdx = -1;
  public highlightedBackRegionName = '';
  public cameraWindowMinCol = 0;

  // "Launch" flourish played when a movie is selected to play: the rental
  // copy spins three quick turns in ~1s while rising, then flies into the camera
  // before playback starts. While active it takes over the active slot's back-box
  // (rental) instance and hides the jellyfin front box; on completion it
  // fires onComplete (which kicks off the actual video playback).
  public launchAnim: {
    slot: MovieSlot;
    startTime: number;
    baseX: number;
    baseY: number;
    baseZ: number;
    baseRotY: number;
    onComplete: () => void;
    caseDropped?: boolean;  // the case has been handed to the bag's soft-body sim
    chimed?: boolean;       // the checkout chime (rental confirmed) has played
    bagFrozen?: boolean;    // the settled bag has been frozen for the rigid carry-out
    exitHandoff?: boolean;  // the shared checkout-exit walk owns the rest of the ritual
  } | null = null;

  // Harness only (`--state launch`): pin the launch flourish at a fixed elapsed
  // so a chosen beat can be screenshotted without real time marching it forward.
  // null in all real gameplay — see debugStageLaunch().
  public debugLaunchFreeze: number | null = null;

  // Modes: library-select (end caps) -> overview (entrance vantage + shelf
  // cursors, T21) -> browse (shelves) -> inspect (zoom/flip). 'backroom' (T23)
  // is the rental-lockout pocket room — the store is unreachable from it.
  public mode: 'library-select' | 'genre-select' | 'overview' | 'browse' | 'inspect' | 'walk-around' | 'person-endcap' | 'checkout' | 'backroom' = 'library-select';
  
  // Callbacks for main application integration
  public onModeChange?: (mode: string) => void;
  public onGenreMenuUpdate?: (libraryName: string, genres: string[], selectedIdx: number, visible: boolean) => void;
  public onSelectionChange?: (movie: Movie | null) => void;
  public onLibrarySelectUpdate?: (libraryName: string, hasLeft: boolean, hasRight: boolean, hasUp: boolean, hasDown: boolean, visible: boolean) => void;
  // Left at the checkout counter reaches for the clerk's terminal. The scene
  // only reports the intent — the menu's contents and key handling live in
  // main.ts alongside the power menu they mirror.
  public onCounterTerminal?: () => void;
  // Same split for the search terminal: anything in-scene that offers "let me
  // search" (the clerk dialog's option 1) must raise it through main.ts's
  // openSearch(), which owns ui.isSearchOpen and therefore the Back key that
  // closes it again. Calling enterSearchMode() directly instead docks the
  // camera with nobody owning it, and since the dock is never released the
  // NEXT enterSearchMode() early-returns — killing search and the manager
  // terminal for the rest of the session.
  public onOpenSearch?: () => void;
  public onEnterFlatMode?: () => void;
  public onBrowseConfirm?: () => void;

  // Resolves once every cover in the store has settled (loaded or failed) after
  // the initial low-res preload pass kicked off in buildAllMovieBoxes(). The
  // caller uses this to hold the scene hidden/non-interactive until shelves are
  // fully dressed instead of revealing a wall of gray placeholder spines.
  public texturesReadyPromise: Promise<void> = Promise.resolve();
  public onTextureLoadProgress?: (loaded: number, total: number) => void;

  // #62/#63 (supersedes #40): ceiling-hung genre nav signs and the per-section
  // shelf-topper signboards are permanent store dressing and stay visible in
  // every mode — the old gate that hid them outside the security-cam
  // library-select view is gone. The only seccam-only element is the floating
  // selection arrow, handled in updateSelectionArrow().

  public triggerLibrarySelectUpdate(visible: boolean = true) {
    this.requestRender();
    if (this.onLibrarySelectUpdate) {
      const name = this.getActiveAisleName();
      // Directional reachability — an arrow shows only if that press would move
      // the selection. Axis/sign match moveLeft/Right/Up/DownInternal exactly:
      // 'x' = viewer's right axis, 'z' = camera forward; Up = +z, Down = -z.
      const hasLeft = this.canMoveLibrarySelect('x', -1);
      const hasRight = this.canMoveLibrarySelect('x', 1);
      const hasUp = this.canMoveLibrarySelect('z', 1);
      const hasDown = this.canMoveLibrarySelect('z', -1);
      this.onLibrarySelectUpdate(name, hasLeft, hasRight, hasUp, hasDown, visible && this.mode === 'library-select');
    }
  }
  
  // Render loop tracking
  private isRendering = true;
  private frameCount = 0;
  // Render-on-demand (issue #24): the requestAnimationFrame loop runs forever (a
  // no-op tick is ~free) but the composer only draws when something changed. We
  // pick an "activity tier" each frame — ACTIVE (every frame), VIDEO (~24fps while
  // a ceiling TV plays) or IDLE (composite nothing; leave the last frame on
  // screen) — and skip the heavy render/anim work accordingly. forceRenderFrames
  // wakes the renderer for a few frames after any user interaction (requestRender).
  private lastRenderTime = 0;
  private forceRenderFrames = 0;
  private tierIsIdle = false; // this frame chose IDLE (composite nothing; see animate())
  private currentTier: 'active' | 'video' | 'idle' = 'active'; // exposed via getPerfInfo() (#16)
  private readonly VIDEO_FRAME_MS = 1000 / 24;
  // Input-idle thresholds — both read the shared last-real-input clock
  // (src/user-activity.ts, stamped only by actual keyboard/mouse/gamepad
  // input, never polling): frames that would drop the render tier to IDLE
  // stay ACTIVE until 30s of input silence, and after 5 minutes the clerk
  // fades out and her roaming sim pauses entirely — nobody's there, nothing
  // needs to move, so the store can go fully idle.
  private static readonly IDLE_TIER_INPUT_MS = 30_000;
  // How long the selection arrow keeps BOBBING after the last real input.
  // Deliberately far shorter than IDLE_TIER_INPUT_MS, because the bob is the
  // only thing holding the VIDEO tier on the entrance/jump-index view — the
  // app's root since 2026-08-09 — and the VIDEO tier is excluded from the
  // settle supersample (see settleRefine). At 30s that meant the FIRST view
  // you see spent half a minute re-compositing a room where nothing moves but
  // this arrow, then dropped straight to IDLE, parking forever on a base-budget
  // frame: 2180x1226 stretched over a 3840x2160 panel. Measured on the 4K
  // harness: 4009 renderer.render() calls per 10 idle seconds before, 27 after,
  // and the parked frame goes 2.67MP -> 16.6MP. The arrow stays visible, frozen
  // mid-pose; any input resumes it, since every input path stamps activity.
  private static readonly ARROW_BOB_INPUT_MS = 2_500;
  // How long after the camera stops moving qualityScale stays at native res, so
  // the frame you settle on is sharp before render-on-demand parks it. Sized to
  // outlast the ~250ms AO fade-in that keeps rendering after a stop, so the
  // persisted still is never the last, lower-res fade frame.
  private static readonly QUALITY_SETTLE_MS = 400;
  private static readonly CLERK_FADE_S = 0.35; // clerk sleep/wake fade (seconds)
  // Clerk sleep state (see the pre-tier clerk block in animate()).
  private clerkAsleep = false;
  public clerkFade = 1; // 1 visible … 0 hidden; pushed into StoreClerk.setFade()
  public onConsoleLog: (msg: string, type: 'system' | 'cec' | 'video') => void;
  private prefetchTimeout: number | null = null;
  public isBrowsingNewReleasesDirectly = false;
  private readonly _headlightOffset = new THREE.Vector3();
  // Scratch list reused by animate()'s dirty-slot pass (no per-frame allocation).
  private readonly _settledSlots: MovieSlot[] = [];
  // Out-params reused by constrainWalkPosition() every walk frame.
  public readonly _constrainedWalk = { x: 0, z: 0 };

  // ─── T21: entrance-overview browsing ──────────────────────────────────────
  // With the (default-on) "Start at entrance overview" setting, browsing begins
  // standing just inside the vestibule with head-look only; every shelf run
  // carries a floating labeled cursor and confirming one flies the camera to
  // that run's normal browse position. Cursors are built lazily on first entry
  // (see ensureOverviewCursors) and disposed in destroy().
  public overviewStart = typeof localStorage !== 'undefined' ? localStorage.getItem('bb_overview_start') !== '0' : true;
  public overviewCursors: OverviewCursors | null = null;

  // ── T22: carried tapes + front-counter checkout ────────────────────────────
  // Off by default (settings toggle 'Carry & checkout'); when off, the classic
  // instant-play flow is byte-for-byte untouched — no CarriedTapes instance
  // even exists until the first take/rehydrate.
  public carryMode = typeof localStorage !== 'undefined' ? localStorage.getItem('bb_carry_mode') === '1' : false;
  public carried: CarriedTapes | null = null;
  /** Fires once per completed checkout with the carried item ids (T23 consumes this). */
  public onCheckoutComplete?: (items: string[]) => void;
  /** Fires whenever the carried-tape count changes (HUD hint visibility). */
  public onCarriedChange?: (count: number) => void;
  public checkoutRunning = false; // the hop-to-counter/into-bag flourish is playing
  // Non-rental checkout exit ritual (user feedback: "the bag sequence is very
  // important"): the customer stands BESIDE the counter's right end (the -X
  // exit side, not in front of the apex). After the last case drops into the
  // bag the camera stays on it while the plastic wraps (~1.2s), then the
  // clerk shoves the standing bag across the island up onto the shield
  // band's blue top and parks it at the counter's RIGHT end, where it WAITS
  // — it never floats off the counter toward the customer. The first-person
  // walk-out rounds the counter's right end, stops beside the waiting bag,
  // pinches the handle and lifts it off the band edge into the carry
  // (soft-body droop), then continues up the exit corridor and out the exit
  // door under the rising whiteout before playback starts. Rental mode
  // keeps its own tail (fade into the back room).
  public checkoutExit: {
    start: number;          // performance.now() when the last case landed in the bag
    ids: string[] | null;   // stashed from CarriedTapes' onComplete until the walk finishes
    slid?: boolean;         // cloth frozen (settled shape) for the rigid shove to the edge
    pickedUp?: boolean;     // soft-body handle pinch + lift kicked off at the grab beat
    frozen?: boolean;       // droop frozen mid-hold for the rigid carry
    exitStarted?: boolean;  // door chime + walk path built
    grabP?: number;         // path parameter where the walker passes the waiting bag
    path?: THREE.CatmullRomCurve3; // walk-out route (built once at the walk beat)
    onDone?: () => void;    // play-flourish handoff: called instead of finishCheckout
  } | null = null;
  // Harness only (`--state bagexit`): pin the exit ritual at a fixed elapsed
  // ms so any beat can be screenshotted (mirrors debugLaunchFreeze).
  public debugCheckoutExitFreeze: number | null = null;

  // ── T23: rental mode + back room ───────────────────────────────────────────
  // Opt-in "hardcore mode": limited tapes per night (weekday 2 / weekend 4)
  // and a post-checkout lockout spent in the detached back-room pocket.
  public rentalMode = typeof localStorage !== 'undefined' ? localStorage.getItem('bb_rental_mode') === '1' : false;
  public backRoom: BackRoom | null = null;
  /** Resolves once the room is furnished (props fetched) — harness waits on it. */
  public backRoomReadyPromise: Promise<void> = Promise.resolve();
  // Tapes to drop into the counter's RETURN TAPES HERE chute on the next
  // store re-entry (set when playback launches / a non-rental checkout
  // completes; the back-room release resolves its own list). Always empty on
  // a fresh boot, so the first entry never plays the ritual.
  public pendingReturnDrop: Movie[] = [];
  public rentalRecord: RentalRecord | null = null;
  public rentalUnlocked = false;
  public rentalUnlockTimer: number | null = null;
  // Suspend-proof clock check: setTimeout drifts across sleep, so wake events
  // re-check the wall clock (registered while a lockout is active only).
  public readonly onRentalWake = () => this.checkRentalClock();
  public rentalWakeHooked = false;
  /** Fired after the insert beat — the owner starts fullscreen playback. */
  public onBackRoomPlay?: (movie: Movie) => void;
  public overviewYaw = 0;   // radians; 0 faces the back wall, positive turns LEFT
  public overviewPitch = 0; // radians; positive looks up
  public overviewCrosshair: HTMLDivElement | null = null;
  public readonly _ovForward = new THREE.Vector3();
  // Vantage (feedback/003): just inside the doors but OUTSIDE the checkout
  // counter, off to the entering customer's right — as if you stepped in and
  // moved clear of the queue. (The old spot, x=11 z=8, stood you in the open
  // mouth of the counter's V.) The counter's shoulders reach x≈20.8 and the
  // vestibule glass box ends at x≈18.7; x=24 clears both and stays well short
  // of the right wall (≥34 at minimum store width), at walking eye height.

  // Floating "you are here" selection arrow shown only in the security-cam
  // library-select view (#62). It hovers
  // above the currently-selected shelving unit, points down at it, carries the
  // library name, and bobs / billboards toward the camera each frame.
  public selectionArrow: THREE.Group | null = null;
  public selectionArrowLabel: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture } | null = null;
  public selectionArrowLabelText = '';
  public selectionArrowBaseY = 7.0;

  // 3D wall signage textures and materials
  public nrTextTex: THREE.Texture | null = null;
  public nrLogoBodyTex: THREE.Texture | null = null;
  public nrLogoYellowTex: THREE.Texture | null = null;
  public entranceLogoYellowTex: THREE.Texture | null = null;
  // LogoSpec Phase B1: the truly-3D storefront sign (extruded emblem or
  // channel letters); null whenever the spec keeps the flat layered sign.
  public storefrontLogo3D: StorefrontLogo3D | null = null;
  public promoSignTex: THREE.Texture | null = null;
  public promoSignMat: THREE.MeshStandardMaterial | null = null;
  public promoSignRedMat: THREE.MeshStandardMaterial | null = null;

  constructor(
    container: HTMLDivElement,
    libraries: JellyfinLibrary[],
    onConsoleLog: (msg: string, type: 'system' | 'cec' | 'video') => void,
    jellyfinUrl = '',
    jellyfinToken = '',
    comingSoonMovies: Movie[] = [],
    discoveryMovies: Movie[] = [],
    gameMovies: Movie[] = [],
    // Watch-history recommendations (see staff-picks.ts): ownedPicks is the
    // ranked owned pool (deliberately unmarked on the shelf — no flag, no
    // sticker); discoveryPicks are not-in-library endcap candidates.
    staffPicks: { ownedPicks: Movie[]; discoveryPicks: Movie[] } | null = null
  ) {
    this.container = container;
    this.onConsoleLog = onConsoleLog;
    this.libraries = libraries;
    // The store renders on demand, so a live brand repaint has to ask for a
    // frame or it sits in the texture unseen until the next input.
    setBrandRenderHook(() => this.requestRender());
    (window as any).__surfaces = this.surfaces; // debugging: __surfaces.ids() / .get(id)
    this.jellyfinUrl = jellyfinUrl;
    this.jellyfinToken = jellyfinToken;
    // T18: video-game stock from an (optional) Romm server -- see romm.ts. Empty
    // when Romm isn't configured/reachable, so the VIDEO GAMES section never
    // builds and nothing is fetched.
    this.gameMovies = gameMovies;

    // The request-suggestion pool is the fresh trending/popular fetch PLUS
    // anything already sitting in Jellyseerr's own pending-request queue
    // (comingSoonMovies). comingSoon entries are already-requested, so they're
    // flagged accordingly and take priority over a duplicate fresh suggestion
    // for the same title. The pool shelves inline below and feeds the clerk's
    // "want me to order it?" suggestions.
    const comingSoonAsDiscovery: Movie[] = comingSoonMovies
      .filter((m) => typeof m.tmdbId === 'number')
      .map((m) => ({ ...m, discovery: true, discoveryRequested: true }));
    const comingSoonTmdbIds = new Set(comingSoonAsDiscovery.map((m) => m.tmdbId));
    this.discoveryMovies = [
      ...comingSoonAsDiscovery,
      ...discoveryMovies.filter((m) => !comingSoonTmdbIds.has(m.tmdbId)),
    ];

    // Staff-picks endcap stock (see staff-picks.ts). A title both trending
    // AND watch-history-recommended shows once: the endcap wins, the
    // shelf merge below drops its copy (two cases of one "we don't have
    // this" title would double-count request state by movie id).
    this.staffPickOwned = staffPicks?.ownedPicks ?? [];
    this.staffPickMovies = (staffPicks?.discoveryPicks ?? []).filter(
      (m) => !comingSoonTmdbIds.has(m.tmdbId)
    );
    const staffPickTmdbIds = new Set(this.staffPickMovies.map((m) => m.tmdbId));
    if (staffPickTmdbIds.size > 0) {
      this.discoveryMovies = this.discoveryMovies.filter((m) => !staffPickTmdbIds.has(m.tmdbId));
    }

    // Feedback 009: no dedicated "REQUEST IT" rack. Every not-yet-in-library
    // suggestion files onto the ordinary shelves exactly like a missing
    // collection entry: its natural alphabetical spot, no backstock copies
    // (extraCopiesCount), a REQUEST corner sticker (gold COMING SOON once
    // ordered). Settings rebuilds reuse the same library arrays, so strip any
    // previously merged copies before pushing the fresh pool.
    for (const lib of this.libraries) {
      for (let i = lib.movies.length - 1; i >= 0; i--) {
        if (lib.movies[i].discovery) lib.movies.splice(i, 1);
      }
    }
    {
      // Shelve them among the plain-movie stock: the library with the most
      // non-series, non-game titles (gaps/suggestions excluded so a huge gap
      // count can't outvote the real catalog).
      let shelfLib: JellyfinLibrary | null = null;
      let best = -1;
      for (const lib of this.libraries) {
        const n = lib.movies.filter((m) => !m.isSeries && !m.game && !m.collectionGap).length;
        if (n > best) { best = n; shelfLib = lib; }
      }
      if (shelfLib) {
        const shelvedTmdbIds = new Set<number>();
        // Title fallback identity, same as splitPicks': an owned title whose
        // Jellyfin entry carries no Tmdb provider id would otherwise get a
        // second, REQUEST-stickered box beside its real one. Deliberately
        // year-BLIND: even a remake with the same name (the two "Aladdin"s)
        // must not stand as a request case next to the one you own.
        const shelvedTitleKeys = new Set<string>();
        for (const lib of this.libraries) {
          for (const m of lib.movies) {
            if (typeof m.tmdbId === 'number') shelvedTmdbIds.add(m.tmdbId);
            for (const key of titleMatchKeys(m.title)) shelvedTitleKeys.add(key);
          }
        }
        const standsOnShelf = (m: Movie): boolean =>
          (typeof m.tmdbId === 'number' && shelvedTmdbIds.has(m.tmdbId)) ||
          titleMatchKeys(m.title).some((key) => shelvedTitleKeys.has(key));
        for (const m of this.discoveryMovies) {
          // A suggestion that duplicates anything already standing (owned
          // title or a collection-gap case) never gets a second box.
          if (standsOnShelf(m)) continue;
          m.libraryName = shelfLib.name;
          shelfLib.movies.push(m);
        }
        // Same guard for the endcap order candidates: a title the loader's
        // joins missed must not stand on an endcap claiming "we don't have
        // it" when its real case is three aisles over.
        this.staffPickMovies = this.staffPickMovies.filter((m) => !standsOnShelf(m));
      }
    }

    // Starting time of day: honor a `bb_outside` localStorage override (kiosk
    // setups / deterministic testing), otherwise randomize (50% night).
    const forcedOutside = typeof localStorage !== 'undefined' ? localStorage.getItem('bb_outside') : null;
    this.outdoor.outsideMode = (forcedOutside === 'day' || forcedOutside === 'night'
        || forcedOutside === 'sunset')
      ? forcedOutside
      : (() => { const r = Math.random(); return r < 0.4 ? 'night' : r < 0.8 ? 'day' : 'sunset'; })();
    // Fresh sun direction for this visit (see rollSunPlacement) — the lighting
    // rig and sky pano read it when they're built below.
    this.outdoor.rollSunPlacement();

    // Plan the whole floor before anything derives from it: category shelf order
    // per library, unit placement in hatched runs for the active arrangement, and
    // the room bounds (backWallZ, aisle pivot). See store-plan.ts.
    this.plan = new StorePlan(this.libraries);
    this.plan.plan();

    // Derive the New Releases wall layout from the store width. The back-wall
    // shelving covers the entire back wall except a sliver on the left next to
    // the window, and steps forward on the right.
    {
      const sw = this.getStoreWidth();
      const leftEdge = 11.0 - sw / 2;
      const rightEdge = 11.0 + sw / 2;
      this.nrBackLeftX = leftEdge + this.LEFT_SLIVER;
      this.nrBackRightEdgeX = rightEdge - 0.2;
      // Stepped-corner footprint comes from the shell spec (T07). Width sets how
      // far left the step begins; depth is clamped to the section width so the
      // NR connector run is never longer than the section it wraps, and stays
      // below the 8 ft back-wall shelf margin so islands never enter the notch.
      const corner = this.shellSpec.steppedCorner;
      if (corner && corner.corner === 'back-right') {
        const stepW = corner.w;                             // right section width = stepW
        this.stepX = rightEdge - stepW;
        this.stepDepth = Math.min(corner.d, this.nrBackRightEdgeX - this.stepX);
      } else {
        // bb_corner === 'none' (or no back-right corner): no forward notch. The
        // back-right wall is a clean flat continuation of the back wall. Collapse
        // the step so Run 1 spans the whole back wall (to nrBackRightEdgeX, keeping
        // the usual 0.2 ft right-wall shelf clearance) and the connector/
        // stepped-forward runs (2 & 3) drop to zero columns.
        this.stepX = this.nrBackRightEdgeX;
        this.stepDepth = 0;
      }
      // Derived flag every step-only site gates on, so nothing floats or leaves a
      // hole when the notch is removed. See the guarded blocks in buildStore().
      this.hasStep = this.stepDepth > 0;
      const length1 = this.stepX - this.nrBackLeftX;
      const length2 = this.stepDepth;
      const length3 = this.nrBackRightEdgeX - this.stepX;

      this.nrBackWallColsRun1 = Math.max(0, Math.floor((length1 - 1.0) / BOX_SPACING));
      this.nrBackWallColsRun2 = this.hasStep ? Math.max(0, Math.floor((length2 - 1.0) / BOX_SPACING)) : 0;
      this.nrBackWallColsRun3 = this.hasStep ? Math.max(0, Math.floor((length3 - 1.0) / BOX_SPACING)) : 0;

      this.nrBackWallCols = this.nrBackWallColsRun1 + this.nrBackWallColsRun2 + this.nrBackWallColsRun3;

      // Side-window ribbons: both side walls carry
      // the reference building's banded window run toward the FRONT. WINDOWS
      // TAKE PRIORITY (user direction): the ribbon claims its reference span
      // first, and the LEFT-wall NR unit then sizes itself into whatever
      // wall is left behind it — dropping to nothing below one signboard
      // section (the back-wall runs still carry New Releases). The ribbon's
      // reach is still constrained by the stepped corner (the RIGHT wall is
      // the tighter of the two, and both walls share one ribbon span). This
      // is also the groundwork for config-menu window placement: windows will
      // be user-authored to match their real store, with the NR runs filling
      // the space that remains.
      const stepWallZ = this.backWallZ + this.stepDepth;
      // Depth rule (user direction): "the store is twice as deep as the side
      // windows extend — the side windows end half way down the store". The
      // ribbon is built from WHOLE 4-ft panes (SIDE_RIBBON_PANE_W), so its
      // length is the whole-pane count closest to (half the glass-to-back-wall
      // depth minus the front corner margin) — never a stretched pane. At the
      // baseline depth (52.5 ft, store-layout.ts baselineStoreDepth) that is
      // exactly SIX panes ending exactly at half-depth. The count is still
      // capped by what the tighter (right, stepped-corner) wall can give.
      const idealLen = (15.0 - this.backWallZ) / 2 - (15.0 - SIDE_RIBBON_FRONT_Z);
      const maxSpan = SIDE_RIBBON_FRONT_Z - (stepWallZ + 0.3) - SIDE_RIBBON_CLEARANCE; // most the tighter (right) wall could give
      const paneCount = Math.min(
        Math.round(idealLen / SIDE_RIBBON_PANE_W),
        Math.floor(maxSpan / SIDE_RIBBON_PANE_W),
      );
      const ribbonLen = paneCount * SIDE_RIBBON_PANE_W;
      this.sideRibbon = ribbonLen >= SIDE_RIBBON_MIN_LEN
        ? { frontZ: SIDE_RIBBON_FRONT_Z, backZ: SIDE_RIBBON_FRONT_Z - ribbonLen }
        : null;
      // Left wall has no stepped corner: its unit back-aligns to the back wall.
      const unitBackZ = this.nrLeftWallUnitBackZ();
      const unitSpace = (this.sideRibbon ? this.sideRibbon.backZ - SIDE_RIBBON_CLEARANCE : 15.0) - unitBackZ;
      // GH #6: this used to hard-cap at 36 columns regardless of how much wall
      // was actually available, which left the run stopping visibly short of
      // the window ribbon on any store wide enough to offer more (the
      // baseline-width store's ~44 available columns only ever built 36,
      // an 8-column/~4.6ft gap of bare wall between the last case and the
      // glass). The whole point of this calc is described right above it as
      // ADAPTIVE — sized to whatever the ribbon leaves behind it — so let it
      // actually use the space it computed instead of throwing some away.
      this.nrLeftWallCols = Math.max(0, Math.floor((unitSpace - 1.0) / BOX_SPACING));
      if (this.nrLeftWallCols < SECTION_COLS) this.nrLeftWallCols = 0; // below one section, drop the run

      this.nrTotalCols = this.nrLeftWallCols + this.nrBackWallCols;
    }

    // Gather all unique movies from all libraries for the New Releases back
    // wall. Phantom stock — request suggestions, collection gaps, pending
    // orders — never qualifies: NEW RELEASES advertising a box with no tape
    // in it is a lie the aisle sticker treatment doesn't excuse.
    const allMoviesMap = new Map<string, Movie>();
    this.libraries.forEach((lib) => {
      lib.movies.forEach((m) => {
        if (m.discovery || m.collectionGap || m.comingSoon) return;
        allMoviesMap.set(m.id, m);
      });
    });
    const allMovies = Array.from(allMoviesMap.values());
    // Media Release Date pin (#42): under a pin, "new" means newest in the
    // STORE'S timeline — the nearest premiere at or before the rolling cutoff
    // (the catalog is already filtered to it) — not most recently added to
    // the server, which would fill the wall with whatever synced last.
    const nrCutoff = activeMediaCutoff();
    const nrReleaseKey = (m: Movie): number => {
      if (m.premiereDate) {
        const t = Date.parse(m.premiereDate);
        if (Number.isFinite(t)) return t;
      }
      return m.year > 0 ? new Date(m.year, 0, 1).getTime() : 0;
    };
    const sortedByDate = [...allMovies].sort((a, b) => {
      const dateA = nrCutoff ? nrReleaseKey(a) : (a.dateCreated ? new Date(a.dateCreated).getTime() : 0);
      const dateB = nrCutoff ? nrReleaseKey(b) : (b.dateCreated ? new Date(b.dateCreated).getTime() : 0);
      if (dateA !== dateB) return dateB - dateA;
      return b.title.localeCompare(a.title);
    });

    const numWallSections = Math.ceil(this.nrTotalCols / SECTION_COLS);
    // A regular wall section faces ONE title out across its whole 6-column row,
    // so the wall wants one candidate per ROW, not per column. Those two counts
    // only coincided while a section happened to be as tall as it is wide
    // (6 tiers x 6 cols); at the measured 8 tiers a column-sized slice starves
    // the wall of genuine new releases and the tail rows fall through to the
    // catalog backfill below.
    const nrWallRows = numWallSections * WALL_SHELF_HEIGHTS.length;

    // The New Releases wall is library-only -- Jellyseerr suggestions (and
    // its own pending-request queue) live on the ordinary shelves as
    // REQUEST-stickered cases, filtered out of the gather above.
    const recentlyAddedCandidates = sortedByDate.slice(0, nrWallRows);
    const newReleaseCandidates: Movie[] = [...recentlyAddedCandidates];

    // Super-featured new releases: rating of 90 or above on Rotten Tomatoes
    const superFeatureNewReleases = newReleaseCandidates.filter(
      (m) => typeof m.criticRating === 'number' && m.criticRating >= 90
    );
    // Double-featured new releases: critics AND the audience both love it —
    // the super-feature critic bar (>= 90 RT) plus isWallHighlyRated's
    // audience bar (communityRating >= 8.0) earns TWO adjacent sections.
    const doubleFeatureCandidates = superFeatureNewReleases.filter(
      (m) => typeof m.communityRating === 'number' && m.communityRating >= 8.0
    );
    const superFeatureIds = new Set(superFeatureNewReleases.map(m => m.id));
    const regularNewReleases = newReleaseCandidates.filter(m => !superFeatureIds.has(m.id));

    const recentlyAddedIds = new Set(newReleaseCandidates.map((m) => m.id));
    const highRatedCandidates = allMovies
      .filter((m) => !recentlyAddedIds.has(m.id) && isWallHighlyRated(m))
      .sort((a, b) => (b.communityRating ?? 0) - (a.communityRating ?? 0) || (b.criticRating ?? 0) - (a.criticRating ?? 0));

    // Ensure we leave at least one regular section if there are any regular
    // movies to show. All feature tiers draw from this shared budget: a
    // double-feature consumes 2 of numWallSections, a super-feature 1 — so on
    // a small wall (2-3 sections) at most one double fits and a regular
    // section always survives.
    const featureSectionBudget = (regularNewReleases.length > 0 || highRatedCandidates.length > 0)
      ? Math.max(0, numWallSections - 1)
      : numWallSections;
    const numDoubleFeaturesToPlace = Math.min(
      doubleFeatureCandidates.length,
      Math.floor(featureSectionBudget / 2)
    );
    const placedDoubleIds = new Set(
      doubleFeatureCandidates.slice(0, numDoubleFeaturesToPlace).map(m => m.id)
    );
    // Double-qualified titles that didn't fit the budget still meet the
    // single-section bar, so they compete for the super-feature slots.
    const singleFeatureCandidates = superFeatureNewReleases.filter(m => !placedDoubleIds.has(m.id));
    const numSuperFeaturesToPlace = Math.min(
      singleFeatureCandidates.length,
      featureSectionBudget - numDoubleFeaturesToPlace * 2
    );

    const numRegularSections = numWallSections - numDoubleFeaturesToPlace * 2 - numSuperFeaturesToPlace;
    const numRegularRows = numRegularSections * WALL_SHELF_HEIGHTS.length; // one faced-out title per wall tier

    const regularMoviesList = [
      ...singleFeatureCandidates.slice(numSuperFeaturesToPlace),
      ...regularNewReleases,
      ...highRatedCandidates
    ];
    // The lists above (recent + highly-rated) can run dry before numRegularRows
    // is reached, leaving trailing shelf rows with no movie assigned — bare
    // wall. Backfill from the rest of the catalog (any movie not already
    // placed) so every row gets stocked whenever the library has enough
    // titles overall; duplicates across rows are preferred over empty shelf.
    if (regularMoviesList.length < numRegularRows) {
      const usedIds = new Set(regularMoviesList.map((m) => m.id));
      const fillerCandidates = allMovies.filter((m) => !usedIds.has(m.id));
      for (const m of fillerCandidates) {
        if (regularMoviesList.length >= numRegularRows) break;
        regularMoviesList.push(m);
        usedIds.add(m.id);
      }
      // Still short (catalog smaller than the wall itself) — repeat titles
      // rather than leave shelves bare.
      let i = 0;
      while (regularMoviesList.length < numRegularRows && allMovies.length > 0) {
        regularMoviesList.push(allMovies[i % allMovies.length]);
        i++;
      }
    }
    const regularMoviesToPlace = regularMoviesList.slice(0, numRegularRows);

    this.nrSections = [];
    this.nrSuppressedDividerCols.clear();
    // 1. Create double-feature sections first (one movie spans TWO adjacent
    //    sections — 12 columns, every tier — as a single doubled-width
    //    display). F8-008: the shelf DIVIDER between the two halves is KEPT
    //    (the hit still spans both sections, but the physical divider panel
    //    stays intact per the user's request). We therefore no longer add the
    //    interior boundary to nrSuppressedDividerCols — the set stays empty and
    //    its consumer guards become no-ops.
    for (let i = 0; i < numDoubleFeaturesToPlace; i++) {
      this.nrSections.push({
        type: 'double-feature',
        movie: doubleFeatureCandidates[i]
      });
    }
    // 2. Create super-feature sections (one movie takes all 6 columns and every tier of a section)
    for (let i = 0; i < numSuperFeaturesToPlace; i++) {
      this.nrSections.push({
        type: 'super-feature',
        movie: singleFeatureCandidates[i]
      });
    }
    // 3. Create regular sections (one movie per shelf tier, each occupying all
    //    6 columns of that row — the multi-copy run the real walls ran)
    let regMovieIdx = 0;
    for (let s = 0; s < numRegularSections; s++) {
      const moviesForSection: Movie[] = [];
      for (let r = 0; r < WALL_SHELF_HEIGHTS.length; r++) {
        if (regMovieIdx < regularMoviesToPlace.length) {
          moviesForSection.push(regularMoviesToPlace[regMovieIdx++]);
        }
      }
      this.nrSections.push({
        type: 'regular',
        movies: moviesForSection
      });
    }

    // Keep these arrays populated for storefront posters and other features
    this.recentlyAddedMovies = newReleaseCandidates;

    // (Floor plan already computed above, before the NR wall derivation.)

    this.initThree();
    this.setupLighting();
    this.buildStore();
    this.installMirrorThrottle();
    // Prebaked shadows (shadowMap.autoUpdate = false) only render the sun's shadow
    // map when needsUpdate is set. The reflection-probe and mirror cube renders below
    // happen BEFORE the first animate() frame, so without this the shadow depth texture
    // is never allocated and every material's sampler2DShadow binds to an incompatible
    // texture — harmless on lenient drivers, but a strict GPU drops those draws and the
    // whole scene renders blank. Bake it once here so the shadow sampler is valid before
    // anything renders the scene.
    this.renderer.shadowMap.needsUpdate = true;
    // First environment bake: the empty store shell (movie boxes don't exist yet).
    // This replaces the bootstrap RoomEnvironment with the real room, so the
    // reflection probes baked next capture correctly-lit shelving.
    this.outdoor.bakeEnvironment();
    // The bootstrap PMREM (scene.environment before the line above) is no longer
    // referenced by anything — dispose its render target, compiled blur shader,
    // and the synthetic RoomEnvironment scene now rather than leaking them for
    // the whole session (issue #121).
    this.bootstrapEnvRT?.dispose();
    this.bootstrapPmremGen?.dispose();
    this.bootstrapRoomEnv?.dispose();
    this.bootstrapEnvRT = null;
    this.bootstrapPmremGen = null;
    this.bootstrapRoomEnv = null;
    this.generateReflectionProbes();
    this.buildAllMovieBoxes();
    // #60: the poster layer shortfall (if any) is settled the instant
    // buildAllMovieBoxes() returns (textureArrayManager.init() computes it
    // straight off the catalog size, not off streaming progress) — but the
    // counter's idle CRT already painted once, before this, showing no
    // notice unconditionally. Repaint it now that the real number exists.
    this.entrance?.refreshIdleTerminal();
    this.rebuildMovieBoxes();
    // A second bake with STOCKED shelves can't happen here: case instances are
    // placed asynchronously by animate()'s dirty-slot pass as posters stream in
    // (right now every instance is still zero-scale). animate() runs the re-bake
    // once placement has settled — see pendingStockedRebake.
    this.pendingStockedRebake = true;
    this.createSelectionArrow();
    // After createSelectionArrow(): the arrow is AO-excluded (it bobs while the
    // camera is static, and a floating UI cone shouldn't cast a contact halo),
    // and the scan must see it in the scene to pick the flag up.
    this.rebuildSSAOExclusionList();
    this.updateCameraTarget();

    // Pointer interaction for remote touch/mouse controls
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.onClaspPointerMove);
    window.addEventListener('keydown', this.onClaspKey, true);
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp);

    // First-person walk mode keyboard and mouse listeners
    window.addEventListener('keydown', this.handleWalkKeyDown);
    window.addEventListener('keyup', this.handleWalkKeyUp);
    window.addEventListener('mousemove', this.handleWalkMouseMove);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);

    // Preload the recorded door-bell sample so even the first door pass plays
    // it (decode runs fine on a still-suspended AudioContext).
    try {
      if (!this.chimeCtx) this.chimeCtx = new AudioContext();
      this.loadDoorBell(this.chimeCtx);
    } catch { /* no WebAudio here — playDoorChime degrades the same way */ }

    // T22: rehydrate the carried stack (bb_carried) so an accidental reload
    // doesn't lose the picks. Slots exist by now (buildAllMovieBoxes ran), so
    // the shelf-slot keys resolve for later put-backs.
    if (this.carryMode) this.rehydrateCarried();

    // T21: with the (default-on) entrance-overview start, boot lands standing
    // just inside the doors with the shelf cursors up instead of at the first
    // library end-cap.
    if (this.overviewStart) this.enterOverview();

    // T23: relaunching during an active rental lockout skips store entry and
    // boots straight into the back room (bb_rental holds the precomputed
    // unlockAt — never re-derived here). Runs AFTER the env bake + reflection
    // probes above, so the pocket room (built lazily inside enterBackRoom) can
    // never leak into them.
    {
      const bootRecord = loadRentalRecord();
      if (bootRecord && isLockedOut(bootRecord, new Date())) {
        this.enterBackRoom(bootRecord, { fade: false });
      } else {
        // Walking in holding tapes ALWAYS plays the RETURN TAPES HERE drop:
        // a rental whose lockout expired while the app was closed and any
        // carried picks rehydrated above both count. Without this the player
        // re-enters wedged — holding stock they can neither take past nor
        // ring up again.
        const returning = bootRecord ? this.resolveRentalMovies(bootRecord.items) : [];
        if (bootRecord) clearRentalRecord();
        for (const m of this.collectHeldTapesForReturn()) {
          if (!returning.some((r) => r.id === m.id)) returning.push(m);
        }
        if (returning.length > 0 && this.entrance?.hasReturnSlot()) {
          this.entrance.dropReturnedTapes(returning, performance.now() + 800);
          this.beginReturnDropWatch();
          this.onConsoleLog(`[System] Dropped ${returning.length} tape(s) in the return slot.`, 'system');
        }
      }
    }

    this.animate();

    this.onConsoleLog("[System] 3D Store rendering active in Library Select mode.", "system");
  }


  // The checkout desk's walk-in gap Z, with the pre-fixture default as fallback.
  public deskApexZ(): number {
    return this.entrance?.deskApexZ ?? 2.0;
  }

  // Mirror arbitrary text onto the desk CRTs (the diegetic search terminal
  // feeds its query + results through here every keystroke). Pass null to
  // fall back to the idle screen. `cursorLine` pins the blinking cursor to a
  // specific line (0 = the query line while searching).
  public setTerminalText(lines: string[] | null, cursorLine?: number) {
    this.requestRender();
    this.entrance?.setTerminalText(lines, cursorLine);
  }

  // ─── Diegetic search camera dock ───────────────────────────────────────────
  // Search used to be a fullscreen DOM overlay; it now lives on the clerk's
  // monitor screen (see entrance.ts), so opening it docks the camera in
  // close instead of popping up a panel. enterSearchMode() stashes wherever
  // the camera was headed (its current mode-driven target) and reuses the
  // same targetCameraPos/targetLookAt + lerp machinery every other camera
  // move in this file uses (see updateCameraTarget() and the checkout-bag
  // flourish in updateLaunchAnimation()) so it glides in with the same feel.
  // exitSearchMode() hands the view straight back.
  public enterSearchMode(): void {
    if (this.mode === 'backroom') return; // T23: the desk terminal is back at the store
    this.requestRender();
    if (this.searchPreCameraPos) return; // already docked
    // T21: the overview's floating cursors would hover in the desk-CRT search
    // framing — hide them while docked (restored in exitSearchMode).
    if (this.mode === 'overview') this.hideOverviewVisuals();
    this.searchPreCameraPos = this.targetCameraPos.clone();
    this.searchPreLookAt = this.targetLookAt.clone();
    const pose = this.entrance?.getSearchCameraPose();
    if (pose) {
      this.targetCameraPos.copy(pose.camPos);
      this.targetLookAt.copy(pose.lookAt);
    }
  }

  public exitSearchMode(): void {
    this.requestRender();
    if (this.searchPreCameraPos && this.searchPreLookAt) {
      this.targetCameraPos.copy(this.searchPreCameraPos);
      this.targetLookAt.copy(this.searchPreLookAt);
    }
    this.searchPreCameraPos = null;
    this.searchPreLookAt = null;
    // T21: still at the overview (no search result was jumped to) — bring the
    // cursors back. A jumpToTitle right after switches mode and re-hides.
    if (this.mode === 'overview') this.showOverviewVisuals();
    this.entrance?.setTerminalText(null); // desk CRTs back to the idle rental screen
  }

  /**
   * Walking away from the counter (store-walk.ts) drops the dock WITHOUT
   * restoring its stashed pose — walk mode is about to take the camera anyway.
   * Leaving the stash set is what made a later enterSearchMode() a silent
   * no-op ("already docked"), so the CRT could never be reached again.
   */
  public releaseSearchDock(): void {
    this.searchPreCameraPos = null;
    this.searchPreLookAt = null;
  }

  // Everything a swappable fixture (ambient TVs, entrance, ...) needs from the
  // scene, bundled so fixture classes never hold a reference to StoreScene.
  public fixtureContext(): FixtureContext {
    return {
      scene: this.scene,
      camera: this.camera,
      storeWidth: this.getStoreWidth(),
      backWallZ: this.backWallZ,
      ceilingY: this.ceilingY,
      storefrontSpec: this.storefrontSpec,
      libraries: this.libraries,
      jellyfinUrl: this.jellyfinUrl,
      jellyfinToken: this.jellyfinToken,
      gameMovies: this.gameMovies,
      staffPickMovies: this.staffPickMovies,
      log: this.onConsoleLog,
      addCollider: (obj) => this.shelves.push(obj),
      requestShadowRefresh: () => {
        this.renderer.shadowMap.needsUpdate = true;
        this.queueStructuralShadowRefresh();
      },
      requestRender: () => this.requestRender(),
      activeTheme: this.activeTheme,
      gondolaMaterials: this.gondolaMaterials,
      wallSurface: this.wallSurface,
      liveMirror: mirrors.liveMirrorsAllowed(this)
        ? (() => {
            const s = mirrors.reflectorTargetSize(this.renderer);
            return { textureWidth: s.w, textureHeight: s.h };
          })()
        : undefined,
    };
  }

  /** Staff-picks genre endcap placements — see store-clerk-flow.ts. */
  public staffPickEndcapPlacements(excludeLineIds?: Set<number>): FixturePlacement[] { return clerkFlow.staffPickEndcapPlacements(this, excludeLineIds); }

  /**
   * Late-arriving staff picks (the loader lost boot's race against a slow
   * Jellyseerr): just record the ranked owned pool. Owned winners are
   * deliberately unmarked — no sticker restamp (user direction after pin
   * 012). Endcaps are build-time fixtures — they appear next boot,
   * instantly, off the loader's cache.
   */
  public applyStaffPicks(picks: { ownedPicks: Movie[] }): void {
    if (picks.ownedPicks.length === 0) return;
    this.staffPickOwned = picks.ownedPicks;
  }

  public getArrangement(): ArrangementId {
    return this.plan.arrangement;
  }

  // Switch the floor arrangement. Structure geometry is built once at construction,
  // so the cleanest, least error-prone way to re-lay the whole store is to persist
  // the choice and rebuild from a fresh scene. (A live in-place rebuild is possible
  // later, but every consumer already reads unit.yaw/browseSign, so a reload is
  // guaranteed-consistent today.)
  public setArrangement(id: ArrangementId) {
    this.requestRender();
    if (id === this.plan.arrangement) return;
    // Persist only; the caller (settings drawer) rebuilds the scene in place
    // via rebuildStoreScene() so several look changes batch into one rebuild
    // instead of a full page reload per toggle.
    this.plan.setArrangement(id);
  }

  // List of arrangements selectable in the UI.
  public static readonly ARRANGEMENTS: ArrangementId[] = ['herringbone', 'straight', 'diagonal'];

  // ─── Floor-plan delegation (see store-plan.ts) ──────────────────────────
  // The plan owns unit placement, category shelf order, and the layout-space ->
  // world-space transforms; these keep StoreScene's existing call sites working.
  public get shelvingUnits(): ShelvingUnit[] { return this.plan.shelvingUnits; }
  public get backWallZ(): number { return this.plan.backWallZ; }
  public get aislePivotZ(): number { return this.plan.aislePivotZ; }
  public layoutFor(libIdx: number): LibraryLayout { return this.plan.layoutFor(libIdx); }
  public getStoreWidth(): number { return this.plan.getStoreWidth(); }
  public getLibraryXCenter(libraryIdx: number): number { return this.plan.getLibraryXCenter(libraryIdx); }
  public aisleZCenter(unit: ShelvingUnit): number { return this.plan.aisleZCenter(unit); }
  public aisleColZ(unit: ShelvingUnit, col: number, side: 'front' | 'back' = 'front'): number { return this.plan.aisleColZ(unit, col, side); }
  public scaleZ(z: number): number { return this.plan.scaleZ(z); }
  public unitToWorld(unit: ShelvingUnit, localX: number, localZ: number): { x: number; z: number } { return this.plan.unitToWorld(unit, localX, localZ); }
  public applyUnitRotation(v: THREE.Vector3, unit: ShelvingUnit): THREE.Vector3 { return this.plan.applyUnitRotation(v, unit); }

  // Boxes are tilted backward (LEAN_ANGLE) about their own centre, so a resting
  // position computed for an upright box leaves the bottom edge floating off the shelf
  // in one direction and sinking through it in the other. This returns how far the
  // centre must be nudged -- by rotating the half-height "up" vector through the box's
  // actual final orientation (pitch, then yaw) -- so the bottom edge stays anchored flush
  // on the shelf surface regardless of which way the box ends up facing.
  public leanHingeOffset(pitch: number, yaw: number, boxHeight: number): { x: number, y: number, z: number } {
    tempRotation.set(pitch, yaw, 0);
    tempQuaternion.setFromEuler(tempRotation);
    tempPosition.set(0, boxHeight / 2, 0).applyQuaternion(tempQuaternion);
    return { x: tempPosition.x, y: tempPosition.y, z: tempPosition.z };
  }

  // Extra lateral clearance for New Releases columns that sit right beside a
  // section divider, so leaned cases (and their jittered stacked copies) never
  // graze the divider panel. Sign convention is for an ASCENDING local axis:
  // the column just after a divider shifts +, the column just before shifts −.
  private static readonly NR_DIVIDER_CLEARANCE = 0.045;
  // `runStartCol` is the run's first column as a GLOBAL ribbon index: a column
  // adjacent to a divider suppressed inside a double-feature (see
  // nrSuppressedDividerCols) keeps its normal spacing so the doubled section
  // stays one continuous display.
  /**
   * The [startCol, endCol] of the New Releases section containing `col`, or
   * null when the ribbon has no sections yet. Walks the same running column
   * cursor the placement pass uses, since a double-feature spans two sections'
   * worth of columns and a fixed secIdx*SECTION_COLS would drift past it.
   */
  public nrSectionRangeForCol(col: number): { startCol: number; endCol: number } | null {
    let startCol = 0;
    for (const section of this.nrSections) {
      const endCol = Math.min(this.nrTotalCols - 1, startCol + sectionColSpan(section) - 1);
      if (col >= startCol && col <= endCol) return { startCol, endCol };
      startCol += sectionColSpan(section);
    }
    return null;
  }

  private nrDividerNudge(colInRun: number, runStartCol = 0): number {
    if (colInRun > 0 && colInRun % SECTION_COLS === 0 &&
        !this.nrSuppressedDividerCols.has(runStartCol + colInRun)) return StoreScene.NR_DIVIDER_CLEARANCE;
    if (colInRun % SECTION_COLS === SECTION_COLS - 1 &&
        !this.nrSuppressedDividerCols.has(runStartCol + colInRun + 1)) return -StoreScene.NR_DIVIDER_CLEARANCE;
    return 0;
  }

  // Center Z of the LEFT-wall New Releases unit. Back-aligned against the
  // back-left corner (the front stretch of the left wall carries the
  // side-window ribbon), so the ribbon's col order runs front -> back and
  // meets the back wall's Run 1 right at the corner — one contiguous wall of
  // New Releases from the left wall onto the back wall. Single source of
  // truth for the layout calc, the slot transforms, the built shelf run, and
  // its signage.
  public nrLeftWallUnitCenterZ(): number {
    const unitLen = this.nrLeftWallCols * BOX_SPACING + 1.0;
    return this.nrLeftWallUnitBackZ() + unitLen / 2;
  }

  // Back Z of the LEFT-wall unit's shelf boards: exactly the back-wall run's
  // built depth from the back wall, so the unit's back end panel (which
  // extends 0.04 ft past the boards, toward the wall) tucks behind Run 1's
  // front face — the mirror of LEFT_SLIVER in the other axis. Single source
  // for the layout calc (unitBackZ) and nrLeftWallUnitCenterZ above.
  private nrLeftWallUnitBackZ(): number {
    return this.backWallZ + NR_RUN_DEPTH;
  }

  public getNewReleasesSlotTransform(col: number, _movie?: Movie): { x: number, z: number, rotationY: number } {
    const leftWallCols = this.nrLeftWallCols;
    // Flat case standoff off the wall plane. The old per-title depth
    // (0.20 + extraCopiesCount*0.05) reserved room for the blue backstock
    // stack, which the NR wall no longer carries (see rebuildExtraCopies) —
    // the shelf holds exactly the display box + its gold rental copy.
    const offset = 0.20;

    if (col < leftWallCols) {
      // Left Wall unit (faces +X into the store interior). Col 0 sits at the
      // FRONT (just behind the window ribbon), ascending toward the back-left
      // corner where the back wall's Run 1 picks up — contiguous ribbon.
      // Case standoff mirrors the back-wall runs: the unit's group origin sits
      // NR_LEFT_UNIT_STANDOFF off the wall mesh (its own "wall plane"), and the
      // case hinge goes `offset` in front of that — the same stack-aware offset
      // every other run uses. The old hardcoded +0.22 ignored both the standoff
      // and extra-copy stack depth, sinking leaned cases back through the
      // backing panel into the wall (user-reported back-left clipping).
      const storeWidth = this.getStoreWidth();
      const leftWallX = 11.0 - storeWidth / 2 + NR_LEFT_UNIT_STANDOFF + offset;
      const wallZCenter = this.nrLeftWallUnitCenterZ();
      // Front to back distribution (descending world Z, so the nudge flips sign)
      const zPos = wallZCenter + ((leftWallCols - 1) * BOX_SPACING) / 2 - col * BOX_SPACING - this.nrDividerNudge(col);
      return { x: leftWallX, z: zPos, rotationY: Math.PI / 2 };
    }

    const colInBack = col - leftWallCols;

    if (colInBack < this.nrBackWallColsRun1) {
      // Run 1: Far back wall (faces +Z)
      const length1 = this.stepX - this.nrBackLeftX;
      const margin1 = (length1 - this.nrBackWallColsRun1 * BOX_SPACING) / 2;
      const localX = -length1 / 2 + margin1 + (colInBack + 0.5) * BOX_SPACING + this.nrDividerNudge(colInBack, leftWallCols);
      const centerPos1X = (this.nrBackLeftX + this.stepX) / 2;
      return { x: centerPos1X + localX, z: this.backWallZ + offset, rotationY: 0 };
    } else if (colInBack < this.nrBackWallColsRun1 + this.nrBackWallColsRun2) {
      // Run 2: Connector side wall (faces -X, along Z at stepX)
      const c = colInBack - this.nrBackWallColsRun1;
      const length2 = this.stepDepth;
      const margin2 = (length2 - this.nrBackWallColsRun2 * BOX_SPACING) / 2;
      const localX = -length2 / 2 + margin2 + (c + 0.5) * BOX_SPACING + this.nrDividerNudge(c, leftWallCols + this.nrBackWallColsRun1);
      const stepWallZ = this.backWallZ + this.stepDepth;
      const midStepZ = (this.backWallZ + stepWallZ) / 2;
      // Since rotationY is -Math.PI/2, local X translates to world Z
      return { x: this.stepX - offset, z: midStepZ + localX, rotationY: -Math.PI / 2 };
    } else if (colInBack < this.nrBackWallColsRun1 + this.nrBackWallColsRun2 + this.nrBackWallColsRun3) {
      // Run 3: Stepped-forward front wall (faces +Z)
      const c = colInBack - this.nrBackWallColsRun1 - this.nrBackWallColsRun2;
      const length3 = this.nrBackRightEdgeX - this.stepX;
      const margin3 = (length3 - this.nrBackWallColsRun3 * BOX_SPACING) / 2;
      const localX = -length3 / 2 + margin3 + (c + 0.5) * BOX_SPACING + this.nrDividerNudge(c, leftWallCols + this.nrBackWallColsRun1 + this.nrBackWallColsRun2);
      const centerPos3X = (this.stepX + this.nrBackRightEdgeX) / 2;
      const stepWallZ = this.backWallZ + this.stepDepth;
      return { x: centerPos3X + localX, z: stepWallZ + offset, rotationY: 0 };
    } else {
      // Defensive fallback (cols beyond the ribbon should not exist): clamp
      // onto the last Run 1 column so nothing ever lands at the origin.
      const length1 = this.stepX - this.nrBackLeftX;
      const margin1 = (length1 - this.nrBackWallColsRun1 * BOX_SPACING) / 2;
      const lastC = Math.max(0, this.nrBackWallColsRun1 - 1);
      const localX = -length1 / 2 + margin1 + (lastC + 0.5) * BOX_SPACING;
      return { x: (this.nrBackLeftX + this.stepX) / 2 + localX, z: this.backWallZ + offset, rotationY: 0 };
    }
  }

  private initThree() {
    const width = this.container.clientWidth || window.innerWidth || 1280;
    const height = this.container.clientHeight || window.innerHeight || 720;

    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#040a15');
    // Volumetric haze removed: interior is lit by the drop-ceiling troffer lights instead.
    this.scene.fog = null;

    // Create camera
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.copy(this.currentCameraPos);
    this.camera.layers.enable(1);
    
    // Create renderer
    // antialias: false — every frame goes through EffectComposer (an offscreen
    // framebuffer), so canvas MSAA never reaches what's actually displayed; FXAA
    // in the composer does all the anti-aliasing. The MSAA canvas was pure wasted
    // memory/bandwidth (see #27).
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
    this.renderer.setSize(width, height);
    // Hitch tracer: per-frame renderer.info deltas always; raw-GL upload/compile
    // timing only when profiling (?trace=1 — it allocates per GL call).
    perfTrace.attachRenderer(this.renderer);
    if (new URLSearchParams(location.search).get('trace') === '1') {
      perfTrace.instrumentGL(this.renderer.getContext());
    }
    // Which adapter did we actually get? On dual-GPU Windows machines WebView2
    // tends to pick the integrated GPU, and a blocklisted driver falls all the way
    // back to software rasterization (SwiftShader/WARP) at ~2 fps. Surface the
    // adapter name and, when we're software-rendered, clamp quality to 'low'
    // (pixel ratio 1, no SSAO, no bloom) unless the user explicitly chose one.
    const _gl = this.renderer.getContext();
    const _dbgExt = _gl.getExtension('WEBGL_debug_renderer_info');
    const gpuName = _dbgExt
      ? String(_gl.getParameter(_dbgExt.UNMASKED_RENDERER_WEBGL))
      : String(_gl.getParameter(_gl.RENDERER));
    const softwareGL = /swiftshader|llvmpipe|softpipe|software|basic render|warp/i.test(gpuName);
    // Thin-and-light integrated GPUs (ThinkPad T14s class: Intel UHD/Iris Xe,
    // AMD APU "Radeon(TM) Graphics"/Vega, ARM Mali/Adreno) render fine but
    // can't hold a high frame rate at quality 'high' (2x pixel ratio + 4K
    // shadows + SSAO). Default THOSE to 'medium' — an explicit bb_quality
    // pick always wins, this only changes the first-run default. Discrete
    // parts (GeForce/Radeon RX/Arc) keep defaulting to 'high'.
    const integratedGL = /intel.*(uhd|hd graphics|iris)|iris ?xe|radeon\(tm\) graphics|vega \d|\bmali\b|adreno/i.test(gpuName)
      && !/arc|rtx|gtx|geforce|radeon rx/i.test(gpuName);
    console.log(`[GPU] WebGL renderer: ${gpuName}${softwareGL ? ' — SOFTWARE RENDERING, no GPU acceleration; clamping quality to low' : integratedGL ? ' — integrated GPU, defaulting quality to medium' : ''}`);
    // Three-way waterfall (src/quality-calibrate.ts): explicit bb_quality
    // always wins; else a measured calibration for THIS gpuName/screen/DPR
    // (never consulted under softwareGL — that's always forced 'low' below);
    // else this regex guess, which stays forever as the first-boot-before-
    // calibration and calibration-failure fallback.
    const explicitQuality = localStorage.getItem('bb_quality');
    const calibrated = !explicitQuality && !softwareGL ? readCalibratedQuality(gpuName) : null;
    const effectiveQuality = explicitQuality || calibrated?.tier || (softwareGL ? 'low' : integratedGL ? 'medium' : 'high');
    this.effectiveQuality = effectiveQuality as 'high' | 'medium' | 'low';
    this.softwareGL = softwareGL;
    // Supersample grant: an AUTO-tiered 'high' only earns the above-native
    // supersample when calibration measured real headroom for it. Explicit
    // bb_quality=high (owner/harness override) keeps today's behavior
    // exactly, grant implied — see the pixelRatio block below.
    const supersampleGranted = !!explicitQuality || !!calibrated?.supersample;
    // Safari-flavoured WebKit on Linux is WebKitGTK — in practice the Tauri
    // shell (wry). Real GPU, but synchronous in-process GL (see the field's
    // comment). Linux-guarded so macOS WKWebView (Metal-backed, fast) and
    // desktop Safari keep the full path.
    this.webkitGL = /AppleWebKit/.test(navigator.userAgent)
      && !/Chrome|Chromium/i.test(navigator.userAgent)
      && /Linux/.test(navigator.userAgent);
    if (this.webkitGL) console.log('[GPU] WebKitGTK engine — clamping pixel budget to medium and using static mirrors');
    // Frame-rate cap default follows the supersample grant (owner ruling
    // 2026-08-05, after wave 1 shipped with a blanket 60-target: "buttery
    // smooth" is the product on capable hardware): a GPU that measured enough
    // headroom for above-native supersampling — or any explicit bb_quality
    // override, the owner's kiosk/harness case — runs UNCAPPED by default and
    // chases the display's real refresh rate; only auto-tiered machines
    // without that headroom get the 60-target divisor cap that protects weak
    // hardware. An explicit bb_fps_cap (the SERVICE MODE row) still forces
    // either behavior on any machine.
    this.fpsCapOverride = localStorage.getItem('bb_fps_cap')
      ?? (supersampleGranted ? '0' : null);
    if (softwareGL) {
      // Software frames cost seconds, so the dynamic scaler's one-step-per-
      // second walk from 1.0 to the floor would itself take minutes (measured:
      // ~100s of 5-10s frames in a headless SwiftShader container). Start AT
      // the floor; applyRenderResolution() at the end of initThree applies it.
      this.resScale = this.resScaleMin;
      // One env bounce instead of three: 6 cube-face renders instead of 18
      // at boot (and per outside-mode change).
      this.outdoor.defaultBakeBounces = 1;
      this.outdoor.bakeResolution = 256; // 512 cube faces are real CPU seconds here
    }
    const _prCap = effectiveQuality === 'low' ? 1 : effectiveQuality === 'medium' ? 1.5 : 2;
    // SUPERSAMPLE, don't just cap. This was Math.min(devicePixelRatio, _prCap),
    // which on any ordinary desktop monitor (devicePixelRatio === 1) evaluates
    // to 1 — so the 'high' tier's cap of 2 never did anything, every frame was
    // rendered at exactly native resolution, and FXAA was the ONLY anti-aliasing
    // in the pipeline. FXAA is a luma-edge blur: it cannot reconstruct the thin,
    // high-contrast geometry this scene is full of (T-bar ceiling grid, shelf
    // edges, window mullions, case spines). Worse, it blurs the detail it fails
    // to fix — measured side by side, FXAA-only turned the ceiling fleck and the
    // troffer lens lattice to mush AND still crawled ("way too much aliasing").
    //
    // Render ABOVE native and let the browser box-filter the canvas down: true
    // supersampling, fixing geometry, specular and texture aliasing at once with
    // no extra passes. FXAA stays on top to catch what's left.
    //
    // Budget by PIXEL COUNT, not a fixed multiplier. A flat 2x is fine at 1080p
    // (8.3M) but means a 7680x4320 / 33M-pixel buffer on a 4K panel, which no
    // amount of resScale walk-back recovers from. Solving for the multiplier
    // that lands on a fixed budget instead makes the tier self-scaling.
    //
    // The budget is ~1440p (3.7e6) even on 'high' — USER DIRECTION: the store
    // is a stylized scene, not worth native-4K GPU cost; on the 4K TV it
    // renders a 2560x1440 buffer the browser upscales, which reads fine as
    // long as aliasing is controlled (FXAA + the grazing-angle aniso work
    // carry that; a 16.6e6 supersample experiment looked marginally better
    // and cost 28ms heavy frames — rejected). Movie playback is unaffected:
    // the player is a DOM <video> overlay composited at display resolution,
    // so a 4K rendition plays at true 4K regardless of this buffer.
    // Windows SMALLER than ~1440p still supersample up to the _prCap 2x
    // ceiling (the 720p harness renders 2x, 1080p ~1.34x) — the budget is a
    // ceiling on total pixels, not a fixed scale. bb_px_budget (millions of
    // pixels) overrides for tuning, e.g. localStorage.bb_px_budget = "8.3".
    const _budgetOverride = Number(localStorage.getItem('bb_px_budget'));
    const _budgetPx = _budgetOverride > 0 ? _budgetOverride * 1e6 :
      effectiveQuality === 'low' ? 2.1e6 : 3.7e6;
    const _cssPx = Math.max(1, (this.container.clientWidth || window.innerWidth || 1280) *
                               (this.container.clientHeight || window.innerHeight || 720));
    const _ssaa = Math.sqrt(_budgetPx / _cssPx);
    // No devicePixelRatio floor: the budget is authoritative. The old
    // max(dpr, …) floor existed so HiDPI panels "never render below native" —
    // that's exactly the behavior the 1440p cap is meant to override, and on
    // a dpr>1 4K TV the floor would silently force the full 8.3MP buffer the
    // user asked not to pay for.
    // Ungranted AUTO 'high' (see supersampleGranted above) is capped at
    // native devicePixelRatio here — it still gets the full budget-derived
    // resolution (never sub-native; a small/4K-panel budget cap applies
    // exactly as it does today), it just isn't allowed to exceed native.
    // Medium/low and every granted/explicit case are untouched.
    const _prCapEff = effectiveQuality === 'high' && !supersampleGranted
      ? Math.min(_prCap, window.devicePixelRatio || 1)
      : _prCap;
    this.renderer.setPixelRatio(Math.min(_ssaa, _prCapEff));
    // Motion-gated native res (see animate()): the ~1440p cap above still holds
    // for STATIC/dwelling frames, but a sub-native panel lifts to native display
    // resolution WHILE THE CAMERA MOVES + on the settle frame, so moving around
    // the store no longer shreds the ceiling grid / far shelves into jaggies.
    // Idle power is untouched (a still store renders zero frames). Instant A/B
    // off-switch, no rebuild: localStorage.bb_motion_sharp = "0".
    this.motionSharpDisabled = localStorage.getItem('bb_motion_sharp') === '0';
    // Settle supersample factor (see settleScale). Software GL never pays it —
    // one full-res SwiftShader composite is already seconds long — and the
    // 'low' tier is a "this machine is struggling" signal, so it opts out too.
    const _settleRaw = localStorage.getItem('bb_settle_ss');
    const _settleFactor = _settleRaw === null ? StoreScene.SETTLE_SS_DEFAULT : Number(_settleRaw);
    this.settleSsFactor = (this.softwareGL || effectiveQuality === 'low' ||
                           !Number.isFinite(_settleFactor) || _settleFactor < 1)
      ? 0 : _settleFactor;
    // Motion supersample (see motionScale). Same opt-outs as the settle
    // factor — this one is paid every moving frame, so a struggling machine
    // must not take it. Off-switch, no rebuild: bb_motion_ss = "0".
    const _motionRaw = localStorage.getItem('bb_motion_ss');
    const _motionFactor = _motionRaw === null ? StoreScene.MOTION_SS_DEFAULT : Number(_motionRaw);
    this.motionSsFactor = (this.softwareGL || effectiveQuality === 'low' ||
                           !Number.isFinite(_motionFactor) || _motionFactor < 1)
      ? 0 : _motionFactor;
    // Anisotropic-filtering budget for the procedural shell textures (carpet,
    // walls, valances). Set BEFORE buildStore() paints them. On 'high' with a
    // real GPU this is typically 16, sharpening the floor/walls receding toward
    // the back wall; medium/low keep the previous ceiling of 8. Cost is a per-
    // sample GPU feature on a few large textures — never a per-frame concern.
    setMaxAnisotropy(effectiveQuality === 'high' ? this.renderer.capabilities.getMaxAnisotropy() : 8);
    // Low tier (and thus every software-GL run) builds the big glazing
    // materials without their clearcoat lobe — see setCheapMaterials.
    setCheapMaterials(effectiveQuality === 'low');
    // Software GL: shadows off entirely. Every shadow map is a full-scene CPU
    // rasterization pass and every lit fragment pays the PCF taps — together
    // they dominated the multi-second SwiftShader frames. With the flag off,
    // shaders compile without any shadow sampling at all (smaller programs =
    // faster Subzero JIT too) and all shadowMap.needsUpdate requests below
    // become harmless no-ops.
    this.renderer.shadowMap.enabled = !softwareGL;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Prebaked lighting: don't re-render the sun's 4K shadow map every frame. The scene
    // is static apart from the (non-shadow-casting) DVD cases and the occasional end-cap
    // transition, so we render shadows on demand via shadowMap.needsUpdate (driven by
    // shadowRefreshFrames + end-cap motion in animate()) and keep the baked map otherwise.
    this.renderer.shadowMap.autoUpdate = false;
    // Tone mapping (bb_tonemap, default 'neutral'): Khronos PBR Neutral
    // (r165+) is identity below its 0.8 highlight knee, so authored colors —
    // the NR band orange, ticket-sign blue, box art — print exactly as
    // designed; it's the color-accurate mapper for retail/product scenes
    // (SIGGRAPH 2024 "Neutral Tone Mapping for PBR Color Accuracy").
    // bb_tonemap=agx keeps the previous filmic look: it rolls off bright
    // values gracefully (emissives read as "bright surface", not "tiny sun")
    // but its desaturation measurably mutes exactly the brand colors above.
    // Exposure is per-mapper: Neutral has no filmic midtone lift, so it
    // needs more raw exposure to match AgX-at-1.2's overall brightness.
    const filmicTonemap = localStorage.getItem('bb_tonemap') === 'agx';
    this.renderer.toneMapping = filmicTonemap ? THREE.AgXToneMapping : THREE.NeutralToneMapping;
    // bb_grade_exposure overrides the per-mapper default — the sweep knob used to
    // match the render against reference photos of real (fluorescent-lit, and so
    // BRIGHT and flat) rental floors. See the grade uniforms further down.
    // 1.35 -> 1.7 (AgX 1.2 -> 1.5). Measured against a reference photo of a real
    // rental floor the old exposure was a full stop dark (mean luma 0.32 vs the
    // photo's 0.53), so the room wanted opening up — but 2.05 was too far on a
    // wide-gamut HDR panel, where the extra light reads as glare. Half the
    // correction — a compromise between SDR and wide-gamut HDR panels.
    this.renderer.toneMappingExposure =
      gradeNum('bb_grade_exposure', filmicTonemap ? 1.5 : 1.7);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    // --- IBL is now the PRIMARY light source. ---
    // The whole room is lit by this image-based environment, the way a real space
    // is lit by everything around it bouncing light. A single directional "sun"
    // (in setupLighting) adds shape + real shadows on top. This replaces the old
    // pile of RectAreaLights/washes that flattened everything. The environment
    // gives soft, omnidirectional, physically-plausible fill *and* the correct
    // reflections on the glossy DVD cases — both for free, from one source.
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();
    const roomEnv = new RoomEnvironment();
    const bootstrapRT = pmremGenerator.fromScene(roomEnv, 0.04);
    this.scene.environment = bootstrapRT.texture;
    // Held only until the constructor's first outdoor.bakeEnvironment() call
    // installs the real baked environment, then disposed (issue #121).
    this.bootstrapEnvRT = bootstrapRT;
    this.bootstrapPmremGen = pmremGenerator;
    this.bootstrapRoomEnv = roomEnv;
    // Tuned against the baked-room environment (see bakeEnvironment), which is
    // considerably dimmer than the synthetic RoomEnvironment this value was
    // originally set for (0.55): the real room needs more of its own bounce.
    this.scene.environmentIntensity = 0.95;

    this.container.appendChild(this.renderer.domElement);

    // Let the texture upload queue drive GPU uploads through this renderer so
    // their cost is throttled per-frame rather than spiking during scene renders.
    setUploadRenderer(this.renderer);
    // Shipped surface .ktx2 fallback (src/surface-textures.ts) needs the
    // live renderer to detect which GPU compressed format to transcode into.
    setSurfaceKtx2Renderer(this.renderer);
    // Deferred cover-loaded flags can apply after the scene idles — repaint so
    // the new covers actually show (render-on-demand, issue #24).
    setTextureStreamWake(() => this.requestRender());
    // A cover box is collapsed to zero scale until its art exists, and only the
    // dirty-slot pass can bring it back — so when a poster finally lands on the
    // GPU, re-dirty the cases wearing it. Without this a title whose upload
    // outlives its decode callback (the norm once the queue is thousands deep)
    // keeps its bare rental shell forever.
    setPosterLoadedNotify((movieId) => {
      const slots = this.slotsByMovieId.get(movieId);
      if (!slots) return;
      for (const slot of slots) {
        slot.needsInitialMatrixUpdate = true;
        this.dirtySlots.add(slot);
      }
    });

    // NO MSAA on the composer target: EffectComposer clones the target for
    // both ping-pong buffers, so multisampling there makes every pass render
    // into (and resolve out of) a 4x buffer at the already-supersampled SSAA
    // resolution — pure bandwidth cost. It can't antialias the scene anyway:
    // on 'high', N8AOPass renders the beauty into its own internal
    // single-sample target, so the composer buffers only ever see full-screen
    // quads. Anti-aliasing here is SSAA (pixel-budget above) + FXAA.
    this.composer = new EffectComposer(this.renderer);

    // AO: disabled on medium/low quality, or via explicit bb_ssao=0 override.
    const ssaoEnabled = localStorage.getItem('bb_ssao') !== '0' && effectiveQuality === 'high';
    // AO engine (bb_ao): 'n8ao' (default) or 'gtao' (the previous engine,
    // kept selectable as a fallback while N8AO burns in). N8AO computes AO
    // from the beauty pass's own depth buffer — NO second full-scene
    // G-buffer submission, which was GTAO's dominant cost (draw-call replay,
    // resolution-independent) — runs the AO estimate at half res with
    // depth-aware upscaling, and with accumulate=true self-gates to a
    // composite-only tail once a static view converges (the built-in analog
    // of the GTAO view-cache below).
    const aoEngine = localStorage.getItem('bb_ao') === 'gtao' ? 'gtao' : 'n8ao';
    const useN8ao = ssaoEnabled && aoEngine === 'n8ao';
    // Kept for the partial composite: N8AO owns the beauty target it patches,
    // and on every other tier the plain RenderPass is the pass it disables.
    const beautySource: { n8ao: N8AOPass | null; beautyPass: BeautyPass | null } = { n8ao: null, beautyPass: null };
    console.log(`[AO] ssaoEnabled: ${ssaoEnabled} engine: ${ssaoEnabled ? aoEngine : '-'} (bb_ssao=${localStorage.getItem('bb_ssao')})`);

    if (useN8ao) {
      // N8AOPass REPLACES RenderPass (it renders the scene into its own
      // beauty target, then composites AO over it).
      const n8aoPass = new N8AOPass(this.scene, this.camera, width, height);
      n8aoPass.setQualityMode('Medium');           // 16 AO taps, 8 denoise — set ONCE (quality changes force effect-wide recompiles)
      n8aoPass.configuration.halfRes = true;       // 2-4x cheaper estimate; depth-aware upscale keeps edges
      n8aoPass.configuration.accumulate = true;    // static view converges, then only the composite quad runs
      n8aoPass.configuration.gammaCorrection = false; // OutputPass later in the chain owns tone mapping/sRGB
      n8aoPass.configuration.aoRadius = 0.5;       // ft — same contact-shadow reach the GTAO pass was tuned to
      n8aoPass.configuration.distanceFalloff = 1.0;
      n8aoPass.configuration.intensity = 1.4;      // soft occlusion (pow exponent) — 2.0 read too heavy against the reference's evenly-lit shelves; faded via the adapter below
      // Walk gating swaps source passes: while the feet move, AO is off and
      // the plain RenderPass takes over (EffectComposer skips disabled
      // passes), so NONE of the AO chain runs — same contract as the GTAO
      // enabled toggle.
      const walkRenderPass = new RenderPass(this.scene, this.camera);
      walkRenderPass.enabled = false;
      this.composer.addPass(n8aoPass);
      this.composer.addPass(walkRenderPass);
      // Perf attribution: time the whole N8AO render under the AO span.
      const n8origRender = n8aoPass.render.bind(n8aoPass);
      n8aoPass.render = (renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime?: number, maskActive?: boolean) => {
        perfTrace.begin(SP_AO);
        try {
          n8origRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
        } finally {
          perfTrace.end(SP_AO);
        }
      };
      const aoBase = 1.4; // must track n8aoPass.configuration.intensity above (the enabled/blend setters reset to aoBase * blend)
      const aoCtl = {
        _on: true,
        _blend: 1,
        get enabled() { return this._on; },
        set enabled(v: boolean) {
          this._on = v;
          n8aoPass.enabled = v;
          walkRenderPass.enabled = !v;
          if (v) n8aoPass.configuration.intensity = aoBase * this._blend;
        },
        get blendIntensity() { return this._blend; },
        set blendIntensity(v: number) {
          this._blend = v;
          n8aoPass.configuration.intensity = aoBase * v;
        },
      };
      this.aoPass = aoCtl;
      beautySource.n8ao = n8aoPass;
      (window as any).debugSSAO = n8aoPass;
      console.log('[AO] N8AOPass active (half-res, Medium, accumulate):', { width, height });
    }

    if (!useN8ao) {
      // BeautyPass, not RenderPass: same draw, but into a target of its own so
      // the partial composite has a beauty (and a depth buffer) that survives
      // the frame. See src/partial-composite.ts.
      const beautyPass = new BeautyPass(this.scene, this.camera, this.composer.renderTarget1);
      this.composer.addPass(beautyPass);
      beautySource.beautyPass = beautyPass;
    }

    // Legacy engine (bb_ao=gtao): GTAOPass (three r184+), full resolution —
    // the half-res + widened-denoise experiment (#25/#140) read as smeared
    // mush because its dominant cost is the G-buffer's draw-call replay,
    // which is resolution-independent. Savings come from *when* it runs: the
    // pass is disabled while walking and replays a cached AO term while the
    // view is static (see the render() wrapper below and animate()'s gating).
    if (ssaoEnabled && !useN8ao) {
      const gtaoPass = new GTAOPass(this.scene, this.camera, width, height);
      gtaoPass.output = GTAOPass.OUTPUT.Default; // beauty + AO blend

      // GTAO parameters are world-space (unlike SSAOPass's normalized-depth
      // minDistance/maxDistance) — do not reuse the old camera-range-divided
      // values. 0.35ft (~4.2in) matches the old kernelRadius/maxDistance
      // contact-shadow reach. The per-pixel noise that forced 0.22ft in #140
      // was a half-res artifact; at full res the stock Poisson denoise
      // (radius 8, depthPhi 2, normalPhi 3 — tuned for full-res buffers)
      // cleans 16 taps at this radius without smearing edges, so the pd
      // material is deliberately left at its defaults.
      gtaoPass.updateGtaoMaterial({
        // 0.35 -> 0.5: reach a real contact-shadow pocket under shelf boards
        // and around case feet; the full-res Poisson denoise still cleans 16
        // taps at this radius without smear.
        radius: 0.5,
        distanceExponent: 1,
        thickness: 1,
        scale: 1,
      });
      gtaoPass.blendIntensity = 1.0; // back to neutral (was 1.1) — past-neutral AO was dirtying the aisle floors

      // render() wrapper, three jobs:
      // 1. Frozen replay: the AO term (G-buffer + AO estimate + denoise) only
      //    depends on camera pose and geometry. When neither changed since the
      //    last recompute (camera matrices match the cache and nothing set
      //    aoNeedsRefresh), skip all three and replay GTAOPass's Default-output
      //    tail — beauty copy + cached-AO blend, two full-screen quads. This is
      //    what makes AO ~free during the settle fade, VIDEO-tier TV playback,
      //    clerk strolls and idle repaints.
      // 2. excludeFromSSAO (ported from SSAOPass): GTAOPass renders its own
      //    G-buffer with scene.overrideMaterial, so flagged objects (signage,
      //    the clerk sprite, the selection arrow) would otherwise halo. Hide
      //    them for the duration of the recompute, then restore.
      // 3. AO blend mask (aoBlendMask ⊂ excludeFromSSAO): hiding an object from
      //    the G-buffer stops it casting/receiving AO, but the blend quad still
      //    multiplies the AO term — computed from the geometry BEHIND it — over
      //    its beauty pixels: shelf shadows crossing the clerk sprite, counter
      //    creases crossing the CRT terminals. Before every blend (recompute
      //    AND frozen replay, so the mask tracks the roaming clerk while the
      //    cached AO term stays frozen), redraw the flagged objects with their
      //    own materials (sprites billboard, alpha-test cutouts apply) into the
      //    G-buffer's color target — free real estate between recomputes, its
      //    only consumers (gtao/denoise materials) read it before the mask
      //    lands — depth-TESTED against the cached scene depth so occluders
      //    still clip them, depth-WRITE off so that depth stays pristine. The
      //    patched blend shader then zeroes the AO factor under the mask alpha.
      const originalRender = gtaoPass.render.bind(gtaoPass);
      const toggledObjects: THREE.Object3D[] = [];
      const passInternals = gtaoPass as any; // copyMaterial/blendMaterial/_renderPass/pdRenderTarget/normalRenderTarget
      const normalRT = passInternals.normalRenderTarget as THREE.WebGLRenderTarget;
      const blendMat = passInternals.blendMaterial as THREE.ShaderMaterial;
      blendMat.uniforms.tMask = { value: normalRT.texture }; // survives setSize (texture instance persists)
      blendMat.fragmentShader = /* glsl */ `
        uniform float intensity;
        uniform sampler2D tDiffuse;
        uniform sampler2D tMask;
        varying vec2 vUv;
        void main() {
          vec4 texel = texture2D( tDiffuse, vUv );
          float mask = clamp( texture2D( tMask, vUv ).a, 0.0, 1.0 );
          gl_FragColor = vec4( mix( vec3( 1. ), texel.rgb, intensity * ( 1.0 - mask ) ), texel.a );
        }`;
      blendMat.needsUpdate = true;

      const maskClearColor = new THREE.Color();
      const maskDepthWriteToggled: THREE.Material[] = [];
      const collectMaskNode = (o: THREE.Object3D) => {
        // Layer bits don't inherit and terminal children (GLB monitors/keyboards)
        // arrive async — (re)tag the whole subtree at draw time; enable() is
        // idempotent and additive (bit 0 stays, main render unaffected).
        o.layers.enable(AO_MASK_LAYER);
        const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (!mat) return;
        if (Array.isArray(mat)) {
          for (let i = 0; i < mat.length; i++) {
            if (mat[i].depthWrite) { mat[i].depthWrite = false; maskDepthWriteToggled.push(mat[i]); }
          }
        } else if (mat.depthWrite) {
          mat.depthWrite = false;
          maskDepthWriteToggled.push(mat);
        }
      };
      const renderAOBlendMask = (renderer: THREE.WebGLRenderer) => {
        const prevTarget = renderer.getRenderTarget();
        const prevAutoClear = renderer.autoClear;
        renderer.getClearColor(maskClearColor);
        const prevClearAlpha = renderer.getClearAlpha();
        renderer.setRenderTarget(normalRT);
        renderer.autoClear = false;
        renderer.setClearColor(0x000000, 0);
        // Color-only clear: after a recompute the G-buffer alpha is 1 everywhere
        // (which would mask the whole frame), and stale silhouettes must not
        // linger. Depth is NOT cleared — it's the cached scene depth the mask
        // draws test against.
        renderer.clear(true, false, false);
        let anyVisible = false;
        for (let i = 0; i < this.aoMaskRoots.length; i++) {
          if (this.aoMaskRoots[i].visible) {
            anyVisible = true;
            this.aoMaskRoots[i].traverse(collectMaskNode);
          }
        }
        if (anyVisible) {
          const prevBackground = this.scene.background;
          this.scene.background = null; // a background draw would stomp the cleared mask alpha
          const prevLayers = this.camera.layers.mask;
          this.camera.layers.set(AO_MASK_LAYER);
          renderer.render(this.scene, this.camera);
          this.camera.layers.mask = prevLayers;
          this.scene.background = prevBackground;
          for (let i = 0; i < maskDepthWriteToggled.length; i++) maskDepthWriteToggled[i].depthWrite = true;
          maskDepthWriteToggled.length = 0;
        }
        renderer.setClearColor(maskClearColor, prevClearAlpha);
        renderer.autoClear = prevAutoClear;
        renderer.setRenderTarget(prevTarget);
      };
      const compositeAO = (renderer: THREE.WebGLRenderer, outTarget: THREE.WebGLRenderTarget | null, readBuffer: THREE.WebGLRenderTarget) => {
        passInternals.copyMaterial.uniforms.tDiffuse.value = readBuffer.texture;
        passInternals.copyMaterial.blending = THREE.NoBlending;
        passInternals._renderPass(renderer, passInternals.copyMaterial, outTarget);
        passInternals.blendMaterial.uniforms.intensity.value = gtaoPass.blendIntensity;
        passInternals.blendMaterial.uniforms.tDiffuse.value = passInternals.pdRenderTarget.texture;
        passInternals._renderPass(renderer, passInternals.blendMaterial, outTarget);
      };

      gtaoPass.render = (renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean) => {
        const isDefaultOutput = gtaoPass.output === GTAOPass.OUTPUT.Default; // debug output modes (window.debugSSAO) recompute raw, no mask/composite
        const outTarget = gtaoPass.renderToScreen ? null : writeBuffer;
        const viewUnchanged =
          isDefaultOutput &&
          !this.aoNeedsRefresh &&
          matrixAlmostEquals(this.aoCachedCamWorld, this.camera.matrixWorld) &&
          matrixAlmostEquals(this.aoCachedCamProj, this.camera.projectionMatrix);
        if (viewUnchanged) {
          renderAOBlendMask(renderer);
          compositeAO(renderer, outTarget, readBuffer);
          return;
        }
        toggledObjects.length = 0;
        for (let i = 0; i < this.ssaoExcludedObjects.length; i++) {
          const object = this.ssaoExcludedObjects[i];
          if (object.visible) {
            object.visible = false;
            toggledObjects.push(object);
          }
        }
        perfTrace.count(CT_AO);
        perfTrace.begin(SP_AO);
        // Default output's copy+blend tail is replaced by compositeAO below so
        // the mask can land between the AO recompute and the blend.
        if (isDefaultOutput) gtaoPass.output = GTAOPass.OUTPUT.Off;
        try {
          originalRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
        } finally {
          if (isDefaultOutput) gtaoPass.output = GTAOPass.OUTPUT.Default;
          perfTrace.end(SP_AO);
          for (let i = 0; i < toggledObjects.length; i++) {
            toggledObjects[i].visible = true;
          }
          toggledObjects.length = 0;
        }
        if (isDefaultOutput) {
          renderAOBlendMask(renderer);
          compositeAO(renderer, outTarget, readBuffer);
        }
        this.aoCachedCamWorld.copy(this.camera.matrixWorld);
        this.aoCachedCamProj.copy(this.camera.projectionMatrix);
        this.aoNeedsRefresh = false;
      };

      this.composer.addPass(gtaoPass);
      this.aoPass = gtaoPass;
      (window as any).debugSSAO = gtaoPass;
      console.log("[AO] GTAOPass added to composer at full res (motion-gated, view-cached):", {
        width,
        height,
        radius: gtaoPass.gtaoMaterial.uniforms.radius.value,
        blendIntensity: gtaoPass.blendIntensity,
      });
    }

    // Very restrained HDR bloom — just a soft halo on the brightest fixtures, not
    // a glow on everything. The high threshold keeps diffuse surfaces crisp; with
    // AgX already rolling off highlights, bloom only needs to add the faint lens
    // bleed real fluorescent diffusers have. (Earlier this was cranked and made the
    // whole room glow like the sun — deliberately gentle now.)
    // Skipped on low quality to reduce GPU load on weak/remote hardware.
    if (effectiveQuality !== 'low') {
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        0.14, // strength (subtle)
        0.4,  // radius
        // Threshold sits between "brightly lit surface" (~1) and the HDR troffer
        // emitters (3.5): only genuine light sources bloom. At the old 1.1 the
        // troffers smeared a milky veil across the whole ceiling.
        2.0
      );
      this.composer.addPass(bloomPass);
      this.bloomPass = bloomPass;
    }

    // Depth-of-field (high quality only). Inserted after bloom so it blurs the
    // fully-lit beauty, before FXAA so the blur's soft edges still get antialiased
    // and before the display-space vignette/grain. Starts disabled; animate()
    // enables it only in inspect mode and steers `focus` to the held case, so it
    // costs nothing (EffectComposer skips disabled passes) while browsing/walking.
    if (effectiveQuality === 'high') {
      const bokehPass = new BokehPass(this.scene, this.camera, {
        focus: 3.0,       // world-units to the focal plane; steered per-frame in inspect
        aperture: 0.0032, // small aperture → gentle, believable falloff (not a toy-tilt-shift)
        maxblur: 0.006,   // cap the circle-of-confusion so distant shelves soften, not smear
      });
      bokehPass.enabled = false;

      // BokehPass renders a full-scene depth pass with scene.overrideMaterial.
      // Two things must be shielded from it, exactly as the GTAO G-buffer is:
      //   1. The live Reflectors — freeze them (reuse their last texture) so the
      //      depth override doesn't drive an extra mirror render or scribble depth
      //      into a reflection texture. The existing static guard does this: every
      //      mirror's onBeforeRender early-returns while it is set.
      //   2. The billboard sprites / unlit signage (ssaoExcludedObjects) — a Sprite
      //      under an override MeshDepthMaterial renders wrong; hide them for the
      //      depth pass, restore after. They're seldom in the inspect frame anyway.
      const bokehOrigRender = bokehPass.render.bind(bokehPass);
      const bokehToggled: THREE.Object3D[] = [];
      bokehPass.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
        const prevRefl = StoreScene.reflectorRendering;
        StoreScene.reflectorRendering = true;
        bokehToggled.length = 0;
        for (let i = 0; i < this.ssaoExcludedObjects.length; i++) {
          const o = this.ssaoExcludedObjects[i];
          if (o.visible) { o.visible = false; bokehToggled.push(o); }
        }
        try {
          bokehOrigRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
        } finally {
          for (let i = 0; i < bokehToggled.length; i++) bokehToggled[i].visible = true;
          bokehToggled.length = 0;
          StoreScene.reflectorRendering = prevRefl;
        }
      };

      this.composer.addPass(bokehPass);
      this.bokehPass = bokehPass;
      (window as any).debugBokeh = bokehPass;
    }

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);

    // AA pass AFTER OutputPass, i.e. on tone-mapped display-referred sRGB —
    // the space luma-based edge detection was designed for (moving FXAA here
    // from before the tone mapper is what stopped "AA is on but every shelf
    // edge still crawls"; the same argument holds for SMAA, whose reference
    // implementation also expects gamma-space input, whatever the three docs
    // say about running it pre-OutputPass).
    //
    // FXAA is the default everywhere. SMAA was tried as the high-tier
    // replacement (morphological edge reconstruction for the thin T-bar/shelf
    // geometry) and REJECTED on evidence: on the ceiling grid's near-1px
    // printed rails it broke the line into beaded dashes — SMAA can't
    // reconstruct sub-pixel dashed coverage, while FXAA blurs it into a
    // continuous line, which is what those rails need. With the SSAA budget
    // above doing the real work, FXAA-on-top measured cleanly better.
    // bb_aa = 'smaa' | 'fxaa' | 'off' overrides for experiments.
    const _aaOverride = localStorage.getItem('bb_aa');
    const aaMode = (_aaOverride === 'smaa' || _aaOverride === 'fxaa' || _aaOverride === 'off')
      ? _aaOverride
      : 'fxaa';
    if (aaMode === 'smaa') {
      // SMAAPass sizes itself (RTs + resolution uniforms) via setSize, which
      // addPass and composer.setSize drive with effective buffer dimensions —
      // no manual uniform plumbing like FXAA's below.
      this.composer.addPass(new SMAAPass());
    } else if (aaMode === 'fxaa') {
      this.fxaaPass = new ShaderPass(FXAAShader);
      const pixelRatio = this.renderer.getPixelRatio();
      this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (width * pixelRatio);
      this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (height * pixelRatio);
      this.composer.addPass(this.fxaaPass);
    }

    // Photo-grade pass (vignette, grain, S-curve/sat/lift, color warmth, the
    // optional nostalgia LUT) — built in store-grade.ts. Applied AFTER
    // OutputPass so it works in display-referred space.
    this.filmPass = grade.createGradePass(this, filmicTonemap);
    this.composer.addPass(this.filmPass);

    // Partial composite: while parked with a ceiling TV playing, re-draw only
    // the screens into the cached beauty and re-run the post chain (see the
    // module header and animate()'s `patchable` gate). SMAA is excluded on the
    // plain tier: its internal quads write into the same ping-pong buffers and
    // would stomp the depth this path leans on. GTAO likewise — it caches its
    // own G-buffer against a scene draw we would be skipping.
    const patchableChain = aaMode !== 'smaa' && !(ssaoEnabled && !useN8ao);
    this.partial = patchableChain && (beautySource.n8ao || beautySource.beautyPass)
      ? new PartialComposite({
          renderer: this.renderer,
          scene: this.scene,
          camera: this.camera,
          composer: this.composer as any,
          n8aoPass: beautySource.n8ao as any,
          beautyPass: beautySource.beautyPass,
        })
      : null;

    // EXPOSE FOR DEBUGGING
    (window as any).debugScene = this.scene;
    (window as any).debugRenderer = this.renderer;
    (window as any).debugComposer = this.composer;
    // Floor arrangement config, drivable from the console:
    //   setArrangement('straight' | 'diagonal' | 'herringbone')
    (window as any).setArrangement = (id: ArrangementId) => this.setArrangement(id);
    (window as any).getArrangement = () => this.getArrangement();
    (window as any).ARRANGEMENTS = StoreScene.ARRANGEMENTS;
    (window as any).debugResScale = () => this.resScale;
    // Force the stocked-shelves environment re-bake now instead of waiting for
    // stockedRebakeDue()'s frame count + input-silence window. Verification
    // hook: a screenshot never reaches those conditions, so without this the
    // only reflections a shot can photograph are the EMPTY-SHELL bake taken
    // before the cases are placed (see pendingStockedRebake).
    (window as any).debugForceStockedRebake = () => {
      this.pendingStockedRebake = false;
      this.outdoor.rebakeEnvironment();
      this.requestRender();
      return true;
    };
    // Partial-composite A/B (see PartialComposite.debugAB): renders the same
    // changed TV picture through the patch path and the full chain in one tick.
    (window as any).debugPartialAB = () => this.partial?.debugAB(
      () => { this.ambientTvs?.debugPokeTestCard(performance.now() * 0.0004); }) ?? null;
    // Motion-gated sharpness introspection: effective buffer multiplier is
    // resScale × qualityScale; sharpScale is the native-res target (1 on any
    // already-native window). Used by the shot harness to verify the plumbing.
    (window as any).debugQualityScale = () => ({
      resScale: this.resScale, qualityScale: this.qualityScale,
      sharpScale: this.sharpScale, tier: this.currentTier,
      settleScale: this.settleScale, settleSsFactor: this.settleSsFactor,
      motionScale: this.motionScale, motionSsFactor: this.motionSsFactor,
      // Why the settle supersample has/hasn't landed yet: how long the view has
      // been free of camera motion and of scene changes (both must exceed
      // QUALITY_SETTLE_MS), and whether a static frame is already parked.
      quietMs: Math.round(performance.now() - Math.max(this.lastCameraMotionTime, this.lastSceneChangeTime)),
      staticSettled: this.staticSettled,
      pixelRatio: this.renderer.getPixelRatio(),
      bufferW: this.renderer.domElement.width, bufferH: this.renderer.domElement.height,
    });
    // Harness-only: put the dynamic scaler back at full resolution. Boot (poster
    // uploads, shader compiles) runs sub-1fps frames that legitimately walk
    // resScale down, and staticPersist then keeps resetting the fps window so it
    // has no ACTIVE second in which to walk back up — which makes an A/B shot's
    // buffer depend on how slow that particular boot happened to be. Product
    // code never calls this; the IDLE branch is the real recovery path.
    (window as any).debugResetResScale = () => {
      this.resScale = StoreScene.RES_SCALE_MAX;
      this.applyRenderResolution();
      this.requestRender();
    };

    // Apply the initial render resolution through the same single code path
    // used by resize and the dynamic scaler (issue #27). resScale starts at
    // 1.0 (no-op vs. the sizes already set above) except on software GL,
    // which boots already at the floor.
    this.applyRenderResolution();

    // Handle resizing
    window.addEventListener('resize', this.onWindowResize);
  }

  // Single code path for sizing the renderer/composer/passes, driven by the
  // CSS/client size and the current dynamic resolution scale (issue #27).
  // Called on init, on window resize, and whenever resScale steps. Renderer
  // pixelRatio (the quality-tier cap) is untouched here — only the buffer
  // dimensions scale, so ratio and size are never multiplied together.
  private applyRenderResolution() {
    const clientWidth = this.container.clientWidth || window.innerWidth || 1280;
    const clientHeight = this.container.clientHeight || window.innerHeight || 720;
    // Recompute sharpScale here (cheap) so it's always current for the panel we
    // are actually on — init and every resize flow through this method. It is
    // the qualityScale value that lifts the current (capped) buffer up to native
    // display resolution: baseBudget is what we render today at qualityScale 1
    // (clientPx × pixelRatio² — the ~1440p budget on the 4K kiosk), sharpBudget
    // is the panel's true pixel count (clientPx × devicePixelRatio²), capped so
    // an 8K panel never supersamples past ~4K. Clamped to >= 1: on any window
    // that already renders at/above native (dev, 1080p, the 720p/1080p shot
    // harness) this is exactly 1 and qualityScale can never change anything.
    const dpr = window.devicePixelRatio || 1;
    const pr = this.renderer.getPixelRatio() || 1;
    const clientPx = Math.max(1, clientWidth * clientHeight);
    const baseBudget = clientPx * pr * pr;
    const sharpBudget = Math.min(clientPx * dpr * dpr, 8.5e6);
    this.sharpScale = Math.max(1, Math.sqrt(sharpBudget / baseBudget));
    // Settle target: settleSsFactor x whatever the moving frame already costs
    // (the larger of the capped base budget and native), so this supersamples
    // on top of native on the 4K kiosk AND on top of the existing 1.34x
    // supersample in a 1080p window. Clamped to >= sharpScale so the parked
    // frame is never SOFTER than the motion it followed.
    //
    // Divided by resScale, because settlePx is an ABSOLUTE pixel target for the
    // parked frame, not a multiplier on the motion budget. resScale is the
    // dynamic-resolution scaler: it exists purely so frames that must land in
    // 16ms do. A parked frame has no frame-rate to hit, so it should not
    // inherit a scale the GPU earned while it was busy — exactly the logic the
    // IDLE branch already applies when it snaps resScale to RES_SCALE_MAX for
    // the frame left on screen. Without this, one bad second (boot texture
    // uploads pinning resScale at 0.7) silently downgrades every settle frame
    // for the rest of the session, and the "2x pixels" the user is paying for
    // lands barely at native. resScale itself is left alone so the MOTION
    // budget is untouched.
    if (this.settleSsFactor > 0) {
      const settlePx = Math.min(Math.max(baseBudget, sharpBudget) * this.settleSsFactor,
                                StoreScene.SETTLE_PX_CAP);
      const settleAbs = Math.sqrt(settlePx / baseBudget) / Math.max(0.01, this.resScale);
      this.settleScale = Math.max(this.sharpScale, settleAbs);
    } else {
      this.settleScale = this.sharpScale;
    }

    // Motion target: same arithmetic, smaller factor (see motionScale). NOT
    // divided by resScale — unlike the parked frame, a moving frame very much
    // has a frame rate to hit, so it must inherit whatever headroom the scaler
    // has decided the GPU actually has. That's what makes the extra pixels
    // self-limiting rather than a fixed tax.
    if (this.motionSsFactor > 0) {
      const motionPx = Math.min(Math.max(baseBudget, sharpBudget) * this.motionSsFactor,
                                StoreScene.MOTION_PX_CAP);
      this.motionScale = Math.max(this.sharpScale, Math.sqrt(motionPx / baseBudget));
    } else {
      this.motionScale = this.sharpScale;
    }
    // settleScale is an absolute pixel target expressed as a multiplier over
    // resScale (see its division above), so it is only correct for the resScale
    // it was computed under. qualityScale, however, is latched by animate() and
    // outlives that: let resScale rise afterwards — which it does constantly,
    // since the scaler walks back up after boot — and the latched value
    // over-delivers by exactly the ratio. Measured: a 29.5MP buffer against a
    // 17MP SETTLE_PX_CAP, i.e. a ~500MB target allocation for one frame. Clamp
    // it to the freshly-solved ceiling; motionScale is always <= settleScale, so
    // this can only ever catch the stale case.
    // The parked frame must never be softer than the motion it followed.
    this.settleScale = Math.max(this.settleScale, this.motionScale);
    this.qualityScale = Math.min(this.qualityScale, this.settleScale);

    const width = Math.max(1, Math.floor(clientWidth * this.resScale * this.qualityScale));
    const height = Math.max(1, Math.floor(clientHeight * this.resScale * this.qualityScale));

    // `false` keeps the canvas CSS size at the full client size so the browser
    // upscales the (possibly smaller) drawing buffer — the standard dynamic
    // resolution technique. Without it, setSize also stomps the CSS size and
    // the page layout breaks.
    perfTrace.count(CT_RES);
    this.renderer.setSize(width, height, false);
    // Every cached buffer the partial composite patches has just been resized
    // (and thereby cleared) — nothing to patch until a full frame refills them.
    this.partial?.disarm();
    if (this.composer) {
      this.composer.setSize(width, height);
    }
    if (this.aoPass) {
      // composer.setSize() above resized (and thereby cleared) the AO pass's
      // internal targets — the cached AO term is gone, so the next composited
      // frame must recompute it rather than replay the frozen blend.
      this.aoNeedsRefresh = true;
    }
    if (this.bloomPass) {
      // composer.setSize() just reset bloom to full resolution too. In VIDEO
      // tier (a ceiling TV playing or the seccam arrow bobbing, composited at
      // ~24fps for as long as that state lasts — potentially days) shrink its
      // bright-pass + 5-mip blur chain to half res, quartering its fill cost;
      // ACTIVE keeps full res so the halo doesn't visibly resize. Disabling it
      // outright in VIDEO was considered but rejected — it would pop the halo
      // off the troffers/marquee/TV screens on every ACTIVE→VIDEO settle,
      // which happens after any keypress (issue #120).
      const bloomDivisor = this.currentTier === 'video' ? 2 : 1;
      this.bloomPass.setSize(Math.max(1, Math.round(width / bloomDivisor)), Math.max(1, Math.round(height / bloomDivisor)));
    }
    if (this.fxaaPass) {
      // FXAA uses inverse *effective* pixel resolution (buffer size × pixelRatio
      // cap). Stale values here are the classic bug with dynamic res — AA looks
      // subtly wrong instead of erroring loudly.
      const pixelRatio = this.renderer.getPixelRatio();
      this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (width * pixelRatio);
      this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (height * pixelRatio);
    }
  }

  // Storefront glazing: a solid knee wall (a real store never ran glass to
  // the carpet) with the glass, mullions and waist rail above it. `kneeGap`
  // leaves an opening in the knee wall (e.g. where the entrance vestibule's
  // doors meet the front facade), given in this section's local X.
  public createWindowSection(
    width: number,
    height: number,
    numCols: number,
    waistY: number = 3.3,
    kneeGap?: { center: number; halfWidth: number },
    frameColor: string = '#222222',
  ): THREE.Group { return shell.createWindowSection(this, width, height, numCols, waistY, kneeGap, frameColor); }

  private setupLighting() {
    // ===== Lighting model: image-based (IBL) primary + a single sun =====
    // The environment map set up in initThree() is now the main light source: it
    // wraps the whole room in soft, omnidirectional, physically-plausible fill and
    // gives the glossy DVD cases correct reflections — all from one coherent
    // source. That replaces the old pile of troffer area-lights and wall washes,
    // which lit everything evenly from everywhere and is exactly what made the
    // scene read flat and gamey.
    //
    // On top of the IBL we add only what an environment map can't do: ONE
    // directional "sun" for directional shape and real cast shadows, a faint
    // hemisphere to tint the shadow side, and a near-zero camera headlight so dark
    // box titles stay legible. The ceiling troffer panels are now purely emissive
    // geometry — they look lit without each behaving as a light.

    // Faint hemisphere purely to colour the shadow side: cool from the ceiling
    // above, warm carpet/wood bounce from below. Kept low so it shapes, not floods.
    const ambientSky = this.selectedSky ? this.selectedSky.hemisphereSky : '#cdd8ea';
    const ambientGround = this.selectedSky ? this.selectedSky.hemisphereGround : '#1c1408';
    const ambientIntensity = this.selectedSky ? this.selectedSky.hemisphereIntensity : 0.09;
    const ambient = new THREE.HemisphereLight(ambientSky, ambientGround, ambientIntensity);
    this.scene.add(ambient);

    // The single real light: warm daylight raking in from the front/left windows.
    // It supplies the scene's direction and casts every shadow in the room. With
    // only one shadow-caster now, it can afford a big, high-res, soft shadow map.
    const sunColor = this.selectedSky ? this.selectedSky.sunColor : '#ffe3c0';
    const sunIntensity = this.selectedSky ? this.selectedSky.sunIntensity : 3.6;
    const sunLight = new THREE.DirectionalLight(sunColor, sunIntensity);
    const sunTarget = new THREE.Object3D();
    sunTarget.position.set(14.0, 0.0, this.scaleZ(-12.0));
    this.scene.add(sunTarget);
    sunLight.target = sunTarget;
    this.outdoor.sunLight = sunLight;
    this.outdoor.applySunPlacement(); // position from the per-entry azimuth/elevation roll

    sunLight.castShadow = true;
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 0.02; // curb shadow acne on the rounded cases
    sunLight.shadow.radius = 3.0; // soft penumbra
    const sunShadowSize = this.effectiveQuality === 'high' ? 4096 : (this.effectiveQuality === 'medium' ? 2048 : 1024);
    sunLight.shadow.mapSize.width = sunShadowSize;
    sunLight.shadow.mapSize.height = sunShadowSize;
    sunLight.shadow.camera.left = -55;
    sunLight.shadow.camera.right = 55;
    sunLight.shadow.camera.top = 45;
    sunLight.shadow.camera.bottom = -45;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 95;
    this.scene.add(sunLight);
    this.scene.add(sunLight.target);
    this.topLights.push(sunLight);

    // Near-zero camera headlight: just a legibility floor for dark-side box titles.
    // A camera-aligned light flattens whatever it touches, so it stays tiny.
    this.headlight = new THREE.DirectionalLight('#fff5e6', 0.05);
    this.headlight.castShadow = false;
    this.scene.add(this.headlight);
    this.scene.add(this.headlight.target);
  }


  public buildStore() { return shell.buildStore(this); }

  // Outside mode (day/night/sunset) — sky, sun, and env bake live in the
  // OutdoorLightingRig (outdoor-lighting.ts); these are the public API.
  public getOutsideMode(): OutsideMode {
    return this.outdoor.outsideMode;
  }

  public setOutsideMode(mode: OutsideMode) {
    this.requestRender();
    this.outdoor.setOutsideMode(mode);
    this.exterior?.setOutsideMode(mode);
  }

  // Runs once per scene build (called from buildStore(), right after every
  // fixture is built and this.plan's shelving units are finalized — there is
  // only one fixture-build call site in this class; full rebuilds tear this
  // whole StoreScene down and construct a fresh one, which re-enters here via
  // the constructor -> buildStore()). Collects every fixture's + shelving
  // unit's ground-plan footprint, runs src/layout-validator.ts over them, and
  // logs each violation as a plain console line so `npm run shot` (which
  // already echoes browser console lines matching /error/i) surfaces real
  // spatial mistakes without anyone having to eyeball a screenshot. No
  // per-frame cost: this is O(n^2) over ~50 rects, invoked exactly once here.
  public validateStoreLayout(fixtureFootprints: Footprint[], storeWidth: number, backWallZ: number) { return shell.validateStoreLayout(this, fixtureFootprints, storeWidth, backWallZ); }

  // Continuous chrome cornice running around the entire ceiling perimeter, with
  // a mirror band set into its inner face. The chrome body juts down from the
  // ceiling (it has depth/volume rather than being a floating mirror), and the
  // mirror band reflects the store via a per-edge cube camera for sharpness.
  public buildCeilingFrame(storeWidth: number, backWallZ: number) { return shell.buildCeilingFrame(this, storeWidth, backWallZ); }

  // T13: old-cinema marquee bulb rows — optional decoration, off entirely at
  // 'low' render quality or when bb_marquee_bulbs is toggled off (both checked
  // here, not just in the caller, so this method is the single source of truth
  // for whether the feature exists this build).
  //
  // Every bulb in the store — the cornice rim running the full ceiling
  // perimeter, plus a ring around every window poster — lives in ONE
  // THREE.InstancedMesh (one draw call; no per-bulb THREE.Object3D, no
  // THREE.PointLight anywhere). Warm emissive material + the scene's existing
  // UnrealBloomPass (see initThree()) does all the glow — no second glow-sprite
  // mesh is needed since this app already blooms bright emitters (the ticket
  // logo's gold layers use the same emissiveIntensity-above-threshold trick).
  // Reflector mirrors render the whole scene from their own camera, so these
  // instances show up in the ceiling mirror reflections for free.
  //
  // Per-instance brightness (steady/off/chase) is driven by instanceColor, but
  // vanilla MeshStandardMaterial only multiplies *diffuse* color by
  // instanceColor — emissive (which is what actually blooms) is untouched by
  // it. An onBeforeCompile patch multiplies totalEmissiveRadiance by the same
  // vColor varying three.js already wires up for USE_INSTANCING_COLOR, so
  // instanceColor controls how "on" each bulb reads, exactly as the ticket's
  // "modulate instanceColor for a subset of instances" suggests.
  //
  // Render-on-demand (issue #24) interaction: bb_marquee_anim's 'chase' mode
  // is the only mode with any per-frame cost, and it is gated to piggyback on
  // frames the scene is ALREADY compositing for other reasons — updateMarqueeBulbs()
  // is called from the same post-IDLE-return spot as ambientTvs.update(), so it
  // never runs while the tier is IDLE. It does NOT call requestRender() itself.
  // That means a chase pattern only visibly advances while something else is
  // keeping the renderer awake (camera moving, browsing, an ambient TV playing)
  // and freezes in place the instant everything else goes idle — the same
  // still-frame guarantee IDLE gives every other animation. This was a
  // deliberate choice over driving a VIDEO-like throttled tier of its own:
  // that would mean the mere presence of "chase" selected forces the renderer
  // to wake forever at ~7Hz just to blink lights nobody's looking at, which
  // would break the idle-composites-nothing invariant for as long as the
  // setting is on. 'steady' and 'off' are fully static (instanceColor written
  // once at build time) and cost nothing per frame, matching the ticket's
  // budget exactly.
  public buildMarqueeBulbs(storeWidth: number, backWallZ: number) { return shell.buildMarqueeBulbs(this, storeWidth, backWallZ); }

  // Live-apply hook for the bb_marquee_anim setting (settings.ts registers it
  // as applyMode 'live'). Writes the instanceColor buffer once; 'chase' also
  // seeds the running pattern that updateMarqueeBulbs() advances on qualifying
  // frames. Safe to call with no bulb mesh built (feature off / low quality).
  public setMarqueeAnimMode(mode: 'off' | 'steady' | 'chase'): void { return shell.setMarqueeAnimMode(this, mode); }

  // Advances the 'chase' pattern. Only called from the render loop past the
  // IDLE early-return (see animate()'s render-on-demand section) — see this
  // method's class comment above buildMarqueeBulbs() for why that, plus a
  // ~150ms internal throttle here, is the whole animation budget: zero cost
  // while idle, near-zero cost even while active.
  public updateMarqueeBulbs(timeMs: number): void { return shell.updateMarqueeBulbs(this, timeMs); }

  // Actor-portrait wall + floating film-strip ribbon (pin 052 rebuild, see
  // wall-decor.ts): the library's most-featured actors, evenly spread along
  // the solid right wall, never overlapping the EXIT door/frame or the side
  // window ribbon. High-ceiling variant only — wall-decor.ts owns that gate.
  public buildWallDecor(storeWidth: number, backWallZ: number) { return wallDecor.buildWallDecor(this, storeWidth, backWallZ); }

  public clearMovieBoxes() { return stock.clearMovieBoxes(this); }

  // Shelf order of the active library — the category-sorted layout entries,
  // where nulls are the empty padding at the tail of each category's section.
  public getLayoutEntries(): (Movie | null)[] {
    return this.layoutFor(this.selectedLibraryIdx).entries;
  }

  public getLayoutEntriesForActiveSide(): (Movie | null)[] {
    const entries = this.getLayoutEntries();
    // Entry blocks flow in customer walk order (see StorePlan.entryBlockOrder)
    const side = this.selectedSide === 'back' ? 'back' : 'front';
    const blockIdx = this.plan.blockIndexOf(this.selectedLibraryIdx, this.selectedUnitIdx, side);
    const startIdx = blockIdx * UNIT_SIDE_CAPACITY;
    return entries.slice(startIdx, startIdx + UNIT_SIDE_CAPACITY);
  }

  public updateColsCount() { return stock.updateColsCount(this); }

  // Live mirrors, throttled. See installMirrorThrottle().
  public mirrors: mirrors.MirrorEntry[] = [];
  // Round-robin cursor for the reflection budget (store-mirrors.ts).
  public mirrorCursor = 0;
  private static reflectorRendering = false;
  // Camera state as of the last updateMirrorThrottle() call, used to detect
  // whether the view actually changed (see updateMirrorThrottle).
  public lastMirrorCamPos = new THREE.Vector3(Infinity, Infinity, Infinity);
  public lastMirrorCamQuat = new THREE.Quaternion();
  // Frame counter modulo the mirror refresh stride (see renderMirrorsAhead).
  public mirrorMotionParity = 0;
  // bb_mirrors=0 — opt-out/measurement knob: freeze reflections at their last
  // render instead of re-rendering the scene as the camera moves.
  public mirrorsFrozen = localStorage.getItem('bb_mirrors') === '0';
  // Sticky one-shot, consumed by the updateMirrorThrottle() call in animate():
  // set when the clerk comes to rest so mirrors catch her final pose. Her
  // update() runs in the pre-tier bookkeeping section (issue #96), so the rAF
  // she stops on can be one the IDLE/VIDEO throttles never composite.
  public clerkMirrorRefresh = false;

  // Live mirrors: install the per-Reflector render throttle, and decide each
  // frame whether any reflection may re-render. See store-mirrors.ts.
  private installMirrorThrottle() { return mirrors.installMirrorThrottle(this); }
  private updateMirrorThrottle(forceAll: boolean) { return mirrors.updateMirrorThrottle(this, forceAll); }

  // Cube render targets behind the current reflection probes, kept so a re-bake
  // (outside-mode change) can dispose them instead of leaking GPU memory.
  private probeRenderTargets: THREE.WebGLCubeRenderTarget[] = [];

  private generateReflectionProbes() {
    const probePositions = [
      { x: -2.0, y: 5.5, z: this.scaleZ(-15.0) },
      { x: 6.0, y: 5.5, z: this.scaleZ(-15.0) },
      { x: 14.0, y: 5.5, z: this.scaleZ(-15.0) },
      { x: 22.0, y: 5.5, z: this.scaleZ(-15.0) },
      { x: 11.0, y: 5.5, z: this.backWallZ + 10.0 }
    ];

    const textures: THREE.CubeTexture[] = [];

    // Temporarily hide the selection arrow if it exists during probe baking
    const arrowWasVisible = this.selectionArrow ? this.selectionArrow.visible : false;
    if (this.selectionArrow) {
      this.selectionArrow.visible = false;
    }

    // Hide the live planar mirrors during the probe bake. Each Reflector
    // re-renders the whole scene from its own viewpoint; left visible, the 5
    // cube cameras (30 face renders) cascade into hundreds of nested mirror
    // renders in one synchronous burst, which overruns the GPU and kills the
    // renderer process. The probes don't need the mirrors anyway. Mirrors are
    // restored below and render normally (once each) during animation.
    const reflectors: THREE.Object3D[] = [];
    this.scene.traverse((obj) => { if (obj instanceof Reflector) reflectors.push(obj); });
    reflectors.forEach((r) => { r.visible = false; });

    // Re-bake path: release the previous generation of probes first.
    this.probeRenderTargets.forEach((rt) => rt.dispose());
    this.probeRenderTargets = [];

    // Software GL: the probes' cost is dominated by the 30 full draw-call
    // replays (5 probes x 6 faces), but shrinking the target still trims the
    // per-face raster + mip chain to near-nothing on CPU.
    const probeRes = this.softwareGL ? 64 : 256;
    for (let i = 0; i < 5; i++) {
      const pos = probePositions[i];
      const renderTarget = new THREE.WebGLCubeRenderTarget(probeRes, {
        generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter
      });
      const camera = new THREE.CubeCamera(0.1, 1000, renderTarget);
      camera.position.set(pos.x, pos.y, pos.z);
      this.scene.add(camera);

      camera.update(this.renderer, this.scene);
      textures.push(renderTarget.texture as any);
      this.probeRenderTargets.push(renderTarget);
      this.scene.remove(camera);
    }

    reflectors.forEach((r) => { r.visible = true; });

    if (this.selectionArrow) {
      this.selectionArrow.visible = arrowWasVisible;
    }

    setReflectionProbes(textures);
  }

  // Populate all shelving units once at startup
  // Populate all shelving units once at startup
  public buildAllMovieBoxes() { return stock.buildAllMovieBoxes(this); }

  // First-use shader-compile hitches (perf-trace baseline: 82–189ms frames,
  // glLinkN>0, the cost landing inside the first Reflector re-render after a
  // hero bind/flip): the hero-case material variants — poster front, canvas
  // back, rental set, series-boxset physical material, the
  // Animated-Movies white-border shader — don't exist until a title is
  // selected, so their GL programs used to compile in the middle of the first
  // selection move / first flip, freezing the frame for however long the
  // driver takes to link. Build them at boot through the REAL factories (which
  // also pre-pays their canvas draws and seeds the video-case caches the first
  // real selection will hit) and compile via compileAsync
  // (KHR_parallel_shader_compile — background compile, no main-thread stall).
  // The BokehPass gets one throwaway composited frame for the same reason: its
  // depth + bokeh programs otherwise compile on the first inspect.
  public warmedPrograms = false;
  public warmupRuntimePrograms() { return stock.warmupRuntimePrograms(this); }
  public setGradeWarmth(v: number) { grade.setGradeWarmth(this, v); }
  public setGradeLut(on: boolean) { grade.setGradeLut(this, on); }

  // (Re)bakes the extra stacked-behind copies for high-rated films (see
  // extraCopiesCount()) at each qualifying slot's CURRENT resting position. Must be
  // re-run after anything that moves slots -- e.g. rebuildMovieBoxes() on a genre-filter
  // change -- otherwise the copies are left behind at stale, pre-filter positions,
  // showing up detached from their movie (or behind whatever now occupies that spot).
  // Movies currently filtered out (slot.hidden) get their copies scaled to zero rather
  // than positioned, so they don't float on an empty shelf.
  public rebuildExtraCopies() { return stock.rebuildExtraCopies(this); }

  public rebuildSSAOExclusionList() { return stock.rebuildSSAOExclusionList(this); }

  // Reassign aisle slots to contiguous shelf positions based on current genre filter.
  // Slots whose movies don't match the filter are hidden; matching movies fill from position 0.
  // Slot map keys are updated so navigation/selection uses the compacted positions.
  public rebuildMovieBoxes() { return stock.rebuildMovieBoxes(this); }

  // Feedback/055: patches any already-built fixture whose stock selection
  // depends on data that can change mid-session (currently just the
  // PREVIOUSLY VIEWED drape table's watch history) — see
  // stock.restockSlottedFixtures's header for why this isn't a full
  // rebuildMovieBoxes() pass. Wired from the video player's onClose in
  // main.ts.
  public restockSlottedFixtures() { return stock.restockSlottedFixtures(this); }


  // Camera settings transitions based on interaction states (standardized to feet, shelf-relative)
  public updateLOD() { return stock.updateLOD(this); }

  // Dump-tub (bargain bin) browsing, in one place.
  //
  // A bin is a thing you stand over and rummage in, so — unlike a shelf — the
  // shopper does NOT walk around it. The eye is pinned to the tub's own front
  // and the SELECTED case lifts out of the pile to a fixed "held up to you"
  // point, turned so its cover normal points at the eye. Everything here is a
  // pure function of the fixture + selected shelf, so it is computed once per
  // retarget and then just read by the mode branches and by animate()'s
  // slot-pose pass.
  public updateLookDownPresent() { return cam.updateLookDownPresent(this); }

  public updateCameraTarget() { return cam.updateCameraTarget(this); }

  // Build the floating "you are here" arrow: a downward-pointing marker with a
  // library-name plaque above it. Created once; its plaque texture is redrawn and
  // its position retargeted as the selection changes (see updateSelectionArrow).
  public createSelectionArrow() { return cam.createSelectionArrow(this); }

  // Redraw the plaque texture with the given library name (cheap no-op if unchanged).
  public updateSelectionArrowLabel(text: string) { return cam.updateSelectionArrowLabel(this, text); }

  public updateSelectionArrow() { return cam.updateSelectionArrow(this); }

  // ─── T21: entrance-overview browsing ──────────────────────────────────────

  // One cursor per GENRE SECTION for a categorized library, landing on the
  // first case under that section's signboard — a big Movies library is a dozen
  // departments, and making the whole thing one ticket meant every genre but
  // the first was reachable only by walking. Small/uncategorized libraries
  // (which have no section signage to point at) keep a single name cursor.
  // Raised above the topper signboards so hidden runs' cursors peek over the
  // gondolas.
  public buildOverviewCursorTargets(): OverviewCursorTarget[] { return overview.buildOverviewCursorTargets(this); }

  // One cursor per category section of a categorized library, placed over the
  // face where that category's stock STARTS and confirming onto its first case.
  //
  // sectionLabels is keyed by global section index (SECTION_CAPACITY entries
  // each), and categories are padded to whole sections, so the first section
  // carrying a label is that category's start. From the entry index the walk
  // order gives the physical face (StorePlan.entryBlockOrder) and sideEntrySlot
  // gives the column — the same two steps the box-placement pass takes, so the
  // ticket always lands on the case actually under that signboard.
  public genreCursorTargets(
    libIdx: number,
    units: ShelvingUnit[],
    cursorY: number,
  ): OverviewCursorTarget[] { return overview.genreCursorTargets(this, libIdx, units, cursorY); }

  public ensureOverviewCursors(): OverviewCursors { return overview.ensureOverviewCursors(this); }

  // Soft screen-centre aim dot (DOM, created lazily; removed in destroy()).
  public setOverviewCrosshairVisible(v: boolean): void { return overview.setOverviewCrosshairVisible(this, v); }

  public showOverviewVisuals(): void { return overview.showOverviewVisuals(this); }

  public hideOverviewVisuals(): void { return overview.hideOverviewVisuals(this); }

  // Pick the cursor nearest the current aim, for the query/confirm path only —
  // declines while the jump index is up, which at the overview is always
  // (store-overview.ts: the index is that view's navigation).
  public updateOverviewFocus(): void { return overview.updateOverviewFocus(this); }

  // Focus a cursor by index: highlight it, park the big arrow over it, and
  // turn the head toward it (the camera-target lerp makes the turn a smooth pan).
  public applyOverviewFocus(idx: number): void { return overview.applyOverviewFocus(this, idx); }

  // Stand at the entrance-overview vantage with the jump index up. The
  // beginning browsing point when overviewStart is on; also the harness's
  // `--state overview` target.
  public enterOverview(): void { return overview.enterOverview(this); }

  // Confirm a cursor: fly to that run's normal browse position through the
  // exact same targetCameraPos/targetLookAt machinery jumpToTitle uses. With a
  // query (harness `--state browse --title …`) the cursor is matched by label
  // or owning library name instead of the crosshair.
  public overviewEnterBrowse(query?: string): boolean { return overview.overviewEnterBrowse(this, query); }

  // Settings toggle ("Start at entrance overview", live-apply). Turning it off
  // returns the classic first-aisle behavior with no reload; if you're standing
  // at the overview right now, step back to library-select.
  public setOverviewStart(enabled: boolean): void { return overview.setOverviewStart(this, enabled); }

  // ─── T22: carried tapes + front-counter checkout ────────────────────────────

  public ensureCarried(): CarriedTapes { return checkout.ensureCarried(this); }

  /** Number of tapes currently in hand (0 when carry mode is off/empty). */
  public get carriedCount(): number {
    return this.carried?.count ?? 0;
  }

  /**
   * True when the hold-select gesture should jump straight to the checkout
   * counter: carry mode on, at least one tape in hand, and not already at (or
   * running) a checkout / locked in the back room. main.ts arms InputManager's
   * hold detection off this, and shows the on-screen reminder while it's true.
   */
  public canHoldToCheckout(): boolean { return checkout.canHoldToCheckout(this); }

  /** Settings toggle ('Carry & checkout', live-apply). Off restores instant play. */
  public setCarryMode(enabled: boolean): void { return checkout.setCarryMode(this, enabled); }

  // Boot rehydrate: rebuild the carried stack from bb_carried so a reload
  // doesn't lose the picks. Instant (no flights) — you walked in holding them.
  public rehydrateCarried(): void { return checkout.rehydrateCarried(this); }

  // Empty the in-hand carried stack (meshes + bb_carried) and hand back its
  // Movie list — the store-entry rituals feed these into the RETURN TAPES
  // HERE chute. Entering the store still holding tapes wedges the whole flow
  // (a held tape blocks re-taking it and confuses the register), so every
  // entry path returns them instead.
  public collectHeldTapesForReturn(): Movie[] { return checkout.collectHeldTapesForReturn(this); }

  // Canonical shelf slot for a movie id (first shelving slot wins), used for
  // put-back targets when an entry has no recorded slot (rehydrated stacks).
  public findSlotKeyForMovie(movieId: string): string | null { return checkout.findSlotKeyForMovie(this, movieId); }

  // World pose of a slot's rental back box (the copy you actually
  // take) — the same matrix math startPlayAnimation uses. Event-time only.
  public slotBackBoxPose(slot: MovieSlot): CarryPose { return checkout.slotBackBoxPose(this, slot); }

  // "Take it": add the inspected title to the carried stack. The retail
  // display case stays on the shelf (you take the rental copy behind it),
  // so no slot state changes — matching how the launch flourish reads.
  public takeSelectedTape(): boolean { return checkout.takeSelectedTape(this); }

  /** Put the top carried tape back on its shelf (R / LB). */
  public returnCarriedTape(): void { return checkout.returnCarriedTape(this); }

  /**
   * The front-counter checkout waypoint: stand on the store side of the
   * counter apex facing the register; the clerk walks over and waits. Reached
   * from the overview's CHECKOUT cursor or the C shortcut while browsing.
   */
  public enterCheckout(): void { return checkout.enterCheckout(this); }

  // The customer's checkout stand (world, y = eye height): beside the
  // counter's RIGHT end — the -X exit side — in the walkway a step out from
  // the bag's end of the inner island (anchored to bagBaseWorld so every
  // counter shape keeps the same relationship).
  public checkoutStand(out: THREE.Vector3): THREE.Vector3 { return checkout.checkoutStand(this, out); }

  // Case resting spots ("hand them over the counter"), lying flat, fanned
  // along the BAND TOP of the counter's right taper — right in front of the
  // right-side stand, with the bag on the island just beyond. Band top =
  // bandH 3.4 + 0.14 cap (see entrance/counter.ts); offsets follow the
  // band centreline nearest the bag.
  public checkoutCounterSpots(): CarryPose[] { return checkout.checkoutCounterSpots(this); }

  // Enter at the counter: with tapes, run the checkout flourish; empty-handed,
  // the clerk nudges you back to the shelves.
  public confirmCheckout(): boolean { return checkout.confirmCheckout(this); }

  // Checkout flourish done: emit the event, clear the stack (dispose + wipe
  // bb_carried), release the clerk, and return to the overview. What happens
  // AFTER the event (rental lockout, back room) is T23's job.
  public finishCheckout(ids: string[]): void { return checkout.finishCheckout(this, ids); }

  // Non-rental checkout exit ritual, driven per ACTIVE frame after the last
  // case lands in the bag (see confirmCheckout's onBagged). The customer
  // stands BESIDE the counter's right end (the -X exit side). Four beats:
  //   WRAP  [0.0–1.1s) — camera leaned in over the bag from the right-side
  //                      stand while the plastic settles around the cases.
  //   GRAB  [1.1–2.0s) — the soft-body pick-up: handle pinched and lifted,
  //                      the film drooping around the tapes; frozen mid-hold
  //                      so the drooped shape carries rigidly from here.
  //   SLIDE [2.0–3.0s) — ONE SECOND: the bag slides across the countertop —
  //                      up onto the band top, skating along it, then off
  //                      its RIGHT edge — into the customer's hands (a
  //                      surface-hugging slide, not a float over the front).
  //   WALK  [3.0–7.0s) — first-person carry: around the counter's right
  //                      end, up the exit corridor, through the vestibule
  //                      side door and out the exit leaf under the rising
  //                      whiteout (door chime at the turn), then
  //                      finishCheckout — which starts playback — as it lands.
  public updateCheckoutExit(now: number): void { return checkout.updateCheckoutExit(this, now); }

  // The checkout walk-out route (world, y=0): from the right-side stand,
  // around the counter's right shoulder, north up the exit walkway outside
  // the vestibule's left glass wall, in through the side door exiters use,
  // and out the front exit leaf. Built once per checkout at the WALK beat.
  public buildCheckoutExitPath(stand: THREE.Vector3): THREE.CatmullRomCurve3 { return checkout.buildCheckoutExitPath(this, stand); }

  /**
   * Harness hook (`--state bagexit`, elapsed ms via &x=): the non-rental
   * checkout exit ritual pinned at a chosen beat — wrap (~600) / grab
   * (~1600) / slide across + off the counter's right edge (~2400–2950) /
   * walk-around-the-counter carry-out (~3200–6900). Stages the settled bag
   * with two rented copies inside
   * (tapes "already bagged", so the carried stack is cleared), fast-forwards
   * the cloth through the pick-up droop where the beat needs it, then pins
   * `t` against the live clock exactly like debugStageLaunch.
   */
  public debugStageCheckoutExit(elapsedMs: number): boolean { return checkout.debugStageCheckoutExit(this, elapsedMs); }

  /**
   * Harness hook (`--state carry`): switch carry mode on and instantly take
   * the first `n` distinct stocked shelf titles — deterministic (map insertion
   * order), no flights, so the screenshot's held stack is stable.
   */
  public debugTakeCarried(n: number): boolean { return checkout.debugTakeCarried(this, n); }

  /**
   * Harness hook (`--state checkout`): the deterministic mid-checkout tableau —
   * standing at the counter, clerk parked at the register facing you, the
   * carried tapes lying on the counter band.
   */
  public debugStageCheckout(): boolean { return checkout.debugStageCheckout(this); }

  /**
   * Harness hook (`--state bag` / `--state baglift`): the checkout tableau
   * with `n` rental-case copies already dropped INTO the soft-body checkout
   * bag, the cloth fast-forwarded synchronously so the shot is deterministic
   * and settled — the "plastic deforms around the contents" audit. With
   * `lift` the pick-up is frozen mid-carry (handle pinched + raised, bottom
   * un-pinned) so the gravity droop can be photographed. Camera frames the
   * bag from the store side of the counter.
   */
  public debugStageBag(n: number, lift: boolean): boolean { return checkout.debugStageBag(this, n, lift); }

  /**
   * Harness hook (`--state launch`, elapsed ms via &x=): drive the ~12-second
   * play ritual deterministically up to `elapsedMs` and PIN it there so any
   * beat can be screenshotted: fly / slide / settle (0..4300), then the shared
   * checkout-exit walk (shove to the right edge / walk-around / grab /
   * carry-out; x−4300 maps onto bagexit's 0..7600). Inspects `title` (so the
   * hero case exists), starts the flourish with a no-op completion, then steps
   * both the choreography and the bag's soft-body sim at ~60 Hz so the
   * one-shots (drop into bag, wrap, freeze, shove, pick-up) fire in order and
   * the plastic settles — exactly as it would in real time. The freezes then
   * hold `elapsed` constant against the live rAF clock.
   */
  public debugStageLaunch(elapsedMs: number, title?: string): boolean {
    this.debugLaunchFreeze = null;
    // Pin the exit portion BEFORE stepping: updateCheckoutExit reads this as
    // its clock, so its whiteout/finish (both freeze-gated) stay off during
    // staging and its threshold one-shots fire on the first post-handoff step.
    this.debugCheckoutExitFreeze = elapsedMs > inspect.LAUNCH_HANDOFF_MS
      ? Math.min(elapsedMs - inspect.LAUNCH_HANDOFF_MS, 7599)
      : null;
    if (!this.jumpToTitle(title || 'Movies Title 3')) return false;
    let done = false;
    if (!this.startPlayAnimation(() => { done = true; })) return false;
    const anim = this.launchAnim;
    if (!anim) return false;
    const start = anim.startTime;
    const STEP = 1000 / 60;
    let t = 0;
    for (; t <= elapsedMs && !done && this.launchAnim; t += STEP) {
      const nowT = start + t;
      this.updateLaunchAnimation(nowT);
      this.entrance?.update(nowT); // advance the bag cloth like a real frame
    }
    // Pin the flourish here so the live animate() loop holds this beat instead
    // of marching it to completion before the screenshot lands.
    if (this.launchAnim) {
      this.debugLaunchFreeze = Math.min(elapsedMs, inspect.LAUNCH_HANDOFF_MS + 7599);
    }
    this.requestRender();
    return true;
  }

  /**
   * Harness hook (`--state return`, elapsed ms via &x=): stage the
   * drop-tapes-on-re-entry ritual at the RETURN TAPES HERE chute and PIN it at
   * `elapsedMs` (one case ≈ 0..1500ms, +800ms stagger per extra case; &flip=N
   * picks how many, default 2). Camera stands in the store a few feet off the
   * slot face — the entering customer's own view as they pass the counter
   * shoulder. Fails on themes without the chute (bb-2000s / hv-90s), which is
   * itself the test that the chute is 90s-only.
   */
  public debugStageReturnDrop(elapsedMs: number, n: number): boolean { return checkout.debugStageReturnDrop(this, elapsedMs, n); }

  /**
   * Arm the re-entry camera beat: hold a pose framing the RETURN TAPES HERE
   * chute (a step back along its face normal, eye height, looking at the
   * mouth) until the drop ritual finishes, then release to the normal glide
   * target. Near the entrance-overview vantage by construction — the chute
   * sits on the counter shoulder the vantage stands beside — so the hold and
   * the release both read as one small camera move, not a teleport. Call
   * AFTER the flow's own updateCameraTarget/enterOverview (which cancel it).
   */
  public beginReturnDropWatch(): void { return checkout.beginReturnDropWatch(this); }

  // ─── T23: rental mode ("hardcore mode") + the back room ─────────────────────

  public rentalDevTimerOn(): boolean { return rental.rentalDevTimerOn(this); }

  /**
   * Settings toggle ('Rental mode', live-apply). ON forces T22's carry &
   * checkout flow on and retunes the carry limit to the current weekday/
   * weekend rule. OFF releases any active lockout (escape hatch — the room
   * empties, bb_rental clears, and the store is reachable again).
   */
  public setRentalMode(enabled: boolean): void { return rental.setRentalMode(this, enabled); }

  // Rented ids -> Movie objects (order preserved; ids missing from the current
  // catalog are skipped — the library may have changed under a lockout).
  public resolveRentalMovies(ids: string[]): Movie[] { return rental.resolveRentalMovies(this, ids); }

  /**
   * Enter the lockout: build (or reuse) the detached pocket room, move the
   * camera to the couch, pause the store's ambient systems, and start the
   * single unlock timeout. `fade` runs the checkout fade-to-black beat;
   * boot-into-lockout enters cold with no fade.
   */
  public enterBackRoom(record: RentalRecord, opts: { fade: boolean }): void { return rental.enterBackRoom(this, record, opts); }

  /**
   * Leave the room for the store: dispose everything the room owns, clear the
   * rental record, resume the store's ambient systems, and land back at the
   * overview / library-select. Only reachable once the timer expired
   * (`rentalUnlocked`) — or forced by turning rental mode off.
   */
  public exitBackRoomToStore(force = false): void { return rental.exitBackRoomToStore(this, force); }

  // ── Unlock scheduling: ONE timeout + wake-event re-checks (no polling). ────
  // setTimeout drifts across suspend (the app sleeps for days), so the timer
  // is only a hint: every fire and every visibility/focus wake RE-CHECKS the
  // wall clock against the stored unlockAt and reschedules if still early.

  public scheduleRentalUnlock(): void { return rental.scheduleRentalUnlock(this); }

  public clearRentalUnlockSchedule(unhook = true): void { return rental.clearRentalUnlockSchedule(this, unhook); }

  public checkRentalClock(): void { return rental.checkRentalClock(this); }

  // ── Couch playback plumbing (owner: main.ts's launchVideoPlayback) ─────────

  /** Playback from the couch ended (or never started): the tape ejects. */
  public endBackRoomWatching(): void { return rental.endBackRoomWatching(this); }

  // ── Harness hooks ──────────────────────────────────────────────────────────

  /**
   * `--state backroom`: enter the room without running a checkout — the first
   * `n` stocked titles become tonight's rental. Uses an EPHEMERAL record (no
   * bb_rental write) so a debug shot never locks the next boot; persistence is
   * exercised via the harness's ?rentalBoot= injection instead.
   */
  public debugEnterBackRoom(n: number): boolean { return rental.debugEnterBackRoom(this, n); }

  /** `--state backroom-inspect --title <t>`: zoom a rented tape to the couch. */
  public backRoomInspect(title?: string): boolean { return rental.backRoomInspect(this, title); }

  /** Harness: put an inspected tape back down (the `backroom` state must show the room view). */
  public backRoomCloseInspect(): void { return rental.backRoomCloseInspect(this); }

  public loadAllArtworkForActiveLibrary() { return rental.loadAllArtworkForActiveLibrary(this); }

  // Browse navigation with T08 duplicate-skipping: smart-fill faces out multiple
  // adjacent copies of a hot title, and stepping through them one-by-one would feel
  // stuck (the info panel wouldn't change). The public move* wrappers advance past
  // any run of the same movie id so each keypress lands on a genuinely new title.
  // requestRender() here wakes the on-demand renderer (issue #24) for the keystroke.
  // (At the entrance overview navOverlayArrow above always consumes these —
  // the jump index owns ←/→ there, and raises itself if it somehow isn't up.)
  public moveLeft() { if (this.navOverlayArrow(-1)) return; this.requestRender(); if (this.claspCursorActive) this.exitClaspCursor(); if (this.mode === 'backroom') { this.backRoomMove(-1); return; } if (this.mode === 'checkout') { this.onCounterTerminal?.(); return; } this.moveSkippingDuplicates('left'); }
  public moveRight() { if (this.navOverlayArrow(1)) return; this.requestRender(); if (this.claspCursorActive) this.exitClaspCursor(); if (this.mode === 'backroom') { this.backRoomMove(1); return; } if (this.mode === 'checkout' && this.openTipJar()) return; this.moveSkippingDuplicates('right'); }

  /**
   * The counter's other side press: Left docks to the manager terminal, Right
   * picks up the tip card. Returns false (and does nothing) when the jar isn't
   * built, so the key falls through exactly as it did before it existed.
   */
  public openTipJar(): boolean { if (this.tipJars.length === 0) return false; openTipOverlay(); return true; }

  // T23: arrow keys in the back room — cycle the table tapes from the couch,
  // or flip the held case while inspecting (mirrors shelf-inspect's flip).
  public backRoomMove(dir: number): void { return rental.backRoomMove(this, dir); }

  public moveSkippingDuplicates(dir: 'left' | 'right') { return nav.moveSkippingDuplicates(this, dir); }

  public moveSkippingDuplicatesImpl(dir: 'left' | 'right') { return nav.moveSkippingDuplicatesImpl(this, dir); }

  // The unit holding a line's screen-LEFT end on the front side (equivalently
  // its screen-RIGHT end on the back side). StorePlan numbers each library's
  // units in screen order (visually-left first, mirrored runs included), so
  // this is simply the line's lowest-numbered unit.
  public lineStartUnit(libUnits: ShelvingUnit[], lineId: number): ShelvingUnit { return nav.lineStartUnit(this, libUnits, lineId); }

  // World XZ position of a library-select selectable, keyed by the same
  // selectedLibraryIdx encoding the rest of the code uses: 0..N-1 libraries
  // (their primary island centre), N = New Releases wall (representative point,
  // matching updateSelectionArrow), N+1.. = appended fixtures (game section,
  // four-sided displays) by their placement position. Returns
  // null when the position can't be derived so callers can fall back.
  public getSelectableWorldPos(idx: number): { x: number, z: number } | null { return nav.getSelectableWorldPos(this, idx); }

  // Old flat-index step, kept as the graceful fallback when the spatial basis or
  // the current selectable's world position can't be derived.
  public stepLibraryIndex(sign: number) { return nav.stepLibraryIndex(this, sign); }

  // Directional (spatial) library-select navigation. Rather than walking a flat
  // index list — which buried the appended fixtures (games, displays) at the far
  // RIGHT even when they sit physically to your LEFT — each arrow moves the
  // selection to the nearest selectable whose world-space bearing from the
  // CURRENT selection best matches the pressed direction, projected onto the
  // camera's ground-plane basis. axis 'x' = the viewer's right axis (Left/Right),
  // 'z' = the camera's forward/depth axis (Up = deeper into the view, Down =
  // toward the camera). Candidates opposite the pressed direction are ignored;
  // among the rest the smallest bearing angle wins, nearest distance breaks ties.
  // Shared candidate search for directional library-select nav: returns the
  // index of the best selectable lying in the pressed direction from the
  // current selection, or -1 when nothing lies that way (or the basis can't be
  // derived). PURE — mutates no state; used both by the mover and by the
  // reachability probe that drives the HUD arrows.
  public findLibrarySelectCandidate(axis: 'x' | 'z', sign: number): number { return nav.findLibrarySelectCandidate(this, axis, sign); }

  // Reachability probe for the HUD arrows: would pressing this direction move
  // the selection? Uses the SAME candidate logic as the mover, so the arrows
  // always agree with actual movement. Falls back to the flat-index bounds when
  // the spatial basis is unavailable (mirroring stepLibraryIndex's clamp).
  public canMoveLibrarySelect(axis: 'x' | 'z', sign: number): boolean { return nav.canMoveLibrarySelect(this, axis, sign); }

  public moveLibrarySelectDirectional(axis: 'x' | 'z', sign: number) { return nav.moveLibrarySelectDirectional(this, axis, sign); }

  public moveLeftInternal() { return nav.moveLeftInternal(this); }

  public moveRightInternal() { return nav.moveRightInternal(this); }

  public moveUp() { return nav.moveUp(this); }

  // Top shelf row index of the current browse selection: fixtures carry their
  // own shelf list; the New Releases wall is taller than aisle units.
  public browseMaxShelf(): number { return nav.browseMaxShelf(this); }

  // Up on the TOP shelf row goes "over the top" of the run: the selection
  // wraps to the opposite face of the SAME unit, landing on the slot
  // physically behind the current one (top row, mirrored column) — the
  // vertical sibling of the end-of-run side wraps in moveLeft/RightInternal.
  // Same clamps as those wraps (#45): the wall-mounted New Releases ribbon has
  // no far side, and an unstocked opposite face keeps today's no-op. The glide
  // runs at TOP_WRAP_GLIDE_LERP (animate() restores the default once settled)
  // so the longer swing around the shelving is easy to track.
  public wrapOverShelfTop() { return nav.wrapOverShelfTop(this); }

  // Up/down on the boxset's episode-list face moves the highlighted row.
  // Returns true when the input was consumed (series boxset, episodes face).
  public moveSeriesEpisodeSelection(dir: number): boolean { return nav.moveSeriesEpisodeSelection(this, dir); }

  // Up/down on the boxset's SEASON face (-X, heroFace 3) moves the highlighted
  // season. Selecting a season jumps heroEpisodeIdx to that season's first
  // episode so the derived currentSeason (and the panel highlight) follow.
  // Returns true when the input was consumed (series boxset, season face).
  public moveSeriesSeasonSelection(dir: number): boolean { return nav.moveSeriesSeasonSelection(this, dir); }

  public moveDown() { return nav.moveDown(this); }

  // Scene-driven overlays that own the arrow keys while up (like the clasp
  // cursor): the ceiling-TV peek (store-tv-peek.ts, ▲ at the index's Row 1)
  // and the JUMP INDEX (store-subnav.ts) — which at the entrance overview is
  // not an overlay at all but that view's own navigation, raised with it and
  // never taken down. State + delegating stubs only.
  public tvPeek: peek.TvPeekState | null = null;
  public subNav: subnav.SubNavState | null = null;
  /** Where the root index's marker was left, so backing out returns to it. */
  public subNavRootFocus: subnav.SubNavFocusMemory | null = null;
  public navOverlayArrow(dir: number): boolean { return nav.navOverlayArrow(this, dir); }
  public navOverlaySelect(): boolean { return nav.navOverlaySelect(this); }
  public navOverlayBack(): boolean { return nav.navOverlayBack(this); }
  public isSubNavOpen(): boolean { return nav.isSubNavOpen(this); }
  /** A scene-driven overlay (jump index / TV peek) owns the keys — see store-nav. */
  public isNavOverlayOpen(): boolean { return nav.isNavOverlayOpen(this); }
  public debugNavOverlay() { return nav.debugNavOverlay(this); }

  // Deprecated: the genre menu is gone (shelves are permanently sorted into the
  // classic wall categories). Kept as a no-op for old callers.
  public selectGenre(_idx: number) {}

  // Memoized: animate() asks for this every rendered frame, and building the
  // template string allocates. The selection fields are mutated from many
  // input paths, so rather than invalidating at every mutation site we compare
  // the raw inputs here and only rebuild the string when one changed.
  private activeSlotKeyCache = '';
  private activeSlotKeySrc: 'shelving' | 'fixture' | null = null;
  private activeSlotKeyFixture: string | null = null;
  private activeSlotKeyLib = -1;
  private activeSlotKeyUnit = -1;
  private activeSlotKeySide: 'front' | 'back' | 'left' | 'right' | '' = '';
  private activeSlotKeyShelf = -1;
  private activeSlotKeyCol = -1;

  public getActiveSlotKey(): string {
    const lookupLibIdx = this.selectedUnitIdx === BACK_WALL_UNIT_IDX ? 0 : this.selectedLibraryIdx;
    if (
      this.activeSlotKeySrc === this.selectedUnitSource &&
      this.activeSlotKeyFixture === this.selectedFixtureId &&
      this.activeSlotKeyLib === lookupLibIdx &&
      this.activeSlotKeyUnit === this.selectedUnitIdx &&
      this.activeSlotKeySide === this.selectedSide &&
      this.activeSlotKeyShelf === this.selectedShelf &&
      this.activeSlotKeyCol === this.selectedCol
    ) {
      return this.activeSlotKeyCache;
    }
    this.activeSlotKeySrc = this.selectedUnitSource;
    this.activeSlotKeyFixture = this.selectedFixtureId;
    this.activeSlotKeyLib = lookupLibIdx;
    this.activeSlotKeyUnit = this.selectedUnitIdx;
    this.activeSlotKeySide = this.selectedSide;
    this.activeSlotKeyShelf = this.selectedShelf;
    this.activeSlotKeyCol = this.selectedCol;
    this.activeSlotKeyCache = this.selectedUnitSource === 'fixture'
      ? `fixture_${this.selectedFixtureId}_side_${this.selectedSide}_shelf_${this.selectedShelf}_col_${this.selectedCol}`
      : `${lookupLibIdx}_${this.selectedUnitIdx}_${this.selectedSide}_${this.selectedShelf}_${this.selectedCol}`;
    return this.activeSlotKeyCache;
  }

  public getActiveAisleName(): string {
    if (this.mode === 'person-endcap' && this.personEndcap) {
      return this.personEndcap.person.toUpperCase();
    }
    // T21: at the entrance overview the locator names the focused destination
    // — the jump index's marker, which is what the player is pointing at.
    if (this.mode === 'overview') {
      return this.debugNavOverlay().subnav.selected
        || this.overviewCursors?.focusedLabel || 'STORE OVERVIEW';
    }
    if (this.selectedLibraryIdx === this.libraries.length) {
      return "NEW RELEASES";
    }
    if (this.selectedLibraryIdx > this.libraries.length) {
      const standIdx = this.selectedLibraryIdx - this.libraries.length - 1;
      const fixture = this.slottedFixtures[standIdx];
      const genreName = fixture ? (fixture.genre || (fixture.placement.options?.genre as string) || 'display').toUpperCase() : 'DISPLAY';
      return `${genreName} DISPLAY`;
    }
    const lib = this.libraries[this.selectedLibraryIdx];
    return lib ? lib.name.toUpperCase() : "MEDIA AISLE";
  }

  public getSelectedMovie(): Movie | null {
    // T23: the back room's focused rented tape (drives the HUD details panel).
    if (this.mode === 'backroom') return this.backRoom?.focusedMovie() ?? null;
    if (this.mode === 'person-endcap' && this.personEndcap) {
      return this.personEndcap.movies[this.personEndcap.selectedIdx] ?? null;
    }
    if (this.mode !== 'browse' && this.mode !== 'inspect') return null;
    const activeKey = this.getActiveSlotKey();
    const activeSlot = this.slotsByPosition.get(activeKey);
    return activeSlot ? activeSlot.movie : null;
  }

  // Called right after a live requestMovie() call succeeds so the case
  // restyles immediately, without a full scene rebuild: endcap candidates get
  // their REQUESTED tag (fixture markRequested), shelved cases — collection
  // gaps and inline discovery suggestions alike — get the poster restamp
  // (blue REQUEST label -> gold COMING SOON).
  public markDiscoveryRequested(movieId: string): void { return clerkFlow.markDiscoveryRequested(this, movieId); }

  /**
   * The one "order this title" flow, shared by every caller — main.ts's
   * request action, the clerk dialog's "Order it for me", and the harness's
   * demo input: POST the Jellyseerr request, and on success chime, flag the
   * in-memory Movie, and restyle its case (endcap tag or the shelved case's
   * gold COMING SOON restamp). For shelved cases — collection gaps and inline
   * discovery suggestions — the clerk also says her piece — "we don't have
   * any copies, it'll be in soon" — since confirming an empty shelf box is a
   * conversation, not a checkout; `clerkLine: false` mutes that for callers
   * already inside her dialog.
   */
  public async orderTitle(movie: Movie, opts: { clerkLine?: boolean } = {}): Promise<boolean> {
    if (typeof movie.tmdbId !== 'number') return false;
    const clerkLine = opts.clerkLine !== false && !!(movie.collectionGap || movie.discovery);
    const ok = await requestMovie(movie.tmdbId);
    if (ok) {
      movie.discoveryRequested = true;
      retailAudio.playCheckoutChime(); // same distinct confirm sound as a real checkout
      this.markDiscoveryRequested(movie.id);
      if (clerkLine) {
        showClerkToast(`Oh, we don't have any copies of "${movie.title}" yet, hon — I've put an order in. It should be in soon!`, 5200);
      }
    } else if (clerkLine) {
      showClerkToast(`We don't have "${movie.title}" in stock, hon — and I couldn't reach the distributor to order it. Give it another try in a minute?`, 5200);
    }
    return ok;
  }

  /**
   * "Not interested" on a missing-entry case (hold ▼, or X, in the inspect
   * view): persist the dismissal so no future boot synthesizes this title
   * again (jellyseerr's gap AND discovery builds both filter the dismissed-id
   * set, as does the staff-picks split), then drop the case from the store
   * live — back out of the inspect zoom, null its layout entries (so clasp
   * suggestions and box rebuilds skip it), pull it from the library list
   * (search, clerk pools) and from endcap stock, and hide every slot carrying
   * it. Any un-ordered not-in-stock case qualifies: a shelved collection gap
   * or inline discovery suggestion, or a FOR YOU endcap order candidate
   * (fixture stock — its spot just goes empty). Anything else returns false.
   */
  public dismissGapTitle(movie: Movie): boolean { return clerkFlow.dismissGapTitle(this, movie); }

  /** Whether the case being inspected right now can be crossed off (hold ▼). */
  public canDismissSelected(): boolean { return clerkFlow.canDismissSelectedTitle(this); }

  // T19: every candy row currently on the floor, across every candy-display
  // fixture (today there's one, at the register, but this stays correct if
  // a future layout adds more). Used to populate the "Snacks for tonight?"
  // checkout screen; empty array = no candy rack this trip = feature has
  // nothing to show, independent of the settings toggle.
  public getCandyRows(): CandyRow[] { return checkout.getCandyRows(this); }

  // T19: diegetic touch -- drop `count` simple candy-box props into the
  // checkout bag (mirrors the rented-movie-case drop in updateLaunchAnimation
  // below). dropIntoBag() never disposes what's handed to it (caller owns
  // the mesh's geometry/material lifetime), so this reuses one shared
  // geometry + a small fixed material palette rather than allocating fresh
  // GPU resources per box, keeping repeated orders from leaking.
  public candyBoxGeo: THREE.BufferGeometry | null = null;
  public candyBoxMats: THREE.MeshStandardMaterial[] | null = null;
  public dropCandyIntoBag(count: number): void { return checkout.dropCandyIntoBag(this, count); }

  public selectAction(): 'inspect' | 'play' | 'request' | 'launch' | 'genre-menu' | 'start-browsing' | 'take' | 'checkout' | null { if (this.navOverlaySelect()) return null; return inspect.selectAction(this); }

  // Play the "launch" flourish on the currently-inspected case, then invoke
  // onComplete (typically to start video playback). The rental copy (the
  // back box) spins three quick turns in ~1s while rising slightly, then flies
  // into the camera. Returns false (and runs onComplete immediately) if there is
  // no active slot to animate or one is already playing, so playback never stalls.
  public startPlayAnimation(onComplete: () => void): boolean { return inspect.startPlayAnimation(this, onComplete); }

  // Drive the launch flourish for one frame. Returns true while still animating.
  // A ~ten-second checkout ritual (user feedback: the bag beats must be slow
  // enough to savor — ~3s into the bag, ~3s grabbing/pulling it toward us,
  // ~3s walking out the door), in six beats:
  //   FLY    — the rental copy whirls up off the shelf and arcs to the
  //            FRONT of the counter, setting down where a customer would.
  //   SLIDE  — it slides back across the counter into the white rental bag's
  //            mouth, then is handed to the bag's soft-body sim to drop in.
  //   SETTLE — a long beat for the plastic to wrap around it (checkout chime).
  //   LAY    — the bag is tipped onto its side at the exit end of the counter,
  //            logo facing up.
  //   GRAB   — it's hoisted up off the counter and pulled in toward the
  //            customer, filling the frame.
  //   DRAG   — then carried off and out the exit door under a rising
  //            whiteout; only then does onComplete start playback.
  public updateLaunchAnimation(now: number): boolean { return inspect.updateLaunchAnimation(this, now); }

  // Drive the in-flight case for one frame: the hero mesh (real artwork) when
  // this slot is the bound hero, else the instanced rental back box. Either
  // way the slot's own instanced copies collapse to zero so only the flown case
  // shows. (Shared by the launch flourish's FLY + SLIDE beats.)
  public driveLaunchCase(
    slot: MovieSlot, x: number, y: number, z: number, rotX: number, rotY: number, scale: number,
  ): void { return inspect.driveLaunchCase(this, slot, x, y, z, rotX, rotY, scale); }

  public toggleFlip() { return inspect.toggleFlip(this); }

  public updateBackCoverHighlight() { return inspect.updateBackCoverHighlight(this); }

  // ─── Hero cases ─────────────────────────────────────────────────────────────
  // The instanced shelf meshes share one placeholder texture set, so up close
  // every rental copy would read "FIGHT CLUB". When a slot is selected its
  // two instances are collapsed and these ordinary meshes — dressed with the
  // movie's real poster, cast list and rental-copy metadata — take their place.

  public ensureHeroCases(movie: Movie, nrCase = false) { return inspect.ensureHeroCases(this, movie, nrCase); }

  // Series boxsets use the same retail front/back/spine set but swap the wide
  // +X/-X side panels for the episode-list and play-season canvases.
  public heroFrontMaterials(movie: Movie): THREE.Material[] { return inspect.heroFrontMaterials(this, movie); }

  // Lazily fetch the inspected series' episodes (once per series selection) and
  // keep both side panels redrawn. The shared panel canvases are redrawn in
  // place — no allocation per navigation step.
  public ensureSeriesEpisodes(movie: Movie) { return inspect.ensureSeriesEpisodes(this, movie); }

  public refreshSeriesPanels(movie: Movie) { return inspect.refreshSeriesPanels(this, movie); }

  /** The episode the inspected boxset's current face designates: the one
   *  highlighted on the back-cover selector (face 2), or the highlighted
   *  season's first episode on the season panel (face 3) — selecting a season
   *  parks heroEpisodeIdx on that episode (see moveSeriesSeasonSelection), so
   *  both faces read the same index. Any other face designates nothing. */
  public getSelectedEpisode(): Episode | null { return inspect.getSelectedEpisode(this); }

  /** The ordered episode list loaded for `movieId`, if that series is the one
   *  currently inspected. Lets playback build its up-next queue without a
   *  second round-trip when the boxset already fetched the list. */
  public getSeriesEpisodes(movieId: string): Episode[] | null { return inspect.getSeriesEpisodes(this, movieId); }

  // Rotate the inspected series boxset dir (+1/-1) quarter-turns through
  // front -> episodes -> back -> play-season. Mirrors toggleFlip's contract so
  // the existing back-cover-region machinery keeps working on face 2.
  public rotateHeroFace(dir: number) { return inspect.rotateHeroFace(this, dir); }

  public resetHeroFace() { return inspect.resetHeroFace(this); }

  public hideHeroCases() { return inspect.hideHeroCases(this); }

  // ─── Recommendation clasps ──────────────────────────────────────────────────
  // The small blue plaques on the shelf lip (fixtures/shelf-clasp.ts). They are
  // a call button: click one and the clerk walks over and recommends something
  // from the genre that clasp speaks for. A library big enough to be shelved by
  // category gets one clasp per genre; a small one gets a single clasp and the
  // clerk picks from the whole library.

  public shelfClasps = new ShelfClasps();
  /** Bumped per call so a slow walk can't deliver advice the player cancelled. */
  public claspCallId = 0;

  /** Test hook: how many clasps the store built. */
  public get claspCount(): number { return this.shelfClasps.count; }

  /**
   * True while the BROWSE cursor is parked on a clasp rather than a case. The
   * clasp sits one step above the top shelf row, so Up off the top row lands
   * here and Up again carries on over the aisle top as it always did.
   */
  public claspCursorActive = false;
  /**
   * Which input path lit the current clasp. Without this the walk-mode frame
   * hook cleared the pointer's hover highlight on the very next frame, so
   * hovering appeared to do nothing at all.
   */
  public claspFocusSource: 'hover' | 'walk' | 'cursor' | null = null;

  /** Clasp adjacent to the browse cursor, if this shelf run has one. */
  public claspForCursor(): THREE.Mesh | null { return clerkFlow.claspForCursor(this); }

  /** Park the browse cursor on the clasp above the current run. */
  public enterClaspCursor(): boolean { return clerkFlow.enterClaspCursor(this); }

  /** Leave the clasp cursor (moved away, backed out, or acted on it). */
  public exitClaspCursor(): void { return clerkFlow.exitClaspCursor(this); }

  /**
   * What a clasp is "about", for prompts and the dialog lead-in: its genre
   * section, or the library's own name for a whole-library clasp (small,
   * uncategorized library) — either way the wording names where you are.
   */
  public claspSectionName(target: { category: string | null; libraryIdx: number } | null): string | null { return clerkFlow.claspSectionName(this, target); }

  public claspPromptText(target: { category: string | null; libraryIdx: number } | null): string { return clerkFlow.claspPromptText(this, target); }

  /** Act on whichever clasp is currently lit, from any input path. */
  public activateFocusedClasp(): boolean { return clerkFlow.activateFocusedClasp(this); }

  /**
   * Walk-mode frame hook: light up the clasp you're standing at and offer the
   * key prompt. Kept off the browse path — there the cursor owns focus, and
   * two things fighting over which clasp is lit is exactly the bug that makes
   * an affordance feel broken.
   */
  public updateWalkClaspFocus(): void { return clerkFlow.updateWalkClaspFocus(this); }
  public _claspLook = new THREE.Vector3();

  /** 'E' while standing at a clasp — the same verb as talking to the clerk. */
  private onClaspKey = (e: KeyboardEvent) => {
    if (e.key !== 'e' && e.key !== 'E') return;
    if (keyboardOwnedByControl()) return;
    if (!this.isWalkAroundMode || this.claspCursorActive) return;
    if (!this.shelfClasps.focusedMesh) return;
    e.preventDefault();
    e.stopPropagation();
    this.activateFocusedClasp();
  };

  /** Hover: light the clasp under the pointer so it reads as pressable. */
  private onClaspPointerMove = (e: PointerEvent) => {
    if (this.isWalkAroundMode || this.claspCursorActive) return;
    if (this.shelfClasps.count === 0) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._raycaster.setFromCamera(
      this._mouse.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    const hits = this._raycaster.intersectObjects(this.shelfClasps.pickables, false);
    const mesh = (hits[0]?.object as THREE.Mesh) ?? null;
    if (mesh === this.shelfClasps.focusedMesh) return;
    this.requestRender();
    this.claspFocusSource = mesh ? 'hover' : null;
    const target = mesh ? this.shelfClasps.targetFor(mesh) : null;
    this.shelfClasps.setFocused(mesh, mesh ? this.claspPromptText(target) : null, 'CLICK');
  };

  /**
   * First clasp a player could actually stand at, with that standing spot.
   * clasps[0] can face a wall gap or the stepped-corner notch — walkable in
   * one boot's layout and clamped away in another — and a teleport to a
   * clamped spot silently resolves to the front corner, which made the clasp
   * verification screenshots frame nothing. Reachable = the walk constraints
   * leave the stand point where it is.
   */
  public firstReachableClasp(): { target: ClaspTarget; stand: THREE.Vector3 } | null { return clerkFlow.firstReachableClasp(this); }

  /**
   * Test hook: stand in front of the first reachable clasp looking at it, and
   * return what it speaks for. Clasps are sparse by design — one per genre,
   * or one per library when the library is too small to be shelved by
   * category — so a screenshot can't rely on wandering into one.
   */
  public focusFirstClasp(): { category: string | null; libraryIdx: number } | null { return clerkFlow.focusFirstClasp(this); }

  /**
   * Diagnostic: exercise every clasp input path and report which ones can see
   * a clasp. Cheaper than guessing which of four affordances is broken.
   */
  public debugClaspProbe(): Record<string, unknown> { return clerkFlow.debugClaspProbe(this); }

  /** Test hook: fire a clasp call without a pointer event. */
  public debugCallClerkToFirstClasp(): boolean { return clerkFlow.debugCallClerkToFirstClasp(this); }

  /**
   * Test hook (`clerktalk` checkpoint): stand the player at the first clasp's
   * section, park the clerk beside them facing them, and open the walk-up
   * "What do you recommend?" — the answer must be scoped to the section the
   * player is standing in (localRecommendPool), with no clasp pressed.
   */
  public debugClerkTalkHere(rolls = 0): boolean { return clerkFlow.debugClerkTalkHere(this, rolls); }


  /**
   * Summon the clerk to a clasp. She walks there first and only then says
   * anything — the whole point of the fixture is that you get a person, not a
   * popup, so delivering the line instantly from across the store would waste
   * the one bit of theatre it buys.
   */
  public callClerkToClasp(target: ClaspTarget) { return clerkFlow.callClerkToClasp(this, target); }

  /**
   * What she'd suggest at this clasp. A genre clasp narrows the pool to that
   * category; a whole-library clasp (small, uncategorized library) uses
   * everything. Titles that aren't really stock — requests, collection gaps,
   * games — are never suggested, since she can't hand you one.
   *
   * The pool is read off the LAYOUT (the sections actually wearing this
   * label), not re-derived from each title's genre: shelving files titles by
   * collection-majority vote plus the viability cascade
   * (StorePlan.buildLibraryLayouts), so a raw storeCategory() match
   * disagreed with the shelf — at a GENERAL section (all folded-in titles) it
   * matched nothing and she'd recommend from other aisles.
   */
  public claspPool(target: ClaspTarget): Movie[] { return clerkFlow.claspPool(this, target); }

  // Inverted index over everything you own, for the why-cascade behind the
  // clerk's Jellyseerr suggestions. Lazy: libraries are fixed at construction.
  public clerkLibraryIndex: LibraryIndex | null = null;

  /**
   * What Jellyseerr could get you at this clasp — titles NOT on the shelf:
   * collection gaps standing in the section (films you're missing from sets
   * you own) plus trending discovery titles matching its genre. Each carries
   * the strongest true reason recommend-why.ts can print; trending titles the
   * cascade can't tie to the library rank after everything that earned one.
   */
  public claspSuggestions(target: ClaspTarget): ClerkSuggestion[] { return clerkFlow.claspSuggestions(this, target); }

  /**
   * The section the player is standing in, as a recommendation pool — the
   * walk-up "What do you recommend?" answer should depend on where you ARE,
   * exactly like the clasp's does. Clasps sit one per signboard section, so
   * the nearest one to your feet IS your section; out of range of any (the
   * checkout, the walkway) returns null and the caller uses everything.
   */
  public localRecommendPool(): { movies: Movie[]; label: string | null; suggestions: ClerkSuggestion[] } | null { return clerkFlow.localRecommendPool(this); }

  // ─── Person endcap ──────────────────────────────────────────────────────────
  // Tapping a cast/crew name on a back cover builds a freestanding endcap in the
  // central walkway stocked with every title in the collection featuring that
  // person, and walks the camera over to it.

  public showPersonEndcap(person: string, kind: 'actor' | 'director') { return clerkFlow.showPersonEndcap(this, person, kind); }

  public updateEndcapSelection() { return clerkFlow.updateEndcapSelection(this); }

  public moveEndcapSelection(dCol: number, dRow: number) { return clerkFlow.moveEndcapSelection(this, dCol, dRow); }

  // Tear the endcap down; optionally restore the browse/inspect state we came from.
  public closePersonEndcap(restore: boolean) { return clerkFlow.closePersonEndcap(this, restore); }

  // ENTER on an endcap case: walk to that movie's real slot and inspect it there.
  public jumpFromEndcapToMovie(): 'inspect' | null { return clerkFlow.jumpFromEndcapToMovie(this); }

  // ─── Test/agent checkpoints (driven by harness.ts's ?state= params) ────────

  // Teleport selection straight to a title's shelf slot and enter inspect mode
  // (optionally flipped to the back cover), skipping the whole library-select ->
  // browse -> arrow-key walk. `query` matches a movie id exactly or a title
  // case-insensitively as a substring. Mirrors jumpFromEndcapToMovie()'s state
  // handoff. Returns false when no visible aisle/fixture slot matches.
  public jumpToTitle(query: string, opts: { flip?: boolean } = {}): boolean { return cam.jumpToTitle(this, query, opts); }

  // Harness hooks for --state wrapup (src/harness.ts): park the browse
  // selection on the TOP shelf row (so the next moveUp() exercises the
  // over-the-top wrap), and expose the selection + active glide factor so the
  // checkpoint can assert both the landing face and the slower glide.
  public debugSelectTopShelf(): boolean { return cam.debugSelectTopShelf(this); }

  public debugBrowseSelection(): { side: string; shelf: number; col: number; unitIdx: number; glideLerp: number } { return cam.debugBrowseSelection(this); }

  // Jump the camera lerp straight to its target. Checkpoints/screenshots only:
  // on a software-GL harness run a frame can take seconds, so gliding to the
  // target is pure wasted wall-clock.
  public snapCamera(): void { return cam.snapCamera(this); }

  // Enter walk mode standing at an exact spot with an exact heading, so a
  // screenshot can verify a specific piece of the store (a window poster, a
  // fixture) without WASD-walking there. yaw/pitch in degrees; yaw 0 faces the
  // back wall (-Z), 180 faces the entrance. Same yaw/pitch plumbing as
  // toggleWalkAround()'s entry branch.
  // `free` (harness `?fly=1` / `npm run shot -- --fly 1`) suspends the walk
  // clamps — constrainWalkPosition()'s bounds AND the 5.5ft eye height — so
  // verification shots can frame the whole exterior (facade elevations, side
  // walls) from outside the walkable envelope. Never set from gameplay input;
  // any manual walk toggle clears it.
  public teleportWalk(x: number, z: number, yawDeg = 0, pitchDeg = 0, y = 5.5, free = false): void { return cam.teleportWalk(this, x, z, yawDeg, pitchDeg, y, free); }

  /**
   * Harness hook (see the `clerk` checkpoint in src/harness.ts): freeze the
   * clerk standing at a fixed spot + world heading so her sprite art can be
   * screenshotted from a controlled angle. No-op in normal play.
   */
  public debugPoseClerk(x: number, z: number, headingDeg: number, anim?: string): void { return clerkFlow.debugPoseClerk(this, x, z, headingDeg, anim); }

  /**
   * Harness hook (`?idleAgo=` in src/harness.ts): true once the clerk's
   * sleep/wake fade has settled at the state the input clock currently calls
   * for, so a screenshot after backdating the clock can wait signal-based
   * instead of sleeping. Derives the target from the clock (not clerkAsleep,
   * which animate() only refreshes next rAF) so it can't race the backdate.
   */
  public debugClerkFadeSettled(): boolean { return clerkFlow.debugClerkFadeSettled(this); }

  /**
   * Harness hook (`clerkpath` checkpoint): fast-forward the clerk's real
   * roaming brain `seconds` of simulated time and audit every step against
   * the nav footprints. Fails when she ever intrudes into a footprint (walked
   * through a shelf/fixture/counter), never stocked a shelf, or never worked
   * a terminal — i.e. it verifies the actual behavior contract, not one
   * frame. Result also stashed on window.__clerkAudit for inspection.
   */
  public debugClerkPathAudit(seconds = 420): boolean { return clerkFlow.debugClerkPathAudit(this, seconds); }

  // Feedback pin (F8, see main.ts): a user who can't read code flags a visual
  // bug in-app. Captures the exact replayable view PLUS a screenshot in one
  // shot, before the camera can move. preserveDrawingBuffer is off, so the
  // canvas must be forced to paint and read back in the same tick -- no
  // waiting on the next animate() frame. The walk string is the inverse of
  // teleportWalk() above: extract a 'YXZ' Euler from the camera's current
  // orientation instead of setting rotation from yaw/pitch.
  public captureFeedbackSnapshot(): { walk: string; png: string } {
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    const yawDeg = (euler.y * 180) / Math.PI;
    const pitchDeg = (euler.x * 180) / Math.PI;
    const pos = this.camera.position;
    const walk = `${pos.x.toFixed(2)},${pos.z.toFixed(2)},${yawDeg.toFixed(2)},${pitchDeg.toFixed(2)},${pos.y.toFixed(2)}`;
    const png = this.renderer.domElement.toDataURL('image/png');
    return { walk, png };
  }

  // ─── Exit-door whiteout / entrance return ──────────────────────────────────

  public whiteoutEl(): HTMLElement | null {
    return document.getElementById('whiteout-overlay');
  }

  // Kick off (once) the fetch+decode of the recorded door-bell sample. Decode
  // works on a suspended context, so by the time the doors are passed again
  // the real recording is ready.
  private loadDoorBell(ctx: AudioContext): Promise<void> {
    if (!this.doorBellLoad) {
      this.doorBellLoad = fetch(assetUrl('sounds/door_bell.mp3'))
        .then((r) => { if (!r.ok) throw new Error(`door_bell.mp3 HTTP ${r.status}`); return r.arrayBuffer(); })
        .then((ab) => ctx.decodeAudioData(ab))
        .then((buf) => { this.doorBellBuffer = buf; })
        .catch(() => { /* sample unavailable — doors stay silent; next pass retries */ });
    }
    return this.doorBellLoad;
  }

  // Idle-governor hook (same contract as retailAudio.suspendForIdle): park the
  // door-chime AudioContext so its audio thread stops burning CPU across days
  // of screensaver/occlusion. No matching resume hook is needed —
  // playDoorChime() already calls ctx.resume() before every ring, so the next
  // door pass wakes it transparently.
  public suspendChimeForIdle() {
    try {
      if (this.chimeCtx && this.chimeCtx.state === 'running') {
        this.chimeCtx.suspend().catch(() => {});
      }
    } catch { /* no WebAudio here — nothing to park */ }
  }

  // Shop-door bell — the recorded bell-ring sample (public/sounds/door_bell.mp3),
  // played whenever the entrance or exit doors are passed. No synth fallback:
  // if the sample has not loaded yet the pass retries the fetch and rings as
  // soon as it lands; if WebAudio is unavailable the doors open silently.
  public playDoorChime() {
    try {
      if (!this.chimeCtx) this.chimeCtx = new AudioContext();
      const ctx = this.chimeCtx;
      ctx.resume().catch(() => {});
      if (!this.doorBellBuffer) {
        this.doorBellLoad = null; // a settled-but-failed load retries here
        this.loadDoorBell(ctx).then(() => { if (this.doorBellBuffer) this.playDoorChime(); });
        return;
      }
      // Background storefront cue — it must sit under movie audio.
      const gain = ctx.createGain();
      gain.gain.value = 0.35;
      gain.connect(ctx.destination);
      const src = ctx.createBufferSource();
      src.buffer = this.doorBellBuffer;
      src.connect(gain);
      src.start(ctx.currentTime + 0.02);
    } catch {
      // Audio unavailable — the doors open silently.
    }
  }

  // Called by main.ts when playback ends: fade in from white standing just
  // inside the entrance doors, back in library-select so shelves can be picked.
  public returnToEntrance() {
    this.requestRender();
    const el = this.whiteoutEl();
    if (el) {
      el.classList.add('instant');
      el.classList.add('active');
    }
    this.launchAnim = null;
    // A launch's handed-off exit walk (or any stale exit state) ends with the
    // visit — otherwise checkoutRunning wedges the next carry checkout closed.
    this.checkoutExit = null;
    this.checkoutRunning = false;
    this.entrance?.hideBag();
    this.hideHeroCases();
    if (this.personEndcap) this.closePersonEndcap(false);
    this.walkReturnPose = null; // playback/checkout ended this visit — the old standing spot is gone

    this.mode = 'library-select';
    this.isFlipped = false; this.heroSpine = false;
    this.isBrowsingNewReleasesDirectly = false;
    if (this.selectedLibraryIdx > this.libraries.length) this.selectedLibraryIdx = 0;

    // Snap the camera to just inside the entrance chamber, looking down the
    // store, then let the normal library-select framing glide it in.
    const entrX = 11.0 + this.storefrontSpec.doorWidth / 2; // entrance leaf X (right leaf of the center pair, see entrance/index.ts)
    this.currentCameraPos.set(entrX, 5.5, 8.2);
    this.currentLookAt.set(11.0, 4.0, -8.0);
    this.camera.position.copy(this.currentCameraPos);
    this.camera.lookAt(this.currentLookAt);

    // T21: re-entering through the doors lands at the entrance overview (the
    // beginning browsing point) when enabled; the camera still starts snapped
    // to the doorway above, so it glides the last step to the vantage.
    if (this.overviewStart) {
      this.enterOverview();
    } else {
      if (this.onModeChange) this.onModeChange(this.mode);
      this.updateCameraTarget();
    }

    // A new visit: the outside light moves (and may flip day/night) every time
    // you come back in through the doors, and the entrance chime greets you.
    this.outdoor.rerollOutsideLighting();
    this.exterior?.setOutsideMode(this.outdoor.outsideMode);
    this.playDoorChime();
    this.onConsoleLog("[System] Welcome back — returned through the entrance.", "system");

    // Walking back in with last night's tape(s): drop them into the counter's
    // RETURN TAPES HERE chute (bb-90s only) — a short, non-blocking diegetic
    // beat that starts just after the fade-in; the player can move throughout.
    const returned = this.pendingReturnDrop;
    this.pendingReturnDrop = [];
    // Anything still in hand walks back in with you and goes down the chute too.
    for (const m of this.collectHeldTapesForReturn()) {
      if (!returned.some((r) => r.id === m.id)) returned.push(m);
    }
    if (returned.length > 0 && this.entrance?.hasReturnSlot()) {
      this.entrance.dropReturnedTapes(returned, performance.now() + 500);
      this.beginReturnDropWatch();
      this.onConsoleLog(`[System] Dropped ${returned.length} tape(s) in the return slot.`, 'system');
    }

    // Two frames so the instant-opaque state paints before the fade-out begins.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (el) {
          el.classList.remove('instant');
          el.classList.remove('active');
        }
      });
    });
  }

  public backAction(): boolean {
    // Browse overlays first (TV peek / sub-nav index): they close back INTO
    // browse, so the escape clamp below still bottoms out at the same floor.
    if (this.navOverlayBack()) return true;
    if (this.claspCursorActive) {
      this.exitClaspCursor();
      return true;
    }
    this.requestRender();
    // T23: in the back room, Escape closes the inspected tape; from the room
    // view it heads out through the (unlocked) door — or bounces off it with
    // the due-back reminder while the lockout is still running. Always
    // handled, so the store (and the exit-confirm dialog) stays unreachable.
    if (this.mode === 'backroom') {
      const room = this.backRoom;
      if (!room) return true;
      if (room.state === 'inspect') {
        room.closeInspect();
        this.updateCameraTarget();
        return true;
      }
      if (room.state !== 'view') return true; // mid-insert/watch — ignore
      if (this.rentalUnlocked) {
        this.exitBackRoomToStore();
      } else if (this.rentalRecord) {
        retailAudio.playDenyBuzz();
        this.onConsoleLog(`[System] The door's locked — tapes are due back ${formatUnlockLabel(this.rentalRecord)}.`, 'system');
      }
      return true;
    }
    // T22: leave the checkout counter (keeping the carried tapes) — back to
    // the overview (or classic library-select). Ignored mid-flourish.
    if (this.mode === 'checkout') {
      if (this.checkoutRunning) return true;
      this.clerk?.releaseFromRegister();
      if (this.overviewStart) {
        this.enterOverview();
      } else {
        this.mode = 'library-select';
        if (this.onModeChange) this.onModeChange(this.mode);
        this.updateCameraTarget();
      }
      this.onConsoleLog('[System] Left the checkout counter.', 'system');
      return true;
    }
    // T21: back out of the entrance overview to the classic library-select view.
    // With overviewStart on, the overview IS the bottom of the back stack: the
    // library-select framing is the pulled-back security-cam angle, nothing
    // routes back out of it (backAction has no library-select case, so it falls
    // through to `return false`), and every other entry point goes to the
    // overview instead. Escaping past it just stranded you in the seccam view.
    if (this.mode === 'overview') {
      if (this.overviewStart) return true; // already at the floor — swallow it
      this.hideOverviewVisuals();
      this.mode = 'library-select';
      if (this.onModeChange) this.onModeChange(this.mode);
      this.updateCameraTarget();
      this.onConsoleLog("[System] Returned to library selection.", "system");
      return true;
    }
    if (this.mode === 'inspect') {
      // Entered by clicking a case in walk mode: Back puts the case down and
      // returns to the exact standing pose. The pose is one-shot — any other
      // way out of this inspect (endcap detour below, playing the movie)
      // drops it so a later, unrelated inspect can't teleport to a stale spot.
      const walkPose = this.walkReturnPose;
      this.walkReturnPose = null;
      if (walkPose && !this.personEndcap) {
        this.isFlipped = false; this.heroSpine = false;
        this.selectedBackCoverRegionIdx = -1;
        this.highlightedBackRegionName = '';
        this.resetHeroFace();
        this.teleportWalk(
          walkPose.x, walkPose.z,
          (walkPose.yaw * 180) / Math.PI, (walkPose.pitch * 180) / Math.PI,
        );
        this.savedModeBeforeWalk = walkPose.savedMode;
        this.onConsoleLog("[System] Put the case back — walking again.", "system");
        return true;
      }
      if (this.personEndcap) {
        this.hideHeroCases();
        this.mode = 'person-endcap';
        if (this.onModeChange) this.onModeChange(this.mode);
        this.isFlipped = false; this.heroSpine = false;
        this.selectedBackCoverRegionIdx = -1;
        this.highlightedBackRegionName = '';
        this.resetHeroFace();
        this.updateEndcapSelection();
        this.updateCameraTarget();
        if (this.onSelectionChange) this.onSelectionChange(this.getSelectedMovie());
        this.onConsoleLog("[System] Returned to starring endcap.", "system");
        return true;
      }
      this.mode = 'browse';
      if (this.onModeChange) this.onModeChange(this.mode);
      this.isFlipped = false; this.heroSpine = false;
      this.selectedBackCoverRegionIdx = -1;
      this.highlightedBackRegionName = '';
      this.resetHeroFace();
      this.updateCameraTarget();
      this.onConsoleLog("[System] Returned to shelf browse.", "system");
      return true;
    } else if (this.mode === 'browse') {
      if (this.selectedUnitSource === 'fixture') {
        // Same treatment its New Releases sibling below already had: with the
        // overview start on, back out to the overview (which now carries a
        // cursor for this fixture) rather than the seccam library-select view.
        if (this.overviewStart) {
          this.enterOverview();
          return true;
        }
        const standIdx = this.slottedFixtures.findIndex(f => f.placement.id === this.selectedFixtureId);
        this.mode = 'library-select';
        this.selectedLibraryIdx = this.libraries.length + 1 + standIdx;
        if (this.onModeChange) this.onModeChange(this.mode);
        this.updateCameraTarget();
        this.onConsoleLog("[System] Returned to library selection.", "system");
        return true;
      }

      if (this.isBrowsingNewReleasesDirectly) {
        this.isBrowsingNewReleasesDirectly = false;
        // T21: with the overview start on, backing out of a shelf returns to
        // the entrance overview (the NEW RELEASES cursor lives there too).
        if (this.overviewStart) {
          this.enterOverview();
          return true;
        }
        this.mode = 'library-select';
        this.selectedLibraryIdx = this.libraries.length; // Restore New Releases highlight
        if (this.onModeChange) this.onModeChange(this.mode);
        this.updateCameraTarget();
        this.onConsoleLog("[System] Returned to library selection.", "system");
        return true;
      }

      // T21: backing out of a shelf returns to the entrance overview — never
      // the adjacent aisle — when the overview start is enabled.
      if (this.overviewStart) {
        this.enterOverview();
        return true;
      }

      // Return to library selection (the genre menu is gone — shelves are
      // permanently sorted into the classic wall categories)
      this.mode = 'library-select';
      if (this.onModeChange) this.onModeChange(this.mode);
      if (this.onGenreMenuUpdate) {
        this.onGenreMenuUpdate("", [], 0, false);
      }
      this.updateCameraTarget();
      this.onConsoleLog("[System] Returned to library selection.", "system");
      return true;
    } else if (this.mode === 'person-endcap') {
      this.closePersonEndcap(true);
      return true;
    }
    return false;
  }

  // Dynamic resolution scaling (issue #27): once per second, using a window
  // that only accumulates ACTIVE-tier frames, step resScale down when fps is
  // sagging or up when it's comfortably healthy. Uses its own counters on
  // purpose — a shared rendered-frame count would fold in VIDEO-tier's
  // throttled ~24fps cadence, which would be misread as a slow GPU and
  // permanently pin resScale to the floor. IDLE resets/snaps to 1.0 in the
  // caller before this is ever reached.
  private updateDynamicResolution(time: number, active: boolean) {
    if (!active) {
      // VIDEO tier: don't let its throttled pacing feed the window; just keep
      // the clock from accumulating stale elapsed time across the gap.
      this.resScaleFrames = 0;
      this.resScaleWindowStart = time;
      return;
    }
    // Texture uploads are not a GPU verdict. The boot wave (and any streaming
    // burst) hands this window frames pinned at 0.2-30fps by decode + upload
    // work whose cost has nothing to do with how many pixels we are shading —
    // the scaler read that as "slow GPU" and walked resolution down to the 0.70
    // floor on a machine that then held a locked 60. It only climbs back at
    // 0.05 per two good seconds, and cannot climb at all in the VIDEO tier
    // (the early return above), so one boot could soften the store for the rest
    // of the session. Skip the window entirely while the queue is draining.
    if (pendingTextureUploads() > 0) {
      this.resScaleFrames = 0;
      this.resScaleGoodStreak = 0;
      this.resScaleWindowStart = time;
      return;
    }
    this.resScaleFrames++;
    const elapsed = time - this.resScaleWindowStart;
    if (elapsed < 1000) return;

    const fps = (this.resScaleFrames * 1000) / elapsed;
    // Thresholds scale with the display: the classic 50/58 pair was 60Hz
    // tuning (0.83×/0.97× of target); a 120Hz display gets 100/116. Measured
    // on the RX 9070 XT: motion-frame cost is mostly pixel-independent (AO
    // recompute + draw-call submission), so a tighter band just parks scale
    // at the floor for no fps — 0.83× is the right down-threshold here too.
    //
    // Bounded by SCALER_TARGET_FPS_CAP: that same pixel-independence means a
    // GPU short of the panel's refresh cannot buy the difference with
    // resolution, so scaling the thresholds all the way up with an uncapped
    // 144/165Hz display parks resScale at the floor permanently. See
    // computeScalerTargetFps.
    const scalerTarget = computeScalerTargetFps(this.targetFps);
    const downAt = scalerTarget * 0.83;
    const upAt = scalerTarget * 0.97;
    if (fps < downAt && this.resScale > this.resScaleMin) {
      this.resScale = Math.max(this.resScaleMin, round2(this.resScale - StoreScene.RES_SCALE_STEP));
      this.resScaleGoodStreak = 0;
      this.applyRenderResolution();
      console.log(`[resScale] ${fps.toFixed(1)}fps < ${downAt.toFixed(0)} — down to ${this.resScale}`);
    } else if (fps > upAt && this.resScale < StoreScene.RES_SCALE_MAX) {
      this.resScaleGoodStreak++;
      // Require fps to hold above the up-threshold for 2 consecutive seconds
      // before stepping up, so a single lucky frame doesn't cause up/down
      // oscillation at the edge.
      if (this.resScaleGoodStreak >= 2) {
        this.resScale = Math.min(StoreScene.RES_SCALE_MAX, round2(this.resScale + StoreScene.RES_SCALE_STEP));
        this.resScaleGoodStreak = 0;
        this.applyRenderResolution();
        console.log(`[resScale] ${fps.toFixed(1)}fps > ${upAt.toFixed(0)} — up to ${this.resScale}`);
      }
    } else {
      this.resScaleGoodStreak = 0;
    }

    this.resScaleFrames = 0;
    this.resScaleWindowStart = time;
  }

  // Render-on-demand wake signal (issue #24): force the composer to run for the
  // next few frames. Call this from any code path that changes what's on screen
  // outside animate()'s own bookkeeping — input handlers, mode/settings changes,
  // resize, video playback resume, or the puppeteer harness before a screenshot —
  // so the picture updates on the very next frame instead of waiting for the ~1s
  // idle heartbeat. A few frames (not one) covers multi-step reactions like a
  // click that both changes selection and kicks off a camera move.
  public requestRender() {
    // Software GL: one composite per wake, not three — poster-stream wakes
    // fire this continuously during boot, and each extra frame costs ~0.5-1s
    // of CPU. Multi-frame needs (lerps, fades) hold ACTIVE via their own
    // signals, so the extra safety frames only ever re-drew a settled scene.
    this.forceRenderFrames = this.softwareGL ? 1 : 3;
    // Doubles as the "something is happening" timestamp the one-shot stocked
    // rebake defers on (every input path and streaming wake lands here) — see
    // the pendingStockedRebake block in animate().
    this.lastRenderRequestTime = performance.now();
  }

  /**
   * Hold the loop awake for a few more composites WITHOUT claiming a user did
   * something. requestRender() also stamps lastRenderRequestTime, which is the
   * "is the store idle?" clock the deferred stocked rebake waits on — a
   * background drain that kept stamping it would starve that rebake forever.
   * This is the wake for work the renderer owes itself; see the mirror drain in
   * store-mirrors.ts.
   */
  public holdRenderFrames(frames: number) {
    this.forceRenderFrames = Math.max(this.forceRenderFrames, frames);
  }

  // Programmatic perf snapshot (issue #16) — kept as tooling/console API now
  // that the on-screen HUD is gone. Surfaces the current render-on-demand
  // tier, whether the rAF loop is live, a monotonic rendered-frame counter
  // (verifies the loop truly stops when hidden), the live resolution scale,
  // and renderer.info memory/draw counters so a multi-day soak can confirm
  // they stay flat (no texture/geometry leak).
  public getPerfInfo() {
    const info = this.renderer.info;
    return {
      tier: this.currentTier,
      isRendering: this.isRendering,
      frames: this.frameCount,
      // Composites served, split by path: `partials` are the cheap TV-screen
      // patches (see src/partial-composite.ts), `composites` the full chain.
      composites: this.fullComposites,
      partials: this.partial?.frames ?? 0,
      partialArmed: !!this.partial?.armed,
      resScale: this.resScale,
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
    };
  }

  // Animation render loop
  private animate = () => {
    if (!this.isRendering) return;
    
    requestAnimationFrame(this.animate);
    this.frameCount++;
    updatedMeshes.clear();


    const time = performance.now();
    perfTrace.frameTick(time);
    perfTrace.begin(SP_SIM);
    const clerkDt = Math.min(0.1, (time - this.lastUpdateTime) / 1000.0);
    this.updateWalkClaspFocus();
    // Raw (unclamped) rAF gap in 60Hz-frame units, captured before
    // lastUpdateTime is re-stamped below. Drives frame-rate compensation for
    // the fixed per-frame slot-pop lerps: on software GL a composite costs
    // 0.5-1s+, and an uncompensated 0.12/frame settle takes the same ~35
    // FRAMES it takes at 60Hz — ~25s of pinned-ACTIVE rendering (measured).
    // Clamped ≥1 so displays faster than 60Hz keep today's per-frame feel.
    const framesElapsed = Math.max(1, Math.min(40, (time - this.lastUpdateTime) / 16.667));
    // NB: film-grain time is advanced only on frames we actually render, and only
    // when not IDLE (see the render section below). Advancing it here would keep
    // the grain shimmering while the composer is throttled, so a "paused" idle
    // screen would never settle to a pixel-stable image.

    // Query active gamepad once per frame using a plain indexed loop to avoid allocations/GC pressure
    let firstActiveGamepad: Gamepad | null = null;
    if (gamepadEverConnected && navigator.getGamepads) {
      const gps = navigator.getGamepads();
      if (gps) {
        for (let i = 0; i < gps.length; i++) {
          const g = gps[i];
          if (g !== null) {
            firstActiveGamepad = g;
            break;
          }
        }
      }
    }

    if (this.isWalkAroundMode) {
      const dt = Math.min(0.1, (time - this.lastUpdateTime) / 1000.0);
      this.lastUpdateTime = time;
      const ROTATION_SPEED = 1.6;

      // Read gamepad sticks for movement and look
      let gpMoveX = 0;
      let gpMoveY = 0;
      let gpLookX = 0;
      let gpLookY = 0;

      const gp = firstActiveGamepad;
      if (gp) {
        const deadzone = 0.15;
        const lx = gp.axes[0] || 0;
        const ly = gp.axes[1] || 0;
        const rx = gp.axes[2] || 0;
        const ry = gp.axes[3] || 0;

        if (Math.abs(lx) > deadzone) gpMoveX = lx;
        if (Math.abs(ly) > deadzone) gpMoveY = ly;
        if (Math.abs(rx) > deadzone) gpLookX = rx;
        if (Math.abs(ry) > deadzone) gpLookY = ry;
      }

      if (this.walkKeys.ArrowLeft) this.yaw += ROTATION_SPEED * dt;
      if (this.walkKeys.ArrowRight) this.yaw -= ROTATION_SPEED * dt;
      if (this.walkKeys.ArrowUp) this.pitch += ROTATION_SPEED * dt;
      if (this.walkKeys.ArrowDown) this.pitch -= ROTATION_SPEED * dt;

      // Apply analog stick looking (X yaw, Y pitch)
      if (gpLookX !== 0) {
        this.yaw -= gpLookX * ROTATION_SPEED * dt * 1.5;
      }
      if (gpLookY !== 0) {
        this.pitch -= gpLookY * ROTATION_SPEED * dt * 1.5;
      }

      this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch));
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
      this.camera.rotation.z = 0;

      const forward = this._walkFwd.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
      forward.y = 0;
      forward.normalize();
      const right = this._walkRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
      right.y = 0;
      right.normalize();

      const oldX = this.camera.position.x;
      const oldZ = this.camera.position.z;
      const WALK_SPEED = 8.0;
      const moveDir = this._walkMove.set(0, 0, 0);

      if (this.walkKeys.w) moveDir.add(forward);
      if (this.walkKeys.s) moveDir.sub(forward);
      if (this.walkKeys.d) moveDir.add(right);
      if (this.walkKeys.a) moveDir.sub(right);

      // Apply analog stick movement (X strafe, Y forward/backward)
      if (gpMoveX !== 0) {
        moveDir.addScaledVector(right, gpMoveX);
      }
      if (gpMoveY !== 0) {
        moveDir.addScaledVector(forward, -gpMoveY);
      }

      if (moveDir.lengthSq() > 0) {
        moveDir.normalize();
        const stepDist = WALK_SPEED * dt;
        this.camera.position.addScaledVector(moveDir, stepDist);
        this.footstepDistAccum += stepDist;
        if (this.footstepDistAccum >= this.nextFootstepDist) {
          this.footstepDistAccum = 0;
          this.nextFootstepDist = 2.6 + Math.random() * 0.8;
          retailAudio.playFootstep();
        }
        // Advance the bob by feet travelled so cadence tracks speed, and ease the
        // amplitude in (~0.2s to full). Phase drives ~2 bounces per stride below.
        this.bobPhase += stepDist * 1.15;
        this.bobAmount = Math.min(1, this.bobAmount + dt * 5);
      } else {
        this.footstepDistAccum = 0;
        // Ease the bob out when stopped; snap clean so a parked eye sits at 5.5ft.
        this.bobAmount = this.bobAmount > 0.002 ? this.bobAmount - dt * 5 : 0;
      }
      // Freecam (teleportWalk's verification-only `free` flag) keeps the pose
      // exactly where the teleport put it: no wall/lot clamp, no forced eye
      // height — otherwise an exterior shot silently snaps back inside the
      // walkable envelope (z<=43, y=5.5) and "far" elevations never change.
      if (!this.walkFreecam) {
        const storeWidth = this.getStoreWidth();
        const constrained = this.constrainWalkPosition(
          oldX, oldZ,
          this.camera.position.x, this.camera.position.z,
          storeWidth,
          this.backWallZ + 1.5
        );
        this.camera.position.x = constrained.x;
        this.camera.position.z = constrained.z;
        // Head-bob: a footstep-phased vertical bounce on top of the 5.5ft eye
        // height. Only y is touched, so x/z (and thus collision) are never
        // perturbed; when bobAmount eases to 0 this is exactly 5.5 again.
        if (this.bobAmount > 0) {
          const a = this.bobAmount * this.bobAmount * (3 - 2 * this.bobAmount); // smoothstep
          this.camera.position.y = 5.5 + Math.sin(this.bobPhase * 2) * 0.045 * a;
        } else {
          this.camera.position.y = 5.5;
        }
      }
      this.currentCameraPos.copy(this.camera.position);
      const camForward = this._walkCamFwd.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this.currentLookAt.copy(this.camera.position).add(camForward);
    } else {
      this.lastUpdateTime = time;
      this.bobAmount = 0; // not walking — drop any residual head-bob so it can't
                          // pin the ACTIVE tier or bias the parked eye height
      if (this.returnDropWatch && !(this.entrance && this.entrance.isReturnDropActive())) {
        this.returnDropWatch = false; // ritual over — release to the real target
      }
      if (this.returnDropWatch) {
        this.currentCameraPos.lerp(this.returnDropWatchPos, this.cameraGlideLerp);
        this.currentLookAt.lerp(this.returnDropWatchLook, this.cameraGlideLerp);
      } else {
        this.currentCameraPos.lerp(this.targetCameraPos, this.cameraGlideLerp);
        this.currentLookAt.lerp(this.targetLookAt, this.cameraGlideLerp);
      }
      this.camera.position.copy(this.currentCameraPos);
      this.camera.lookAt(this.currentLookAt);
    }
    if (this.headlight) {
      this._headlightOffset.set(2.0, 1.5, 0);
      this._headlightOffset.applyQuaternion(this.camera.quaternion);
      this.headlight.position.copy(this.camera.position).add(this._headlightOffset);
      this.headlight.target.position.copy(this.currentLookAt);
    }

    let shadowCastersMoved = false;
    for (const cap of this.libraryEndCaps) {
      const targetScale = 1.0;
      const targetZ = cap.userData.restingZ !== undefined ? cap.userData.restingZ : (FIELD_Z_FRONT + 0.05);
      if (Math.abs(cap.position.z - targetZ) > 0.0005 || Math.abs(cap.scale.x - targetScale) > 0.0005) {
        shadowCastersMoved = true;
      } else {
        continue; // settled — skip the lerp writes (runs every rAF, even IDLE)
      }
      cap.scale.setScalar(THREE.MathUtils.lerp(cap.scale.x, targetScale, 0.1));
      cap.position.z = THREE.MathUtils.lerp(cap.position.z, targetZ, 0.1);
    }

    // Clerk tick — pre-tier on purpose (issue #96): she must keep advancing
    // along her waypoints even on frames the IDLE early-return or VIDEO
    // throttle below skips, otherwise gating clerkActive on frustum visibility
    // would freeze her mid-walk forever once she leaves the view with the TVs
    // off. update() is cheap while off-screen (frustum test + a vector step;
    // all sprite work is already visibility-gated inside).
    let clerkWalking = false;
    if (this.clerk) {
      // Clerk sleep (CLERK_SLEEP_INPUT_MS): after 5 minutes without real user
      // input nobody's watching, so she fades out and her roaming/waypoint sim
      // PAUSES — a hidden clerk advancing state would either wake the renderer
      // for nothing or teleport her across the store on wake. A live chat
      // (clerk-interaction dialog) defers the sleep until it closes; the next
      // input flips wantAsleep back and she fades in right where she stopped.
      const wantAsleep = time - getLastUserActivity() >= CLERK_SLEEP_INPUT_MS &&
        !this.clerk.isChatting();
      if (wantAsleep !== this.clerkAsleep) this.clerkAsleep = wantAsleep;
      // Advance the sub-second fade toward the sleep target. Fade frames call
      // requestRender() so the render-on-demand tiers composite them (same
      // wake pattern as every other out-of-band visual change); once settled
      // the wake requests stop and IDLE parks on a clerk-less (or restored)
      // frame — the parked image never changes mid-fade.
      const fadeTarget = this.clerkAsleep ? 0 : 1;
      if (this.clerkFade !== fadeTarget) {
        this.clerkFade = THREE.MathUtils.clamp(
          this.clerkFade + (fadeTarget > this.clerkFade ? 1 : -1) * (clerkDt / StoreScene.CLERK_FADE_S), 0, 1);
        this.clerk.setFade(this.clerkFade);
        this.clerkMirrorRefresh = true; // her reflection must fade/return too
        this.requestRender();
      }
      // T23: her timers pause while you're home in the back room (the store's
      // ambient systems sleep for the whole lockout) — and while asleep (above).
      if (!this.clerkAsleep && this.mode !== 'backroom') {
        const wasWalking = this.clerk.state === 'WALKING';
        this.clerk.update(clerkDt, this.camera);
        clerkWalking = this.clerk.state === 'WALKING';
        if (wasWalking && !clerkWalking) this.clerkMirrorRefresh = true;
      }
    }

    // Arrow-bob wake gate (issue: library-select idle drain). store-camera
    // keeps the arrow visible for as long as library-select is up, and the
    // bob used to hold the VIDEO tier (via videoPlaying below) forever —
    // ~24fps compositing at ~33% of a core, bounded only by the screensaver
    // (and unbounded in harness/remote instances). Same input governor as the
    // clerk sleep (CLERK_SLEEP_INPUT_MS above): once IDLE_TIER_INPUT_MS
    // passes without real user input the bob freezes mid-pose — the arrow
    // STAYS visible on the parked frame — and stops claiming the VIDEO tier,
    // so the tier drops to IDLE. Every input path funnels through
    // requestRender()/markUserActivity, which resumes the bob next frame.
    const arrowBobAwake = time - getLastUserActivity() < StoreScene.ARROW_BOB_INPUT_MS;
    if (this.selectionArrow && this.selectionArrow.visible && arrowBobAwake) {
      const t = performance.now() * 0.002;
      this.selectionArrow.position.y = this.selectionArrowBaseY + Math.sin(t) * 0.15;
      const dx = this.camera.position.x - this.selectionArrow.position.x;
      const dz = this.camera.position.z - this.selectionArrow.position.z;
      this.selectionArrow.rotation.y = Math.atan2(dx, dz);
    }

    // ---- Render-on-demand activity tier (issue #24) ----
    // Everything above this line is cheap per-frame bookkeeping (walk/camera
    // integration, end-cap + arrow lerps, clerk tick) that must run every rAF
    // so we can detect the moment motion starts or stops. Everything below — the dirty-slot
    // simulation, shadow rebake, mirror render and full composite — is the
    // expensive tail we throttle when nothing is changing.
    //
    // ACTIVE (render every frame) whenever anything visibly moves. Slot lerps are
    // read from hadAnimatingSlots (set at the end of last frame's dirty pass),
    // NOT dirtySlots.size: the selected slot is re-added to dirtySlots every frame
    // and stays there while settled, so size>0 would pin us ACTIVE forever with a
    // movie merely highlighted. hadAnimatingSlots tracks *actual* motion and
    // self-sustains until the pop settles. shadowCastersMoved (end-caps) and
    // launchAnim are the same signals that drive the mirror + shadow throttles.
    let gpActive = false;
    const activeGp = firstActiveGamepad;
    if (activeGp && this.isWalkAroundMode) {
      const deadzone = 0.15;
      const lx = activeGp.axes[0] || 0;
      const ly = activeGp.axes[1] || 0;
      const rx = activeGp.axes[2] || 0;
      const ry = activeGp.axes[3] || 0;
      if (Math.abs(lx) > deadzone || Math.abs(ly) > deadzone ||
          Math.abs(rx) > deadzone || Math.abs(ry) > deadzone) {
        gpActive = true;
      }
    }

    const walkKeyHeld = (this.isWalkAroundMode && (
      this.walkKeys.w || this.walkKeys.a || this.walkKeys.s || this.walkKeys.d ||
      this.walkKeys.ArrowLeft || this.walkKeys.ArrowRight ||
      this.walkKeys.ArrowUp || this.walkKeys.ArrowDown
    )) || gpActive;
    const cameraLerping = !this.isWalkAroundMode && (
      this.currentCameraPos.distanceToSquared(this.targetCameraPos) > 1e-6 ||
      this.currentLookAt.distanceToSquared(this.targetLookAt) > 1e-6
    );
    // The over-the-top wrap's slow glide is one-shot: restore the normal
    // factor once the camera settles (or walk mode takes over the camera).
    if (!cameraLerping && this.cameraGlideLerp !== CAMERA_GLIDE_LERP) {
      this.cameraGlideLerp = CAMERA_GLIDE_LERP;
    }

    // AO walk gating: GTAO's G-buffer prepass replays every scene draw call,
    // which is what was blowing the walking frame budget (60-70fps + hitching
    // on real hardware at 'high'). Disable the pass entirely while the feet are
    // moving, then fade the blend back in over ~250ms once they stop. The fade
    // frames themselves are cheap: the camera is static by then, so the wrapped
    // render() computes the AO term once and replays it. Browse-mode camera
    // lerps keep AO on (they're ~10 frames; toggling would read as flicker).
    let aoFading = false;
    if (this.aoPass) {
      // Mouse-look pans arrive as discrete events (requestRender wakeups), not
      // held keys — hold the "in motion" verdict for 150ms past the last one so
      // AO doesn't flip-flop between event gaps mid-pan.
      const walkLooking = this.isWalkAroundMode && (time - this.lastWalkLookTime) < 150;
      if (walkKeyHeld || walkLooking) {
        if (this.aoPass.enabled) this.aoPass.enabled = false;
        this.aoFadeT = 0;
      } else {
        if (!this.aoPass.enabled) {
          this.aoPass.enabled = true;
          this.aoPass.blendIntensity = 0;
        }
        if (this.aoFadeT < 1) {
          this.aoFadeT = Math.min(1, this.aoFadeT + clerkDt / 0.25);
          const t = this.aoFadeT;
          this.aoPass.blendIntensity = t * t * (3 - 2 * t); // smoothstep
          aoFading = true; // keeps the ACTIVE tier (and thus compositing) alive through the fade
        }
      }
    }

    // Depth-of-field gating: only in inspect mode, where the shopper is holding a
    // single case up to read it. Steer the focal plane to that case each frame
    // (its distance in front of the camera) so it stays razor-sharp while the
    // shelves behind soften. Disabled everywhere else, so EffectComposer skips the
    // pass — and its extra depth render — entirely while browsing/walking. No
    // requestRender of its own: it only ever runs on frames already being drawn.
    if (this.bokehPass) {
      // Also the back room's couch view: that shot sits a few inches off the
      // table reading a tape spine and a receipt, so the TV behind belongs well
      // out of focus. Not while a tape is held up or a film is playing — those
      // states drive the camera themselves.
      const backRoomView = this.mode === 'backroom' && this.backRoom?.state === 'view';
      const dofOn = this.mode === 'inspect' || backRoomView;
      if (this.bokehPass.enabled !== dofOn) this.bokehPass.enabled = dofOn;
      if (backRoomView) {
        const u = this.bokehPass.uniforms as { [k: string]: THREE.IUniform };
        u['focus'].value = THREE.MathUtils.clamp(this.backRoom!.focusDistance(), 0.35, 6.0);
        // Wider than the inspect default: the subject is a foot away and the TV
        // ~7 ft past it, so the inspect aperture would barely register.
        // Tighter than the first pass: the receipt runs from the focal plane
        // out toward the lens, so a wide aperture softened the print that this
        // framing exists to show. The TV is ~7 ft past a ~1.3 ft focus, which
        // still defocuses hard at this setting.
        u['aperture'].value = 0.0025;
        u['maxblur'].value = 0.006;
      } else if (dofOn) {
        // Focal plane on the FACE of the held case, not on the look target (the
        // case centre) and — the bug this replaced — not on a 1.5 floor that sat
        // behind a case measured 0.90-1.35 units out, which left the back-cover
        // text permanently soft. See heroFocusDistance() for the arithmetic.
        const focusDist = inspect.heroFocusDistance(this);
        // Clamp still guards a mid-lerp look target from throwing the focal
        // plane onto the far wall; the floor is now well under the real
        // inspect band instead of above it.
        const u = this.bokehPass.uniforms as { [k: string]: THREE.IUniform };
        u['focus'].value = THREE.MathUtils.clamp(focusDist, 0.35, 6.0);
        // Back the inspect look out again — the back-room branch widens these.
        u['aperture'].value = 0.0032;
        u['maxblur'].value = 0.006;
      }
    }

    // Visibility-gated (issue #96): her roaming used to pin the ACTIVE tier
    // (display-refresh composer + AO) for hours of unattended wall-clock time
    // even with the camera parked facing a shelf. Off-screen she still ticks
    // (see the pre-tier clerk block above) but doesn't force a render.
    // T23: while home in the back room her update() is paused (see the
    // pre-tier block), which freezes isMoving() at whatever it was mid-walk —
    // without the mode gate a paused stride would pin ACTIVE for the whole
    // multi-hour lockout.
    // !clerkAsleep: while she sleeps her sim is paused, so a stride frozen at
    // WALKING must not pin ACTIVE (same hazard as the backroom gate above).
    const clerkActive = !!this.clerk && !this.clerkAsleep && this.mode !== 'backroom' && this.clerk.isMoving() && this.clerk.isOnScreen();
    const arrowVisible = !!this.selectionArrow && this.selectionArrow.visible;
    // Snapshot before the decrement below: an interaction-wake frame (the
    // requestRender() burst any input handler fires) must always composite
    // on the very next rAF, uncapped — see the frameInterval gate further
    // down — or every click/keypress would pick up latency from whatever
    // point in the cap's vsync window it happened to land on.
    const forceWake = this.forceRenderFrames > 0;
    let active =
      forceWake ||
      walkKeyHeld ||
      cameraLerping ||
      aoFading ||
      this.hadAnimatingSlots ||
      !!this.launchAnim ||
      // T22: carried-tape flights (take / put-back / checkout hops) and the
      // post-removal restack settle pin ACTIVE; a parked stack costs nothing.
      (!!this.carried && this.carried.isAnimating(time)) ||
      // T23: back-room tape/door tweens (focus lifts, inspect zoom, insert
      // beat, door swing); a still room contributes nothing here.
      (!!this.backRoom && this.backRoom.isAnimating(time)) ||
      // Return-chute drop ritual (re-entry): brief, then contributes nothing.
      (!!this.entrance && this.entrance.isReturnDropActive()) ||
      clerkActive ||
      shadowCastersMoved ||
      (this.isWalkAroundMode && this.bobAmount > 0); // hold ACTIVE through the
                          // ~0.2s head-bob settle so the parked frame lands flat
                          // at 5.5ft, never frozen mid-bounce (and never past
                          // leaving walk mode — bobAmount is zeroed there)
    // Snapshot the "something genuinely changed this frame" verdict BEFORE the
    // 30s stay-awake window (below) forces `active` true on otherwise-static
    // frames. Drives both the motion-gated resolution and the static-persist
    // skip further down.
    const sceneChanging = active;
    if (this.forceRenderFrames > 0) this.forceRenderFrames--;

    // VIDEO tier: a ceiling TV (or the back room's CRT, T23) is playing or the
    // selection arrow is bobbing but nothing else moves — render at the
    // video's ~24fps instead of display refresh. IDLE: don't composite at all.
    // Software GL: the bobbing selection arrow must not hold the ~24fps VIDEO
    // tier — at ~1s a composite it would render continuously forever. It
    // freezes mid-bob instead and any interaction redraws it.
    // arrowBobAwake (computed above): on real GPUs too the arrow only holds
    // the VIDEO tier while input is recent — after 30s untouched the bob is
    // frozen, so the tier must be free to drop to IDLE.
    const videoPlaying = !active && (
      (!!this.ambientTvs && this.ambientTvs.isPlaying()) ||
      (arrowVisible && arrowBobAwake && !this.softwareGL));
    // IDLE gate (IDLE_TIER_INPUT_MS): the tier may only drop to IDLE once 30s
    // have passed since the last real user input (keyboard/mouse/gamepad, see
    // src/user-activity.ts). A would-be-idle frame inside that window stays
    // ACTIVE — the user is likely still at the controls — and the drop to IDLE
    // at t+30s happens naturally since this re-evaluates every rAF. Applied
    // AFTER videoPlaying so the VIDEO tier's ~24fps throttle is untouched.
    //
    // Software GL skips the stay-awake window: each composite costs ~0.5-1s+
    // of pure CPU, so re-drawing an unchanged frame just because input arrived
    // recently burns whole seconds for nothing (boot alone composited ~50
    // identical frames this way). Strict render-on-demand instead — every
    // input path already lands in requestRender(), whose forceRenderFrames
    // pins ACTIVE above, and everything that genuinely moves holds ACTIVE
    // through its own signal.
    if (!active && !videoPlaying && !this.softwareGL &&
        time - getLastUserActivity() < StoreScene.IDLE_TIER_INPUT_MS) {
      active = true;
    }
    this.tierIsIdle = !active && !videoPlaying;
    this.currentTier = active ? 'active' : (videoPlaying ? 'video' : 'idle');

    // Set when applyRenderResolution() ran this frame: the drawing-buffer
    // resize cleared the canvas, so we must composite before this frame
    // presents (otherwise a one-frame background-blue flash).
    let mustRenderThisFrame = false;

    // --- Motion-gated sharpness + static persist -------------------------------
    // User intent: sharp while moving around (that's when the ceiling/far-back
    // jaggies show) and on the frame you settle on; today's low-power budget
    // when dwelling; zero GPU when left alone. On a window already at native
    // (sharpScale === 1) none of this changes anything.
    const cameraMoving =
      walkKeyHeld || cameraLerping ||
      (this.isWalkAroundMode && (time - this.lastWalkLookTime) < 150) ||
      (this.isWalkAroundMode && this.bobAmount > 0);
    if (cameraMoving) this.lastCameraMotionTime = time;
    if (sceneChanging) {
      this.staticSettled = false;
      this.lastSceneChangeTime = time;
    }

    // Persist an already-composited static frame instead of re-drawing it every
    // stay-awake rAF. The skip condition is exactly what the IDLE tier trusts
    // for hours (nothing is changing that didn't route through requestRender),
    // applied sooner and WITHOUT the resScale snap — so the sharp settle frame
    // stays on screen at zero GPU. This also drops sustained power while "idly
    // browsing" below today's 30s-window re-render.
    const staticPersist = !this.motionSharpDisabled &&
      !this.tierIsIdle && !videoPlaying && !sceneChanging && this.staticSettled;

    // SETTLE REFINEMENT. Once the view has been quiet for QUALITY_SETTLE_MS —
    // nothing moving, nothing animating — redraw the parked frame SUPERSAMPLED
    // (see settleScale). It costs one heavy frame at a moment where a hitch is
    // invisible (nothing is animating to stutter), and staticPersist then holds
    // that properly antialiased still for free until something moves again.
    // Deliberately NOT gated on !staticPersist: the whole point is to upgrade a
    // frame we have already parked on, and the early-return below honours
    // mustRenderThisFrame. The quiet window is what keeps it from firing between
    // every browse-cursor keypress; VIDEO tier is excluded outright since those
    // frames recomposite forever at ~24fps.
    //
    // No `settleSsFactor > 0` gate here (removed 2026-08-06): settleScale
    // already falls back to sharpScale — the native-DISPLAY-resolution lift,
    // NOT a supersample — whenever settleSsFactor is 0 (see its declaration
    // comment above: "'0' disables and restores the old native-only settle").
    // Gating settleRefine on settleSsFactor silently broke that promise, and
    // it also zeroes for 'low' quality (never above-native, by design) — so a
    // 'low'-tier HiDPI panel (buffer capped at CSS-pixel resolution, i.e.
    // sub-native) never got the free native lift at rest and stayed
    // permanently soft, even though nothing stops it from reaching sharpScale.
    // `qualityScale < settleScale` alone is the correct "is there anything to
    // gain" test for every tier — it's already false when there's nothing to
    // lift to. softwareGL is excluded explicitly instead of riding along on
    // the settleSsFactor gate: one SwiftShader composite is already seconds
    // long, so it must never pay for a resize + extra draw just to sit at rest.
    const settleRefine = !this.tierIsIdle && !videoPlaying && !this.softwareGL &&
      !sceneChanging && !cameraMoving && !this.motionSharpDisabled &&
      this.qualityScale < this.settleScale - 1e-3 &&
      (time - this.lastCameraMotionTime) >= StoreScene.QUALITY_SETTLE_MS &&
      (time - this.lastSceneChangeTime) >= StoreScene.QUALITY_SETTLE_MS;
    if (settleRefine) {
      this.qualityScale = this.settleScale;
      this.applyRenderResolution();
      mustRenderThisFrame = true; // buffer just cleared — repaint before present
    }

    // Choose the render resolution ONLY on frames we composite because something
    // moved. Idle/video/persist frames keep the last drawn frame's qualityScale,
    // so a parked still never softens under the viewer (no res "pop").
    if (!settleRefine && !staticPersist && !this.tierIsIdle && (sceneChanging || cameraMoving)) {
      const wantSharp = !this.softwareGL && !this.motionSharpDisabled &&
        this.motionScale > 1 &&
        (cameraMoving || (time - this.lastCameraMotionTime) < StoreScene.QUALITY_SETTLE_MS);
      const targetQuality = wantSharp ? this.motionScale : 1.0;
      if (this.qualityScale !== targetQuality) {
        this.qualityScale = targetQuality;
        this.applyRenderResolution();
        mustRenderThisFrame = true; // buffer just cleared — repaint before present
      }
    }

    if (staticPersist && !mustRenderThisFrame) {
      // Reset the ACTIVE-only fps window (as the IDLE branch does) so these
      // skipped frames aren't misread as a slow GPU and don't downscale.
      this.resScaleFrames = 0;
      this.resScaleGoodStreak = 0;
      this.resScaleWindowStart = time;
      return;
    }

    // First static frame after a change: mark it drawn so the next rAF persists.
    if (!this.tierIsIdle && !videoPlaying && !sceneChanging) {
      this.staticSettled = true;
    }

    if (this.tierIsIdle) {
      // IDLE: composite nothing. We deliberately leave the last rendered frame on
      // screen untouched (the browser/webview keeps presenting it) rather than
      // re-drawing an identical frame every second. This guarantees the acceptance
      // criterion — the displayed image does not change *at all* while idle, no
      // grain shimmer and no re-render of any material that self-animates via
      // onBeforeRender — and drops GPU work to zero. Any user input, a settings
      // change, a resize, or requestRender() wakes us on the very next frame; the
      // puppeteer harness calls requestRender() before an on-demand screenshot.
      //
      // Dynamic resolution (issue #27): snap back to full crispness for whatever
      // static frame is left on screen (e.g. someone reading a box cover), and
      // reset the ACTIVE-only timing window so idle time never gets folded into
      // the next fps measurement used to step resScale.
      //
      // The resize inside applyRenderResolution() clears the WebGL drawing
      // buffer (per spec), so the "last rendered frame" we mean to leave on
      // screen would actually be the bare clear color (the scene's dark
      // blue). Returning here and repainting NEXT frame lets that cleared
      // buffer present for one frame — the single-frame blue flicker seen on
      // tier transitions. Instead, composite in this SAME rAF so a cleared
      // buffer is never presented.
      if (this.aoPass && (!this.aoPass.enabled || this.aoFadeT < 1)) {
        // Safety: never park on an idle frame with AO off or mid-fade.
        this.aoPass.enabled = true;
        this.aoFadeT = 1;
        this.aoPass.blendIntensity = 1;
      }
      this.resScaleFrames = 0;
      this.resScaleGoodStreak = 0;
      this.resScaleWindowStart = time;
      // Software GL never snaps up for the parked frame — one full-res
      // SwiftShader composite costs multiple seconds.
      const idleScale = this.softwareGL ? this.resScaleMin : StoreScene.RES_SCALE_MAX;
      if (this.resScale !== idleScale) {
        this.resScale = idleScale;
        this.applyRenderResolution();
        mustRenderThisFrame = true; // buffer just cleared — repaint before present
      } else {
        return;
      }
    }

    if (videoPlaying) {
      // AO stays ENABLED in the VIDEO tier now: the camera is static here by
      // definition, so the wrapped render() replays the cached AO term with two
      // full-screen quads — the store keeps its contact shadows while a ceiling
      // TV plays, at negligible cost. (It used to be disabled outright, which
      // meant AO silently vanished whenever you stood still with TVs playing.)
      const videoScale = this.softwareGL ? this.resScaleMin : 0.85;
      if (this.resScale !== videoScale) {
        this.resScale = videoScale;
        this.applyRenderResolution();
        mustRenderThisFrame = true; // buffer just cleared — repaint before present
      }
    }

    // ACTIVE throttle: pace composites to targetFps (see activeFrameInterval)
    // instead of chasing every rAF — that's what let a 144/165/240Hz monitor
    // run the full N8AO/bloom/bokeh/FXAA chain at full refresh for no visual
    // gain. VIDEO throttle: cap the composite to the video's frame rate.
    // Software GL caps VIDEO at ~1fps: a playing ceiling TV shouldn't hold the
    // whole store at one multi-second composite after another. forceWake
    // bypasses both: a fresh requestRender() burst must land on the next rAF
    // uncapped (see the forceWake comment above), so it's excluded from the
    // gate the same way mustRenderThisFrame is.
    const frameInterval = active ? this.activeFrameInterval : (this.softwareGL ? 1000 : this.VIDEO_FRAME_MS);
    if (!mustRenderThisFrame && !forceWake && time - this.lastRenderTime < frameInterval) {
      return;
    }
    this.lastRenderTime = time;
    // The settle frame is deliberately several times a normal frame's cost, and
    // it is the LAST frame before the view parks — feeding it to the fps window
    // would step resScale down for a slowness that will never be seen again,
    // blurring the MOTION that follows. Worse, it's a feedback loop: each pause
    // makes the next movement blurrier, which is the opposite of the point.
    // Reset the window instead (same treatment the persist/idle branches give
    // their skipped frames).
    if (settleRefine) {
      this.resScaleFrames = 0;
      this.resScaleGoodStreak = 0;
      this.resScaleWindowStart = time;
    } else {
      this.updateDynamicResolution(time, active);
    }

    // Rendering for real this frame (ACTIVE or VIDEO): advance the animated film
    // grain here — only on frames we composite — then run the full simulation.
    // Wrap the grain clock modulo ~1000s before scaling (issue #16): three.js
    // uploads uniforms as float32, and a raw performance.now() (ms) grows past
    // float32's ~7-significant-digit range within a day, coarsening the grain
    // animation on a multi-day session. The grain is stochastic noise, so a
    // periodic wrap is visually invisible while keeping the value precise forever.
    if (this.filmPass) this.filmPass.uniforms['time'].value = (time % 1_000_000) * 0.001;

    // ── PARTIAL COMPOSITE GATE (src/partial-composite.ts) ─────────────────────
    // The VIDEO tier's whole job is to keep a few hundred pixels of tube face
    // moving; re-drawing the entire store to do it is ~89% of the frame. When
    // the ONLY thing that changed since the last full composite is the TV
    // picture, patch just the screens into the cached beauty and re-run the
    // post chain (which is what keeps it pixel-exact: AO, bloom, FXAA and the
    // grain are all still computed for real).
    //
    // Every clause below is an invalidation source that must take the full
    // path. `active` already covers camera motion, input wakes (forceWake),
    // AO fades, slot pops, launch/carry/back-room/return-drop tweens, an
    // on-screen clerk and end-cap motion; the rest are the things that change
    // the picture WITHOUT holding the ACTIVE tier:
    //   videoPlaying + isPlaying()  the ceiling sets are the reason we're awake
    //   backRoom.isPlaying()        the back-room CRT is a different screen
    //   arrow bob                   a moving selection arrow is scene motion
    //   mustRenderThisFrame         the drawing buffer was just resized/cleared
    //   settleRefine                the supersampled parked frame must be real
    //   shadowRefreshFrames         a shadow-map rebake changes the whole frame
    //   clerkMirrorRefresh / dirty  a mirror would re-render its reflection
    //   pendingStockedRebake        the one-shot environment bake relights all
    //   marquee 'chase'             the bulb pattern advances on drawn frames
    //   entrance.wantsFrame()       cursor blink / vestibule doors / bag solver
    //   checkoutRunning             the checkout flourish drives its own props
    //   insideStorePatchZone        outside, glazing (transparent, depth-write
    //                               off) is blended OVER the sets, and an
    //                               opaque screen re-draw would erase it
    const patchable = !!this.partial && !active && videoPlaying && !forceWake &&
      !mustRenderThisFrame && !settleRefine &&
      !!this.ambientTvs?.isPlaying() &&
      !(arrowVisible && arrowBobAwake) &&
      this.mode !== 'backroom' && !this.checkoutRunning &&
      this.shadowRefreshFrames === 0 && !this.clerkMirrorRefresh &&
      !this.stockedRebakeDue(time) && this.marqueeAnimMode !== 'chase' &&
      !this.entrance?.wantsFrame(time) &&
      !this.dirtyMirrorInView() && this.insideStorePatchZone();
    if (patchable && this.partial!.canPatch()) {
      // Same per-frame fixture upkeep a VIDEO frame does — the gate above has
      // already established none of it changes anything visible except the TV
      // texture upload, which is the entire point of the frame.
      this.entrance?.update(time);
      this.ambientTvs?.update(time);
      for (const f of this.slottedFixtures) f.update(time);
      perfTrace.end(SP_SIM);
      perfTrace.begin(SP_RENDER);
      this.partial!.render();
      perfTrace.end(SP_RENDER);
      perfTrace.count(CT_PARTIAL);
      return;
    }
    this.partial?.beforeFullFrame(patchable);

    // T21: overview shelf-cursor bob/pulse + billboarding. ACTIVE-tier frames
    // only — on VIDEO/IDLE frames the cursors hold their last pose rather than
    // waking the renderer — and update() itself allocates nothing per frame.
    if (active && this.overviewCursors && this.overviewCursors.visible) {
      this.overviewCursors.update(time, this.camera);
    }

    // T23: back room — tape/door tweens, CRT frame upload, HRTF listener sync
    // and the diegetic clock repaints. Composited frames only (we're past the
    // IDLE early-return), so a still, TV-off room costs nothing at all.
    if (this.backRoom) {
      this.backRoom.update(time, this.camera);
    }

    // T22: carried-stack viewmodel — walk-bob + case flights. ACTIVE-tier
    // composited frames only (the stack holds its pose on VIDEO/IDLE frames),
    // and update() itself allocates nothing per frame. bobPhase/bobAmount are
    // the walk integrator's own values, so the stack bobs exactly while the
    // feet move and freezes flat when parked.
    if (active && this.carried) {
      this.carried.update(time, this.bobPhase, this.bobAmount, cameraLerping ? 1 : 0);
      if (this.checkoutRunning && this.checkoutExit && !this.launchAnim) {
        // Non-rental exit ritual: wrap → slide to the counter's right end →
        // walk around → grab the waiting bag → carry out the doors. Owns
        // the camera until finishCheckout. (A play-flourish handoff drives
        // this from updateLaunchAnimation instead — launchAnim still set.)
        this.updateCheckoutExit(time);
      } else if (this.checkoutRunning && this.carried.checkoutPhase === 'bag') {
        // Bag phase of a checkout: lean RIGHT IN over the counter and watch
        // each case drop — the customer's-eye view of the bagging, from the
        // right-side stand (same framing the exit ritual's WRAP beat holds,
        // so there's no camera jump when it takes over).
        const bag = this.entrance?.bagMouthWorld ??
          _checkoutBagFallback.set(11.0, 3.9, this.deskApexZ() + 3.0);
        const stand = this.checkoutStand(_checkoutStand);
        this.targetCameraPos.set(
          stand.x + (bag.x - stand.x) * 0.30, bag.y + 1.15,
          stand.z + (bag.z - stand.z) * 0.30);
        this.targetLookAt.set(bag.x, bag.y - 0.25, bag.z);
      }
    }

    // 2. Animate floating and rotations of active/inactive cases (only runs in browse/inspect modes)
    perfTrace.begin(SP_SLOTS);
    // Frame-rate-compensated pop lerp: 0.12 was tuned per-60Hz-frame; a slow
    // frame covers the equivalent of the frames it spanned (see framesElapsed)
    // so the settle takes constant WALL time, not constant frame count.
    const popLerp = 1 - Math.pow(1 - 0.12, framesElapsed);
    const activeKey = this.getActiveSlotKey();
    const tolerance = 0.001;
    if (this.mode === 'browse' || this.mode === 'inspect') {
      const activeSlot = this.slotsByPosition.get(activeKey);
      if (activeSlot) this.dirtySlots.add(activeSlot);
    }

    const settledSlots = this._settledSlots; // per-frame scratch, reused (no per-frame allocation)
    settledSlots.length = 0;
    // Counts slots that are actually mid-lerp this frame — as opposed to merely being
    // in the dirty set, since the selected slot stays dirty (re-added at the top of
    // this function) for as long as it's selected even after its pop settles.
    let movingSlots = 0;
    for (const slot of this.dirtySlots) {
      if (this.launchAnim && slot === this.launchAnim.slot) continue;
      const isSelected = (slot.key === activeKey);
      const isBackSide = slot.side === 'back';
      const isBackWall = (slot.unitIdx === BACK_WALL_UNIT_IDX);
      // Series titles render as one chunky season boxset: the shared case
      // geometry gets a non-uniform Z scale on this slot's front instance and
      // the rental back box stays collapsed (the boxset IS the rental copy).
      const seriesZMult = slot.movie.isSeries ? SERIES_DEPTH_MULT : 1;
      const depth = slot.depth * seriesZMult;

      // Determine visibility scale target
      let targetScale = 1.0;
      if (slot.hidden) {
        targetScale = 0.0;
      }

      // Bargain-bin stock (noRentalCase) is sold ex-rental, so it shows the
      // plain Jellyfin box alone — no branded clamshell behind it, and none
      // when it's picked up either (see the isSelected force-on below).
      let showBackBox = targetScale > 0 && !slot.noRentalCase;

      // target position & rotations
      let targetX = slot.restingX;
      let targetY = slot.restingY;
      let targetZ = slot.restingZ;
      let targetRotY = slot.restingRotY;
      let targetRotX = slot.restingRotX || 0;

      const isDisplayStand = slot.source === 'fixture';
      let targetFrontX = isDisplayStand ? 0 : -STAGGER_OFFSET;
      let targetFrontZ = depth / 2;
      let targetFrontRotY = 0;

      // Cached at slot build/reassignment time (slot.backJitter) rather than
      // re-hashed here — this runs for every dirty slot on every rendered frame
      // during placement waves and genre-filter rebuilds (issue #116).
      let targetBackX = targetFrontX + slot.backJitter;
      let targetBackZ = -depth / 2;
      let targetBackRotY = 0;

      if (isSelected && targetScale > 0) {
        showBackBox = !slot.noRentalCase;
        targetY = this.mode === 'inspect' ? slot.restingY + 0.3 : slot.restingY + 0.1;
        if (isBackWall) {
          // Pop along the wall run's facing normal: +Z for the back-wall runs,
          // -X for the stepped connector, +X for the LEFT-wall unit. (The old
          // -X/+Z two-case split slid left-wall cases sideways along the wall
          // into their neighbours instead of out into the store.)
          const popDist = this.mode === 'inspect' ? 1.2 : 0.25;
          targetX = slot.restingX + popDist * Math.round(Math.sin(slot.restingRotY));
          targetZ = slot.restingZ + popDist * Math.round(Math.cos(slot.restingRotY));
        } else {
          // Aisle boxes pop along their (rotated) outward normal, not world X, so the
          // selected case lifts toward the shopper down the aisle. Which way "out" is
          // depends on which face is the browse-front (unit.browseSign), NOT on the tilt
          // sign — in the diagonal layout every unit tilts the same way yet is still
          // browsed from its +X face, so deriving this from aisleAngle reversed the pop.
          if (isDisplayStand && this.selectedFixtureLookDown) {
            // Dump tub: the shopper doesn't walk round the bin, the case comes
            // out of the pile to them. Lift it clear of the rim at the pinned
            // present point and let the rotation below square it to the eye.
            targetX = this.lookDownPresent.x;
            targetY = this.lookDownPresent.y;
            targetZ = this.lookDownPresent.z;
          } else if (isDisplayStand) {
            const popDist = this.mode === 'inspect' ? 0.6 : 0.25;
            targetX = slot.restingX + popDist * Math.sin(slot.restingRotY);
            targetZ = slot.restingZ + popDist * Math.cos(slot.restingRotY);
          } else {
            const fSign = slot.browseSign ?? 1.0;
            const outSign = (isBackSide ? -1.0 : 1.0) * fSign;
            const popDist = (this.mode === 'inspect' ? 1.2 : 0.25) * outSign;
            const slotAngle = slot.aisleAngle ?? 0;
            targetX = slot.restingX + popDist * Math.cos(slotAngle);
            targetZ = slot.restingZ - popDist * Math.sin(slotAngle);
          }
        }

        const tiltSign = slot.browseSign ?? 1.0; // which local-X face is the browse-front
        if (this.selectedFixtureLookDown && isDisplayStand) {
          // Square to the eye. In inspect the camera drops to the case's own
          // height and comes in level (see the browseLookDown branch in the
          // inspect framing), so the backward tilt is dropped there.
          targetRotY = this.lookDownPresentRotY;
          targetRotX = this.mode === 'inspect' ? 0 : this.lookDownPresentRotX;
        } else {
          targetRotY = this.mode === 'inspect' ? slot.restingRotY : slot.restingRotY + tiltSign * (isBackSide ? 0.12 : -0.12);
          // Browse pop on the NR wall keeps the resting back-lean: pitching a
          // wall case forward (+0.08) swung the taller rental clamshell's
          // bottom edge down through the 0.3ft shelf board and its side into
          // the run's end panel (user-reported clipping at the ribbon start).
          targetRotX = this.mode === 'inspect' ? 0 : (isBackWall ? (slot.restingRotX || 0) : 0.08);
        }

        if (this.mode === 'inspect') {
          targetFrontX = INSPECT_FAN_X;
          targetFrontZ = INSPECT_CASE_Z + INSPECT_RETAIL_Z_LEAD;
          // Both cases flip: the retail case shows its back (cast list) and the
          // rental copy its rental-info back. Opposite spin directions so
          // they read like a book opening.
          targetFrontRotY = this.isFlipped ? -Math.PI : 0;
          if (slot.noRentalCase) {
            // Nothing to fan out beside: the retail case stands alone, centered.
            targetFrontX = 0;
          }
          if (seriesZMult !== 1) {
            // A single centered boxset: no fan-out, and its yaw follows the
            // four-face rotation (front/episodes/back/play-season).
            targetFrontX = 0;
            targetFrontRotY = this.heroFaceRot;
          }

          targetBackX = -INSPECT_FAN_X;
          targetBackZ = INSPECT_CASE_Z;
          // Spine stop: only the rental copy turns (the retail case sits
          // back at its front pose beside it) — spine to the camera, angled a
          // touch short of square so a bit of the front cover stays visible.
          targetBackRotY = this.isFlipped ? Math.PI : this.heroSpine ? HERO_SPINE_YAW : 0;
        } else {
          targetFrontX = 0.04;
          targetFrontZ = depth / 2 + 0.01;
          targetFrontRotY = 0.05;

          targetBackX = -0.04;
          targetBackZ = -depth / 2 - 0.01;
          targetBackRotY = -0.05;
        }
      } else {
        const dist = Math.abs(slot.currentX - slot.restingX) + Math.abs(slot.currentY - slot.restingY) + Math.abs(slot.currentZ - slot.restingZ);
        if (dist > tolerance && !slot.noRentalCase) {
          showBackBox = true;
        }
      }

      // Lerps and dirty check
      const diffLimit = 0.0001;
      const isMoving =
        slot.needsInitialMatrixUpdate ||
        Math.abs(slot.currentScale - targetScale) > diffLimit ||
        Math.abs(slot.currentX - targetX) > diffLimit ||
        Math.abs(slot.currentY - targetY) > diffLimit ||
        Math.abs(slot.currentZ - targetZ) > diffLimit ||
        Math.abs(slot.currentRotX - targetRotX) > diffLimit ||
        Math.abs(slot.currentRotY - targetRotY) > diffLimit ||
        Math.abs(slot.frontX - targetFrontX) > diffLimit ||
        Math.abs(slot.frontZ - targetFrontZ) > diffLimit ||
        Math.abs(slot.frontRotY - targetFrontRotY) > diffLimit ||
        Math.abs(slot.backX - targetBackX) > diffLimit ||
        Math.abs(slot.backZ - targetBackZ) > diffLimit ||
        Math.abs(slot.backRotY - targetBackRotY) > diffLimit;

      if (isMoving) movingSlots++;

      // The selected slot swaps its shared-texture instances for the hero cases
      // (real artwork/metadata). Binding must run even when the slot is settled.
      const heroActive = isSelected && targetScale > 0 && (this.mode === 'browse' || this.mode === 'inspect');
      const heroNeedsBind = heroActive && this.heroSlotKey !== slot.key;

      if (!isMoving && !heroNeedsBind) {
        // Non-selected settled slots can be removed from the dirty set
        if (!isSelected) settledSlots.push(slot);
        continue;
      }

      slot.currentScale = THREE.MathUtils.lerp(slot.currentScale, targetScale, popLerp);
      slot.currentX = THREE.MathUtils.lerp(slot.currentX, targetX, popLerp);
      slot.currentY = THREE.MathUtils.lerp(slot.currentY, targetY, popLerp);
      slot.currentZ = THREE.MathUtils.lerp(slot.currentZ, targetZ, popLerp);
      slot.currentRotX = THREE.MathUtils.lerp(slot.currentRotX, targetRotX, popLerp);
      slot.currentRotY = THREE.MathUtils.lerp(slot.currentRotY, targetRotY, popLerp);

      slot.frontX = THREE.MathUtils.lerp(slot.frontX, targetFrontX, popLerp);
      slot.frontZ = THREE.MathUtils.lerp(slot.frontZ, targetFrontZ, popLerp);
      slot.frontRotY = THREE.MathUtils.lerp(slot.frontRotY, targetFrontRotY, popLerp);

      slot.backX = THREE.MathUtils.lerp(slot.backX, targetBackX, popLerp);
      slot.backZ = THREE.MathUtils.lerp(slot.backZ, targetBackZ, popLerp);
      slot.backRotY = THREE.MathUtils.lerp(slot.backRotY, targetBackRotY, popLerp);

      // Snap values to target when very close to let them settle
      if (Math.abs(slot.currentScale - targetScale) < 0.0005) slot.currentScale = targetScale;
      if (Math.abs(slot.currentX - targetX) < 0.0005) slot.currentX = targetX;
      if (Math.abs(slot.currentY - targetY) < 0.0005) slot.currentY = targetY;
      if (Math.abs(slot.currentZ - targetZ) < 0.0005) slot.currentZ = targetZ;
      if (Math.abs(slot.currentRotX - targetRotX) < 0.0005) slot.currentRotX = targetRotX;
      if (Math.abs(slot.currentRotY - targetRotY) < 0.0005) slot.currentRotY = targetRotY;

      if (Math.abs(slot.frontX - targetFrontX) < 0.0005) slot.frontX = targetFrontX;
      if (Math.abs(slot.frontZ - targetFrontZ) < 0.0005) slot.frontZ = targetFrontZ;
      if (Math.abs(slot.frontRotY - targetFrontRotY) < 0.0005) slot.frontRotY = targetFrontRotY;

      if (Math.abs(slot.backX - targetBackX) < 0.0005) slot.backX = targetBackX;
      if (Math.abs(slot.backZ - targetBackZ) < 0.0005) slot.backZ = targetBackZ;
      if (Math.abs(slot.backRotY - targetBackRotY) < 0.0005) slot.backRotY = targetBackRotY;

      slot.needsInitialMatrixUpdate = false;

      // Compute instance matrices using reusable scratch variables
      const theta = slot.currentRotY;
      const s = slot.currentScale;

      const fWorldX = slot.currentX + slot.frontX * Math.cos(theta) + slot.frontZ * Math.sin(theta);
      const fWorldY = slot.currentY;
      const fWorldZ = slot.currentZ - slot.frontX * Math.sin(theta) + slot.frontZ * Math.cos(theta);

      const bScale = (showBackBox && seriesZMult === 1) ? s : 0.0;
      const bWorldX = slot.currentX + slot.backX * Math.cos(theta) + slot.backZ * Math.sin(theta);
      // Rental shells are taller than the box they stand behind and both
      // geometries are origin-centred, so the shell needs lifting onto the
      // shelf rather than sharing the front box's centre (MovieSlot.backYLift).
      const bWorldY = slot.currentY + slot.backYLift;
      const bWorldZ = slot.currentZ - slot.backX * Math.sin(theta) + slot.backZ * Math.cos(theta);

      if (heroActive) {
        // Hero cases carry the movie's real artwork/metadata; collapse the
        // shared-placeholder instances and drive the hero meshes instead.
        // NR wall slots flag the rental copy to wear the gold NR-case skin.
        this.ensureHeroCases(slot.movie, isBackWall);
        this.heroSlotKey = slot.key;
        const hf = this.heroFrontMesh!;
        const hb = this.heroBackMesh!;
        // An unpainted cover box is worse than no cover box: it reads as a
        // black slab (or a stretched rental print) sitting where the art
        // should be. Until the poster FIRST exists, show only the rental
        // clamshell — that IS what a store shelf looks like with the sleeve
        // still out. But an EVICTED title (pixels dropped by the bounded LRU;
        // GPU array still has its art, so hasArt() is true) must not fall
        // into the same branch: with bScale ~0 that hid BOTH meshes and the
        // whole box vanished on hover. createHeroJellyfinMaterials always
        // yields a usable front (real art or placeholder) and the miss path
        // now fires an async redecode + requestRender, so eviction shows
        // placeholder-then-swap instead of nothing.
        //
        // Same escape hatch as the instanced path below: hiding the cover box
        // only reads as "sleeve still out" when there IS a clamshell to read
        // instead. With bScale 0 (a series boxset, bargain-bin stock) it hid
        // the selection entirely.
        hf.visible = posterPixelCache.has(slot.movie.id)
          || textureArrayManager.hasArt(slot.movie.id)
          || bScale <= 0.0001;
        hb.visible = bScale > 0.0001;
        hf.position.set(fWorldX, fWorldY, fWorldZ);
        hf.rotation.set(slot.currentRotX, slot.frontRotY + theta, 0, CASE_EULER_ORDER);
        hf.scale.setScalar(Math.max(s, 0.0001));
        hb.position.set(bWorldX, bWorldY, bWorldZ);
        hb.rotation.set(slot.currentRotX, slot.backRotY + theta, 0, CASE_EULER_ORDER);
        hb.scale.setScalar(Math.max(bScale, 0.0001));

        tempPosition.set(fWorldX, fWorldY, fWorldZ);
        tempRotation.set(slot.currentRotX, slot.frontRotY + theta, 0, CASE_EULER_ORDER);
        tempQuaternion.setFromEuler(tempRotation);
        tempScale.set(0, 0, 0);
        tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
        slot.frontMesh.setMatrixAt(slot.instanceIdx, tempMatrix);
        slot.backMesh.setMatrixAt(slot.instanceIdx, tempMatrix);
        updatedMeshes.add(slot.frontMesh);
        updatedMeshes.add(slot.backMesh);
        continue;
      }

      if (this.heroSlotKey === slot.key) {
        // Slot just lost the hero (deselected) — its instances take over again.
        this.hideHeroCases();
      }

      // Per-case sideways lean (see CASE_LEAN_JITTER). Deterministic hash of the
      // movie id, computed once on first placement and cached. Face-out display
      // stands (fixtures) stay square — a propped-up display copy sits deliberately
      // straight; the packed aisle and wall shelves get the hand-stocked lean.
      if (slot.leanRotZ === undefined) {
        slot.leanRotZ = (isDisplayStand || slot.source === 'fixture')
          ? 0
          : (seededRandom01(slot.movie.id + '#lean') - 0.5) * CASE_LEAN_JITTER;
      }
      const leanZ = slot.leanRotZ;

      tempPosition.set(fWorldX, fWorldY, fWorldZ);
      tempRotation.set(slot.currentRotX, slot.frontRotY + theta, leanZ, CASE_EULER_ORDER);
      tempQuaternion.setFromEuler(tempRotation);
      // Cover box collapses to nothing until its art has streamed in (the
      // rental clamshell behind it carries the slot on its own meanwhile). The
      // poster callback re-dirties the slot, so it pops in when the art lands.
      //
      // ONLY when that clamshell is actually there, though. A series boxset IS
      // its own rental copy, so bScale is forced to 0 above (as it is for
      // noRentalCase bargain stock) — collapsing the cover box as well left the
      // shelf position EMPTY, and a whole TV/anime library then reads as a bare
      // fixture rather than a store still putting its sleeves out. Unpainted,
      // the box wears the house rental wrap, which is exactly how an unpainted
      // movie already reads. (Reported against v0.7.3: shelves rendering empty
      // while the same title showed its cover the moment it was selected.)
      const fs = (textureArrayManager.hasArt(slot.movie.id) || bScale <= 0.0001) ? s : 0;
      tempScale.set(fs, fs, fs * seriesZMult);
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      slot.frontMesh.setMatrixAt(slot.instanceIdx, tempMatrix);
      updatedMeshes.add(slot.frontMesh);

      tempPosition.set(bWorldX, bWorldY, bWorldZ);
      tempRotation.set(slot.currentRotX, slot.backRotY + theta, leanZ, CASE_EULER_ORDER);
      tempQuaternion.setFromEuler(tempRotation);
      tempScale.set(bScale, bScale, bScale);
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      slot.backMesh.setMatrixAt(slot.instanceIdx, tempMatrix);
      updatedMeshes.add(slot.backMesh);
    }

    // Remove settled non-selected slots from dirty set so they aren't iterated next frame
    for (const slot of settledSlots) {
      this.dirtySlots.delete(slot);
    }
    perfTrace.end(SP_SLOTS);

    // 2.1 Launch flourish: spin + fly the rental copy into the screen before playback.
    if (this.launchAnim) {
      this.updateLaunchAnimation(time);
      // The flying case moves fast enough that a fully frozen shadow would read as
      // wrong, but it doesn't need a full 4K pass every frame either — rebake at a
      // low rate while it's in flight instead of once per rendered frame.
      if (this.launchAnim && this.frameCount % 6 === 0) {
        this.renderer.shadowMap.needsUpdate = true;
        perfTrace.count(CT_SHADOW);
      }
    }

    // Mark matrix updates on modified InstancedMesh instances only.
    // boundingSphere = null: three.js caches an InstancedMesh's frustum-culling
    // sphere on first cull and never invalidates it when instance matrices
    // change — a sphere cached before placement (e.g. during the boot-time
    // environment bake) would cull fully-stocked shelves forever. Nulling it
    // here recomputes it on the next cull, only for meshes that actually moved.
    for (const mesh of updatedMeshes) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.boundingSphere = null;
    }

    // Real-time reflections are handled automatically by Reflector instances



    // 2.4 One-shot stocked-shelves environment re-bake (see pendingStockedRebake):
    // fires once the initial placement wave has settled — dirty queue empty and
    // enough frames elapsed for the first poster batches to have landed.
    // ALSO requires 2.5s of input silence (perf-trace baseline caught it firing
    // mid-flip-through: 5 probes × 6 faces + a 3-bounce PMREM = ~98ms in one
    // frame). It's a one-shot visual refinement — deferring it until the
    // shopper pauses costs nothing and can never hitch an interaction.
    if (this.stockedRebakeDue(time)) {
      this.pendingStockedRebake = false;
      this.outdoor.rebakeEnvironment();
    }

    // 2.5 Prebaked shadows: re-render the sun's shadow map only on frames where a
    // shadow-caster actually changed — a structural rebuild (shadowRefreshFrames) or a
    // live end-cap transition — plus once when a case-pop animation settles. The
    // clerk is a billboard sprite with a baked blob shadow (castShadow is never
    // set on her), so her walking never changes the shadow map (issue #96).
    // Case-pop lerps update instance matrices every frame (updatedMeshes.size > 0) but
    // a DVD case lifting 0.25ft doesn't visibly move its own shadow mid-lerp, so we no
    // longer rebake on every one of those frames; instead we rebake once when the set
    // of actually-moving slots (movingSlots) drops from >0 back to 0. The launch
    // flourish gets its own low-rate rebake above.
    const animatingNow = movingSlots > 0 || !!this.launchAnim;
    const settledThisFrame = this.hadAnimatingSlots && !animatingNow;
    this.hadAnimatingSlots = animatingNow;

    const forceShadowRefresh = this.shadowRefreshFrames > 0;
    if (forceShadowRefresh || shadowCastersMoved || settledThisFrame) {
      this.renderer.shadowMap.needsUpdate = true;
      perfTrace.count(CT_SHADOW);
      if (this.shadowRefreshFrames > 0) this.shadowRefreshFrames--;
    }

    // Geometry moved (or is settling into place) — the cached AO term is stale
    // even if the camera didn't move, so the AO render() wrapper must recompute
    // rather than replay it. Same signal set as the shadow rebake + mirror
    // refresh above; the clerk, selection arrow and signage are excluded from
    // the AO G-buffer, so their motion deliberately does NOT invalidate.
    if (forceShadowRefresh || shadowCastersMoved || animatingNow || settledThisFrame) {
      this.aoNeedsRefresh = true;
    }

    // Mirrors: refresh reflections only when the camera moved or the scene
    // structurally changed (rebuild, shelf pop, end-cap/clerk motion),
    // ≤1 mirror render per frame — see updateMirrorThrottle(). Unlike the
    // shadow map, a case-pop lerp IS visibly reflected on every frame it's
    // moving, so mirrors key off updatedMeshes.size (per-frame instance
    // matrix changes) rather than settledThisFrame. clerkWalking stays
    // un-gated by her frustum visibility on purpose: a dirty flag is only
    // consumed when a mirror is actually drawn by the main camera (see
    // installMirrorThrottle), so it's free with no mirror in view, and it
    // keeps her reflection walking in an in-view mirror while she's outside
    // the main frustum.
    // Stagger (perf-trace: mode-change frames piled the shadow rebake, an AO
    // recompute AND a mirror re-render into one ~37ms composite): while a
    // multi-frame structural rebake runs (shadowRefreshFrames), keep the
    // mirrors frozen and dirty them once on its LAST frame — the mirror's
    // full scene pass then lands after the shadow passes stop, not on top of
    // them, and the 1/frame drain budget spreads the rest.
    this.updateMirrorThrottle(shadowCastersMoved || clerkWalking ||
      this.clerkMirrorRefresh || updatedMeshes.size > 0 ||
      (forceShadowRefresh && this.shadowRefreshFrames === 0));
    this.clerkMirrorRefresh = false;
    mirrors.renderMirrorsAhead(this);

    // Fixture upkeep: desk terminal cursor blink; TV audio listener sync +
    // VideoTexture upload.
    this.entrance?.update(time);
    this.ambientTvs?.update(time);
    this.updateMarqueeBulbs(time); // T13: no-op unless bb_marquee_anim is 'chase'; see its own comment
    for (const f of this.slottedFixtures) f.update(time);

    // NB: clerk.update() moved to the pre-tier bookkeeping section (issue #96)
    // so she keeps roaming on frames the IDLE/VIDEO throttles skip.

    // 3. Render scene
    perfTrace.end(SP_SIM);
    perfTrace.begin(SP_RENDER);
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this.fullComposites++;
    // Arms (or disarms) the partial path for the frames that follow: this frame
    // has left a beauty buffer behind that the next one may patch.
    this.partial?.afterFullFrame();
    perfTrace.end(SP_RENDER);
  };

  // The one-shot stocked-shelves environment re-bake fires on the first frame
  // that satisfies all of this (see its call site). Asked by the partial-
  // composite gate too: a re-bake relights the whole room, so the frame it
  // lands on must be a full one. Read as a predicate rather than latching on
  // `pendingStockedRebake` alone, which can stay true indefinitely (dirty
  // slots, a busy input clock) and would park the partial path forever.
  private stockedRebakeDue(time: number): boolean {
    return this.pendingStockedRebake && this.frameCount > 300 && this.dirtySlots.size === 0 &&
      !this.launchAnim && time - this.lastRenderRequestTime > 2500;
  }

  // Partial-composite gate helper: is a mirror that owes a fresh reflection
  // actually on screen? A dirty mirror off-camera costs nothing (its dirt is
  // only consumed when the main camera draws it — see installMirrorThrottle),
  // but one in view would re-render on a full frame and change the picture, so
  // the partial path must stand down. Spheres are cached: mirrors never move.
  private dirtyMirrorInView(): boolean {
    if (this.mirrors.length === 0) return false;
    this._patchProj.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this._patchFrustum.setFromProjectionMatrix(this._patchProj);
    for (const m of this.mirrors) {
      if (!m.dirty) continue;
      const obj = m.r as THREE.Mesh;
      let sphere = obj.userData.patchSphere as THREE.Sphere | undefined;
      if (!sphere) {
        if (!obj.geometry.boundingSphere) obj.geometry.computeBoundingSphere();
        if (!obj.geometry.boundingSphere) return true; // can't prove it's off-screen
        sphere = obj.geometry.boundingSphere.clone().applyMatrix4(obj.matrixWorld);
        obj.userData.patchSphere = sphere;
      }
      if (this._patchFrustum.intersectsSphere(sphere)) return true;
    }
    return false;
  }

  // Partial-composite gate helper: is the eye inside the store proper? Out in
  // the vestibule or the lot (z >= 8.6 is the vestibule back wall, see
  // constrainWalkPosition) the storefront glazing sits between the camera and
  // the sets — and a glass pane is TRANSPARENT with depth-write off, so it
  // never occludes the patch, yet the full frame blends it over the tube. The
  // partial path would erase that, so it only runs indoors.
  private insideStorePatchZone(): boolean {
    const p = this.camera.position;
    if (p.z > 7.5 || p.z < this.backWallZ) return false;
    if (p.y > this.ceilingY || p.y < 0) return false;
    return Math.abs(p.x - 11.0) < this.getStoreWidth() / 2;
  }

  private readonly _patchFrustum = new THREE.Frustum();
  private readonly _patchProj = new THREE.Matrix4();

  public pauseAmbientTvs(): void {
    this.ambientTvs?.pause();
  }

  public resumeAmbientTvs(): void {
    this.ambientTvs?.resume();
  }

  // Halt rendering loop to yield system resources during video playback
  public pauseRendering() {
    this.isRendering = false;
    this.onConsoleLog("[System] Rendering paused. Resources yielded.", "system");
  }

  // Resume rendering loop on playback end
  public resumeRendering() {
    if (!this.isRendering) {
      this.isRendering = true;
      this.requestRender(); // draw a real frame immediately, don't wait for the idle heartbeat
      this.animate();
      this.onConsoleLog("[System] Rendering resumed.", "system");
    }
  }

  public pointerStartX = 0;
  public pointerStartY = 0;
  private pointerStartTime = 0;
  // Look-movement accumulated during the current press. Under pointer lock
  // clientX/Y freeze, so tap-vs-drag detection in walk mode must count
  // movementX/Y instead (see handleWalkMouseMove).
  private walkPressDragPx = 0;
  // Whether the pointer was ALREADY locked when the current press began.
  // Pointer lock is requested on pointerdown and usually engages before the
  // matching pointerup, so a press that STARTED unlocked must aim its click
  // at the press's screen point (where the visible cursor was when the user
  // committed the click), not at the view-center crosshair they couldn't see.
  public walkPressStartedLocked = false;

  private onPointerDown = (e: PointerEvent) => {
    this.requestRender();
    this.pointerStartX = e.clientX;
    this.pointerStartY = e.clientY;
    // e.timeStamp, not performance.now(): the press duration must measure the
    // user's actual click, not main-thread latency. A pointer-lock request or
    // a heavy frame (shadow bake, AO compute) landing mid-press can delay
    // pointerup PROCESSING by hundreds of ms, which used to disqualify
    // perfectly quick clicks as "long presses". Event timestamps share
    // performance.now()'s clock base and are stamped at input time.
    this.pointerStartTime = e.timeStamp;
    this.walkPressDragPx = 0;
    this.walkPressStartedLocked = this.isPointerLocked;

    if (this.isWalkAroundMode) {
      this.isDragging = true;
      // Re-engage the lock if it isn't held (first click after an Escape, or
      // a browser that refused the F-key request) — clicking is the classic
      // FPS "capture my mouse" gesture.
      if (!this.isPointerLocked) this.requestWalkPointerLock();
    }
  };

  /** Ask the browser to capture the mouse for FPS look. Never throws: some
   *  engines return a rejecting Promise (no user activation, e.g. the harness
   *  teleporting into walk mode), others throw synchronously, and a few
   *  webviews don't implement pointer lock at all — in every failure case
   *  mouse-look still works off raw movementX/Y deltas (see
   *  handleWalkMouseMove), just without edge-of-screen capture. */
  public requestWalkPointerLock() { return walk.requestWalkPointerLock(this); }

  private onPointerUp = (e: PointerEvent) => {
    this.requestRender();
    this.isDragging = false;

    if (this.isWalkAroundMode) {
      // A press with no real look-drag is a CLICK on whatever's under the
      // crosshair/cursor — pick it up without leaving your feet. Movement is
      // the ONLY discriminator (no press-duration cutoff): mouse-look always
      // accumulates movement fast, while a slow deliberate click doesn't, and
      // a duration gate silently ate clicks whenever pointer-lock engage or a
      // heavy frame (shadow bake, AO compute, SwiftShader) stretched the
      // press past the cutoff — the "can't click anything" bug.
      if (this.walkPressDragPx < 10) {
        this.handleWalkClick();
      }
      return;
    }

    const elapsed = e.timeStamp - this.pointerStartTime;
    const dx = e.clientX - this.pointerStartX;
    const dy = e.clientY - this.pointerStartY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Only handle quick taps/clicks without large movements (dragging/swiping)
    if (elapsed < 300 && dist < 10) {
      this.handlePointerClick(e);
    }
  };

  // How far (ft) a walk-mode click can reach. Roughly "a case you could lean
  // over and grab", not "any box across the store".

  /** Walk-mode click: raycast from the crosshair (pointer-locked — the OS
   *  cursor is captured, so the aim IS the view center) or the click point,
   *  and open the hit movie case in inspect. Backing out of that inspect
   *  returns to this exact standing pose (see backAction).
   *
   *  A press that BEGAN unlocked aims at its pointerdown screen point even if
   *  the lock it requested engaged before pointerup: the user clicked a case
   *  they could see under the OS cursor, and swapping their aim to a view
   *  center they had no crosshair on yet made the first click land on the
   *  wrong spot (usually nothing) every time. */
  public handleWalkClick() { return walk.handleWalkClick(this); }

  /** Open a clicked slot in the regular inspect view (same plumbing as
   *  jumpToTitle), remembering the walk pose so Back returns to it. */
  public walkInspectSlot(slot: MovieSlot) { return walk.walkInspectSlot(this, slot); }

  public getSlotFromIntersection(object: THREE.Object3D, instanceId: number): MovieSlot | null { return walk.getSlotFromIntersection(this, object, instanceId); }

  private handlePointerClick(e: PointerEvent) {
    // T21: at the entrance overview a tap/click acts like Enter on the focused
    // cursor (input is arrows/enter-first; the pointer is just a convenience).
    if (this.mode === 'overview') {
      this.selectAction();
      return;
    }
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this._raycaster.setFromCamera(this._mouse.set(x, y), this.camera);

    // 0a. Cast/crew name taps on the inspected retail case's back cover: the
    // hero front mesh carries the movie's real back artwork whose clickable
    // rows are recorded in backCoverRegions (normalized, top-left origin).
    if (this.mode === 'inspect' && this.isFlipped && this.heroFrontMesh && this.heroFrontMesh.visible && !this.getSelectedMovie()?.isSeries) {
      const hits = this._raycaster.intersectObject(this.heroFrontMesh, false);
      if (hits.length > 0 && hits[0].uv) {
        const movie = this.getSelectedMovie();
        const regions = movie ? backCoverRegions.get(movie.id) : undefined;
        if (movie && regions && regions.length > 0) {
          const v = 1 - hits[0].uv.y; // texture V is bottom-up; canvas is top-down
          const region = regions.find((r) => v >= r.y0 && v <= r.y1);
          if (region) {
            this.showPersonEndcap(region.name, region.kind);
            return;
          }
        }
      }
    }

    // 0a2. Recommendation clasps: a plain (non-instanced) Mesh, so the generic
    // fallthrough below can't see it — that loop only understands instanced
    // movie boxes and library-select end caps. Raycast the clasp set directly,
    // the same way the endcap does just below.
    {
      const hits = this._raycaster.intersectObjects(this.shelfClasps.pickables, false);
      if (hits.length > 0) {
        const target = this.shelfClasps.targetFor(hits[0].object);
        if (target) {
          this.callClerkToClasp(target);
          return;
        }
      }
    }

    // 0b. Endcap case taps: select, or confirm when already selected.
    if (this.mode === 'person-endcap' && this.personEndcap) {
      const hits = this._raycaster.intersectObjects(this.personEndcap.caseMeshes, false);
      if (hits.length > 0) {
        const idx = hits[0].object.userData.endcapIdx;
        if (typeof idx === 'number') {
          if (idx === this.personEndcap.selectedIdx) {
            this.onBrowseConfirm?.();
          } else {
            this.personEndcap.selectedIdx = idx;
            this.updateEndcapSelection();
            this.updateCameraTarget();
            this.onSelectionChange?.(this.getSelectedMovie());
          }
        }
      }
      return;
    }

    const intersects = this._raycaster.intersectObjects(this.scene.children, true);
    if (intersects.length === 0) return;

    for (const hit of intersects) {
      // 1. Check library end cap (library-select mode)
      if (this.mode === 'library-select') {
        let obj: THREE.Object3D | null = hit.object;
        while (obj) {
          if (obj.userData && typeof obj.userData.libraryIdx === 'number') {
            const libIdx = obj.userData.libraryIdx;
            if (libIdx >= 0 && libIdx <= this.libraries.length) {
              if (this.selectedLibraryIdx === libIdx) {
                const action = this.selectAction();
                if (action && this.onModeChange) {
                  this.onModeChange(this.mode);
                }
              } else {
                this.selectedLibraryIdx = libIdx;
                this.updateCameraTarget();
                this.onConsoleLog(`[System] Selected library: ${this.getActiveAisleName()}`, "system");
                if (this.onSelectionChange) {
                  this.onSelectionChange(null);
                }
              }
              return;
            }
          }
          obj = obj.parent;
        }
      }

      // 2. Check movie boxes (browse or inspect mode)
      if (this.mode === 'browse' || this.mode === 'inspect') {
        const slot = this.getSlotFromIntersection(hit.object, hit.instanceId!);
        if (slot) {
          if (this.mode === 'inspect') {
            return;
          }

          const isSameUnit = slot.source === 'fixture'
            ? (this.selectedUnitSource === 'fixture' && this.selectedFixtureId === slot.fixtureId)
            : (this.selectedUnitSource === 'shelving' && this.selectedUnitIdx === slot.unitIdx);

          if (
            isSameUnit &&
            this.selectedSide === slot.side &&
            this.selectedShelf === slot.shelfIdx &&
            this.selectedCol === slot.col
          ) {
            // Already selected — confirm via callback so overlay state in main.ts is checked.
            this.onBrowseConfirm?.();
          } else {
            if (slot.source === 'fixture') {
              this.selectedUnitSource = 'fixture';
              this.selectedFixtureId = slot.fixtureId!;
              this.selectedUnitIdx = -1;
            } else {
              this.selectedUnitSource = 'shelving';
              this.selectedFixtureId = null;
              this.selectedUnitIdx = slot.unitIdx;
            }
            this.selectedSide = slot.side;
            this.selectedShelf = slot.shelfIdx;
            this.selectedCol = slot.col;
            this.updateCameraTarget();
            
            if (this.onSelectionChange) {
              this.onSelectionChange(this.getSelectedMovie());
            }
          }
          return;
        }
      }
    }
  }

  // Window resize handler (Arrow function binds 'this' statically to prevent leaks)
  private onWindowResize = () => {
    this.requestRender();
    const width = this.container.clientWidth || window.innerWidth || 1280;
    const height = this.container.clientHeight || window.innerHeight || 720;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    // Same single sizing path the dynamic resolution scaler uses (issue #27);
    // it reads clientWidth/clientHeight itself and applies the current resScale.
    this.applyRenderResolution();
  }

  // Clean up WebGL resources
  public destroy(preservePosterCache = false) {
    this.isRendering = false;
    window.removeEventListener('resize', this.onWindowResize);

    // Every live-brand subscriber holds a canvas or material belonging to THIS
    // scene. Drop them before the teardown below disposes those resources, or a
    // later brand edit repaints into a disposed store (see brand-live.ts).
    resetBrandLive();

    // Hero cases + person endcap live outside this.meshes (shared geometry /
    // cached materials), so detach them explicitly.
    if (this.heroFrontMesh) { this.scene.remove(this.heroFrontMesh); this.heroFrontMesh = null; }
    if (this.heroBackMesh) { this.scene.remove(this.heroBackMesh); this.heroBackMesh = null; }
    this.heroMovieId = null;
    this.heroSlotKey = null;
    // Clasps own their geometry, materials and canvas textures outright (the
    // hero cases only borrow shared ones), so they free all three themselves.
    this.shelfClasps.dispose();
    if (this.personEndcap) this.closePersonEndcap(false);
    this.whiteoutEl()?.classList.remove('active', 'instant');

    // T22: carried-stack meshes hold cloned materials + pinned poster
    // textures — release them, but keep bb_carried so a rebuild/reload
    // rehydrates the picks. Also drop the clerk toast DOM node.
    this.carried?.dispose();
    this.carried = null;
    disposeClerkToast();

    // T23: tear the back room down but KEEP bb_rental — a settings rebuild or
    // reload during a lockout must boot right back into the room.
    this.clearRentalUnlockSchedule();
    if (this.backRoom) {
      this.backRoom.dispose();
      this.backRoom = null;
    }
    this.backRoomReadyPromise = Promise.resolve();
    this.rentalRecord = null;
    this.rentalUnlocked = false;
    disposeBackRoomFade();

    this.ambientTvs?.dispose();
    this.ambientTvs = null;
    nav.navOverlayForget(this); // TV peek / sub-nav index (disposes its cursor sets)
    // T21: overview cursors own canvas textures the generic traverse pass
    // below doesn't reach — dispose them explicitly (before the traverse so
    // their group is already out of the scene graph).
    this.overviewCursors?.dispose(this.scene);
    this.overviewCursors = null;
    this.overviewCrosshair?.remove();
    this.overviewCrosshair = null;
    // T13: the bulb InstancedMesh's geometry/material are torn down by the
    // generic scene.traverse dispose pass below (it's a THREE.Mesh like any
    // other) — just drop our references so a toggle-off rebuild doesn't hold
    // stale poster/bulb pointers.
    this.marqueeBulbsMesh = null;
    this.posterMarqueeFrames = [];
    this.clerk?.dispose(); // tear down her DOM prompt/dialog so rebuilds don't stack them
    this.entrance?.dispose();
    this.entrance = null;
    this.slottedFixtures.forEach(f => f.dispose());
    this.slottedFixtures = [];
    this.candyDisplays.forEach(f => f.dispose());
    this.candyDisplays = [];
    this.tipJars.forEach(f => f.dispose());
    this.tipJars = [];
    this.candyBoxGeo?.dispose();
    this.candyBoxGeo = null;
    this.candyBoxMats?.forEach((m) => m.dispose());
    this.candyBoxMats = null;
    this.outdoor.dispose();
    this.exterior?.dispose();
    this.exterior = null;

    // Clear active dynamic signage
    clearActiveSignage(this.scene, this.activeSignageObjects);

    if (this.prefetchTimeout) {
      clearTimeout(this.prefetchTimeout);
      this.prefetchTimeout = null;
    }
    
    // On a no-reload rebuild, keep the downloaded poster textures + their CPU
    // pixel data (and the shared/global case materials the persisted global
    // shaders reference) so the fresh scene re-stocks the shelves with no
    // Jellyfin refetch and no poster re-download.
    clearVideoCaseCache(preservePosterCache ? 'rebuild' : 'full');
    this.clearMovieBoxes();

    if (this.nrTextTex) {
      this.nrTextTex.dispose();
      this.nrTextTex = null;
    }
    if (this.nrLogoBodyTex) {
      this.nrLogoBodyTex.dispose();
      this.nrLogoBodyTex = null;
    }
    if (this.nrLogoYellowTex) {
      this.nrLogoYellowTex.dispose();
      this.nrLogoYellowTex = null;
    }
    if (this.entranceLogoYellowTex) {
      this.entranceLogoYellowTex.dispose();
      this.entranceLogoYellowTex = null;
    }
    // The 3D storefront sign owns its own textures/materials/geometries (the
    // generic scene traversal below re-disposes the GPU side harmlessly).
    if (this.storefrontLogo3D) {
      this.storefrontLogo3D.dispose();
      this.storefrontLogo3D = null;
    }

    
    if (this.promoSignTex) {
      this.promoSignTex.dispose();
      this.promoSignTex = null;
    }
    if (this.promoSignMat) {
      this.promoSignMat.dispose();
      this.promoSignMat = null;
    }
    if (this.promoSignRedMat) {
      this.promoSignRedMat.dispose();
      this.promoSignRedMat = null;
    }
    
    // Traverse and dispose materials/geometries of static shelves
    this.scene.traverse((object) => {
      if ((object as any).type === 'Reflector' || (object as any).isReflector) {
        if (typeof (object as any).dispose === 'function') {
          (object as any).dispose();
        }
      }
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach(m => m.dispose());
        } else {
          object.material.dispose();
        }
      }
    });

    this.partial?.dispose();
    this.partial = null;
    if (this.composer) {
      this.composer.passes.forEach(pass => {
        if (typeof pass.dispose === 'function') {
          pass.dispose();
        }
      });
      this.composer.dispose();
    }
    // Reflection-probe cube render targets: without this only the re-bake
    // path (generateReflectionProbes) ever released them, so each
    // 3D→flat/library-switch teardown leaked 5 cube RTs until context GC.
    this.probeRenderTargets.forEach((rt) => rt.dispose());
    this.probeRenderTargets = [];
    this.aoPass = null;
    this.floorAOTex?.dispose();
    this.floorAOTex = null;
    this.floorMat = null;

    window.removeEventListener('keydown', this.handleWalkKeyDown);
    window.removeEventListener('keydown', this.onClaspKey, true);
    this.renderer.domElement.removeEventListener('pointermove', this.onClaspPointerMove);
    window.removeEventListener('keyup', this.handleWalkKeyUp);
    window.removeEventListener('mousemove', this.handleWalkMouseMove);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);

    if (this.renderer) {
      this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
      this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp);
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
    this.libraryEndCaps = [];
  }

  // Helper to constrain player position in walk-around mode (allowing walking outside storefront doors)
  public constrainWalkPosition(oldX: number, oldZ: number, newX: number, newZ: number, storeWidth: number, minZ: number): { x: number; z: number } { return walk.constrainWalkPosition(this, oldX, oldZ, newX, newZ, storeWidth, minZ); }

  // First Person Walk Around Mode handlers
  private handleWalkKeyDown = (e: KeyboardEvent) => {
    this.requestRender();
    if (!this.isWalkAroundMode) return;

    if (keyboardOwnedByControl()) {
      return;
    }

    switch (e.key) {
      case 'w':
      case 'W':
        this.walkKeys.w = true;
        e.preventDefault();
        break;
      case 'a':
      case 'A':
        this.walkKeys.a = true;
        e.preventDefault();
        break;
      case 's':
      case 'S':
        this.walkKeys.s = true;
        e.preventDefault();
        break;
      case 'd':
      case 'D':
        this.walkKeys.d = true;
        e.preventDefault();
        break;
      case 'ArrowUp':
        this.walkKeys.ArrowUp = true;
        e.preventDefault();
        break;
      case 'ArrowDown':
        this.walkKeys.ArrowDown = true;
        e.preventDefault();
        break;
      case 'ArrowLeft':
        this.walkKeys.ArrowLeft = true;
        e.preventDefault();
        break;
      case 'ArrowRight':
        this.walkKeys.ArrowRight = true;
        e.preventDefault();
        break;
    }
  };

  private handleWalkKeyUp = (e: KeyboardEvent) => {
    this.requestRender();
    if (!this.isWalkAroundMode) return;

    switch (e.key) {
      case 'w':
      case 'W':
        this.walkKeys.w = false;
        break;
      case 'a':
      case 'A':
        this.walkKeys.a = false;
        break;
      case 's':
      case 'S':
        this.walkKeys.s = false;
        break;
      case 'd':
      case 'D':
        this.walkKeys.d = false;
        break;
      case 'ArrowUp':
        this.walkKeys.ArrowUp = false;
        break;
      case 'ArrowDown':
        this.walkKeys.ArrowDown = false;
        break;
      case 'ArrowLeft':
        this.walkKeys.ArrowLeft = false;
        break;
      case 'ArrowRight':
        this.walkKeys.ArrowRight = false;
        break;
    }
  };

  private handlePointerLockChange = () => {
    this.isPointerLocked = document.pointerLockElement === this.renderer.domElement;
  };

  private handleWalkMouseMove = (e: MouseEvent) => {
    // Wake the renderer on any pointer motion (browse or walk) so the picture is
    // never a frame behind the cursor — this fires before the walk-mode guard.
    this.requestRender();
    if (!this.isWalkAroundMode) return;

    // FPS mouse-look off raw movement deltas, locked or not. movementX/Y is
    // populated on every mousemove in all modern engines, so look works even
    // when pointer lock was refused or is unsupported (some webviews) — the
    // lock, requested on entering walk mode and on click, only adds
    // edge-of-screen capture. The old code required the lock OR a held
    // button, so on any lock failure bare mouse motion did nothing at all:
    // the "fps mouse controls don't work" bug.
    const MOUSE_SENSITIVITY = 0.0025;
    // Pointer-lock acquisition can emit one bogus giant movement event (the
    // OS cursor's jump to the recapture point reported as mouse motion —
    // long-standing Chromium behavior). Letting it through both whipped the
    // camera to a random heading on the click that engaged the lock AND
    // blew the tap-vs-drag budget, swallowing that click. No real mouse
    // move approaches 200px in a single 8ms event, so drop the outlier.
    const burst = Math.abs(e.movementX) + Math.abs(e.movementY);
    if (burst === 0 || burst > 200) return;
    this.yaw -= e.movementX * MOUSE_SENSITIVITY;
    this.pitch -= e.movementY * MOUSE_SENSITIVITY;
    // Clamp here as well as in the per-frame walk update, so a fast swipe
    // between renders can't wind pitch past vertical.
    this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch));
    this.lastWalkLookTime = performance.now(); // mouse-look counts as walk motion for the AO gate
    if (this.isDragging) this.walkPressDragPx += burst;
  };

  public updateWalkHUD() { return walk.updateWalkHUD(this); }

  public toggleWalkAround() { return walk.toggleWalkAround(this); }
}
