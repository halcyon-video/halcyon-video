import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { compileProgramsInStages, yieldForPrograms } from '../src/program-warmup.ts';

function fixture(parallel = true) {
  const signal = new AbortController();
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  const camera = new THREE.PerspectiveCamera();
  const target = new THREE.WebGLRenderTarget(1, 1), original = new THREE.WebGLRenderTarget(2, 2);
  const events: string[] = [];
  let current = original, queries = 0, lost = false;
  const renderer = {
    autoClear: true, shadowMap: { needsUpdate: true }, info: { programs: [] as object[] },
    getContext: () => ({
      LINK_STATUS: 1,
      getExtension: () => parallel ? { COMPLETION_STATUS_KHR: 2 } : null,
      isContextLost: () => lost,
      getProgramParameter: (_: unknown, kind: number) => {
        events.push('query:' + kind); queries++;
        return kind === 1 || queries > 1;
      },
    }),
    getRenderTarget: () => current,
    getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
    setRenderTarget: (value: THREE.WebGLRenderTarget) => { current = value; },
    render: (empty: THREE.Scene) => {
      assert.equal(empty.children.length, 0, 'preparation must not draw the live scene');
      assert.equal(current, target); events.push('reset');
    },
    compile: (batch: THREE.Group, view: THREE.Camera, lighting: THREE.Scene) => {
      assert.equal(current, target); assert.equal(view, camera); assert.equal(lighting, scene);
      assert.ok(batch.children.includes(mesh)); assert.equal(mesh.parent, scene);
      renderer.info.programs.push({ program: {}, getUniforms: () => events.push('uniforms'), getAttributes: () => events.push('attributes') }); events.push('compile');
    },
  };
  return { scene, camera, target, renderer, events, signal,
    run: () => compileProgramsInStages(renderer as unknown as THREE.WebGLRenderer, scene, camera, target, signal.signal),
    lose: () => { lost = true; },
    checkRestored: () => { assert.equal(current, original); assert.equal(renderer.autoClear, true); assert.equal(renderer.shadowMap.needsUpdate, true); },
  };
}

test('parallel completion yields without a blocking link query and preserves live scene/target', async () => {
  const f = fixture(); await f.run();
  assert.deepEqual(f.events, ['reset', 'compile', 'query:2', 'query:2', 'uniforms', 'attributes']);
  f.checkRestored();
});

test('fallback waits between submission and the blocking link check', async () => {
  const f = fixture(false); let observedSubmission = false;
  const compiling = f.run();
  const observer = setInterval(() => { if (f.events.includes('compile') && !f.events.includes('query:1')) observedSubmission = true; }, 1);
  try { await compiling; } finally { clearInterval(observer); }
  assert.equal(observedSubmission, true); assert.deepEqual(f.events, ['reset', 'compile', 'query:1', 'uniforms', 'attributes']);
  f.checkRestored();
});

test('teardown between submission and completion never queries disposed programs', async () => {
  const f = fixture(); const original = f.renderer.compile;
  f.renderer.compile = (...args) => { original(...args); f.signal.abort(); };
  await assert.rejects(f.run(), { name: 'AbortError' });
  assert.deepEqual(f.events, ['reset', 'compile']); f.checkRestored();
});

test('lost context stops preparation before any driver query', async () => {
  const f = fixture(); f.lose(); await f.run(); assert.deepEqual(f.events, []);
});

test('failed compiler restores renderer state', async () => {
  const f = fixture(); f.renderer.compile = () => { throw new Error('compile failed'); };
  await assert.rejects(f.run(), /compile failed/); f.checkRestored();
});

test('hidden-page work remains suspended and can be cancelled', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: true } });
  const controller = new AbortController();
  const work = yieldForPrograms(controller.signal);
  setTimeout(() => controller.abort(), 40);
  try { await assert.rejects(work, { name: 'AbortError' }); }
  finally { if (descriptor) Object.defineProperty(globalThis, 'document', descriptor); else Reflect.deleteProperty(globalThis, 'document'); }
});


test('surface preparation happens before shader submission', async () => {
  const f = fixture();
  const mesh = f.scene.children[0] as THREE.Mesh;
  mesh.userData.prepareProgram = () => { (mesh.material as THREE.MeshBasicMaterial).vertexColors = true; };
  const compile = f.renderer.compile;
  f.renderer.compile = (...args) => {
    assert.equal((mesh.material as THREE.MeshBasicMaterial).vertexColors, true);
    compile(...args);
  };
  await f.run();
});


test('fallback finishes a submitted family before queuing another', async () => {
  const f = fixture(false);
  const other = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial());
  f.scene.add(other);
  f.renderer.compile = () => {
    if (f.events.includes('compile')) assert.ok(f.events.includes('uniforms'), 'must not queue all links before blocking status queries');
    f.renderer.info.programs.push({ program: {}, getUniforms: () => f.events.push('uniforms'), getAttributes: () => {} });
    f.events.push('compile');
  };
  await f.run();
  assert.equal(f.events.filter(e=>e==='compile').length, 2);
});


test('interactive preparation submits one drawable at a time and keeps the live tree intact', async () => {
  const f = fixture();
  const second = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshStandardMaterial());
  f.scene.add(second);
  const batches: THREE.Object3D[][] = [];
  f.renderer.compile = (batch: THREE.Group) => { batches.push([...batch.children]); };
  await compileProgramsInStages(f.renderer as unknown as THREE.WebGLRenderer, f.scene, f.camera,
    f.target, f.signal.signal, f.scene, undefined, {batchSize: 1});
  assert.deepEqual(batches, f.scene.children.map(object => [object]));
  assert.equal(second.parent, f.scene);
  f.checkRestored();
});


test('interactive parallel compilation drains a family before submitting the next', async () => {
  const f = fixture(true);
  f.scene.add(new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshStandardMaterial()));
  let submitted = 0, prepared = 0;
  f.renderer.compile = () => {
    assert.equal(prepared, submitted, 'prior family must finish before more driver work is submitted');
    submitted++;
    f.renderer.info.programs.push({program: {}, getUniforms: () => { prepared++; }, getAttributes: () => {}});
  };
  await compileProgramsInStages(f.renderer as unknown as THREE.WebGLRenderer, f.scene, f.camera,
    f.target, f.signal.signal, f.scene, undefined, {batchSize: 1});
  assert.equal(prepared, 2);
});


test('ordinary and instanced meshes sharing geometry/material keep distinct shader inputs', async () => {
  const f = fixture();
  const ordinary = f.scene.children[0] as THREE.Mesh;
  const duplicate = new THREE.Mesh(ordinary.geometry, ordinary.material);
  const instanced = new THREE.InstancedMesh(ordinary.geometry, ordinary.material, 1);
  f.scene.add(duplicate, instanced);
  assert.equal(instanced.type, 'Mesh', 'Three reports the same nominal type for both kinds');
  const submitted: THREE.Object3D[] = [];
  f.renderer.compile = (batch: THREE.Group) => { submitted.push(...batch.children); };
  await f.run();
  assert.deepEqual(submitted, [ordinary, instanced]);
  assert.equal(instanced.parent, f.scene);
  f.checkRestored();
});
