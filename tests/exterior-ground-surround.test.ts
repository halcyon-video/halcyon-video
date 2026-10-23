import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { parkingLayout, roadSpan } from '../src/parking-layout.ts';
import { groundSurroundGeometry, SURROUND_OPAQUE_RADIUS, SURROUND_FADE_RADIUS } from '../src/exterior-ground-surround.ts';

const origin = { x: 11, z: 16 }; // exterior-panorama.ts: STORE_CENTER_X, FRONT_GLASS_Z + 1

for (const width of [44, 68, 89.7, 104]) {
  test(`every modeled ground edge of a ${width} ft store sits on opaque surround`, () => {
    const p = parkingLayout(width, 6.7, -47.25);
    const street = roadSpan(p.minX, p.maxX, p.streetZ);
    // Outer corners of the side/rear planted strips and the far verge (parking-lot.ts).
    const corners = [[p.minX - 10, p.rearZ - 10], [p.maxX + 10, p.rearZ - 10],
      [street.minX, p.streetZ - 5], [street.maxX, p.streetZ - 5],
      [street.minX, street.farZ + 15], [street.maxX, street.farZ + 15]];
    for (const [x, z] of corners) {
      assert.ok(Math.hypot(x - origin.x, z - origin.z) < SURROUND_OPAQUE_RADIUS, `(${x.toFixed(1)}, ${z.toFixed(1)}) inside the opaque disc`);
    }
  });
}

test('the surround faces up and fades to nothing inside the level projected floor', () => {
  const g = groundSurroundGeometry({ centerX: origin.x, centerZ: origin.z, opaqueRadius: SURROUND_OPAQUE_RADIUS,
    fadeRadius: SURROUND_FADE_RADIUS, y: -.12, tileSize: 8 });
  assert.ok(SURROUND_FADE_RADIUS < 600 / 1.5, 'fade completes before GroundedSkybox curves the floor up');
  const pos = g.getAttribute('position'), color = g.getAttribute('color'), index = g.getIndex()!;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(pos, index.getX(i)); b.fromBufferAttribute(pos, index.getX(i + 1)); c.fromBufferAttribute(pos, index.getX(i + 2));
    assert.ok(b.sub(a).cross(c.sub(a)).y > 0, 'triangle faces the sky');
  }
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i) - origin.x, pos.getZ(i) - origin.z);
    const expected = r > SURROUND_OPAQUE_RADIUS + 1 ? 0 : 1;
    assert.equal(color.getW(i), expected, `alpha at r=${r.toFixed(0)}`);
  }
});

test('the rim samples the panorama column GroundedSkybox shows on each bearing', async () => {
  const { GroundedSkybox } = await import('three/examples/jsm/objects/GroundedSkybox.js');
  const { PANORAMA_ROTATION_Y } = await import('../src/exterior-panorama-profile.ts');
  const { panoramaU } = await import('../src/exterior-ground-surround.ts');
  const sky = new GroundedSkybox(new THREE.Texture(), 5.5, 600, 16);
  sky.rotation.y = PANORAMA_ROTATION_Y; sky.updateMatrixWorld(true);
  const pos = sky.geometry.getAttribute('position'), uv = sky.geometry.getAttribute('uv'), v = new THREE.Vector3();
  let checked = 0;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (Math.abs(v.y) > 1e-6) continue;
    v.applyMatrix4(sky.matrixWorld);
    const u = panoramaU(Math.atan2(v.z, v.x), PANORAMA_ROTATION_Y), expected = uv.getX(i) % 1;
    assert.ok(Math.min(Math.abs(u - expected), 1 - Math.abs(u - expected)) < 1e-6, `u ${u} vs ${expected}`);
    checked++;
  }
  assert.ok(checked >= 32, 'horizon ring checked');
  assert.equal(panoramaU(Math.PI / 2, PANORAMA_ROTATION_Y), .5, 'the street (+z) is the photograph centre');
});
