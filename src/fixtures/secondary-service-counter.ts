import * as THREE from 'three';
import { getActiveTheme } from '../themes';
import { onBrandChange } from '../brand-live';
import type { FixtureContext, StoreFixture } from '../fixtures';
import type { FixturePlacement } from '../store-layout';
import type { Footprint } from '../layout-validator';
import { installDisplayModel } from './display-model';
import { prepareRetailModel } from './retail-model';
import { RETAIL_FIXTURE_SPECS, retailFixtureFootprint } from '../retail-fixture-specs';

/** Original secondary counter study. The recalled historical counter's function
 * is unverified; this decorative fixture does not process returns or accounts. */
export class SecondaryServiceCounter implements StoreFixture {
  private group: THREE.Group | null = null;
  private owned: Array<{ dispose(): void }> = [];
  private removeModel: (() => void) | null = null;
  private removeBrand: (() => void) | null = null;
  private collider: THREE.Mesh | null = null;

  constructor(public placement: FixturePlacement, private ctx: FixtureContext) {}

  build(): void {
    this.dispose();
    const group = this.group = new THREE.Group();
    group.name = this.placement.id;
    group.position.set(this.placement.position.x, 0, this.placement.position.z);
    group.rotation.y = this.placement.yaw;

    const own = <T extends { dispose(): void }>(o: T): T => { this.owned.push(o); return o; };
    const laminateMat = own(new THREE.MeshStandardMaterial({ color: '#eae7e2', roughness: 0.35 }));
    const topMat = own(new THREE.MeshStandardMaterial({ color: '#dadbde', roughness: 0.28 }));
    const accentMat = own(new THREE.MeshStandardMaterial({ color: getActiveTheme().palette.primary, roughness: 0.3 }));
    const plinthMat = own(new THREE.MeshStandardMaterial({ color: '#1f2024', roughness: 0.7 }));

    accentMat.name = 'CounterAccentBlue';
    this.removeBrand = onBrandChange(() => {
      accentMat.color.set(getActiveTheme().palette.primary);
      this.ctx.requestRender();
    });
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

    // Toe kick plinth (Z: 0 to 0.25 ft)
    box('CounterPlinth', [0, 0.125, -0.05], [4.9, 0.25, 2.5], plinthMat);
    // Main counter cabinet body (Z: 0.25 to 2.95 ft)
    box('CounterBody', [0, 1.6, 0], [5.1, 2.7, 2.68], laminateMat);
    // Active-brand accent stripe below worktop (Z: 2.75 to 2.95 ft)
    box('CounterAccent', [0, 2.85, -0.02], [5.12, 0.2, 2.7], accentMat);
    // Countertop slab (Z: 2.95 to 3.08 ft)
    box('Countertop', [0, 3.015, -0.02], [5.3, 0.13, 2.85], topMat);

    const envelope = RETAIL_FIXTURE_SPECS['secondary-service-counter'];
    // Collision proxy box (5.2 x 3.8 x 2.8 ft)
    const proxy = this.collider = new THREE.Mesh(
      own(new THREE.BoxGeometry(envelope.w, envelope.h, envelope.d)),
      own(new THREE.MeshBasicMaterial({ visible: false })),
    );
    proxy.name = `${this.placement.id}-collision`;
    proxy.position.y = envelope.h / 2;
    group.add(proxy);

    this.ctx.scene.add(group);
    this.ctx.addCollider(proxy);
    this.removeModel = installDisplayModel(this.ctx, group, fallback, 'models/secondary-service-counter.glb', { CounterAccentBlue: accentMat }, new THREE.Vector3(1, 1, 1), prepareRetailModel);
    this.ctx.requestShadowRefresh();
    this.ctx.requestRender();
  }

  getFootprint(): Footprint | null {
    if (!this.group) return null;
    return retailFixtureFootprint('secondary-service-counter', this.placement);
  }

  update(): void {}

  dispose(): void {
    this.removeBrand?.(); this.removeBrand = null;
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
