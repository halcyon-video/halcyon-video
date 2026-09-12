import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { assetUrl } from '../asset-url';

/** Shared #180/#199 attachment contract: feet, center origin, +Z front, -X spine.
 * Supply centered stock matrices; bottom is center.y - height / 2.
 * Artwork is borrowed (CanvasTexture convention); caller retains ownership.
 */
export const CLEANER_CARTON = { width: 0.365, height: 0.667, depth: 0.082 } as const;
export function installCleanerCartons(
  parent: THREE.Group, fallback: THREE.InstancedMesh,
  artwork: { front: THREE.Texture; back?: THREE.Texture; spine?: THREE.Texture },
  sideColor: THREE.Color, refresh: () => void,
): () => void {
  let retired = false;
  let stock: THREE.InstancedMesh | undefined;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const release = () => {
    stock?.removeFromParent();
    stock?.dispose();
    stock = undefined;
    geometries.forEach(g => g.dispose()); geometries.clear();
    materials.forEach(m => m.dispose()); materials.clear();
    textures.forEach(t => t.dispose()); textures.clear();
  };
  new GLTFLoader().load(assetUrl('models/cleaner-carton.glb'), ({ scene }) => {
    scene.updateMatrixWorld(true);
    const lanes = new Map<THREE.MeshStandardMaterial, THREE.BufferGeometry[]>();
    scene.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      geometries.add(o.geometry);
      const source = Array.isArray(o.material) ? o.material : [o.material];
      source.forEach(m => {
        materials.add(m);
        Object.values(m).forEach(v => { if (v instanceof THREE.Texture) textures.add(v); });
      });
      // Blender exports one primitive per named material role.
      const mat = source[0] as THREE.MeshStandardMaterial;
      const geometry = o.geometry.clone().applyMatrix4(o.matrixWorld);
      geometries.add(geometry);
      const art = mat.name === 'CartonFront' ? artwork.front
        : mat.name === 'CartonBack' ? artwork.back
        : mat.name === 'CartonSpine' ? artwork.spine : undefined;
      if (art) {
        const uv = geometry.getAttribute('uv');
        for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
      }
      const list = lanes.get(mat) ?? []; list.push(geometry); lanes.set(mat, list);
    });
    if (retired || !parent.parent) { release(); return; }
    const parts: THREE.BufferGeometry[] = [];
    const finishes: THREE.MeshStandardMaterial[] = [];
    for (const [mat, lane] of lanes) {
      const art = mat.name === 'CartonFront' ? artwork.front
        : mat.name === 'CartonBack' ? artwork.back
        : mat.name === 'CartonSpine' ? artwork.spine : undefined;
      if (art) { mat.map = art; mat.color.set(0xffffff); }
      else {
        // Dark house-color ink with a paper reflectance floor, preserving hue.
        mat.color.copy(sideColor).multiplyScalar(.65).lerp(new THREE.Color(1, 1, 1), .08);
      }
      mat.needsUpdate = true;
      const part = mergeGeometries(lane);
      if (!part) { release(); return; }
      geometries.add(part); parts.push(part); finishes.push(mat);
    }
    const merged = mergeGeometries(parts, true);
    if (!merged) { release(); return; }
    // Retain only the final shared mesh; source pieces are no longer needed.
    geometries.forEach(g => g.dispose()); geometries.clear(); geometries.add(merged);
    stock = new THREE.InstancedMesh(merged, finishes, fallback.count);
    stock.name = 'cleaner-carton-stock';
    stock.instanceMatrix.copy(fallback.instanceMatrix);
    stock.castShadow = stock.receiveShadow = true;
    parent.add(stock);
    fallback.visible = false;
    refresh();
  }, undefined, () => { /* Existing boxes remain on missing or failed GLB load. */ });
  return () => { retired = true; release(); };
}
