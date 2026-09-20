import * as THREE from 'three';
import type { FixtureContext, StoreFixture } from '../fixtures';
import type { FixturePlacement } from '../store-layout';
import type { Footprint } from '../layout-validator';
import { installDisplayModel } from './display-model';
import { prepareRetailModel } from './retail-model';
import { RETAIL_FIXTURE_SPECS, retailFixtureFootprint } from '../retail-fixture-specs';

/**
 * Acrylic popcorn bin fixture: approx 4-foot freestanding acrylic bin on a pedestal plinth.
 * Merchandises bulk pre-popped microwave or theatre-style bagged popcorn in retail corridors.
 */
export class AcrylicPopcornBin implements StoreFixture {
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
    const plinthMat = own(new THREE.MeshStandardMaterial({ color: '#1a1a1c', roughness: 0.7 }));
    const acrylicMat = own(new THREE.MeshStandardMaterial({
      color: '#e8f4f8', roughness: 0.1, transparent: true, opacity: 0.4,
    }));
    const popcornMat = own(new THREE.MeshStandardMaterial({ color: '#f5d77f', roughness: 0.8 }));

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

    box('PedestalBase', [0, 1.1, 0], [1.8, 2.2, 1.8], plinthMat);
    for (const z of [-.87,.87]) box('OpenTrayWall',[0,2.6,z],[1.76,.8,.02],acrylicMat);
    for (const x of [-.87,.87]) box('OpenTrayWall',[x,2.6,0],[.02,.8,1.72],acrylicMat);
    for (const x of [-.48,0,.48]) for (const z of [-.48,0,.48])
      box('BaggedPopcorn',[x,2.55,z],[.4,.65,.25],popcornMat);

    const envelope = RETAIL_FIXTURE_SPECS['acrylic-popcorn-bin'];
    // Collision proxy box (2.2 x 4.0 x 2.2 ft)
    const proxy = this.collider = new THREE.Mesh(
      own(new THREE.BoxGeometry(envelope.w, envelope.h, envelope.d)),
      own(new THREE.MeshBasicMaterial({ visible: false })),
    );
    proxy.name = `${this.placement.id}-collision`;
    proxy.position.y = envelope.h / 2;
    group.add(proxy);

    this.ctx.scene.add(group);
    this.ctx.addCollider(proxy);
    this.removeModel = installDisplayModel(this.ctx, group, fallback, 'models/acrylic-popcorn-bin.glb', {}, new THREE.Vector3(1, 1, 1), prepareRetailModel);
    this.ctx.requestShadowRefresh();
    this.ctx.requestRender();
  }

  getFootprint(): Footprint | null {
    if (!this.group) return null;
    return retailFixtureFootprint('acrylic-popcorn-bin', this.placement);
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
