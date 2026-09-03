// THE BACK ROOM — a small partitioned alcove in the back corner of the store,
// its doorway hung with a beaded curtain.
//
// Every neighbourhood video store had one, and the community asked for it
// (GH #33). It does not fit the corporate box — a chain store's floor is one
// open room by design — which is exactly why it belongs to the mom-and-pop
// FORMAT rather than to a theme: the format is the thing that is allowed to
// change the geometry of the room.
//
// WHAT THIS BUILDS, precisely: architecture. Two stud partitions closing off a
// corner against the back wall, a doorway in the return leg, a strand curtain
// hanging in it, a header board over it, an age placard beside it, and a warm
// bulb inside so the room reads as a room and not a hole. There is no content
// in here and none is implied by anything but the placard; the fittings are the
// period detail people remember, and the fittings are what this is.
//
// ── The curtain ─────────────────────────────────────────────────────────────
// One InstancedMesh. A beaded curtain genuinely IS a few thousand beads, so
// spheres are the honest primitive here rather than a lazy one — but a few
// thousand separate meshes would be a few thousand draw calls, and this store
// idles for days. Every bead in the doorway is one instance of a single
// low-poly sphere: one geometry, one material, one draw call, no per-frame work.
//
// The curtain carries NO collider. You walk through beads; that is what they are
// for. The partitions do collide, so the only way in is the doorway.
import * as THREE from 'three';
import { FixtureContext, StoreFixture } from '../fixtures';
import { FixturePlacement, STORE_CENTER_X } from '../store-layout';
import { Footprint } from '../layout-validator';
import { createSignTextTexture, createHandLetteredSignTexture } from '../canvas-textures';
import { formatShelfWood } from '../format-surfaces';
import { themeTrimDarkHex } from '../themes';


/** Default room size, feet. Deep enough to stand in, small enough to be a corner. */
const ROOM_W = 7.5;
const ROOM_D = 5.0;
/** Clear doorway opening, feet. */
const DOOR_W = 3.0;
const DOOR_H = 6.8;
/** Partition thickness, feet. */
const WALL_T = 0.34;
/** Bead diameter and the spacing of beads along a strand / strands across the door. */
const BEAD_D = 0.1;
const BEAD_PITCH = 0.125;
// Strands sit noticeably further apart than the beads are wide. That gap is
// the whole character of a bead curtain: you see THROUGH it in strips, and the
// room behind reads as a lit space rather than a wall. At bead pitch it came
// out a solid mat.
const STRAND_PITCH = 0.2;
/** Header board over the doorway. */
const HEADER_H = 0.85;

export class CurtainedAlcove implements StoreFixture {
  public placement: FixturePlacement;

  private ctx: FixtureContext;
  private group: THREE.Group | null = null;
  private disposables: Array<{ dispose(): void }> = [];
  private footprint: Footprint | null = null;

  constructor(placement: FixturePlacement, ctx: FixtureContext) {
    this.placement = placement;
    this.ctx = ctx;
  }

  private opt<T>(key: string, fallback: T): T {
    const v = this.placement.options?.[key];
    return (v === undefined ? fallback : v) as T;
  }

