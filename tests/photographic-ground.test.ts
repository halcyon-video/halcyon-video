import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {setPhotographicGround} from '../src/photographic-ground.ts';

test('complete photographs replace duplicate terrain while retaining walks and shadows',()=>{
 const root=new THREE.Group(),walk=new THREE.Group(),lot=new THREE.Group(),road=new THREE.Group(),shadow=new THREE.Group();
 lot.userData.photographicGroundSurface=true;road.userData.photographicGroundSurface=true;
 root.add(walk,lot,road,shadow);
 setPhotographicGround(root,true);assert(walk.visible&&shadow.visible);assert(!lot.visible&&!road.visible);
 setPhotographicGround(root,false);assert(walk.visible&&shadow.visible&&lot.visible&&road.visible);
});
