import * as THREE from 'three';
import type { FixtureContext, FixtureSlot, SlottedFixture } from '../fixtures';
import { BOX_SPACING, type FixturePlacement } from '../store-layout';
import type { Footprint } from '../layout-validator';
import type { Movie } from '../jellyfin';
import { CASE_HEIGHT, CASE_DEPTH } from '../video-case';
import { buildPromoCampaign, type PromoCampaign } from '../promo-campaigns';
import { installDisplayModel } from './display-model';
import { prepareRetailModel } from './retail-model';
import { createFeatureFilmTopper } from './feature-film-topper';
import { createPromoTopperFactory, type PromoTopperFactory } from './promo-topper';
import { RETAIL_FIXTURE_SPECS, retailFixtureFootprint } from '../retail-fixture-specs';
import { FILM_DISPLAY, filmDisplayCaseCenter, filmDisplayRows } from './film-floor-display-geometry';

/**
 * Printed corrugated floor display for one featured film (#344): four raked
 * trays of face-out copies under a header card carrying the film's own
 * backdrop. Single-film promotions borrowed the four-sided tower until this
 * family existed. Original generic design; see docs/retail-fixture-models.md.
 */
export class FilmFloorDisplay implements SlottedFixture {
  public shelfHeights = filmDisplayRows().map(r => r.deckFrontY);
  public capacity = FILM_DISPLAY.rows * FILM_DISPLAY.columns;
  // HUD aisle name: the featured film's title.
  public genre = '';
  private group: THREE.Group | null = null;
  private owned: Array<{ dispose(): void }> = [];
  private removeModel: (() => void) | null = null;
  private collider: THREE.Mesh | null = null;
  private header: PromoTopperFactory | null = null;
  private headerArt: THREE.Object3D | null = null;
  // Memoized so build(), getSlots() and getFootprint() agree on whether the
  // display exists: no viable campaign builds nothing at all.
  private campaign: PromoCampaign | null = null;
  private resolved = false;

  constructor(public placement: FixturePlacement, private ctx: FixtureContext) {}

  build(): void {
    this.dispose();
    const stock = this.stock();
    if (!stock.length) return;
    const d = FILM_DISPLAY;
    const group = this.group = new THREE.Group();
    group.name = this.placement.id;
    group.position.set(this.placement.position.x, 0, this.placement.position.z);
    group.rotation.y = this.placement.yaw;

    const own = <T extends { dispose(): void }>(o: T): T => { this.owned.push(o); return o; };
    const print = own(new THREE.MeshStandardMaterial({ color: 0x111111, roughness: .55 }));
    const fallback = new THREE.Group();
    group.add(fallback);
    const slab = (w: number, h: number, depth: number, x: number, y: number, z: number, tilt = 0) => {
      const mesh = new THREE.Mesh(own(new THREE.BoxGeometry(w, h, depth)), print);
      mesh.position.set(x, y, z); mesh.rotation.x = -tilt;
      mesh.castShadow = mesh.receiveShadow = true;
      fallback.add(mesh);
    };
    // Loading stand-in: back, untapered sides, kick, trays and header card.
    const inner = 2 * (d.halfWidth - d.board), backFace = d.backZ + d.board;
    slab(2 * d.halfWidth, d.top + d.headerHeight, d.board, 0, (d.top + d.headerHeight) / 2, d.backZ + d.board / 2);
    for (const side of [-1, 1]) slab(d.board, d.top, d.footZ - d.backZ, side * (d.halfWidth - d.board / 2), d.top / 2, (d.footZ + d.backZ) / 2);
    slab(inner, d.kick, d.footZ - backFace, 0, d.kick / 2, (d.footZ + backFace) / 2);
    for (const [k, row] of filmDisplayRows().entries()) {
      const front = row.apronFrontZ - d.board, back = backFace + d.board;
      slab(inner, d.board, (front - back) / Math.cos(d.tilt), 0, (row.deckFrontY + row.deckBackY) / 2 - d.board / 2, (front + back) / 2, d.tilt);
      const bottom = k === 0 ? d.kick : row.deckFrontY - d.apron;
      slab(inner, row.deckFrontY + d.lip - bottom, d.board, 0, (row.deckFrontY + d.lip + bottom) / 2, row.apronFrontZ - d.board / 2);
    }

    // Header art: the film's own backdrop and title, else the house fascia label.
    const film = this.campaign!.id.startsWith('feature-title:') ? stock[0] : null;
    this.header = film ? createFeatureFilmTopper(film, this.ctx) : createPromoTopperFactory();
    const art = this.headerArt = this.header.build(this.genre, 2 * d.halfWidth);
    // The art board is 0.707 ft tall from 0.02 ft below its origin: centre it on the card.
    art.position.set(0, d.top + (d.headerHeight - .707) / 2 + .02, backFace + .018);
    group.add(art);

    const envelope = RETAIL_FIXTURE_SPECS['film-floor-display'];
    const proxy = this.collider = new THREE.Mesh(
      own(new THREE.BoxGeometry(envelope.w, envelope.h, envelope.d)),
      own(new THREE.MeshBasicMaterial({ visible: false })),
    );
    proxy.name = `${this.placement.id}-collision`;
    proxy.position.y = envelope.h / 2;
    group.add(proxy);

    this.ctx.scene.add(group);
    this.ctx.addCollider(proxy);
    this.removeModel = installDisplayModel(this.ctx, group, fallback, 'models/film-floor-display.glb', {},
      new THREE.Vector3(1, 1, 1), prepareRetailModel);
    this.ctx.requestShadowRefresh();
    this.ctx.requestRender();
  }

