import test from 'node:test';
import assert from 'node:assert/strict';
import quickDrop from '../src/exit-return-spec.json' with { type: 'json' };
import { vestibuleLayout, counterDatumShift, vestibuleSide, vestibuleStraightSide, vestibuleFrontHalf, clampVestibuleSide, vestibuleExitGates } from '../src/vestibule-layout.ts';
import { exitReturnLayout, exitReturnSegments, RETURN_WINDOW_CLEARANCE } from '../src/exit-return-layout.ts';

test('vestibule matches the straight side panel to the door width and shares the checkout datum', () => {
  for (const doorWidth of [3, 3.2, 4]) {
    const spec={doorWidth,entryStyle:'vestibule' as const}, v=vestibuleLayout(spec);
    assert.ok(Math.abs(vestibuleStraightSide(spec,1).length-doorWidth)<1e-8);
    assert.ok(v.frontPanelDepth > 0);
    assert.ok(Math.abs(v.sideDoorZ+doorWidth/2+v.frontPanelDepth-15)<1e-8);
    assert.ok(Math.abs(counterDatumShift(spec)-(v.backZ-8.6))<1e-8);
  }
  assert.equal(vestibuleLayout({doorWidth:3,entryStyle:'storefront-door'}).depth,0);
});
test('open return end retains the back wall and a body-width side-door approach',()=>{
  for(const doorW of [3,3.2,4]) for(const storeWidth of [40,48,64,80]) {
    const spec={doorWidth:doorW,entryStyle:'vestibule' as const};
    const wall=vestibuleSide(spec,-1);
    const vest={xL:11-vestibuleFrontHalf(spec),frontZ:15,sideDoorZ:wall.doorZ,doorW,hasChamber:true};
    const f=exitReturnLayout(storeWidth,vest)!; assert.ok(f);
    assert.ok(Math.abs(f.cx+f.w/2-(vest.xL-.15))<1e-8);
    const segments=exitReturnSegments(f);
    const rear=segments.find(p=>p.label==='structure:return-window-worktop');
    assert.ok(rear,'white window-side enclosure remains');
    assert.ok(Math.abs(rear.cz+rear.d/2-(vest.frontZ-RETURN_WINDOW_CLEARANCE))<1e-8,'rear worktop keeps the fixed clearance off the glazing');
    assert.ok(!segments.some(p=>p.label==='structure:return-right'),'vestibule side is open');
    // Follow the angled doorway normal, testing a body-width approach.
    for(let normal=-2;normal<=1.5;normal+=.1) for(const p of segments) {
      const x=wall.doorX+normal*wall.cos, z=wall.doorZ-normal*wall.sin;
      const dx=x-p.cx,dz=z-p.cz,c=Math.cos(p.yaw),s=Math.sin(p.yaw);
      assert.ok(Math.abs(dx*c-dz*s)>=p.w/2+.5 || Math.abs(dx*s+dz*c)>=p.d/2+.5,
        `${p.label} obstructs angled door approach`);
    }
    // Sensors frame the actual angled exit leaf, clear of the returns millwork.
    for(const gate of vestibuleExitGates(spec)) {
      const dx=gate.x-wall.doorX,dz=gate.z-wall.doorZ;
      assert.ok(dx*wall.cos-dz*wall.sin < -1,'outside the glass');
      assert.ok(Math.abs(dx*wall.sin+dz*wall.cos)>doorW/2+.5,'outside leaf sweep');
      for(const p of segments) {
        const x=gate.x-p.cx,z=gate.z-p.cz,c=Math.cos(p.yaw),s=Math.sin(p.yaw);
        assert.ok(Math.abs(x*c-z*s)>p.w/2+.6 || Math.abs(x*s+z*c)>p.d/2+.6,
          `${p.label} obstructs sensor base`);
      }
    }
  }
});

