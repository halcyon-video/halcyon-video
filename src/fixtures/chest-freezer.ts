import * as THREE from 'three';
import type { FixtureContext, StoreFixture } from '../fixtures';
import type { FixturePlacement } from '../store-layout';
import type { Footprint } from '../layout-validator';
import { installDisplayModel } from './display-model';
import { prepareRetailModel } from './retail-model';
import { RETAIL_FIXTURE_SPECS, retailFixtureFootprint } from '../retail-fixture-specs';

/**
 * Commercial ice cream chest freezer: horizontal display freezer with sliding glass lids and interior wire baskets.
 * Merchandises pints and frozen novelty desserts in the front refreshment zone.
 */
export class ChestFreezer implements StoreFixture {
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
    const enamelMat = own(new THREE.MeshStandardMaterial({ color: '#f0f0ee', roughness: 0.25 }));
    const plinthMat = own(new THREE.MeshStandardMaterial({ color: '#18191a', roughness: 0.7 }));
    const bumperMat = own(new THREE.MeshStandardMaterial({ color: '#4a4d52', roughness: 0.6 }));
    const glassMat = own(new THREE.MeshStandardMaterial({
      color: '#dbeef4', roughness: 0.08, transparent: true, opacity: 0.35,
    }));

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

    // Toe kick base (Z: 0 to 0.20 ft)
    box('FreezerPlinth', [0, 0.1, 0], [3.6, 0.2, 2.0], plinthMat);
    // Lower body (Z: 0.2 to 1.35 ft)
    box('FreezerLower', [0, 0.775, 0], [3.78, 1.15, 2.18], enamelMat);
    // Protective bumper rail (Z: 1.35 to 1.55 ft)
    box('FreezerBumper', [0, 1.45, 0], [3.84, 0.2, 2.24], bumperMat);
    // Upper body (Z: 1.55 to 2.65 ft)
    box('FreezerUpper', [0, 2.1, 0], [3.78, 1.1, 2.18], enamelMat);
    // Top sliding glass lid assembly (Z: 2.65 to 2.80 ft)
    box('FreezerGlassTop', [0, 2.73, 0], [3.76, 0.08, 2.16], glassMat);

    const envelope = RETAIL_FIXTURE_SPECS['chest-freezer'];
    // Collision proxy box (3.8 x 2.8 x 2.2 ft)
    const proxy = this.collider = new THREE.Mesh(
      own(new THREE.BoxGeometry(envelope.w, envelope.h, envelope.d)),
      own(new THREE.MeshBasicMaterial({ visible: false })),
    );
    proxy.name = `${this.placement.id}-collision`;
    proxy.position.y = envelope.h / 2;
    group.add(proxy);

    this.ctx.scene.add(group);
    this.ctx.addCollider(proxy);
    this.removeModel = installDisplayModel(this.ctx, group, fallback, 'models/chest-freezer.glb', {}, new THREE.Vector3(1, 1, 1), prepareRetailModel);
    this.ctx.requestShadowRefresh();
    this.ctx.requestRender();
  }

  getFootprint(): Footprint | null {
    if (!this.group) return null;
    return retailFixtureFootprint('chest-freezer', this.placement);
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
