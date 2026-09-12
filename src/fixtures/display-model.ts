import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../asset-url';
import type { FixtureContext } from '../fixtures';

/** One fixture owns this load and its geometry; supplied finishes belong to its fallback. */
export function installDisplayModel(
  ctx: Pick<FixtureContext, 'scene' | 'requestShadowRefresh' | 'requestRender' | 'log'>,
  parent: THREE.Group,
  fallback: THREE.Group,
  file: string,
  finishes: Record<string, THREE.Material>,
  scale = new THREE.Vector3(1, 1, 1),
  prepare?: (model: THREE.Group) => void,
): () => void {
  fallback.name = 'display-fallback';
  let cancelled = false;
  let installed: THREE.Group | null = null;
  const ownedMaterials = new Set<THREE.Material>();
  const ownedTextures = new Set<THREE.Texture>();
  const release = (model: THREE.Group) => {
    const geometries = new Set<THREE.BufferGeometry>();
    model.traverse((o) => { if (o instanceof THREE.Mesh) geometries.add(o.geometry); });
    geometries.forEach((g) => g.dispose());
    ownedMaterials.forEach((m) => m.dispose());
    ownedMaterials.clear();
    ownedTextures.forEach((t) => t.dispose());
    ownedTextures.clear();
    model.removeFromParent();
  };
  new GLTFLoader().load(assetUrl(file), ({ scene: model }) => {
    let root: THREE.Object3D = parent;
    while (root.parent) root = root.parent;
    const detached = cancelled || root !== ctx.scene;
    const replaced = new Set<THREE.Material>();
    model.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const replace = (m: THREE.Material) => {
        // Imported maps belong to this load, including maps on replaced roles.
        // Collect before substituting fixture-owned finishes; never dispose those.
        Object.values(m).forEach((value) => {
          if (value instanceof THREE.Texture) ownedTextures.add(value);
        });
        if (detached) { ownedMaterials.add(m); return m; }
        if (finishes[m.name]) { replaced.add(m); return finishes[m.name]; }
        ownedMaterials.add(m); return m;
      };
      o.material = Array.isArray(o.material) ? o.material.map(replace) : replace(o.material);
      o.castShadow = o.receiveShadow = true;
    });
    replaced.forEach((m) => m.dispose());
    if (detached) { release(model); return; }
    prepare?.(model);
    model.name = 'display-model';
    model.scale.copy(scale);
    parent.add(model);
    installed = model;
    fallback.visible = false; // Registered collision meshes keep their established shape.
    ctx.requestShadowRefresh();
    ctx.requestRender();
  }, undefined, (error) => {
    if (!cancelled) ctx.log(`Display model unavailable; using built-in fixture. ${String(error)}`, 'system');
  });
  return () => {
    cancelled = true;
    if (installed) { release(installed); installed = null; }
  };
}
