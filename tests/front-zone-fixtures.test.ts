import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as THREE from 'three';
import { prepareRetailModel } from '../src/fixtures/retail-model.ts';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { frontRefreshmentPlacements, placeFloorSaleTable } from '../src/floor-merchandising.ts';
import { RETAIL_FIXTURE_SPECS, retailFixtureFootprint, type RetailFixtureKind } from '../src/retail-fixture-specs.ts';
import { validateLayout, type Footprint } from '../src/layout-validator.ts';

const kinds = Object.keys(RETAIL_FIXTURE_SPECS) as RetailFixtureKind[];
for (const kind of kinds) test(`${kind}: real export fits collider, has normals/UVs and bounded resources`, async () => {
  const bytes = readFileSync(new URL(`../public/models/${kind}.glb`, import.meta.url));
  const metrics = JSON.parse(readFileSync(new URL(`../tools/models/${kind}-metrics.json`, import.meta.url), 'utf8'));
  assert.equal(bytes.length, metrics.glbBytes); assert.ok(bytes.length < 1_300_000);
  assert.ok(existsSync(new URL(`../tools/models/${kind}.blend`, import.meta.url)));
  assert.ok(existsSync(new URL(`../tools/models/${kind}.py`, import.meta.url)));
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  if (kind === 'rotating-merchandiser') scene.position.y = -.055;
  const bounds = new THREE.Box3().setFromObject(scene), spec = RETAIL_FIXTURE_SPECS[kind];
  assert.ok(bounds.min.x >= -spec.w / 2 - 1e-5 && bounds.max.x <= spec.w / 2 + 1e-5);
  assert.ok(bounds.min.z >= -spec.d / 2 - 1e-5 && bounds.max.z <= spec.d / 2 + 1e-5);
  assert.ok(Math.abs(bounds.min.y) < 1e-5 && bounds.max.y <= spec.h + 1e-5);
  let transparentBefore = 0;
  scene.traverse(o => { if (o instanceof THREE.Mesh && !Array.isArray(o.material) && o.material.transparent) transparentBefore++; });
  prepareRetailModel(scene);
  const mergedBounds = new THREE.Box3().setFromObject(scene);
  assert.ok(mergedBounds.min.distanceTo(bounds.min) < 1e-5 && mergedBounds.max.distanceTo(bounds.max) < 1e-5, 'batching preserves installed geometry bounds');
  let triangles = 0, draws = 0, transparentAfter = 0;
  scene.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    if (!Array.isArray(o.material) && o.material.transparent) transparentAfter++;
    draws++; triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
    for (const attribute of ['position', 'normal', 'uv']) {
      const a = o.geometry.getAttribute(attribute);
      assert.ok(a && Array.from(a.array).every(Number.isFinite));
      assert.equal(a.count, o.geometry.attributes.position.count);
    }
    o.geometry.dispose();
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
  });
  assert.equal(transparentAfter, transparentBefore, 'glass panes keep independent sorting');
  assert.equal(triangles, metrics.triangles);
  // Cooler retains 24 transparent bottles and two door panes for sorting.
  assert.ok(triangles < 18000 && draws <= (kind === 'two-door-cooler' ? 40 : 25));
});

const checkout: Footprint = { label: 'checkout approach', kind: 'structure', cx: 11, cz: 4.5, w: 23, d: 21, yaw: 0 };
for (const width of [28,42,62,90]) test(`front run follows a ${width}-foot store without blocking checkout`,()=>{
  const bounds={minX:11-width/2,maxX:11+width/2,minZ:-60,maxZ:15};
  const plan=frontRefreshmentPlacements([checkout],bounds);
  const footprints=plan.map(p=>p.kind==='bargain-bin'
    ? {label:p.id,kind:'fixture' as const,cx:p.position.x,cz:p.position.z,w:3,d:3,yaw:p.yaw,clearance:3}
    : p.kind==='candy-display' ? {label:p.id,kind:'fixture' as const,cx:p.position.x,cz:p.position.z,w:3,d:1.6,yaw:p.yaw,clearance:1.5}
    : retailFixtureFootprint(p.kind as RetailFixtureKind,p));
  assert.deepEqual(validateLayout([...footprints,checkout],bounds).filter(v=>v.a!==checkout.label||v.b),[]);
  assert.equal(new Set(plan.map(p=>p.id)).size,plan.length);
  if(width>=62) {
    const row=['candy-wall-gondola','acrylic-popcorn-bin','two-door-cooler'].map(k=>plan.find(p=>p.kind===k)!);
    assert.ok(row.every(Boolean));
    for(const p of row) assert.equal(p.yaw,Math.PI/4+(p.kind==='two-door-cooler'?Math.PI/2:0));
    assert.equal(plan.filter(p=>p.kind==='candy-wall-gondola').length,2);
    assert.equal(plan.filter(p=>p.kind==='acrylic-popcorn-bin').length,2);
    assert.equal(plan.filter(p=>p.kind==='candy-display').length,1);
    assert.ok(plan.every(p=>p.kind!=='chest-freezer'));
    assert.ok(row[0].position.x<row[1].position.x && row[1].position.x<row[2].position.x);
    assert.ok(row[0].position.z>row[1].position.z && row[1].position.z>row[2].position.z);
    for(const bin of plan.filter(p=>p.kind==='bargain-bin')) {
      const dx=bin.position.x-row[1].position.x,dz=bin.position.z-row[1].position.z;
      assert.ok((dx+dz)/Math.SQRT2<-6,'bins beyond the back of concessions');
    }
  }
  if(width===28) assert.equal(plan.length,0);
});

test('fully obstructed front zone declines fixtures', () => {
  assert.deepEqual(frontRefreshmentPlacements([{ label:'occupied', kind:'structure',cx:11,cz:0,w:62,d:30,yaw:0 }],
    {minX:-20,maxX:42,minZ:-60,maxZ:15}), []);
});

