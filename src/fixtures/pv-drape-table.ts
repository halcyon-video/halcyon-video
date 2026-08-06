// PV DRAPE TABLE — the 2007/2008 previously-viewed sale table.
//
// Reference (a period video-store photo set under user-assets/reference/):
//   • 2723038679_05952ed4e3_c.jpg (Jul 2007) — frontal on TWO black-draped
//     tables, tiered black wire racks holding DVD keepcases face-out, PURPLE
//     "A BUNDLE OF SAVINGS / 3 for $20" rail clipped along the rack top.
//   • 2888374339_002e6a913c_b.jpg (Sep 2008) — the same fixture in a row, GREEN
//     "2 FOR $20" rail on one table and RED "4 for $20" on the next (the 2008
//     recolor of the 2007 purple family; three colorways attested).
// INVENTORY.md entry: `pv-drape-table`, class fixture, era 2007-2008.
//
// Anatomy, per the DOSSIER descriptions and the photos:
//   • a rectangular banquet table (~6 x 2.5 ft, 30 in high) under a BLACK
//     floor-length drape that flares a little at the hem and breaks into soft
//     vertical folds;
//   • on top, a stepped black-wire rack — three tiers per long face rising to a
//     shared ridge, cases standing face-out and leaning back on each step;
//   • the offer rail clipped across the ridge, reading over the top row.
//
// The drape is a STATIC prop: no cloth solver (checkout-bag.ts owns the only
// Verlet cloth in the app, and that one earns its cost by deforming around
// dropped cases). Here the folds are baked straight into the skirt's
// perimeter — a sine ripple around the hem, growing from nearly nothing at the
// table edge to ~0.4 in at the floor — plus vertex colors that darken the fold
// valleys so the striping still reads under flat store lighting. One geometry,
// one material, no textures.
//
// The wire rack is ONE InstancedMesh of a unit box (a single material, so
// three.js draws all ~130 rails/wires/uprights in a single call). Actual round
// wire would cost a lathe per rail and buy nothing at browsing distance.
//
// Stock: this is a SlottedFixture, so the cases come from StoreScene's shared
// instanced-box pipeline (store-stock.ts) exactly like the promo floor stands
// and the bargain bin — the whole table is two InstancedMesh batches through
// the poster texture array, and every case is browsable/inspectable. In the
// single-asset void viewer (`assetshot --kind fixture`) the rack therefore
// stands EMPTY by design: that viewer has no stock pipeline.
//
// Era gate: 2007-2008 POP (see pop-period.ts). The interval lives here, but
// the gate is armed by the PLACEMENT (`options.popKit`) — the void viewer
// builds a registry kind with no options and no store around it, and dating a
// prop out of existence there would only make `assetshot` fail on an asset
// that is perfectly fine to look at.
//
// Viewable alone: `npm run assetshot -- --kind fixture --name pv-drape-table`.
import * as THREE from 'three';
import { Movie } from '../jellyfin';
import { FixturePlacement, FLOOR_FIXTURE_MAX_Z } from '../store-layout';
import { FixtureContext, SlottedFixture, FixtureSlot } from '../fixtures';
import { Footprint } from '../layout-validator';
import { CASE_HEIGHT, CASE_DEPTH } from '../video-case';
import { layoutFace, PREVIOUSLY_VIEWED } from '../promo-campaigns';
import { popKitVisible } from '../pop-period';
import { markSignMesh } from '../sign-builders';
import { tryLoadUserAssetTexture } from '../user-assets';
import { BB_ARCHIVO_BLACK } from '../bundled-fonts';

// ─── Measured geometry (feet) ───────────────────────────────────────────────
// 30-in banquet table, 6 x 2.5 ft top. Scale anchor: the DVD keepcase in the
// photos is 7.5 x 5.3 in, and the green rail below it measures 36 x 9.5 in.
const TABLE_W = 6.0;
const TABLE_D = 2.5;
const TABLE_H = 2.5;              // 30 in
// Hem flare: the drape stands off the table edge by this much at the floor.
// Deliberately small — the footprint below has to cover it, and the corridor
// this table stands in is only so wide.
const HEM_FLARE = 0.08;
const PLEATS = 24;                // vertical folds around the whole skirt
const PLEAT_AMP_FLOOR = 0.048;    // fold depth at the hem
const PLEAT_AMP_TOP = 0.004;      // ...and where the fabric is pinned to the top

