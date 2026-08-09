import * as THREE from 'three';
import { Movie } from '../jellyfin';
import { FixturePlacement, seededRandom01, FLOOR_FIXTURE_MAX_Z } from '../store-layout';
import { FixtureContext, SlottedFixture, FixtureSlot } from '../fixtures';
import { Footprint, FLOOR_DISPLAY_CLEARANCE } from '../layout-validator';
import { createMovieInstancedMeshes, CASE_HEIGHT, CASE_DEPTH } from '../video-case';
import { markSignMesh } from '../sign-builders';
import { BB_OUTFIT } from '../bundled-fonts';

// ═══════════════════════════════════════════════════════════════════════════
// Bargain bin — a waist-height (2.7 ft) 3×3 ft dump tub of the library's
// WORST-audience-score titles (critic score deliberately ignored: this is the
// "audiences hated it" bin, RT-approved or not).
//
// A SlottedFixture: the browsable stock is a rummage jumble of slanted cases
// — two leaning rings per face (an outer ring propped against the tub wall,
// an inner ring leaning flatter against the pile), 4 sides × 2 rings × 3
// columns = 24 slots, all rendered by StoreScene's shared instanced-mesh
// pipeline, so every bin title is clickable/inspectable and the bin shows up
// as a browsable stop after the libraries (same plumbing as FourSidedDisplay:
// side cycling front→right→back→left at 3 columns, shelf = ring).
//
// Under the slot rings the fixture packs its own DECORATIVE filler — face-up
// duplicate copies lying jumbled at rim depth — so the tub always reads
// stuffed even when the worst-rated pool is thin. Filler is instanced per
// distinct movie (one InstancedMesh holding all copies of that title), so a
// full bin costs a handful of draws, not one per case.
// ═══════════════════════════════════════════════════════════════════════════

const SIDE_NAMES: Array<'front' | 'right' | 'back' | 'left'> = ['front', 'right', 'back', 'left'];
const COLS = 3; // matches StoreScene's fixed non-game fixture colsCount
const COL_PITCH = 0.74; // lateral spread within a quadrant — see RINGS

// The two slot rings per quadrant (local Z = distance from the bin centre out
// toward that quadrant's face; lean = rotX, negative tips the case top away so
// the cover reads face-up out of the tub).
//
// These used to sit at zC 0.36/0.9 with leans of -0.92/-0.5 — a narrow band of
// near-upright cases hugging each face, which left the middle of the tub bare
// and read as four tidy racks rather than a dump bin. Now the rings reach most
// of the way to the walls and the cases lie nearly flat (-PI/2 is dead flat),
// so the stock covers the tub's whole interior the way a rummaged bin does.
// Y offsets are relative to the rim: the pile now sits just INSIDE it.
const RINGS = [
  { zC: 0.42, yOff: -0.24, lean: -1.34, leanJitter: 0.3 }, // inner: flat on the pile
  { zC: 1.0, yOff: -0.14, lean: -1.18, leanJitter: 0.26 }, // outer: tipped up on the tub wall
];
// Resting yaw scatter, in radians either side of the quadrant's facing. The old
// ±0.09 was invisible; a dump bin should look tossed, and since the selected
// case now turns to face the camera on its own (see browseLookDown in
// three-scene) the resting angle no longer has to stay readable.
const YAW_SCATTER = Math.PI; // ±90°

export class BargainBin implements SlottedFixture {
  public placement: FixturePlacement;
  public shelfHeights: number[] = [];
  public capacity = SIDE_NAMES.length * RINGS.length * COLS;
  public genre = 'Bargain Bin';

  private ctx: FixtureContext;
  private group: THREE.Group | null = null;
  private disposables: Array<{ dispose(): void }> = [];
  private slotMovies: Movie[] = [];
  private fillerMovies: Movie[] = [];
  // False until build() actually puts a tub on the floor — see build()'s
  // no-stock bail and getFootprint().
  private built = false;

