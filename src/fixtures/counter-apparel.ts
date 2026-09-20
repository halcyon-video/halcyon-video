import { vestibuleLayout } from '../vestibule-layout.ts';
import * as THREE from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import type { FixtureContext, StoreFixture } from '../fixtures';
import type { FixturePlacement } from '../store-layout';
import { activeStoreFormat } from '../store-format';
import { installDisplayModel } from './display-model';
import { getActiveTheme } from '../themes';
import { getActiveLogoSpec } from '../logo-spec';
import { drawLogo } from '../logo-renderer';
import { onBrandChange } from '../brand-live';

/** Wall-mounted chain apparel; the active logo is printed onto the cloth. */
export class CounterApparel implements StoreFixture {
  private group: THREE.Group | null = null;
  private removeModel: (() => void) | null = null;
  private removeBrand: (() => void) | null = null;
  private print: THREE.Mesh | null = null;
  constructor(public placement: FixturePlacement, private ctx: FixtureContext) {}
  build(): void {
    this.dispose();
    if (this.ctx.activeTheme.id !== 'bb-1993' || activeStoreFormat().id !== 'corporate'
      || this.ctx.storefrontSpec.entryStyle !== 'vestibule') return;
    const group = this.group = new THREE.Group(); group.name = this.placement.id;
    group.position.set(this.placement.position.x, 4.8, vestibuleLayout(this.ctx.storefrontSpec).backZ - .06);
    group.rotation.y = this.placement.yaw;
    const fallback = new THREE.Group(); group.add(fallback);
    this.ctx.scene.add(group);
    this.removeModel = installDisplayModel(this.ctx, group, fallback, 'models/counter-apparel.glb', {},
      new THREE.Vector3(1, 1, 1), model => {
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 400;
        const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
        const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true,
          roughness: .9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
        model.updateMatrixWorld(true);
        const shirt = model.getObjectByName('ShirtCotton') as THREE.Mesh;
        const geometry = new DecalGeometry(shirt, new THREE.Vector3(-.65, 1.2, .35),
          new THREE.Euler(), new THREE.Vector3(.95, .59, .70));
        const print = this.print = new THREE.Mesh(geometry, material); print.name = 'apparel-store-logo';
        print.position.z = .004; print.receiveShadow = true; model.add(print);
        const refresh = () => {
          const theme = getActiveTheme();
          model.traverse(o => {
            if (!(o instanceof THREE.Mesh)) return;
            const mat = o.material as THREE.MeshStandardMaterial;
            if (mat.name === 'ShirtCotton' || mat.name === 'CapTwill') mat.color.set(theme.palette.primary);
            if (mat.name === 'RibAndStitch') mat.color.set(theme.palette.secondary);
          });
          const c = canvas.getContext('2d')!; c.clearRect(0, 0, canvas.width, canvas.height);
          drawLogo(c, getActiveLogoSpec(theme), { x: 0, y: 0, w: canvas.width, h: canvas.height });
          texture.needsUpdate = true; this.ctx.requestRender();
        };
        refresh(); this.removeBrand = onBrandChange(refresh);
      });
  }
  getFootprint(): null { return null; }
  update(): void {}
  dispose(): void {
    this.removeBrand?.(); this.removeBrand = null;
    if (this.print) {
      // The loader owns imported geometry only; remove the added print first.
      this.print.removeFromParent(); this.print.geometry.dispose();
      const mat = this.print.material as THREE.MeshStandardMaterial;
      mat.map?.dispose(); mat.dispose(); this.print = null;
    }
    this.removeModel?.(); this.removeModel = null;
    const built = !!this.group; this.group?.removeFromParent(); this.group = null;
    if (built) { this.ctx.requestShadowRefresh(); this.ctx.requestRender(); }
  }
}
