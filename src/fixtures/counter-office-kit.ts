// Static staff equipment owned by Entrance, just like the checkout millwork.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../asset-url';
import { disposeDetachedModel } from '../model-resources';
import type { FixtureContext } from '../fixtures';

/** Batch shared tray/key/paper geometry while retaining named source parts in
 * Blender. The public GLB carries shared meshes, so no geometry is copied. */
export function instanceOfficeParts(model: THREE.Group): void {
  model.updateMatrixWorld(true);
  const batches = new Map<THREE.BufferGeometry, THREE.Mesh[]>();
  model.traverse(o => {
    if (o instanceof THREE.Mesh) batches.set(o.geometry, [...(batches.get(o.geometry) ?? []), o]);
  });
  for (const meshes of batches.values()) {
    if (meshes.length < 2 || meshes.some(m => m.material !== meshes[0].material)) continue;
    const batch = new THREE.InstancedMesh(meshes[0].geometry, meshes[0].material, meshes.length);
    batch.name = `${meshes[0].name}-instances`;
    const inverse = model.matrixWorld.clone().invert();
    meshes.forEach((m, i) => {
      batch.setMatrixAt(i, inverse.clone().multiply(m.matrixWorld));
      m.removeFromParent();
    });
    batch.instanceMatrix.needsUpdate = true;
    batch.computeBoundingSphere();
    model.add(batch);
  }
}

export function installCounterOfficeKit(
  ctx: FixtureContext, parent: THREE.Group,
  anchor: { x: number; y: number; z: number },
): void {
  // The reference is the later staff partition, not early-store dressing.
  if (ctx.activeTheme.id !== 'bb-2010') return;
  const root = new THREE.Group(); root.name = 'counter-office-kit';
  root.position.set(anchor.x, anchor.y, anchor.z);
  // Staff work from the entrance side, facing the partition toward the store.
  // Customer-facing trays/bulletin papers had reversed that reference view.
  root.rotation.y = Math.PI;
  parent.add(root);
  const fallback = new THREE.Group(); fallback.name = 'office-kit-fallback'; fallback.scale.x = -1; root.add(fallback);
  const plastic = new THREE.MeshStandardMaterial({ color: 0x26282a, roughness: .6 });
  const paper = new THREE.MeshStandardMaterial({ color: 0xe1dfd0, roughness: .9 });
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, mat = plastic) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); fallback.add(m);
  };
  for (let i = 0; i < 7; i++) {
    box(-1.28, .035 + i * .208333, 0, .833, .018, 1.083);
    box(-1.69, .10 + i * .208333, 0, .018, .13, 1.083);
    box(-.87, .10 + i * .208333, 0, .018, .13, 1.083);
    box(-1.28, .10 + i * .208333, .53, .833, .13, .018);
  }
  box(-.30, .09, -.12, .65, .18, .75);
  box(.90, .034, -.10, .708, .068, .916, paper);
  box(.2, 1.02, .60, 3.02, 2.04, .055, paper);
  box(1.73, 1.02, .12, .055, 2.04, 1.015, paper);
  let retired = false;
  const cleanup = () => {
    retired = true; parent.removeEventListener('removed', cleanup);
    root.traverse(o => { if (o instanceof THREE.InstancedMesh) o.dispose(); });
    disposeDetachedModel(root); root.removeFromParent();
  };
  parent.addEventListener('removed', cleanup);
  new GLTFLoader().load(assetUrl('models/counter-office-kit.glb'), ({ scene: model }) => {
    if (retired) { disposeDetachedModel(model); return; }
    instanceOfficeParts(model);
    model.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      o.castShadow = o.receiveShadow = true;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m.name === 'OfficeAccent' && m instanceof THREE.MeshStandardMaterial) {
          m.color.set(ctx.activeTheme.palette.primary);
        }
      }
    });
    model.name = 'office-kit-model'; root.add(model);
    disposeDetachedModel(fallback); fallback.removeFromParent();
    ctx.requestShadowRefresh(); ctx.requestRender();
  }, undefined, () => {
    if (!retired) ctx.log('Office kit model unavailable; using built-in office equipment.', 'system');
  });
}
