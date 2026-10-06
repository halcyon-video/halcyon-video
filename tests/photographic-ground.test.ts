import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {setPhotographicGround} from '../src/photographic-ground.ts';

test('photographic ground retains shadow receivers, props and geometry, then restores surfaces',()=>{
 const root=new THREE.Group(), surface=new THREE.Mesh(new THREE.PlaneGeometry(10,10)), shadow=new THREE.Mesh(new THREE.PlaneGeometry(10,10),new THREE.ShadowMaterial()), prop=new THREE.Group();
 surface.userData.photographicGroundSurface=true;root.add(surface,shadow,prop);
 const geometry=surface.geometry;
 setPhotographicGround(root,true);
 assert.equal(surface.visible,false);assert.equal(shadow.visible,true);assert.equal(prop.visible,true);assert.equal(surface.geometry,geometry);
 setPhotographicGround(root,false);assert.equal(surface.visible,true);
 surface.geometry.dispose();shadow.geometry.dispose();(shadow.material as THREE.Material).dispose();
});
