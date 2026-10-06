import type * as THREE from 'three';

/** Keep layout/collision geometry and shadow receivers while removing duplicate visible ground. */
export function setPhotographicGround(root: THREE.Object3D, enabled: boolean): void {
  root.traverse(object => {
    if (object.userData.photographicGroundSurface === true) object.visible = !enabled;
  });
}
