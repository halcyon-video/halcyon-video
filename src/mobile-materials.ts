import * as THREE from 'three';

const cache = new WeakMap<THREE.Material, THREE.Material>();
const simplifiedForMode = new WeakMap<THREE.Object3D, string>();

/** Collapse phone-low PBR variants into a small texture-preserving shader set. */
export function simplifyMobileSceneMaterials(root: THREE.Object3D, mode = ''): void {
  if (simplifiedForMode.get(root) === mode) return;
  simplifiedForMode.set(root, mode);
  const simplify = (material: THREE.Material): THREE.Material => {
    if (!(material instanceof THREE.MeshStandardMaterial)) return material;
    const cached = cache.get(material);
    if (cached) return cached;
    const color = material.color.clone().multiplyScalar(0.68);
    const basic = new THREE.MeshBasicMaterial({
      name: `${material.name || 'material'}-mobile`,
      color,
      map: material.map ?? material.emissiveMap,
      alphaMap: material.alphaMap,
      alphaTest: material.alphaTest,
      transparent: material.transparent,
      opacity: material.opacity,
      side: material.side,
      depthTest: material.depthTest,
      depthWrite: material.depthWrite,
      vertexColors: material.vertexColors,
      fog: material.fog,
    });
    basic.blending = material.blending;
    basic.blendSrc = material.blendSrc;
    basic.blendDst = material.blendDst;
    basic.blendEquation = material.blendEquation;
    basic.polygonOffset = material.polygonOffset;
    basic.polygonOffsetFactor = material.polygonOffsetFactor;
    basic.polygonOffsetUnits = material.polygonOffsetUnits;
    cache.set(material, basic);
    return basic;
  };
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.material) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(simplify)
      : simplify(mesh.material);
  });
}
