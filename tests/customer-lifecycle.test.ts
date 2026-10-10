import test from 'node:test';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
import assert from 'node:assert/strict';
import { CustomerParking, CUSTOMER_VEHICLES, customerStoreYear } from '../src/customer-parking.ts';
import { customerDepartment, customerPreference, customerPreferenceWeight, CUSTOMER_PREFERENCES, FAVORED_WEIGHT, SECONDARY_WEIGHT } from '../src/customer-preferences.ts';
import { CustomerSimulation, CUSTOMER_SEPARATION, type CustomerStop } from '../src/customer-simulation.ts';
import { parkingLayout } from '../src/parking-layout.ts';
import { ClerkNavGrid } from '../src/clerk-nav.ts';

const stop=(id:string,x:number,z:number,departments=['action']):CustomerStop=>({id,x,z,yaw:0,departments});
function fixture(count=10,spaces=20,year=1993) {
  const nav=new ClerkNavGrid({minX:-30,maxX:30,minZ:-35,maxZ:15},[],{cellSize:.5,clearance:.8,wallMargin:1});
  const stops=Array.from({length:count},(_,i)=>stop('s'+i,-24+(i%5)*12,-8-Math.floor(i/5)*12,[i%3===0?'games':i%3===1?'thrillers':'action']));
  const parking=new CustomerParking(parkingLayout(68,4.7,-45).spaces.slice(0,spaces),year);
  const simulation=new CustomerSimulation(nav,stops,parking,stop('checkout',-5,5,[]),stop('exit',5,10,[]));
  return {nav,stops,parking,simulation};
}
function productionFloor() {
  const {readFileSync}=require('node:fs') as typeof import('node:fs');
  const f=JSON.parse(readFileSync(new URL('./fixtures/customer-floor.json',import.meta.url),'utf8'));
  const rects=f.blockedRows.flatMap((spans:number[],r:number)=>{
    const row=[];
    for(let i=0;i<spans.length;i+=2)row.push({cx:f.bounds.minX+(spans[i]+spans[i+1])*f.cell/2,cz:f.bounds.minZ+(r+.5)*f.cell,w:(spans[i+1]-spans[i])*f.cell,d:f.cell,yaw:0});
    return row;
  });
  return {f,nav:new ClerkNavGrid(f.bounds,rects,{cellSize:f.cell,clearance:0,wallMargin:0})};
}
function invariant(sim:CustomerSimulation) {
  const active=sim.people.filter(p=>p.active);
  assert.equal(sim.parking.assignments.size,active.length);
  assert.equal(new Set([...sim.parking.assignments.values()].map(a=>a.spaceId)).size,active.length);
  for(const p of sim.people) {
    assert.equal(sim.parking.assignments.has(p.id),p.active);
    if(p.active)assert.ok(sim.nav.isWalkable(p.x,p.z),p.id+' remains on the floor');
  }
  for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++) {
    assert.ok(Math.hypot(active[i].x-active[j].x,active[i].z-active[j].z)>=CUSTOMER_SEPARATION-1e-7,'customer overlap');
    if(active[i].stop&&active[j].stop)assert.notEqual(active[i].stop.id,active[j].stop.id);
  }
  for(const [id,owner] of sim.reservations)assert.ok(active.some(p=>p.id===owner&&p.stop?.id===id),'no abandoned reservation');
}
test('confirmed preferences are individual, configurable, with safe malformed overrides',()=>{
  assert.deepEqual(CUSTOMER_PREFERENCES['customer-08'].favored,['games']);
  assert.deepEqual(CUSTOMER_PREFERENCES['customer-07'].favored,['thrillers']);
  assert.deepEqual(CUSTOMER_PREFERENCES['customer-04'].favored,['action']);
  for (let i = 1; i <= 10; i++) {
    const profile = customerPreference('customer-'+String(i).padStart(2,'0'));
    assert.ok(profile.favored.length > 0);
    assert.equal(customerPreferenceWeight(profile, profile.favored), FAVORED_WEIGHT);
    assert.equal(customerPreferenceWeight(profile, profile.secondary), SECONDARY_WEIGHT);
    assert.equal(customerPreferenceWeight(profile, ['unstocked']), 1);
    // An all-genre shelf that merely contains the favorite is not a favored department.
    const mixed=[...profile.favored,'foreign','western','musical','war','history','sports','music'];
    assert.ok(customerPreferenceWeight(profile, mixed) < SECONDARY_WEIGHT);
  }
  assert.equal(new Set(Object.values(CUSTOMER_PREFERENCES).map(p => p.favored.join(','))).size, 10);
});
test('parking assignment stays stable, excludes reserved/access bays, refuses full lot and future/oversized models',()=>{
  const spaces=parkingLayout(44,4.7,-45).spaces.slice(0,4).map((s,i)=>({...s,accessible:i===0,reserved:i===1}));
  const parking=new CustomerParking(spaces,1990);
  const first=parking.reserve('customer-01');assert.ok(first);assert.equal(parking.reserve('customer-01'),first);
  assert.ok(parking.reserve('customer-02'));assert.equal(parking.reserve('customer-03'),null);
  assert.ok([...parking.assignments.values()].every(a=>a.spaceId>=2&&a.vehicle.modelYear<=1990));
  parking.release('customer-01');assert.ok(parking.reserve('customer-03'));
  assert.equal(new CustomerParking(spaces,1986).reserve('customer-01'),null);
  assert.equal(new CustomerParking(spaces,1990,5,18).reserve('customer-01'),null);
  assert.equal(new CustomerParking(spaces,1990,9,10).reserve('customer-01'),null);
  assert.equal(customerStoreYear('bb-1993'),1993);
  assert.equal(customerStoreYear('bb-2000'),2000);
  assert.ok(CUSTOMER_VEHICLES.every(v=>v.length<18&&v.width<9));
});
test('admission needs both a free reachable browsing position and eligible parking',()=>{
  const {simulation}=fixture(12,2);
  assert.ok(simulation.add('customer-01',customerPreference('customer-01')));
  assert.ok(simulation.add('customer-02',customerPreference('customer-02')));
  assert.equal(simulation.add('customer-03',customerPreference('customer-03')),null);
  invariant(simulation);
  const noStock=fixture(0);assert.equal(noStock.simulation.add('customer-01',customerPreference('customer-01')),null);
  const future=fixture(12,20,1986);assert.equal(future.simulation.add('customer-01',customerPreference('customer-01')),null);
  const unreachable=fixture();unreachable.nav.findPath=()=>null;
  assert.equal(unreachable.simulation.add('customer-01',customerPreference('customer-01')),null);
});
test('ten regulars reserve separated destinations through checkout, departure and repeat arrival',()=>{
  const {simulation}=fixture(20);
  for(let i=1;i<=10;i++){const id='customer-'+String(i).padStart(2,'0');assert.ok(simulation.add(id,customerPreference(id)));}
  for(let frame=0;frame<24000;frame++){simulation.update(.1);invariant(simulation);}
  assert.ok(simulation.people.every(p=>p.trips>=2),JSON.stringify(simulation.people.map(p=>({id:p.id,trips:p.trips,phase:p.phase,blocked:p.blocked}))));
  simulation.dispose();assert.equal(simulation.parking.assignments.size,0);assert.equal(simulation.reservations.size,0);
});
test('favored departments outweigh shelf size, missing/crowded sections allow alternatives',()=>{
  const {simulation,stops}=fixture(15);
  const p=simulation.add('customer-08',customerPreference('customer-08'))!;
  let games=0,other=0,previous=p.stop;
  for(let frame=0;frame<40000;frame++) {
    simulation.update(.1);
    if(p.active&&p.phase==='browsing'&&p.stop!==previous){previous=p.stop;if(p.stop?.departments.includes('games'))games++;else other++;}
  }
  assert.ok(games>other*1.5,`${games} favored / ${other} alternatives`);assert.ok(other>0);
  const absent=fixture(8);absent.stops.forEach(s=>{s.departments=['action'];});
  const fallback=absent.simulation.add('customer-08',customerPreference('customer-08'));assert.ok(fallback);assert.deepEqual(fallback.stop?.departments,['action']);
  const occupied=fixture(3);occupied.stops[0].departments=['games'];occupied.stops[1].departments=occupied.stops[2].departments=['action'];
  const first=occupied.simulation.add('customer-01',customerPreference('customer-01'))!;
  // Reserve the sole games section and keep a real occupant there.
  occupied.simulation.reservations.delete(first.stop!.id);first.stop=occupied.stops[0];first.x=first.stop.x;first.z=first.stop.z;occupied.simulation.reservations.set(first.stop.id,first.id);
  assert.deepEqual(occupied.simulation.add('customer-08',customerPreference('customer-08'))?.stop?.departments,['action']);
  assert.ok(stops.length>0);
});
test('removal/rebuild frees only its own parking and reservations; zero-time update freezes the visit',()=>{
  const {simulation}=fixture();
  for(const id of ['customer-04','customer-07','customer-08'])simulation.add(id,customerPreference(id));
  const state=JSON.stringify(simulation.people);simulation.update(0);assert.equal(JSON.stringify(simulation.people),state);
  const retained=simulation.parking.assignments.get('customer-07');simulation.remove('customer-04');
  assert.equal(simulation.parking.assignments.get('customer-07'),retained);invariant(simulation);
  simulation.dispose();assert.equal(simulation.parking.assignments.size,0);
  const changed=fixture(12,20,1986);assert.equal(changed.simulation.add('customer-07',customerPreference('customer-07')),null);
});
test('occupied-cell routing detours around a customer and restores the shared clerk grid',()=>{
  const {nav}=fixture();
  const straight=nav.findPath(-15,0,15,0)!;
  const path=nav.findPathAvoiding(-15,0,15,0,[{x:0,z:0,radius:3}]);assert.ok(path);
  let previous={x:-15,z:0};
  for(const point of path){for(let n=0;n<=100;n++){const t=n/100;assert.ok(Math.hypot(previous.x+(point.x-previous.x)*t,previous.z+(point.z-previous.z)*t)>=2.6);}previous=point;}
  assert.deepEqual(nav.findPath(-15,0,15,0),straight);assert.equal(nav.isWalkable(0,0),true);
});
test('a segment cannot graze a blocked corner between coarse samples',()=>{
  const nav=new ClerkNavGrid({minX:0,maxX:10,minZ:0,maxZ:10},[{cx:5.25,cz:5.25,w:.5,d:.5,yaw:0}],{cellSize:.5,clearance:0,wallMargin:0});
  // Cross only a tiny sliver of the lower-left blocked-cell corner.
  const a={x:4.5,z:5.502},b={x:5.502,z:4.5};
  assert.equal(nav.isWalkable(a.x,a.z),true);assert.equal(nav.isWalkable(b.x,b.z),true);
  assert.equal(nav.segmentWalkable(a,b),false);
  const path=nav.findPath(a.x,a.z,b.x,b.z);assert.ok(path);
  let previous=a;for(const p of path){assert.equal(nav.segmentWalkable(previous,p),true);previous=p;}
});