  getFootprint(): Footprint | null {
    return this.stock().length ? retailFixtureFootprint('film-floor-display', this.placement) : null;
  }

  getSlots(): FixtureSlot[] {
    const stock = this.stock(), d = FILM_DISPLAY, slots: FixtureSlot[] = [];
    const { x, z } = this.placement.position, yaw = this.placement.yaw;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    for (let row = 0; row < d.rows; row++) for (let col = 0; col < d.columns; col++) {
      // Fill from the top tray down: a short campaign leaves the bottom tray to restock.
      const movie = stock[(d.rows - 1 - row) * d.columns + col];
      if (!movie) continue;
      const c = filmDisplayCaseCenter(row, col, CASE_HEIGHT, CASE_DEPTH, BOX_SPACING);
      slots.push({
        movie, side: 'front', shelfIdx: row, col,
        restingX: x + c.x * cos + c.z * sin, restingY: c.y, restingZ: z - c.x * sin + c.z * cos,
        restingRotY: yaw, restingRotX: -d.tilt, depth: CASE_DEPTH,
        key: `fixture_${this.placement.id}_side_front_shelf_${row}_col_${col}`,
      });
    }
    return slots;
  }

  update(): void {}

  dispose(): void {
    this.removeModel?.();
    this.removeModel = null;
    if (this.collider) this.collider.raycast = () => {};
    this.collider = null;
    // The art meshes are built here; their canvas texture belongs to the factory.
    this.headerArt?.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
    });
    this.headerArt = null;
    this.header?.dispose();
    this.header = null;
    this.group?.removeFromParent();
    this.group = null;
    this.owned.forEach(o => o.dispose());
    this.owned = [];
  }

  private stock(): Movie[] {
    if (!this.resolved) {
      this.resolved = true;
      const raw = this.placement.options?.campaigns;
      const chain = Array.isArray(raw) && raw.length ? raw as string[] : ['feature-title:0'];
      this.campaign = buildPromoCampaign(chain, this.ctx.libraries, FILM_DISPLAY.rows, FILM_DISPLAY.columns);
      this.genre = this.campaign?.topper ?? '';
      if (!this.campaign) this.ctx.log(`[promo] film display ${this.placement.id}: no viable campaign (${chain.join(' -> ')}) — not built`, 'system');
    }
    return this.campaign?.faces[0]?.movies ?? [];
  }
}
