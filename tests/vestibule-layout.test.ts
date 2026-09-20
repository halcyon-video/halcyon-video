import test from 'node:test';
import assert from 'node:assert/strict';
import { vestibuleLayout, counterDatumShift } from '../src/vestibule-layout.ts';
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
