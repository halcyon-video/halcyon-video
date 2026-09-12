import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../asset-url';
import { createWalkOffMatTexture } from '../canvas-textures';
import { disposeDetachedModel } from '../model-resources';
import type { FixtureContext } from '../fixtures';

/** Existing feet-based footprints; mats remain decorative, with no colliders. */
export function buildWalkOffMats(
  ctx: Pick<FixtureContext, 'scene' | 'requestRender' | 'requestShadowRefresh' | 'log'>,
  parent: THREE.Group, width: number, depth: number, xs: number[], z: number,
): () => void {
  const group = new THREE.Group();
  group.name = 'entranceWalkOffMats';
  group.userData.dimensions = [width, .024, depth];
  parent.add(group);
  const fallback = new THREE.Group();
  fallback.name = 'walk-off-mat-fallback';
  group.add(fallback);
  const { map, normalMap } = createWalkOffMatTexture();
  map.repeat.set(width / 1.5, depth / 1.5);
  normalMap.repeat.copy(map.repeat);
  const material = new THREE.MeshStandardMaterial({
    map, normalMap, normalScale: new THREE.Vector2(.5, .5), roughness: .95, metalness: 0,
  });
  const geometry = new THREE.BoxGeometry(width, .025, depth);
  xs.forEach(x => {
    const mat = new THREE.Mesh(geometry, material);
    mat.position.set(x, .0125, z);
    mat.receiveShadow = true;
    fallback.add(mat);
  });
  let disposed = false;
  let installed: THREE.Group | null = null;
  new GLTFLoader().load(assetUrl('models/entrance-mat.glb'), ({ scene: model }) => {
    let root: THREE.Object3D = group;
    while (root.parent) root = root.parent;
    if (disposed || root !== ctx.scene) { disposeDetachedModel(model); return; }
    const textures = new Set<THREE.Texture>();
    model.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      o.receiveShadow = true;
      // A low-profile floor covering does not need a separate shadow draw.
      o.castShadow = false;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    textures.forEach(t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(width / 1.5, depth / 1.5);
      t.needsUpdate = true;
    });
    const parts = [...model.children];
    model.clear();
    xs.forEach((x, i) => {
      const mat = new THREE.Group();
      mat.name = `WalkOffMat_${i}`;
      mat.position.set(x, 0, z);
      mat.scale.set(width, 1, depth);
      parts.forEach(part => mat.add(part.clone(true)));
      model.add(mat);
    });
    model.name = 'walk-off-mat-model';
    group.add(model);
    installed = model;
    fallback.visible = false;
    ctx.requestShadowRefresh();
    ctx.requestRender();
  }, undefined, error => {
    if (!disposed) ctx.log(`Walk-off mat unavailable; using built-in surface. ${String(error)}`, 'system');
  });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (installed) { disposeDetachedModel(installed); installed = null; }
    disposeDetachedModel(fallback);
    parent.removeEventListener('removed', dispose);
    group.removeFromParent();
  };
  parent.addEventListener('removed', dispose);
  return dispose;
}
