import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

test('shelf construction kit retains its stampable local profiles and complete UVs', async () => {
  const bytes = await readFile(new URL('../public/models/shelf-components.glb', import.meta.url));
  assert.ok(bytes.length < 110_000, 'kit grew from 78 KB to 105 KB with the three half parts; measured, not relaxed blindly');
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const names = ['Deck','Rail','Wire','Bracket','Slat','Upright','Spine','Standard','Foot','EndPanel','RailClip','RailEndStop','ClaspCarrier','ClaspJaw','EndPanelHalf','UprightHalf','FootHalf'];
  for (const name of names) {
    const mesh = scene.getObjectByName(name) as THREE.Mesh;
    assert.ok(mesh?.isMesh, 'runtime stamping requires ' + name);
    const g = mesh.geometry;
    for (const attr of ['position','normal','uv']) {
      const a = g.getAttribute(attr);
      assert.ok(a);
      assert.ok(Array.from(a.array).every(Number.isFinite));
    }
    g.computeBoundingBox();
    const b = g.boundingBox!;
    if (['EndPanelHalf','UprightHalf'].includes(name)) {
      assert.ok(Math.abs(b.min.y) < .001 && Math.abs(b.max.y - 5) < .001);
      assert.ok(b.min.x > -1e-6 && Math.abs(b.min.x) < 1e-6, name + ' must start at the cut plane, no negative-X geometry');
      const full = scene.getObjectByName(name.replace('Half', '')) as THREE.Mesh;
      full.geometry.computeBoundingBox();
      assert.ok(Math.abs(b.max.x - full.geometry.boundingBox!.max.x) < 1e-5, 'outer profile matches the full part');
    } else if (name === 'FootHalf') {
      assert.ok(Math.abs(b.min.y) < .00001 && Math.abs(b.max.y - .15) < .001);
      assert.ok(b.min.x > -1e-6 && Math.abs(b.min.x) < 1e-6, name + ' must start at the cut plane, no negative-X geometry');
      const full = scene.getObjectByName('Foot') as THREE.Mesh;
      full.geometry.computeBoundingBox();
      assert.ok(Math.abs(b.max.x - full.geometry.boundingBox!.max.x) < 1e-5, 'outer profile matches the full part');
    } else if (['Upright','Spine','EndPanel'].includes(name)) {
      assert.ok(Math.abs(b.min.y) < .201 && Math.abs(b.max.y-5) < .001);
      assert.ok(b.min.x < 0 && b.max.x > 0, 'spreading parts for editing must not change stamp-local coordinates');
    }
    if (name==='Deck') assert.ok(Math.abs(b.max.y-.02)<.00001,'stock support plane moved');
    if (name==='Foot') assert.ok(Math.abs(b.min.y)<.00001,'steel foot must sit on floor');
  }
});
