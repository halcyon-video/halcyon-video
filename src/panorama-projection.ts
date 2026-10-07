import * as THREE from 'three';

/** Complete panoramas supply their projected floor as well as the horizon. */
export function setPanoramaProjection(mesh: THREE.Mesh, _photographicGround: boolean): void {
  mesh.userData.groundedGeometry ??= mesh.geometry;
  mesh.geometry = mesh.userData.groundedGeometry;
}

export function disposeInactivePanoramaGeometry(mesh: THREE.Mesh): void {
  for(const key of ['groundedGeometry','sphereGeometry']){
    const geometry=mesh.userData[key] as THREE.BufferGeometry|undefined;
    if(geometry && geometry!==mesh.geometry)geometry.dispose();
    delete mesh.userData[key];
  }
}
