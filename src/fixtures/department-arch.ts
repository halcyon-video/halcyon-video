import * as THREE from 'three';
import type { FixtureContext, StoreFixture } from '../fixtures';
import type { FixturePlacement } from '../store-layout';
import { installDisplayModel } from './display-model';
import { finishEquipmentSurfaces } from './equipment-surfaces';
import { departmentArchFeet, DEPARTMENT_ARCH } from './department-arch-layout';

/** Broad painted portal with two separate supports. No printed art is baked in.
 * Medallion/lower-panel anchors are available to the existing sign-slot system. */
export class DepartmentArch implements StoreFixture {
  private root: THREE.Group | null = null;
  private own: Array<{ dispose(): void }> = [];
  private removeModel: (() => void) | null = null;
  private proxies: THREE.Mesh[] = [];
  constructor(public placement: FixturePlacement, private ctx: FixtureContext) {}
  build(): void {
    this.dispose();
    if (!this.placement.options?.assetViewer && !this.placement.options?.admitted) return;
    if (this.ctx.ceilingY < DEPARTMENT_ARCH.apex + .5) return;
    const root = this.root = new THREE.Group(); root.name = this.placement.id;
    root.position.set(this.placement.position.x, 0, this.placement.position.z); root.rotation.y = this.placement.yaw;
    const own = <T extends { dispose(): void }>(v: T): T => { this.own.push(v); return v; };
    const palette = this.ctx.activeTheme.palette;
    const paint = own(new THREE.MeshStandardMaterial({ color: palette.accent, roughness: .46 }));
    const post = own(new THREE.MeshStandardMaterial({ color: palette.primary, roughness: .52 }));
    const joint = own(new THREE.MeshStandardMaterial({ color: palette.primary, roughness: .58 }));
    post.color.multiplyScalar(.075);
    joint.color.multiplyScalar(.055);
    const fallback = new THREE.Group(); root.add(fallback);
    // Original low-cost solid rectangular-section fallback with an actual bevel.
    const shape = new THREE.Shape();
    for (let i = 0; i <= 48; i++) {
      const a = Math.PI - i * Math.PI / 48;
      const x = 2.5 * Math.cos(a), y = 7.5 + 2.75 * Math.sin(a);
      if (!i) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    for (let i = 48; i >= 0; i--) {
      const a = Math.PI - i * Math.PI / 48; shape.lineTo(2 * Math.cos(a), 7.5 + 2.25 * Math.sin(a));
    }
    shape.closePath();
    const arch = new THREE.Mesh(own(new THREE.ExtrudeGeometry(shape,
      { depth: .226, steps: 1, bevelEnabled: true, bevelSize: .012, bevelThickness: .012, bevelSegments: 2 })), paint);
    arch.position.z = -.113; arch.castShadow = arch.receiveShadow = true; fallback.add(arch);
    const box = (x: number, y: number, w: number, h: number, d: number, mat: THREE.Material, z = 0) => {
      const mesh = new THREE.Mesh(own(new THREE.BoxGeometry(w, h, d)), mat);
      mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; fallback.add(mesh); return mesh;
    };
    for (const x of [-2.25, 2.25]) {
      box(x, .04, .64, .08, .5, joint);
      box(x, 3.765, .30, 7.37, .25, post);
      box(x, 7.475, .54, .05, .31, joint);
      const proxy = new THREE.Mesh(own(new THREE.BoxGeometry(.64, 7.5, .5)), own(new THREE.MeshBasicMaterial({ visible: false })));
      proxy.position.set(x, 3.75, 0); root.add(proxy); this.proxies.push(proxy); this.ctx.addCollider(proxy);
    }
    for (const [name, y] of [['medallion', 6.25], ['lower-panel', 3.75]] as const) {
      box(-2.25, y, .18, .12, .09, joint, -.17);
      const anchor = new THREE.Object3D(); anchor.name = `department-arch-${name}-anchor`;
      anchor.position.set(-2.25, y, -.23); root.add(anchor);
    }
    this.own.push(...finishEquipmentSurfaces(fallback));
    this.ctx.scene.add(root);
    this.removeModel = installDisplayModel(this.ctx, root, fallback, 'models/department-arch.glb',
      { ArchPaint: paint, PostPaint: post, JointPaint: joint }, new THREE.Vector3(1, 1, 1), (model) => {
        const repeats = new Map<string, THREE.Mesh[]>();
        model.updateMatrixWorld(true);
        model.traverse(o => {
          if (!(o instanceof THREE.Mesh)) return;
          const uv = o.geometry.getAttribute('uv');
          if (uv) o.geometry.setAttribute('uv1', uv.clone());
          const role = o.userData.repeatRole;
          if (typeof role === 'string') repeats.set(role, [...(repeats.get(role) ?? []), o]);
        });
        for (const [role, parts] of repeats) {
          const batch = new THREE.InstancedMesh(parts[0].geometry, parts[0].material, parts.length);
          batch.name = `department-arch-${role}`;
          parts.forEach((part, i) => { batch.setMatrixAt(i, part.matrixWorld); part.removeFromParent(); });
          batch.instanceMatrix.needsUpdate = true; batch.computeBoundingSphere();
          batch.castShadow = batch.receiveShadow = true; model.add(batch);
        }
      });
    // Non-slotted fixtures are removed by scene teardown. Catch that boundary,
    // including a GLB still in flight, without requiring a new scene registry.
    root.addEventListener('removed', this.onRemoved);
    this.ctx.requestShadowRefresh(); this.ctx.requestRender();
  }
  private onRemoved = () => this.dispose();
  getFootprints() { return this.root ? departmentArchFeet(this.placement.position.x, this.placement.position.z, this.placement.yaw) : []; }
  update(): void {}
  dispose(): void {
    const root = this.root; this.root = null;
    root?.removeEventListener('removed', this.onRemoved);
    this.removeModel?.(); this.removeModel = null;
    this.proxies.forEach(p => { p.raycast = () => {}; }); this.proxies = [];
    root?.removeFromParent(); this.own.forEach(v => v.dispose()); this.own = [];
    if (root) { this.ctx.requestShadowRefresh(); this.ctx.requestRender(); }
  }
}
