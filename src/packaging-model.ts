// Shared, lazy GLB geometry. Art stays in the six existing case material lanes.
// Compact shelf meshes are opaque and instanced; detailed geometry is bounded
// to inspected meshes. A disposed target is never resurrected by a late load.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { assetUrl } from './asset-url';
import type { CaseDimensions, CaseModelFamily } from './packaging-formats';

type Spec = { family: CaseModelFamily; dims: CaseDimensions; detail: boolean; offsetX: number };
const roles: Record<string, number> = { Opening: 0, PaperSpine: 1, Top: 2, Shell: 3, WhiteShell: 3, PaperFront: 4, PaperBack: 5, ClearRim: 6, Tray: 7, PaperEdge: 8 };
const loads = new Map<string, Promise<THREE.BufferGeometry | null>>();
const geometries = new Map<string, THREE.BufferGeometry>();
const listeners = new Set<() => void>();
let generation = 0;
export function onCaseModelsChanged(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }
export async function caseModelsReady(): Promise<void> { await Promise.all(loads.values()); }

function source(family: CaseModelFamily, detail: boolean): Promise<THREE.BufferGeometry | null> {
  const name = `packaging-${family}-${detail ? 'hero' : 'stock'}`;
  let pending = loads.get(name);
  if (pending) return pending;
  const epoch = generation;
  pending = new GLTFLoader().loadAsync(assetUrl(`models/${name}.glb`)).then(({ scene }) => {
    const chunks: THREE.BufferGeometry[] = [];
    const indices: number[] = [];
    const materials = new Set<THREE.Material>();
    const temporary = new Set<THREE.BufferGeometry>();
    let retained: THREE.BufferGeometry | null = null;
    try {
    scene.updateMatrixWorld(true);
    scene.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      temporary.add(geo);
      geo.applyMatrix4(o.matrixWorld);
      // Blender glTF stores top-left UVs; existing CanvasTexture art uses
      // Three's bottom-left Plane/Box convention (flipY=true).
      const uv = geo.getAttribute('uv');
      if (!uv) throw new Error(`${name} missing uv`);
      for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
      const list = Array.isArray(o.material) ? o.material : [o.material];
      // GLTFLoader splits primitives by material; retain explicit groups too.
      for (const group of geo.groups.length ? geo.groups : [{ start: 0, count: geo.getAttribute('position').count, materialIndex: 0 }]) {
        const m = list[group.materialIndex ?? 0];
        if (!m || roles[m.name] === undefined) throw new Error(`${name} unknown material role ${m?.name}`);
        materials.add(m);
        const part = new THREE.BufferGeometry(); temporary.add(part);
        for (const key of ['position', 'normal', 'uv']) {
          const attr = geo.getAttribute(key) as THREE.BufferAttribute;
          if (!attr) throw new Error(`${name} missing ${key}`);
          part.setAttribute(key, new THREE.BufferAttribute(attr.array.slice(group.start * attr.itemSize, (group.start + group.count) * attr.itemSize), attr.itemSize));
        }
        chunks.push(part);
        const role = roles[m.name];
        if (role === undefined) throw new Error(`${name} unknown role ${m.name}`);
        indices.push(detail || role === 6 ? role : role >= 7 ? 3 : role);
      }
    });
    const merged = mergeGeometries(chunks, true);
    if (!merged) throw new Error(`${name} has no compatible geometry`);
    temporary.add(merged);
    merged.groups.forEach((g, i) => { g.materialIndex = indices[i]; });
    // Collapse identical material runs into one draw range. No mesh per lug.
    const ordered: THREE.BufferGeometry[] = [];
    const orderedRoles: number[] = [];
    for (const role of [...new Set(indices)].sort((a, b) => a - b)) {
      const selected = merged.groups.filter(g => g.materialIndex === role);
      const chunk = new THREE.BufferGeometry(); temporary.add(chunk);
      for (const key of ['position', 'normal', 'uv']) {
        const attr = merged.getAttribute(key) as THREE.BufferAttribute;
        const values = new Float32Array(selected.reduce((n, g) => n + g.count * attr.itemSize, 0));
        let at = 0;
        for (const g of selected) { const data = attr.array.slice(g.start * attr.itemSize, (g.start + g.count) * attr.itemSize); values.set(data, at); at += data.length; }
        chunk.setAttribute(key, new THREE.BufferAttribute(values, attr.itemSize));
      }
      ordered.push(chunk); orderedRoles.push(role);
    }
    const result = mergeGeometries(ordered, true);
    if (!result) throw new Error(`${name} has no material ranges`);
    temporary.add(result);
    result.groups.forEach((g, i) => { g.materialIndex = orderedRoles[i]; });
    result.computeBoundingBox();
    const size = result.boundingBox!.getSize(new THREE.Vector3());
    if (![size.x,size.y,size.z].every(n => Number.isFinite(n) && n > 0)) throw new Error(`${name} invalid bounds`);
    result.scale(1 / size.x, 1 / size.y, 1 / size.z);
    if (epoch !== generation) return null;
    retained = result;
    return result;
    } finally {
      temporary.forEach(g => { if (g !== retained) g.dispose(); });
      scene.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
      });
      materials.forEach(m => {
        for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
        m.dispose();
      });
    }
  }).catch(error => {
    console.warn(`[cases] ${name} unavailable; retaining built-in geometry`, error);
    return null;
  });
  loads.set(name, pending);
  return pending;
}

