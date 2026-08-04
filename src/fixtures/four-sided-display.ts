import * as THREE from 'three';
import { Movie } from '../jellyfin';
import { FixturePlacement, BOX_SPACING, FLOOR_FIXTURE_MAX_Z } from '../store-layout';
import { FixtureContext, SlottedFixture, FixtureSlot } from '../fixtures';
import { Footprint, FLOOR_DISPLAY_CLEARANCE } from '../layout-validator';
import { CASE_HEIGHT, CASE_DEPTH } from '../video-case';
import { getActiveTheme, themeTrimDarkHex } from '../themes';
import { buildPromoCampaign, PromoCampaign, PROMO_FACE_COUNT } from '../promo-campaigns';
import { createPromoTopperFactory, PromoTopperFactory } from './promo-topper';

// A four-sided floor stand runs ONE promo campaign — PREVIOUSLY VIEWED, a
// studio spotlight, a seasonal promotion — chosen by the `campaigns` fallback
// chain in its placement options and resolved in promo-campaigns.ts. Its four
// faces may subdivide that campaign (PREVIOUSLY VIEWED gives a face to each
// library) but never carry unrelated subjects: a real four-sided tower shouted
// one thing from every side, which is what being four-sided was for.
//
// It used to face out a different Jellyfin BoxSet per side. That was wrong
// twice: most BoxSets hold two titles, so seven of a face's nine slots stood
// bare under a full-size sign, and video stores never organised the floor by
// taxonomy. Collections are still handled — members file adjacent on the shelf
// (shelfTitleCompare/store-plan), which is where a saga belongs.
const FACE_COUNT = PROMO_FACE_COUNT;
const FACE_COLS = 3;

export class FourSidedDisplay implements SlottedFixture {
  public placement: FixturePlacement;
  public shelfHeights: number[] = [1.5, 2.4, 3.3];
  public capacity = 36;
  // SlottedFixture contract + the HUD aisle name (getActiveAisleName): the
  // campaign's topper, e.g. "PREVIOUSLY VIEWED" or "STUDIO GHIBLI".
  public genre = '';

  private ctx: FixtureContext;
  private group: THREE.Group | null = null;
  private topperFactory: PromoTopperFactory | null = null;
  // Bumped on every build(); async sign-art callbacks from a previous build
  // check it so they don't repaint textures dispose() already released.
  private buildGeneration = 0;
  // Resolved once and memoized — getFootprint() and getSlots() must agree with
  // build() about whether this stand exists at all. null = no viable campaign,
  // so the stand builds nothing rather than standing half-stocked.
  private campaign: PromoCampaign | null = null;
  private campaignResolved = false;
  // Per-face content + labels, indexed by side (0 front, 1 right, 2 back, 3
  // left — the same side order getSlots() enumerates).
  private faceLabels: string[] = [];
  private faceMovies: Movie[][] = [];

  constructor(placement: FixturePlacement, ctx: FixtureContext) {
    this.placement = placement;
    this.ctx = ctx;

    // Parse options
    const options = this.placement.options || {};
    if (options.relativeToBackWall) {
      const zOffset = typeof options.zOffset === 'number' ? options.zOffset : this.placement.position.z;
      // Clamp: a shallow store's backWallZ + a deep zOffset must not land the
      // stand inside the checkout zone (see FLOOR_FIXTURE_MAX_Z).
      this.placement.position.z = Math.min(this.ctx.backWallZ + zOffset, FLOOR_FIXTURE_MAX_Z);
    }

    let heights = options.shelfHeights as number[] || [1.5, 2.4, 3.3];
    if (options.numberShelves && !options.shelfHeights) {
      const count = options.numberShelves as number;
      heights = [];
      for (let i = 0; i < count; i++) {
        heights.push(1.5 + i * 0.9);
      }
    }
    this.shelfHeights = heights;
    this.capacity = 4 * this.shelfHeights.length * 3; // 4 sides, N shelves, 3 columns per shelf
  }