  constructor(placement: FixturePlacement, ctx: FixtureContext) {
    this.placement = placement;
    this.ctx = ctx;

    const options = this.placement.options || {};
    if (typeof options.genre === 'string') this.genre = options.genre;
    // Right-wall-relative X (mirrors game-section's relativeToLeftWall): the
    // bins live on the open front-right floor, which only exists at a
    // width-dependent X — a fixed world X would fall inside the shelf field
    // on narrow stores or float mid-floor on wide ones.
    if (options.relativeToRightWall) {
      const xOffset = typeof options.xOffset === 'number' ? options.xOffset : this.placement.position.x;
      this.placement.position.x = 11.0 + this.ctx.storeWidth / 2 - xOffset;
    }
    if (options.relativeToBackWall) {
      const zOffset = typeof options.zOffset === 'number' ? options.zOffset : this.placement.position.z;
      // Clamp: a shallow store's backWallZ + a deep zOffset must not land the
      // tub inside the checkout zone (see FLOOR_FIXTURE_MAX_Z).
      this.placement.position.z = Math.min(this.ctx.backWallZ + zOffset, FLOOR_FIXTURE_MAX_Z - 0.5);
    }

    // Ring case-centre heights drive both getSlots() and the browse/inspect
    // camera: StoreScene frames fixture rows at shelfHeights[row] + case
    // offsets, so each entry must be the ring's resting centre minus half a
    // case (the same relationship shelf fixtures have).
    const height = this.binHeight();
    this.shelfHeights = RINGS.map((r) => height + r.yOff - CASE_HEIGHT / 2);
  }

  private binSide(): number {
    return (this.placement.options?.footprintSize as number) || 3.0;
  }

  private binHeight(): number {
    return (this.placement.options?.height as number) || 2.7;
  }

  build(): void {
    const sideFt = this.binSide();
    const height = this.binHeight();

    this.initMovies();
    // Nothing to dump, no bin. A store with no catalog at all — opening day
    // (#41), where the whole point is BARE SHELVES, NO STOCK — used to get one
    // lone tub sign-written "BARGAIN BIN / 3 FOR $10" standing on an otherwise
    // empty floor, which reads as stock the store hasn't taken delivery of yet.
    // The empty-tub case is equally wrong on a tiny real library.
    if (this.slotMovies.length === 0) return;

    const group = new THREE.Group();
    group.position.set(this.placement.position.x, 0, this.placement.position.z);
    group.rotation.y = this.placement.yaw;
    this.group = group;

    // ── Tub body: theme-primary molded plastic ──────────────────────────────
    // Same tapered square-tub trick as PreviouslyViewedBin (4-sided cylinder,
    // flats to the cardinal axes), OPEN-ENDED so the jumble inside shows.
    // Colors come from the active theme (primary walls, secondary trim) so
    // the bin matches the store instead of a hardcoded gold/navy.
    const palette = this.ctx.activeTheme.palette;
    const topR = (sideFt * Math.SQRT2) / 2;
    const botR = (sideFt * 0.8 * Math.SQRT2) / 2;
    const geo = new THREE.CylinderGeometry(topR, botR, height, 4, 1, true);
    geo.rotateY(Math.PI / 4);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.primary),
      roughness: 0.62,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    this.disposables.push(geo, mat);
    const bin = new THREE.Mesh(geo, mat);
    bin.position.y = height / 2;
    bin.castShadow = true;
    bin.receiveShadow = true;
    group.add(bin);

