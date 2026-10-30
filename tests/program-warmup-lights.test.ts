import {test} from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {compileProgramsInStages} from '../src/program-warmup.ts';
test('compilation batches do not count fixture child lights again or mutate the live hierarchy',async()=>{
 const scene=new THREE.Scene(),fixture=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());
 const light=new THREE.PointLight();fixture.add(light);scene.add(fixture);let calls=0;
 const renderer={autoClear:true,localClippingEnabled:false,shadowMap:{needsUpdate:false},info:{programs:[]},
 getContext:()=>({getExtension:()=>null,isContextLost:()=>false}),getRenderTarget:()=>null,getActiveCubeFace:()=>0,getActiveMipmapLevel:()=>0,setRenderTarget:()=>{},render:()=>{},
 compile:(batch:THREE.Group,_camera:THREE.Camera,target:THREE.Scene)=>{calls++;let added=0,existing=0;batch.traverseVisible(o=>{if((o as THREE.Light).isLight)added++;});target.traverseVisible(o=>{if((o as THREE.Light).isLight)existing++;});assert.equal(added,0);assert.equal(existing,1);assert.equal(batch.children[0].type,'Mesh');assert.equal((batch.children[0] as THREE.Mesh).geometry,fixture.geometry);}}
 await compileProgramsInStages(renderer as any,scene,new THREE.PerspectiveCamera(),null,new AbortController().signal);
 assert.equal(calls,1);assert.equal(fixture.children[0],light);assert.equal(light.parent,fixture);
});

test('opening snapshots compile only selected drawables, not their off-camera children',async()=>{
 const scene=new THREE.Scene(),fixture=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());
 const child=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());
 fixture.add(child);scene.add(fixture);const roots=new THREE.Group();roots.children=[fixture];
 const submitted: THREE.Object3D[]=[];
 const renderer={autoClear:true,localClippingEnabled:false,shadowMap:{needsUpdate:false},info:{programs:[]},
 getContext:()=>({getExtension:()=>null,isContextLost:()=>false}),getRenderTarget:()=>null,getActiveCubeFace:()=>0,getActiveMipmapLevel:()=>0,setRenderTarget:()=>{},render:()=>{},
 compile:(batch:THREE.Group)=>{batch.traverse(o=>{if((o as THREE.Mesh).material)submitted.push(o);});}};
 await compileProgramsInStages(renderer as any,scene,new THREE.PerspectiveCamera(),null,new AbortController().signal,roots,undefined,{flatRoots:true});
 assert.equal(submitted.length,1);assert.equal((submitted[0] as THREE.Mesh).material,fixture.material);
 assert.equal(child.parent,fixture);assert.equal(fixture.parent,scene);
 submitted.length=0;
 await compileProgramsInStages(renderer as any,scene,new THREE.PerspectiveCamera(),null,new AbortController().signal,scene);
 assert.equal(submitted.length,2,'whole-room background preparation still visits descendants');
});
