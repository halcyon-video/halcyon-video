import * as THREE from 'three';

/** Fixture-owned, deterministic orange-peel powdercoat. No network texture load. */
export function createCandyRackFinish(): { material: THREE.MeshStandardMaterial; texture: THREE.DataTexture } {
  const size = 128, pixels = new Uint8Array(size * size * 4);
  let seed = 193;
  for (let i = 0; i < size * size; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const grain = (seed >>> 24) / 255;
    pixels[i * 4] = Math.round(95 + grain * 65); // bump height (red)
    pixels[i * 4 + 1] = Math.round(218 + grain * 32); // roughness (green)
    pixels[i * 4 + 2] = 255;
    pixels[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.name = 'RackPowdercoatGrain';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setRGB(.09, .095, .105), metalness: .25,
    roughness: .58, roughnessMap: texture, bumpMap: texture, bumpScale: .0012,
  });
  material.name = 'RackSteel';
  return { material, texture };
}
