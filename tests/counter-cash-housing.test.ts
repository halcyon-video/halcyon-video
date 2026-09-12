import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import ts from 'typescript';

async function subject() {
  let source = await readFile(new URL('../src/fixtures/counter-cash-housing.ts', import.meta.url), 'utf8');
  const mounts = await readFile(new URL('../src/entrance/counter-mounts.ts', import.meta.url), 'utf8');
  source = source.replace("import { assetUrl } from '../asset-url';", "const assetUrl = (p: string) => '/base/' + p;")
    .replace("import { brandPackDir } from '../brand-pack';", "const brandPackDir = () => 'brand';")
    .replace("import { counterMount, placeOnCounterMount } from '../entrance/counter-mounts';", mounts.replace("import * as THREE from 'three';", ''))
    .replace("import { extractHousingContact, refreshEquipmentContact } from './counter-equipment-contact';", 'const extractHousingContact = () => null; const refreshEquipmentContact = () => {};')
    .replaceAll("from 'three'", `from '${import.meta.resolve('three')}'`)
    .replace("from 'three/examples/jsm/loaders/GLTFLoader.js'", `from '${import.meta.resolve('three/examples/jsm/loaders/GLTFLoader.js')}'`);
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
}

test('cash housing preserves optional precedence, clear fallback, gates and detached resource ownership', async () => {
  const { installCounterCashHousing } = await subject();
  const original = GLTFLoader.prototype.load;
  const requests: string[] = [];
  let accept: (value: { scene: THREE.Group }) => void = () => {};
  let fail = () => {};
  GLTFLoader.prototype.load = function(url, onLoad, _progress, onError) {
    requests.push(url); accept = onLoad as typeof accept; fail = () => onError?.(new Error('missing'));
  };
  try {
    let renders = 0, shadows = 0;
    const scene = new THREE.Scene(), parent = new THREE.Group(); scene.add(parent);
    const ctx = { scene, activeTheme: { id: 'bb-2010' }, storefrontSpec: { counterShape: 'shield' },
      entrance: { getCounterTopAnchorAt: () => ({ x: 1, y: 3, z: 2, rotY: .4 }), whenCounterModelReady: async () => null },
      fixtureContext: () => ({ requestShadowRefresh: () => shadows++ }), requestRender: () => renders++ };
    const install = async () => { installCounterCashHousing(ctx, parent); await Promise.resolve(); };
    ctx.activeTheme.id = 'bb-1993'; await install(); assert.equal(requests.length, 0);
    ctx.activeTheme.id = 'bb-2010'; ctx.storefrontSpec.counterShape = 'desk'; await install(); assert.equal(requests.length, 0);
    ctx.storefrontSpec.counterShape = 'shield'; await install();
    assert.match(requests[0], /^\/base\/user-assets\/brand\/fixtures\//); fail();
    assert.match(requests[1], /^\/base\/user-assets\/fixtures\//); fail();
    assert.equal(parent.children.length, 0); assert.equal(requests.length, 2);
    await install();
    const model = new THREE.Group(), geo = new THREE.BoxGeometry(), texture = new THREE.Texture();
    const mat = new THREE.MeshStandardMaterial({ map: texture }); model.add(new THREE.Mesh(geo, mat));
    accept({ scene: model }); assert.equal(parent.children.length, 1);
    assert.deepEqual(model.position.toArray(), [1, 3, 2]); assert.equal(model.rotation.y, .4);
    assert.equal(renders, 1); assert.equal(shadows, 1);
    let texturesDisposed = 0; texture.addEventListener('dispose', () => texturesDisposed++);
    parent.removeFromParent(); assert.equal(texturesDisposed, 1);
    scene.add(parent); await install(); parent.removeFromParent();
    let disposed = 0; const late = new THREE.Group(), g = new THREE.BoxGeometry(), t = new THREE.Texture();
    const m = new THREE.MeshStandardMaterial({ normalMap: t }); late.add(new THREE.Mesh(g, m));
    [g,m,t].forEach(r => r.addEventListener('dispose', () => disposed++)); accept({ scene: late });
    assert.equal(disposed, 3); assert.equal(renders, 1);
    const count = requests.length; fail(); assert.equal(requests.length, count);
  } finally { GLTFLoader.prototype.load = original; }
});


test('authored mounts seat two independent meshes at the measured support height', async () => {
  const { installCounterCashHousing } = await subject();
  const original = GLTFLoader.prototype.load;
  let accept: (value: { scene: THREE.Group }) => void = () => {};
  GLTFLoader.prototype.load = function(_url, onLoad) { accept = onLoad as typeof accept; };
  try {
    const scene = new THREE.Scene(), parent = new THREE.Group(), counter = new THREE.Group();
    scene.add(parent, counter); parent.position.set(10, 0, 0);
    for (let i = 0; i < 2; i++) {
      const mount = new THREE.Object3D(); mount.userData.counterMount = `mount_housing_${i}`;
      mount.position.set(12 + i * 3, 2.8, 4); counter.add(mount);
    }
    let seated = 0;
    const ctx = { scene, activeTheme: { id: 'bb-2010' }, storefrontSpec: { counterShape: 'usquare' },
      entrance: { getCounterTopAnchorAt: () => ({}), whenCounterModelReady: async () => counter,
        seatCounterTerminals: (value: THREE.Group) => { assert.equal(value, counter); seated++; } },
      fixtureContext: () => ({ requestShadowRefresh() {} }), requestRender() {} };
    installCounterCashHousing(ctx, parent); await Promise.resolve();
    const model = new THREE.Group(), geometry = new THREE.BoxGeometry(1.5, .35, 1.1265);
    geometry.translate(0, .175, 0);
    const texture = new THREE.Texture(), material = new THREE.MeshStandardMaterial({ normalMap: texture });
    model.add(new THREE.Mesh(geometry, material)); accept({ scene: model });
    assert.equal(seated, 1); assert.equal(parent.children.length, 2);
    parent.children.forEach((housing, i) => {
      assert.equal(housing.name, `counter-cash-housing-${i}`);
      assert.deepEqual(housing.getWorldPosition(new THREE.Vector3()).toArray(), [12 + i * 3, 2.8, 4]);
      assert.ok(Math.abs(housing.userData.supportHeight - .35) < 1e-6);
    });
    const first = parent.children[0].children[0] as THREE.Mesh;
    const second = parent.children[1].children[0] as THREE.Mesh;
    assert.notEqual(first.geometry, second.geometry); assert.notEqual(first.material, second.material);
    assert.equal((second.material as THREE.MeshStandardMaterial).normalMap, texture);
  } finally { GLTFLoader.prototype.load = original; }
});
