// T23 — The rental-mode "home" pocket: where you spend the lockout after
// checking out. Built as a DETACHED POCKET far outside the store shell
// (x +200) so it can never be seen from browsing and never perturbs the
// store's PMREM environment, reflection probes, or night lighting: it is
// created lazily on entry, sits well past the sun's shadow frustum, and its
// only lights are distance-capped point lights that fall to zero long before
// the store.
//
// The old boxed room (walls/ceiling/couch/lamp/door decor) was replaced by a
// studio-style BACKDROP: a flat gradient cyc plane + matching floor (see
// createBackdropTexture — the single swap point for a real photo backdrop).
// What remains is only what the rental fiction needs: the coffee table with
// the rented clamshells (+ receipt), and the TV/deck stack. The set is a PROP,
// not a screen — a tape confirmed here plays fullscreen like every other title
// in the app (owner ruling 2026-08-16), so the tube stays dark glass and the
// only thing the deck does is swallow the tape and hand it back.
//
// Owned by StoreScene (which stays the camera/mode brain); this module owns
// the backdrop, the rented-tape browsing (focus / inspect / flip — the tapes
// are rental clamshells: getRentalCaseGeometry +
// createHeroRentalMaterials), the CRT screen plane, the VCR clock, and every
// tween. update() runs only on composited frames and allocates nothing per
// frame.
//
// Props come from the T24 registry (getPropOrFallback): the set looks right
// with the sized primitive stand-ins and upgrades automatically when the real
// GLBs land in public/models/.
import * as THREE from 'three';
import type { Movie } from './jellyfin';
import {
  CASE_MEDIUM,
  getRentalCaseGeometry,
  getRentalCaseDepth,
  createHeroRentalMaterials,
} from './video-case';
import { getPropOrFallback, screenRectWorld, PropScreenRect, PropInstance } from './props';
import { makeCurvedScreenGeometry, makeTubeOverlayMaterial } from './crt-tube';
import { makeCrtGlassMaterial } from './glass-reflection';
import { tryLoadUserAssetTexture } from './user-assets';
import type { RentalRecord } from './rental-clock';
import { formatUnlockLabel, formatCheckoutStamp } from './rental-clock';
import { brandString } from './brand-pack';
import { BB_MONO, ensureBundledFont, bundledFontReady } from './bundled-fonts';
import { aniso, useCheapMaterials } from './canvas-textures';

// Room origin: +200ft in X from the store centreline (x=11) — far outside the
// shell, past every wall, mural, exterior pano and light probe.
export const BACK_ROOM_ORIGIN = new THREE.Vector3(211, 0, 0);

// Couch eye point + where the couch view looks (local to the room origin).
// Low and close, just above the table top and a short reach back from its
// near edge, looking ACROSS the surface rather than down onto the room. The
// tapes and the receipt are the subject at this range; the TV falls well
// behind the focal plane and is carried by the bokeh pass.
const VIEW_POS = new THREE.Vector3(0.34, 2.50, 2.42);
const VIEW_LOOK = new THREE.Vector3(0.30, 2.08, 0.42);
// Inspected tape hovers this far in front of the couch eye point.
const INSPECT_DIST = 1.18;

export type BackRoomState = 'view' | 'inspect' | 'inserting' | 'watching' | 'ejecting';

interface Tween {
  start: number;
  dur: number;
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromRot: THREE.Euler;
  toRot: THREE.Euler;
  fromScale: number;
  toScale: number;
  onDone?: () => void;
}

interface TapeEntry {
  movie: Movie;
  mesh: THREE.Mesh;
  /** Resting pose on the coffee table (local to the room group). */
  slotPos: THREE.Vector3;
  slotRot: THREE.Euler;
  tween: Tween | null;
}

export interface BackRoomOptions {
  log: (msg: string) => void;
}

// Flip-cycle spine stop (stage 2): equivalent to +π/2 − 0.28 (spine facing
// the couch, backed off ~16° so a sliver of the front cover shows), expressed
// as a continuation of the cycle's single spin direction — front (0) → back
// (−π) → spine (−3π/2 − 0.28) → front (−2π, normalized back to 0 on landing).
const SPINE_STOP_YAW = -Math.PI * 1.5 - 0.28;

// Resting yaw of a stacked case (lying flat, cover up): π/2 would point the
// spine (local −X) dead at the couch; backing off ~20° turns it so the case
// bottom edge also reads from the viewer's seat. Per-level jitter adds on top.
const STACK_REST_YAW = Math.PI / 2 - 0.35;

/**
 * Soft radial contact-shadow texture — this room's stand-in for a shadow map.
 * The set is lit by one small rig that casts nothing (addOwned forces
 * castShadow/receiveShadow off), and it sits past the sun's shadow frustum
 * anyway, so every "shadow" here is a drawn gradient laid on the surface
 * beneath the object. `peak` is the alpha directly under it, `mid` the alpha
 * at 60% of the radius; both reach zero at the edge.
 */
