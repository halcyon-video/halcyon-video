import type * as THREE from 'three';

/** Keep the building walk; parking and the street belong to a complete backdrop. */
export function setPhotographicGround(root: THREE.Object3D, enabled: boolean): void {
  root.traverse(object => {
    if (object.userData.photographicGroundSurface === true) object.visible = !enabled;
  });
}
