import test from 'node:test';
import assert from 'node:assert/strict';
import { exitReturnLayout, exitReturnSegments } from '../src/exit-return-layout.ts';
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

test('enclosed return station leaves a usable staff entrance and sorting aisle',()=>{
  for(const width of [40,48,64,80]) {
    const f=exitReturnLayout(width,{xL:6,frontZ:15,sideDoorZ:10.6,doorW:3.2,hasChamber:true})!;
    const parts=exitReturnSegments(f);
    const occupied=(x:number,z:number)=>parts.some(p=>{
      const dx=x-p.cx,dz=z-p.cz,c=Math.cos(p.yaw),s=Math.sin(p.yaw);
      return Math.abs(dx*c-dz*s)<p.w/2 && Math.abs(dx*s+dz*c)<p.d/2;
    });
    // A continuous path from the open left end into the window-side work area.
    const back=f.cz+f.d/2;
    for(let x=-8.2;x<=-4.5;x+=.1) assert.equal(occupied(f.cx+x*f.w/15.5,back-3.25),false);
    assert.ok(parts.every(p=>Number.isFinite(p.yaw)));
    assert.ok(parts.some(p=>p.label.endsWith('window-worktop')));
  }
});
