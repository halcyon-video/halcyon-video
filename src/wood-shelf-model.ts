// Timber shelf boards: authored FinishedPanel profiles fitted to the existing
// wall-run anchors, and physical grain UVs shared with the aisle shelf kit.
// Corporate laminate and printed-art UVs never come through here.
import * as THREE from 'three';
import { joineryGeometry, stretchJoinery } from './joinery-model.ts';

/** Veneer tile (format-surfaces createWoodShelfTextures) repeats 6x2 across
 * material UV space; one tile stands for 2.5 ft along the grain by 1.5 ft across. */
export const WOOD_TILE_GRAIN_FT = 2.5;
export const WOOD_TILE_ACROSS_FT = 1.5;
const WOOD_REPEAT_U = 6, WOOD_REPEAT_V = 2;
/** Marks the shared shelf finish so batched kit parts know to lay grain. */
export const WOOD_GRAIN_FLAG = 'woodGrain';

export function isWoodGrainMaterial(material: THREE.Material | THREE.Material[]): boolean {
  return (Array.isArray(material) ? material : [material]).every(m => m?.userData?.[WOOD_GRAIN_FLAG] === true);
}

/**
 * Replace UVs with physical board-aligned ones. The long argument selects the board axis
 * ('auto' takes the longest extent): texture U (the grain) follows it on every
 * face, V runs across the face, and handedness is kept so albedo, normal and
 * roughness maps all read unmirrored from outside. Expects flat-shaded face
 * normals (the authored parts export one vertex per hard edge).
 */
export function applyWoodGrainUV(g: THREE.BufferGeometry, long: 'x' | 'y' | 'z' | 'auto' = 'auto', startVertex = 0, vertexCount?: number): void {
  const pos = g.getAttribute('position'), normal = g.getAttribute('normal');
  let axis = long === 'auto' ? -1 : 'xyz'.indexOf(long);
  if (axis < 0) {
    g.computeBoundingBox();
    const s = g.boundingBox!.getSize(new THREE.Vector3());
    axis = s.x >= s.y && s.x >= s.z ? 0 : s.y >= s.z ? 1 : 2;
  }
  let uv = g.getAttribute('uv') as THREE.BufferAttribute | undefined;
  if (!uv || uv.count !== pos.count) { uv = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2); g.setAttribute('uv', uv); }
  const count = vertexCount ?? (pos.count - startVertex);
  const n = [0, 0, 0], p = [0, 0, 0];
  for (let i = startVertex; i < startVertex + count; i++) {
    n[0] = normal.getX(i); n[1] = normal.getY(i); n[2] = normal.getZ(i);
    p[0] = pos.getX(i); p[1] = pos.getY(i); p[2] = pos.getZ(i);
    const dom = Math.abs(n[0]) >= Math.abs(n[1]) && Math.abs(n[0]) >= Math.abs(n[2]) ? 0 : Math.abs(n[1]) >= Math.abs(n[2]) ? 1 : 2;
    const inPlane = [0, 1, 2].filter(a => a !== dom);
    const iu = inPlane.includes(axis) ? axis : inPlane[0];
    const iv = inPlane.find(a => a !== iu)!;
    // e_u x e_v points along +dom exactly when (iu, iv, dom) is a cyclic permutation.
    const cyclic = (iv - iu + 3) % 3 === 1 && (dom - iv + 3) % 3 === 1;
    const flip = (cyclic ? 1 : -1) * (n[dom] < 0 ? -1 : 1) < 0 ? -1 : 1;
    uv.setXY(i, flip * p[iu] / (WOOD_TILE_GRAIN_FT * WOOD_REPEAT_U), p[iv] / (WOOD_TILE_ACROSS_FT * WOOD_REPEAT_V));
  }
  uv.needsUpdate = true;
}

/**
 * Update UVs only for groups whose material is flagged with WOOD_GRAIN_FLAG.
 * Used for end-cap geometries where front printed art keeps normalized UVs while
 * side/back wood faces receive vertical physical grain.
 */
