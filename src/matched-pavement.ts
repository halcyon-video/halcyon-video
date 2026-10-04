import * as THREE from 'three';
import { selfLit } from './material-lighting';

// Display-referred pavement: its color comes from the same photograph as the
// surroundings. A separate ShadowMaterial supplies real local shadowing.
export function createMatchedPavement() {
  const size = 128, data = new Uint8Array(size * size * 4);
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  const material = selfLit(new THREE.MeshBasicMaterial({map:texture, toneMapped:false, fog:false}), 'baked-backdrop');
  material.name = 'photograph-matched-pavement';
  const srgb = new THREE.Color();
  function setColor(color: THREE.Color) {
    color.getRGB(srgb, THREE.SRGBColorSpace);
    let seed = 731;
    for (let i = 0; i < size * size; i++) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      const grain = 1 + ((seed >>> 0) % 17 - 8) / 255;
      const at = i * 4;
      data[at] = Math.round(Math.min(1, srgb.r * grain) * 255);
      data[at + 1] = Math.round(Math.min(1, srgb.g * grain) * 255);
      data[at + 2] = Math.round(Math.min(1, srgb.b * grain) * 255);
      data[at + 3] = 255;
    }
    texture.needsUpdate = true;
  }
  setColor(new THREE.Color('#80766b'));
  return {material, setColor, dispose(){texture.dispose();material.dispose();}};
}
