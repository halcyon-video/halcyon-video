import * as THREE from 'three';
import type { FixturePlacement } from '../store-layout';
import type { FixtureContext, StoreFixture } from '../fixtures';
import type { Footprint } from '../layout-validator';
import { installDisplayModel } from './display-model';

export const ROPE_POST_HEIGHT = 3.25;
export const ROPE_BASE_DIAMETER = 14 / 12;
/** Study ranges, not measured reference dimensions. */
export function ropeDimensions(options: FixturePlacement['options']) {
  const finite = (v: unknown, fallback: number, lo: number, hi: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
  return { span: finite(options?.span, 5, 5, 7), sag: finite(options?.sag, .2, .15, .25) };
}

/** Movable queue barrier. No stock slots or animation; the ends remain open. */
export class RopeStanchions implements StoreFixture {
  private group: THREE.Group | null = null;
  private owned: Array<{ dispose(): void }> = [];
  private removeModel: (() => void) | null = null;
  constructor(public placement: FixturePlacement, private ctx: FixtureContext) {}
  build(): void {
    this.dispose();
    const { span, sag } = ropeDimensions(this.placement.options);
    const group = this.group = new THREE.Group(); group.name = this.placement.id;
    group.position.set(this.placement.position.x, 0, this.placement.position.z);
    group.rotation.y = this.placement.yaw;
    const own = <T extends { dispose(): void }>(o: T): T => { this.owned.push(o); return o; };
    const brass = own(new THREE.MeshStandardMaterial({ color: '#be944f', metalness: .8, roughness: .28 }));
    brass.name = 'BrushedBrass';
    const fabric = own(new THREE.MeshStandardMaterial({ color: this.ctx.activeTheme.palette.primary, roughness: .93 }));
    fabric.name = 'RopeFabric';
    const fallback = new THREE.Group(); group.add(fallback);
    const instance = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], offsets: number[], name: string) => {
      const mesh = own(new THREE.InstancedMesh(geometry, material, offsets.length)); mesh.name = name;
      offsets.forEach((x, i) => mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0, 0)));
      mesh.instanceMatrix.needsUpdate = true; mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh);
      return mesh;
    };
    const profile = [[0,0],[.56,0],[ROPE_BASE_DIAMETER/2,.04],[.45,.08],[.13,.2],[.075,.23],[.075,3],[.12,3.06],[.125,3.14],[.09,3.23],[0,3.25]];
    instance(fallback, own(new THREE.LatheGeometry(profile.map(([r,y]) => new THREE.Vector2(r,y)), 32)), brass, [-span,0,span], 'FallbackPosts');
    const points = Array.from({ length: 49 }, (_, i) => {
      const t = i / 48;
      return new THREE.Vector3(-span/2+.17+(span-.34)*t, 2.965-4*span*sag*t*(1-t), 0);
    });
    instance(fallback, own(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, .042, 10, false)), fabric, [-span/2,span/2], 'FallbackRopes');
    // Plain low-profile runner uses the same feet/thickness convention as #222's
    // entrance mats. It is a floor surface, never a navigation obstacle.
    const runner = new THREE.Mesh(own(new THREE.BoxGeometry(10.2,.028,2.8)), fabric);
    runner.name = 'FallbackRunner'; runner.position.set(0,.014,2.1); runner.receiveShadow = true; fallback.add(runner);
    // Stable barrier proxy stays in the shared collider registry after loading.
    const proxy = new THREE.Mesh(own(new THREE.BoxGeometry(2*span+ROPE_BASE_DIAMETER, ROPE_POST_HEIGHT, ROPE_BASE_DIAMETER)),
      own(new THREE.MeshBasicMaterial({ visible: false })));
    proxy.name = 'QueueCollision'; proxy.position.y = ROPE_POST_HEIGHT/2; group.add(proxy); this.ctx.addCollider(proxy);
    this.ctx.scene.add(group);
    this.removeModel = installDisplayModel(this.ctx, group, fallback, 'models/rope-stanchions.glb',
      { BrushedBrass: brass, RopeFabric: fabric, RunnerPile: fabric }, new THREE.Vector3(1,1,1), model => {
        for (const name of ['Post', 'Rope']) {
          const module = model.getObjectByName(name);
          if (!module) continue;
          const meshes: THREE.Mesh[] = [];
          module.traverse(o => { if (o instanceof THREE.Mesh) meshes.push(o); });
          for (const source of meshes) {
            if (name === 'Rope') {
              const pos = source.geometry.getAttribute('position');
              const isFabric = source.material === fabric;
              for (let i=0; i<pos.count; i++) {
                const x = pos.getX(i), y = pos.getY(i);
                if (isFabric) {
                  // Axial UV stores the sweep parameter. Rebuild the centerline
                  // and rotate its cross-section; sag must not flatten the rope.
                  const t = (1-source.geometry.getAttribute('uv').getY(i))/4.8; // glTF flips Blender V
                  const oldSlope = 4*.91*(2*t-1), oldLength = Math.hypot(4.3,oldSlope);
                  const radial = (x-(-2.15+4.3*t))*(-oldSlope/oldLength)
                    +(y-(2.875-4*.91*t*(1-t)))*(4.3/oldLength);
                  const dx = span-.7, dy = 4*(span*sag-.09)*(2*t-1), length = Math.hypot(dx,dy);
                  pos.setXYZ(i,-span/2+.35+dx*t-radial*dy/length,
                    2.875-4*(span*sag-.09)*t*(1-t)+radial*dx/length,pos.getZ(i));
                } else {
                  pos.setX(i,x+Math.sign(x)*(span-5)/2);
                }
              }
              pos.needsUpdate = true; source.geometry.computeVertexNormals();
              source.geometry.computeBoundingBox(); source.geometry.computeBoundingSphere();
            }
            instance(model, source.geometry, source.material, name === 'Post' ? [-span,0,span] : [-span/2,span/2], `Instanced${name}`);
            source.removeFromParent();
          }
        }
      });
    this.ctx.requestShadowRefresh(); this.ctx.requestRender();
  }
  getFootprint(): Footprint | null {
    if (!this.group) return null;
    return { label: `fixture:${this.placement.id}`, kind: 'fixture', cx: this.placement.position.x,
      cz: this.placement.position.z, w: 2*ropeDimensions(this.placement.options).span+ROPE_BASE_DIAMETER,
      d: ROPE_BASE_DIAMETER, yaw: this.placement.yaw, clearance: 1.5 };
  }
  update(): void {}
  dispose(): void {
    this.removeModel?.(); this.removeModel = null;
    const built = !!this.group;
    this.group?.removeFromParent(); this.group = null;
    this.owned.forEach(o => o.dispose()); this.owned = [];
    if (built) { this.ctx.requestShadowRefresh(); this.ctx.requestRender(); }
  }
}
