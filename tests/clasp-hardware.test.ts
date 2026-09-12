import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { installClaspHardware } from '../src/fixtures/clasp-hardware.ts';
async function asset() {
  const bytes = await readFile(new URL('../public/models/shelf-components.glb', import.meta.url));
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}
test('clasps share hardware, preserve pick objects, and release late/failed loads', async t => {
  let success: (g: any) => void = () => {};
  let failure: () => void = () => {};
  let requests = 0;
  t.mock.method(GLTFLoader.prototype, 'load', (_url: string, done: typeof success, _progress: unknown, fail: typeof failure) => {
    requests++; success = done; failure = fail;
  });
  const parent = new THREE.Group();
  const targets = Array.from({ length: 24 }, () => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(.018, .19, .95));
    parent.add(m); return m;
  });
  const material = new THREE.MeshStandardMaterial();
  let wake = 0;
  const retire = installClaspHardware(targets, material, () => wake++);
  const raycast = targets[0].raycast;
  success(await asset());
  assert.equal(requests, 1); assert.equal(wake, 1);
  assert.equal(targets[0].raycast, raycast);
  assert.equal(targets[0].geometry.type, 'BoxGeometry');
  assert.equal(targets[0].children.length, 2);
  for (let i = 0; i < 2; i++) {
    const mesh = targets[0].children[i] as THREE.Mesh;
    assert.equal(mesh.geometry, (targets[23].children[i] as THREE.Mesh).geometry);
    assert.equal(mesh.material, (targets[23].children[i] as THREE.Mesh).material);
  }
  let releases = 0;
  targets[0].children.forEach(m => (m as THREE.Mesh).geometry.addEventListener('dispose', () => releases++));
  retire(); assert.equal(releases, 2); assert.equal(targets[0].children.length, 0);
  const cancel = installClaspHardware(targets, material, () => wake++);
  cancel();
  const late = await asset(); let lateReleases = 0;
  late.scene.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.addEventListener('dispose', () => lateReleases++); });
  success(late);
  assert.equal(lateReleases, 14); assert.equal(wake, 1); assert.equal(targets[0].children.length, 0);
  const failed = installClaspHardware(targets, material, () => wake++);
  failure(); assert.equal(wake, 1); assert.equal(targets[0].parent, parent); failed();
  const malformed = installClaspHardware(targets, material, () => wake++);
  success({ scene: new THREE.Group() }); assert.equal(wake, 1); malformed();
  installClaspHardware([], material, () => wake++)(); assert.equal(requests, 4);
});