function softShadowTexture(peak: number, mid: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  g.addColorStop(0, `rgba(10, 18, 40, ${peak})`);
  g.addColorStop(0.6, `rgba(10, 18, 40, ${mid})`);
  g.addColorStop(1, 'rgba(10, 18, 40, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class BackRoom {
  public state: BackRoomState = 'view';
  public focusedIdx = 0;
  /** Inspect flip cycle: 0 = front, 1 = back, 2 = spine view. */
  public flipStage: 0 | 1 | 2 = 0;
  public doorUnlocked = false;

  private group = new THREE.Group();
  private tapes: TapeEntry[] = [];
  // The rented clamshells rest in ONE pile at the table centre: bottom case
  // centre at stackBaseY, one stackStep (case thickness + air) per level.
  private stackBaseY = 0;
  private stackStep = 0;
  private disposed = false;

  // TV / video
  private screenMesh: THREE.Mesh | null = null;
  private screenMat: THREE.MeshBasicMaterial | null = null;
  // Tube overlay + glass sheen panes over the picture — world-space like the
  // screen plane, so dispose() must release them explicitly (the group sweep
  // never sees them).
  private screenOverlay: THREE.Mesh | null = null;
  private screenGloss: THREE.Mesh | null = null;
  private tvGlow: THREE.PointLight | null = null;

  // World point at the far (header) end of the receipt's print — one half of
  // what the couch view's focal plane is aimed between. Set by buildDueNote.
  private notePrintFar: THREE.Vector3 | null = null;

  // VCR mouth (where the insert beat lands), local coords.
  private vcrMouth = new THREE.Vector3(0, 1.0, -4.35);

  // Diegetic VCR clock (dev-timer countdown / time of day, on the deck face)
  private vcrClock: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture } | null = null;
  private lastVcrSecond = -1;
  private record: RentalRecord | null = null;
  private devTimer = false;

  // Poses handed to StoreScene's camera lerp (world space). Never mutated
  // outside cameraPose().
  private readonly _pose = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  // Scratch (no per-frame allocations)
  private readonly _v = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    private opts: BackRoomOptions,
  ) {
    this.group.position.copy(BACK_ROOM_ORIGIN);
    this.group.name = 'back-room';
    scene.add(this.group);
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  /** Furnish the set. Async only for the T24 prop fetches. */
  async build(movies: Movie[], record: RentalRecord | null, devTimer: boolean): Promise<void> {
    this.record = record;
    this.devTimer = devTimer;
    this.buildBackdrop();
    this.buildLights();

    // T24 props (parallel; each falls back to a sized primitive when the GLB
    // hasn't been downloaded yet).
    const [table, tv, deck] = await Promise.all([
      getPropOrFallback('coffee_table'),
      getPropOrFallback('tv_hero', { hideScreen: true }),
      getPropOrFallback(CASE_MEDIUM === 'dvd' ? 'dvd_player' : 'vcr'),
    ]);
    if (this.disposed) return;

    const tableTopY = this.placeCoffeeTable(table);
    this.placeTvAndDeck(tv, deck);
    this.buildTapes(movies, tableTopY);
    this.buildDueNote(tableTopY);
    this.buildTableContactShadows(tableTopY);
    this.buildVcrClock();
    this.redrawClocks(true);
  }

  /** The coffee table's re-material (see placeCoffeeTable); ours to free. */
  private tableWood: THREE.MeshStandardMaterial | null = null;

  private roomMat(color: number, roughness = 0.9): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });
    m.envMapIntensity = 0.18; // the store's PMREM env is for the store — keep it faint here
    return m;
  }

  private addOwned(mesh: THREE.Mesh, parent: THREE.Object3D = this.group): THREE.Mesh {
    mesh.userData.roomOwned = true; // disposed with the room (props are handled separately)
    mesh.castShadow = false; // one small shadow-free light rig (ticket constraint)
    mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
  }

  // ── Backdrop ────────────────────────────────────────────────────────────────
  // The room shell is gone; the set sits in front of a studio-style cyc: one
  // large unlit vertical plane (the backdrop image) meeting a flat floor whose
  // colour matches the backdrop's bottom edge, so the seam reads as a soft
  // horizon. Both are MeshBasicMaterial — they render at their authored
  // colours regardless of the light rig, and the future photo backdrop won't
  // be tinted by it either.

  // The floor is painted with the backdrop's bottom-edge colour so the
  // floor/backdrop seam disappears. If you swap the backdrop for a photo,
  // retune this to the photo's bottom-edge colour.
  private static readonly BACKDROP_FLOOR_COLOR = 0x3a4258;

  /**
   * ▶▶ BACKDROP TEXTURE — THE ONE SWAP POINT ◀◀
   * This is the single place the backdrop image comes from. Today it's a
   * generated smooth vertical blue gradient; to use a real photo backdrop
   * (living room / kitchen / …) replace this method's body with:
   *
   *   const tex = new THREE.TextureLoader().load('/backdrops/living-room.jpg');
   *   tex.colorSpace = THREE.SRGBColorSpace;
   *   return tex;
   *
   * (and retune BACKDROP_FLOOR_COLOR above to the photo's bottom edge).
   * Nothing else needs to change — buildBackdrop() maps whatever texture this
   * returns onto the cyc plane, and dispose() releases it with the set.
   */
  private createBackdropTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 4; // gradient is horizontally uniform — 4px is plenty
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    // Dusk grade (was a bright daylight blue): the set is a couch + CRT at
    // tape-watching hour — a dim slate-blue void grounds the warm key light
    // and the TV glow instead of fighting them with midday sky.
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0.0, '#060d20'); // near-black indigo, top
    g.addColorStop(0.55, '#1a2440'); // mid slate blue
    g.addColorStop(0.92, '#3a4258'); // muted dusk horizon …
    g.addColorStop(1.0, '#3a4258'); // … held to the bottom (= floor colour)
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private buildBackdrop(): void {
    // The cyc plane: bottom edge on the floor (y=0) behind the TV, generously
    // oversized so no camera pose in this mode (couch view, inspect, the
    // entry lerp) can see past its edges.
    // Height is tuned so the couch view's visible band (~y 0-14 on the plane)
    // sweeps through most of the gradient instead of only its pale bottom.
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 30),
      new THREE.MeshBasicMaterial({ map: this.createBackdropTexture() }),
    );
    backdrop.position.set(0, 15, -16); // bottom edge exactly at y=0
    this.addOwned(backdrop);

    // Matching floor: catches every downward sightline so the set never
    // floats over void, and its colour continues the backdrop's bottom band.
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(60, 40),
      new THREE.MeshBasicMaterial({ color: BackRoom.BACKDROP_FLOOR_COLOR }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    this.addOwned(floor);

    // No area rug: at the close across-the-table framing this view now uses
    // (see VIEW_POS), the rug filled the lower third with woven red and pulled
    // the eye off the tapes and the receipt, which are what the shot is of.
    // The contact shadow below still ties the furniture to the ground plane.

    // Soft contact shadow under the furniture cluster (table + TV stand) so
    // the props sit ON the floor instead of hovering over flat colour.
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 32),
      new THREE.MeshBasicMaterial({ map: softShadowTexture(0.42, 0.22), transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, 0.01, -2.0); // spans the table (z≈0.9) and TV stand (z≈-5.3)
    shadow.scale.set(6.5, 5.6, 1);
    this.addOwned(shadow);
  }

  /**
   * Contact shadows on the TABLE TOP.
   *
   * The cluster shadow above grounds the furniture to the floor, and for a
   * view taken from eye height across the room that was the whole job. It
   * isn't any more: the camera now sits inches off the surface (VIEW_POS), so
   * the pile and the slip ARE the frame, and both were lying on wood with
   * nothing under them — reading as decals on the table rather than objects on
   * it. Same technique as the floor for the same reason: this room's one small
   * light rig casts no real shadows (see addOwned), so the grounding cue has
   * to be drawn.
   *
   * Both sit above the table and below what they ground — the lowest case's
   * underside is at +0.008 and the slip's at +0.006 (see buildTapes /
   * buildDueNote), so there is room for each without z-fighting the wood.
   */
  private buildTableContactShadows(tableTopY: number): void {
    // Under the pile. Darker and tighter than the floor's: this is a stack of
    // clamshells sitting flat on a hard surface a few inches from the lamp,
    // not a whole furniture cluster on a dim floor.
    const pile = new THREE.Mesh(
      new THREE.CircleGeometry(1, 24),
      new THREE.MeshBasicMaterial({ map: softShadowTexture(0.5, 0.26), transparent: true, depthWrite: false }),
    );
    pile.rotation.x = -Math.PI / 2;
    // OFFSET, not centred. A blob centred under the stack is almost entirely
    // occluded by the stack itself — which is how the first pass read as no
    // shadow at all. The key is the warm point at (-5.5, 6.0, 2.4) (buildLights),
    // so from the pile at (0.15, ~1.42) the throw runs +x and slightly -z:
    // normalize(5.65, -0.98) ≈ (0.985, -0.171). Push the blob that way by a
    // stack's-worth and it spills out on the far side, against bare wood, where
    // it can actually be seen. Elongated along the same axis for the same reason.
    pile.position.set(0.15 + 0.197, tableTopY + 0.004, 1.42 - 0.034);
    pile.scale.set(0.72, 0.44, 1); // clamshell footprint plus the gradient's falloff
    this.addOwned(pile);

    // Under the slip. Paper lying flat has almost no gap to shadow, so this is
    // much fainter, and it carries the slip's own -0.34 skew rather than
    // sitting square to the table — a shadow square to a skewed object is more
    // obviously wrong than no shadow at all.
    const slip = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: softShadowTexture(0.3, 0.13), transparent: true, depthWrite: false }),
    );
    slip.rotation.order = 'YXZ';
    slip.rotation.x = -Math.PI / 2;
    slip.rotation.y = -0.34;
    // Barely offset along the same throw: a sheet lying flat has no gap under
    // it to shadow, so this is an edge-darkening cue, not a cast shadow.
    slip.position.set(0.66 + 0.030, tableTopY + 0.003, 1.58 - 0.005);
    slip.scale.set(0.52, 1.18, 1);
    this.addOwned(slip);
  }

  private buildLights(): void {
    // The rig: a warm key from the front-left, a dim overhead fill, a
    // shoulder-height reading light (so an inspected cover held at the eye
    // point is legible), and the video-gated TV glow. All distance-capped
    // well inside the pocket, no shadows. The backdrop/floor are unlit
    // (MeshBasicMaterial) — these lights only shape the kept props.
    const key = new THREE.PointLight(0xffd9a8, 16, 26, 1.7);
    key.position.set(-5.5, 6.0, 2.4);
    this.group.add(key);
    const fill = new THREE.PointLight(0xffdcb0, 7.5, 26, 1.8);
    fill.position.set(0.5, 8.2, 1.6);
    this.group.add(fill);
    // Reading light: a soft warm point just over the couch shoulder so an
    // inspected cover (held up at the eye point) is actually legible.
    const reading = new THREE.PointLight(0xffe6c4, 5.0, 12, 1.6);
    reading.position.set(1.6, 6.2, 4.6);
    this.group.add(reading);
    this.tvGlow = new THREE.PointLight(0x86a4ff, 0, 15, 1.8);
    this.tvGlow.position.set(0, 3.4, -3.6);
    this.group.add(this.tvGlow);
  }

  /**
   * Timer expired. The old room's door + exit sign went with the shell — the
   * flag still gates nothing here (StoreScene owns the exit decision) but is
   * kept as the mode's public "may leave" state.
   */
  setDoorUnlocked(unlocked: boolean): void {
    this.doorUnlocked = unlocked;
  }

  /**
   * The GLB is Kenney's "Table Coffee Glass" — a dark frame with a GLASS top,
   * which in this room's single-lamp light read as pale celadon laminate
   * rather than glass (owner call, 2026-08-07: dark blonde wood instead).
   *
   * Re-materialled here rather than by swapping the model: the mesh is the
   * right shape and size, and this keeps the CC0 asset as-shipped instead of
   * forking it. Every surface takes the same board, pane included — a glass
   * top over wood legs is the thing being replaced, not a look worth half of.
   *
   * The grain is a real photo scan SHIPPED IN THE REPO at
   * public/textures/surfaces/table-wood (ambientCG WoodFloor043, CC0 — see its
   * NOTES.md), so every install gets it; a user-assets drop-in of the same name
   * still wins. Only when both are absent does the flat lit board colour stand
   * in, and it is a colour, not a procedural grain. Owner call after three
   * procedural attempts: drawn strokes read as corduroy, radial growth rings
   * as sand ripples, warped straight grain as burl. The GLB's UVs tile hard
   * across the top, which sets a scale none of them survived. Flat and
   * correctly lit beats invented grain.
   */
  private placeCoffeeTable(table: PropInstance): number {
    const wood = new THREE.MeshStandardMaterial({
      color: 0xb08a55, roughness: 0.62, metalness: 0.0,
    });
    this.tableWood = wood;

    // Below 1: the model's UVs already tile heavily across the top, so a
    // repeat of 1 lays ~20 boards across it. This puts roughly one plank run
    // over the surface, which is what a coffee table actually is.
    const fit = (tex: THREE.Texture) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(0.16, 0.16);
      tex.anisotropy = 8;
    };
    tryLoadUserAssetTexture('surfaces/table-wood/color.png', (tex) => {
      fit(tex); wood.map = tex; wood.color.setHex(0xffffff); wood.needsUpdate = true;
    });
    tryLoadUserAssetTexture('surfaces/table-wood/normal.png', (tex) => {
      fit(tex); wood.normalMap = tex; wood.normalScale.set(0.5, 0.5); wood.needsUpdate = true;
    }, { srgb: false });
    tryLoadUserAssetTexture('surfaces/table-wood/roughness.png', (tex) => {
      fit(tex); wood.roughnessMap = tex; wood.needsUpdate = true;
    }, { srgb: false });

    table.object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      // The GLB's own materials belong to the prop cache; dropping our
      // reference to them here is all this does.
      m.material = wood;
      m.castShadow = true;
      m.receiveShadow = true;
    });
    table.object.position.set(0, 0, 0.9);
    this.group.add(table.object);
    return table.size.y;
  }

  private placeTvAndDeck(tv: PropInstance, deck: PropInstance): void {
    // TV stand: open frame (top/bottom slabs, sides, middle shelf) so the
    // VCR/DVD deck visibly lives UNDER the TV.
    const standMat = this.roomMat(0x3d2e21, 0.75);
    const stand = new THREE.Group();
    const standZ = -5.3;
    stand.position.set(0, 0, standZ);
    const mk = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), standMat);
      m.position.set(x, y, z);
      this.addOwned(m, stand);
    };
    const standW = Math.max(3.2, tv.size.x + 0.7);
    mk(standW, 0.14, 1.8, 0, 1.53, 0);       // top slab (top at 1.6)
    mk(standW, 0.16, 1.8, 0, 0.08, 0);       // bottom slab
    mk(0.14, 1.6, 1.8, -standW / 2 + 0.07, 0.8, 0); // sides
    mk(0.14, 1.6, 1.8, standW / 2 - 0.07, 0.8, 0);
    mk(standW - 0.3, 0.08, 1.6, 0, 0.62, 0); // middle shelf
    this.group.add(stand);

    // TV on the stand, turned to face the couch (+z; props are prepped -z).
    const tvG = new THREE.Group();
    tvG.rotation.y = Math.PI;
    tvG.position.set(0, 1.6, standZ);
    tvG.add(tv.object);
    this.group.add(tvG);

    // Screen plane from the prop's glass rect (world space, computed once).
    if (tv.screenRect) {
      const rect = screenRectWorld(tv.screenRect, tv.object);
      this.buildScreenPlane(rect);
    }

    // Deck (VCR or DVD player per medium) on the middle shelf, facing the couch.
    const deckG = new THREE.Group();
    deckG.rotation.y = Math.PI;
    deckG.position.set(0, 0.66, standZ + 0.12);
    deckG.add(deck.object);
    this.group.add(deckG);
    // Insert-beat landing point: just in front of the deck's face, local coords.
    this.vcrMouth.set(0, 0.66 + deck.size.y * 0.55, standZ + 0.12 + deck.size.z / 2 + 0.35);
  }

  private buildScreenPlane(rect: PropScreenRect): void {
    // rect is WORLD-space here (screenRectWorld output). Build the picture
    // stack on it, facing along the rect normal with world-up kept upright —
    // the ambient-TVs "look-at with up constraint" recipe. Three curved
    // layers sharing one bulge (constant separation, no intersections):
    // picture, static tube overlay (rounded corners/vignette/sheen/scanlines,
    // crt-tube.ts), then the env-reflecting glass pane outermost.
    const bulge = Math.min(rect.width, rect.height) * 0.03;
    this.screenMat = new THREE.MeshBasicMaterial({ color: 0x05070d });
    const plane = new THREE.Mesh(makeCurvedScreenGeometry(rect.width, rect.height, bulge), this.screenMat);
    const fwd = rect.normal.clone().normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), fwd).normalize();
    const up = new THREE.Vector3().crossVectors(fwd, right).normalize();
    const basis = new THREE.Matrix4().makeBasis(right, up, fwd);
    plane.setRotationFromMatrix(basis);
    plane.position.copy(rect.center).addScaledVector(fwd, 0.015);
    this.scene.add(plane); // world-space (rect already includes the room offset)
    this.screenMesh = plane;

    // Corners/vignette/scanlines only darken, so they are safe over the idle
    // dark tube (which is all this set is ever asked to be).
    const overlay = new THREE.Mesh(
      makeCurvedScreenGeometry(rect.width, rect.height, bulge),
      makeTubeOverlayMaterial());
    overlay.setRotationFromMatrix(basis);
    overlay.position.copy(rect.center).addScaledVector(fwd, 0.024);
    this.scene.add(overlay);
    this.screenOverlay = overlay;

    // Curved-glass reflection over the picture: the tube reads as glass
    // instead of a flat emissive sticker (same recipe as the ceiling sets and
    // the desk terminals — glass-reflection.ts). Dialled right down, for the same
    // reason roomMat clamps envMapIntensity to 0.18: this pocket sits OUTSIDE
    // the store, so scene.environment is a bake of the WRONG ROOM. Turn this
    // up and the tube mirrors the storefront's window mullions THROUGH A WALL
    // (measured at intensity 0.07: tube-face mean luma 20 -> 31, with the
    // glazing legible). It has to stay a sheen — a hint that there's glass on
    // the front, never a picture of somewhere else. Extra roughness blurs what
    // does get through, which also suits a dim room.
    const gloss = new THREE.Mesh(
      makeCurvedScreenGeometry(rect.width, rect.height, bulge),
      makeCrtGlassMaterial({ intensity: 0.12, roughness: 0.3 }));
    gloss.setRotationFromMatrix(basis);
    gloss.position.copy(rect.center).addScaledVector(fwd, 0.033);
    gloss.renderOrder = 1; // reflections sit on top of the picture, like real glass
    this.scene.add(gloss);
    this.screenGloss = gloss;
  }

  // ── Rented tapes on the coffee table ───────────────────────────────────────

  private buildTapes(movies: Movie[], tableTopY: number): void {
    const n = Math.min(4, movies.length);
    const yaw = [-0.16, 0.12, -0.06, 0.2];
    // Nudged toward the camera's own x (0.34): centred on the room, the pile
    // sat left of frame and the bottom case ran off the edge.
    const jx = [0.17, 0.12, 0.185, 0.13];
    // Pulled toward the couch (was ~0.90, the table's centre): the view now
    // sits inches off the surface, and at the middle of the table the pile read
    // small and far. Still well inside the top — the stack's own footprint is
    // only a few inches deep.
    const jz = [1.42, 1.45, 1.38, 1.43];
    const caseThick = getRentalCaseDepth();
    this.stackStep = caseThick + 0.004;
    this.stackBaseY = tableTopY + caseThick / 2 + 0.008;
    for (let i = 0; i < n; i++) {
      const movie = movies[i];
      const isAnimated = CASE_MEDIUM === 'vhs' && movie.libraryName === 'Animated Movies';
      // What you took home is the STORE'S copy: the generic rental
      // clamshell (blue/gold panels with this title's printed label), not the
      // retail display box — the same per-title panel pipeline the shelf's
      // rental copies use. Panels are canvas-drawn from the box scan + movie
      // metadata, so no poster streaming is involved.
      const mesh = new THREE.Mesh(getRentalCaseGeometry(isAnimated), createHeroRentalMaterials(movie));
      mesh.rotation.order = 'YXZ';
      mesh.userData.roomOwnedShared = true; // shared geometry/materials — never disposed here
      // ONE pile at the table centre, tapes[0] on top (it boots focused, so
      // the top of the stack lifts first). Per-level yaw/x/z jitter keeps it
      // a hand-dropped stack, not an extrusion; applyFocusPoses() re-settles
      // the levels whenever a tape is out of the pile.
      const slotPos = new THREE.Vector3(jx[i % jx.length], this.stackBaseY + (n - 1 - i) * this.stackStep, jz[i % jz.length]);
      const slotRot = new THREE.Euler(-Math.PI / 2, STACK_REST_YAW + yaw[i % yaw.length], 0, 'YXZ');
      mesh.position.copy(slotPos);
      mesh.rotation.copy(slotRot);
      this.group.add(mesh);
      this.tapes.push({ movie, mesh, slotPos, slotRot, tween: null });
    }
    this.focusedIdx = 0;
    this.applyFocusPoses(performance.now());
  }

  /**
   * The rental receipt on the coffee table — a measured redraw of a real 1995
   * video-store register slip (owner reference, 2026-08-07), replacing the
   * landscape card with a house-colour header band that was here before. That
   * card was invented; this one follows the artifact.
   *
   * What the reference actually is: a narrow impact-printed slip, violet ribbon
   * ink on off-white stock, monospace throughout, no colour and no logo — the
   * header is TYPED, like every other line. Its shape is: transaction number
   * flush right, a centred address block, an asterisk rule, a centred store
   * tagline, a Store/Employee row, a second rule, then line items as PAIRS (an
   * all-caps title line, then an indented kind/price line), a dashed rule
   * before the totals, a `=====` rule before Amount Due, tender and change, the
   * member block, a centred thank-you couplet, a final rule, and a timestamp.
   *
   * Brand rules (CLAUDE.md #2): the wordmark and address come from brand canon,
   * NOT from the photo — same brandString keys the case wrap prints, so a brand
   * pack retitles the receipt with everything else. The reference's own chain
   * slogan is a real mark and does not ship; the tagline is a neutral house
   * line a pack can override.
   *
   * DUE BACK stays, and prints LAST and largest: this prop's diegetic job is
   * telling you when the tape is owed, and rental-clock is what drives the
   * lockout. Everything above it is period dressing.
   */
  private buildDueNote(tableTopY: number): void {
    if (!this.record) return;
    // A longer blank tail than the print needs, and deliberately so: the plane
    // is CENTRED on the table, so lengthening the paper walks the printed block
    // back up the slip, away from the couch. That buys the last line room to
    // stay inside the frame with a weekend's four items on the bill, and lands
    // it nearer the pile's focal plane into the bargain. Texel size is
    // 0.36/512 whatever H is, so nothing about the type changes.
    const W = 512, H = 1450;
    // Painted at 2x and scaled back down, so every coordinate below still reads
    // in the 512-wide layout the measurements were taken in while the print
    // carries twice the texels. It needs them at BOTH ends: the near end of the
    // slip is magnified on a 4K panel (512 across ~0.36ft fills ~1100 px there),
    // and the far end is minified into a third of that. Not on the low tier,
    // which is every software-GL run: 12 MB of canvas for print that tier's
    // resolution cannot resolve anyway.
    const SS = useCheapMaterials() ? 1 : 2;
    const canvas = document.createElement('canvas');
    canvas.width = W * SS;
    canvas.height = H * SS;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(SS, SS);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    // The slip lies FLAT and runs away from the lens, so its texture is sampled
    // at a grazing angle: ~1 texel per pixel across the width, ~4 down the
    // length. At the CanvasTexture default (anisotropy 1) the GPU picks one mip
    // for the worst axis, which blurs the readable axis just as hard — that is
    // what turned the header block into mush, more than the depth of field did.
    // Same treatment every other printed texture in the app gets (toSignTexture
    // in canvas-textures.ts).
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = aniso(16);

    const paint = () => {
      const mono = bundledFontReady(BB_MONO) ? BB_MONO : 'monospace';
      // Impact ribbon on thermal stock: a violet-leaning ink that is nowhere
      // near black, on paper that is nowhere near white.
      // Far darker than the ribbon actually is. The reference's ink is a mid
      // violet on white, but this slip is a lit MeshStandard surface under a
      // warm key: the lamp lifts the paper and crushes the contrast, and a
      // faithful violet came out invisible on screen. Overdriving to near-black
      // navy is what reads AS violet ink once the room has had its way with it.
      const INK = '#0d0e26', PAPER = '#f5f2e9';
      const L = 34, R = W - 34, CX = W / 2;
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = INK;
      ctx.textBaseline = 'alphabetic';

      // RIBBON BLEED, and the reason the body used to be unreadable from the
      // couch. Body type is 21px on 3-inch stock, so from the couch a glyph
      // stem lands about ONE screen pixel wide — and a stem that only half
      // covers its pixel can only ever be half ink, whatever colour it is.
      // Measured on the render before this: the darkest pixel in the totals
      // block reached 142/255 against 227 paper, 1.55:1, while DUE BACK (thick
      // enough to cover whole pixels) hit 6.13:1 off the SAME ink.
      //
      // So the fix is more ink on the paper rather than darker ink: outline
      // every glyph with a hairline in its own colour, which fattens the stem
      // by ~0.3px each side and pushes coverage past 1. That is also what the
      // artifact does — an impact head hammers the ribbon into the stock and
      // the ink spreads, which is why receipt type looks blunt and heavy up
      // close and never hairline-thin.
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.62;
      ctx.lineJoin = 'round';
      const ink = (t: string, x: number, y: number) => {
        ctx.fillText(t, x, y);
        ctx.strokeText(t, x, y);
      };

      const px = 21;
      const line = (y: number, size = px) => { ctx.font = `${size}px "${mono}", monospace`; return y; };
      const left = (t: string, y: number, x = L) => { ctx.textAlign = 'left'; ink(t, x, line(y)); };
      const right = (t: string, y: number) => { ctx.textAlign = 'right'; ink(t, R, line(y)); };
      const mid = (t: string, y: number) => { ctx.textAlign = 'center'; ink(t, CX, line(y)); };
      // Emphasis on a printer with no bold face: strike the row twice, a hair
      // apart, the way an impact head was made to shout.
      const heavy = (t: string, y: number, size: number) => {
        ctx.textAlign = 'center';
        ink(t, CX, line(y, size));
        ink(t, CX + 0.9, y);
      };
      // A rule is a printed row of characters, not a drawn line — the printer
      // had no graphics, which is why the reference's rules are asterisks.
      const rule = (ch: string, y: number) => {
        ctx.font = `${px}px "${mono}", monospace`;
        const w = ctx.measureText(ch).width || 1;
        mid(ch.repeat(Math.max(1, Math.floor((R - L) / w))), y);
      };
      // Price rows: label left, an aligned dollar column, amount flush right.
      const money = (label: string, amount: string, y: number, indent = 0) => {
        left(label, y, L + indent);
        ctx.textAlign = 'left'; ink('$', R - 118, line(y));
        right(amount, y);
      };

      const RENT = 3.25;
      // The slip lists what is ON THE TABLE, not what the record says:
      // record.items are catalog ids (unprintable), and resolveRentalMovies
      // silently drops any that no longer resolve — so the record's length
      // isn't even guaranteed to match the pile the receipt lies next to.
      const titles = this.tapes.map((t) => t.movie.title);
      const sub = titles.length * RENT;
      const tax = Math.round(sub * 0.0475 * 100) / 100;
      const f = (n: number) => n.toFixed(2);

      let y = 46;
      right(brandString('receipt-txn', '90103-00213995'), y); y += 40;
      mid(brandString('brand-wordmark-video', 'HALCYON VIDEO'), y); y += 26;
      mid(brandString('wrap-address-street', '2400 KINGFISHER PKWY').replace(/\s+/g, ' '), y); y += 26;
      mid(brandString('wrap-address-city', 'CEDAR FALLS, IA 50613').replace(/\s+/g, ' '), y); y += 34;
      rule('*', y); y += 30;
      mid(brandString('receipt-tagline', 'THANKS FOR RENTING WITH US!'), y); y += 30;
      left('Store: 0117', y); right('Employee : 00004', y); y += 12;
      rule('*', y + 14); y += 44;

      money('Balance', '0.00', y); y += 30;
      for (const title of titles) {
        left(title.toUpperCase().slice(0, 30), y); y += 26;
        money('Rental', f(RENT), y, 22); y += 30;
      }
      y += 6;
      ctx.textAlign = 'right'; ink('----------', R, line(y)); y += 30;
      money('Subtotal', f(sub), y); y += 26;
      money('Total Tax', f(tax), y); y += 12;
      ctx.textAlign = 'right'; ink('==========', R, line(y + 14)); y += 44;
      money('Amount Due', f(sub + tax), y); y += 44;
      money('Tendered VISA', f(sub + tax), y); y += 26;
      money('Change Due', '0.00', y); y += 46;

      left('Cust #: 0000123456', y); y += 26;
      left(`Name  : ${brandString('receipt-member', 'MEMBER')}`, y); y += 48;
      mid('Thank You for your Visit.', y); y += 26;
      mid('We appreciate your business.', y); y += 34;
      mid(brandString('rental-rules-note', 'PLEASE REWIND'), y); y += 34;
      rule('*', y); y += 30;
      // Store/terminal number is the store's (a pack may reissue it); the
      // date, clock and centiseconds are this transaction's own.
      left(`${brandString('receipt-register', '0117-06')}-${formatCheckoutStamp(this.record!)}`, y); y += 40;

      // The line this prop exists for, printed LAST, double-struck and far
      // bigger than the body: it has to read from the couch, across a focal
      // plane pinned to the tape pile rather than to the paper. Label over
      // time rather than the label/amount row the money lines use — side by
      // side, the two halves collide on 3-inch stock past ~34px, and the time
      // is the half worth the size.
      rule('*', y); y += 50;
      heavy('DUE BACK', y, 38); y += 58;
      heavy(this.devTimer ? 'IN 5 MINUTES' : formatUnlockLabel(this.record!), y, 48);

      tex.needsUpdate = true;
    };

    paint();
    ensureBundledFont(BB_MONO, paint);

    // Real receipt stock is ~3.1 in wide; this is printed a touch over that so
    // the small type still reads from the couch, which is where it is looked at.
    const note = new THREE.Mesh(
      new THREE.PlaneGeometry(0.36, 0.36 * (H / W)),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.94, metalness: 0 }),
    );
    note.rotation.order = 'YXZ';
    note.rotation.x = -Math.PI / 2;
    // NEGATIVE, and skewed rather than square to the lens. Rotating about +Y
    // swings the slip's NEAR end toward +X, so a positive angle threw the tail
    // out to the right; negative turns it clockwise seen from above, putting
    // the bottom of the slip further left than its top — the way it lies when
    // dropped from the near side of the table. The skew also carries the
    // focus: square to the lens, most of the slip's length sits at near depths
    // and falls outside the depth of field, while angled it keeps the printed
    // block broadside and in focus and lets only the tail go soft.
    note.rotation.y = -0.34;
    // Runs OUT OF FRAME toward the couch: its far end sits at the pile's depth
    // (the focal plane) and it trails down past the bottom edge of the view, so
    // the printed block lands in focus while the near end falls away — which is
    // what a receipt dropped on a table in front of you actually looks like.
    note.position.set(0.66, tableTopY + 0.006, 1.58);
    this.addOwned(note);
    // The far end of the print — the header block, the deepest thing on this
    // table anyone is asked to READ. focusDistance() balances the depth of
    // field between here and the tape pile; measured off the geometry rather
    // than typed in, so moving or resizing the slip re-aims the focus with it.
    note.updateMatrixWorld(true);
    this.notePrintFar = note.localToWorld(new THREE.Vector3(0, 0.36 * (H / W) * 0.40, 0));
  }

  private buildVcrClock(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 48;
    const ctx = canvas.getContext('2d')!;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.vcrClock = { canvas, ctx, tex };
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.155),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    // On the deck's face, just under the tape mouth.
    face.position.set(0.28, this.vcrMouth.y - 0.12, this.vcrMouth.z - 0.28);
    this.addOwned(face);
  }

  // Redraw the VCR display (dev-timer countdown, else digital real time).
  // Called from update() only when the displayed value actually changes — and
  // only on composited frames, so an IDLE room repaints nothing.
  private redrawClocks(force: boolean): void {
    const now = new Date();
    if (this.vcrClock) {
      let text: string;
      let changed = force;
      if (this.devTimer && this.record) {
        const remain = Math.max(0, Math.ceil((Date.parse(this.record.unlockAt) - Date.now()) / 1000));
        if (remain !== this.lastVcrSecond) { this.lastVcrSecond = remain; changed = true; }
        text = `${Math.floor(remain / 60)}:${(remain % 60).toString().padStart(2, '0')}`;
      } else {
        const m = now.getMinutes();
        if (m !== this.lastVcrSecond) { this.lastVcrSecond = m; changed = true; }
        let h = now.getHours() % 12;
        if (h === 0) h = 12;
        text = `${h}:${m.toString().padStart(2, '0')}`;
      }
      if (changed) {
        const { ctx, tex } = this.vcrClock;
        ctx.fillStyle = '#080a08';
        ctx.fillRect(0, 0, 192, 48);
        ctx.fillStyle = this.devTimer ? '#ff9a3c' : '#37e05a';
        ctx.font = 'bold 34px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(text, 96, 36);
        tex.needsUpdate = true;
      }
    }
  }

  // ── Browse / inspect / flip (miniature of the shelf flow) ─────────────────

  get tapeCount(): number {
    return this.tapes.length;
  }

  focusedMovie(): Movie | null {
    return this.tapes[this.focusedIdx]?.movie ?? null;
  }

  /** Cycle focus between the table tapes (room view only). */
  focusStep(dir: number): boolean {
    if (this.state !== 'view' || this.tapes.length === 0) return false;
    this.focusedIdx = (this.focusedIdx + dir + this.tapes.length) % this.tapes.length;
    this.applyFocusPoses(performance.now());
    return true;
  }

  // Retarget every tape to its pile/focus pose. The focused tape is always
  // OUT of the pile (hovering in view mode, up at the couch or inside the
  // deck otherwise), so the remaining tapes first close up into a settled
  // stack — array order top→bottom — and the focused one floats above the
  // new pile top, tilted up toward the couch so its cover reads.
  private applyFocusPoses(now: number): void {
    let level = 0; // resting tapes counted bottom-up, last-in-array lowest
    for (let i = this.tapes.length - 1; i >= 0; i--) {
      if (i === this.focusedIdx) continue;
      const t = this.tapes[i];
      t.slotPos.y = this.stackBaseY + level * this.stackStep;
      level++;
      this.startTween(t, now, 320, t.slotPos.clone(), t.slotRot.clone(), 1);
    }
    const f = this.tapes[this.focusedIdx];
    if (!f) return;
    // Where the focused tape would land if it dropped back on the pile — the
    // eject/return tweens target slotPos, so keep it pinned to the pile top.
    f.slotPos.y = this.stackBaseY + level * this.stackStep;
    if (this.state !== 'view') return; // couch eye point / deck owns it
    const toPos = this._v.set(f.slotPos.x, f.slotPos.y + 0.3, f.slotPos.z - 0.05).clone();
    // Hover cover-first toward the couch (only the jitter share of the rest
    // yaw carries over — not the spine-to-viewer stack turn).
    const toRot = new THREE.Euler(-0.55, (f.slotRot.y - STACK_REST_YAW) * 0.4, 0, 'YXZ');
    this.startTween(f, now, 320, toPos, toRot, 1);
  }

  // Wrap the focused tape's current yaw into (−π, π] before tweening away
  // from the inspect flip cycle — the spine / front-return stops park the yaw
  // beyond −π, and a rest tween from there would wind through extra turns.
  private normalizeFocusedYaw(): void {
    const t = this.tapes[this.focusedIdx];
    if (!t) return;
    const y = t.mesh.rotation.y;
    t.mesh.rotation.y = y - Math.PI * 2 * Math.round(y / (Math.PI * 2));
  }

  /** Zoom the focused tape up to the couch eye point (Enter from room view). */
  inspectFocused(): boolean {
    if (this.state !== 'view' || this.tapes.length === 0) return false;
    const t = this.tapes[this.focusedIdx];
    this.state = 'inspect';
    this.flipStage = 0;
    this.normalizeFocusedYaw();
    const toPos = VIEW_POS.clone().add(this._v.set(0, -0.02, -INSPECT_DIST));
    const toRot = new THREE.Euler(0, 0, 0, 'YXZ'); // front cover faces the couch (+z)
    this.startTween(t, performance.now(), 420, toPos, toRot, 1);
    this.opts.log(`[System] Reading the box: "${t.movie.title}".`);
    return true;
  }

  /** Harness: focus (and inspect) a rented tape by title substring. */
  inspectByTitle(query?: string): boolean {
    if (this.tapes.length === 0) return false;
    let idx = 0;
    if (query) {
      const q = query.toLowerCase();
      idx = this.tapes.findIndex((t) => t.movie.title.toLowerCase().includes(q));
      if (idx < 0) return false;
    }
    if (this.state === 'inspect') this.closeInspect();
    this.focusedIdx = idx;
    this.applyFocusPoses(performance.now());
    return this.inspectFocused();
  }

  /** Flip the inspected case: front -> back -> spine -> front again. */
  toggleFlip(): boolean {
    if (this.state !== 'inspect') return false;
    this.flipStage = ((this.flipStage + 1) % 3) as 0 | 1 | 2;
    const t = this.tapes[this.focusedIdx];
    const toPos = VIEW_POS.clone().add(this._v.set(0, -0.02, -INSPECT_DIST));
    // One continuous spin direction through the whole cycle (see
    // SPINE_STOP_YAW); the front-return lands at −2π, visually identical to
    // 0, and is snapped there so yaw never accumulates across cycles.
    const yaw = this.flipStage === 1 ? -Math.PI : this.flipStage === 2 ? SPINE_STOP_YAW : -Math.PI * 2;
    const toRot = new THREE.Euler(0, yaw, 0, 'YXZ');
    const onDone = this.flipStage === 0 ? () => { t.mesh.rotation.y = 0; } : undefined;
    this.startTween(t, performance.now(), 380, toPos, toRot, 1, onDone);
    return true;
  }

  /** Put the inspected tape back on the table. */
  closeInspect(): void {
    if (this.state !== 'inspect') return;
    this.state = 'view';
    this.flipStage = 0;
    this.normalizeFocusedYaw();
    this.applyFocusPoses(performance.now());
  }

  /**
   * The insert beat: the inspected case dives to the deck and slides in
   * (~1.7s, two simple tweens — no rigged animation), then `onInserted` fires
   * (the owner starts fullscreen playback there).
   */
  beginInsert(onInserted: () => void): boolean {
    if (this.state !== 'inspect' || this.tapes.length === 0) return false;
    const t = this.tapes[this.focusedIdx];
    this.state = 'inserting';
    this.flipStage = 0;
    this.normalizeFocusedYaw();
    const now = performance.now();
    const mouth = this.vcrMouth.clone();
    // Leg 1: swoop down to the deck mouth, going flat (cover up, spine to couch).
    this.startTween(t, now, 700, mouth, new THREE.Euler(-Math.PI / 2, 0, 0, 'YXZ'), 1, () => {
      // Leg 2: slide into the slot and shrink away inside.
      const inPos = mouth.clone();
      inPos.z -= 0.85;
      inPos.y -= 0.04;
      this.startTween(t, performance.now(), 620, inPos, new THREE.Euler(-Math.PI / 2, 0, 0, 'YXZ'), 0.72, () => {
        t.mesh.visible = false;
        this.state = 'watching';
        if (this.tvGlow) this.tvGlow.intensity = 7;
        onInserted();
      });
    });
    return true;
  }

  /** Player closed: eject the tape back onto the table, room view again. */
  private ejectTape(): void {
    const t = this.tapes[this.focusedIdx];
    if (!t) {
      this.state = 'view';
      return;
    }
    this.state = 'ejecting';
    if (this.tvGlow) this.tvGlow.intensity = 0;
    t.mesh.visible = true;
    t.mesh.position.copy(this.vcrMouth);
    t.mesh.rotation.set(-Math.PI / 2, 0, 0);
    t.mesh.scale.setScalar(0.72);
    this.startTween(t, performance.now(), 750, t.slotPos.clone(), t.slotRot.clone(), 1, () => {
      this.state = 'view';
      this.applyFocusPoses(performance.now());
    });
  }

  private startTween(
    t: TapeEntry,
    now: number,
    dur: number,
    toPos: THREE.Vector3,
    toRot: THREE.Euler,
    toScale: number,
    onDone?: () => void,
  ): void {
    t.tween = {
      start: now,
      dur,
      fromPos: t.mesh.position.clone(),
      toPos,
      fromRot: t.mesh.rotation.clone(),
      toRot,
      fromScale: t.mesh.scale.x,
      toScale,
      onDone,
    };
  }

  // ── Watching (the movie plays FULLSCREEN, never on this CRT) ──────────────

  /**
   * Playback from the couch is over — or never started. The tape rides back
   * out of the deck onto the table and the tube goes dark again.
   *
   * The room's CRT is a prop, not a screen: a tape confirmed here plays
   * fullscreen like every other title in the app (owner ruling 2026-08-16),
   * so there is no texture to detach and no audio graph to unpick — the only
   * thing that has to be undone is the insert beat.
   */
  endWatching(): void {
    if (this.tvGlow) this.tvGlow.intensity = 0;
    if (this.state === 'watching' || this.state === 'inserting') this.ejectTape();
  }

  /** Pins the ACTIVE tier while any tape tween runs. */
  isAnimating(_now: number): boolean {
    for (let i = 0; i < this.tapes.length; i++) {
      if (this.tapes[i].tween) return true;
    }
    return false;
  }

  // ── Camera poses for StoreScene's lerp ─────────────────────────────────────

  /**
   * Focal plane for this view's depth-of-field pass, as a distance from the
   * couch eye point.
   *
   * TWO subjects share this table and both are read: the tape pile's spine,
   * and the receipt — which lies flat and runs AWAY from the lens, so its print
   * spans a foot of depth on its own (measured: the slip's bbox runs 0.57 to
   * 1.60 ft out, against a pile at 1.14). Pinning the plane on the pile, as
   * this used to, put the receipt's header a third of the focal distance
   * BEYOND it and blurred the top half of the slip into mush — the owner's
   * report, 2026-08-16.
   *
   * So aim between the two: the pile, and the far end of the print (the
   * deepest line anyone has to read). With the aperture the couch view now
   * uses, that band covers the whole slip and the spine alike, while the TV
   * seven feet back still falls apart exactly as before.
   */
  focusDistance(): number {
    const eye = this._pose.pos.set(VIEW_POS.x, VIEW_POS.y, VIEW_POS.z).add(BACK_ROOM_ORIGIN);
    const pile = this._v.set(0, this.stackBaseY, 1.42).add(BACK_ROOM_ORIGIN);
    if (this.notePrintFar) pile.lerp(this.notePrintFar, 0.5);
    return eye.distanceTo(pile);
  }

  cameraPose(): { pos: THREE.Vector3; look: THREE.Vector3 } {
    this._pose.pos.copy(BACK_ROOM_ORIGIN).add(VIEW_POS);
    if (this.state === 'inspect') {
      // Ease in toward the held case so it fills the frame.
      this._pose.look.copy(BACK_ROOM_ORIGIN).add(VIEW_POS).add(this._v.set(0, -0.02, -INSPECT_DIST));
    } else {
      this._pose.look.copy(BACK_ROOM_ORIGIN).add(VIEW_LOOK);
    }
    return this._pose;
  }

  // ── Per-composited-frame update (no allocations) ───────────────────────────

  update(now: number, _camera: THREE.PerspectiveCamera): void {
    // Tape tweens (smoothstep; rotation lerped component-wise — all our poses
    // are built from the same YXZ ranges so no wrap-around occurs).
    for (let i = 0; i < this.tapes.length; i++) {
      const t = this.tapes[i];
      const tw = t.tween;
      if (!tw) continue;
      const k = Math.min(1, (now - tw.start) / tw.dur);
      const e = k * k * (3 - 2 * k);
      t.mesh.position.lerpVectors(tw.fromPos, tw.toPos, e);
      t.mesh.rotation.set(
        tw.fromRot.x + (tw.toRot.x - tw.fromRot.x) * e,
        tw.fromRot.y + (tw.toRot.y - tw.fromRot.y) * e,
        tw.fromRot.z + (tw.toRot.z - tw.fromRot.z) * e,
      );
      t.mesh.scale.setScalar(tw.fromScale + (tw.toScale - tw.fromScale) * e);
      if (k >= 1) {
        t.tween = null;
        tw.onDone?.();
      }
    }

    // Diegetic clocks — cheap change-detection, repaint only when the shown
    // value ticks over (and only on frames the scene composited anyway).
    this.redrawClocks(false);
  }

  // ── Teardown ───────────────────────────────────────────────────────────────

  dispose(): void {
    this.disposed = true;

    // Tape meshes use module-cached rental geometry/materials
    // (roomOwnedShared) — nothing per-tape to release here.
    this.tapes = [];

    // Screen stack lives in world space (outside the group), so the group
    // sweep below never reaches it — release all three layers explicitly.
    // The overlay's texture is the module-cached crt-tube art shared by every
    // CRT in the app: dispose the material only, never its map. (The gloss
    // pane used to be skipped entirely here and leaked per room teardown.)
    if (this.screenMesh) {
      this.scene.remove(this.screenMesh);
      this.screenMesh.geometry.dispose();
      (this.screenMesh.material as THREE.Material).dispose();
      this.screenMesh = null;
      this.screenMat = null;
    }
    for (const pane of [this.screenOverlay, this.screenGloss]) {
      if (!pane) continue;
      this.scene.remove(pane);
      pane.geometry.dispose();
      (pane.material as THREE.Material).dispose();
    }
    this.screenOverlay = null;
    this.screenGloss = null;

    // Dispose everything the room owns. Real-GLB prop clones share the props
    // registry's template geometry/materials (roomOwned unset) — skip those;
    // fallback primitives own theirs (marked propFallback by props.ts).
    const seenGeo = new Set<THREE.BufferGeometry>();
    const seenMat = new Set<THREE.Material>();
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      let owned = !!mesh.userData.roomOwned;
      for (let p: THREE.Object3D | null = o; p && !owned; p = p.parent) {
        if (p.userData.propFallback) owned = true;
      }
      if (!owned) return;
      if (mesh.geometry) seenGeo.add(mesh.geometry);
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) if (m) seenMat.add(m);
    });
    seenGeo.forEach((g) => g.dispose());
    seenMat.forEach((m) => {
      const tex = (m as THREE.MeshStandardMaterial).map;
      if (tex) tex.dispose();
      m.dispose();
    });
    if (this.tableWood) {
      // Both maps by hand: the sweep above only frees `.map`, and this material
      // also carries a roughnessMap.
      this.tableWood.map?.dispose();
      this.tableWood.normalMap?.dispose();
      this.tableWood.roughnessMap?.dispose();
      this.tableWood.dispose();
      this.tableWood = null;
    }
    this.vcrClock?.tex.dispose();
    this.vcrClock = null;
    this.tvGlow = null;
    this.scene.remove(this.group);
  }
}

