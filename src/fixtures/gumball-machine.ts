import * as THREE from 'three';
import type { FixturePlacement } from '../store-layout';
import type { FixtureContext, StoreFixture } from '../fixtures';
import type { Footprint } from '../layout-validator';
import { installDisplayModel } from './display-model';
import { GUMBALL_RADIUS, GUMBALL_HEIGHT } from './gumball-layout';

/** Static set dressing. Detail uses the existing deferred, cancellable model loader. */
export class GumballMachine implements StoreFixture {
  private group: THREE.Group | null = null;
  private removeModel: (() => void) | null = null;
  private owned: Array<{ dispose(): void }> = [];
  constructor(public placement: FixturePlacement, private ctx: FixtureContext) {}
  build(): void {
    const root = this.group = new THREE.Group(); root.name = this.placement.id;
    root.position.set(this.placement.position.x, 0, this.placement.position.z);
    root.rotation.y = this.placement.yaw;
    const fallback = new THREE.Group(); root.add(fallback);
    const enamel = new THREE.MeshStandardMaterial({ color: this.ctx.activeTheme.palette.primary, roughness: .24, metalness: .12 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xb4bec5, roughness: .21, metalness: .82 });
    // Thin transparent plastic avoids a full-viewport refraction pass on phones.
    const clear = new THREE.MeshStandardMaterial({ color: 0xe0f2ff, roughness: .13, transparent: true, opacity: .13, depthWrite: false, side: THREE.DoubleSide });
    this.owned.push(enamel, chrome, clear);
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, y: number) => {
      this.owned.push(g); const o = new THREE.Mesh(g,m); o.position.y=y;
      o.castShadow=!m.transparent; o.receiveShadow=!m.transparent; fallback.add(o); return o;
    };
    mesh(new THREE.CylinderGeometry(.76,1.0,.3,32),enamel,.15);
    mesh(new THREE.CylinderGeometry(.48,.48,2.5,24),chrome,1.55);
    mesh(new THREE.CylinderGeometry(.7,.6,.7,32),enamel,3.1);
    mesh(new THREE.SphereGeometry(.97,32,18),clear,4.42);
    mesh(new THREE.CylinderGeometry(.65,.72,.13,32),enamel,5.33);
    const coin=mesh(new THREE.BoxGeometry(.35,.43,.1),chrome,3.12); coin.position.z=.67;
    this.ctx.scene.add(root);
    // One stable collision proxy covers both public and installed models.
    const proxyGeo = new THREE.CylinderGeometry(GUMBALL_RADIUS,GUMBALL_RADIUS,GUMBALL_HEIGHT,24);
    const proxyMat = new THREE.MeshBasicMaterial({ visible:false }); this.owned.push(proxyGeo,proxyMat);
    const proxy=new THREE.Mesh(proxyGeo,proxyMat); proxy.name='gumball-collision'; proxy.position.y=GUMBALL_HEIGHT/2;
    root.add(proxy); this.ctx.addCollider(proxy);
    const sources = this.placement.options?.publicModelOnly
      ? ['models/gumball-machine.glb']
      : ['user-assets/fixtures/gumball-machine/machine.glb','models/gumball-machine.glb'];
    this.removeModel=installDisplayModel(this.ctx,root,fallback,sources,{ Enamel:enamel, ClearPlastic:clear });
    this.ctx.requestShadowRefresh();
  }
  getFootprint(): Footprint | null {
    if (!this.group) return null;
    // An attached endcap is structure; it doesn't demand a walkway through its host.
    return {label:`fixture:${this.placement.id}`,kind:'structure',cx:this.placement.position.x,cz:this.placement.position.z,
      w:GUMBALL_RADIUS*2,d:GUMBALL_RADIUS*2,yaw:0};
  }
  update(): void {}
  dispose(): void {
    this.removeModel?.(); this.removeModel=null;
    this.group?.removeFromParent(); this.group=null;
    this.owned.forEach(o=>o.dispose()); this.owned=[];
  }
}
