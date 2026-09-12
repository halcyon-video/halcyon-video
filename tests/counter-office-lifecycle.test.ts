import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import ts from 'typescript';

// Load the production module under Node while resolving its bundler-style
// imports. GLTFLoader.load alone is mocked to control success/failure timing.
async function subject() {
  let source = await readFile(new URL('../src/fixtures/counter-office-kit.ts', import.meta.url), 'utf8');
  const resources = await readFile(new URL('../src/model-resources.ts', import.meta.url), 'utf8');
  source = source.replace("import { assetUrl } from '../asset-url';", "const assetUrl = (path: string) => '/test-base/' + path;")
    .replace("import { disposeDetachedModel } from '../model-resources';", resources.replace("import * as THREE from 'three';", ''));
  source = source.replaceAll("from 'three'", `from '${import.meta.resolve('three')}'`)
    .replace("from 'three/examples/jsm/loaders/GLTFLoader.js'", `from '${import.meta.resolve('three/examples/jsm/loaders/GLTFLoader.js')}'`);
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
}

test('office loader retains fallback, batches shared parts, refreshes, and retires late loads', async () => {
  const { installCounterOfficeKit } = await subject();
  const original = GLTFLoader.prototype.load;
  let accept: (g: { scene: THREE.Group }) => void = () => {};
  let fail: () => void = () => {};
  let requested = '';
  GLTFLoader.prototype.load = function(url, onLoad, _progress, onError) {
    requested = url; accept = onLoad as typeof accept; fail = () => onError?.(new Error('offline'));
  };
  try {
    let renders = 0, shadows = 0;
    const scene = new THREE.Scene(), parent = new THREE.Group(); scene.add(parent);
    const ctx = { scene, activeTheme: { id: 'bb-1990', palette: { primary: '#abcdef' } }, log() {}, requestRender() { renders++; }, requestShadowRefresh() { shadows++; } };
    for (const theme of ['bb-1990', 'bb-1993', 'bb-2000']) {
      ctx.activeTheme.id = theme;
      installCounterOfficeKit(ctx, parent, { x: 13.1, y: 3.54, z: 7.75 });
      assert.equal(requested, ''); assert.equal(parent.children.length, 0);
    }
    ctx.activeTheme.id = 'bb-2010';
    installCounterOfficeKit(ctx, parent, { x: 13.1, y: 3.54, z: 7.75 });
    assert.equal(parent.getObjectByName('counter-office-kit')!.rotation.y, Math.PI);
    assert.equal(requested, '/test-base/models/counter-office-kit.glb');
    fail(); assert.ok(parent.getObjectByName('office-kit-fallback'));
    const model = new THREE.Group();
    const geo = new THREE.BoxGeometry(1, 1, 1), mat = new THREE.MeshStandardMaterial();mat.name = 'OfficeAccent';
    for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(geo, mat); m.position.y = i * .2; model.add(m); }
    let geometryDisposals = 0, materialDisposals = 0, instanceDisposals = 0;
    geo.addEventListener('dispose', () => geometryDisposals++); mat.addEventListener('dispose', () => materialDisposals++);
    accept({ scene: model });
    assert.equal(parent.getObjectByName('office-kit-fallback'), undefined);
    assert.equal(model.children.length, 1);
    const batch = model.children[0] as THREE.InstancedMesh;
    assert.ok(batch.isInstancedMesh); assert.equal(batch.count, 7);
    const transform = new THREE.Matrix4();batch.getMatrixAt(6, transform);assert.ok(Math.abs(transform.elements[13] - 1.2) < .00001);
    batch.addEventListener('dispose', () => instanceDisposals++);
    assert.equal(mat.color.getHexString(), 'abcdef'); assert.equal(renders, 1);assert.equal(shadows, 1);
    scene.remove(parent);
    assert.equal(geometryDisposals, 1);assert.equal(materialDisposals, 1);assert.equal(instanceDisposals, 1);
    assert.equal(parent.children.length, 0);
    scene.add(parent);installCounterOfficeKit(ctx, parent, { x: 0, y: 0, z: 0 });scene.remove(parent);
    const late = new THREE.Group(), lateGeo = new THREE.BoxGeometry(), lateMat = new THREE.MeshStandardMaterial();
    let disposed = 0;lateGeo.addEventListener('dispose', () => disposed++);lateMat.addEventListener('dispose', () => disposed++);
    late.add(new THREE.Mesh(lateGeo, lateMat));accept({ scene: late });
    assert.equal(disposed, 2);assert.equal(parent.children.length, 0);assert.equal(renders, 1);
  } finally { GLTFLoader.prototype.load = original; }
});
