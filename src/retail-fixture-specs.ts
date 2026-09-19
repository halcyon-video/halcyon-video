import type { Footprint } from './layout-validator.ts';
import type { FixturePlacement } from './store-layout.ts';

// Conservative envelopes include both the exported models and loading fallbacks.
// Feet; floor origin, X across and local +Z toward the customer.
export const RETAIL_FIXTURE_SPECS = {
  'acrylic-popcorn-bin': { w: 2.2, h: 4, d: 2.2, clearance: 3 },
  'rotating-merchandiser': { w: 2.2, h: 5.25, d: 2.2, clearance: 3 },
  'two-door-cooler': { w: 4.2, h: 6.5, d: 2.6, clearance: 1.5 },
  'chest-freezer': { w: 3.9, h: 2.8, d: 2.3, clearance: 1.5 },
  'candy-wall-gondola': { w: 4, h: 5, d: 1.6, clearance: 1.5 },
  'secondary-service-counter': { w: 5.4, h: 3.8, d: 2.9, clearance: 1.5 },
} as const;
export type RetailFixtureKind = keyof typeof RETAIL_FIXTURE_SPECS;
export function retailFixtureFootprint(kind: RetailFixtureKind, placement: FixturePlacement): Footprint {
  const { w, d, clearance } = RETAIL_FIXTURE_SPECS[kind];
  return { label: `fixture:${placement.id}`, kind: 'fixture',
    cx: placement.position.x, cz: placement.position.z, w, d, yaw: placement.yaw, clearance };
}
