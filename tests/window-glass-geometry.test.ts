import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { windowGlassGeometry } from '../src/window-glass-geometry.ts';
test('receiving aperture removes the glass across both viewing directions and retains its surround',()=>{
  const geometry=windowGlassGeometry(9,22,2,9,{x:11.5,width:2,bottom:3.7,top:4.12});
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),mesh=new THREE.Mesh(geometry,material);
  mesh.updateMatrixWorld();
  for(const side of [-1,1]) {
    for(const x of [10.6,11.5,12.4]) {
      const ray=new THREE.Raycaster(new THREE.Vector3(x,3.9,side),new THREE.Vector3(0,0,-side));
      assert.equal(ray.intersectObject(mesh).length,0,'no glass seals the tape mouth');
    }
    for(const [x,y] of [[10.3,3.9],[12.7,3.9],[11.5,3.5],[11.5,4.3]]) {
      const ray=new THREE.Raycaster(new THREE.Vector3(x,y,side),new THREE.Vector3(0,0,-side));
      assert.ok(ray.intersectObject(mesh).length>0,'glazing remains outside the infill');
    }
  }
  geometry.dispose();material.dispose();
});