// Stepped rack: three tiers per long face, meeting at the ridge, so the two
// faces together use the table's full 2.5 ft depth.
const TIERS = 3;
const TIER_DEPTH = TABLE_D / (2 * TIERS);   // 0.4167 ft per step
const TIER_RISE = 0.42;                     // ~5 in — leaves ~2/3 of each row behind visible
const DECK_T = 0.03;                        // wire deck thickness
const WIRE = 0.032;                         // wire section
const FENCE_H = 0.17;                       // front retaining fence
const RACK_W = TABLE_W - 0.12;              // rack sits just inside the table edge
const COLS = 11;                            // cases per tier face
const COL_PITCH = RACK_W / COLS;
const CASE_LEAN = -0.28;                    // rad; negative tips the case top back

// Rail sign: 36 x 9.5 in, verified (user-assets/fixtures/bundle-savings-sign).
const SIGN_W = 36 / 12;
const SIGN_H = 9.5 / 12;

type Colorway = 'green' | 'purple' | 'red';
// Field colors are the cast-corrected samples from the sign's NOTES.md.
const FIELD: Record<Colorway, string> = {
  green: '#05B181',
  purple: '#6A2896',
  red: '#EE5845',
};
const ACCENT_GOLD = '#F6C51A';

/** Attested POP interval for this kit (DOSSIER: purple 2007, green/red 2008). */
export const PV_DRAPE_TABLE_POP_KIT: [number, number] = [2007, 2008];

// ─── Rail-sign art ──────────────────────────────────────────────────────────
// User art (the redrawn rail — git-ignored, see public/user-assets/README.md)
// is cached per colorway for the session; a 404 is the normal case and leaves
// the generic fallback up. Same pattern as storefront-campaign-poster.ts.
const userTex = new Map<Colorway, THREE.Texture>();
const userTexMissing = new Set<Colorway>();