test('remaining route reservations reject crossing, head-on and too-close parallel paths',async()=>{
  const {customerRoutesSeparated}=await import('../src/customer-route.ts');
  assert.equal(customerRoutesSeparated([{x:-10,z:0},{x:10,z:0}],[{x:0,z:-10},{x:0,z:10}],2.6),false);
  assert.equal(customerRoutesSeparated([{x:-10,z:0},{x:10,z:0}],[{x:10,z:0},{x:-10,z:0}],2.6),false);
  assert.equal(customerRoutesSeparated([{x:-10,z:0},{x:10,z:0}],[{x:-10,z:2.5},{x:10,z:2.5}],2.6),false);
  assert.equal(customerRoutesSeparated([{x:-10,z:0},{x:10,z:0}],[{x:-10,z:3},{x:10,z:3}],2.6),true);
  assert.equal(customerRoutesSeparated([{x:0,z:0}],[{x:-10,z:0},{x:10,z:0}],2.6),false);
});

test('public production floor completes repeated visits with six different admission orders',()=>{
  for(let order=0;order<6;order++){
    const {f,nav}=productionFloor();
    const sim=new CustomerSimulation(nav,f.stops,new CustomerParking(f.spaces,1993),f.checkout,f.exit);
    for(let j=0;j<10;j++){const id='customer-'+String((j+order)%10+1).padStart(2,'0');assert.ok(sim.add(id,customerPreference(id)));}
    for(let frame=0;frame<60000;frame++){sim.update(.1);invariant(sim);}
    assert.ok(sim.people.every(p=>p.trips>=2),JSON.stringify({order,people:sim.people.map(p=>({id:p.id,trips:p.trips,phase:p.phase,blocked:p.blocked}))}));
    sim.dispose();assert.equal(sim.parking.assignments.size,0);
  }
});

