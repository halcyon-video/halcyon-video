import type * as THREE from 'three';

/** Keep the building sidewalk and real lot; scenery beyond them belongs to the backdrop. */
export function setPhotographicGround(root: THREE.Object3D, _enabled: boolean): void {
  root.traverse(object => {
    if (object.userData.photographicGroundSurface === true) object.visible = true;
  });
}
