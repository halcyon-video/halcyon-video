import * as THREE from 'three';
import { selfLit } from './material-lighting.ts';

/** A wide photograph covers the forward half-circle, not the entire sphere. */
export function partialPanoramaGeometry(radius: number, aspect: number): THREE.CylinderGeometry {
  return new THREE.CylinderGeometry(radius, radius, radius * Math.PI / aspect * 4, 64, 32, true, 0, Math.PI);
}

export function buildPartialPanorama(texture: THREE.Texture, radius: number): THREE.Mesh {
  const image = texture.image as HTMLImageElement;
  const geometry = partialPanoramaGeometry(radius, image.width / image.height);
  // Trim the small outer margin sometimes present in supplied photo studies.
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setX(i, 1 - uv.getX(i)); // Inward viewing retains the photograph's left/right orientation.
    uv.setY(i, .04 + THREE.MathUtils.clamp((uv.getY(i) - .5) * 4 + .5, 0, 1) * .92);
  }
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, fog: false, toneMapped: false });
  selfLit(material, 'sky');
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'private-partial-panorama';
  mesh.userData.mode = texture.userData.panoramaMode;
  return mesh;
}
