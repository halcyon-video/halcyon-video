import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Parse the shipped binaries with the runtime's loader. These checks catch
// changed export axes, accidental texture dependencies, or a display that no
// longer fits inside the deck (the clock derives its placement from this lens).
for (const [slot, height, depth] of [['vcr', .32, .95], ['dvd_player', .18, .85]] as const) {
  test(`${slot}: exported deck fits its stand and exposes a recessed clock lens`, async () => {
    const bytes = await readFile(new URL(`../public/models/${slot}.glb`, import.meta.url));
    assert.ok(bytes.length < 750_000, 'deck asset exceeded 750 KB');
    assert.equal(bytes.readUInt32LE(0), 0x46546c67);
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    assert.equal(json.images?.length ?? 0, 0, 'decks need no image downloads');
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const { scene } = await new GLTFLoader().parseAsync(buffer, '');
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    assert.ok(Math.abs(size.x - 1.4) < 1e-5, `width ${size.x}`);
    assert.ok(Math.abs(size.y - height) < 1e-5, `height ${size.y}`);
    assert.ok(Math.abs(size.z - depth) < .015, `depth ${size.z}`);
    assert.ok(Math.abs(box.min.y) < 1e-5, 'feet must seat on the shelf');
    assert.ok(size.y + .66 < 1.46, 'deck clips the underside of the TV shelf');
    assert.ok(size.z < 1.6, 'deck overhangs the equipment shelf');
    const mouth = scene.getObjectByName('DeckMediaMouth');
    assert.ok(mouth, 'media insertion needs its authored attachment point');
    const mouthPoint = mouth.getWorldPosition(new THREE.Vector3());
    assert.ok(box.containsPoint(mouthPoint));
    assert.ok(mouthPoint.z < box.min.z + .02 && mouthPoint.y > .10);

    const lensBox = new THREE.Box3();
    let triangles = 0, draws = 0, lenses = 0;
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      draws++;
      const geometry = object.geometry;
      const position = geometry.getAttribute('position');
      const normal = geometry.getAttribute('normal');
      const uv = geometry.getAttribute('uv');
      assert.ok(normal && uv, `${object.name} is missing normals or UVs`);
      assert.equal(uv.count, position.count);
      for (const attribute of [position, normal, uv]) {
        assert.ok(Array.from(attribute.array).every(Number.isFinite), `${object.name} has invalid attributes`);
      }
      triangles += (geometry.index?.count ?? position.count) / 3;
      if (object.material.name === 'DeckDisplay') {
        lenses++;
        lensBox.expandByObject(object);
      }
    });
    assert.equal(lenses, 1, 'the clock needs exactly one named lens');
    assert.ok(triangles < 12_000, `${triangles} triangles`);
    assert.ok(draws <= 10, `${draws} draw primitives`);
    assert.ok(box.containsBox(lensBox));
    assert.ok(lensBox.min.z - box.min.z < .025, 'display must face forward (-Z)');
    assert.ok(lensBox.min.z > box.min.z + .002, 'lens should sit behind the fascia');
    assert.ok(lensBox.min.y > .025 && lensBox.max.y < height - .01);
    const lensSize = lensBox.getSize(new THREE.Vector3());
    assert.ok(lensSize.x / lensSize.y >= 4 && lensSize.x / lensSize.y <= 7);
    assert.ok(lensSize.z < .005);
  });
}
