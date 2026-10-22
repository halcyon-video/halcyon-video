import * as THREE from 'three';
import type { FixtureContext, FixtureSlot, SlottedFixture } from '../fixtures';
import type { FixturePlacement } from '../store-layout';
import type { Footprint } from '../layout-validator';
import { CASE_HEIGHT, CASE_DEPTH } from '../video-case';
import { buildPromoCampaign, type PromoCampaign } from '../promo-campaigns';
import { installDisplayModel } from './display-model';
import { prepareRetailModel } from './retail-model';
import { createPromoTopperFactory, type PromoTopperFactory } from './promo-topper';
import { FASCIA_BLADE_H } from './genre-fascia';
import { RETAIL_FIXTURE_SPECS, retailFixtureFootprint } from '../retail-fixture-specs';
import { SPOTLIGHT_COLUMN, spotlightColumnAngle, spotlightColumnCase } from './spotlight-column-geometry';

const SIDES = ['front', 'right', 'back', 'left'] as const;
// The centre column first on each face: the browse camera squares up to the
// first slot it finds on the selected side.
const COLUMN_ORDER = [1, 0, 2];

/**
 * Marquee column for an actor spotlight (#344): a turned drum with three
 * raked chrome ledge rings of face-out copies under a four-sided lamp-lit
 * marquee box lettered with the subject. Actor spotlights borrowed the
 * four-sided tower until this family existed. Original generic design; see
 * docs/retail-fixture-models.md.
 */
export class SpotlightColumn implements SlottedFixture {
  public shelfHeights: number[] = SPOTLIGHT_COLUMN.ledgeY.map((_, row) => spotlightColumnCase(row, CASE_HEIGHT, CASE_DEPTH).deckY);
  public capacity = SPOTLIGHT_COLUMN.ledgeY.length * SPOTLIGHT_COLUMN.columns * SPOTLIGHT_COLUMN.faces;
  // HUD aisle name: the spotlight subject.
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
    const c = SPOTLIGHT_COLUMN;
    const group = this.group = new THREE.Group();
    group.name = this.placement.id;
    group.position.set(this.placement.position.x, 0, this.placement.position.z);
    group.rotation.y = this.placement.yaw;

    const own = <T extends { dispose(): void }>(o: T): T => { this.owned.push(o); return o; };
    const body = own(new THREE.MeshStandardMaterial({ color: 0x141416, roughness: .45 }));
    const chrome = own(new THREE.MeshStandardMaterial({ color: 0xd0d0d4, roughness: .22, metalness: 1 }));
    // Loading stand-in: drum, flat ledge discs and the marquee box.
    const fallback = new THREE.Group();
    group.add(fallback);
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, y: number) => {
      const mesh = new THREE.Mesh(own(geometry), material);
      mesh.position.y = y; mesh.castShadow = mesh.receiveShadow = true;
      fallback.add(mesh);
    };
    add(new THREE.CylinderGeometry(1.1, 1.28, .3, 32), body, .15);
    add(new THREE.CylinderGeometry(c.drumRadius, c.drumRadius, c.marqueeBottomY - .3, 32), body, (c.marqueeBottomY + .3) / 2);
    for (const y of c.ledgeY) add(new THREE.CylinderGeometry(c.ledgeRadius, c.ledgeRadius, .04, 32), chrome, y);
    add(new THREE.BoxGeometry(c.marqueeSize, c.marqueeHeight, c.marqueeSize), body, c.marqueeBottomY + c.marqueeHeight / 2);

    // House-lettered subject on each marquee face, between the lamp rows.
    this.labels = createPromoTopperFactory();
    for (let face = 0; face < c.faces; face++) {
      const a = face * Math.PI / 2, out = c.marqueeSize / 2 + .03;
      const label = this.labels.build(campaign.faces[face]?.label || campaign.topper, c.marqueeSize - .3);
      label.position.set(Math.sin(a) * out, c.marqueeBottomY + (c.marqueeHeight - FASCIA_BLADE_H) / 2, Math.cos(a) * out);
      label.rotation.y = a;
      group.add(label);
      this.labelMeshes.push(label);
    }

    const envelope = RETAIL_FIXTURE_SPECS['spotlight-column'];
    const proxy = this.collider = new THREE.Mesh(
      own(new THREE.BoxGeometry(envelope.w, envelope.h, envelope.d)),
      own(new THREE.MeshBasicMaterial({ visible: false })),
    );
    proxy.name = `${this.placement.id}-collision`;
    proxy.position.y = envelope.h / 2;
    group.add(proxy);

    this.ctx.scene.add(group);
    this.ctx.addCollider(proxy);
    this.removeModel = installDisplayModel(this.ctx, group, fallback, 'models/spotlight-column.glb', {},
      new THREE.Vector3(1, 1, 1), model => {
        // Lamps glow in the room but must not relight it through the cube bake.
        model.traverse(o => {
          if (o instanceof THREE.Mesh && !Array.isArray(o.material) && o.material.name === 'MarqueeBulb')
            o.material.userData.bakeEmissiveOff = true;
        });
        prepareRetailModel(model);
      });
    this.ctx.requestShadowRefresh();
    this.ctx.requestRender();
  }

  getFootprint(): Footprint | null {
    return this.resolve() ? retailFixtureFootprint('spotlight-column', this.placement) : null;
  }

  getSlots(): FixtureSlot[] {
    const campaign = this.resolve(), c = SPOTLIGHT_COLUMN, slots: FixtureSlot[] = [];
    if (!campaign) return slots;
    const rows = c.ledgeY.length, { x, z } = this.placement.position, yaw = this.placement.yaw;
    for (let face = 0; face < c.faces; face++) {
      const movies = campaign.faces[face]?.movies ?? [];
      for (const col of COLUMN_ORDER) for (let row = 0; row < rows; row++) {
        // Fill from the top ring down: a short campaign leaves the bottom ring to restock.
        const movie = movies[(rows - 1 - row) * c.columns + col];
        if (!movie) continue;
        const angle = spotlightColumnAngle(face, col) + yaw, at = spotlightColumnCase(row, CASE_HEIGHT, CASE_DEPTH);
        slots.push({
          movie, side: SIDES[face], shelfIdx: row, col,
          restingX: x + at.radius * Math.sin(angle), restingY: at.y, restingZ: z + at.radius * Math.cos(angle),
          restingRotY: angle, restingRotX: -c.lean, depth: CASE_DEPTH,
          key: `fixture_${this.placement.id}_side_${SIDES[face]}_shelf_${row}_col_${col}`,
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
      const chain = Array.isArray(raw) && raw.length ? raw as string[] : ['actor-spotlight:0'];
      const c = SPOTLIGHT_COLUMN;
      this.campaign = buildPromoCampaign(chain, this.ctx.libraries, c.ledgeY.length, c.columns);
      this.genre = this.campaign?.topper ?? '';
      if (!this.campaign) this.ctx.log(`[promo] spotlight column ${this.placement.id}: no viable campaign (${chain.join(' -> ')}) — not built`, 'system');
    }
    return this.campaign;
  }
}