test('every admitted new kind is registered and excluded from independent-store floor displays', () => {
  const registry = readFileSync(new URL('../src/fixture-registry.ts', import.meta.url), 'utf8');
  const config = readFileSync(new URL('../src/store-fixtures-config.ts', import.meta.url), 'utf8');
  const excluded = config.match(/const FLOOR_DISPLAY_KINDS = new Set\(\[([\s\S]*?)\]\);/)![1];
  for (const kind of kinds) { assert.ok(registry.includes(`'${kind}'`)); assert.ok(excluded.includes(`'${kind}'`)); }
});

test('sale table cannot occupy the new return counter or its walking clearance',()=>{
  const counter:Footprint={label:'return counter',kind:'structure',cx:-5,cz:10,w:15.5,d:7.4,yaw:0};
  const bounds={minX:-35,maxX:57,minZ:-60,maxZ:15};
  const table=placeFloorSaleTable({id:'pv-drape-table-front',kind:'pv-drape-table',position:{x:-5,z:9},yaw:0},[counter,checkout],bounds);
  assert.ok(table);
  assert.deepEqual(validateLayout([counter,checkout,{label:'table',kind:'fixture',cx:table.position.x,cz:table.position.z,w:6.2,d:2.7,yaw:0,clearance:3}],bounds).filter(v=>v.a==='table'||v.b==='table'),[]);
});
test('concessions stay near checkout rather than migrating to a wider game wing',()=>{
  const plan=frontRefreshmentPlacements([checkout],{minX:-45,maxX:67,minZ:-80,maxZ:15});
  assert.ok(plan.some(p=>p.kind==='acrylic-popcorn-bin'));
  assert.ok(!plan.some(p=>p.kind==='secondary-service-counter'));
  assert.ok(plan.filter(p=>p.kind!=='bargain-bin' && p.kind!=='chest-freezer').every(p=>Math.abs(p.position.x-11)<=28 && p.position.z>=-13 && p.position.z<=3));
});

test('stocked game wing never becomes the fallback concessions queue',()=>{
  const game:Footprint={label:'fixture:game-section-0',kind:'fixture',cx:40,cz:0,w:4,d:12,yaw:0};
  const plan=frontRefreshmentPlacements([checkout,game],{minX:-35,maxX:57,minZ:-70,maxZ:15});
  assert.ok(plan.some(p=>p.kind==='two-door-cooler'));
  assert.ok(plan.every(p=>p.position.x<11));
});


test('concessions occupy the exit-side checkout aisle instead of the returns zone',()=>{
  // Actual shield face, with the fixture-facing side toward -X/-Z.
  const face:Footprint={label:'checkout face',kind:'structure',cx:6.1,cz:-2.4,
    w:9.8*Math.SQRT2,d:1.5,yaw:Math.PI/4};
  const returns:Footprint={label:'returns',kind:'structure',cx:-5,cz:9,w:15.5,d:12,yaw:0};
  const plan=frontRefreshmentPlacements([face,returns],{minX:-33,maxX:55,minZ:-60,maxZ:15});
  const popcorn=plan.find(p=>p.kind==='acrylic-popcorn-bin');
  assert.ok(popcorn);
  assert.ok(Math.hypot(popcorn.position.x-face.cx,popcorn.position.z-face.cz)<8,
    'a customer at the checkout face can turn toward the concessions aisle');
  assert.ok(popcorn.position.z<-5 && popcorn.position.x>-2,
    'the run stays beside the shield face, not past the returns counter');
});

for(const name of ['exit-return-counter','checkout-counter-shield-laminate','checkout-counter-shield-rounded',
  'checkout-counter-shield-laminate-2010','checkout-counter-shield-rounded-2010']) {
  test(`${name}: exported vertical millwork faces follow the 45-degree floor plan`,async()=>{
    const bytes=readFileSync(new URL(`../public/models/${name}.glb`,import.meta.url));
    const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    let walls=0;
    scene.traverse(o=>{
      if(!(o instanceof THREE.Mesh))return;
      const p=o.geometry.getAttribute('position'), n=o.geometry.getAttribute('normal');
      assert.ok(o.geometry.getAttribute('uv'));
      for(let i=0;i<p.count;i++) {
        assert.ok(Number.isFinite(p.getX(i)) && Number.isFinite(p.getY(i)) && Number.isFinite(p.getZ(i)));
        assert.ok(Number.isFinite(n.getX(i)) && Number.isFinite(n.getY(i)) && Number.isFinite(n.getZ(i)));
      }
      // Geometry normals establish alignment; smoothed vertex normals at a
      // mitre intentionally interpolate between neighbouring face directions.
      const index=o.geometry.index, count=index?.count??p.count;
      const a=new THREE.Vector3(), b=new THREE.Vector3(), c=new THREE.Vector3();
      for(let i=0;i<count;i+=3) {
        a.fromBufferAttribute(p,index?index.getX(i):i);
        b.fromBufferAttribute(p,index?index.getX(i+1):i+1);
        c.fromBufferAttribute(p,index?index.getX(i+2):i+2);
        b.sub(a).cross(c.sub(a));
        if(b.length()<.16)continue; // Exclude routed joints and edge easing.
        b.normalize();
        if(Math.abs(b.y)>1e-5)continue;
        const steps=Math.atan2(b.x,b.z)/(Math.PI/4);
        assert.ok(Math.abs(steps-Math.round(steps))<1e-4,`${name}: face normal ${steps*45} degrees`);
        walls++;
      }
      o.geometry.dispose();
      for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();
    });
    assert.ok(walls>10,'inspect real exported cabinet faces');
  });
}
