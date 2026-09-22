import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {captureSceneState} from '../src/cube-capture.ts';
import {MirrorCubemapLifecycle} from '../src/mirror-cubemap-lifecycle.ts';

test('capture restores visible lighting, reflectors, hidden objects and shared emissive on failure',()=>{
 const scene=new THREE.Scene();const previous=new THREE.Texture(),capture=new THREE.Texture();scene.environment=previous;scene.environmentIntensity=.7;
 const arrow=new THREE.Object3D(), hidden=new THREE.Object3D();hidden.visible=false;
 const mirror=new THREE.Object3D();(mirror as any).isReflector=true;
 const mat=new THREE.MeshStandardMaterial({emissiveIntensity:3});mat.userData.bakeEmissiveOff=true;
 scene.add(arrow,hidden,mirror,new THREE.Mesh(new THREE.BoxGeometry(),mat),new THREE.Mesh(new THREE.BoxGeometry(),mat));
 const draw=captureSceneState(scene,[arrow,hidden],()=>capture,()=>.95,true);
 assert.throws(()=>draw(()=>{assert.equal(scene.environment,capture);assert.equal(scene.environmentIntensity,.95);assert.equal(mat.emissiveIntensity,0);assert.equal(arrow.visible,false);assert.equal(mirror.visible,false);throw new Error('cancel');}),/cancel/);
 assert.equal(scene.environment,previous);assert.equal(scene.environmentIntensity,.7);assert.equal(mat.emissiveIntensity,3);assert.equal(arrow.visible,true);assert.equal(hidden.visible,false);assert.equal(mirror.visible,true);
});
test('stock/layout changes invalidate a pending capture without disposing the current panorama',()=>{
 const life=new MirrorCubemapLifecycle();let disposed=0;const target={texture:new THREE.Texture(),dispose(){disposed++;}} as any;
 life.replace(target);const initial=life.version;life.beginStockBuild();life.finishStockBuild();life.stockChanged();
 assert.equal(life.version,initial+3);assert.equal(life.probe,target.texture);assert.equal(disposed,0);life.dispose();assert.equal(disposed,1);assert.equal(life.version,initial+4);
});
