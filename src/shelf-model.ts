// Blender-authored shelf sections, fitted to the existing layout/stock anchors.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { assetUrl } from './asset-url';

export interface ShelfPart {
  kind: 'deck' | 'rail' | 'wire' | 'slat';
  depth: number;
  length: number;
  x?: number;
  y?: number;
  z?: number;
  yaw?: number;
  height?: number;
  pitch?: number;
  panel?: boolean;
}
interface Replacement { fallback: THREE.Mesh; parts: ShelfPart[]; material: THREE.Material }

/** One load per store build, merged to one draw call per replacement material.
 * Original geometry remains as the hidden collision proxy and is released by
 * the existing scene teardown. The GLB templates are released after stamping.
 */
export class ShelfModelBatch {
  private replacements: Replacement[] = [];
  private ownedMaterials = new Set<THREE.Material>();
  own<T extends THREE.Material>(material: T): T {
    this.ownedMaterials.add(material);
    return material;
  }
  add(fallback: THREE.Mesh, parts: ShelfPart[], material?: THREE.Material): void {
    this.replacements.push({ fallback, parts, material: material ?? fallback.material as THREE.Material });
  }
  finish(wake: () => void): void {
    if (!this.replacements.length) {
      this.ownedMaterials.forEach(m => m.dispose());
      this.ownedMaterials.clear();
      return;
    }
    const unadopted = this.ownedMaterials;
    this.ownedMaterials = new Set();
    const entries = this.replacements;
    this.replacements = [];
    let disposed = false;
    const cancel = () => { disposed = true; };
    const originals = new Set(entries.map(e => e.fallback.geometry));
    originals.forEach(g => g.addEventListener('dispose', cancel));
    const unlisten = () => originals.forEach(g => g.removeEventListener('dispose', cancel));
    new GLTFLoader().load(assetUrl('models/shelf-components.glb'), ({ scene }) => {
      const kit = new Map<string, THREE.BufferGeometry>();
      const ownedMats = new Set<THREE.Material>();
      scene.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        kit.set(o.name, o.geometry);
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => ownedMats.add(m));
      });
      try {
        if (disposed || ['Deck', 'Rail', 'Wire', 'Bracket', 'Slat'].some(name => !kit.has(name))) return;
        for (const entry of entries) {
          const { fallback, material } = entry;
          if (!fallback.parent) continue;
          const pieces = entry.parts.flatMap(p => modelPart(kit, p));
          if (!pieces.length) continue;
          const geometry = mergeGeometries(pieces);
          pieces.forEach(g => g.dispose());
          if (!geometry) continue;
          const model = new THREE.Mesh(geometry, material);
          unadopted.delete(material); // scene teardown now owns this finish
          model.name = 'modeled-shelf-construction';
          model.position.copy(fallback.position);
          model.quaternion.copy(fallback.quaternion);
          model.scale.copy(fallback.scale);
          model.castShadow = model.receiveShadow = true;
          fallback.parent.add(model);
          fallback.visible = false;
          fallback.name = 'shelf-collision-proxy';
        }
        wake();
      } finally {
        unlisten();
        unadopted.forEach(m => m.dispose());
        kit.forEach(g => g.dispose());
        ownedMats.forEach(m => m.dispose());
      }
    }, undefined, () => {
      unlisten();
      unadopted.forEach(m => m.dispose());
    }); // Missing GLB keeps the built-in shelving.
  }
}

function modelPart(kit: Map<string, THREE.BufferGeometry>, p: ShelfPart): THREE.BufferGeometry[] {
  const result: THREE.BufferGeometry[] = [];
  const place = (name: string, sx: number, sy: number, sz: number,
    x = 0, y = 0, z = 0, yaw = 0) => {
    const source = kit.get(name);
    if (!source) throw new Error(`Shelf kit missing ${name}`);
    const g = source.index ? source.toNonIndexed() : source.clone();
    // Use geometry coordinates, not the separated editing positions of the
    // Blender objects. Preserve physical section thickness when extending runs.
    g.scale(sx, sy, sz);
    g.rotateY(yaw);
    g.translate(x, y, z);
    g.rotateX(p.pitch ?? 0);
    g.rotateY(p.yaw ?? 0);
    g.translate(p.x ?? 0, p.y ?? 0, p.z ?? 0);
    result.push(g);
  };
  if (p.kind === 'deck') {
    // Stretch the flat span only: the six-thousandth-foot eased edge stays
    // the same physical radius across shallow and deep shelves.
    const source = kit.get('Deck')!;
    const g = source.index ? source.toNonIndexed() : source.clone();
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setX(i, x + Math.sign(x) * (p.depth - 1) / 2);
      pos.setZ(i, pos.getZ(i) * p.length);
    }
    g.rotateX(p.pitch ?? 0);
    g.rotateY(p.yaw ?? 0);
    g.translate(p.x ?? 0, p.y ?? 0, p.z ?? 0);
    result.push(g);
  } else if (p.kind === 'rail') {
    place('Rail', 1, 1, p.length);
  } else if (p.kind === 'slat') {
    const height = p.height!;
    const count = Math.ceil(height / .25);
    for (let i = 0; i < count; i++) {
      const h = Math.min(.25, height - i * .25);
      place('Slat', p.depth / .5, h / .25, p.length, 0, -height / 2 + i * .25 + h / 2);
    }
  } else {
    // Real opaque round wires: no transparent grid planes or alpha sorting.
    // 2-inch longitudinal supports and 1-inch cross-wire pitch.
    const nx = Math.max(2, Math.ceil((p.depth - .04) * 6));
    const nz = Math.max(2, Math.ceil((p.length - .04) * 12));
    for (let i = 0; i <= nx; i++) {
      place('Wire', 1, 1, p.length - .04, -.5 * (p.depth - .04) + i * (p.depth - .04) / nx, -.004);
    }
    for (let i = 0; i <= nz; i++) {
      place('Wire', 1, 1, p.depth - .04, 0, .012, -.5 * (p.length - .04) + i * (p.length - .04) / nz, Math.PI / 2);
    }
    // Folded under-deck brackets at the bay ends and along long runs.
    const nb = Math.max(1, Math.ceil(p.length / 3.5));
    if (p.panel) return result;
    for (let i = 0; i <= nb; i++) {
      place('Bracket', p.depth - .04, 1, 1, 0, 0, -.5 * (p.length - .08) + i * (p.length - .08) / nb);
    }
  }
  return result;
}
