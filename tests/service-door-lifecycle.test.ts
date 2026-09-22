import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import ts from 'typescript';

test('service door loader preserves fallback on failure and retires successful or cancelled loads', async () => {
  let source = await readFile(new URL('../src/fixtures/display-model.ts', import.meta.url), 'utf8');
  source = source.replace("from '../mobile-assets'", `from '${new URL('../src/mobile-assets.ts', import.meta.url).href}'`).replace("import { assetUrl } from '../asset-url';", "const assetUrl = (s: string) => '/base/' + s;")
    .replace("from './retail-model'", `from '${new URL('../src/fixtures/retail-model.ts', import.meta.url).href}'`)
    .replaceAll("from 'three'", `from '${import.meta.resolve('three')}'`)
    .replace("from 'three/examples/jsm/loaders/GLTFLoader.js'", `from '${import.meta.resolve('three/examples/jsm/loaders/GLTFLoader.js')}'`);
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const { installDisplayModel } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
  const bytes = await readFile(new URL('../public/models/service-door.glb', import.meta.url));
  const parse = async () => (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  const original = GLTFLoader.prototype.load;
  let requests = 0;
  let accept: (v: {scene: THREE.Group}) => void = () => {};
  let fail: () => void = () => {};
  GLTFLoader.prototype.load = function(url, onLoad, _progress, onError) {
    requests++;
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
    const mediaDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
    Object.defineProperty(globalThis, 'matchMedia', {configurable:true, value:()=>({matches:true})});
    const camera = new THREE.PerspectiveCamera(); camera.position.set(1000,0,0);
    const distant = new THREE.Group(), simple = new THREE.Group();
    simple.add(new THREE.Mesh(new THREE.BoxGeometry(2,2,2),finish)); distant.add(simple); scene.add(distant);
    const before = requests;
    const cancelDistant = installDisplayModel({...ctx,camera},distant,simple,'models/service-door.glb',{});
    try {
      await new Promise(r=>setTimeout(r,25)); assert.equal(requests,before,'distant mobile detail must not fetch');
      camera.position.set(0,0,0);
      await new Promise(r=>setTimeout(r,800)); assert.equal(requests,before+1,'approaching the fixture fetches its detail once');
      cancelDistant();
      camera.position.set(1000,0,0);
      const cancelBeforeFetch=installDisplayModel({...ctx,camera},distant,simple,'models/service-door.glb',{});
      cancelBeforeFetch();await new Promise(r=>setTimeout(r,25));assert.equal(requests,before+1,'cancelled mobile detail never fetches');
    } finally {
      cancelDistant();
      if(mediaDescriptor)Object.defineProperty(globalThis,'matchMedia',mediaDescriptor);else Reflect.deleteProperty(globalThis,'matchMedia');
      simple.children.forEach(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose()});
    }
  } finally {GLTFLoader.prototype.load=original;}
});
