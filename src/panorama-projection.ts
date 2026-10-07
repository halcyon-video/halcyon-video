import * as THREE from 'three';

/** Physical terrain supplies the near view; the photo stays on an ordinary sphere. */
export function setPanoramaProjection(mesh: THREE.Mesh, physicalGround: boolean): void {
  const data=mesh.userData;
  data.groundedGeometry ??= mesh.geometry;
  if(physicalGround && !data.sphereGeometry){
    const p=(data.groundedGeometry as THREE.SphereGeometry).parameters;
    data.sphereGeometry=new THREE.SphereGeometry(p.radius,p.widthSegments,p.heightSegments);
    data.sphereGeometry.scale(1,1,-1);
  }
  mesh.geometry=physicalGround?data.sphereGeometry:data.groundedGeometry;
}

export function disposeInactivePanoramaGeometry(mesh: THREE.Mesh): void {
  for(const key of ['groundedGeometry','sphereGeometry']){
    const geometry=mesh.userData[key] as THREE.BufferGeometry|undefined;
    if(geometry && geometry!==mesh.geometry)geometry.dispose();
    delete mesh.userData[key];
  }
}
