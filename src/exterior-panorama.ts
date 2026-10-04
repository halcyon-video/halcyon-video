import * as THREE from 'three';
import { GroundedSkybox } from 'three/examples/jsm/objects/GroundedSkybox.js';
import { selfLit } from './material-lighting';
import { PANORAMA_EYE_HEIGHT, PANORAMA_GROUND_Y, PANORAMA_ROTATION_Y } from './exterior-panorama-profile';
import { STORE_CENTER_X, FRONT_GLASS_Z } from './store-layout';

export function buildExteriorPanorama(storeWidth: number, backWallZ: number, ceilingY: number, _sidewalkDepth: number, highQuality: boolean) {
  // Keep the accepted viewpoint fixed at the entrance. Real level pavement
  // covers the nearby projected floor; the photograph carries distant context.
  const originZ = FRONT_GLASS_Z + 1;
  const corner = Math.hypot(storeWidth / 2 + 4, ceilingY + 1, originZ - backWallZ + 4);
  const radius = Math.max(600, corner * 1.08 + 8);
  const placeholder = new THREE.Texture();
  const sky = new GroundedSkybox(placeholder, PANORAMA_EYE_HEIGHT, radius, highQuality ? 64 : 32);
  const mat = sky.material as THREE.MeshBasicMaterial;
  mat.map = null; placeholder.dispose();
  mat.fog = false; mat.toneMapped = false; selfLit(mat, 'sky');
  sky.name = 'store-panorama';
  sky.position.set(STORE_CENTER_X, PANORAMA_EYE_HEIGHT + PANORAMA_GROUND_Y, originZ);
  sky.rotation.y = PANORAMA_ROTATION_Y;
  sky.userData.panoramaRadius = radius;
  return sky;
}
