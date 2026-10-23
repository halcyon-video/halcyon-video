import * as THREE from 'three';
import type { FixtureContext, StoreFixture } from '../fixtures';
import type { FixturePlacement } from '../store-layout';
import { UNIT_FRAME_HEIGHT } from '../store-layout';
import type { StoreScene } from '../three-scene';
import { getActiveTheme } from '../themes';
import { activeStoreFormat } from '../store-format';
import { inSeason } from '../promo-campaigns';
import { CollectionEndcap } from './collection-endcap';
import { buildEndcapFooter, ENDCAP_WIDTH, ENDCAP_CORE_DEPTH } from './endcap-shelf';

// Reuse the established seasonal kit without inventing collection stock or a
// price card for an ordinary aisle. The public wrapper is deliberately not a
// SlottedFixture: furniture must not create an empty browse destination.
class EndDressing extends CollectionEndcap {
  override build(): void {
    this.group = new THREE.Group();
    this.group.name = this.placement.id;
    this.group.position.set(this.placement.position.x, 0, this.placement.position.z);
    this.group.rotation.y = this.placement.yaw;
    this.ctx.scene.add(this.group);
    // An inner (line-back) end takes the plinth with the outer ends' seasonal
    // front, but not their December tree.
    const inner = this.placement.options?.end === 'back';
    if (inSeason('holiday')) {
      if (inner) this.buildKitFooter(ENDCAP_WIDTH, ENDCAP_CORE_DEPTH);
      else this.buildHeader(ENDCAP_WIDTH, UNIT_FRAME_HEIGHT, ENDCAP_CORE_DEPTH);
    } else this.footerTex = buildEndcapFooter(this.group, ENDCAP_WIDTH, ENDCAP_CORE_DEPTH, {
      context: this.ctx, ownModel: dispose => { this.disposeFooterModel = dispose; },
    });
    this.ctx.addCollider(this.group);
    this.ctx.requestShadowRefresh();
    this.ctx.requestRender();
  }
}

export class AisleEndBase implements StoreFixture {
  private dressing: EndDressing;
  constructor(public placement: FixturePlacement, ctx: FixtureContext) {
    this.dressing = new EndDressing(placement, ctx);
  }
  build(): void { this.dressing.build(); }
  update(): void {}
  dispose(): void { this.dressing.dispose(); }
  getFootprint() { return this.dressing.getFootprint(); }
}

/** Every exposed display end is furnished even without server collections:
 * the outer (line-front) ends a collection display has not taken, and every
 * inner (line-back) end, turned to face its own walkway. Structural caps at
 * closed cross-aisle joins are not display sites; the plan's shared admission
 * rule keeps their circulation clearance intact. */
export function aisleEndBasePlacements(scene: StoreScene, occupied: ReadonlySet<number>): FixturePlacement[] {
  if (getActiveTheme().id !== 'bb-1990' || activeStoreFormat().id !== 'corporate') return [];
  const outer = scene.plan.openLineFrontEnds().filter(end => !occupied.has(end.unit.lineId)).map(end => {
    const u = end.unit;
    const pos = scene.plan.unitToWorld(u, u.xCenter, end.frontLocalZ + ENDCAP_CORE_DEPTH / 2);
    return { id: `aisle-end-base-${u.lineId}`, kind: 'aisle-end-base',
      position: { x: pos.x, z: pos.z }, yaw: u.yaw,
      options: { lineId: u.lineId, dressingOnly: true } };
  });
  const inner = scene.plan.openLineBackEnds().map(end => {
    const u = end.unit;
    const pos = scene.plan.unitToWorld(u, u.xCenter, end.backLocalZ - ENDCAP_CORE_DEPTH / 2);
    return { id: `aisle-end-base-${u.lineId}-back`, kind: 'aisle-end-base',
      position: { x: pos.x, z: pos.z }, yaw: u.yaw + Math.PI,
      options: { lineId: u.lineId, dressingOnly: true, end: 'back' } };
  });
  return [...outer, ...inner];
}
