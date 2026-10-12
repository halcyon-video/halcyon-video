import { vestibuleLayout } from '../src/vestibule-layout.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { exitReturnLayout, exitReturnSegments, RETURN_WINDOW_CLEARANCE } from '../src/exit-return-layout.ts';
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
    const back=f.cz+f.d/2-.18;
    const sz=f.w/15.5;
    for(let x=4.6;x<=8.5;x+=.1) for(let z=-5.4;z<=-3.5;z+=.1)
      assert.equal(occupied(f.cx+x*f.w/15.5,back+z),false,'vestibule-side opening stays clear');
    assert.equal(occupied(f.cx-7.75*f.w/15.5+.4,back-3.25*sz),true,'old far-end opening is closed');
    assert.equal(occupied(f.cx,back-.4),true,'back wall is retained');
    // Continue from the store floor along the vestibule into that same opening.
    for(let z=-8.5;z<=-3.5;z+=.1) for(let x=4.6;x<=7.5;x+=.1)
      assert.equal(occupied(f.cx+x*f.w/15.5,back+z*sz),false,'approach is not blocked by the clipped corner');
    assert.equal(parts.some(p=>p.label==='structure:return-right'||p.label==='structure:return-corner'),false);
    assert.ok(parts.every(p=>Number.isFinite(p.yaw)));
    assert.ok(parts.some(p=>p.label.endsWith('window-worktop')));
    assert.ok(parts.some(p=>p.label.endsWith('outer-angle') && Math.abs(p.yaw)>.5));
    assert.ok(parts.some(p=>p.label.endsWith('front-angle') && Math.abs(p.yaw)>.5));
  }
});

test('returned tape stacks sit cleanly on worktops and clear counter walls', () => {
  const CASE_W = 0.44, CASE_L = 0.73;
  const positions = [
    [-2.7,-1.92],[-1.8,-1.88],[-.4,-1.94],[.48,-1.90],[2.15,-1.91],
    [-5.25,-6.15],[-4.10,-7.30],[-2.95,-8.45],[-.88,-8.38],[.02,-7.6],[.73,-6.84],[1.37,-6.2]
  ];
  const rots = [-.12,.08,-.035,.17,-.08,.65,.81,.72,-.72,-.88,-.7,-.8];

  for (const width of [40, 48, 64, 80]) {
    for (const doorW of [3, 3.2, 4]) {
      const vest = {
        xL: 3.3,
        frontZ: 15,
        sideDoorZ: vestibuleLayout({ doorWidth: doorW, entryStyle: 'vestibule' }).sideDoorZ,
        doorW,
        hasChamber: true
      };
      const f = exitReturnLayout(width, vest);
      if (!f) continue;
      const parts = exitReturnSegments(f);
      const walls = parts.filter(p => !p.label.includes('worktop'));

      for (let i = 0; i < positions.length; i++) {
        const [xRel, zRel] = positions[i];
        const rotY = rots[i];
        const x = f.cx + xRel * f.w / 15.5;
        const z = f.cz + f.d / 2 - .18 + zRel * f.w / 15.5;

        const c = Math.cos(rotY), s = Math.sin(rotY);
        const halfW = CASE_W / 2, halfL = CASE_L / 2;
        const corners = [
          [-halfW, -halfL],
          [halfW, -halfL],
          [halfW, halfL],
          [-halfW, halfL]
        ].map(([dx, dz]) => [x + dx * c - dz * s, z + dx * s + dz * c]);

        for (const w of walls) {
          const wc = Math.cos(w.yaw), ws = Math.sin(w.yaw);
          for (const [cx, cz] of corners) {
            const dx = cx - w.cx, dz = cz - w.cz;
            const u = dx * wc - dz * ws;
            const v = dx * ws + dz * wc;
            assert.ok(
              Math.abs(u) >= w.w / 2 || Math.abs(v) >= w.d / 2,
              `Stack ${i} should clear ${w.label} at width=${width}, doorW=${doorW}`
            );
          }
        }
      }
    }
  }
});

test('white window worktop clears the glass at every supported room width',()=>{
  for(const width of [40,48,64,80]) {
    const f=exitReturnLayout(width,{xL:3.3,frontZ:15,sideDoorZ:10,doorW:3.2,hasChamber:true})!;
    const parts=exitReturnSegments(f);
    assert.ok(!parts.some(p=>p.label.endsWith('back')||p.label.endsWith('vestibule-stub')));
    const worktop=parts.find(p=>p.label.endsWith('window-worktop'))!;
    const rear=worktop.cz+Math.abs(Math.cos(worktop.yaw))*worktop.d/2+Math.abs(Math.sin(worktop.yaw))*worktop.w/2;
    assert.ok(Math.abs(rear-(15-RETURN_WINDOW_CLEARANCE))<1e-9,'scaled counter must preserve its window clearance');
  }
});
