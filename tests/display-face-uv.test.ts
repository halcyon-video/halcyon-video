import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mapDisplayFaceUVs } from '../src/fixtures/display-face-uv.ts';

test('separate strips sample their own part of one upright board', () => {
  const root = new THREE.Group(); root.position.set(20, 9, 5); root.rotation.y = Math.PI;
  const material = new THREE.MeshBasicMaterial(); material.name = 'TrackStripFace';
  const strips = [0, 1].map(y => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 1), material);
    mesh.position.y = y; root.add(mesh); return mesh;
  });
  const posterMat = new THREE.MeshBasicMaterial(); posterMat.name = 'PosterFace';
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), posterMat); poster.position.x = 3; root.add(poster);
  mapDisplayFaceUVs(root, ['TrackStripFace', 'PosterFace']);
  const range = (mesh: THREE.Mesh) => {
    const uv = mesh.geometry.getAttribute('uv');
    const v = Array.from({length:uv.count}, (_,i) => uv.getY(i));
    return [Math.min(...v), Math.max(...v)];
  };
  assert.deepEqual(range(strips[0]), [0, .5]);
  assert.deepEqual(range(strips[1]), [.5, 1]);
  assert.deepEqual(range(poster), [0, 1]);
  assert.equal(strips[0].geometry.getAttribute('uv').getX(0), 0);
  assert.equal(strips[0].geometry.getAttribute('uv').getY(0), .5);
});
