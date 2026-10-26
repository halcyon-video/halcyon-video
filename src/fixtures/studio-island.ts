import * as THREE from 'three';
import type { FixtureContext, FixtureSlot, SlottedFixture } from '../fixtures';
import { BOX_SPACING, type FixturePlacement } from '../store-layout';
import type { Footprint } from '../layout-validator';
import { CASE_HEIGHT, CASE_DEPTH } from '../video-case';
import { buildPromoCampaign, type PromoCampaign } from '../promo-campaigns';
import { installDisplayModel } from './display-model';
import { prepareRetailModel } from './retail-model';
import { createPromoTopperFactory, type PromoTopperFactory } from './promo-topper';
import { FASCIA_BLADE_H } from './genre-fascia';
import { RETAIL_FIXTURE_SPECS, retailFixtureFootprint } from '../retail-fixture-specs';
import { STUDIO_ISLAND, studioIslandCase, studioIslandRows } from './studio-island-geometry';

// Stocked faces, as four-sided-display sides: 0 is +Z, 2 is -Z.
const FACES = [[0, 'front'], [2, 'back']] as const;

/**
 * Two-sided island merchandiser for a studio feature (#344): tapered maple
 * gables and a spine carry three raked shelves of face-out copies on each face
 * under a header bar lettered with the studio. Studio features borrowed the
 * four-sided tower until this family existed. Original generic design; see
 * docs/retail-fixture-models.md.
 */
export class StudioIsland implements SlottedFixture {
  public shelfHeights = studioIslandRows().map(r => r.deckFrontY);
  public capacity = FACES.length * STUDIO_ISLAND.deckY.length * STUDIO_ISLAND.columns;
  // HUD aisle name: the featured studio.
  public genre = '';
  private group: THREE.Group | null = null;
  private owned: Array<{ dispose(): void }> = [];
  private removeModel: (() => void) | null = null;
  private collider: THREE.Mesh | null = null;
  private labels: PromoTopperFactory | null = null;
  private labelMeshes: THREE.Object3D[] = [];
  private campaign: PromoCampaign | null = null;
  private resolved = false;

  constructor(public placement: FixturePlacement, private ctx: FixtureContext) {}

  build(): void {
    this.dispose();
    const campaign = this.resolve();
    if (!campaign) return;
    const s = STUDIO_ISLAND;
    const group = this.group = new THREE.Group();
    group.name = this.placement.id;
    group.position.set(this.placement.position.x, 0, this.placement.position.z);
    group.rotation.y = this.placement.yaw;

    const own = <T extends { dispose(): void }>(o: T): T => { this.owned.push(o); return o; };
    const laminate = own(new THREE.MeshStandardMaterial({ color: 0xa7774a, roughness: .5 }));
    const dark = own(new THREE.MeshStandardMaterial({ color: 0x0f0f10, roughness: .6 }));
    // Loading stand-in: gables, plinth, spine, level shelves and the header bar.
    const fallback = new THREE.Group();
    group.add(fallback);
    const slab = (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) => {
      const mesh = new THREE.Mesh(own(new THREE.BoxGeometry(w, h, d)), material);
      mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true;
      fallback.add(mesh);
    };
    const inner = 2 * (s.halfWidth - s.laminate);
    for (const side of [-1, 1]) slab(s.laminate, s.top, 2 * s.foot, side * (s.halfWidth - s.laminate / 2), s.top / 2, 0, laminate);
    slab(inner, .32, 1.88, 0, .16, 0, dark);
    slab(inner, s.top, 2 * s.spine, 0, s.top / 2, 0, laminate);
    for (const row of studioIslandRows()) for (const side of [-1, 1]) {
      const depth = row.railFrontZ - s.spine;
      slab(inner, s.laminate, depth, 0, row.deckFrontY - s.laminate / 2, side * (s.spine + depth / 2), laminate);
    }
    slab(2 * s.halfWidth, s.headerHeight, 2 * s.headerZ, 0, s.top + s.headerHeight / 2, 0, dark);

    // House-lettered studio on both faces of the header bar.
    this.labels = createPromoTopperFactory();
    for (const [face] of FACES) {
      const a = face * Math.PI / 2, out = s.headerZ + .03;
      const label = this.labels.build(campaign.faces[face]?.label || campaign.topper, 2 * s.halfWidth - .3);
      label.position.set(0, s.top + (s.headerHeight - FASCIA_BLADE_H) / 2, Math.cos(a) * out);
      label.rotation.y = a;
      group.add(label);
      this.labelMeshes.push(label);
    }

    const envelope = RETAIL_FIXTURE_SPECS['studio-island'];
    const proxy = this.collider = new THREE.Mesh(
      own(new THREE.BoxGeometry(envelope.w, envelope.h, envelope.d)),
      own(new THREE.MeshBasicMaterial({ visible: false })),
    );
    proxy.name = `${this.placement.id}-collision`;
    proxy.position.y = envelope.h / 2;
    group.add(proxy);

    this.ctx.scene.add(group);
    this.ctx.addCollider(proxy);
    this.removeModel = installDisplayModel(this.ctx, group, fallback, 'models/studio-island.glb', {},
      new THREE.Vector3(1, 1, 1), prepareRetailModel);
    this.ctx.requestShadowRefresh();
    this.ctx.requestRender();
  }

