import test from 'node:test';
import assert from 'node:assert/strict';
import { ClerkNavGrid } from '../src/clerk-nav.ts';
import { CustomerParking } from '../src/customer-parking.ts';
import { customerPreference, FAVORED_WEIGHT } from '../src/customer-preferences.ts';
import { customerDestinationWeights, NEARBY_FALLBACK_RADIUS, RECENT_STOP_FACTOR } from '../src/customer-destinations.ts';
import { BROWSE_SPACING, CustomerSimulation, CUSTOMER_SEPARATION, type CustomerStop } from '../src/customer-simulation.ts';
import { parkingLayout } from '../src/parking-layout.ts';

const stop=(id:string,x:number,z:number,departments=['action']):CustomerStop=>({id,x,z,yaw:0,departments});
const games=customerPreference('customer-08');
function sim(stops:CustomerStop[],seed=377) {
  const nav=new ClerkNavGrid({minX:-40,maxX:40,minZ:-35,maxZ:15},[],{cellSize:.5,clearance:.8,wallMargin:1});
  const parking=new CustomerParking(parkingLayout(68,4.7,-45).spaces.slice(0,20),1993);
  return new CustomerSimulation(nav,stops,parking,stop('checkout',-5,5,[]),stop('exit',5,10,[]),seed);
}
/** Put a shopper on `at` directly, as if they had walked there. */
function occupy(s:CustomerSimulation,id:string,at:CustomerStop) {
  const p=s.add(id,customerPreference(id))!;assert.ok(p);
  s.reservations.delete(p.stop!.id);p.stop=at;p.x=at.x;p.z=at.z;s.reservations.set(at.id,id);
  return p;
}

test('a taken favorite pulls the fallback toward open positions beside it',()=>{
  const favorite=stop('g',0,0,['games']),near=stop('near',6,0),far=stop('far',30,0);
  const [n,f]=customerDestinationWeights(games,[near,far],[favorite]);
  assert.ok(n>f*3,`near ${n} far ${f}`);
  assert.equal(f,.5,'outside the radius only the plain department share remains');
  // Falloff is linear and ends at the radius.
  const [edge]=customerDestinationWeights(games,[stop('edge',NEARBY_FALLBACK_RADIUS,0)],[favorite]);
  assert.equal(edge,1);
  // A taken position the shopper does not care about hands nothing on.
  const [plain]=customerDestinationWeights(games,[near],[stop('a2',0,0,['action'])]);
  assert.equal(plain,1);
});

test('department weight divides across positions; taken pull divides across the whole department',()=>{
  const aisle=Array.from({length:6},(_,i)=>stop('a'+i,i*5,-20));
  const section=stop('g',0,10,['games']);
  const w=customerDestinationWeights(games,[...aisle,section],[]);
  assert.equal(w[6],FAVORED_WEIGHT);
  assert.ok(Math.abs(w.slice(0,6).reduce((a,b)=>a+b,0)-1)<1e-9,'six action positions share one department weight');
  // One taken position of a four-position games run spills a quarter of its extra pull.
  const run=[0,1,2,3].map(i=>stop('g'+i,i*40,0,['games']));
  const x=stop('x',0,3),onlyOne=stop('g',0,0,['games']);
  const quarter=customerDestinationWeights(games,[x,...run.slice(1)],[run[0]])[0]-1;
  const whole=customerDestinationWeights(games,[x],[onlyOne])[0]-1;
  assert.ok(Math.abs(quarter*4-whole)<1e-9,`quarter ${quarter} whole ${whole}`);
});

test('recently visited positions are damped but never excluded',()=>{
  const a=stop('a',0,0),b=stop('b',10,0);
  const [wa,wb]=customerDestinationWeights(games,[a,b],[],['a']);
  assert.equal(wa,wb*RECENT_STOP_FACTOR);assert.ok(wa>0);
});

test('reservation keeps the second shopper off the first one\'s position and its elbow room',()=>{
  const stops=[stop('s0',0,-10),stop('s1',3,-10),stop('s2',12,-10)];
  const s=sim(stops);
  const first=s.add('customer-01',customerPreference('customer-01'))!;
  const second=s.add('customer-02',customerPreference('customer-02'))!;
  assert.notEqual(first.stop!.id,second.stop!.id);
  assert.ok(Math.hypot(first.stop!.x-second.stop!.x,first.stop!.z-second.stop!.z)>=BROWSE_SPACING);
  assert.ok(Math.hypot(first.x-second.x,first.z-second.z)>=CUSTOMER_SEPARATION);
  assert.equal(s.reservations.get(first.stop!.id),'customer-01');
  assert.equal(s.reservations.get(second.stop!.id),'customer-02');
  // Both remaining positions are within elbow room of a reservation: nobody else fits.
  assert.equal(s.add('customer-03',customerPreference('customer-03')),null);
});

test('seeded: an occupied games section sends the games fan next door, not across the store',()=>{
  let near=0,far=0;
  for(let seed=1;seed<=200;seed++){
    const favorite=stop('g',-20,-10,['games']),beside=stop('near',-14,-10),across=stop('far',20,-10);
    const s=sim([favorite,beside,across],seed);
    occupy(s,'customer-01',favorite);
    const fan=s.add('customer-08',games)!;assert.ok(fan);
    if(fan.stop!.id==='near')near++;else if(fan.stop!.id==='far')far++;
  }
  assert.equal(near+far,200);
  // Weights 1/2 + 11*(1-6/12) = 6 near vs 1/2 far: about 92% next door.
  assert.ok(near>=160&&far>=5,`near ${near} far ${far}`);
});

test('seeded: the same seed reproduces the same visit sequence, and loops vary',()=>{
  const layout=()=>Array.from({length:8},(_,i)=>stop('s'+i,-30+i*8,-12,[i<2?'games':'action']));
  const run=(seed:number)=>{
    const s=sim(layout(),seed),p=s.add('customer-08',games)!;const seen:string[]=[p.stop!.id];
    for(let frame=0;frame<20000;frame++){s.update(.1);if(p.active&&p.phase==='browsing'&&p.stop&&seen.at(-1)!==p.stop.id)seen.push(p.stop.id);}
    return seen;
  };
  const a=run(9),b=run(9);
  assert.deepEqual(a,b);
  let backtracks=0;for(let i=2;i<a.length;i++)if(a[i]===a[i-2])backtracks++;
  assert.ok(a.length>20,`${a.length} visits`);
  // Without damping two favored positions would ping-pong most of the time.
  assert.ok(backtracks<(a.length-2)*.5,`${backtracks} A-B-A returns of ${a.length}`);
  const gamesShare=a.filter(id=>id==='s0'||id==='s1').length/a.length;
  assert.ok(gamesShare>.4&&gamesShare<.95,`games share ${gamesShare.toFixed(2)}`);
});
