import { vestibuleLayout } from '../src/vestibule-layout.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { exitReturnLayout, exitReturnSegments } from '../src/exit-return-layout.ts';
import { validateLayout } from '../src/layout-validator.ts';

test('exit counter fits small and large chain rooms, preserving side-wall clearance',()=>{
  for(const width of [40,48,64,80])for(const doorW of [3,3.2,4]){
    const vest={xL:3.3,frontZ:15,sideDoorZ:vestibuleLayout({doorWidth:doorW,entryStyle:'vestibule'}).sideDoorZ,doorW,hasChamber:true};
    const f=exitReturnLayout(width,vest);assert.ok(f);
    assert.deepEqual(validateLayout([f],{minX:11-width/2,maxX:11+width/2,minZ:-60,maxZ:15}),[]);
    const left=f.cx-f.w*Math.cos(f.yaw)/2-f.d*Math.abs(Math.sin(f.yaw))/2;
    assert.ok(left-(11-width/2)>3,'clearance at the closed far end');
  }
});
test('a storefront-door shop does not acquire a chain exit counter',()=>{
  assert.equal(exitReturnLayout(24,{xL:8,frontZ:15,sideDoorZ:15,doorW:3,hasChamber:false}),null);
});

test('return station opens beside the vestibule and closes the opposite end',()=>{
  for(const width of [40,48,64,80]) for(const doorW of [3,3.2,4]) {
    const f=exitReturnLayout(width,{xL:3.3,frontZ:15,sideDoorZ:vestibuleLayout({doorWidth:doorW,entryStyle:'vestibule'}).sideDoorZ,doorW,hasChamber:true})!;
    const parts=exitReturnSegments(f);
    const occupied=(x:number,z:number)=>parts.some(p=>{
      const dx=x-p.cx,dz=z-p.cz,c=Math.cos(p.yaw),s=Math.sin(p.yaw);
      return Math.abs(dx*c-dz*s)<p.w/2 && Math.abs(dx*s+dz*c)<p.d/2;
    });
    // A three-foot-wide staff approach from the vestibule side into the sorting aisle.
    const back=f.cz+f.d/2;
    const sz=f.d/7.4;
    for(let x=4.6;x<=8.5;x+=.1) for(let z=-3.9;z<=-.9;z+=.1)
      assert.equal(occupied(f.cx+x*f.w/15.5,back+z),false,'vestibule-side opening stays clear');
    assert.equal(occupied(f.cx-7.75*f.w/15.5+.4,back-3.25*sz),true,'old far-end opening is closed');
    assert.equal(occupied(f.cx,back-.4),true,'back wall is retained');
    // Continue from the store floor along the vestibule into that same opening.
    for(let z=-8.5;z<=-2.8;z+=.1) for(let x=4.6;x<=7.5;x+=.1)
      assert.equal(occupied(f.cx+x*f.w/15.5,back+z*sz),false,'approach is not blocked by the clipped corner');
    assert.equal(parts.some(p=>p.label==='structure:return-right'||p.label==='structure:return-corner'),false);
    assert.ok(parts.every(p=>Number.isFinite(p.yaw)));
    assert.ok(parts.some(p=>p.label.endsWith('window-worktop')));
  }
});
