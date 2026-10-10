import type { NavPoint } from './clerk-nav.ts';
import { customerPreferenceWeight, type CustomerPreference } from './customer-preferences.ts';
import type { CustomerParking } from './customer-parking.ts';
import { customerRouteObstacles, customerRoutesSeparated } from './customer-route.ts';

export const CUSTOMER_SEPARATION = 2.6;
/** Two shoppers parked at neighbouring sections read as a pair, not a store. */
export const BROWSE_SPACING = 4;
export interface CustomerStop extends NavPoint { id: string; yaw: number; departments: readonly string[] }
export interface CustomerNavigation {
  isWalkable(x: number, z: number): boolean;
  segmentWalkable(a: NavPoint, b: NavPoint): boolean;
  findPath(sx: number, sz: number, tx: number, tz: number): NavPoint[] | null;
  findPathAvoiding?(sx:number,sz:number,tx:number,tz:number,people:readonly (NavPoint&{radius:number})[]):NavPoint[]|null;
}
export type CustomerPhase = 'browsing' | 'walking' | 'checkout' | 'leaving' | 'away';
export interface CustomerState extends NavPoint {
  id: string; profile: CustomerPreference; heading: number; phase: CustomerPhase;
  stop: CustomerStop | null; path: NavPoint[]; waypoint: number; wait: number;
  visits: number; trips: number; blocked: number; moving: boolean; active: boolean;
}
const distance = (a: NavPoint, b: NavPoint) => Math.hypot(a.x - b.x, a.z - b.z);
/** Floor and parking ownership share one lifetime. Art adapters only mirror this state. */
export class CustomerSimulation {
  readonly people: CustomerState[] = [];
  readonly reservations = new Map<string, string>();
  private seed = 377;
  private doorOwner: string | null = null;
  private readonly checkoutQueue: string[] = [];
  private checkoutYield=false;
  private readonly next:NavPoint={x:0,z:0};
  readonly nav: CustomerNavigation;
  readonly stops: readonly CustomerStop[];
  readonly parking: CustomerParking;
  readonly checkout: CustomerStop;
  readonly exit: CustomerStop;
  constructor(nav: CustomerNavigation, stops: readonly CustomerStop[],
    parking: CustomerParking, checkout: CustomerStop, exit: CustomerStop) {
    this.nav=nav;this.stops=stops;this.parking=parking;this.checkout=checkout;this.exit=exit;
  }
  private random(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 0x100000000;
  }
  private clear(point: NavPoint, except?: CustomerState): boolean {
    for(const p of this.people)if(p!==except&&p.active&&distance(point,p)<CUSTOMER_SEPARATION)return false;
    return true;
  }
  private route(from:NavPoint,stop:CustomerStop,person:CustomerState):NavPoint[]|null {
    const others=this.people.filter(p=>p!==person&&p.active);
    const corridors=others.map(p=>[p,...p.path.slice(p.waypoint)]);
    const obstacles=corridors.flatMap(points=>customerRouteObstacles(points,CUSTOMER_SEPARATION+.3));
    const path=this.nav.findPathAvoiding
      ?this.nav.findPathAvoiding(from.x,from.z,stop.x,stop.z,obstacles)
      :this.nav.findPath(from.x,from.z,stop.x,stop.z);
    // Include exact final hops, which A* may append beyond its temporary mask.
    return path&&corridors.every(other=>customerRoutesSeparated([from,...path],other,CUSTOMER_SEPARATION))?path:null;
  }
  private canMove(point:NavPoint,person:CustomerState,player?:NavPoint):boolean {
    return this.clear(point,person)&&(!player||distance(point,player)>=1.7)&&this.nav.segmentWalkable(person,point);
  }
  private available(stop: CustomerStop, person?: CustomerState): boolean {
    if (this.reservations.has(stop.id) && this.reservations.get(stop.id) !== person?.id) return false;
    if (!this.clear(stop, person)) return false;
    // The counter and door keep their own turn-taking; shelf positions keep elbow room.
    const spacing = stop === this.checkout || stop === this.exit ? CUSTOMER_SEPARATION : BROWSE_SPACING;
    return this.people.every(p => p === person || !p.active || !p.stop || distance(stop, p.stop) >= spacing);
  }
  private select(person: CustomerState, from: NavPoint): {stop: CustomerStop; path: NavPoint[]} | null {
    const candidates: { stop: CustomerStop; weight: number }[] = [];
    for (const stop of this.stops) {
      if (stop.id === person.stop?.id || !this.available(stop, person)) continue;
      // Weight departments once, then divide across their positions. A long action
      // aisle must not erase a short games section merely by having more stops.
      const weight = customerPreferenceWeight(person.profile, stop.departments);
      candidates.push({ stop, weight });
    }
    if (!candidates.length) return null;
    const counts = new Map<string, number>();
    const key = (s: CustomerStop) => [...s.departments].sort().join('|');
    for (const c of candidates) counts.set(key(c.stop), (counts.get(key(c.stop)) ?? 0) + 1);
    let total = 0;
    for (const c of candidates) total += c.weight /= counts.get(key(c.stop))!;
    // Routing runs only for selected candidates, rather than every stocked
    // position. A crowded/unreachable choice is removed before the next draw.
    while(candidates.length) {
      let draw=this.random()*total,index=candidates.length-1;
      for(let i=0;i<candidates.length;i++){draw-=candidates[i].weight;if(draw<=0){index=i;break;}}
      const [candidate]=candidates.splice(index,1);total-=candidate.weight;
      const path=this.route(from,candidate.stop,person);
      if(path&&this.validPath(from,path,candidate.stop))return {stop:candidate.stop,path};
    }
    return null;
  }
  private validPath(from: NavPoint, path: NavPoint[], end: NavPoint): boolean {
    let previous = from;
    for (const point of path) {
      if (!this.nav.segmentWalkable(previous, point)) return false;
      previous = point;
    }
    return distance(previous, end) < .1;
  }
  add(id: string, profile: CustomerPreference): CustomerState | null {
    if (this.people.some(p => p.id === id)) return null;
    const person: CustomerState = { id, profile, x: this.exit.x, z: this.exit.z, heading: 0,
      phase: 'browsing', stop: null, path: [], waypoint: 0, wait: 8 + this.people.length * 2,
      visits: 0, trips: 0, blocked: 0, active: false, moving: false };
    const choice = this.select(person, this.exit);
    if (!choice || !this.parking.reserve(id)) return null;
    // Opening population is already shopping; later visits arrive via the door.
    person.x = choice.stop.x; person.z = choice.stop.z; person.heading = choice.stop.yaw;
    person.stop = choice.stop; person.active = true; this.people.push(person);
    this.reservations.set(choice.stop.id, id); return person;
  }
  private releaseStop(person: CustomerState): void {
    if (person.stop && this.reservations.get(person.stop.id) === person.id) this.reservations.delete(person.stop.id);
    person.stop = null;
  }
  private travel(person: CustomerState, stop: CustomerStop, phase: CustomerPhase, path?: NavPoint[]): boolean {
    if(stop===this.exit&&this.doorOwner&&this.doorOwner!==person.id)return false;
    if (!this.available(stop, person)) return false;
    path ??= this.route(person,stop,person) ?? undefined;
    if (!path || !this.validPath(person, path, stop)) return false;
    this.releaseStop(person); this.reservations.set(stop.id, person.id);
    person.stop = stop; person.path = path; person.waypoint = 0; person.blocked = 0;
    this.checkoutYield=false;
    if(stop===this.exit)this.doorOwner=person.id;
    if(stop===this.exit&&this.checkoutQueue[0]===person.id)this.checkoutQueue.shift();
    person.phase = phase; return true;
  }
  private leave(person: CustomerState): void {
    this.releaseStop(person); this.parking.release(person.id);
    person.phase = 'away'; person.active = false; person.moving = false;
    person.path = []; person.wait = 40 + this.people.indexOf(person) * 7; person.trips++;
    if(this.doorOwner===person.id)this.doorOwner=null;
    const queued=this.checkoutQueue.indexOf(person.id);if(queued>=0)this.checkoutQueue.splice(queued,1);
  }
  /** A caller removing a regular (settings/rebuild) releases both kinds of ownership. */
  remove(id: string): void {
    const index = this.people.findIndex(p => p.id === id);
    if (index < 0) return;
    this.leave(this.people[index]); this.people.splice(index, 1);
  }
  dispose(): void { for (const p of this.people) { this.releaseStop(p); this.parking.release(p.id); } this.people.length = 0;this.doorOwner=null;this.checkoutQueue.length=0; }
  update(dt: number, player?: NavPoint): void {
    if(dt<=0)return;
    for (const person of this.people) {
      person.moving = false;
      if (!person.active) {
        if ((person.wait -= dt) > 0) continue;
        const head=this.people.find(p=>p.id===this.checkoutQueue[0]);
        if(head?.phase==='browsing'&&head.visits>=3){person.wait=5;continue;}
        const choice = this.select(person, this.exit);
        if (!choice || this.doorOwner || !this.available(this.exit,person) || player && distance(player, this.exit) < CUSTOMER_SEPARATION || !this.parking.reserve(person.id)) { person.wait = 5; continue; }
        person.x = this.exit.x; person.z = this.exit.z; person.active = true; person.visits = 0;
        this.doorOwner=person.id;
        this.travel(person, choice.stop, 'walking', choice.path); continue;
      }
      if (person.waypoint < person.path.length) {
        const goal = person.path[person.waypoint], dx = goal.x - person.x, dz = goal.z - person.z;
        const length = Math.hypot(dx, dz), amount = Math.min(length, dt * 1.35);
        const next=this.next;
        next.x=person.x+dx/Math.max(length,.0001)*amount;next.z=person.z+dz/Math.max(length,.0001)*amount;
        if (!this.canMove(next,person,player)) {
          const previousBlock=person.blocked;
          person.blocked += dt;
          if (Math.floor(person.blocked/2)>Math.floor(previousBlock/2)) {
            // A new route alone is not progress. Keep the elapsed blockage
            // until movement succeeds, and back out to another stocked stop
            // when a narrow aisle cannot carry two opposing shoppers.
            if(person.blocked>=6) {
              const choice=this.select(person,person);
              if(choice&&this.travel(person,choice.stop,'walking',choice.path))continue;
            }
            const path=person.stop&&this.route(person,person.stop,person);
            if(path&&this.validPath(person,path,person.stop!)){person.path=path;person.waypoint=0;}
          }
          continue;
        } else person.blocked = 0;
        person.heading = Math.atan2(next.x - person.x, next.z - person.z);
        person.x = next.x; person.z = next.z; person.moving = amount > 0;
        // Finish at the actual corner rather than turning a few inches early.
        if (amount>=length) {person.x=goal.x;person.z=goal.z;person.waypoint++;}
        if (person.waypoint < person.path.length) continue;
        person.path = []; person.waypoint = 0; person.heading = person.stop!.yaw;
        if (person.phase === 'leaving') { this.leave(person); continue; }
        if (person.phase === 'walking') {
          person.phase = 'browsing'; person.visits++;if(this.doorOwner===person.id)this.doorOwner=null;
          if(person.visits>=3&&!this.checkoutQueue.includes(person.id))this.checkoutQueue.push(person.id);
        }
        person.wait = person.phase === 'checkout' ? 4 : 9 + this.random() * 9;
      } else if ((person.wait -= dt) <= 0) {
        if (person.phase === 'checkout') {
          if (!this.travel(person, this.exit, 'leaving')) person.wait = 3;
        } else if (person.visits >= 3) {
          if(!this.checkoutQueue.includes(person.id))this.checkoutQueue.push(person.id);
          if(this.checkoutQueue[0]!==person.id||!this.travel(person, this.checkout, 'checkout')) {
            const head=this.people.find(p=>p.id===this.checkoutQueue[0]);
            const priority=head?.phase==='browsing'&&head.visits>=3;
            if(priority&&head!==person&&!this.checkoutYield){person.wait=3;continue;}
            if(head===person&&this.people.some(p=>p!==person&&p.path.length)){person.wait=3;continue;}
            const choice=this.select(person,person);
            if(!choice||!this.travel(person,choice.stop,'walking',choice.path)){
              person.wait=3;
              if(head===person)this.checkoutYield=true;
            }
          }
        } else {
          const head=this.people.find(p=>p.id===this.checkoutQueue[0]);
          if(head?.phase==='browsing'&&head.visits>=3&&!this.checkoutYield){person.wait=3;continue;}
          const choice = this.select(person, person);
          if (!choice || !this.travel(person, choice.stop, 'walking', choice.path)) person.wait = 5;
        }
      }
    }
  }
}
