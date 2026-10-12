import * as THREE from 'three';
import { installCandyGondolaPouches, installCandyGondolaSlatwallWing, SLATWALL_WING, slatwallWingFootprint } from './candy-pouch';
import { retailPackaging } from './retail-packaging';
import type { FixtureContext, StoreFixture } from '../fixtures';
import type { FixturePlacement } from '../store-layout';
import type { Footprint } from '../layout-validator';
import { installDisplayModel } from './display-model';
import { prepareRetailModel } from './retail-model';
import { RETAIL_FIXTURE_SPECS, retailFixtureFootprint } from '../retail-fixture-specs';

/**
 * Candy wall gondola fixture (#195): 4-ft wide multi-tier confectionery shelving unit.
 * Merchandises theatre-size candy boxes (#194) and hanging peg bags (#277) along perimeter walls.
 */
export class CandyWallGondola implements StoreFixture {
  private group: THREE.Group | null = null;
  private owned: Array<{ dispose(): void }> = [];
  private removeModel: (() => void) | null = null;
  private removePouches: (() => void) | null = null;
  private removeWing: (() => void) | null = null;
  private colliders: THREE.Mesh[] = [];

  constructor(public placement: FixturePlacement, private ctx: FixtureContext) {}

  build(): void {
    this.dispose();
    const group = this.group = new THREE.Group();
    group.name = this.placement.id;
    group.position.set(this.placement.position.x, 0, this.placement.position.z);
    group.rotation.y = this.placement.yaw;

    const own = <T extends { dispose(): void }>(o: T): T => { this.owned.push(o); return o; };
    const uprightMat = own(new THREE.MeshStandardMaterial({ color: '#dfdedb', roughness: 0.4 }));
    const shelfMat = own(new THREE.MeshStandardMaterial({ color: '#edece8', roughness: 0.3 }));
    const plinthMat = own(new THREE.MeshStandardMaterial({ color: '#1a1a1c', roughness: 0.7 }));
    const wingBoard = own(new THREE.MeshStandardMaterial({ color: '#d8c7a2', roughness: 0.62 }));

    const fallback = new THREE.Group();
    group.add(fallback);

    const box = (name: string, p: [number, number, number], d: [number, number, number], m: THREE.Material) => {
      const mesh = new THREE.Mesh(own(new THREE.BoxGeometry(...d)), m);
      mesh.name = name;
      mesh.position.set(...p);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      fallback.add(mesh);
      return mesh;
    };

    // Toe kick base (Z: 0 to 0.4 ft)
    box('GondolaKick', [0, 0.2, 0], [3.9, 0.4, 1.5], plinthMat);
    // Base deck shelf (Z: 0.4 to 0.7 ft)
    box('GondolaBaseDeck', [0, 0.55, 0.05], [4.0, 0.3, 1.5], shelfMat);
    // Back pegboard panel (Z: 0.4 to 5.0 ft)
    box('GondolaBackPegboard', [0, 2.7, -0.65], [4.0, 4.6, 0.1], uprightMat);
    // Adjustable upper shelves
    for (const [idx, y] of [1.6, 2.5, 3.4, 4.3].entries()) {
      box(`UpperShelf_${idx}`, [0, y, 0], [3.92, 0.08, 1.25], shelfMat);
    }

    const envelope = RETAIL_FIXTURE_SPECS['candy-wall-gondola'];
    // Collision proxy box (4.0 x 5.0 x 1.6 ft)
    const proxy = new THREE.Mesh(
      own(new THREE.BoxGeometry(envelope.w, envelope.h, envelope.d)),
      own(new THREE.MeshBasicMaterial({ visible: false })),
    );
    proxy.name = `${this.placement.id}-collision`;
    proxy.position.y = envelope.h / 2;
    group.add(proxy);
    this.colliders.push(proxy);
    const wing = this.hasSlatwallWing();
    if (wing) {
      // The hooks and bags reach past the shelving envelope into the aisle end.
      const reach = SLATWALL_WING.board + SLATWALL_WING.reach;
      const wingProxy = new THREE.Mesh(own(new THREE.BoxGeometry(reach, envelope.h, 2 * SLATWALL_WING.halfDepth)), proxy.material);
      wingProxy.name = `${this.placement.id}-slatwall-collision`;
      wingProxy.position.set(SLATWALL_WING.endX + reach / 2, envelope.h / 2, 0);
      group.add(wingProxy);
      this.colliders.push(wingProxy);
    }

    this.ctx.scene.add(group);
    this.colliders.forEach(c => this.ctx.addCollider(c));
    const finishes = retailPackaging(own, () => { if (this.group === group) this.ctx.requestRender(); });
    let prepared: THREE.Group | null = null;
    let pouchFallback: THREE.Group | null = null;
    let pouchSteel: THREE.Material = uprightMat;
    const startPouches = () => {
      if (!prepared || !pouchFallback || !pouchFallback.children.length || this.group !== group) return;
      const host = prepared;
      this.removePouches = installCandyGondolaPouches(this.ctx, group, pouchFallback,
        finishes, pouchSteel, () => host.parent === group && host.visible && this.group === group);
      if (wing) this.removeWing = installCandyGondolaSlatwallWing(this.ctx, group, finishes, pouchSteel,
        { SlatwallBoard: wingBoard, SlatwallKickBase: plinthMat },
        () => host.parent === group && host.visible && this.group === group);
    };
    const prepare = (model: THREE.Group) => {
      prepared = model;
      // Keep the old named stock separate before opaque material batching.
      // It remains visible and loader-owned until the replacement is ready.
      model.updateMatrixWorld(true);
      const inverse = model.matrixWorld.clone().invert();
      const stock: THREE.Mesh[] = [];
      model.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        const roles = Array.isArray(o.material) ? o.material : [o.material];
        const steel = roles.find(m => m.name === 'GondolaSteelStandard');
        if (steel) pouchSteel = steel;
        if (/^(SnackPouch_|PouchCrimp_)/.test(o.name)) stock.push(o);
      });
      pouchFallback = new THREE.Group(); pouchFallback.name = 'gondola-pouch-fallback';
      for (const mesh of stock) {
        const local = new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
        mesh.removeFromParent(); mesh.matrix.copy(local);
        local.decompose(mesh.position, mesh.quaternion, mesh.scale);
        mesh.matrixAutoUpdate = false; pouchFallback.add(mesh);
      }
      prepareRetailModel(model);
      pouchFallback.userData.sourcePartCount = stock.length;
      prepareRetailModel(pouchFallback); // Keep failed/pending stock at its original two print draws.
      model.add(pouchFallback);
      if (!this.ctx.prepareDetailModel) startPouches();
    };
    const modelContext = this.ctx.prepareDetailModel ? {
      ...this.ctx,
      prepareDetailModel: async (model: THREE.Group, signal: AbortSignal) => {
        await this.ctx.prepareDetailModel!(model, signal);
        if (!signal.aborted) startPouches();
      },
    } : this.ctx;
    this.removeModel = installDisplayModel(modelContext, group, fallback,
      'models/candy-wall-gondola.glb', finishes, new THREE.Vector3(1, 1, 1), prepare);
    this.ctx.requestShadowRefresh();
    this.ctx.requestRender();
  }

  getFootprint(): Footprint | null {
    if (!this.group) return null;
    const footprint = retailFixtureFootprint('candy-wall-gondola', this.placement);
    return this.hasSlatwallWing() ? slatwallWingFootprint(footprint) : footprint;
  }

  private hasSlatwallWing(): boolean {
    return this.placement.options?.slatwallWing === true;
  }

  update(): void {}

  dispose(): void {
    this.removePouches?.();
    this.removePouches = null;
    this.removeWing?.();
    this.removeWing = null;
    this.removeModel?.();
    this.removeModel = null;
    this.colliders.forEach(c => { c.raycast = () => {}; });
    this.colliders = [];
    this.group?.removeFromParent();
    this.group = null;
    this.owned.forEach((o) => o.dispose());
    this.owned = [];
  }
}
