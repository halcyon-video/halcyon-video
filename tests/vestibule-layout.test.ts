import test from 'node:test';
import assert from 'node:assert/strict';
import { vestibuleLayout, counterDatumShift, vestibuleSide, clampVestibuleSide } from '../src/vestibule-layout.ts';
import { exitReturnLayout, exitReturnSegments } from '../src/exit-return-layout.ts';

test('deeper vestibule provides wider front panels and carries checkout inward', () => {
  for (const doorWidth of [3, 3.2, 4]) {
    const spec={doorWidth,entryStyle:'vestibule' as const}, v=vestibuleLayout(spec);
    assert.ok(Math.abs(v.depth - 2*doorWidth - 2.4)<1e-8);
    assert.ok(v.frontPanelDepth > doorWidth);
    assert.ok(Math.abs(v.sideDoorZ+doorWidth/2+v.frontPanelDepth-15)<1e-8);
    assert.ok(Math.abs(counterDatumShift(spec)-(v.backZ-8.6))<1e-8);
  }
  assert.equal(vestibuleLayout({doorWidth:3,entryStyle:'storefront-door'}).depth,0);
});
test('open return end retains the back wall and a body-width side-door approach',()=>{
  for(const doorW of [3,3.2,4]) for(const storeWidth of [40,48,64,80]) {
    const v=vestibuleLayout({doorWidth:doorW,entryStyle:'vestibule'});
    const vest={xL:3.3,frontZ:15,sideDoorZ:v.sideDoorZ,doorW,hasChamber:true};
    const f=exitReturnLayout(storeWidth,vest)!; assert.ok(f);
    assert.ok(Math.abs(f.cx+f.w/2-(vest.xL-.15))<1e-8);
    const segments=exitReturnSegments(f);
    assert.ok(segments.some(p=>p.label==='structure:return-back'),'back wall remains');
    assert.ok(!segments.some(p=>p.label==='structure:return-right'),'vestibule side is open');
    // A person walks horizontally through the middle of the door without touching millwork.
    const radius=.5;
    for(let x=vest.xL-.6;x<=vest.xL+.5;x+=.1) for(const p of segments) {
      const dx=x-p.cx,dz=v.sideDoorZ-p.cz,c=Math.cos(p.yaw),s=Math.sin(p.yaw);
      const px=Math.abs(dx*c-dz*s),pz=Math.abs(dx*s+dz*c);
      assert.ok(px>=p.w/2+radius || pz>=p.d/2+radius,`${p.label} obstructs approach`);
    }
    // Both EAS bases lie within the enlarged chamber and beyond the door swing's Z envelope.
    for(const sign of [-1,1]) {
      const z=v.sideDoorZ+sign*(doorW/2+.55);
      assert.ok(z-.25>v.backZ && z+.25<15);
    }
  }
});

test('tapered doors meet checkout corners and their entire clear opening is walkable',()=>{
  for(const doorWidth of [3,3.2,4]) for(const side of [-1,1] as const) {
    const wall=vestibuleSide({doorWidth,entryStyle:'vestibule'},side);
    assert.equal(wall.x,11+side*6.2);
    assert.ok(Math.abs(wall.x+wall.sin*wall.length-(11+side*(9+2*doorWidth)/2))<1e-8);
    const point=(along:number,normal:number)=>({x:wall.x+along*wall.sin+normal*wall.cos,z:wall.z+along*wall.cos-normal*wall.sin});
    for(const offset of [-doorWidth/2+.5,0,doorWidth/2-.5]) {
      const next=point(wall.doorAlong+offset,.7),old=point(wall.doorAlong+offset,-.7);
      assert.deepEqual(clampVestibuleSide(next,old,wall,doorWidth,.4,.3),next);
    }
    const next=point(wall.length-1,.1),old=point(wall.length-1,-.7);
    const hit=clampVestibuleSide(next,old,wall,doorWidth,.4,.3);
    assert.ok(Math.abs((hit.x-wall.x)*wall.cos-(hit.z-wall.z)*wall.sin+.4)<1e-8);
  }
});

test('square checkout vestibule meets its wider rear corners',()=>{
  const spec={doorWidth:3.2,entryStyle:'vestibule' as const,counterShape:'usquare'};
  assert.equal(vestibuleSide(spec,-1).x,4.2);
  assert.equal(vestibuleSide(spec,1).x,17.8);
});
