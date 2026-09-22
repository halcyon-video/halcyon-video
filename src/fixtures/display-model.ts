import { compactAssets } from '../mobile-assets';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../asset-url';
import { prepareRetailModel } from './retail-model';
import type { FixtureContext } from '../fixtures';

/** One fixture owns this load and its geometry; supplied finishes belong to its fallback. */
export function installDisplayModel(
  ctx: Pick<FixtureContext, 'scene' | 'requestShadowRefresh' | 'requestRender' | 'log' | 'scheduleDetailLoad'> & Partial<Pick<FixtureContext, 'camera'>>,
  parent: THREE.Group,
  fallback: THREE.Group,
  file: string | readonly string[],
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
    model.traverse((o) => { if (o instanceof THREE.BatchedMesh) o.dispose();
      else if (o instanceof THREE.Mesh) geometries.add(o.geometry); });
    geometries.forEach((g) => g.dispose());
    ownedMaterials.forEach((m) => m.dispose());
    ownedMaterials.clear();
    ownedTextures.forEach((t) => t.dispose());
    ownedTextures.clear();
    model.removeFromParent();
  };
  const install = (model: THREE.Group) => {
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
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      // Blended glass must not cast an opaque silhouette into the shadow map.
      // Alpha-tested cutouts still cast their shaped shadows.
      o.castShadow = materials.some(m => !m.transparent || m.alphaTest > 0);
      o.receiveShadow = materials.some(m => !m.transparent);
    });
    replaced.forEach((m) => m.dispose());
    if (detached) { release(model); return; }
    // Custom preparers own named parts (screens, decals, instancing). Plain
    // static imports can share the same opaque-material batching as retail kits.
    if (prepare) prepare(model);
    else prepareRetailModel(model);
    model.name = 'display-model';
    model.scale.copy(scale);
    parent.add(model);
    installed = model;
    fallback.visible = false; // Registered collision meshes keep their established shape.
    ctx.requestShadowRefresh();
    ctx.requestRender();
  };
  const load = () => new Promise<void>(complete => {
    if (cancelled) { complete(); return; }
    const paths = typeof file === 'string' ? [file] : file;
    const attempt = (index: number): void => {
      if (cancelled) { complete(); return; }
      new GLTFLoader().load(assetUrl(paths[index]), result => {
      try { install(result.scene); } finally { complete(); }
    }, undefined, error => {
      if (!cancelled && index + 1 < paths.length) { attempt(index + 1); return; }
      if (!cancelled) ctx.log(`Display model unavailable; using built-in fixture. ${String(error)}`, 'system');
      complete();
      });
    };
    attempt(0);
  });
  let cancelQueued: (() => void) | undefined;
  let nearbyTimer: ReturnType<typeof setTimeout> | undefined;
  const bounds = new THREE.Sphere();
  const box = new THREE.Box3();
  const schedule = () => {
    if (cancelled) return;
    // On phones, keep the textured built-in fixture until its detail can be
    // seen at useful scale. Recheck as the visitor walks; never fetch the whole
    // exterior and distant fixture collection simply because entry completed.
    if (compactAssets() && ctx.camera) {
      parent.updateWorldMatrix(true, true);
      box.setFromObject(fallback).getBoundingSphere(bounds);
      if (bounds.radius >= 0 && ctx.camera.position.distanceTo(bounds.center) > 22 + bounds.radius) {
        nearbyTimer = setTimeout(schedule, 750); return;
      }
    }
    cancelQueued = ctx.scheduleDetailLoad?.(load);
    if (!ctx.scheduleDetailLoad) void load();
  };
  // The caller adds the group to its world parent after this installer returns.
  if (compactAssets() && ctx.camera) nearbyTimer = setTimeout(schedule, 0);
  else schedule();
  return () => {
    cancelled = true;
    clearTimeout(nearbyTimer);
    cancelQueued?.();
    if (installed) { release(installed); installed = null; }
  };
}
