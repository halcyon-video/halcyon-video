import * as THREE from 'three';
import { retailPackaging } from './retail-packaging';
import type { FixtureContext, StoreFixture } from '../fixtures';
import type { FixturePlacement } from '../store-layout';
import type { Footprint } from '../layout-validator';
import { installDisplayModel } from './display-model';
import { prepareRetailModel } from './retail-model';
import { RETAIL_FIXTURE_SPECS, retailFixtureFootprint } from '../retail-fixture-specs';

/**
 * Commercial 2-door refrigerated beverage cooler (#197).
 * Merchandises cold sodas, juices, and sports drinks in the front refreshment zone.
 */
export class TwoDoorCooler implements StoreFixture {
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
    const enamelMat = own(new THREE.MeshStandardMaterial({ color: '#d52e35', roughness: 0.25 }));
    const plinthMat = own(new THREE.MeshStandardMaterial({ color: '#18191c', roughness: 0.7 }));
    const headerMat = own(new THREE.MeshStandardMaterial({
      color: '#d52e35', roughness: 0.3,
    }));
    const glassMat = own(new THREE.MeshStandardMaterial({
      color: '#d6ecf5', roughness: 0.08, transparent: true, opacity: 0.35,
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

    // Lower refrigeration plinth / grille (Z: 0 to 0.8 ft)
    box('CoolerPlinth', [0, 0.4, 0], [4.15, 0.8, 2.55], plinthMat);
    // Main insulated cabinet body (Z: 0.8 to 5.6 ft)
    box('CoolerBody', [0, 3.2, -0.05], [4.2, 4.8, 2.5], enamelMat);
    // Upper illuminated lightbox marquee (Z: 5.6 to 6.5 ft)
    box('CoolerHeader', [0, 6.05, 0.1], [4.1, 0.9, 2.3], headerMat);
    // Glass double doors on front (+Z side)
    box('DoorLeftGlass', [-1.0, 3.2, 1.25], [1.95, 4.6, 0.08], glassMat);
    box('DoorRightGlass', [1.0, 3.2, 1.25], [1.95, 4.6, 0.08], glassMat);

    const envelope = RETAIL_FIXTURE_SPECS['two-door-cooler'];
    // Collision proxy box (4.2 x 6.5 x 2.6 ft)
    const proxy = this.collider = new THREE.Mesh(
      own(new THREE.BoxGeometry(envelope.w, envelope.h, envelope.d)),
      own(new THREE.MeshBasicMaterial({ visible: false })),
    );
    proxy.name = `${this.placement.id}-collision`;
    proxy.position.y = envelope.h / 2;
    group.add(proxy);

    this.ctx.scene.add(group);
    this.ctx.addCollider(proxy);
    this.removeModel = installDisplayModel(this.ctx, group, fallback, 'models/two-door-cooler.glb', retailPackaging(own, () => { if(this.group) this.ctx.requestRender(); }), new THREE.Vector3(1, 1, 1), prepareRetailModel);
    this.ctx.requestShadowRefresh();
    this.ctx.requestRender();
  }

  getFootprint(): Footprint | null {
    if (!this.group) return null;
    return retailFixtureFootprint('two-door-cooler', this.placement);
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