function hydrate(target: THREE.BufferGeometry, spec: Spec): void {
  let alive = true;
  const epoch = generation;
  const cancel = () => { alive = false; target.removeEventListener('dispose', cancel); };
  target.addEventListener('dispose', cancel);
  void source(spec.family, spec.detail).then(template => {
    target.removeEventListener('dispose', cancel);
    if (!alive || !template || epoch !== generation) return;
    const next = template.clone();
    next.scale(spec.dims.w, spec.dims.h, spec.dims.d); next.translate(spec.offsetX, 0, 0);
    // Keep aTextureIndex/aSpineColor/aPosterCropSkip instanced attributes.
    // Dispose releases old GPU buffers, then replace only vertex attributes.
    target.userData.caseModelHydrating = true;
    target.dispose();
    target.userData.caseModelHydrating = false;
    for (const key of ['position', 'normal', 'uv']) target.setAttribute(key, next.getAttribute(key));
    target.setIndex(null); target.clearGroups();
    next.groups.forEach(g => target.addGroup(g.start, g.count, g.materialIndex));
    target.computeBoundingBox(); target.computeBoundingSphere();
    target.userData.caseModelLoaded = true;
    next.dispose();
    listeners.forEach(fn => fn());
  });
}

export function modelCaseGeometry(fallback: THREE.BufferGeometry, family: CaseModelFamily | undefined, dims: CaseDimensions, detail = false, offsetX = 0): THREE.BufferGeometry {
  if (!family) return fallback;
  const key = `${family}:${dims.w}:${dims.h}:${dims.d}:${detail}:${offsetX}`;
  let geo = geometries.get(key);
  if (!geo) {
    geo = fallback.clone();
    const spec: Spec = { family, dims, detail, offsetX };
    // BufferGeometry.clone shares userData in Three r184. Metadata must be
    // target-owned: a hero must never relabel the stock template or a sibling.
    geo.userData = { ...fallback.userData, caseModelSpec: spec, caseModelLoaded: false, caseModelHydrating: false };
    const owned = geo;
    owned.addEventListener('dispose', () => {
      if (!owned.userData.caseModelHydrating && geometries.get(key) === owned) geometries.delete(key);
    });
    geometries.set(key, geo); hydrate(geo, spec);
  }
  return geo;
}
export function cloneCaseGeometry(base: THREE.BufferGeometry): THREE.BufferGeometry {
  const clone = base.clone();
  clone.userData = { ...base.userData };
  if (base.userData.caseModelSpec && !base.userData.caseModelLoaded) hydrate(clone, base.userData.caseModelSpec);
  return clone;
}
export function detailedCaseGeometry(base: THREE.BufferGeometry): THREE.BufferGeometry {
  const s = base.userData.caseModelSpec as Spec | undefined;
  return s ? modelCaseGeometry(base, s.family, s.dims, true, s.offsetX) : base;
}
let finishes: THREE.Material[] | null = null;
export function caseConstructionMaterials(): THREE.Material[] {
  return finishes ??= [
    new THREE.MeshPhysicalMaterial({ name: 'ClearRim', color: 0xabb8c1, roughness: .18, clearcoat: .85, clearcoatRoughness: .12, envMapIntensity: .65 }),
    new THREE.MeshStandardMaterial({ name: 'Tray', color: 0x15191c, roughness: .48 }),
    new THREE.MeshStandardMaterial({ name: 'PaperEdge', color: 0xc8c4b9, roughness: .86 }),
  ];
}
export function withCaseConstructionMaterials(mats: THREE.Material[]): THREE.Material[] {
  return mats.length >= 9 ? mats : [...mats, ...caseConstructionMaterials()];
}
export function isCaseConstructionMaterial(m: THREE.Material): boolean { return !!finishes?.includes(m); }
export function clearCaseModels(): void {
  generation++;
  geometries.forEach(g => g.dispose()); geometries.clear();
  loads.forEach(p => { void p.then(g => g?.dispose()); }); loads.clear();
  finishes?.forEach(m => m.dispose()); finishes = null;
}
