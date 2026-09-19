import test from 'node:test';
import assert from 'node:assert/strict';
import { exitReturnLayout } from '../src/exit-return-layout.ts';
import { validateLayout } from '../src/layout-validator.ts';

test('exit counter fits small and large chain rooms, preserving a wall-side staff aisle',()=>{
  for(const width of [40,48,64,80])for(const doorW of [3,3.2,4]){
    const vest={xL:6,frontZ:15,sideDoorZ:15-1.5*doorW+.4,doorW,hasChamber:true};
    const f=exitReturnLayout(width,vest);assert.ok(f);
    assert.deepEqual(validateLayout([f],{minX:11-width/2,maxX:11+width/2,minZ:-60,maxZ:15}),[]);
    const left=f.cx-f.w*Math.cos(f.yaw)/2-f.d*Math.abs(Math.sin(f.yaw))/2;
    assert.ok(left-(11-width/2)>3,'staff access at the free end');
  }
});
test('a storefront-door shop does not acquire a chain exit counter',()=>{
  assert.equal(exitReturnLayout(24,{xL:8,frontZ:15,sideDoorZ:15,doorW:3,hasChamber:false}),null);
});
