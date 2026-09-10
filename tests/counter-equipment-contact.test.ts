import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { refreshTelephoneContact } from '../src/fixtures/telephone-surfaces.ts';
import { extractHousingContact, refreshEquipmentContact } from '../src/fixtures/counter-equipment-contact.ts';

test('late equipment combines contact on a real worktop and restores owned resources', () => {
  const draws: unknown[] = [];
  const context = { fillStyle: '', globalCompositeOperation: '', fillRect() {}, setTransform() {}, drawImage(image: unknown) { draws.push(image); } };
  const previous = globalThis.document;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } });
  try {
    const scene = new THREE.Scene(), counter = new THREE.Group();
    counter.name = 'checkout-counter-model'; scene.add(counter);
    const original = new THREE.MeshStandardMaterial();
    const top = new THREE.Mesh(new THREE.BoxGeometry(6, .1, 3), original);
    top.position.y = -.05; top.userData.telephoneContactReceiver = true; counter.add(top);
    const add = (name: string, x: number) => {
      const model = new THREE.Group(); model.name = name; model.position.x = x;
      model.userData.contactTexture = new THREE.Texture({ width: 16, height: 16 } as HTMLImageElement);
      scene.add(model); return model;
    };
    const phone = add('counter-telephone-model', -1.5);
    refreshTelephoneContact(scene);
    const phoneOnly = top.material;
    let phoneOnlyDisposed = 0;
    phoneOnly.addEventListener('dispose', () => phoneOnlyDisposed++);
    refreshEquipmentContact(scene);
    assert.equal(phoneOnlyDisposed, 1);
    const first = (top.material as THREE.MeshStandardMaterial).aoMap!;
    let oldDisposed = 0; first.addEventListener('dispose', () => oldDisposed++);
    const housing = add('counter-cash-housing-model', 1.5);
    housing.rotation.y = Math.PI / 2;
    housing.userData.contactWidth = 2; housing.userData.contactDepth = 1.7;
    draws.length = 0; refreshEquipmentContact(scene);
    assert.equal(oldDisposed, 1);
    assert.deepEqual(draws, [phone.userData.contactTexture.image, housing.userData.contactTexture.image]);
    const uv = top.geometry.getAttribute('uv2'), normal = top.geometry.getAttribute('normal');
    for (let i = 0; i < normal.count; i++) {
      if (normal.getY(i) < .9) { assert.equal(uv.getX(i), 0); assert.equal(uv.getY(i), 0); }
    }
    const atlas = (top.material as THREE.MeshStandardMaterial).aoMap!;
    let disposed = 0; atlas.addEventListener('dispose', () => disposed++);
    const cleanup = housing.userData.contactCleanup;
    cleanup(); cleanup();
    assert.equal(disposed, 1); assert.equal(top.material, original);
    assert.equal(top.geometry.getAttribute('uv2'), undefined);
    refreshEquipmentContact(scene); scene.remove(counter);
    assert.equal(top.material, original);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', { configurable: true, value: previous });
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('embedded housing bake is removed while its texture remains owned by the loader', () => {
  const model = new THREE.Group();
  assert.equal(extractHousingContact(model), null);
  const texture = new THREE.Texture();
  const receiver = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial({ map: texture }));
  receiver.name = 'HousingContactBake'; receiver.userData = { contactWidth: 2, contactDepth: 1.7 };
  let geometryDisposed = 0, materialDisposed = 0, textureDisposed = 0;
  receiver.geometry.addEventListener('dispose', () => geometryDisposed++);
  receiver.material.addEventListener('dispose', () => materialDisposed++);
  texture.addEventListener('dispose', () => textureDisposed++);
  model.add(receiver);
  assert.equal(extractHousingContact(model), texture);
  assert.equal(model.children.length, 0);
  assert.equal(geometryDisposed, 1); assert.equal(materialDisposed, 1); assert.equal(textureDisposed, 0);
  assert.equal(model.userData.contactWidth, 2); assert.equal(model.userData.contactDepth, 1.7);
  assert.equal(texture.colorSpace, THREE.NoColorSpace);
});
