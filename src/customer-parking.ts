import type { ParkingSpace } from './parking-layout.ts';

export interface CustomerVehicle { id: string; modelYear: number; length: number; width: number; height: number; asset: string }
/** Original period models; lengths are uniformly normalized to the parking contract. */
export const CUSTOMER_VEHICLES: readonly CustomerVehicle[] = [
  { id: 'period-hatchback', modelYear: 1987, length: 14, width: 4.38 * 14 / 9, height: 3.35 * 14 / 9, asset: 'car_hatchback.glb' },
  { id: 'period-sedan', modelYear: 1987, length: 14, width: 6.10, height: 4.72, asset: 'car_sedan.glb' },
];
export interface CustomerParkingAssignment { customerId: string; spaceId: number; space: ParkingSpace; vehicle: CustomerVehicle; color: number }
const COLORS = [0x9c3731, 0x385e79, 0xb2a68a, 0x527054, 0xccccbf, 0x493c50, 0x876b42, 0x243c54, 0x778584, 0x813e42];
export function customerStoreYear(theme: string): number {
  // Store era is distinct from the catalog's optional release-date pin.
  const match = /(?:19|20)\d{2}/.exec(theme);
  return match ? Number(match[0]) : /2000/.test(theme) ? 2000 : 1990;
}
export class CustomerParking {
  readonly assignments = new Map<string, CustomerParkingAssignment>();
  version = 0;
  readonly spaces: readonly ParkingSpace[];
  readonly year: number;
  readonly stallWidth: number;
  readonly stallDepth: number;
  readonly vehicles: readonly CustomerVehicle[];
  constructor(spaces: readonly ParkingSpace[], year: number,
    stallWidth = 9, stallDepth = 18, vehicles = CUSTOMER_VEHICLES) {
    this.spaces=spaces;this.year=year;this.stallWidth=stallWidth;this.stallDepth=stallDepth;this.vehicles=vehicles;
  }
  eligible(vehicle: CustomerVehicle): boolean {
    return vehicle.modelYear <= this.year && vehicle.length + .6 <= this.stallDepth && vehicle.width + .6 <= this.stallWidth;
  }
  reserve(customerId: string): CustomerParkingAssignment | null {
    const existing = this.assignments.get(customerId);
    if (existing) return existing;
    const index = Number(customerId.slice(-2)) || 1;
    const eligible = this.vehicles.filter(v => this.eligible(v));
    if (!eligible.length) return null;
    // Select only among period/capacity-compatible models before reserving a space.
    const vehicle = eligible[(index - 1) % eligible.length];
    // Stable search order per identity; no vehicle enters an excluded/reserved bay.
    for (let n = 0; n < this.spaces.length; n++) {
      const spaceId = (index - 1 + n) % this.spaces.length, space = this.spaces[spaceId];
      if (space.accessible || space.reserved || [...this.assignments.values()].some(a => a.spaceId === spaceId)) continue;
      const assignment = { customerId, spaceId, space, vehicle, color: COLORS[(index - 1) % COLORS.length] };
      this.assignments.set(customerId, assignment); this.version++; return assignment;
    }
    return null;
  }
  release(customerId: string): void { if (this.assignments.delete(customerId)) this.version++; }
  clear(): void { if (this.assignments.size) { this.assignments.clear(); this.version++; } }
}
