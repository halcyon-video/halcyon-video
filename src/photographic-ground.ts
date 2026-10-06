import type * as THREE from 'three';

/** Keep the building sidewalk and real lot; extend terrain for full panorama views. */
export function setPhotographicGround(root: THREE.Object3D, enabled: boolean): void {
  root.traverse(object => {
    if (object.userData.extendedPavement === true) object.visible = enabled;
    if (object.userData.photographicGroundSurface === true) object.visible = true;
  });
}
