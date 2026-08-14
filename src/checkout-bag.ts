// CheckoutBag — the glossy white plastic rental bag on the inner counter, as a
// real (tiny) soft body. The bag is a "pillow bag" exactly like the physical
// die-cut-handle merch bags video stores used: two thin sheets welded together
// down both side seams and across the bottom, open at the mouth, with a raised
// tab across the middle of the top edge and a punched grab hole through both
// layers (the hole is an alpha cutout in the printed texture, so it deforms
// with the plastic like a real die-cut).
//
// The cloth is a ~340-node Verlet lattice (structural + shear + bend
// constraints, weak rest-shape stiffness so empty glossy plastic stands up on
// its own) that COLLIDES with everything dropped inside: each case/candy box
// handed to drop() becomes an oriented-box collider the sheets get pushed out
// around — put a tape in and the bag visibly deforms around the tape, exactly
// like plastic film over a hard object. pickUp() pins the die-cut handle,
// gathers it, and lifts: the bottom un-pins and the whole body drapes and
// droops off the handle under gravity (with a damped carry sway) before
// settling back onto the counter.
//
// Cost discipline (the app idles for days): the bag is hidden and the solver
// never runs outside show()..hide(); while shown, the solver puts itself to
// SLEEP the moment the cloth settles (max node velocity below epsilon for half
// a second) and wakes only on a new drop/lift. Asleep or hidden, update() does
// no geometry writes and no allocations. Whole mesh is ~620 triangles.
import * as THREE from 'three';
import { drawLogo } from './logo-renderer';
import { getActiveLogoSpec } from './logo-spec';
import { registerBrandRepaint } from './brand-live';
import { getActiveTheme } from './themes';

// ─── Bag dimensions (feet, bag-local: origin at the counter top under the
// bag's centre, +y up, x across the width, z through the thickness) ─────────
const HALF_W = 0.80; // 1.6 ft wide
const BODY_H = 1.42; // side-seam height (mouth line)
const TAB_RISE = 0.34; // die-cut tab above the mouth
const TOTAL_H = BODY_H + TAB_RISE;
const HOLE_R = 0.13; // punched handle hole
const HOLE_CY = BODY_H + TAB_RISE * 0.54;

// Lattice resolution. COLS columns per sheet (seam columns shared), ROWS body
// row intervals, plus TAB_ROWS extra rows for the tab columns only.
const COLS = 13; // i = 0..12, x = -HALF_W + i * (2*HALF_W/12)
const ROWS = 12; // r = 0..12, y = 0.02 .. BODY_H
const TAB_I0 = 3;
const TAB_I1 = 9; // tab spans columns 3..9 (|x| <= 0.4)
const TAB_COLS = TAB_I1 - TAB_I0 + 1;

// Solver tuning.
const STEP_MS = 1000 / 60;
const MAX_SUBSTEPS = 3;
const GRAVITY = -20; // ft/s² — thin plastic, heavily damped, reads right
const DAMP = 0.985;
const ITERATIONS = 5;
const REST_K_STAND = 0.055; // glossy plastic holds its die-cut silhouette…
const REST_K_LIFT = 0.012; // …but drapes once it hangs from the handle
const COLLIDE_MARGIN = 0.05; // plastic film thickness over the contents — wide enough
// that a low-poly cloth node's straight-line gap to its neighbors never dips
// inside a case corner (point collision can't stop a sharp feature poking
// through the triangle BETWEEN three correctly-pushed nodes; the margin is
// what buys that slack back)
// Extra margin while `lifting` only: the item translates fastest during the
// rise, and a case edge has been seen poking through mid-swing (settling
// clean again once the hold takes over) — widen the collision envelope only
// for that brief volatile window rather than permanently ballooning the
// bag's resting silhouette.
const LIFT_COLLIDE_MARGIN = 0.16;
const FLOOR_Y = 0.012;

// Load-driven sag & stretch. Every item weighs on the plastic: the more (and
// heavier) the contents, the less the bag holds its crisp die-cut shape (it
// slumps around what's inside) and the more its vertical spans stretch (the
// film pulls taut and drapes lower). Per-item weight is the collider's volume
// normalized so a DVD keepcase = 1 "tape" — VHS clamshells are chunkier so
// they weigh ~2–3× a DVD and sag/stretch the bag noticeably further, while a
// candy box is small and barely loads it. Games inherit this for free (a
// cartridge rents in the VHS shell → heavy, a disc game in a keepcase → light).
const DVD_REF_VOL = 0.445 * 0.667 * 0.045; // ≈ 0.0134 ft³, one keepcase = 1 unit
const WEIGHT_EXP = 1.3; // >1 widens the VHS-vs-DVD heft gap (2.3× volume → ~3× weight)
const LOAD_FULL = 3.4; // total weight that reaches "fully loaded" sag (≈ 3 DVDs / 1 heavy VHS pile)
const LOAD_EASE = 0.07; // per-step lerp of the eased load — the sag beds in over ~0.25 s
const SAG_SLUMP = 0.6; // at full load the rest-shape spring weakens this much (bag slumps)
const SAG_STRETCH = 0.17; // at full load vertical spans elongate up to +17% (plastic stretches)
const BASE_SPLAY = 0.35; // at full load the pinned bottom seam is this much freer to splay

// Pick-up flourish phases (bag-clock ms) + lift height.
const LIFT_RISE_MS = 420;
const LIFT_HOLD_MS = 640;
const LIFT_LOWER_MS = 480;
const LIFT_H = 0.42;

const MAX_VISIBLE_ITEMS = 3;

// The VISIBLE mesh shrinks to this as it sinks past the rim; the cloth keeps
// colliding with the FULL-size box, so the bag stays bulged around a
// full-size tape while the rendered case ends up well inside that envelope —
// poke-through is geometrically impossible, whatever the solver transients do.
const ITEM_SHRINK = 0.62;

// Deterministic "tossed in" rest slots (bag-local). Cases lean alternately
// against the front/back sheet so every drop bulges the bag somewhere new.
const ITEM_SLOTS = [
  { x: -0.19, z: 0.03, rotX: 0.24, rotY: 0.14, rotZ: 0.04 },
  { x: 0.21, z: -0.03, rotX: -0.27, rotY: -0.12, rotZ: -0.05 },
  { x: 0.0, z: 0.01, rotX: 0.16, rotY: 0.2, rotZ: 0.06 },
];

