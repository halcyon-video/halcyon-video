import { test } from 'node:test';
import assert from 'node:assert/strict';
import { constrainWalkObstacles, constrainWalkPeople, SHOPPER_CLEARANCE } from '../src/walk-collision.ts';
import type { NavRect } from '../src/clerk-nav.ts';

const bin: NavRect = { label: 'fixture:bargain-bin', cx: 0, cz: 0, w: 4, d: 3, yaw: 0 };
const out = { x: 0, z: 0 };
test('fast walks cannot tunnel through a low display bin', () => {
  constrainWalkObstacles(-10, 0, 10, 0, [bin], out);
  assert.ok(out.x < -2.45 && out.x > -2.46);
  assert.equal(out.z, 0);
});
test('diagonal contact slides along the fixture instead of stopping movement', () => {
  constrainWalkObstacles(-5, -1, 0, 1, [bin], out);
  assert.ok(out.x < -2.45);
  assert.ok(Math.abs(out.z - 1) < 1e-6);
});
test('rotated shelving uses its own axes, not an oversized world box', () => {
  const angle = Math.PI / 4, c = Math.cos(angle), s = Math.sin(angle);
  const shelf = { ...bin, yaw: angle };
  constrainWalkObstacles(-10*c, 10*s, 10*c, -10*s, [shelf], out);
  assert.ok(Math.abs(out.x*c-out.z*s+2.45)<1e-4);
  assert.ok(Math.abs(out.x*s+out.z*c)<1e-4);
});
test('the hollow vestibule mask does not obstruct the real door passage', () => {
  const vestibule = { ...bin, label: 'structure:vestibule' };
  constrainWalkObstacles(-5,0,5,0,[vestibule],out);
  assert.deepEqual(out,{x:5,z:0});
});
test('a checkpoint inside a fixture can escape and clear walking is unchanged', () => {
  constrainWalkObstacles(0,0,0,0,[bin],out);
  assert.ok(Math.abs(out.z)>1.95);
  constrainWalkObstacles(-5,5,5,5,[bin],out);
  assert.deepEqual(out,{x:5,z:5});
});
test('repeated movement stays outside joined fixture footprints', () => {
  const wall = { ...bin, cx: 3, w: 2, d: 8 };
  let x=-4,z=-3;
  for(let i=0;i<120;i++){
    constrainWalkObstacles(x,z,x+.1,z+.08,[bin,wall],out); x=out.x;z=out.z;
    for(const rect of [bin,wall]) assert.ok(Math.abs(x-rect.cx)>=rect.w/2+.449 || Math.abs(z-rect.cz)>=rect.d/2+.449);
  }
});

test('start-inside recovery beside a wall chooses the free shop side', () => {
  const wallBin={...bin,cx:2};
  const bounds={minX:1.5,maxX:20,minZ:-10,maxZ:10};
  constrainWalkObstacles(1.6,0,1.6,0,[wallBin],out,.45,bounds);
  assert.ok(out.x>=bounds.minX && out.x<=bounds.maxX);
  assert.ok(Math.abs(out.x-wallBin.cx)>=2.45 || Math.abs(out.z)>=1.95);
});

test('recovery from a joined concession cabinet exits the whole angled run', () => {
  const yaw=Math.PI/4,c=Math.cos(yaw),s=Math.sin(yaw);
  const popcorn={...bin,w:2.2,d:2.2,yaw};
  const cooler={...bin,cx:3.2*c,cz:-3.2*s,w:4.2,d:2.6,yaw};
  constrainWalkObstacles(2.1*c,-2.1*s,0,0,[popcorn,cooler],out);
  for(const rect of [popcorn,cooler]) {
    const x=(out.x-rect.cx)*c-(out.z-rect.cz)*s,z=(out.x-rect.cx)*s+(out.z-rect.cz)*c;
    assert.ok(Math.abs(x)>=rect.w/2+.449 || Math.abs(z)>=rect.d/2+.449);
  }
});

test('walking straight at a standing shopper stops at arm\'s length', () => {
  const shopper = { x: 0, z: 0, active: true };
  let x = -5, z = 0;
  for (let i = 0; i < 80; i++) { constrainWalkPeople(x, z, x + .1, z, [shopper], out); x = out.x; z = out.z; }
  assert.ok(Math.abs(Math.hypot(x, z) - SHOPPER_CLEARANCE) < 1e-6);
});
test('a glancing step past a shopper slides around instead of stopping', () => {
  constrainWalkPeople(-1.8, .5, -1.2, .5, [{ x: 0, z: 0, active: true }], out);
  assert.ok(Math.abs(Math.hypot(out.x, out.z) - SHOPPER_CLEARANCE) < 1e-6);
  assert.ok(out.x > -1.8);
});
test('a shopper on top of the visitor never blocks walking away, and absent shoppers never block', () => {
  constrainWalkPeople(.2, 0, .4, 0, [{ x: 0, z: 0, active: true }], out);
  assert.deepEqual(out, { x: .4, z: 0 });
  constrainWalkPeople(.4, 0, .2, 0, [{ x: 0, z: 0, active: true }], out);
  assert.deepEqual(out, { x: .4, z: 0 });
  constrainWalkPeople(-5, 0, 0, 0, [{ x: 0, z: 0, active: false }], out);
  assert.deepEqual(out, { x: 0, z: 0 });
});