export function applyWoodGrainToFlaggedGroups(g: THREE.BufferGeometry, materials: THREE.Material | THREE.Material[], long: 'x' | 'y' | 'z' | 'auto' = 'y'): void {
  if (!Array.isArray(materials)) {
    if (isWoodGrainMaterial(materials)) applyWoodGrainUV(g, long);
    return;
  }
  if (!materials.some(m => m?.userData?.[WOOD_GRAIN_FLAG] === true)) return;
  // Groups count draw indices, not vertices. Split shared vertices first so
  // a wood side cannot change the printed face's UV at their common edge.
  if (g.index) { const flat = g.toNonIndexed(); g.copy(flat); flat.dispose(); }
  for (const group of g.groups) {
    if (materials[group.materialIndex ?? 0]?.userData?.[WOOD_GRAIN_FLAG] === true)
      applyWoodGrainUV(g, long, group.start, group.count);
  }
}

/** A shelf board whose run is local X: depth along Z, sloped like the NR support plane.
 * The input is the already-sloped built-in board; it is upgraded in place with the same slope. */
export function woodWallDeck(g: THREE.BoxGeometry, length: number, thickness: number, depth: number,
  slope: number, yOffset: number): THREE.BoxGeometry {
  return joineryGeometry(g, 'FinishedPanel', f => {
    stretchJoinery(f, 'x', 1, length, .006); stretchJoinery(f, 'y', 1, thickness, .006); stretchJoinery(f, 'z', 1, depth, .006);
    const p = f.getAttribute('position');
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + yOffset + slope * (p.getZ(i) - depth / 2));
    f.computeVertexNormals(); applyWoodGrainUV(f, 'x');
  });
}

/** Floor-to-top end panel or divider: vertical grain, front face tapered by depthAt. */
export function woodWallUpright(g: THREE.BoxGeometry, thickness: number, height: number, depth: number,
  depthAt: (heightAboveFloor: number) => number): THREE.BoxGeometry {
  return joineryGeometry(g, 'FinishedPanel', f => {
    stretchJoinery(f, 'x', 1, thickness, .006); stretchJoinery(f, 'y', 1, height, .006); stretchJoinery(f, 'z', 1, depth, .006);
    const p = f.getAttribute('position');
    for (let i = 0; i < p.count; i++) if (p.getZ(i) > 0) p.setZ(i, depthAt(p.getY(i) + height / 2) - depth / 2);
    f.computeVertexNormals(); applyWoodGrainUV(f, 'y');
  });
}

/** Run-wide backing board. Preserves per-bay shade on normalized UV1 while
 * laying physical vertical grain on UV0. Extra attributes survive joineryGeometry.copy. */
export function woodWallBacking(w: number, h: number, d: number): THREE.BoxGeometry {
  const target = new THREE.BoxGeometry(w, h, d);
  const p = target.getAttribute('position');
  const uv1 = new THREE.BufferAttribute(new Float32Array(p.count * 2), 2);
  for (let i = 0; i < p.count; i++) uv1.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  target.setAttribute('uv1', uv1);
  applyWoodGrainUV(target, 'y');

  return joineryGeometry(target, 'FinishedPanel', f => {
    stretchJoinery(f, 'x', 1, w, .006);
    stretchJoinery(f, 'y', 1, h, .006);
    stretchJoinery(f, 'z', 1, d, .006);
    const fp = f.getAttribute('position');
    const fuv1 = new THREE.BufferAttribute(new Float32Array(fp.count * 2), 2);
    for (let i = 0; i < fp.count; i++) fuv1.setXY(i, fp.getX(i) / w + 0.5, fp.getY(i) / h + 0.5);
    f.setAttribute('uv1', fuv1);
    f.computeVertexNormals();
    applyWoodGrainUV(f, 'y');
  });
}

/** Recessed toe board below the lowest deck: a solid finished strip, no hardware. */
export function woodToeBoard(length: number, height: number, thickness: number): THREE.BoxGeometry {
  return joineryGeometry(new THREE.BoxGeometry(length, height, thickness), 'FinishedPanel', f => {
    stretchJoinery(f, 'x', 1, length, .006); stretchJoinery(f, 'y', 1, height, .006); stretchJoinery(f, 'z', 1, thickness, .006);
    f.computeVertexNormals(); applyWoodGrainUV(f, 'x');
  });
}
