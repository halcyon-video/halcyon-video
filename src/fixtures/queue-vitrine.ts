import * as THREE from 'three';
import type { FixtureContext, StoreFixture } from '../fixtures';
import type { FixturePlacement } from '../store-layout';
import type { Footprint } from '../layout-validator';
import { activeStoreFormat } from '../store-format';
import { createGlassSurfaceNormalMap, useCheapMaterials } from '../canvas-textures';
import { installDisplayModel } from './display-model';

/** Original cabinet study, not an authenticated period replica. Static retail
 * cartons do not enter the rental stock, selection or clerk interaction sets. */
export class QueueVitrine implements StoreFixture {
  private group: THREE.Group | null = null;
  private owned: Array<{ dispose(): void }> = [];
  private removeModel: (() => void) | null = null;
  private collider: THREE.Mesh | null = null;
  constructor(public placement: FixturePlacement, private ctx: FixtureContext) {}

  build(): void {
    this.dispose();
    if (!activeStoreFormat().floorDisplays || this.ctx.storefrontSpec.counterShape === 'desk') return;
    const group = this.group = new THREE.Group();
    group.name = this.placement.id;
    group.position.set(this.placement.position.x, 0, this.placement.position.z);
    group.rotation.y = this.placement.yaw;
    const own = <T extends { dispose(): void }>(o: T): T => { this.owned.push(o); return o; };
    // Same inexpensive float-glass path as entrance/windows and floor displays.
    // Zero transmission: never introduce an additional opaque-scene pass.
    const glass = own(new THREE.MeshPhysicalMaterial({
      color: 0xe8f3f0, transparent: true, opacity: .10, roughness: .05,
      metalness: 0, depthWrite: false, side: THREE.DoubleSide,
      envMapIntensity: .8,
      ...(useCheapMaterials() ? {} : { clearcoat: .4, clearcoatRoughness: .05,
        clearcoatNormalMap: own(createGlassSurfaceNormalMap()),
        clearcoatNormalScale: new THREE.Vector2(.1, .1) }),
    }));
    glass.name = 'VitrineGlass'; glass.userData.envGainTarget = .76;
    const wood = own(new THREE.MeshStandardMaterial({ color: '#c3ad8c', roughness: .5 }));
    const trim = own(new THREE.MeshStandardMaterial({ color: '#aeb6bb', metalness: .8, roughness: .3 }));
    const carton = own(new THREE.MeshStandardMaterial({ color: '#7187a5', roughness: .65 }));
    const fallback = new THREE.Group(); group.add(fallback);
    const box = (name: string, p: number[], d: number[], m: THREE.Material) => {
      const mesh = new THREE.Mesh(own(new THREE.BoxGeometry(...d as [number, number, number])), m);
      mesh.name = name; mesh.position.set(...p as [number, number, number]);
      mesh.castShadow = m !== glass; mesh.receiveShadow = true; fallback.add(mesh);
    };
    box('Base', [0, .32, 0], [3.5, .64, 1.7], wood);
    for (const x of [-1.69, 1.69]) for (const z of [-.79, .79])
      box('FramePost', [x, 2.03, z], [.08, 2.78, .08], trim);
    box('FrontGlass', [0, 2.04, .79], [3.30, 2.64, .018], glass);
    box('RearGlass', [0, 2.04, -.79], [3.30, 2.64, .018], glass);
    for (const x of [-1.69, 1.69]) box('SideGlass', [x, 2.04, 0], [.018, 2.64, 1.50], glass);
    box('GlassTop', [0, 3.465, 0], [3.5, .035, 1.7], glass);
    for (const h of [1.43, 2.32]) box('GlassShelf', [0, h - .0175, 0], [3.27, .035, 1.43], glass);
    for (const h of [.64, 1.43, 2.32]) for (const x of [-1.17, -.39, .39, 1.17])
      box('SupportedCarton', [x, h + .3, .12], [.65, .6, .20], carton);
    const proxy = this.collider = new THREE.Mesh(own(new THREE.BoxGeometry(3.5, 3.483, 1.8)),
      own(new THREE.MeshBasicMaterial({ visible: false })));
    proxy.name = 'queue-vitrine-collision'; proxy.position.set(0, 3.483 / 2, -.05); group.add(proxy);
    this.ctx.scene.add(group); this.ctx.addCollider(proxy);
    this.removeModel = installDisplayModel(this.ctx, group, fallback, 'models/queue-vitrine.glb',
      { VitrineGlass: glass }, new THREE.Vector3(1, 1, 1), (model) => {
        model.traverse(o => { if (o instanceof THREE.Mesh && o.material === glass) o.castShadow = false; });
      });
    this.ctx.requestShadowRefresh(); this.ctx.requestRender();
  }
  getFootprint(): Footprint | null {
    if (!this.group) return null;
    // Rear pulls extend beyond the cabinet; rotate their .05 ft centre offset.
    return { label: `fixture:${this.placement.id}`, kind: 'fixture',
      cx: this.placement.position.x - .05 * Math.sin(this.placement.yaw),
      cz: this.placement.position.z - .05 * Math.cos(this.placement.yaw),
      w: 3.5, d: 1.8, yaw: this.placement.yaw, clearance: 1.5 };
  }
  update(): void {}
  dispose(): void {
    this.removeModel?.(); this.removeModel = null;
    if (this.collider) this.collider.raycast = () => {};
    this.collider = null;
    const built = !!this.group; this.group?.removeFromParent(); this.group = null;
    this.owned.forEach(o => o.dispose()); this.owned = [];
    if (built) { this.ctx.requestShadowRefresh(); this.ctx.requestRender(); }
  }
}