test('regulars show their own departments over repeated visits on the production floor',()=>{
  const {f,nav}=productionFloor();
  const sim=new CustomerSimulation(nav,f.stops,new CustomerParking(f.spaces,1993),f.checkout,f.exit);
  const ids=Array.from({length:8},(_,i)=>'customer-'+String(i+1).padStart(2,'0'));
  for(const id of ids)assert.ok(sim.add(id,customerPreference(id)));
  const pure=(departments:readonly string[],wanted:readonly string[])=>departments.length===1&&wanted.includes(customerDepartment(departments[0]));
  const seen=new Map<string,{favored:number,total:number}>(),last=new Map<string,unknown>();
  for(let frame=0;frame<60000;frame++){
    sim.update(.1);
    for(const p of sim.people){
      if(!p.active||p.phase!=='browsing'||last.get(p.id)===p.stop)continue;
      last.set(p.id,p.stop);const t=seen.get(p.id)??{favored:0,total:0};seen.set(p.id,t);
      t.total++;if(pure(p.stop!.departments,p.profile.favored))t.favored++;
    }
  }
  let checked=0;
  for(const id of ids){
    const profile=customerPreference(id),base=f.stops.filter((s:{departments:string[]})=>pure(s.departments,profile.favored)).length/f.stops.length;
    if(!base)continue; // Thrillers/romance/drama have no dedicated shelf here: alternatives only.
    const t=seen.get(id)!;checked++;
    assert.ok(t.favored/t.total>=Math.max(.25,base*2.5),`${id} ${JSON.stringify(t)} base ${base.toFixed(2)}`);
    assert.ok(t.favored<t.total*.8,`${id} is not locked to one department`);
  }
  assert.ok(checked>=5);
});

test('a shopper beside a wall can escape a nearby conservative body mask',()=>{
  const nav=new ClerkNavGrid({minX:0,maxX:20,minZ:0,maxZ:8},[],{cellSize:.5,clearance:0,wallMargin:1});
  const from={x:10,z:1.2},other={x:11.41,z:3.68};
  const path=nav.findPathAvoiding(from.x,from.z,2,1.2,[{...other,radius:2.9}]);assert.ok(path);
  let previous=from;
  for(const p of path){for(let n=0;n<=100;n++){const t=n/100;assert.ok(Math.hypot(previous.x+(p.x-previous.x)*t-other.x,previous.z+(p.z-previous.z)*t-other.z)>=2.6);}previous=p;}
});