// ── Black fade overlay (checkout → back room → store transitions) ────────────
// One lazily-created DOM node, reused. fadeToBlack resolves once fully dark;
// fadeFromBlack starts revealing immediately and cleans itself up.

let fadeEl: HTMLDivElement | null = null;

function ensureFadeEl(): HTMLDivElement {
  if (!fadeEl) {
    fadeEl = document.createElement('div');
    fadeEl.id = 'backroom-fade';
    fadeEl.style.cssText =
      'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;' +
      'z-index:1500;transition:opacity 0.55s ease;';
    document.body.appendChild(fadeEl);
  }
  return fadeEl;
}

export function fadeToBlack(): Promise<void> {
  const el = ensureFadeEl();
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      el.removeEventListener('transitionend', done);
      resolve();
    };
    el.addEventListener('transitionend', done);
    // Transition-skip guard: if opacity is already 1 no transition fires.
    requestAnimationFrame(() => {
      if (getComputedStyle(el).opacity === '1') done();
      el.style.opacity = '1';
    });
    // Watchdog: transitionend can be swallowed (display toggles, reduced
    // motion). The fade is 550ms; resolve regardless shortly after.
    window.setTimeout(done, 900);
  });
}

export function fadeFromBlack(): void {
  const el = ensureFadeEl();
  el.style.opacity = '0';
}

export function disposeBackRoomFade(): void {
  fadeEl?.remove();
  fadeEl = null;
}