  build(): void {
    if (!this.ensureCampaign()) return; // no viable campaign -> no stand

    const floorY = 0.0;
    const options = this.placement.options || {};
    const footprintSize = options.footprintSize as number || 2.0;
    const coreWidth = footprintSize;
    const coreDepth = footprintSize;
    const coreHeight = 4.0;

    this.group = new THREE.Group();
    this.group.position.set(this.placement.position.x, floorY, this.placement.position.z);
    this.group.rotation.y = this.placement.yaw;

    // Materials
    // #99: no `transmission` here -- it forces a full extra opaque-scene render
    // (renderTransmissionPass) every frame one of these is in view. transparent+
    // opacity (+ the scene's default envMapIntensity) gives the glassy read
    // cheaply, matching entrance/windows.ts's storefront glass.
    // Near-clear polished acrylic: low opacity + clearcoat sheen instead of the
    // old milky opacity-0.25 "fog" panes. depthWrite off so the stacked thin
    // panes blend by mesh sort order instead of popping against each other.
    const theme = getActiveTheme();
    const acrylicMat = new THREE.MeshPhysicalMaterial({
      color: 0xf4f8ff,
      transparent: true,
      opacity: 0.16,
      roughness: 0.05,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      side: THREE.DoubleSide,
      depthWrite: false,
      // On a near-mirror pane the env term IS the material, and the per-mode
      // display gain (2.6 at night) multiplied the whole reflection — the
      // shelves read as glowing white slabs after dark. Clamp like the
      // storefront glass: effective reflection pinned at 0.8 x the day gain
      // (0.95) whatever mode is active — see StoreScene.applyExteriorEnvClamp.
      envMapIntensity: 0.8,
    });
    acrylicMat.userData.envGainTarget = 0.76;

    // Store-brand core: theme primary, satin finish.
    const coreMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(theme.palette.primary),
      roughness: 0.4,
      metalness: 0.05
    });

    // Central brand-blue rectangular core
    const coreGeo = new THREE.BoxGeometry(coreWidth, coreHeight, coreDepth);
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.set(0, coreHeight / 2, 0);
    core.castShadow = true;
    core.receiveShadow = true;
    this.group.add(core);

    // Store-brand dressing: a gold accent band ringing the core under the
    // topper signs (echoes the checkout band's safety stripe) and a dark
    // trim plinth at the floor so the core doesn't dead-end into the carpet.
    const bandMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(theme.palette.secondary), roughness: 0.45, metalness: 0.05
    });
    const band = new THREE.Mesh(new THREE.BoxGeometry(coreWidth + 0.03, 0.14, coreDepth + 0.03), bandMat);
    band.position.set(0, coreHeight - 0.28, 0);
    band.castShadow = false;
    band.receiveShadow = true;
    this.group.add(band);
    const plinthMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(themeTrimDarkHex(theme)), roughness: 0.7, metalness: 0.05
    });
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(coreWidth + 0.06, 0.22, coreDepth + 0.06), plinthMat);
    plinth.position.set(0, 0.11, 0);
    plinth.castShadow = false;
    plinth.receiveShadow = true;
    this.group.add(plinth);

    // Shelves
    const shelfWidth = coreWidth - 0.2;
    const shelfDepth = 0.5;
    const displayShelfGeo = new THREE.BoxGeometry(shelfWidth, 0.02, shelfDepth);
    const rotationX = -0.25;

    const createSideShelves = () => {
      const group = new THREE.Group();
      this.shelfHeights.forEach(yPos => {
        const shelf = new THREE.Mesh(displayShelfGeo, acrylicMat);
        shelf.position.set(0, yPos, coreDepth / 2 + shelfDepth / 2);
        shelf.rotation.x = rotationX;
        group.add(shelf);
      });
      return group;
    };

    const frontShelves = createSideShelves();
    this.group.add(frontShelves);

    const rightShelves = createSideShelves();
    rightShelves.rotation.y = Math.PI / 2;
    this.group.add(rightShelves);

    const backShelves = createSideShelves();
    backShelves.rotation.y = Math.PI;
    this.group.add(backShelves);

    const leftShelves = createSideShelves();
    leftShelves.rotation.y = -Math.PI / 2;
    this.group.add(leftShelves);

    // Per-face header: the campaign's label for that face (faces 0..3 =
    // front/right/back/left, matching getSlots()'s side order), on the 1993
    // fascia blade in every theme — see promo-topper.ts. Not a billboard:
    // this carried a 2.25 ft backdrop-and-poster lightbox per face, four to a
    // stand, which was bigger than anything the real store hung over a floor
    // fixture and read as a kiosk rather than a display.
    this.topperFactory = createPromoTopperFactory();
    this.buildGeneration++; // orphan any in-flight art callbacks from a prior build
    const topperY = coreHeight + 0.01;
    // Seat each header just inside its face so the four meet cleanly at the
    // corners instead of overhanging into each other.
    const faceOffset = coreDepth / 2 - 0.04;
    const facePlacements: [number, number, number][] = [
      [0, faceOffset, 0],              // front  (+Z)
      [faceOffset, 0, Math.PI / 2],    // right  (+X)
      [0, -faceOffset, Math.PI],       // back   (-Z)
      [-faceOffset, 0, -Math.PI / 2],  // left   (-X)
    ];
    facePlacements.forEach(([x, z, rotY], faceIdx) => {
      const label = this.faceLabels[faceIdx] || this.genre;
      if (!label) return;
      const topper = this.topperFactory!.build(label, coreWidth);
      topper.position.set(x, topperY, z);
      topper.rotation.y = rotY;
      this.group!.add(topper);
    });

    this.ctx.scene.add(this.group);
    this.ctx.addCollider(this.group);
    this.ctx.requestShadowRefresh();
  }

  update(_timeMs: number): void {
    // No continuous per-frame logic required
  }

  dispose(): void {
    this.buildGeneration++; // orphan any in-flight art callbacks
    if (this.group) {
      this.ctx.scene.remove(this.group);
      this.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      this.group = null;
    }
    // The traverse above frees the topper MESHES, but the factory also owns
    // per-label canvas textures that a material dispose() never touches.
    this.topperFactory?.dispose();
    this.topperFactory = null;
  }

  // Square core + the acrylic shelves, which protrude symmetrically past the
  // core face on all 4 sides (see build()'s createSideShelves/shelfDepth) —
  // so the true footprint is the core plus one shelfDepth on every edge.
  getFootprint(): Footprint | null {
    // An unbuilt stand (no viable campaign) occupies no floor and must not
    // raise clearance warnings against fixtures that ARE there.
    if (!this.ensureCampaign()) return null;
    const options = this.placement.options || {};
    const footprintSize = (options.footprintSize as number) || 2.0;
    const shelfDepth = 0.5; // matches build()'s local `shelfDepth`
    const size = footprintSize + 2 * shelfDepth;
    return {
      label: `fixture:${this.placement.id}`,
      kind: 'fixture',
      cx: this.placement.position.x,
      cz: this.placement.position.z,
      w: size,
      d: size,
      yaw: this.placement.yaw,
      // Customers circle a floor display from all four faces: it demands
      // double the plain-aisle walkway to every other object, walls included.
      clearance: FLOOR_DISPLAY_CLEARANCE,
    };
  }

  getSlots(): FixtureSlot[] {
    const slots: FixtureSlot[] = [];
    if (!this.ensureCampaign()) return slots;
    const xPosBase = this.placement.position.x;
    const zPosBase = this.placement.position.z;
    const rotationX = -0.25;
    const options = this.placement.options || {};
    const footprintSize = options.footprintSize as number || 2.0;
    const coreDepth = footprintSize;
    const shelfDepth = 0.5;
    const baseLocalZ = coreDepth / 2 + shelfDepth / 2;
    const boxHeight = CASE_HEIGHT;
    const boxDepth = CASE_DEPTH;

    for (let side = 0; side < 4; side++) {
      const angle = side * (Math.PI / 2) + this.placement.yaw;
      const slotSideName: 'front' | 'right' | 'back' | 'left' =
        side === 0 ? 'front' : (side === 1 ? 'right' : (side === 2 ? 'back' : 'left'));
      const faceMovies = this.faceMovies[side] || [];

      for (let shelfIdx = 0; shelfIdx < this.shelfHeights.length; shelfIdx++) {
        const shelfY = this.shelfHeights[shelfIdx];

        // shelfHeights is ASCENDING (index 0 = bottom), so indexing it directly
        // stocked the first titles along the bottom and left the TOP shelves
        // empty on a part-filled face. Invert to fill top-first, exactly as the
        // person-endcap ("actor spotlight") rows do — the shortfall belongs on
        // the bottom row, where it reads as a shelf not yet restocked.
        const rowFromTop = (this.shelfHeights.length - 1) - shelfIdx;

        for (let col = 0; col < FACE_COLS; col++) {
          // Per-face slot index — the same row-major order layoutFace() fills,
          // so a short campaign's repeated titles stack down a column.
          const slotIdx = rowFromTop * FACE_COLS + col;
          const movie = faceMovies[slotIdx];
          if (!movie) continue;

          // col 0 is the viewer's LEFT: with (1 - col) the first title of each
          // row landed on the right, so a top-down fill still read right-to-left.
          const localX = (col - 1) * BOX_SPACING;
          const localZ = baseLocalZ + (boxHeight / 2 + 0.02) * Math.sin(rotationX);
          const localY = shelfY + (boxHeight / 2 + 0.02) * Math.cos(rotationX);

          const xPos = xPosBase + localX * Math.cos(angle) + localZ * Math.sin(angle);
          const zPos = zPosBase - localX * Math.sin(angle) + localZ * Math.cos(angle);
          const yPos = localY;

          slots.push({
            movie,
            side: slotSideName,
            shelfIdx,
            col,
            restingX: xPos,
            restingY: yPos,
            restingZ: zPos,
            restingRotY: angle,
            restingRotX: rotationX,
            depth: boxDepth,
            key: `fixture_${this.placement.id}_side_${slotSideName}_shelf_${shelfIdx}_col_${col}`
          });
        }
      }
    }
    return slots;
  }

  // Resolve this stand's campaign from its `campaigns` fallback chain — the
  // first viable one wins (see buildPromoCampaign). Memoized: getFootprint()
  // and getSlots() have to agree with build() about whether the stand exists,
  // and the store-shell build loop calls all three.
  private ensureCampaign(): PromoCampaign | null {
    if (this.campaignResolved) return this.campaign;
    this.campaignResolved = true;

    const raw = this.placement.options?.campaigns;
    const chain = Array.isArray(raw) && raw.length
      ? (raw as string[])
      : ['recently-played'];

    this.campaign = buildPromoCampaign(
      chain,
      this.ctx.libraries,
      this.shelfHeights.length,
      FACE_COLS,
    );

    this.faceLabels = [];
    this.faceMovies = [];
    if (!this.campaign) {
      // Nothing honest to sell here. Leaving the stand unbuilt is the point:
      // it's what stops a thin library from sprouting promo towers of two
      // tapes each, which is the bug the per-face-collection rule had.
      this.genre = '';
      // NOT the `[layout]` prefix — that belongs to the layout validator, and
      // sharing it makes a healthy fall-through read as a clearance violation.
      this.ctx.log(`[promo] stand ${this.placement.id}: no viable campaign (${chain.join(' -> ')}) — not built`, 'system');
      return null;
    }

    for (let f = 0; f < FACE_COUNT; f++) {
      const face = this.campaign.faces[f];
      this.faceLabels.push(face?.label || this.campaign.topper);
      this.faceMovies.push(face?.movies || []);
    }
    this.genre = this.campaign.topper;
    return this.campaign;
  }
}
