import * as THREE from 'three';

/** Four feet per repeat, anchored in building space across adjoining parts. */
export function mapFacadeUV(geometry: THREE.BufferGeometry, origin = new THREE.Vector3()): void {
  const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal');
  const values = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + origin.x, y = p.getY(i) + origin.y, z = p.getZ(i) + origin.z;
    const side = Math.abs(n.getX(i)) > .5, horizontal = Math.abs(n.getY(i)) > .5;
    values[i * 2] = (side ? z : x) / 4;
    values[i * 2 + 1] = (horizontal ? z : y) / 4;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(values, 2));
}

/** Two-inch glazed squares with fine recessed grout; tint follows the brand. */
export function createFacadeTileMaterial(color: string): THREE.MeshStandardMaterial {
  const size = 768, pitch = size / 24;
  const face = document.createElement('canvas');
  face.width = face.height = size;
  const c = face.getContext('2d')!;
  const height = face.cloneNode() as HTMLCanvasElement;
  const h = height.getContext('2d')!;
  c.fillStyle = '#888b91'; c.fillRect(0, 0, size, size);
  h.fillStyle = '#222222'; h.fillRect(0, 0, size, size);
  for (let row = 0; row < 24; row++) for (let col = 0; col < 24; col++) {
    const v = 235 + ((row * 17 + col * 13) % 17);
    c.fillStyle = `rgb(${v},${v},${v})`;
    c.fillRect(col * pitch + 1, row * pitch + 1, pitch - 2, pitch - 2);
    h.fillStyle = '#dddddd';
    h.fillRect(col * pitch + 1, row * pitch + 1, pitch - 2, pitch - 2);
    h.fillStyle = '#ffffff';
    h.fillRect(col * pitch + 2, row * pitch + 2, pitch - 4, pitch - 4);
  }
  const map = new THREE.CanvasTexture(face), bumpMap = new THREE.CanvasTexture(height);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const texture of [map, bumpMap]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
  }
  return new THREE.MeshStandardMaterial({ color, map, bumpMap, bumpScale: .018, roughness: .32, envMapIntensity: .2 });
}
