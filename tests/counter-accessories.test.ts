import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

async function load(name: string) {
  const bytes = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
  const result = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  result.scene.updateMatrixWorld(true);
  return { root: result.scene, bytes: bytes.length };
}

test('counter accessories retain valid export attributes, counter datums and bounded costs', async () => {
  for (const [name, budget, height] of [
    ['tip-mug', 4000, .43], ['acrylic-l-holder', 500, .92],
    ['acrylic-tent-holder', 300, 1.02], ['cleaner-display-tray', 900, 1.18],
  ] as const) {
    const { root, bytes } = await load(name); let triangles = 0;
    assert.ok(bytes < 180_000, `${name}: download budget`);
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const name of ['position', 'normal', 'uv']) {
        const attribute = object.geometry.getAttribute(name);
        assert.ok(attribute && attribute.count > 0, `${object.name}: ${name}`);
        assert.ok(Array.from(attribute.array).every(Number.isFinite));
      }
      triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    });
    assert.ok(triangles <= budget && triangles > 0);
    const box = new THREE.Box3().setFromObject(root);
    assert.ok(Math.abs(box.min.y) < 1e-6, `${name}: rests on counter`);
    assert.ok(box.max.y <= height, `${name}: established envelope`);
  }
});

test('the mug is hollow, with a real inner floor and contained folded notes', async () => {
  const { root } = await load('tip-mug');
  const body = root.getObjectByName('Mug_continuous_body')!;
  assert.ok(body, 'named continuous body');
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObject(body, true)[0];
  assert.ok(hit && Math.abs(hit.point.y - .043) < .002, 'opening reaches the inner floor');
  const notes: THREE.Object3D[] = [];
  root.traverse(o => { if (o.name.startsWith('Folded_generic_tip_note')) notes.push(o); });
  assert.equal(notes.length, 2);
  for (const note of notes) {
    const bounds = new THREE.Box3().setFromObject(note);
    assert.ok(bounds.min.y > .04 && bounds.max.y > .362);
    assert.ok(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)) < .13);
    assert.ok(Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)) < .10);
  }
});

test('all ten cleaner cartons rest on the authored deck inside the retaining walls', async () => {
  const { root } = await load('cleaner-display-tray');
  for (let i = 0; i < 10; i++) {
    const x = -.84 + (i % 5) * .42, z = .14 - Math.floor(i / 5) * .2;
    const ray = new THREE.Raycaster(new THREE.Vector3(x, .5, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(root, true)[0];
    assert.ok(hit && Math.abs(hit.point.y - .35) < 1e-5, `carton ${i} support`);
    assert.ok(x - .365 / 2 > -1.082 && x + .365 / 2 < 1.082);
    assert.ok(z - .082 / 2 > -.231 && z + .082 / 2 < .232);
  }
});
