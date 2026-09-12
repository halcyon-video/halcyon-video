import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import ts from 'typescript';

test('service door loader preserves fallback on failure and retires successful or cancelled loads', async () => {
  let source = await readFile(new URL('../src/fixtures/display-model.ts', import.meta.url), 'utf8');
  source = source.replace("import { assetUrl } from '../asset-url';", "const assetUrl = (s: string) => '/base/' + s;")
    .replaceAll("from 'three'", `from '${import.meta.resolve('three')}'`)
    .replace("from 'three/examples/jsm/loaders/GLTFLoader.js'", `from '${import.meta.resolve('three/examples/jsm/loaders/GLTFLoader.js')}'`);
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const { installDisplayModel } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
  const bytes = await readFile(new URL('../public/models/service-door.glb', import.meta.url));
  const parse = async () => (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  const original = GLTFLoader.prototype.load;
  let accept: (v: {scene: THREE.Group}) => void = () => {};
  let fail: () => void = () => {};
  GLTFLoader.prototype.load = function(url, onLoad, _progress, onError) {
    assert.equal(url, '/base/models/service-door.glb');
    accept = onLoad as typeof accept; fail = () => onError?.(new Error('offline'));
  };
  try {
    const scene = new THREE.Scene(), parent = new THREE.Group(), fallback = new THREE.Group();
    scene.add(parent); parent.add(fallback);
    const finish = new THREE.MeshStandardMaterial();
    let renders = 0, shadows = 0, sharedDisposals = 0;
    finish.addEventListener('dispose', () => sharedDisposals++);
    const ctx = {scene, requestRender(){renders++;}, requestShadowRefresh(){shadows++;}, log(){}};
    const install = () => installDisplayModel(ctx, parent, fallback, 'models/service-door.glb', {ServiceLeaf:finish});
    const release = install(); fail(); assert.ok(fallback.visible);
    const model = await parse(); let disposed = 0;
    model.traverse(o => {if(o instanceof THREE.Mesh)o.geometry.addEventListener('dispose', () => disposed++);});
    accept({scene:model}); assert.equal(fallback.visible,false);
    assert.equal(renders,1); assert.equal(shadows,1);
    assert.equal((model.getObjectByName('ServiceLeaf') as THREE.Mesh).material,finish);
    release(); release(); assert.equal(disposed,4); assert.equal(sharedDisposals,0);
    assert.equal(parent.getObjectByName('display-model'),undefined);
    fallback.visible=true;
    const cancel = install(); cancel();
    const late = await parse(); let lateDisposals = 0;
    late.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.addEventListener('dispose',()=>lateDisposals++);(o.material as THREE.Material).addEventListener('dispose',()=>lateDisposals++);}});
    accept({scene:late}); assert.equal(lateDisposals,8); assert.ok(fallback.visible); assert.equal(renders,1);
  } finally {GLTFLoader.prototype.load=original;}
});
