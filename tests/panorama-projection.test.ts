import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GroundedSkybox} from 'three/examples/jsm/objects/GroundedSkybox.js';
import {setPanoramaProjection,disposeInactivePanoramaGeometry} from '../src/panorama-projection.ts';

test('physical ground uses an unflattened photo sphere and restores the original projection',()=>{
 const sky=new GroundedSkybox(new THREE.Texture(),5.5,600,32),grounded=sky.geometry;
 setPanoramaProjection(sky,true);const sphere=sky.geometry;
 assert.notEqual(sphere,grounded);sphere.computeBoundingBox();assert(sphere.boundingBox!.min.y < -599);
 setPanoramaProjection(sky,false);assert.equal(sky.geometry,grounded);
 setPanoramaProjection(sky,true);assert.equal(sky.geometry,sphere);
 let disposed=0;grounded.addEventListener('dispose',()=>disposed++);disposeInactivePanoramaGeometry(sky);assert.equal(disposed,1);
 sphere.dispose();(sky.material as THREE.Material).dispose();
});
