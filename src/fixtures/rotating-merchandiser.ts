import * as THREE from 'three';
import type { FixtureContext, StoreFixture } from '../fixtures';
import type { FixturePlacement } from '../store-layout';
import type { Footprint } from '../layout-validator';
import { installDisplayModel } from './display-model';
import { prepareRetailModel } from './retail-model';
import { RETAIL_FIXTURE_SPECS, retailFixtureFootprint } from '../retail-fixture-specs';

/**
 * Rotating impulse spinner rack (#275): 4-tier wire merchandiser with caster base and header card.
 * Used in central corridors and checkout queues for boxed snacks, candy pouches, and impulse merchandise.
 */
export class RotatingMerchandiser implements StoreFixture {
  private group: THREE.Group | null = null;
  private owned: Array<{ dispose(): void }> = [];
  private removeModel: (() => void) | null = null;
  private collider: THREE.Mesh | null = null;

  constructor(public placement: FixturePlacement, private ctx: FixtureContext) {}

  build(): void {
    this.dispose();
    const group = this.group = new THREE.Group();
    group.name = this.placement.id;
    group.position.set(this.placement.position.x, 0, this.placement.position.z);
    group.rotation.y = this.placement.yaw;

    const own = <T extends { dispose(): void }>(o: T): T => { this.owned.push(o); return o; };
    const metalMat = own(new THREE.MeshStandardMaterial({ color: '#2b2c30', roughness: 0.4, metalness: 0.7 }));
    const wireMat = own(new THREE.MeshStandardMaterial({ color: '#8c9096', roughness: 0.3, metalness: 0.5 }));
    const cardMat = own(new THREE.MeshStandardMaterial({ color: '#f0f0f2', roughness: 0.6 }));

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

    const cyl = (name: string, p: [number, number, number], r: number, h: number, m: THREE.Material) => {
      const mesh = new THREE.Mesh(own(new THREE.CylinderGeometry(r, r, h, 16)), m);
      mesh.name = name;
      mesh.position.set(...p);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      fallback.add(mesh);
      return mesh;
    };

    // Center column pole (H: 5.2 ft)
    cyl('CenterColumn', [0, 2.6, 0], 0.08, 5.2, metalMat);
    // Base spider legs
    cyl('BaseRing', [0, 0.15, 0], 1.0, 0.15, metalMat);
    // 4 rotating wire basket tiers
    for (const [idx, y] of [1.6, 2.5, 3.4, 4.3].entries()) {
      cyl(`SpinnerTier_${idx}`, [0, y, 0], 0.9, 0.25, wireMat);
    }
    // Header sign topper
    box('HeaderCard', [0, 5.0, 0], [1.0, 0.4, 0.04], cardMat);

    const envelope = RETAIL_FIXTURE_SPECS['rotating-merchandiser'];
    // Collision proxy box (2.2 x 5.2 x 2.2 ft)
    const proxy = this.collider = new THREE.Mesh(
      own(new THREE.BoxGeometry(envelope.w, envelope.h, envelope.d)),
      own(new THREE.MeshBasicMaterial({ visible: false })),
    );
    proxy.name = `${this.placement.id}-collision`;
    proxy.position.y = envelope.h / 2;
    group.add(proxy);

    this.ctx.scene.add(group);
    this.ctx.addCollider(proxy);
    this.removeModel = installDisplayModel(this.ctx, group, fallback, 'models/rotating-merchandiser.glb', {}, new THREE.Vector3(1, 1, 1),
      model => { prepareRetailModel(model); model.position.y = -0.055; }); // Exported caster bottoms sit 0.055 ft above the source datum.
    this.ctx.requestShadowRefresh();
    this.ctx.requestRender();
  }

  getFootprint(): Footprint | null {
    if (!this.group) return null;
    return retailFixtureFootprint('rotating-merchandiser', this.placement);
  }

  update(): void {}

  dispose(): void {
    this.removeModel?.();
    this.removeModel = null;
    if (this.collider) this.collider.raycast = () => {};
    this.collider = null;
    this.group?.removeFromParent();
    this.group = null;
    this.owned.forEach((o) => o.dispose());
    this.owned = [];
  }
}
