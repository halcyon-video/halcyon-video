import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GroundedSkybox} from 'three/examples/jsm/objects/GroundedSkybox.js';
import {setPanoramaProjection,disposeInactivePanoramaGeometry} from '../src/panorama-projection.ts';

test('complete panoramas retain their projected floor across mode changes',()=>{
 const sky=new GroundedSkybox(new THREE.Texture(),5.5,600,32),grounded=sky.geometry;
 for(const enabled of [true,false,true]){setPanoramaProjection(sky,enabled);assert.equal(sky.geometry,grounded);}
 let disposed=0;grounded.addEventListener('dispose',()=>disposed++);
 disposeInactivePanoramaGeometry(sky);assert.equal(disposed,0);
 grounded.dispose();(sky.material as THREE.Material).dispose();
});
