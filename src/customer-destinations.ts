import type { NavPoint } from './clerk-nav.ts';
import { customerPreferenceWeight, type CustomerPreference } from './customer-preferences.ts';

/** A taken favorite hands its pull to open positions within this many feet. */
export const NEARBY_FALLBACK_RADIUS = 12;
/** Positions visited in the last couple of stops are less likely, never excluded. */
export const RECENT_STOP_FACTOR = .35, RECENT_STOP_MEMORY = 2;
export interface DestinationOption extends NavPoint { id: string; departments: readonly string[] }

const departmentKey = (s: DestinationOption) => [...s.departments].sort().join('|');
/**
 * Selection weights for `open` positions. Each department's weight is divided
 * across its open positions so a long aisle cannot drown a short section. A
 * `taken` position (reserved, crowded or occupied) that the shopper would have
 * preferred spills its extra pull onto open positions nearby, falling off with
 * distance, so the fallback is the next section over rather than a random one
 * across the store. Recently visited positions are damped to vary the loop.
 */
export function customerDestinationWeights(profile: CustomerPreference, open: readonly DestinationOption[],
  taken: readonly DestinationOption[], recent: readonly string[] = []): number[] {
  const openCounts = new Map<string, number>(), allCounts = new Map<string, number>();
  for (const s of open) { const k = departmentKey(s); openCounts.set(k, (openCounts.get(k) ?? 0) + 1); allCounts.set(k, (allCounts.get(k) ?? 0) + 1); }
  for (const s of taken) { const k = departmentKey(s); allCounts.set(k, (allCounts.get(k) ?? 0) + 1); }
  const spill: { at: DestinationOption; pull: number }[] = [];
  for (const s of taken) {
    const extra = customerPreferenceWeight(profile, s.departments) - 1;
    if (extra > 0) spill.push({ at: s, pull: extra / allCounts.get(departmentKey(s))! });
  }
  return open.map(s => {
    let weight = customerPreferenceWeight(profile, s.departments) / openCounts.get(departmentKey(s))!;
    for (const { at, pull } of spill) {
      const d = Math.hypot(at.x - s.x, at.z - s.z);
      if (d < NEARBY_FALLBACK_RADIUS) weight += pull * (1 - d / NEARBY_FALLBACK_RADIUS);
    }
    return recent.includes(s.id) ? weight * RECENT_STOP_FACTOR : weight;
  });
}
