import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { finishTelephone, refreshTelephoneContact } from '../src/fixtures/telephone-surfaces.ts';

test('contact bake follows a rotated phone, affects only its supporting top, and preserves the theme material', () => {
  const scene = new THREE.Scene();
  const counter = new THREE.Group(); counter.name = 'checkout-counter-model'; scene.add(counter);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([2,3,4, 2,2,4, 2,3,4],3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0,1,0, 0,1,0, 1,0,0],3));
  const theme = new THREE.MeshStandardMaterial({color: '#e3decf',roughness:.45});
  const top = new THREE.Mesh(geometry, theme);top.userData.telephoneContactReceiver=true;counter.add(top);
  refreshTelephoneContact(scene);assert.equal(top.material,theme); // counter arrives first
  const phone = new THREE.Group();phone.name='counter-telephone-model';phone.position.set(2,3,4);phone.rotation.y=.7;scene.add(phone);
  const texture = new THREE.Texture();
  const receiverMaterial = new THREE.MeshStandardMaterial({map:texture});
  const receiver = new THREE.Mesh(new THREE.PlaneGeometry(),receiverMaterial);receiver.name='TelephoneContactBake';phone.add(receiver);
  let disposed=0;receiver.geometry.addEventListener('dispose',()=>disposed++);
  phone.userData.contactTexture=finishTelephone(phone);
  assert.equal(phone.children.length,0);assert.equal(disposed,1);assert.equal(texture.channel,2);
  refreshTelephoneContact(scene);
  assert.notEqual(top.material,theme);assert.equal(theme.aoMap,null);
  assert.equal(top.material.aoMap,texture);assert.equal(top.material.color.getHex(),theme.color.getHex());
  assert.deepEqual(Array.from(geometry.attributes.uv2.array),[.5,.5,0,0,0,0]);
  const material=top.material;refreshTelephoneContact(scene);assert.equal(top.material,material);
  let materialDisposals=0;material.addEventListener('dispose',()=>materialDisposals++);
  phone.userData.contactCleanup();phone.userData.contactCleanup();
  assert.equal(top.material,theme);assert.equal(geometry.getAttribute('uv2'),undefined);
  assert.equal(materialDisposals,1);
});

test('unbaked local phone remains usable without a contact receiver', () => {
  const model=new THREE.Group();assert.equal(finishTelephone(model),null);
});
