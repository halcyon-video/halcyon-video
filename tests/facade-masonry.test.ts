import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mapFacadeUV } from '../src/facade-masonry.ts';
import { facadeEntryGlazing } from '../src/storefront-architecture.ts';
import { vestibuleHalfWidth } from '../src/store-layout.ts';

test('mortar courses meet across independently sized facade pieces', () => {
  for (const [w, h, d, y] of [[12, 8, .7, 4], [2, 18, 4.4, 9], [.7, 8, 45, 4]]) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    mapFacadeUV(geometry, new THREE.Vector3(11, y, 15));
    const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(n.getY(i)) > .5) continue;
      assert(Math.abs(uv.getY(i) - (p.getY(i) + y) / 4) < 1e-6, 'a wall or return must not stretch its courses');
    }
    geometry.dispose();
  }
});

test('both entry leaves clear the divider and fit behind the masonry opening', () => {
  const doorWidth = 3.2;
  for (const style of ['gabled-brick', 'flat-parapet', 'arcaded-brick'] as const) {
    const glazing = facadeEntryGlazing(doorWidth, style);
    assert(Math.abs(glazing.doorCenterOffset - doorWidth / 2 - glazing.dividerWidth / 2) < 1e-9);
    assert(glazing.doorCenterOffset + doorWidth / 2 < glazing.openingHalfWidth);
    assert(glazing.openingHalfWidth < vestibuleHalfWidth({ doorWidth, entryStyle: 'vestibule' }));
  }
});
