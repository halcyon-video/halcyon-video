import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { initialProgramObjects } from '../src/initial-programs.ts';
function setup(){const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(60,1,.1,100);camera.position.set(4,2,5);camera.lookAt(4,2,0);return {scene,camera};}
function box(x:number,y:number,z:number){const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial());mesh.position.set(x,y,z);return mesh;}
test('opening camera selects visible materials and keeps scene parenting unchanged',()=>{
 const {scene,camera}=setup(),visible=box(4,2,0),behind=box(4,2,12),side=box(40,2,0);scene.add(visible,behind,side);
 assert.deepEqual(initialProgramObjects(scene,camera),[visible]);assert.equal(visible.parent,scene);assert.equal(scene.children.length,3);
 camera.lookAt(4,2,15);assert.deepEqual(initialProgramObjects(scene,camera),[behind]);
});
test('hidden ancestors and camera layers are respected; uncullable drawables remain prepared',()=>{
 const {scene,camera}=setup(),group=new THREE.Group(),hidden=box(4,2,0),layer=box(4,2,0),uncullable=box(40,2,0);
 group.visible=false;group.add(hidden);layer.layers.set(2);uncullable.frustumCulled=false;scene.add(group,layer,uncullable);
 assert.deepEqual(initialProgramObjects(scene,camera),[uncullable]);
});
test('off-camera and hidden stock instances remain conservative first-tick candidates',()=>{
 const {scene,camera}=setup(),stock=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial(),1);
 stock.position.set(100,100,100);stock.visible=false;scene.add(stock);
 assert.deepEqual(initialProgramObjects(scene,camera),[stock]);
});
