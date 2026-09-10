import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

test('recessed downlight: exported bounds, UVs, normals, materials, and resource budget', async () => {
  const bytes = readFileSync(new URL('../public/models/recessed-downlight.glb', import.meta.url));
  assert.ok(bytes.length < 90000, `GLB byte size ${bytes.length} exceeds budget`);

  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );

  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = box.getSize(new THREE.Vector3());

  // Hanger bars span ~1.5 ft across X; trim flange is 0.82 ft across Z (radius 0.41 ft)
  assert.ok(size.x > 1.4 && size.x <= 1.6, `Width ${size.x} out of range`);
  assert.ok(size.z > 0.8 && size.z <= 0.85, `Depth ${size.z} out of range`);

  // Trim lip drops 0.015 ft below ceiling (y = 0); plenum can extends ~0.55-0.57 ft above
  assert.ok(box.min.y <= -0.014 && box.min.y >= -0.02, `Trim drop ${box.min.y} out of range`);
  assert.ok(box.max.y >= 0.54 && box.max.y <= 0.60, `Can height ${box.max.y} out of range`);

  let triangles = 0;
  let meshes = 0;
  const expectedMaterials = new Set([
    'DownlightTrim',
    'DownlightReflector',
    'DownlightLamp',
    'DownlightCan',
  ]);
  const foundMaterials = new Set<string>();

  gltf.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes++;
    const geometry = object.geometry;
    const tris = (geometry.index?.count ?? geometry.attributes.position.count) / 3;
    triangles += tris;

    for (const attr of ['position', 'normal', 'uv']) {
      assert.ok(geometry.attributes[attr], `Mesh ${object.name} missing attribute ${attr}`);
      assert.ok([...geometry.attributes[attr].array].every(Number.isFinite), `Attribute ${attr} has non-finite values`);
    }

    const mats = Array.isArray(object.material) ? object.material : [object.material];
    for (const m of mats) {
      foundMaterials.add(m.name);
      assert.ok(expectedMaterials.has(m.name), `Unexpected material ${m.name}`);
      assert.equal(m.map, null, `Material ${m.name} should have no image map`);
    }
  });

  assert.equal(meshes, 4, `Expected 4 meshes (1 per material role), found ${meshes}`);
  assert.deepEqual(foundMaterials, expectedMaterials, 'Missing expected material roles');
  assert.ok(triangles <= 1800, `Triangles count ${triangles} exceeds budget`);
});

test('recessed downlight: clear aperture opening, recessed lamp, and downward normal', async () => {
  const bytes = readFileSync(new URL('../public/models/recessed-downlight.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );

  // Ray looking straight up through the aperture center (0, 0)
  const centerRay = new THREE.Raycaster(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, 1, 0));
  const centerHits = centerRay.intersectObjects(gltf.scene.children, true);
  assert.ok(centerHits.length > 0, 'Center ray should enter aperture and hit fixture');

  // The first surface hit looking up into the opening should be the bright lamp lens
  const firstHit = centerHits[0];
  assert.equal(firstHit.object.name, 'Downlight_DownlightLamp');
  assert.ok(firstHit.point.y >= 0.28 && firstHit.point.y <= 0.30, `Lamp y ${firstHit.point.y} not recessed`);

  // Ray looking up at the trim flange bottom (r = 0.36 ft)
  const trimRay = new THREE.Raycaster(new THREE.Vector3(0.36, -0.5, 0), new THREE.Vector3(0, 1, 0));
  const trimHits = trimRay.intersectObjects(gltf.scene.children, true);
  assert.ok(trimHits.length > 0, 'Trim ray should hit trim flange');
  assert.equal(trimHits[0].object.name, 'Downlight_DownlightTrim');
  assert.ok(Math.abs(trimHits[0].point.y - (-0.015)) < 0.005, 'Trim flange should sit at bottom reveal');

  // Oblique ray entering the aperture and hitting the reflector bowl
  const obliqueOrigin = new THREE.Vector3(0.1, -0.4, 0);
  const obliqueTarget = new THREE.Vector3(-0.25, 0.1, 0);
  const obliqueDir = obliqueTarget.clone().sub(obliqueOrigin).normalize();
  const obliqueRay = new THREE.Raycaster(obliqueOrigin, obliqueDir);
  const obliqueHits = obliqueRay.intersectObjects(gltf.scene.children, true);
  assert.ok(obliqueHits.some(h => h.object.name === 'Downlight_DownlightReflector'), 'Oblique view must hit reflector bowl');
});
