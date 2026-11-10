import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {blackEnvironment, captureEnvironmentInSlices} from '../src/cube-capture.ts';

function fakeRenderer() {
  const clear = new THREE.Color(0x336699);
  let alpha = .5, current: THREE.RenderTarget | null = null;
  const cleared: {target: THREE.RenderTarget | null; colour: number; alpha: number}[] = [];
  const environments: (THREE.Texture | null)[] = [];
  let scene: THREE.Scene | null = null;
  const renderer = {
    coordinateSystem: THREE.WebGLCoordinateSystem, autoClear: false, localClippingEnabled: false,
    shadowMap: {needsUpdate: false}, xr: {enabled: false}, info: {programs: [] as any[]},
    getContext: () => ({getExtension: () => null, isContextLost: () => false, getProgramParameter: () => true}),
    getClearColor: (target: THREE.Color) => target.copy(clear),
    getClearAlpha: () => alpha,
    setClearColor: (colour: THREE.ColorRepresentation, nextAlpha = 1) => {clear.set(colour); alpha = nextAlpha;},
    clear: () => cleared.push({target: current, colour: clear.getHex(), alpha}),
    getRenderTarget: () => current, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
    setRenderTarget: (value: THREE.RenderTarget | null) => {current = value;},
    render: (value: THREE.Scene) => {if (value.children.length) environments.push((scene ?? value).environment);},
    compile: () => {},
  };
  return {renderer: renderer as unknown as THREE.WebGLRenderer, cleared, environments,
    watch: (s: THREE.Scene) => {scene = s;}, clearState: () => [clear.getHex(), alpha]};
}

function fakePmrem() {
  const made: THREE.WebGLRenderTarget[] = [], disposed = new Set<THREE.WebGLRenderTarget>();
  const pmrem = {fromCubemap: () => {
    const target = new THREE.WebGLRenderTarget(4, 4);
    target.addEventListener('dispose', () => disposed.add(target));
    made.push(target); return target;
  }};
  return {pmrem: pmrem as unknown as THREE.PMREMGenerator, made, disposed};
}

test('black seed clears every cube face to opaque black and restores the caller clear state', () => {
  const r = fakeRenderer(), p = fakePmrem();
  const black = blackEnvironment(r.renderer, p.pmrem, 16);
  assert.equal(black, p.made[0]);
  assert.equal(r.cleared.length, 6);
  for (const entry of r.cleared) assert.deepEqual([entry.colour, entry.alpha], [0x000000, 1]);
  assert.deepEqual(r.clearState(), [0x336699, .5]);
  assert.equal(r.renderer.getRenderTarget(), null);
  black.dispose();
});

test('the first bounce sees the black seed, never a missing environment, and the seed is released', async () => {
  const r = fakeRenderer(), p = fakePmrem(), scene = new THREE.Scene();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  scene.add(mesh); r.watch(scene);
  const result = await captureEnvironmentInSlices(r.renderer, scene, p.pmrem, new THREE.Vector3(), 16, 2, [],
    async () => {}, new AbortController().signal);
  const [black, first, second] = p.made;
  assert.equal(result, second);
  assert.deepEqual(r.environments, [...Array(6).fill(black.texture), ...Array(6).fill(first.texture)]);
  assert.equal(scene.environment, null, 'capture state is restored between faces');
  assert.ok(p.disposed.has(black) && p.disposed.has(first) && !p.disposed.has(second));
  result.dispose(); mesh.geometry.dispose(); mesh.material.dispose();
});

test('a cancelled capture still releases the black seed', async () => {
  const r = fakeRenderer(), p = fakePmrem(), scene = new THREE.Scene(), signal = new AbortController();
  scene.add(new THREE.Mesh());
  await assert.rejects(captureEnvironmentInSlices(r.renderer, scene, p.pmrem, new THREE.Vector3(), 16, 2, [],
    async () => {signal.abort();}, signal.signal), {name: 'AbortError'});
  assert.ok(p.disposed.has(p.made[0]));
});
