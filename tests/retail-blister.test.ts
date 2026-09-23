import {test} from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {configureRetailBlister,prepareRetailModel} from '../src/fixtures/retail-model.ts';
test('blister packaging keeps clearcoat and color without activating whole-scene refraction',()=>{
 const m=new THREE.MeshPhysicalMaterial({transmission:.94,clearcoat:.3,color:0xcceeff});m.name='MerchandiserClearBlister';const color=m.color.getHex();
 assert.equal(configureRetailBlister(m),true);assert.equal(m.transmission,0);assert.equal(m.transparent,true);assert.equal(m.depthWrite,false);assert.equal(m.opacity,.16);assert.equal(m.color.getHex(),color);assert.equal(m.clearcoat,.3);assert.equal(configureRetailBlister(m),false);
 const other=new THREE.MeshPhysicalMaterial({transmission:.9});other.name='OpticalGlass';assert.equal(configureRetailBlister(other),false);assert.equal(other.transmission,.9);
});
test('clear blisters stay separately sortable and do not cast opaque packaging shadows',()=>{
 const group=new THREE.Group();const m=new THREE.MeshPhysicalMaterial({transmission:.94});m.name='MerchandiserClearBlister';
 const a=new THREE.Mesh(new THREE.BoxGeometry(),m),b=new THREE.Mesh(new THREE.BoxGeometry(),m);a.castShadow=b.castShadow=true;group.add(a,b);prepareRetailModel(group);
 assert.equal(group.children.length,1);const batch=group.children[0] as THREE.BatchedMesh;assert.ok(batch instanceof THREE.BatchedMesh);assert.equal(batch.instanceCount,2);assert.equal(batch.sortObjects,true);assert.equal(batch.castShadow,false);assert.equal((batch.material as THREE.Material).transparent,true);batch.dispose();
});
