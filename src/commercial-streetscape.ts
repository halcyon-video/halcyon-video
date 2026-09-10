// Original shallow commercial context, loaded only by the resolved high tier.
// Four opaque scenery-card batches: no textures, real lights or shadow passes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { selfLit } from './material-lighting';
import { assetUrl } from './asset-url';
import type { OutsideMode } from './outdoor-lighting';

export function installCommercialStreetscape(parent: THREE.Group, centerX: number, backWallZ: number, requestRender: () => void) {
  let disposed = false;
  let mode: OutsideMode = 'day';
  let model: THREE.Group | null = null;
  const materials = new Map<string, THREE.MeshBasicMaterial>();
  function setOutsideMode(next: OutsideMode) {
    mode = next;
    for (const [role, mat] of materials) {
      // Preserve legible lit windows without adding lights or bloom sources.
      mat.color.set(mode === 'night' ? (role === 'Windows' ? '#ffda9c' : '#252e40')
        : mode === 'sunset' ? (role === 'Windows' ? '#ffdda9' : '#ba9e8b') : '#ffffff');
      if (role === 'Windows') mat.color.multiplyScalar(mode === 'night' ? 2.8 : mode === 'sunset' ? 1.8 : 1);
    }
  }
  function release(root: THREE.Group) {
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    root.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      geos.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m);
    });
    geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose());
    root.removeFromParent();
  }
  new GLTFLoader().load(assetUrl('models/commercial-streetscape.glb'), ({ scene: loaded }) => {
    if (disposed) { release(loaded); return; }
    const originals = new Set<THREE.Material>();
    loaded.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const source = Array.isArray(o.material) ? o.material[0] : o.material;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) originals.add(m);
      const role = source.name;
      if (role === 'Rear') o.position.z = backWallZ - 24;
      if (role === 'Ground') {
        // Keep the road-facing edge at 255 while reaching beyond any store depth.
        const rearEdge = backWallZ - 80;
        o.scale.z = (255 - rearEdge) / 325;
        o.position.z = 255 * (1 - o.scale.z);
      }
      let material = materials.get(role);
      if (!material) {
        material = selfLit(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }), 'baked-backdrop');
        material.name = `streetscape-${role}`;
        materials.set(role, material);
      }
      o.material = material;
      o.castShadow = o.receiveShadow = false;
    });
    originals.forEach(m => m.dispose());
    loaded.name = 'commercial-streetscape';
    loaded.position.x = centerX;
    model = loaded;
    parent.add(model);
    setOutsideMode(mode);
    requestRender();
  }, undefined, error => {
    if (!disposed) console.warn('Commercial streetscape unavailable; retaining the existing lot.', error);
  });
  return {
    setOutsideMode,
    dispose() {
      disposed = true;
      if (model) release(model);
      model = null;
      materials.clear();
    },
  };
}

// Sky only: no photographed buildings/ground competing with modeled distances.
// The tiny generated texture replaces the large pano on high, and is cached by
// OutdoorLighting with its other owned sky textures.
export function createCommercialSky(mode: OutsideMode): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 128);
  const colors = mode === 'night' ? ['#071020', '#222d42', '#10151d']
    : mode === 'sunset' ? ['#374e77', '#efb68b', '#514b49'] : ['#4e83b3', '#cad8df', '#797d7d'];
  gradient.addColorStop(0, colors[0]); gradient.addColorStop(.5, colors[1]); gradient.addColorStop(1, colors[2]);
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 8, 128);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