  getFootprint(): Footprint | null {
    return this.resolve() ? retailFixtureFootprint('studio-island', this.placement) : null;
  }

  getSlots(): FixtureSlot[] {
    const campaign = this.resolve(), s = STUDIO_ISLAND, slots: FixtureSlot[] = [];
    if (!campaign) return slots;
    const rows = s.deckY.length, { x, z } = this.placement.position;
    for (const [face, side] of FACES) {
      const angle = face * Math.PI / 2 + this.placement.yaw, cos = Math.cos(angle), sin = Math.sin(angle);
      const movies = campaign.faces[face]?.movies ?? [];
      for (let row = 0; row < rows; row++) for (let col = 0; col < s.columns; col++) {
        // Fill from the top shelf down: a short campaign leaves the bottom shelf to restock.
        const movie = movies[(rows - 1 - row) * s.columns + col];
        if (!movie) continue;
        const c = studioIslandCase(row, col, CASE_HEIGHT, CASE_DEPTH, BOX_SPACING);
        slots.push({
          movie, side, shelfIdx: row, col,
          restingX: x + c.x * cos + c.z * sin, restingY: c.y, restingZ: z - c.x * sin + c.z * cos,
          restingRotY: angle, restingRotX: -s.lean, depth: CASE_DEPTH,
          key: `fixture_${this.placement.id}_side_${side}_shelf_${row}_col_${col}`,
        });
      }
    }
    return slots;
  }

  update(): void {}

  dispose(): void {
    this.removeModel?.();
    this.removeModel = null;
    if (this.collider) this.collider.raycast = () => {};
    this.collider = null;
    // This build's blade factory made the label meshes; their lettering
    // textures stay module-cached for the next build.
    for (const label of this.labelMeshes) label.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
    });
    this.labelMeshes = [];
    this.labels?.dispose();
    this.labels = null;
    this.group?.removeFromParent();
    this.group = null;
    this.owned.forEach(o => o.dispose());
    this.owned = [];
  }

  private resolve(): PromoCampaign | null {
    if (!this.resolved) {
      this.resolved = true;
      const raw = this.placement.options?.campaigns;
      const chain = Array.isArray(raw) && raw.length ? raw as string[] : ['studio-feature:0'];
      this.campaign = buildPromoCampaign(chain, this.ctx.libraries, STUDIO_ISLAND.deckY.length, STUDIO_ISLAND.columns);
      this.genre = this.campaign?.topper ?? '';
      if (!this.campaign) this.ctx.log(`[promo] studio island ${this.placement.id}: no viable campaign (${chain.join(' -> ')}) — not built`, 'system');
    }
    return this.campaign;
  }
}
