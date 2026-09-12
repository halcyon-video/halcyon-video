import * as THREE from 'three';
import type { FixtureContext, StoreFixture } from '../fixtures';
import type { FixturePlacement } from '../store-layout';
import { activeStoreFormat } from '../store-format';
import { installDisplayModel } from './display-model';

/** Neutral study, not a replica of unlocated 1993 garment artwork. Suction
 * hooks seat on the store face of the existing rear vestibule glazing. */
export class CounterApparel implements StoreFixture {
  private group: THREE.Group | null = null;
  private removeModel: (() => void) | null = null;
  constructor(public placement: FixturePlacement, private ctx: FixtureContext) {}
  build(): void {
    this.dispose();
    if (this.ctx.activeTheme.id !== 'bb-1993' || activeStoreFormat().id !== 'corporate'
      || this.ctx.storefrontSpec.entryStyle !== 'vestibule') return;
    const group = this.group = new THREE.Group(); group.name = this.placement.id;
    // Entrance uses frontZ=15 and chamber depth=2*doorWidth. Glass thickness
    // is .12 ft; seat the cups on its store-facing surface, never in midair.
    group.position.set(this.placement.position.x, 4.8, 15 - 2 * this.ctx.storefrontSpec.doorWidth - .06);
    group.rotation.y = this.placement.yaw;
    const fallback = new THREE.Group(); group.add(fallback);
    // No prior runtime garments exist: absence remains the loading/error fallback.
    this.ctx.scene.add(group);
    this.removeModel = installDisplayModel(this.ctx, group, fallback, 'models/counter-apparel.glb', {});
  }
  getFootprint(): null { return null; } // Above the existing counter; no floor/stock interaction.
  update(): void {}
  dispose(): void {
    this.removeModel?.(); this.removeModel = null;
    const built = !!this.group; this.group?.removeFromParent(); this.group = null;
    if (built) { this.ctx.requestShadowRefresh(); this.ctx.requestRender(); }
  }
}
