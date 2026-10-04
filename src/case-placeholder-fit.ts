import * as THREE from 'three';
const fitted = new WeakMap<THREE.MeshStandardMaterial, Map<number, THREE.MeshStandardMaterial>>();
export function fitCasePlaceholder(base: THREE.MeshStandardMaterial, faceAspect: number, sourceAspect: number): THREE.MeshStandardMaterial {
  let variants = fitted.get(base);
  if (!variants) {
    variants = new Map(); fitted.set(base, variants);
    base.addEventListener('dispose', () => { for (const material of variants!.values()) material.dispose(); variants!.clear(); });
  }
  const key = faceAspect / sourceAspect;
  const cached = variants.get(key);
  if (cached) return cached;
  const material = base.clone();
  material.onBeforeCompile = shader => {
    shader.uniforms.uFallbackAspect = { value: key };
    shader.fragmentShader = 'uniform float uFallbackAspect;\n' + shader.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec2 fallbackUv = vMapUv;
        if (uFallbackAspect > 1.0) fallbackUv.x = (fallbackUv.x - 0.5) * uFallbackAspect + 0.5;
        else fallbackUv.y = (fallbackUv.y - 0.5) / uFallbackAspect + 0.5;
        vec4 sleeve = (fallbackUv.x < 0.0 || fallbackUv.x > 1.0 || fallbackUv.y < 0.0 || fallbackUv.y > 1.0)
          ? vec4(0.08, 0.08, 0.08, 1.0) : texture2D(map, fallbackUv);
        diffuseColor *= sleeve;
      #endif
    `);
  };
  material.customProgramCacheKey = () => 'case-placeholder-contain';
  variants.set(key, material);
  return material;
}
