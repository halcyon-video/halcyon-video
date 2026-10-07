import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {setPhotographicGround} from '../src/photographic-ground.ts';

test('photographic modes keep the physical sidewalk, lot and shadows visible',()=>{
 const root=new THREE.Group(),sidewalk=new THREE.Group(),extension=new THREE.Group(),shadow=new THREE.Group();
 sidewalk.userData.photographicGroundSurface=true;extension.userData.extendedPavement=true;extension.visible=false;root.add(sidewalk,extension,shadow);
 setPhotographicGround(root,true);assert(sidewalk.visible&&shadow.visible);
 setPhotographicGround(root,false);assert(sidewalk.visible&&shadow.visible);assert.equal(extension.visible,false);
});
