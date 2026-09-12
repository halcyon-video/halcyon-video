import * as THREE from 'three';
import type { FixtureContext, StoreFixture } from '../fixtures';
import type { FixturePlacement } from '../store-layout';
import type { Footprint } from '../layout-validator';
import { activeStoreFormat } from '../store-format';
import { installDisplayModel } from './display-model';

/** Original early-style paper lookup table; dimensions are design estimates.
 * Static paper never registers terminal/menu/stock interaction targets. */
export class CatalogPodium implements StoreFixture {
  private group: THREE.Group | null = null;
  private owned: Array<{ dispose(): void }> = [];
  private removeModel: (() => void) | null = null;
  private collider: THREE.Mesh | null = null;
  constructor(public placement: FixturePlacement, private ctx: FixtureContext) {}

  build(): void {
    this.dispose();
    if (activeStoreFormat().id !== 'corporate' || this.ctx.activeTheme.id !== 'bb-1990') return;
    const group = this.group = new THREE.Group();
    group.name = this.placement.id;
    group.position.set(this.placement.position.x, 0, this.placement.position.z);
    group.rotation.y = this.placement.yaw;
    const own = <T extends { dispose(): void }>(o: T): T => { this.owned.push(o); return o; };
    const wood = own(new THREE.MeshStandardMaterial({ color: '#b29d7e', roughness: .55 }));
    const paper = own(new THREE.MeshStandardMaterial({ color: '#ebe7d6', roughness: .86 }));
    const fallback = new THREE.Group(); group.add(fallback);
    const box = (name: string, p: number[], d: number[], m: THREE.Material) => {
      const mesh = new THREE.Mesh(own(new THREE.BoxGeometry(...d as [number, number, number])), m);
      mesh.name = name; mesh.position.set(...p as [number, number, number]); mesh.castShadow = true;
      fallback.add(mesh); return mesh;
    };
    box('Tabletop', [0, 2.455, 0], [3, .09, 2], wood);
    for (const x of [-1.32, 1.32]) for (const z of [-.82, .82])
      box('Leg', [x, 1.205, z], [.15, 2.41, .15], wood);
    box('RearSupport', [0, 2.7, -.57], [2.1, .4, .06], wood);
    box('Cradle', [0, 2.81, 0], [2.5, .06, 1.5], wood).rotation.x = -Math.PI / 9;
    box('PaperCatalog', [0, 2.90, -.034], [2.3, .12, 1.34], paper).rotation.x = -Math.PI / 9;
    const proxy = this.collider = new THREE.Mesh(own(new THREE.BoxGeometry(3, 3.25, 2)),
      own(new THREE.MeshBasicMaterial({ visible: false })));
    proxy.name = 'catalog-podium-collision'; proxy.position.y = 1.625; group.add(proxy);
    this.ctx.scene.add(group); this.ctx.addCollider(proxy);
    this.removeModel = installDisplayModel(this.ctx, group, fallback, 'models/catalog-podium.glb', {});
    this.ctx.requestShadowRefresh(); this.ctx.requestRender();
  }
  getFootprint(): Footprint | null {
    if (!this.group) return null;
    return { label: `fixture:${this.placement.id}`, kind: 'fixture',
      cx: this.placement.position.x, cz: this.placement.position.z,
      w: 3, d: 2, yaw: this.placement.yaw, clearance: 1.5 };
  }
  update(): void {}
  dispose(): void {
    this.removeModel?.(); this.removeModel = null;
    // Context owns its collision array until store teardown. A removed fixture
    // must also stop responding if that array still retains the old proxy.
    if (this.collider) this.collider.raycast = () => {};
    this.collider = null;
    const built = !!this.group; this.group?.removeFromParent(); this.group = null;
    this.owned.forEach(o => o.dispose()); this.owned = [];
    if (built) { this.ctx.requestShadowRefresh(); this.ctx.requestRender(); }
  }
}
