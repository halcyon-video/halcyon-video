/** Shared entrance depth, in feet. Side glazing frames the door rather than its approach. */
export interface VestibuleSpec { doorWidth: number; entryStyle: 'vestibule' | 'storefront-door' }
export function vestibuleLayout(spec: VestibuleSpec, frontZ = 15) {
  const hasChamber = spec.entryStyle === 'vestibule';
  const rearPanelDepth = hasChamber ? 1 : 0;
  const frontPanelDepth = hasChamber ? spec.doorWidth + 1.4 : 0;
  const depth = hasChamber ? rearPanelDepth + spec.doorWidth + frontPanelDepth : 0;
  const backZ = frontZ - depth;
  const sideDoorZ = hasChamber ? backZ + rearPanelDepth + spec.doorWidth / 2 : frontZ;
  return { depth, backZ, sideDoorZ, frontPanelDepth, rearPanelDepth };
}
/** Existing band prop coordinates use the original 3.2-foot-door datum. */
export function counterDatumShift(spec: VestibuleSpec): number {
  return spec.entryStyle === 'vestibule' ? vestibuleLayout(spec).backZ - 8.6 : 0;
}