    // Trim (theme secondary): a bumper rail proud of the top rim, a matching
    // kick band at the floor, and a chamfered lip closing the rim's raw top
    // edge — the three bands that make an extruded tub read as molded plastic
    // furniture rather than a bare prism.
    const trimMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.secondary),
      roughness: 0.5,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    this.disposables.push(trimMat);
    const wallRAt = (y: number) => botR + (topR - botR) * (y / height);
    const rimH = 0.22;
    const rimGeo = new THREE.CylinderGeometry(topR + 0.09, wallRAt(height - rimH) + 0.04, rimH, 4, 1, true);
    rimGeo.rotateY(Math.PI / 4);
    this.disposables.push(rimGeo);
    const rim = new THREE.Mesh(rimGeo, trimMat);
    rim.position.y = height - rimH / 2;
    rim.castShadow = true;
    rim.receiveShadow = true;
    group.add(rim);

    // Subtle top bevel: an inward chamfer ring sitting on the rail, so the
    // rim reads as a rounded plastic lip instead of a knife edge.
    const lipGeo = new THREE.CylinderGeometry(topR - 0.05, topR + 0.09, 0.07, 4, 1, true);
    lipGeo.rotateY(Math.PI / 4);
    this.disposables.push(lipGeo);
    const lip = new THREE.Mesh(lipGeo, trimMat);
    lip.position.y = height + 0.035;
    group.add(lip);

    const kickH = 0.32;
    const kickGeo = new THREE.CylinderGeometry(wallRAt(kickH) + 0.04, botR + 0.04, kickH, 4, 1, true);
    kickGeo.rotateY(Math.PI / 4);
    this.disposables.push(kickGeo);
    const kick = new THREE.Mesh(kickGeo, trimMat);
    kick.position.y = kickH / 2;
    kick.receiveShadow = true;
    group.add(kick);

    // False floor just under the jumble so sightlines between cases end on a
    // dark product bed, not the store carpet below.
    const bedGeo = new THREE.PlaneGeometry(sideFt * 0.92, sideFt * 0.92);
    const bedMat = new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 0.95, metalness: 0.0 });
    this.disposables.push(bedGeo, bedMat);
    const bed = new THREE.Mesh(bedGeo, bedMat);
    bed.rotation.x = -Math.PI / 2;
    bed.position.y = height - 0.72;
    group.add(bed);

    // "BARGAIN BIN" card on all four faces — the tubs are approached from
    // any direction on the open floor.
    const signTex = BargainBin.makeSignTexture(palette.primary, palette.secondary);
    const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.55, metalness: 0.0 });
    const signGeo = new THREE.PlaneGeometry(sideFt * 0.62, sideFt * 0.62 * 0.375);
    this.disposables.push(signTex, signMat, signGeo);
    // The wall leans outward toward the top rim: the flat-face apothem grows
    // from sideFt*0.8/2 at the floor to sideFt/2 at the rim. The card must sit
    // ON the face — apothem evaluated at the card's own height, leaned by the
    // wall's actual slope (top edge tips OUTWARD), and nudged proud of the
    // surface — or it half-sinks into the tub.
    const topApothem = sideFt / 2;
    const botApothem = (sideFt * 0.8) / 2;
    const wallLean = Math.atan2(topApothem - botApothem, height);
    const signY = height * 0.55;
    const signApothem = botApothem + (topApothem - botApothem) * (signY / height) + 0.05;
    for (const face of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      // markSignMesh, not a bare Mesh: the tub body receives shadow, so a card
      // that doesn't stays at full brightness on whichever faces the room's
      // lights miss — the "two sides glow" bug.
      const sign = markSignMesh(new THREE.Mesh(signGeo, signMat));
      sign.position.set(Math.sin(face) * signApothem, signY, Math.cos(face) * signApothem);
      // YXZ: yaw to the face first, then lean about the card's own X axis so
      // every face leans outward, not all four in the same world direction.
      sign.rotation.order = 'YXZ';
      sign.rotation.y = face;
      sign.rotation.x = wallLean;
      group.add(sign);
    }

    // ── Decorative filler: the stuffing under the browsable rings ───────────
    // Face-up copies lying jumbled at rim depth. These are fixture-owned decor
    // (duplicates of the slot titles when the pool is thin), NOT slots — the
    // browsable stock above them comes from getSlots() via the scene pipeline.
    // One InstancedMesh per distinct filler movie holds all of its copies.
    const copiesPerFiller = 2;
    this.fillerMovies.forEach((movie, mi) => {
      const { front, loadShelfDetails } = createMovieInstancedMeshes(movie, copiesPerFiller);
      for (let c = 0; c < copiesPerFiller; c++) {
        const seed = `${this.placement.id}_fill_${mi}_${c}`;
        const lx = (seededRandom01(seed + 'x') - 0.5) * 1.3;
        const lz = (seededRandom01(seed + 'z') - 0.5) * 1.3;
        const ly = height - 0.34 + seededRandom01(seed + 'y') * 0.1;
        const e = new THREE.Euler(
          -Math.PI / 2 + (seededRandom01(seed + 'p') - 0.5) * 0.55, // face-up ± a shove
          seededRandom01(seed + 'r') * Math.PI * 2, // any which way
          (seededRandom01(seed + 'q') - 0.5) * 0.3
        );
        const m4 = new THREE.Matrix4().compose(
          new THREE.Vector3(lx, ly, lz),
          new THREE.Quaternion().setFromEuler(e),
          new THREE.Vector3(1, 1, 1)
        );
        front.setMatrixAt(c, m4);
      }
      front.instanceMatrix.needsUpdate = true;
      front.castShadow = false; // inside the tub; the tub already shadows
      front.receiveShadow = true;
      group.add(front);
      loadShelfDetails(2); // front cover is face [4] — loaded here
    });

    this.ctx.scene.add(group);
    this.ctx.addCollider(bin);
    this.ctx.requestShadowRefresh();
    this.built = true;
  }

  // The lowest-audience-score titles across all libraries. Slots duplicate
  // cyclically when the pool slice is thin so the bin is always FULL; filler
  // prefers pool titles beyond the slot set, wrapping back when there are none.
  private initMovies(): void {
    const options = this.placement.options || {};
    const count = (options.count as number) || 30;
    const binIndex = (options.binIndex as number) || 0;

    const allMovies: Movie[] = [];
    const seen = new Set<string>();
    this.ctx.libraries.forEach((lib) =>
      lib.movies.forEach((m) => {
        // Series boxsets render triple-depth (SERIES_DEPTH_MULT) and would
        // punch through the tub walls in a slanted jumble — movies only.
        if (!seen.has(m.id) && !m.isSeries) {
          seen.add(m.id);
          allMovies.push(m);
        }
      })
    );
    // Worst audience score first; unrated titles only ever pad the tail.
    // criticRating is deliberately not consulted.
    const rated = allMovies.filter((m) => typeof m.communityRating === 'number');
    rated.sort((a, b) => (a.communityRating! - b.communityRating!) || a.title.localeCompare(b.title));
    const unrated = allMovies.filter((m) => typeof m.communityRating !== 'number');
    const pool = rated.concat(unrated);
    // Each bin takes its own slice so two tubs never show the same stinkers;
    // when a small library leaves a later bin's slice empty, it falls back to
    // the front of the pool rather than standing empty.
    let picked = pool.slice(binIndex * count, binIndex * count + count);
    if (picked.length === 0) picked = pool.slice(0, count);

    this.slotMovies = [];
    this.fillerMovies = [];
    if (picked.length === 0) return;
    for (let i = 0; i < this.capacity; i++) {
      this.slotMovies.push(picked[i % picked.length]);
    }
    const fillerDistinct = Math.min(picked.length, 8);
    for (let j = 0; j < fillerDistinct; j++) {
      this.fillerMovies.push(picked[(this.capacity + j) % picked.length]);
    }
  }

  // 4 faces × 2 rings × 3 columns of slanted, browsable cases. Same side
  // conventions as FourSidedDisplay (side angle = sideNum*90° + yaw, 3 cols,
  // key `fixture_<id>_side_<side>_shelf_<ring>_col_<col>`), so StoreScene's
  // fixture browse/inspect/hero machinery drives the bin unchanged. The
  // per-slot seeded lean/yaw jitter is what makes it read hand-rummaged; it
  // is deterministic, so repeated getSlots() calls agree with the sizing pass.
  getSlots(): FixtureSlot[] {
    const slots: FixtureSlot[] = [];
    if (this.slotMovies.length === 0) return slots;
    const xPosBase = this.placement.position.x;
    const zPosBase = this.placement.position.z;
    const height = this.binHeight();

    for (let side = 0; side < SIDE_NAMES.length; side++) {
      const angle = side * (Math.PI / 2) + this.placement.yaw;
      const sideName = SIDE_NAMES[side];

      for (let ring = 0; ring < RINGS.length; ring++) {
        const r = RINGS[ring];
        for (let col = 0; col < COLS; col++) {
          const movie = this.slotMovies[(side * RINGS.length + ring) * COLS + col];
          if (!movie) continue;
          const seed = `${this.placement.id}_${sideName}_${ring}_${col}`;

          // col 0 is the viewer's LEFT (world +localX is screen-right on every
          // face), matching four-sided-display so the shared
          // browse nav's left = col-- reads the right way round.
          // Jitter is deliberately loose now — a tossed pile, not a grid.
          const localX = (col - 1) * COL_PITCH + (seededRandom01(seed + 'x') - 0.5) * 0.34;
          const localZ = r.zC + (seededRandom01(seed + 'z') - 0.5) * 0.34;
          const localY = height + r.yOff + (seededRandom01(seed + 'y') - 0.5) * 0.08;

          const xPos = xPosBase + localX * Math.cos(angle) + localZ * Math.sin(angle);
          const zPos = zPosBase - localX * Math.sin(angle) + localZ * Math.cos(angle);

          slots.push({
            movie,
            side: sideName,
            shelfIdx: ring,
            col,
            restingX: xPos,
            restingY: localY,
            restingZ: zPos,
            restingRotY: angle + (seededRandom01(seed + 'r') - 0.5) * YAW_SCATTER,
            restingRotX: r.lean + (seededRandom01(seed + 'l') - 0.5) * 2 * r.leanJitter,
            depth: CASE_DEPTH,
            key: `fixture_${this.placement.id}_side_${sideName}_shelf_${ring}_col_${col}`,
          });
        }
      }
    }
    return slots;
  }

  private static makeSignTexture(primary: string, secondary: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;
    const ctx = canvas.getContext('2d')!;
    // Store palette (theme primary + secondary), so the card reads as
    // store-printed signage on the matching tub.
    ctx.fillStyle = primary;
    ctx.fillRect(0, 0, 512, 192);
    ctx.strokeStyle = secondary;
    ctx.lineWidth = 8;
    ctx.strokeRect(12, 12, 488, 168);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = secondary;
    ctx.font = `900 62px ${BB_OUTFIT}, sans-serif`;
    ctx.fillText('BARGAIN BIN', 256, 70);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 42px ${BB_OUTFIT}, sans-serif`;
    ctx.fillText('3 FOR $10', 256, 138);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    return tex;
  }

  // The tub's collision-relevant footprint is its wider top rim: exactly
  // sideFt face-to-face (same derivation as PreviouslyViewedBin). Floor
  // displays demand double-walkway clearance to everything, walls included.
  // Null when the bin declined to build (no stock): "no floor footprint" is
  // also what tells store-shell this fixture isn't on the floor, so nothing
  // hands an absent bin an overview cursor or a jump-index entry.
  getFootprint(): Footprint | null {
    if (!this.built) return null;
    const sideFt = this.binSide();
    return {
      label: `fixture:${this.placement.id}`,
      kind: 'fixture',
      cx: this.placement.position.x,
      cz: this.placement.position.z,
      w: sideFt,
      d: sideFt,
      yaw: this.placement.yaw,
      clearance: FLOOR_DISPLAY_CLEARANCE,
    };
  }

  update(_timeMs: number): void {
    // Static tub — no per-frame work.
  }

  dispose(): void {
    if (this.group) {
      this.ctx.scene.remove(this.group);
      this.group = null;
    }
    // Tub body geometry/materials/sign are unique to this fixture. The filler
    // movie cases reuse video-case.ts's shared singleton geometry and cached
    // materials/textures, which live for the app's lifetime — not disposed.
    // Slot cases belong to StoreScene's shared meshes, not to this fixture.
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}