// Generic, brand-free rail in the MEASURED layout of the real one (NOTES.md
// "Measurements (final)" — x/y are fractions of the 3.789:1 board). Same roles,
// none of the trademarked copy: two-tone display block left, price group
// centre, descriptive stack right, fine print along the bottom.
function fallbackTexture(colorway: Colorway): THREE.CanvasTexture {
  const w = 1516, h = Math.round(1516 / (SIGN_W / SIGN_H)); // 3.789:1
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;
  c.fillStyle = FIELD[colorway];
  c.fillRect(0, 0, w, h);
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';

  // Archivo Black is the display face of the real rail (FONT-REGISTRY: the PV
  // price family, verified on the bundle-savings overlay) and it is now
  // BUNDLED, so the rail sets the face it actually measured instead of asking
  // for an Arial Black this host does not have. CAP_EM is that family's cap
  // height as a fraction of the em — read off the shipped file's OS/2
  // sCapHeight (688/1000), not Arial Black's 0.716 — which is what turns the
  // spec's measured CAP heights into a font size.
  const CAP_EM = 0.688;
  const family = `${BB_ARCHIVO_BLACK}, sans-serif`;
  // Draw `text` to exactly fill [x0,x1] with its caps spanning [yTop,yBot]
  // (all fractions of the board) — the spec pins ink boxes, not point sizes.
  const box = (text: string, x0: number, x1: number, yTop: number, yBot: number, color: string) => {
    const capPx = (yBot - yTop) * h;
    c.font = `900 ${capPx / CAP_EM}px ${family}`;
    const natural = Math.max(1, c.measureText(text).width);
    c.save();
    c.translate(x0 * w, yBot * h);
    c.scale(((x1 - x0) * w) / natural, 1);
    c.fillStyle = color;
    c.fillText(text, 0, 0);
    c.restore();
  };
  const fine = (text: string, x0: number, baseY: number, cap: number, color: string) => {
    c.font = `${(cap * h) / CAP_EM}px Arial, Helvetica, sans-serif`;
    c.fillStyle = color;
    c.fillText(text, x0 * w, baseY * h);
  };

  box('GREAT', 0.0383, 0.3897, 0.2385, 0.4305, '#ffffff');
  box('DEALS', 0.0383, 0.4312, 0.4775, 0.6675, ACCENT_GOLD);
  box('2', 0.4861, 0.5553, 0.2210, 0.6620, '#ffffff');
  box('FOR', 0.5645, 0.6342, 0.5360, 0.6620, '#ffffff');
  box('$', 0.6089, 0.6421, 0.2160, 0.4820, '#ffffff');
  box('20', 0.6461, 0.7913, 0.2210, 0.6620, '#ffffff');
  box('PREVIOUSLY', 0.8046, 0.9451, 0.3510, 0.4270, '#ffffff');
  box('VIEWED DVDS', 0.8046, 0.9549, 0.4530, 0.5320, '#ffffff');
  fine('Selected titles.', 0.8012, 0.604, 0.030, '#ffffff');
  fine('Previously rented discs. Selected titles while supplies last. Not valid with any other offer. See store for details.',
    0.0383, 0.935, 0.030, '#ffffff');

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// ─── Black drape ────────────────────────────────────────────────────────────
// A closed skirt swept around the table's perimeter: RINGS horizontal loops
// from the table edge down to the floor, each loop a rectangle that grows by
// HEM_FLARE toward the hem and carries a sine ripple pushed along the outward
// radial (radial, not the edge normal, so the folds run continuously around
// the corners instead of tearing open there). Vertex colors darken the fold
// valleys — the whole reason the striping survives flat lighting on a
// near-black material.
function buildDrapeGeometry(): THREE.BufferGeometry {
  const RINGS = 6;
  const STEP = 0.11;              // target perimeter sample pitch, ft
  // Clockwise from above, so the quad winding below faces OUT.
  const edges: [number, number, number, number][] = [
    [-1, 1, 1, 1],    // front  (z = +D/2), x: -W/2 -> +W/2
    [1, 1, 1, -1],    // right  (x = +W/2), z: +D/2 -> -D/2
    [1, -1, -1, -1],  // back
    [-1, -1, -1, 1],  // left
  ];
  // One pass over the perimeter to fix the sample count/arc-length of each
  // loop vertex; every ring reuses it, so the folds line up vertically.
  const uAt: number[] = [];       // arc position 0..1 around the perimeter
  const sxAt: number[] = [];      // unit-square coords of the sample
  const szAt: number[] = [];
  const perim = 2 * (TABLE_W + TABLE_D);
  let arc = 0;
  for (const [x0, z0, x1, z1] of edges) {
    const len = Math.abs(x1 - x0) * (TABLE_W / 2) + Math.abs(z1 - z0) * (TABLE_D / 2);
    const n = Math.max(2, Math.round(len / STEP));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      sxAt.push(x0 + (x1 - x0) * t);
      szAt.push(z0 + (z1 - z0) * t);
      uAt.push((arc + len * t) / perim);
    }
    arc += len;
  }
  const loop = uAt.length;

  const pos = new Float32Array(loop * RINGS * 3);
  const col = new Float32Array(loop * RINGS * 3);
  for (let r = 0; r < RINGS; r++) {
    const v = r / (RINGS - 1);                         // 0 at the top, 1 at the hem
    const y = TABLE_H * (1 - v);
    const flare = HEM_FLARE * Math.pow(v, 1.35);       // the skirt kicks out low down
    const amp = PLEAT_AMP_TOP + (PLEAT_AMP_FLOOR - PLEAT_AMP_TOP) * Math.pow(v, 1.15);
    for (let j = 0; j < loop; j++) {
      const bx = sxAt[j] * (TABLE_W / 2 + flare);
      const bz = szAt[j] * (TABLE_D / 2 + flare);
      const inv = 1 / Math.max(1e-4, Math.hypot(bx, bz));
      const fold = Math.sin(2 * Math.PI * PLEATS * uAt[j]);
      const o = amp * fold;
      const i3 = (r * loop + j) * 3;
      pos[i3] = bx + bx * inv * o;
      pos[i3 + 1] = y;
      pos[i3 + 2] = bz + bz * inv * o;
      // Valleys read darker than crests; the effect fades out at the pinned top.
      // On a near-black matte material the geometric folds alone barely turn
      // under store fluorescents — this is what actually makes them read.
      const shade = 1 + 0.42 * fold * (0.25 + 0.75 * v);
      col[i3] = col[i3 + 1] = col[i3 + 2] = shade;
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < RINGS - 1; r++) {
    for (let j = 0; j < loop; j++) {
      const a = r * loop + j;
      const b = (r + 1) * loop + j;
      const j2 = (j + 1) % loop;
      const c2 = (r + 1) * loop + j2;
      const d = r * loop + j2;
      idx.push(a, b, c2, a, c2, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export class PvDrapeTable implements SlottedFixture {
  public placement: FixturePlacement;
  // Deck heights, ascending — the surface each row of cases stands on. Same
  // contract the other slotted fixtures keep (StoreScene frames a fixture row
  // at shelfHeights[row] plus the case offsets).
  public shelfHeights: number[] = [];
  public cols = COLS;              // store-stock reads this for the browse cursor
  public capacity = 2 * TIERS * COLS;
  public genre = PREVIOUSLY_VIEWED;

  private ctx: FixtureContext;
  private group: THREE.Group | null = null;
  private disposables: Array<{ dispose(): void }> = [];
  private slotMovies: Movie[][] = [];   // [side][row*COLS + col]

  constructor(placement: FixturePlacement, ctx: FixtureContext) {
    this.placement = placement;
    this.ctx = ctx;

    const options = this.placement.options || {};
    if (options.relativeToBackWall) {
      const zOffset = typeof options.zOffset === 'number' ? options.zOffset : this.placement.position.z;
      this.placement.position.z = Math.min(this.ctx.backWallZ + zOffset, FLOOR_FIXTURE_MAX_Z);
    }
    for (let t = 0; t < TIERS; t++) this.shelfHeights.push(TABLE_H + DECK_T + t * TIER_RISE);
  }

  private colorway(): Colorway {
    const raw = this.placement.options?.colorway;
    return raw === 'purple' || raw === 'red' ? raw : 'green';
  }

  /** False when this placement's POP kit doesn't belong in the current store. */
  private inPeriod(): boolean {
    const kit = this.placement.options?.popKit as [number, number] | undefined;
    return kit ? popKitVisible(kit[0], kit[1]) : true;
  }

  build(): void {
    if (!this.inPeriod()) return;
    this.initMovies();

    const group = new THREE.Group();
    group.name = `pv-drape-table-${this.placement.id}`;
    group.position.set(this.placement.position.x, 0, this.placement.position.z);
    group.rotation.y = this.placement.yaw;
    this.group = group;

    // ── Drape ────────────────────────────────────────────────────────────────
    // Near-black cotton twill: matte, no sheen, no metalness. vertexColors
    // carries the fold shading baked in buildDrapeGeometry().
    const drapeGeo = buildDrapeGeometry();
    const drapeMat = new THREE.MeshStandardMaterial({
      color: 0x18181e, roughness: 0.94, metalness: 0.0, vertexColors: true,
    });
    this.disposables.push(drapeGeo, drapeMat);
    const drape = new THREE.Mesh(drapeGeo, drapeMat);
    drape.castShadow = true;
    drape.receiveShadow = true;
    group.add(drape);

    // Table top, under the rack — the drape covers this too in the photos.
    const topGeo = new THREE.PlaneGeometry(TABLE_W, TABLE_D);
    const topMat = new THREE.MeshStandardMaterial({ color: 0x17171b, roughness: 0.92, metalness: 0.0 });
    this.disposables.push(topGeo, topMat);
    const top = new THREE.Mesh(topGeo, topMat);
    top.rotation.x = -Math.PI / 2;
    top.position.y = TABLE_H;
    top.receiveShadow = true;
    group.add(top);

    // ── Stepped wire rack ────────────────────────────────────────────────────
    group.add(this.buildRack());

    // ── Offer rail across the ridge ──────────────────────────────────────────
    group.add(this.buildRailSign());

    this.ctx.scene.add(group);
    this.ctx.addCollider(drape);
    this.ctx.requestShadowRefresh();
  }

  // Every rail, cross wire, fence upright and leg of the rack in ONE
  // InstancedMesh of a unit cube: a single (non-array) material means three.js
  // issues exactly one draw call for the lot.
  private buildRack(): THREE.InstancedMesh {
    const parts: { x: number; y: number; z: number; sx: number; sy: number; sz: number }[] = [];
    const push = (x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
      parts.push({ x, y, z, sx, sy, sz });

    for (const side of [1, -1]) {
      for (let t = 0; t < TIERS; t++) {
        const zOuter = side * (TABLE_D / 2 - t * TIER_DEPTH);
        const zInner = side * (TABLE_D / 2 - (t + 1) * TIER_DEPTH);
        const zMid = (zOuter + zInner) / 2;
        const deckY = TABLE_H + t * TIER_RISE + DECK_T / 2;
        // Deck: two rails along the length + cross wires between them.
        push(0, deckY, zOuter, RACK_W, DECK_T, WIRE);
        push(0, deckY, zInner, RACK_W, DECK_T, WIRE);
        for (let i = 0; i < 8; i++) {
          const x = (i / 7 - 0.5) * RACK_W;
          push(x, deckY, zMid, WIRE, DECK_T, TIER_DEPTH);
        }
        // Retaining fence along the deck's outer lip.
        push(0, deckY + FENCE_H, zOuter, RACK_W, WIRE, WIRE);
        for (let i = 0; i < 8; i++) {
          const x = (i / 7 - 0.5) * RACK_W;
          push(x, deckY + FENCE_H / 2, zOuter, WIRE, FENCE_H, WIRE);
        }
        // End frame: a leg at each end carrying this step off the table top.
        for (const ex of [-RACK_W / 2, RACK_W / 2]) {
          const h = deckY - TABLE_H;
          if (h > 0.02) push(ex, TABLE_H + h / 2, zMid, WIRE, h, WIRE);
        }
      }
    }
    // Ridge rail where the two faces' top decks meet, and the two clip stems
    // that carry the offer rail up off it.
    const ridgeY = TABLE_H + (TIERS - 1) * TIER_RISE + DECK_T / 2;
    push(0, ridgeY, 0, RACK_W, DECK_T, WIRE);
    for (const cx of [-SIGN_W / 2 + 0.14, SIGN_W / 2 - 0.14]) {
      const top = this.signBottomY() + 0.12;
      push(cx, (ridgeY + top) / 2, 0, WIRE, top - ridgeY, WIRE * 1.6);
    }

    const geo = new THREE.BoxGeometry(1, 1, 1);
    // Black epoxy-coated store wire: dark, a little specular, not chrome.
    const mat = new THREE.MeshStandardMaterial({ color: 0x1b1b20, roughness: 0.42, metalness: 0.45 });
    this.disposables.push(geo, mat);
    const mesh = new THREE.InstancedMesh(geo, mat, parts.length);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    parts.forEach((part, i) => {
      p.set(part.x, part.y, part.z);
      s.set(part.sx, part.sy, part.sz);
      mesh.setMatrixAt(i, m.compose(p, q, s));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /** Bottom edge of the rail: just clear of the top row's case tops. */
  private signBottomY(): number {
    return this.shelfHeights[TIERS - 1] + CASE_HEIGHT * Math.cos(CASE_LEAN) - 0.09;
  }

  // A back-to-back pair sharing one texture, so the rail reads FORWARDS from
  // both long faces (a single DoubleSide quad prints its reverse mirrored at
  // whoever walks round the table — the trick membership-oval-hanger uses).
  private buildRailSign(): THREE.Group {
    const way = this.colorway();
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      map: userTex.get(way) ?? fallbackTexture(way),
      roughness: 0.5, // printed rigid board, mildly glossy
      metalness: 0.0,
    });
    const geo = new THREE.PlaneGeometry(SIGN_W, SIGN_H);
    this.disposables.push(geo, mat);
    if (!userTex.has(way)) this.disposables.push(mat.map!);
    const y = this.signBottomY() + SIGN_H / 2;
    for (const dz of [0.012, -0.012]) {
      const face = markSignMesh(new THREE.Mesh(geo, mat));
      face.position.set(0, y, dz);
      if (dz < 0) face.rotation.y = Math.PI;
      group.add(face);
    }

    if (!userTex.has(way) && !userTexMissing.has(way)) {
      tryLoadUserAssetTexture(`fixtures/bundle-savings-sign/front-${way}.png`, (tex) => {
        tex.anisotropy = 8;
        userTex.set(way, tex);   // cached for the session; teardown never disposes maps
        const old = mat.map;
        mat.map = tex;           // harmless if this build was already torn down
        mat.needsUpdate = true;
        // The procedural canvas this build started with is now unreachable.
        const at = this.disposables.indexOf(old!);
        if (at >= 0) this.disposables.splice(at, 1);
        old?.dispose();
        this.ctx.requestRender();
      }, { onMiss: () => { userTexMissing.add(way); } });
    }
    return group;
  }

  // PREVIOUSLY VIEWED stock: ex-rental discs, so the pool is what the store has
  // actually played, most recent first — the same rule the promo stands'
  // `recently-played` campaign uses. A real PV table was never half empty
  // though, so when the watch history can't fill it the rest of the catalog
  // pads it out rather than leaving bare wire.
  private initMovies(): void {
    const seen = new Set<string>();
    const played: Movie[] = [];
    const rest: Movie[] = [];
    this.ctx.libraries.forEach((lib) => lib.movies.forEach((m) => {
      // Same exclusion the promo campaigns use: a case with no rental copy
      // behind it was never previously viewed. Series boxsets render
      // triple-depth and would punch out through the tier behind them.
      if (m.comingSoon || m.discovery || m.collectionGap || m.game || m.isSeries) return;
      if (seen.has(m.id)) return;
      seen.add(m.id);
      (m.played || (m.playCount ?? 0) > 0 ? played : rest).push(m);
    }));
    played.sort((a, b) => {
      const da = a.lastPlayedDate ? Date.parse(a.lastPlayedDate) : -Infinity;
      const db = b.lastPlayedDate ? Date.parse(b.lastPlayedDate) : -Infinity;
      if (da !== db) return db - da;
      return (b.playCount ?? 0) - (a.playCount ?? 0) || a.title.localeCompare(b.title);
    });
    rest.sort((a, b) => (b.communityRating ?? -1) - (a.communityRating ?? -1) || a.title.localeCompare(b.title));
    const pool = played.concat(rest);

    // A face each, no title on both — you walked round the table and found
    // different stock, which is what made these worth circling.
    this.slotMovies = [
      layoutFace(pool.slice(0, TIERS * COLS), TIERS, COLS),
      layoutFace(pool.slice(TIERS * COLS, 2 * TIERS * COLS), TIERS, COLS),
    ];
    if (this.slotMovies[1].length === 0) this.slotMovies[1] = this.slotMovies[0];
  }

  // Two faces (front = local +Z, back = local -Z), TIERS rows, COLS columns.
  // Same conventions as four-sided-display: `angle` is the face's world
  // heading, col 0 is the viewer's LEFT, and rows fill TOP-FIRST so a short
  // pool leaves the bottom step light rather than the headline row bare.
  getSlots(): FixtureSlot[] {
    const slots: FixtureSlot[] = [];
    if (!this.inPeriod() || this.slotMovies.length === 0) return slots;
    const xBase = this.placement.position.x;
    const zBase = this.placement.position.z;
    const rise = CASE_HEIGHT / 2 + 0.02;

    for (let side = 0; side < 2; side++) {
      const angle = side * Math.PI + this.placement.yaw;
      const sideName: 'front' | 'back' = side === 0 ? 'front' : 'back';
      const faceMovies = this.slotMovies[side] || [];

      for (let t = 0; t < TIERS; t++) {
        const rowFromTop = (TIERS - 1) - t;
        // Cases stand just inside the deck's outer lip and lean back on it.
        const lipZ = TABLE_D / 2 - t * TIER_DEPTH - CASE_DEPTH - 0.05;
        const localZ = lipZ + rise * Math.sin(CASE_LEAN);
        const localY = this.shelfHeights[t] + rise * Math.cos(CASE_LEAN);

        for (let col = 0; col < COLS; col++) {
          const movie = faceMovies[rowFromTop * COLS + col];
          if (!movie) continue;
          const localX = (col - (COLS - 1) / 2) * COL_PITCH;
          slots.push({
            movie,
            side: sideName,
            shelfIdx: t,
            col,
            restingX: xBase + localX * Math.cos(angle) + localZ * Math.sin(angle),
            restingY: localY,
            restingZ: zBase - localX * Math.sin(angle) + localZ * Math.cos(angle),
            restingRotY: angle,
            restingRotX: CASE_LEAN,
            depth: CASE_DEPTH,
            key: `fixture_${this.placement.id}_side_${sideName}_shelf_${t}_col_${col}`,
          });
        }
      }
    }
    return slots;
  }

  // The hem, not the table top: the drape flares past the edge and is the
  // thing a shopper actually walks into.
  //
  // No explicit `clearance`, so the plain 1.5 ft walkway applies — deliberately
  // NOT the FLOOR_DISPLAY_CLEARANCE the towers and dump bins demand. That rule
  // exists for fixtures customers circle from all four sides; this table has
  // two working faces and two dead 2.5-ft ends, and the chain deployed them in
  // ROWS at ordinary aisle spacing (photo 2888374339 has three of them in a
  // line). Charging 3 ft to the ends would also be unpayable: a 6-ft island
  // demanding 12.2 ft of slot does not fit anywhere in the 16-ft centre
  // walkway alongside the existing promo/bin chain — measured, every
  // arrangement, every store depth. The neighbours that DO demand 3 ft still
  // get it; see the placement comment for the measured gaps.
  getFootprint(): Footprint | null {
    if (!this.inPeriod()) return null;
    return {
      label: `fixture:${this.placement.id}`,
      kind: 'fixture',
      cx: this.placement.position.x,
      cz: this.placement.position.z,
      w: TABLE_W + 2 * HEM_FLARE + 0.04,
      d: TABLE_D + 2 * HEM_FLARE + 0.04,
      yaw: this.placement.yaw,
    };
  }

  // Re-run the ex-rental selection against whatever ctx.libraries reports
  // NOW (feedback/055: the table never restocked after a watch). The caller
  // (store-stock.ts's restockSlottedFixtures, wired from the video player's
  // onClose) diffs the fresh getSlots() against the already-baked instanced
  // slots and patches only what changed — this just recomputes slotMovies.
  refreshStock(): void {
    if (!this.inPeriod()) return;
    this.initMovies();
  }

  update(_timeMs: number): void {
    // Static prop — the drape is baked, not simulated.
  }

  dispose(): void {
    if (this.group) {
      this.ctx.scene.remove(this.group);
      this.group = null;
    }
    // Everything unique to this fixture. Slot cases belong to StoreScene's
    // shared meshes, and a loaded user rail texture is a module cache that
    // outlives any single build (as in storefront-campaign-poster.ts).
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}