  build(): void {
    const roomW = this.opt('roomWidth', ROOM_W);
    const roomD = this.opt('roomDepth', ROOM_D);
    // Which back corner. 'right' is +X — the customer's right walking in, the
    // same convention the return chute and the promo stands use.
    const side: 1 | -1 = this.opt<string>('cornerSide', 'right') === 'left' ? -1 : 1;

    const ceilingY = this.ctx.ceilingY;
    if (ceilingY < DOOR_H + 0.4) return; // no room to stand a doorway in — build nothing

    // The room is DERIVED from the shell, not placed by hand: its outer wall IS
    // the store's side wall and its back wall IS the store's back wall, so it
    // lands correctly however wide or deep the library made the store.
    const storeWidth = this.ctx.storeWidth;
    const backZ = this.ctx.backWallZ;
    const outerX = STORE_CENTER_X + side * (storeWidth / 2);
    const innerX = outerX - side * roomW;      // the return partition's plane
    const frontZ = backZ + roomD;              // the partition parallel to the back wall
    const cx = (outerX + innerX) / 2;
    const cz = backZ + roomD / 2;

    const group = new THREE.Group();
    this.group = group;

    // Materials: the partitions are the same timber the rest of this format's
    // fittings are (a back room in a small shop is built out of what was in the
    // van), with the header board in the theme's dark trim so it reads as a
    // sign board rather than more wall.
    const wood = formatShelfWood();
    const wallMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(wood ? wood.hex : 0xd8d2c6),
      map: wood ? wood.textures.map : null,
      normalMap: wood ? wood.textures.normalMap : null,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughnessMap: wood ? wood.textures.roughnessMap : null,
      roughness: 0.68,
      metalness: 0.0,
    });
    this.disposables.push(wallMat);

    const slab = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      this.disposables.push(geo);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      this.ctx.addCollider(mesh);
      return mesh;
    };

    // 1. The partition PARALLEL to the back wall (the room's face onto the sales
    //    floor). Solid: the doorway is in the return leg, so this face can carry
    //    the whole width and the room is never seen into from the aisles.
    slab(roomW, ceilingY, WALL_T, cx, ceilingY / 2, frontZ);

    // 2. The RETURN leg, running back to the store's back wall, with the doorway
    //    cut out of it: a jamb pier either side, a header over the top.
    const doorCenterZ = frontZ - 0.35 - DOOR_W / 2; // opening biased toward the sales floor
    const pierFrontD = Math.max(0.01, frontZ - (doorCenterZ + DOOR_W / 2));
    const pierBackD = Math.max(0.01, (doorCenterZ - DOOR_W / 2) - backZ);
    if (pierFrontD > 0.02) {
      slab(WALL_T, ceilingY, pierFrontD, innerX, ceilingY / 2, frontZ - pierFrontD / 2);
    }
    if (pierBackD > 0.02) {
      slab(WALL_T, ceilingY, pierBackD, innerX, ceilingY / 2, backZ + pierBackD / 2);
    }
    // Header over the opening, from the door head to the ceiling.
    const overH = ceilingY - DOOR_H;
    if (overH > 0.05) {
      slab(WALL_T, overH, DOOR_W, innerX, DOOR_H + overH / 2, doorCenterZ);
    }

    // 3. The BEADED CURTAIN in the opening — one InstancedMesh (see header).
    this.buildBeadCurtain(group, innerX, side, doorCenterZ);

    // 4. Header board over the doorway, facing the sales floor, and the age
    //    placard beside it. The board says what the room is; the placard says
    //    who may go in. Both are ordinary store signs — the sign painter's
    //    theme colours, through the shared sign texture, per signage rule 2.
    this.buildSignage(group, innerX, side, doorCenterZ);

    // 5. A warm bulb inside, so the room reads as a lit space through the beads
    //    rather than a black rectangle. Emissive geometry only — no light in the
    //    scene, nothing per-frame: the store's render-on-demand loop must be
    //    able to idle at zero cost with this room on screen.
    const bulbGeo = new THREE.SphereGeometry(0.16, 10, 8);
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xfff0d0,
      emissive: new THREE.Color(0xffe2ab),
      emissiveIntensity: 1.4,
      roughness: 0.4,
    });
    this.disposables.push(bulbGeo, bulbMat);
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(cx, ceilingY - 0.6, cz);
    group.add(bulb);

    this.ctx.scene.add(group);
    this.ctx.requestShadowRefresh();

    // The footprint is the WHOLE room, so the floor planner and the clerk's nav
    // grid both treat it as solid building rather than as walkable floor. The
    // doorway is deliberately not carved out of it: nothing but the player goes
    // in there, and a 3 ft slot in a 5 ft rect rasterizes shut on the nav grid's
    // half-foot cells anyway (the same trap the counter's walk-through gap hit).
    this.footprint = {
      label: 'structure:curtained-alcove',
      kind: 'structure',
      cx, cz, w: roomW, d: roomD, yaw: 0,
    };
  }

  /**
   * The strand curtain. Beads are laid out in the doorway PLANE (constant X,
   * spanning Z across the opening and Y down from the head), each strand hung
   * from the header with a slight random length so the bottom edge is ragged
   * the way a real one is, and a small per-strand X wobble so the curtain has
   * thickness instead of reading as a flat printed sheet.
   */
  private buildBeadCurtain(group: THREE.Group, planeX: number, side: 1 | -1, doorCenterZ: number): void {
    const strands = Math.max(2, Math.floor(DOOR_W / STRAND_PITCH));
    const perStrand = Math.max(2, Math.floor((DOOR_H - 0.25) / BEAD_PITCH));
    const count = strands * perStrand;

    const geo = new THREE.SphereGeometry(BEAD_D / 2, 6, 5);
    // Amber acrylic beads: the commonest kind, and warm enough to catch the
    // room's bulb behind them so the curtain reads as lit from within.
    const mat = new THREE.MeshStandardMaterial({
      color: 0xb07434,
      roughness: 0.28,
      metalness: 0.12,
      emissive: new THREE.Color(0x2a1608),
      emissiveIntensity: 0.5,
    });
    this.disposables.push(geo, mat);

    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.castShadow = false;   // thousands of tiny casters would buy nothing
    mesh.receiveShadow = true;
    const m = new THREE.Matrix4();
    // Deterministic jitter: a screenshot has to be the same picture twice, and
    // Math.random() here would make every boot a different curtain.
    const wobble = (i: number, k: number) =>
      (Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;

    let n = 0;
    for (let s = 0; s < strands; s++) {
      const z = doorCenterZ - DOOR_W / 2 + (s + 0.5) * (DOOR_W / strands);
      // Each strand hangs a little forward or back of the plane and stops a
      // little short of the last one.
      const dx = wobble(s, 1) * 0.07;
      // Hang length varies by up to ~4 bead pitches, so the bottom edge is
      // ragged and no two neighbouring strands line up their beads.
      const drop = 0.05 + Math.abs(wobble(s, 2)) * 0.5;
      for (let b = 0; b < perStrand; b++) {
        const y = DOOR_H - 0.12 - drop - b * BEAD_PITCH;
        if (y < 0.05) break;
        m.makeTranslation(planeX + side * dx, y, z);
        mesh.setMatrixAt(n++, m);
      }
    }
    // Any instances left unwritten (strands that ran short) would otherwise draw
    // a clump of beads at the origin, out in the car park.
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  /** Header board over the doorway plus the age placard beside it. */
  private buildSignage(group: THREE.Group, planeX: number, side: 1 | -1, doorCenterZ: number): void {
    // The board faces INTO the store, i.e. along -side in X.
    const faceX = planeX - side * (WALL_T / 2 + 0.03);
    const yaw = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    const wood = formatShelfWood();

    const headerW = DOOR_W + 0.5;
    const headerTex = wood
      ? createHandLetteredSignTexture('BACK ROOM', undefined, headerW / HEADER_H, 'wood')
      : createSignTextTexture('BACK ROOM', undefined, 'standard', headerW / HEADER_H);
    const headerGeo = new THREE.PlaneGeometry(headerW, HEADER_H);
    const headerMat = new THREE.MeshStandardMaterial({
      map: headerTex,
      roughness: wood ? 0.8 : 0.55,
      metalness: wood ? 0.0 : 0.02,
    });
    this.disposables.push(headerGeo, headerMat, headerTex);
    const header = new THREE.Mesh(headerGeo, headerMat);
    header.position.set(faceX, DOOR_H + HEADER_H / 2 + 0.12, doorCenterZ);
    header.rotation.y = yaw;
    group.add(header);

    // Trim rail under the board, in the theme's dark trim — the same detail the
    // mirror column's cap band uses, and the thing that stops a flat printed
    // rectangle reading as a decal stuck on the wall. In wood format, matches the walnut end panel.
    const railGeo = new THREE.BoxGeometry(0.07, 0.09, headerW + 0.14);
    const railMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(wood ? wood.endPanelHex : themeTrimDarkHex()),
      roughness: wood ? 0.75 : 0.42,
      metalness: wood ? 0.05 : 0.25,
    });
    this.disposables.push(railGeo, railMat);
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.position.set(faceX, DOOR_H + 0.08, doorCenterZ);
    group.add(rail);

    // Age placard beside the opening, at reading height.
    //
    // It hangs on the BACK pier — the deep one. The doorway is biased toward
    // the sales floor (doorCenterZ), which leaves only ~0.35 ft of jamb on the
    // front side and the rest of the leg behind it, so this is the only pier
    // with a face wide enough to carry a sign. Offsetting the other way put the
    // placard past the front partition entirely, floating over the sales floor.
    const placW = 1.15, placH = 0.75;
    const placTex = wood
      ? createHandLetteredSignTexture('18 & OVER', 'PLEASE ASK AT THE COUNTER', placW / placH, 'card')
      : createSignTextTexture('18 & OVER', 'PLEASE ASK AT THE COUNTER', 'yellow', placW / placH);
    const placGeo = new THREE.PlaneGeometry(placW, placH);
    const placMat = new THREE.MeshStandardMaterial({
      map: placTex,
      roughness: wood ? 0.8 : 0.6,
      metalness: 0.0,
    });
    this.disposables.push(placGeo, placMat, placTex);
    const plac = new THREE.Mesh(placGeo, placMat);
    plac.position.set(faceX, 4.7, doorCenterZ - (DOOR_W / 2 + 0.62));
    plac.rotation.y = yaw;
    group.add(plac);
  }


  /**
   * Nothing moves in here. The curtain is deliberately static: the store idles
   * for days and its render loop composites nothing at the IDLE tier (see
   * animate() in three-scene.ts), so a swaying curtain would have to keep that
   * loop awake forever to animate a doorway nobody is standing in.
   */
  update(_timeMs: number): void {}

  getFootprint(): Footprint | null {
    return this.footprint;
  }

  dispose(): void {
    if (this.group) {
      this.ctx.scene.remove(this.group);
      this.group = null;
    }
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}