test('clipped-corner doors meet checkout corners and their entire clear opening is walkable',()=>{
  for(const doorWidth of [3,3.2,4]) for(const side of [-1,1] as const) {
    const spec={doorWidth,entryStyle:'vestibule' as const};
    const wall=vestibuleSide(spec,side), straight=vestibuleStraightSide(spec,side);
    assert.equal(wall.x,11+side*6.2);
    assert.equal(wall.doorWidth,doorWidth,'side leaf keeps the specified door width');
    assert.ok(Math.abs((wall.doorAlong-wall.doorWidth/2)-1)<1e-8,
      'one-foot fixed panel separates the leaf from the counter corner');
    assert.ok(Math.abs(wall.x+wall.sin*wall.length-(11+side*vestibuleFrontHalf(spec)))<1e-8);
    const point=(along:number,normal:number)=>({x:wall.x+along*wall.sin+normal*wall.cos,z:wall.z+along*wall.cos-normal*wall.sin});
    for(const offset of [-wall.doorWidth/2+.35,0,wall.doorWidth/2-.35]) {
      const next=point(wall.doorAlong+offset,.7),old=point(wall.doorAlong+offset,-.7);
      assert.deepEqual(clampVestibuleSide(next,old,wall,doorWidth,.4,.3),next);
    }
    assert.ok(Math.abs(straight.length-doorWidth)<1e-8);
    assert.ok(Math.abs(Math.abs(wall.sin/wall.cos)-1)<1e-8);
    assert.ok(Math.abs(straight.z+straight.length-15)<1e-8);
    const next=point(.1,.1),old=point(.1,-.7);
    const hit=clampVestibuleSide(next,old,wall,doorWidth,.4,.3);
    assert.ok(Math.abs((hit.x-wall.x)*wall.cos-(hit.z-wall.z)*wall.sin+.4)<1e-8);
    const solid={x:straight.x+.1,z:straight.z+straight.length/2};
    assert.equal(clampVestibuleSide(solid,{x:straight.x-.7,z:solid.z},straight,doorWidth,.4,.3).x,straight.x-.4);
  }
});

test('square checkout vestibule meets its wider rear corners',()=>{
  const spec={doorWidth:3.2,entryStyle:'vestibule' as const,counterShape:'usquare'};
  assert.equal(vestibuleSide(spec,-1).x,4.2);
  assert.equal(vestibuleSide(spec,1).x,17.8);
});

test('floor-plan rotations stay wall-aligned or at 45 degrees at every supported size',()=>{
  for(const doorWidth of [3,3.2,4]) for(const storeWidth of [40,48,64,80]) {
    const spec={doorWidth,entryStyle:'vestibule' as const};
    const wall=vestibuleSide(spec,-1);
    const f=exitReturnLayout(storeWidth,{xL:11-vestibuleFrontHalf(spec),frontZ:15,
      sideDoorZ:wall.doorZ,doorW:doorWidth,hasChamber:true})!;
    for(const part of [wall,...exitReturnSegments(f),...vestibuleExitGates(spec)]) {
      const steps=part.yaw/(Math.PI/4);
      assert.ok(Math.abs(steps-Math.round(steps))<1e-8,JSON.stringify(part));
    }
    assert.ok(Math.abs(f.w/15.5-(f.d-quickDrop.glassOffset)/11.5)<1e-8,'no nonuniform model scaling');
  }
});

test('vestibule exit door hinges at the outer jamb and swings outward into the vestibule chamber', () => {
  for (const doorWidth of [3, 3.2, 4]) {
    const spec = { doorWidth, entryStyle: 'vestibule' as const };
    const wall = vestibuleSide(spec, -1);
    // Hinge is at the outer corner (wall.length) where diagonal meets the straight side glazing.
    const hingeAlong = wall.doorAlong + wall.doorWidth / 2;
    assert.ok(Math.abs(hingeAlong - wall.length) < 1e-8, 'exit door hinges at the outer frame');

    // Moving latch leaf edge extends toward the counter (along = wall.doorAlong - wall.doorWidth / 2).
    const closedAlong = wall.doorAlong - wall.doorWidth / 2;
    assert.ok(Math.abs(closedAlong - 1) < 1e-8, 'closed latch sits 1ft from the checkout corner');

    // Swing angle of -1.4 rad swings the leaf into the vestibule (positive normal, positive world Z).
    const openAngle = -1.4;
    const openNormal = -wall.doorWidth * Math.sin(openAngle);
    assert.ok(openNormal > 0, 'exit leaf swings inward to the vestibule chamber, not into the sales floor');

    const closedZ = wall.z + closedAlong * wall.cos;
    const localAlong = -wall.doorWidth * Math.cos(openAngle);
    const openAlong = hingeAlong + localAlong;
    const openX = wall.x + openAlong * wall.sin + openNormal * wall.cos;
    const openZ = wall.z + openAlong * wall.cos - openNormal * wall.sin;

    assert.ok(openZ > closedZ + 1, 'exit door swings forward toward vestibule front');
    const normal = (openX - wall.x) * wall.cos - (openZ - wall.z) * wall.sin;
    assert.ok(normal > 1, 'open latch rests inside vestibule envelope');
  }
});
