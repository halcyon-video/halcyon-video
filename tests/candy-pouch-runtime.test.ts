import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { candyPouchRows, rackPouchMatrix, gondolaPouchMatrix } from '../src/fixtures/candy-pouch.ts';

test('only proved public rack rows and dimensions receive hanging bags', () => {
  const labels = ['CHOCO BARS','GUMMY BEARS','POPCORN','MOVIE MINTS','SOUR RIBBONS'];
  assert.deepEqual(candyPouchRows(labels,3,1.6,5),[1,2,4]);
  for(const [w,d,r] of [[2.5,1.6,5],[3,2,5],[3,1.6,6]]) assert.deepEqual(candyPouchRows(labels,w,d,r),[]);
  assert.deepEqual(candyPouchRows([],3,1.6,5),[]);
  const custom = [...labels];custom[1]='CUSTOM TREATS';
  assert.deepEqual(candyPouchRows(custom,3,1.6,5),[2,4]);
  assert.deepEqual(candyPouchRows([...labels].reverse(),3,1.6,5),[2]);
});

test('rack bag hole and wire load coincide on proved mounts, inside the footprint', () => {
  for(const row of [1,2,4]) for(let facing=0;facing<6;facing++) {
    const matrix=rackPouchMatrix(row,facing);
    const rest=new THREE.Vector3(0,7/12-.0285,0).applyMatrix4(matrix);
    const peg=new THREE.Matrix4().makeRotationY(Math.PI).setPosition((facing-2.5)*.45,.615+row*.7+.5636862691031603,0);
    const load=new THREE.Vector3(0,-.01385293577,.18).applyMatrix4(peg);
    assert.ok(rest.distanceTo(load)<1e-8);
    const bottom=new THREE.Vector3().applyMatrix4(matrix);
    assert.ok(bottom.y>.6+row*.7);
    assert.ok(Math.abs(bottom.x)+.21<1.5);
    assert.ok(Math.abs(bottom.z)+.075<.8);
    assert.ok(new THREE.Vector3(0,0,1).transformDirection(matrix).z<-.99);
    if(facing<5){const next=new THREE.Vector3().applyMatrix4(rackPouchMatrix(row,facing+1));assert.ok(next.x-bottom.x>.42);}
  }
});

test('gondola full pouch mounts reach the long peg and remain in original envelope', () => {
  for(let tier=0;tier<2;tier++) for(let facing=0;facing<7;facing++) {
    const matrix=gondolaPouchMatrix(tier,facing);
    const rest=new THREE.Vector3(0,.72-.0285,0).applyMatrix4(matrix);
    const peg=new THREE.Matrix4().makeTranslation((facing-3)*.53,3.2+tier+.77535293577,-.65);
    const load=new THREE.Vector3(0,-.01385293577,.75).applyMatrix4(peg);
    assert.ok(rest.distanceTo(load)<1e-8);
    const bottom=new THREE.Vector3().applyMatrix4(matrix);
    assert.ok(Math.abs(bottom.x)+.25<=2);
    assert.ok(bottom.y+.72<=5);
    assert.ok(Math.abs(bottom.z)+.1<=.8);
    assert.ok(new THREE.Vector3(0,0,1).transformDirection(matrix).z>.99);
  }
});

test('slatwall wing bags ride their hook wire, face the aisle and stay inside the wing footprint', async () => {
  const { slatwallHookMatrix, slatwallPouchMatrix, SLATWALL_WING } = await import('../src/fixtures/candy-pouch.ts');
  const outer = SLATWALL_WING.endX + SLATWALL_WING.board + SLATWALL_WING.reach;
  for (let tier = 0; tier < 4; tier++) for (let column = 0; column < 2; column++) {
    const hook = slatwallHookMatrix(tier, column);
    // Wire root is .06 ft below a .25-ft slot pitch starting at .5 ft.
    const slot = new THREE.Vector3(0, .06, 0).applyMatrix4(hook).y;
    assert.ok(Math.abs((slot - .5) / .25 - Math.round((slot - .5) / .25)) < 1e-9);
    const boxes: THREE.Box3[] = [];
    for (const [slotIndex, load] of [.40, .62].entries()) {
      const bag = slatwallPouchMatrix(tier, column, slotIndex);
      const rest = new THREE.Vector3(0, .72 - .0285, 0).applyMatrix4(bag);
      assert.ok(rest.distanceTo(new THREE.Vector3(0, 0, load).applyMatrix4(hook)) < 1e-9);
      assert.ok(new THREE.Vector3(0, 0, 1).transformDirection(bag).x > .99);
      const box = new THREE.Box3(new THREE.Vector3(-.25, 0, -.1), new THREE.Vector3(.25, .72, .1)).applyMatrix4(bag);
      assert.ok(box.min.x > SLATWALL_WING.endX + SLATWALL_WING.board && box.max.x < outer);
      assert.ok(Math.abs(box.min.z) <= SLATWALL_WING.halfDepth && Math.abs(box.max.z) <= SLATWALL_WING.halfDepth);
      assert.ok(box.min.y > .4 && box.max.y < 5);
      for (const other of boxes) assert.ok(!box.clone().expandByScalar(-1e-6).intersectsBox(other));
      boxes.push(box);
    }
  }
  // Tiers clear each other vertically and columns horizontally.
  const top = (t: number) => new THREE.Vector3(0, .72, 0).applyMatrix4(slatwallPouchMatrix(t, 0, 1)).y;
  const bottom = (t: number) => new THREE.Vector3().applyMatrix4(slatwallPouchMatrix(t, 0, 1)).y;
  for (let t = 0; t < 3; t++) assert.ok(bottom(t + 1) - top(t) > .2);
  const gap = new THREE.Vector3(.25, 0, 0).applyMatrix4(slatwallPouchMatrix(0, 0, 0)).z;
  assert.ok(gap < new THREE.Vector3(-.25, 0, 0).applyMatrix4(slatwallPouchMatrix(0, 1, 0)).z);
});
