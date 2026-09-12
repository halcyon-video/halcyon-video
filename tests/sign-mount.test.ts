import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { prepareSignMount, signCeilingContacts } from '../src/fixtures/sign-mount-layout.ts';
const bytes = readFileSync(new URL('../public/models/sign-mount.glb', import.meta.url));
const parse = async () => (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test('sign mount export: named UV/normal meshes and bounded resource cost', async () => {
  const model = await parse();
  const names: string[] = [], roles = new Set<string>(); let tris = 0;
  model.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    names.push(o.name); roles.add(o.material.name);
    assert.ok(o.geometry.getAttribute('uv')); assert.ok(o.geometry.getAttribute('normal'));
    const pos = o.geometry.getAttribute('position');
    assert.ok(Array.from(pos.array).every(Number.isFinite));
    tris += o.geometry.index!.count / 3;
    assert.equal(o.material.map, null);
  });
  assert.deepEqual(names.sort(), ['AttachmentEye','CeilingClip','Fastener','RigidDrop','SuspensionWire','TopChannel','WireConnector'].sort());
  assert.deepEqual([...roles].sort(), ['MountChannel','MountSteel']);
  assert.ok(tris <= 700); assert.ok(bytes.length < 50_000);
});

for (const ceilingY of [11, 13.5, 18]) for (const rigid of [false, true]) {
  test(`sign mount contacts: ${rigid ? 'wedge' : 'board'} under ${ceilingY} ft ceiling`, async () => {
    const model = await parse(); const topY = rigid ? ceilingY - .18 : ceilingY - 2;
    prepareSignMount(model, { width: 4, topY, ceilingY, rigid });
    const box = new THREE.Box3().setFromObject(model);
    near(box.max.y, ceilingY); near(box.min.y, topY - .022);
    const clips = model.children.filter(o => o.name === 'CeilingClip');
    assert.equal(clips.length, 2);
    clips.forEach(o => near(new THREE.Box3().setFromObject(o).max.y, ceilingY));
    const drops = model.children.filter(o => o.name === (rigid ? 'RigidDrop' : 'SuspensionWire'));
    assert.equal(drops.length, 2);
    for (const drop of drops) {
      const b = new THREE.Box3().setFromObject(drop);
      near(b.max.y, ceilingY - .008);
      near(b.min.y, topY + (rigid ? .026 : .15));
      near(b.max.x - b.min.x, rigid ? .028 : .007);
    }
    assert.equal(model.children.some(o => o.name === (rigid ? 'SuspensionWire' : 'RigidDrop')), false);
    const left = drops[0] as THREE.Mesh, right = drops[1] as THREE.Mesh;
    assert.equal(left.geometry, right.geometry, 'repeated parts share per-sign geometry');
  });
}

test('short board gaps use rigid drops and skew moves all mounts with top edge', async () => {
  const model = await parse();
  prepareSignMount(model, { width: 2, topY: 13.32, ceilingY: 13.5, rigid: false, skew: .25 });
  assert.equal(model.children.filter(o => o.name === 'RigidDrop').length, 2);
  near(model.getObjectByName('TopChannel')!.position.x, .25);
  near(new THREE.Box3().setFromObject(model).max.y, 13.5);
});

test('clips resolve each visible tile underside without moving the wedge body', async () => {
  const scene = new THREE.Scene(), parent = new THREE.Group();
  parent.position.set(4, 0, 6); parent.rotation.y = Math.PI / 2; scene.add(parent);
  const tile = new THREE.Mesh(new THREE.BoxGeometry(8, .14, 8), new THREE.MeshBasicMaterial());
  tile.position.set(4, 13.5, 6); scene.add(tile);
  // Own fallback must not become the mounting surface.
  const fallback = new THREE.Mesh(new THREE.BoxGeometry(4, .18, 2), new THREE.MeshBasicMaterial());
  fallback.position.y = 13.41; parent.add(fallback);
  const spec = { width: 4, topY: 13.32, ceilingY: 13.5, rigid: true };
  const contactYs = signCeilingContacts(scene, parent, spec);
  contactYs.forEach(y => near(y, 13.43));
  const model = await parse(); prepareSignMount(model, {...spec, contactYs});
  near(new THREE.Box3().setFromObject(model).max.y, 13.43);
  near(model.getObjectByName('TopChannel')!.position.y, 13.32);
  tile.visible = false;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(8, .5, 8), new THREE.MeshBasicMaterial());
  roof.position.set(4, 14.1, 6); scene.add(roof);
  signCeilingContacts(scene, parent, spec).forEach(y => near(y, 13.85));
  roof.removeFromParent(); assert.deepEqual(signCeilingContacts(scene, parent, spec), [13.5, 13.5]);
});