interface BagItem {
  mesh: THREE.Object3D;
  hx: number;
  hy: number;
  hz: number;
  // Local-space offset from mesh.position to the box's TRUE geometric
  // centre. Zero for a symmetric box, but the VHS rental geometry is
  // translate()d off-origin (video-case.ts, VHS_RIM_RIGHT_FT — the molded
  // rim), so mesh.position sits ~0.23in off the box's real centre. Collision
  // must use the real centre or it silently misjudges the surface on one
  // side by that whole offset (rotated with the mesh) — the fixed-margin fix
  // tried first didn't touch this and the case still poked through on the
  // under-covered side.
  cx: number;
  cy: number;
  cz: number;
  radius: number; // broad-phase bounding radius
  weight: number; // volume-derived load on the plastic (DVD keepcase = 1)
  fromPos: THREE.Vector3;
  fromQuat: THREE.Quaternion;
  restPos: THREE.Vector3;
  restQuat: THREE.Quaternion;
  t0: number; // bag-clock ms the drop started
  dur: number;
  settled: boolean;
}

// Scratch (module-level, zero per-frame allocations)
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _exitQ = new THREE.Quaternion();
const _exitTumble = new THREE.Quaternion();
const _xAxis = new THREE.Vector3(1, 0, 0);
const _yAxis = new THREE.Vector3(0, 1, 0);
const _zAxis = new THREE.Vector3(0, 0, 1);

export class CheckoutBag {
  readonly group: THREE.Group;
  readonly mouthWorld: THREE.Vector3;

  private mesh: THREE.Mesh;
  private geo: THREE.BufferGeometry;
  readonly material: THREE.MeshPhysicalMaterial;

  // Verlet state — one entry per welded node.
  private pos: Float32Array;
  private prev: Float32Array;
  private rest: Float32Array;
  private nodeCount: number;
  // Which sheet each node belongs to: +1 front, -1 back, 0 for the side-seam
  // columns (one node serves both sheets there, so it has no side of its own).
  // collideItems() uses this to keep a sheet in front of the contents it is
  // supposed to be covering — see the wrong-side branch there.
  private sheetSide: Int8Array;
  // vertex -> node (verts duplicate nodes only at UV seams)
  private vertNode: Int16Array;
  // constraints
  private conA: Int16Array;
  private conB: Int16Array;
  private conLen: Float32Array;
  private conK: Float32Array;
  // Per-constraint stretch allowance = conLen * SAG_STRETCH * verticality, so
  // vertical spans elongate under load while horizontal rings keep the width.
  private conStretchLen: Float32Array;
  // Constraint indices whose MIDPOINT also collides with the contents. Node
  // collision alone leaves the triangle between three correctly-pushed nodes
  // uncovered, and a tilted case corner tents the sheet and surfaces its whole
  // face through that gap (seen on the VHS clamshell during the checkout exit:
  // every node outside the box, label still poking out of the print). Pushing
  // the structural/shear edge midpoints out too pins the fabric down along the
  // edges, so what's left inside a triangle is a second-order dip the collision
  // margin comfortably covers. Bend spans are excluded (their midpoint is the
  // middle node — already collided) and so is the bottom row (weld + floor pins
  // own those nodes; shoving them from here just fights the pin every step).
  private conMid: Int16Array;
  // pin sets
  private bottomNodes: Int16Array; // welded to the counter while standing
  private handleNodes: Int16Array; // pinched + lifted while carried
  private handleGather: Float32Array; // per-handle-node pinch target (x, z at full gather)

  private items: BagItem[] = [];

  private shown = false;
  private sleeping = false;
  private stillSteps = 0;
  private lastNow: number | null = null;
  private accumMs = 0;
  private clock = 0; // bag-local ms, advances only while shown

  // Lift state
  private lifting = false;
  private liftStart = 0; // bag-clock ms
  private liftHold = false; // harness: freeze mid-carry to photograph the droop
  private repinning = false; // easing the bottom back onto the counter
  private itemLift = 0; // lagged carry-rise the contents ride during the lift
  private loadEased = 0; // 0..1 eased content load driving the sag/stretch

  // Rest transform of the whole bag group (counter spot + shelf yaw), captured
  // so the checkout-exit choreography (setExitPose) can lay the bag on its side
  // and drag it off the counter, then show() can snap it right back for the
  // next trip. `laidQuat` is that rest yaw tipped -90° about the bag's own X so
  // the printed face points straight up (logo up), mouth toward the store side.
  private readonly baseGroupPos: THREE.Vector3;
  private readonly baseGroupQuat: THREE.Quaternion;
  private readonly laidQuat: THREE.Quaternion;

