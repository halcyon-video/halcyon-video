import type { ParkingSpace } from './parking-layout.ts';

export interface CustomerVehicle { id: string; modelYear: number; length: number; width: number; height: number; asset: string; liteAsset: string }
/** Original period body styles at real size in feet, including bumpers and mirrors (#392). */
export const CUSTOMER_VEHICLES: readonly CustomerVehicle[] = [
  { id: 'period-sedan', modelYear: 1987, length: 15.225, width: 6.26, height: 4.57, asset: 'customer-car-sedan.glb', liteAsset: 'customer-car-sedan-lite.glb' },
  { id: 'period-hatchback', modelYear: 1987, length: 13.625, width: 6.1, height: 4.53, asset: 'customer-car-hatchback.glb', liteAsset: 'customer-car-hatchback-lite.glb' },
  { id: 'period-wagon', modelYear: 1987, length: 15.825, width: 6.34, height: 4.638, asset: 'customer-car-wagon.glb', liteAsset: 'customer-car-wagon-lite.glb' },
  { id: 'period-minivan', modelYear: 1989, length: 15.425, width: 6.56, height: 5.564, asset: 'customer-car-minivan.glb', liteAsset: 'customer-car-minivan-lite.glb' },
];
/** Period paint, independent of body style. */
export const CUSTOMER_PAINTS: readonly number[] = [0x9c3731, 0x385e79, 0xb2a68a, 0x527054, 0xccccbf, 0x493c50,
  0x876b42, 0x243c54, 0x778584, 0x813e42, 0x2f5f5a, 0xa8adb0];
export interface CustomerCar { vehicle: CustomerVehicle; color: number }
export interface CustomerParkingAssignment extends CustomerCar { customerId: string; spaceId: number; space: ParkingSpace }
export function customerStoreYear(theme: string): number {
  // Store era is distinct from the catalog's optional release-date pin.
  const match = /(?:19|20)\d{2}/.exec(theme);
  return match ? Number(match[0]) : /2000/.test(theme) ? 2000 : 1990;
}
/** FNV-1a: stable across sessions and builds, so a regular keeps the same car. */
function identityHash(text: string, salt: string): number {
  let h = 0x811c9dc5;
  for (const ch of salt + text) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  return h >>> 0;
}
export class CustomerParking {
  readonly assignments = new Map<string, CustomerParkingAssignment>();
  version = 0;
  readonly spaces: readonly ParkingSpace[];
  readonly year: number;
  readonly stallWidth: number;
  readonly stallDepth: number;
  readonly vehicles: readonly CustomerVehicle[];
  private readonly fleet = new Map<string, CustomerCar>();
  constructor(spaces: readonly ParkingSpace[], year: number,
    stallWidth = 9, stallDepth = 18, vehicles = CUSTOMER_VEHICLES, regulars: readonly string[] = []) {
    this.spaces=spaces;this.year=year;this.stallWidth=stallWidth;this.stallDepth=stallDepth;this.vehicles=vehicles;
    // Each regular owns one car for this store. Style and paint come from separate
    // hashes; resolving over the whole roster keeps concurrent cars apart (unique
    // paint while the palette lasts, then a unique style/paint pair).
    const pairs = new Set<string>(), paints = new Set<number>();
    for (const id of regulars) {
      const car = this.preferred(id);
      if (!car) break;
      let paint = CUSTOMER_PAINTS.indexOf(car.color);
      for (let n = 0; n < CUSTOMER_PAINTS.length; n++) {
        const color = CUSTOMER_PAINTS[(paint + n) % CUSTOMER_PAINTS.length];
        const fresh = paints.size < CUSTOMER_PAINTS.length ? !paints.has(color) : !pairs.has(car.vehicle.id + color);
        if (fresh) { paint = (paint + n) % CUSTOMER_PAINTS.length; break; }
      }
      const color = CUSTOMER_PAINTS[paint];
      paints.add(color); pairs.add(car.vehicle.id + color); this.fleet.set(id, { vehicle: car.vehicle, color });
    }
  }
  eligible(vehicle: CustomerVehicle): boolean {
    return vehicle.modelYear <= this.year && vehicle.length + .6 <= this.stallDepth && vehicle.width + .6 <= this.stallWidth;
  }
  /** Preferred style is kept across store years whenever that style already exists. */
  private preferred(customerId: string): CustomerCar | null {
    const eligible = this.vehicles.filter(v => this.eligible(v));
    if (!eligible.length) return null;
    const first = this.vehicles[identityHash(customerId, 'style') % this.vehicles.length];
    const vehicle = this.eligible(first) ? first : eligible[identityHash(customerId, 'era') % eligible.length];
    return { vehicle, color: CUSTOMER_PAINTS[identityHash(customerId, 'paint') % CUSTOMER_PAINTS.length] };
  }
  /** The persistent car a customer drives here; independent of visit and space. */
  carFor(customerId: string): CustomerCar | null {
    return this.fleet.get(customerId) ?? this.preferred(customerId);
  }
  reserve(customerId: string): CustomerParkingAssignment | null {
    const existing = this.assignments.get(customerId);
    if (existing) return existing;
    const index = Number(customerId.slice(-2)) || 1;
    const car = this.carFor(customerId);
    if (!car) return null;
    // Stable search order per identity; no vehicle enters an excluded/reserved bay.
    for (let n = 0; n < this.spaces.length; n++) {
      const spaceId = (index - 1 + n) % this.spaces.length, space = this.spaces[spaceId];
      if (space.accessible || space.reserved || [...this.assignments.values()].some(a => a.spaceId === spaceId)) continue;
      const assignment = { customerId, spaceId, space, vehicle: car.vehicle, color: car.color };
      this.assignments.set(customerId, assignment); this.version++; return assignment;
    }
    return null;
  }
  release(customerId: string): void { if (this.assignments.delete(customerId)) this.version++; }
  clear(): void { if (this.assignments.size) { this.assignments.clear(); this.version++; } }
}
