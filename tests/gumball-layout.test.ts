import test from 'node:test';
import assert from 'node:assert/strict';
import { gumballPlacement, GUMBALL_RADIUS } from '../src/fixtures/gumball-layout.ts';
import { validateLayout } from '../src/layout-validator.ts';
import type { Footprint } from '../src/layout-validator.ts';
import { vestibuleLayout } from '../src/vestibule-layout.ts';

const spec = { counterShape:'shield', entryStyle:'vestibule', doorWidth:3.2 } as const;
const shelf=(label:string,cx:number,cz:number,yaw=-Math.PI/2):Footprint=>({label,kind:'fixture',cx,cz,yaw,w:3,d:7.58});
test('deepest built games row wins; joined ends never host the machine',()=>{
  const deepWest=shelf('deep-west',26,.96),deepEast=shelf('deep-east',33.38,.96);
  const nearWest=shelf('near-west',26,7.92),nearEast=shelf('near-east',33.38,7.92);
  const shelves=[{footprint:nearEast,frontCap:false},{footprint:deepEast,frontCap:false},
    {footprint:nearWest,backCap:false},{footprint:deepWest,backCap:false}];
  const p=gumballPlacement(shelves,64,spec);
  assert.equal(p.options?.hostShelf,'deep-west');assert.ok(Math.abs(p.position.z-.96)<1e-8);
  assert.ok(p.position.x<deepWest.cx-deepWest.d/2);
  assert.ok(Math.sin(p.yaw)<0,'coin mechanism faces the open aisle beyond the shelf end');
  const fp:Footprint={label:'machine',kind:'structure',cx:p.position.x,cz:p.position.z,w:GUMBALL_RADIUS*2,d:GUMBALL_RADIUS*2,yaw:0};
  for(const s of shelves)assert.equal(validateLayout([fp,s.footprint],{minX:-1e5,maxX:1e5,minZ:-1e5,maxZ:1e5},{minWalkway:0}).some(v=>v.severity==='error'),false);
  assert.deepEqual(gumballPlacement([...shelves].reverse(),64,spec),p,'input ordering does not move the machine');
});
test('one wall shelf chooses the exposed end deeper in the store',()=>{
  const p=gumballPlacement([{footprint:shelf('wall',30,6.8,Math.PI)}],40,spec);
  assert.equal(p.options?.hostShelf,'wall');assert.ok(p.position.z<6.8);
  assert.ok(p.position.x+GUMBALL_RADIUS<=31);
});
test('diagonal games-only ends keep the conservative collision square clear',()=>{
  const f=shelf('diagonal',23,-14,Math.PI/4),p=gumballPlacement([{footprint:f}],64,spec);
  const fp:Footprint={label:'machine',kind:'structure',cx:p.position.x,cz:p.position.z,w:GUMBALL_RADIUS*2,d:GUMBALL_RADIUS*2,yaw:0};
  assert.equal(p.options?.hostShelf,'diagonal');assert.equal(validateLayout([fp,f],{minX:-1e5,maxX:1e5,minZ:-1e5,maxZ:1e5},{minWalkway:0}).some(v=>v.severity==='error'),false);
});
test('counter fallback tracks door depth and remains entranceward of the peak',()=>{
  for(const doorWidth of [3.2,4.2]){
    const s={...spec,doorWidth},p=gumballPlacement([],64,s);
    const apex=vestibuleLayout(s).backZ-.1-14.8;
    assert.equal(p.options?.placementRule,'counter-entrance');assert.equal(p.yaw,3*Math.PI/4);
    assert.ok(p.position.z>apex);assert.ok(p.position.x>11);
    // Outward distance to the diagonal face covers the proxy's projected half-size.
    assert.ok(((p.position.x-11)-(p.position.z-apex))*Math.SQRT1_2>GUMBALL_RADIUS*Math.SQRT2);
  }
});
test('alternate counters receive the fallback and retain 45-degree headings',()=>{
  for(const counterShape of ['shield','usquare','desk'] as const){
    const p=gumballPlacement([],28,{...spec,counterShape,entryStyle:'storefront-door'});
    assert.ok(Number.isFinite(p.position.x)&&Number.isFinite(p.position.z));
    assert.equal(p.yaw/(Math.PI/4),Math.round(p.yaw/(Math.PI/4)));
  }
});

// Customer standing points must lie beyond the coin face, away from its host.
test('both ends of an angled shelf expose the coin mechanism to open floor',()=>{
  for(const yaw of [0,Math.PI/4,Math.PI/2,-Math.PI/4]) for(const sign of [-1,1]){
    const f=shelf('host',22,-12,yaw);
    const p=gumballPlacement([{footprint:f,frontCap:sign===1,backCap:sign===-1}],64,spec);
    const front={x:Math.sin(p.yaw),z:Math.cos(p.yaw)};
    assert.ok(front.x*(p.position.x-f.cx)+front.z*(p.position.z-f.cz)>0);
    const a=p.options?.customerApproach as {x:number;z:number};
    const person:Footprint={label:'customer',kind:'structure',cx:a.x,cz:a.z,w:1,d:1,yaw:0};
    assert.equal(validateLayout([person,f],{minX:-1e5,maxX:1e5,minZ:-1e5,maxZ:1e5},{minWalkway:0}).some(v=>v.severity==='error'),false);
  }
});
test('counter fronts face the customer floor rather than the work surface',()=>{
  const shield=gumballPlacement([],64,spec);
  assert.ok(Math.sin(shield.yaw)>0&&Math.cos(shield.yaw)<0);
  const flat=gumballPlacement([],64,{...spec,counterShape:'usquare'});
  assert.ok(Math.cos(flat.yaw)<0);
  const desk=gumballPlacement([],28,{...spec,counterShape:'desk'});
  assert.ok(Math.sin(desk.yaw)>0);
});