  constructor(parent: THREE.Group, x: number, yBase: number, z: number, rotY: number) {
    this.group = new THREE.Group();
    this.group.position.set(x, yBase, z);
    this.group.rotation.y = rotY;
    this.group.visible = false;
    parent.add(this.group);
    this.mouthWorld = new THREE.Vector3(x, yBase + BODY_H * 0.78, z);

    // Rest transform + the "laid flat, logo up" target (rest yaw, then -90°
    // about local X — front sheet +z rotates to world +y, mouth +y rotates to
    // world -z toward the store/customer side).
    this.baseGroupPos = new THREE.Vector3(x, yBase, z);
    this.baseGroupQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0));
    this.laidQuat = this.baseGroupQuat.clone().multiply(
      new THREE.Quaternion().setFromAxisAngle(_xAxis, -Math.PI / 2));

    // ── Rest pose ──────────────────────────────────────────────────────────
    // Node ids: front sheet F(r,i) = r*13+i (169), back-sheet interiors
    // B(r,i)=169+r*11+(i-1) (143, seam columns i=0/12 alias the front's),
    // then the two tab flaps (7 cols × 2 rows each).
    const NB0 = COLS * (ROWS + 1); // 169
    const NFT0 = NB0 + (COLS - 2) * (ROWS + 1); // 312
    const NBT0 = NFT0 + TAB_COLS * 2; // 326
    this.nodeCount = NBT0 + TAB_COLS * 2; // 340
    const F = (r: number, i: number) => r * COLS + i;
    const B = (r: number, i: number) => (i === 0 || i === COLS - 1 ? F(r, i) : NB0 + r * (COLS - 2) + (i - 1));
    const FT = (t: number, i: number) => NFT0 + t * TAB_COLS + (i - TAB_I0);
    const BT = (t: number, i: number) => NBT0 + t * TAB_COLS + (i - TAB_I0);

    const rest = new Float32Array(this.nodeCount * 3);
    const colX = (i: number) => -HALF_W + (i * 2 * HALF_W) / (COLS - 1);
    const rowY = (r: number) => 0.02 + ((BODY_H - 0.02) * r) / ROWS;
    // Empty-bag half-depth: near-flat at the bottom weld, a gentle pillow
    // through the belly, mostly closed again at the mouth. Items inflate it.
    const depthAt = (yn: number) => 0.028 + 0.08 * Math.pow(Math.sin(Math.PI * Math.min(yn, 1) * 0.86), 1.2);
    const widthFall = (i: number) => Math.pow(Math.sin((Math.PI * i) / (COLS - 1)), 0.62);
    const setN = (n: number, px: number, py: number, pz: number) => {
      rest[n * 3] = px;
      rest[n * 3 + 1] = py;
      rest[n * 3 + 2] = pz;
    };
    for (let r = 0; r <= ROWS; r++) {
      const y = rowY(r);
      const d = depthAt(y / BODY_H);
      for (let i = 0; i < COLS; i++) {
        const zz = d * widthFall(i);
        setN(F(r, i), colX(i), y, zz);
        if (i > 0 && i < COLS - 1) setN(B(r, i), colX(i), y, -zz);
      }
    }
    for (let t = 0; t < 2; t++) {
      const y = BODY_H + (TAB_RISE * (t + 1)) / 2;
      for (let i = TAB_I0; i <= TAB_I1; i++) {
        setN(FT(t, i), colX(i), y, 0.022);
        setN(BT(t, i), colX(i), y, -0.022);
      }
    }
    this.rest = rest;
    this.pos = new Float32Array(rest);
    this.prev = new Float32Array(rest);

    const sheetSide = new Int8Array(this.nodeCount);
    for (let r = 0; r <= ROWS; r++) {
      for (let i = 0; i < COLS; i++) {
        const seam = i === 0 || i === COLS - 1;
        sheetSide[F(r, i)] = seam ? 0 : 1;
        if (!seam) sheetSide[B(r, i)] = -1;
      }
    }
    for (let t = 0; t < 2; t++) {
      for (let i = TAB_I0; i <= TAB_I1; i++) {
        sheetSide[FT(t, i)] = 1;
        sheetSide[BT(t, i)] = -1;
      }
    }
    this.sheetSide = sheetSide;

    // ── Vertices / UVs / faces ─────────────────────────────────────────────
    // The print maps u = 0..1 left→right ON EACH OUTWARD FACE (the back sheet
    // mirrors u so the logo reads correctly from both sides — the old extruded
    // bag printed the back mirrored). Seam columns get duplicate verts for the
    // back sheet's u.
    const verts: number[] = []; // vert -> node
    const uvs: number[] = [];
    const vFor = (n: number, u: number, y: number) => {
      verts.push(n);
      uvs.push(u, y / TOTAL_H);
      return verts.length - 1;
    };
    const fv: number[][] = [];
    const bv: number[][] = [];
    for (let r = 0; r <= ROWS; r++) {
      fv[r] = [];
      bv[r] = [];
      for (let i = 0; i < COLS; i++) fv[r][i] = vFor(F(r, i), i / (COLS - 1), rowY(r));
      for (let i = 0; i < COLS; i++) bv[r][i] = vFor(B(r, i), 1 - i / (COLS - 1), rowY(r));
    }
    const ftv: number[][] = [[], []];
    const btv: number[][] = [[], []];
    for (let t = 0; t < 2; t++) {
      const y = BODY_H + (TAB_RISE * (t + 1)) / 2;
      for (let i = TAB_I0; i <= TAB_I1; i++) {
        ftv[t][i] = vFor(FT(t, i), i / (COLS - 1), y);
        btv[t][i] = vFor(BT(t, i), 1 - i / (COLS - 1), y);
      }
    }
    const index: number[] = [];
    const quad = (a: number, b: number, c: number, d: number) => {
      index.push(a, b, c, a, c, d);
    };
    for (let r = 0; r < ROWS; r++) {
      for (let i = 0; i < COLS - 1; i++) {
        // front sheet faces +z (CCW seen from +z); back sheet reversed
        quad(fv[r][i], fv[r][i + 1], fv[r + 1][i + 1], fv[r + 1][i]);
        quad(bv[r][i + 1], bv[r][i], bv[r + 1][i], bv[r + 1][i + 1]);
      }
    }
    for (let i = TAB_I0; i < TAB_I1; i++) {
      quad(fv[ROWS][i], fv[ROWS][i + 1], ftv[0][i + 1], ftv[0][i]);
      quad(ftv[0][i], ftv[0][i + 1], ftv[1][i + 1], ftv[1][i]);
      quad(bv[ROWS][i + 1], bv[ROWS][i], btv[0][i], btv[0][i + 1]);
      quad(btv[0][i + 1], btv[0][i], btv[1][i], btv[1][i + 1]);
    }
    this.vertNode = Int16Array.from(verts);

    const geo = new THREE.BufferGeometry();
    const posAttr = new Float32Array(verts.length * 3);
    for (let vi = 0; vi < verts.length; vi++) {
      const n = verts[vi];
      posAttr[vi * 3] = rest[n * 3];
      posAttr[vi * 3 + 1] = rest[n * 3 + 1];
      posAttr[vi * 3 + 2] = rest[n * 3 + 2];
    }
    geo.setAttribute('position', new THREE.BufferAttribute(posAttr, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(uvs), 2));
    geo.setIndex(index);
    geo.computeVertexNormals();
    this.geo = geo;

    // ── Constraints ────────────────────────────────────────────────────────
    const cA: number[] = [];
    const cB: number[] = [];
    const cL: number[] = [];
    const cK: number[] = [];
    const cS: number[] = []; // stretch allowance (len * SAG_STRETCH * verticality)
    const seen = new Set<number>();
    const link = (a: number, b: number, k: number) => {
      if (a === b) return;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const key = lo * this.nodeCount + hi;
      if (seen.has(key)) return;
      seen.add(key);
      const dx = rest[a * 3] - rest[b * 3];
      const dy = rest[a * 3 + 1] - rest[b * 3 + 1];
      const dz = rest[a * 3 + 2] - rest[b * 3 + 2];
      const len = Math.hypot(dx, dy, dz);
      cA.push(lo);
      cB.push(hi);
      cL.push(len);
      cK.push(k);
      // Only spans with a vertical component stretch — the belly sinks, the
      // rings that set the width stay put.
      cS.push(len > 1e-6 ? len * SAG_STRETCH * (Math.abs(dy) / len) : 0);
    };
    const sheet = (N: (r: number, i: number) => number) => {
      for (let r = 0; r <= ROWS; r++)
        for (let i = 0; i < COLS; i++) {
          if (i < COLS - 1) link(N(r, i), N(r, i + 1), 1); // ring/horizontal
          if (r < ROWS) link(N(r, i), N(r + 1, i), 1); // vertical
          if (r < ROWS && i < COLS - 1) {
            link(N(r, i), N(r + 1, i + 1), 0.85); // shear
            link(N(r, i + 1), N(r + 1, i), 0.85);
          }
          if (r < ROWS - 1) link(N(r, i), N(r + 2, i), 0.35); // vertical bend
          if (i < COLS - 2) link(N(r, i), N(r, i + 2), 0.25); // horizontal bend
        }
    };
    sheet(F);
    sheet(B);
    // Tab flaps: each hangs off its sheet's mouth row.
    const flap = (Wall: (r: number, i: number) => number, T: (t: number, i: number) => number) => {
      for (let i = TAB_I0; i <= TAB_I1; i++) {
        link(Wall(ROWS, i), T(0, i), 1);
        link(T(0, i), T(1, i), 1);
        if (i < TAB_I1) {
          link(T(0, i), T(0, i + 1), 1);
          link(T(1, i), T(1, i + 1), 1);
          link(Wall(ROWS, i), T(0, i + 1), 0.85);
          link(Wall(ROWS, i + 1), T(0, i), 0.85);
          link(T(0, i), T(1, i + 1), 0.85);
          link(T(0, i + 1), T(1, i), 0.85);
        }
      }
    };
    flap(F, FT);
    flap(B, BT);
    // Bottom weld (the sealed seam under the bag) + soft tab pinch (the two
    // die-cut flaps stay loosely together like a real double-layer handle).
    for (let i = 1; i < COLS - 1; i++) link(F(0, i), B(0, i), 1);
    for (let t = 0; t < 2; t++) for (let i = TAB_I0; i <= TAB_I1; i++) link(FT(t, i), BT(t, i), 0.3);
    this.conA = Int16Array.from(cA);
    this.conB = Int16Array.from(cB);
    this.conLen = Float32Array.from(cL);
    this.conK = Float32Array.from(cK);
    this.conStretchLen = Float32Array.from(cS);
    const cM: number[] = [];
    for (let k = 0; k < cA.length; k++) {
      if (cK[k] < 0.85) continue; // structural + shear only (bends double a node; tab pinch is slack)
      if (rest[cA[k] * 3 + 1] < 0.03 && rest[cB[k] * 3 + 1] < 0.03) continue; // bottom row: pinned
      cM.push(k);
    }
    this.conMid = Int16Array.from(cM);

    // Pin sets.
    const bottom: number[] = [];
    for (let i = 0; i < COLS; i++) bottom.push(F(0, i));
    for (let i = 1; i < COLS - 1; i++) bottom.push(B(0, i));
    this.bottomNodes = Int16Array.from(bottom);
    const handle: number[] = [];
    const gather: number[] = [];
    for (let t = 0; t < 2; t++)
      for (let i = TAB_I0; i <= TAB_I1; i++) {
        for (const n of [FT(t, i), BT(t, i)]) {
          handle.push(n);
          // Grabbing gathers the plastic toward the hole: pinch x toward the
          // centre and flatten z to a two-ply grip.
          gather.push(rest[n * 3] * 0.72, rest[n * 3 + 2] * 0.18);
        }
      }
    this.handleNodes = Int16Array.from(handle);
    this.handleGather = Float32Array.from(gather);

    // ── Glossy white plastic + printed brand ──────────────────────────────
    this.material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: this.buildPrintTexture(),
      alphaTest: 0.5, // die-cut handle hole punched through both plies
      side: THREE.DoubleSide,
      roughness: 0.18,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.35,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false; // bounds deform every step; it's ~620 tris, on screen only during checkout
    this.group.add(this.mesh);
  }

  // The bag's colour map: warm-white plastic with the ACTIVE store brand
  // (LogoSpec — whatever emblem the active brand paints)
  // printed big and crisp across the face. The alpha channel carries the
  // punched die-cut hole. u is mirrored per sheet in the UVs, so the print
  // reads correctly from BOTH sides.
  // The bag's print is the emblem itself (drawLogo below), so it follows a
  // brand edit the moment the editor commits — see brand-live.ts.
  private buildPrintTexture(): THREE.CanvasTexture {
    const W = 896;
    const H = 1024; // ≈ bag face aspect (1.6 : 1.79 ft)
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    const paint = () => {
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#f8f7f4';
      ctx.fillRect(0, 0, W, H);

      // Big print-quality brand emblem centred on the body (v runs bottom-up on
      // the bag; canvas y runs top-down). Spec is read here, not captured, so a
      // repaint prints the CURRENT brand.
      const spec = getActiveLogoSpec(getActiveTheme());
      const logoW = W * 1.04; // edge-to-edge print — "fully imprinted"
      const logoH = logoW * 0.62;
      const bodyCenterV = (0.47 * BODY_H) / TOTAL_H;
      drawLogo(ctx, spec, {
        x: (W - logoW) / 2,
        y: (1 - bodyCenterV) * H - logoH / 2,
        w: logoW,
        h: logoH,
      });

      // Punch the handle hole (alphaTest cutout). Must be re-punched on every
      // repaint — the fill above closes it back up.
      const pxPerFtX = W / (2 * HALF_W);
      const holeY = (1 - HOLE_CY / TOTAL_H) * H;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.ellipse(W / 2, holeY, HOLE_R * pxPerFtX, HOLE_R * (H / TOTAL_H), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    };
    paint();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    registerBrandRepaint(tex, paint);
    return tex;
  }

  get isShown(): boolean {
    return this.shown;
  }

  /** Reveal the bag in its rest pose (checkout flourish start). */
  show(): void {
    if (this.shown) return;
    this.shown = true;
    this.group.visible = true;
    // A previous checkout may have carried the bag off on its side — snap the
    // whole group back to its upright rest spot on the counter.
    this.group.position.copy(this.baseGroupPos);
    this.group.quaternion.copy(this.baseGroupQuat);
    this.lastNow = null;
    this.accumMs = 0;
    this.pos.set(this.rest);
    this.prev.set(this.rest);
    this.lifting = false;
    this.liftHold = false;
    this.repinning = false;
    this.itemLift = 0;
    this.loadEased = 0; // let the load bed back in as the cloth re-settles
    // Items from a previous trip are still inside — let the sheets settle
    // around them again from the clean rest pose.
    for (const it of this.items) {
      it.settled = true;
      it.t0 = -1e9;
      it.mesh.position.copy(it.restPos);
      it.mesh.quaternion.copy(it.restQuat);
      it.mesh.scale.setScalar(ITEM_SHRINK);
    }
    this.wake();
    this.writeGeometry();
  }

  /** Hide + freeze (exit walk done). Costs nothing until the next show(). */
  hide(): void {
    this.shown = false;
    this.group.visible = false;
    this.lifting = false;
    this.liftHold = false;
    this.sleeping = true;
  }

  /**
   * Drop an item (movie case, candy box) into the bag. The mesh becomes a
   * child of the bag group, falls from the mouth to a leaning rest pose, and
   * from the first frame it is an oriented-box collider the plastic deforms
   * around. Caller owns geometry/material lifetime (never disposed here).
   */
  drop(mesh: THREE.Object3D): void {
    if (!this.shown) this.show();
    this.group.add(mesh);

    // Collider half-extents from the mesh's own geometry, and the box's TRUE
    // centre relative to mesh.position — NOT assumed to be the origin. Some
    // case geometries (the VHS rental clamshell) are translate()d off-origin
    // for their molded rim, so bb.min/max aren't symmetric; using their
    // midpoint (not 0,0,0) is what keeps the collision box actually centred
    // on the visible mesh instead of drifting to one side.
    let hx = 0.15;
    let hy = 0.15;
    let hz = 0.08;
    let cx = 0, cy = 0, cz = 0;
    const g = (mesh as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (g) {
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox!;
      hx = (bb.max.x - bb.min.x) / 2;
      hy = (bb.max.y - bb.min.y) / 2;
      hz = (bb.max.z - bb.min.z) / 2;
      cx = (bb.max.x + bb.min.x) / 2;
      cy = (bb.max.y + bb.min.y) / 2;
      cz = (bb.max.z + bb.min.z) / 2;
    }

    const slot = ITEM_SLOTS[this.items.length % ITEM_SLOTS.length];
    const restPos = new THREE.Vector3(slot.x, hy + 0.025, slot.z);
    _e.set(slot.rotX, slot.rotY, slot.rotZ);
    const restQuat = new THREE.Quaternion().setFromEuler(_e);
    const fromPos = new THREE.Vector3(slot.x * 0.35, BODY_H + hy * 0.6, slot.z * 0.3);
    _e.set(slot.rotX - 0.35, slot.rotY + 0.55, slot.rotZ + 0.2);
    const fromQuat = new THREE.Quaternion().setFromEuler(_e);

    mesh.position.copy(fromPos);
    mesh.quaternion.copy(fromQuat);
    mesh.scale.setScalar(1); // full size at the rim; shrinks as it sinks in

    // Heft ∝ volume, normalized to a DVD keepcase, super-linear so a chunky VHS
    // clamshell reads as clearly heavier than a thin DVD (it sags the bag more).
    const weight = Math.pow((8 * hx * hy * hz) / DVD_REF_VOL, WEIGHT_EXP);

    this.items.push({
      mesh,
      hx,
      hy,
      hz,
      cx,
      cy,
      cz,
      // Broad-phase cull radius must cover the LARGER of the two collision
      // margins (LIFT_COLLIDE_MARGIN), or a node that genuinely needs
      // testing under the lift-widened box gets excluded before the
      // per-axis check ever runs.
      radius: Math.hypot(hx, hy, hz) + LIFT_COLLIDE_MARGIN,
      weight,
      fromPos,
      fromQuat,
      restPos,
      restQuat,
      t0: this.clock,
      dur: 430,
      settled: false,
    });
    while (this.items.length > MAX_VISIBLE_ITEMS) {
      const oldest = this.items.shift();
      if (oldest) this.group.remove(oldest.mesh);
    }
    this.wake();
  }

  /** The "you picked up the bag" flourish: handle pinch + lift + droop + set back down. */
  pickUp(): void {
    if (!this.shown) return;
    this.lifting = true;
    this.repinning = false;
    this.liftStart = this.clock;
    this.wake();
  }

  /**
   * Freeze the settled cloth in its current shape so the whole bag can be
   * carried as one rigid piece — the checkout exit lays it on its side and
   * drags it out the door, where re-solving under (bag-local) gravity would
   * make the plastic and contents fall sideways. The solver stops writing
   * geometry; setExitPose() then owns the group transform until the next show().
   */
  freeze(): void {
    this.lifting = false;
    this.repinning = false;
    this.liftHold = false;
    this.sleeping = true;
  }

  /**
   * Checkout-exit choreography. Lay the (frozen) bag onto its side with the
   * printed face up, then drag it off the counter and out the door.
   *   - `layT` 0..1: tilt from upright to lying flat (smoothstepped here).
   *   - `carry`: world-space offset added to the rest position (the lift off
   *     the counter + the slide toward and through the exit door).
   *   - `tumble`: a small roll (radians about the bag's long axis) so the
   *     carried bag rocks as it's dragged away.
   *   - `worldYaw` (optional): ABSOLUTE upright world yaw for the group —
   *     the hand-carry walk uses it so the bag turns with the walker as the
   *     exit path rounds the counter (layT still tips it if nonzero).
   * Call freeze() first; the cloth holds its settled bulge while the group moves.
   */
  setExitPose(layT: number, carry: THREE.Vector3, tumble = 0, worldYaw?: number): void {
    const e = layT <= 0 ? 0 : layT >= 1 ? 1 : layT * layT * (3 - 2 * layT);
    if (worldYaw === undefined) {
      _exitQ.copy(this.baseGroupQuat).slerp(this.laidQuat, e);
    } else {
      _exitQ.setFromAxisAngle(_yAxis, worldYaw);
      if (e > 0) {
        _exitTumble.setFromAxisAngle(_xAxis, (-Math.PI / 2) * e);
        _exitQ.multiply(_exitTumble);
      }
    }
    if (tumble) {
      _exitTumble.setFromAxisAngle(_zAxis, tumble);
      _exitQ.multiply(_exitTumble);
    }
    this.group.quaternion.copy(_exitQ);
    this.group.position.copy(this.baseGroupPos).add(carry);
  }

  /** Harness: freeze the carry mid-hold so the droop can be photographed. */
  debugHoldLift(): void {
    this.liftHold = true;
    this.pickUp();
  }

  /** Harness: run the solver forward synchronously (settle before a shot). */
  debugFastForward(ms: number): void {
    if (!this.shown) return;
    this.advance(ms);
  }

  setEnvMap(envMap: THREE.Texture | null): void {
    this.material.envMap = envMap;
    this.material.needsUpdate = true;
  }

  /** Per-frame driver. No-ops entirely (zero writes) when hidden or asleep. */
  update(nowMs: number): void {
    if (!this.shown) return;
    if (this.lastNow === null) {
      this.lastNow = nowMs;
      return;
    }
    const dt = Math.min(nowMs - this.lastNow, 100);
    this.lastNow = nowMs;
    this.advance(dt);
  }

  private wake(): void {
    this.sleeping = false;
    this.stillSteps = 0;
  }

  private advance(ms: number): void {
    this.accumMs += ms;
    // Real frames step at most MAX_SUBSTEPS; debugFastForward's big one-shot
    // ms is stepped through in full so harness shots are pre-settled.
    const maxSteps = ms > STEP_MS * MAX_SUBSTEPS ? Math.ceil(ms / STEP_MS) : MAX_SUBSTEPS;
    let steps = 0;
    while (this.accumMs >= STEP_MS && steps < maxSteps) {
      this.accumMs -= STEP_MS;
      this.clock += STEP_MS;
      if (!this.sleeping) this.step();
      steps++;
    }
    // Never bank more than one substep of debt (long stalls don't fast-run).
    if (this.accumMs > STEP_MS) this.accumMs = STEP_MS;
  }

  // ── One fixed 60 Hz solver step ──────────────────────────────────────────
  private step(): void {
    const { pos, prev, rest } = this;
    const n = this.nodeCount;
    const DT2 = (STEP_MS / 1000) * (STEP_MS / 1000);

    // Lift curve (bag clock).
    let liftY = 0;
    let liftT = -1;
    let sway = 0;
    if (this.lifting) {
      liftT = this.clock - this.liftStart;
      if (this.liftHold) liftT = Math.min(liftT, LIFT_RISE_MS + LIFT_HOLD_MS * 0.4);
      if (liftT < LIFT_RISE_MS) {
        const t = liftT / LIFT_RISE_MS;
        liftY = LIFT_H * (1 - Math.pow(1 - t, 3));
      } else if (liftT < LIFT_RISE_MS + LIFT_HOLD_MS) {
        liftY = LIFT_H + 0.018 * Math.sin((liftT - LIFT_RISE_MS) * 0.006);
      } else if (liftT < LIFT_RISE_MS + LIFT_HOLD_MS + LIFT_LOWER_MS) {
        const t = (liftT - LIFT_RISE_MS - LIFT_HOLD_MS) / LIFT_LOWER_MS;
        liftY = LIFT_H * (1 - t * t * (3 - 2 * t));
      } else {
        this.lifting = false;
        this.repinning = true;
      }
      const decay = Math.exp(-Math.max(0, liftT - LIFT_RISE_MS) / 1400);
      sway = 0.05 * Math.sin(liftT * 0.008) * Math.min(1, liftT / LIFT_RISE_MS) * decay;
    }

    // Ease the content load toward its target so the sag "beds in" over a
    // fraction of a second as a case thumps home, rather than snapping.
    let load = 0;
    for (let ii = 0; ii < this.items.length; ii++) load += this.items[ii].weight;
    const loadTarget = Math.min(1, load / LOAD_FULL);
    this.loadEased += (loadTarget - this.loadEased) * LOAD_EASE;
    if (Math.abs(loadTarget - this.loadEased) < 1e-3) this.loadEased = loadTarget;
    const loaded = this.loadEased;

    // Loaded plastic slumps: the rest-shape spring that keeps the empty bag's
    // crisp die-cut silhouette weakens, so gravity drapes it around the contents.
    const restK = (this.lifting ? REST_K_LIFT : REST_K_STAND) * (1 - SAG_SLUMP * loaded);

    // 1. Integrate + rest-shape spring + floor.
    let maxV = 0;
    for (let i = 0; i < n; i++) {
      const b = i * 3;
      for (let a = 0; a < 3; a++) {
        const cur = pos[b + a];
        let next = cur + (cur - prev[b + a]) * DAMP;
        if (a === 1) next += GRAVITY * DT2;
        next += (rest[b + a] - next) * restK;
        prev[b + a] = cur;
        pos[b + a] = next;
        const v = next - cur;
        if (v > maxV) maxV = v;
        else if (-v > maxV) maxV = -v;
      }
      if (pos[b + 1] < FLOOR_Y) {
        pos[b + 1] = FLOOR_Y;
        prev[b + 1] = FLOOR_Y;
        // counter friction: kill sliding at the contact
        prev[b] += (pos[b] - prev[b]) * 0.5;
        prev[b + 2] += (pos[b + 2] - prev[b + 2]) * 0.5;
      }
    }

    // 2. Pins.
    if (this.lifting) {
      const hn = this.handleNodes;
      const hg = this.handleGather;
      // Gather eases in over the rise so the grab reads as a motion.
      const gatherT = Math.min(1, Math.max(0, liftT) / (LIFT_RISE_MS * 0.7));
      const ge = gatherT * gatherT * (3 - 2 * gatherT);
      for (let k = 0; k < hn.length; k++) {
        const b = hn[k] * 3;
        const rx = rest[b];
        const rz = rest[b + 2];
        pos[b] = rx + (hg[k * 2] - rx) * ge + sway;
        pos[b + 1] = rest[b + 1] + liftY;
        pos[b + 2] = rz + (hg[k * 2 + 1] - rz) * ge + sway * 0.4;
        prev[b] = pos[b];
        prev[b + 1] = pos[b + 1];
        prev[b + 2] = pos[b + 2];
      }
      // The bottom seam was left fully unpinned while lifting (the intent:
      // droop free off the handle). Free-falling under gravity with nothing
      // holding it back, it separates from the item fast enough that
      // collideItems() catches it a surface late — a corner or edge reads as
      // poking through until the swing damps out (confirmed by swapping the
      // bagged item to a flat magenta material: the poking shape WAS the
      // item, not a stray prop). A weak pull keeps the seam loosely tracking
      // the item's own rise (not the ground-level rest — that would drag it
      // straight back down and cancel the droop) for as long as lifting is
      // true, not just the first instant: bottomTrackY rises at 55% of the
      // handle's own liftY, so the seam still stretches and lags visibly,
      // it just never lags far enough to lose contact.
      {
        const bn = this.bottomNodes;
        const trackY = rest[bn[0] * 3 + 1] + liftY * 0.55; // same for every bottom node (rest is flat)
        for (let k = 0; k < bn.length; k++) {
          const b = bn[k] * 3;
          pos[b] += (rest[b] - pos[b]) * 0.10;
          pos[b + 1] += (trackY - pos[b + 1]) * 0.10;
          pos[b + 2] += (rest[b + 2] - pos[b + 2]) * 0.10;
          prev[b] = pos[b];
          prev[b + 1] = pos[b + 1];
          prev[b + 2] = pos[b + 2];
        }
      }
    } else if (this.repinning) {
      // Ease the bottom seam back onto the counter, then weld it again.
      const bn = this.bottomNodes;
      let err = 0;
      for (let k = 0; k < bn.length; k++) {
        const b = bn[k] * 3;
        for (let a = 0; a < 3; a++) {
          pos[b + a] += (rest[b + a] - pos[b + a]) * 0.3;
          prev[b + a] = pos[b + a];
          const d = Math.abs(pos[b + a] - rest[b + a]);
          if (d > err) err = d;
        }
      }
      if (err < 0.008) this.repinning = false;
    } else {
      // Standing: the bottom seam is welded to the counter in y, but its x/z
      // only PULL toward rest — the contents may shove the seam outward (a
      // hard pin here let case corners poke through the plastic at the base).
      // Under load that pull-back eases off, so a heavy bag splays wider at the
      // base as the weight settles into it.
      const bn = this.bottomNodes;
      const basePull = 0.25 * (1 - BASE_SPLAY * loaded);
      for (let k = 0; k < bn.length; k++) {
        const b = bn[k] * 3;
        pos[b] += (rest[b] - pos[b]) * basePull;
        pos[b + 1] = rest[b + 1];
        pos[b + 2] += (rest[b + 2] - pos[b + 2]) * basePull;
        prev[b] = pos[b];
        prev[b + 1] = pos[b + 1];
        prev[b + 2] = pos[b + 2];
      }
    }

    // 3. Animate items (kinematic drop) + bag-carry follow. While carried,
    // the contents ride the lift curve with a lagged, droopy follow (the
    // plastic stretching taut before it takes their weight); the cloth then
    // drapes around them wherever they are — no clipping either way.
    {
      const target = this.lifting ? Math.max(0, liftY - 0.05) : 0;
      this.itemLift += (target - this.itemLift) * 0.16;
      if (Math.abs(this.itemLift) < 1e-4 && target === 0) this.itemLift = 0;
    }
    let itemsBusy = this.itemLift > 1e-4;
    for (let ii = 0; ii < this.items.length; ii++) {
      const it = this.items[ii];
      const t = Math.min(1, (this.clock - it.t0) / it.dur);
      if (t < 1) itemsBusy = true;
      const fall = t * t; // gravity ease-in on y
      const glide = t * t * (3 - 2 * t);
      const m = it.mesh;
      m.position.x = it.fromPos.x + (it.restPos.x - it.fromPos.x) * glide + sway * 0.55;
      m.position.y = it.fromPos.y + (it.restPos.y - it.fromPos.y) * fall + this.itemLift;
      m.position.z = it.fromPos.z + (it.restPos.z - it.fromPos.z) * glide;
      m.quaternion.slerpQuaternions(it.fromQuat, it.restQuat, glide);
      // sqrt(t): clearance opens fast, right as the case crosses the rim.
      m.scale.setScalar(1 - (1 - ITEM_SHRINK) * Math.sqrt(t));
      if (t >= 1 && !it.settled) {
        it.settled = true;
        this.kickAround(it);
      }
    }

    // 4. Relax constraints, colliding with the contents every iteration. Under
    // load the vertical spans are allowed to elongate (conStretchLen * load) so
    // the belly visibly stretches lower over a heavy tape.
    const { conA, conB, conLen, conK, conStretchLen } = this;
    const nCon = conA.length;
    const iters = this.lifting || this.repinning ? ITERATIONS + 8 : ITERATIONS;
    for (let iter = 0; iter < iters; iter++) {
      for (let k = 0; k < nCon; k++) {
        const ai = conA[k] * 3;
        const bi = conB[k] * 3;
        const dx = pos[bi] - pos[ai];
        const dy = pos[bi + 1] - pos[ai + 1];
        const dz = pos[bi + 2] - pos[ai + 2];
        const d = Math.hypot(dx, dy, dz);
        if (d < 1e-6) continue;
        const restLen = conLen[k] + conStretchLen[k] * loaded;
        const f = (((d - restLen) / d) * conK[k] * 0.5);
        pos[ai] += dx * f;
        pos[ai + 1] += dy * f;
        pos[ai + 2] += dz * f;
        pos[bi] -= dx * f;
        pos[bi + 1] -= dy * f;
        pos[bi + 2] -= dz * f;
      }
      this.collideItems();
    }

    this.writeGeometry();

    // 5. Sleep once genuinely still (nothing scripted pending).
    const busy = this.lifting || this.repinning || itemsBusy;
    if (!busy && maxV < 0.0016) {
      if (++this.stillSteps > 30) this.sleeping = true;
    } else {
      this.stillSteps = 0;
    }
  }

  // Push every cloth node out of every item's oriented box — this is what
  // makes the plastic wrap visibly around whatever is inside.
  private collideItems(): void {
    const pos = this.pos;
    const n = this.nodeCount;
    for (let ii = 0; ii < this.items.length; ii++) {
      const it = this.items[ii];
      const m = it.mesh;
      // Box world centre = mesh.position + (local centre offset, rotated).
      // Not just mesh.position — see the BagItem.cx/cy/cz comment.
      _v.set(it.cx, it.cy, it.cz).applyQuaternion(m.quaternion);
      const px = m.position.x + _v.x;
      const py = m.position.y + _v.y;
      const pz = m.position.z + _v.z;
      _q.copy(m.quaternion).invert();
      const margin = this.lifting ? LIFT_COLLIDE_MARGIN : COLLIDE_MARGIN;
      const hx = it.hx + margin;
      const hy = it.hy + margin;
      const hz = it.hz + margin;
      const r2 = it.radius * it.radius;
      // Which way the case's own +z points in bag space. The slots tilt every
      // case (ITEM_SLOTS rotX/rotY), so the plane through its faces is tilted
      // too, and a FRONT-sheet node above the case's centre line lands on the
      // NEGATIVE side of it. Resolving that node to the nearest face shoves the
      // plastic BEHIND the case, which is what left the clamshell standing
      // outside the bag. Nodes are therefore kept on their own sheet's side.
      const frontFacing = _v3.set(0, 0, 1).applyQuaternion(m.quaternion).z >= 0 ? 1 : -1;
      for (let i = 0; i < n; i++) {
        const b = i * 3;
        const wx = pos[b] - px;
        const wy = pos[b + 1] - py;
        const wz = pos[b + 2] - pz;
        if (wx * wx + wy * wy + wz * wz > r2) continue;
        _v.set(wx, wy, wz).applyQuaternion(_q);
        const ax = Math.abs(_v.x);
        const ay = Math.abs(_v.y);
        const az = Math.abs(_v.z);
        if (ax >= hx || ay >= hy || az >= hz) continue;
        const dx = hx - ax;
        const dy = hy - ay;
        const dz = hz - az;
        const wantZ = this.sheetSide[i] * frontFacing;
        if (wantZ !== 0 && (_v.z >= 0 ? 1 : -1) !== wantZ) _v.z = wantZ * hz;
        else if (dz <= dx && dz <= dy) _v.z = _v.z >= 0 ? hz : -hz;
        else if (dx <= dy) _v.x = _v.x >= 0 ? hx : -hx;
        else _v.y = _v.y >= 0 ? hy : -hy;
        _v.applyQuaternion(m.quaternion);
        pos[b] = px + _v.x;
        pos[b + 1] = py + _v.y;
        pos[b + 2] = pz + _v.z;
      }
      // Edge-midpoint pass (see conMid): push each structural/shear edge whose
      // midpoint sits inside the box out along the same min-penetration axis,
      // translating BOTH endpoints by the midpoint's correction — so a case
      // face can't surface through the triangle between three clean nodes.
      const cm = this.conMid;
      const { conA, conB } = this;
      for (let ci = 0; ci < cm.length; ci++) {
        const k = cm[ci];
        const a3 = conA[k] * 3;
        const b3 = conB[k] * 3;
        const wx = (pos[a3] + pos[b3]) * 0.5 - px;
        const wy = (pos[a3 + 1] + pos[b3 + 1]) * 0.5 - py;
        const wz = (pos[a3 + 2] + pos[b3 + 2]) * 0.5 - pz;
        if (wx * wx + wy * wy + wz * wz > r2) continue;
        _v.set(wx, wy, wz).applyQuaternion(_q);
        const ax = Math.abs(_v.x);
        const ay = Math.abs(_v.y);
        const az = Math.abs(_v.z);
        if (ax >= hx || ay >= hy || az >= hz) continue;
        const dx = hx - ax;
        const dy = hy - ay;
        const dz = hz - az;
        // Only an edge whose two ends share a sheet has a side to be kept on;
        // the seam edges that stitch front to back legitimately cross over.
        const sideA = this.sheetSide[conA[k]];
        const wantZ = (sideA === this.sheetSide[conB[k]] ? sideA : 0) * frontFacing;
        _v2.set(0, 0, 0);
        if (wantZ !== 0 && (_v.z >= 0 ? 1 : -1) !== wantZ) _v2.z = wantZ * hz - _v.z;
        else if (dz <= dx && dz <= dy) _v2.z = _v.z >= 0 ? dz : -dz;
        else if (dx <= dy) _v2.x = _v.x >= 0 ? dx : -dx;
        else _v2.y = _v.y >= 0 ? dy : -dy;
        _v2.applyQuaternion(m.quaternion);
        pos[a3] += _v2.x;
        pos[a3 + 1] += _v2.y;
        pos[a3 + 2] += _v2.z;
        pos[b3] += _v2.x;
        pos[b3 + 1] += _v2.y;
        pos[b3 + 2] += _v2.z;
      }
    }
  }

  // A case thumping home: give nearby free nodes a little outward + downward
  // velocity so the plastic slaps and rings around the landing.
  private kickAround(it: BagItem): void {
    const { pos, prev } = this;
    const m = it.mesh;
    const reach2 = (it.radius + 0.18) * (it.radius + 0.18);
    for (let i = 0; i < this.nodeCount; i++) {
      const b = i * 3;
      const dx = pos[b] - m.position.x;
      const dy = pos[b + 1] - m.position.y;
      const dz = pos[b + 2] - m.position.z;
      if (dx * dx + dy * dy + dz * dz > reach2) continue;
      prev[b + 1] += 0.018; // downward slap
      prev[b + 2] -= Math.sign(pos[b + 2] || 1) * 0.02; // sheets puff outward
    }
    this.wake();
  }

  private writeGeometry(): void {
    const arr = this.geo.attributes.position.array as Float32Array;
    const vn = this.vertNode;
    const pos = this.pos;
    for (let vi = 0; vi < vn.length; vi++) {
      const b = vn[vi] * 3;
      const o = vi * 3;
      arr[o] = pos[b];
      arr[o + 1] = pos[b + 1];
      arr[o + 2] = pos[b + 2];
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.geo.dispose();
    this.material.map?.dispose();
    this.material.dispose();
    this.items.length = 0; // item geometry/materials are caller-owned
  }
}
