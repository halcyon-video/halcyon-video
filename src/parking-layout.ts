// Shared world-space plan for pavement, paint, vehicles and concrete edges (feet).
export interface ParkingSpace { x: number; z: number; yaw: number; accessible?: boolean; reserved?: boolean }
export function parkingLayout(storeWidth: number, sidewalkDepth: number, backWallZ: number, centerX = 11, frontZ = 15) {
  const stallWidth = 9, stallDepth = 18, laneDepth = 24, sideWalk = 4;
  const left = centerX - storeWidth / 2 - sideWalk;
  const right = centerX + storeWidth / 2 + sideWalk;
  const rearZ = backWallZ - sideWalk;
  const nearZ = frontZ + sidewalkDepth + .3;
  const farRowZ = nearZ + stallDepth + laneDepth;
  const farZ = farRowZ + stallDepth;
  const minX = left - stallDepth - laneDepth;
  const maxX = right + stallDepth + laneDepth;
  const drivewayMinX = maxX - laneDepth;
  const streetZ = farZ + 12 + 5;
  const halfCount = Math.max(1, Math.floor((right - left) / stallWidth / 2 - .5));
  const spaces: ParkingSpace[] = [];
  // The central near bay is a clear pedestrian aisle leading to the ramp.
  for (let i = -halfCount; i <= halfCount; i++) {
    if (i !== 0) spaces.push({x: centerX + i * stallWidth, z: nearZ + stallDepth / 2, yaw: 0});
    spaces.push({x: centerX + i * stallWidth, z: farRowZ + stallDepth / 2, yaw: Math.PI});
  }
  const sideCount = Math.floor((frontZ - rearZ) / stallWidth);
  for (let i = 0; i < sideCount; i++) {
    const z = frontZ - (i + .5) * stallWidth;
    spaces.push({x: left - stallDepth / 2, z, yaw: Math.PI / 2});
    spaces.push({x: right + stallDepth / 2, z, yaw: -Math.PI / 2});
  }
  return {centerX, frontZ, left, right, rearZ, nearZ, farRowZ, farZ, minX, maxX,
    drivewayMinX, streetZ, stallWidth, stallDepth, laneDepth, sidewalkDepth, spaces};
}
export type ParkingLayout = ReturnType<typeof parkingLayout>;

// The through street beyond the lot's street walk (feet). GH #398: it runs far
// past the lot's sides so its ends sit out on the opaque ground surround
// (exterior-ground-surround.ts) rather than terminating against the photograph.
export const STREET_CURB_DEPTH = 0.4;
export const STREET_GUTTER_DEPTH = 1.6;
export const STREET_ROAD_DEPTH = 26;
export const STREET_OVERHANG = 150;
/** World extent of the through street for a lot whose street edge is at curbZ. */
export function roadSpan(minX: number, maxX: number, curbZ: number) {
  const nearZ = curbZ + STREET_CURB_DEPTH + STREET_GUTTER_DEPTH;
  return { minX: minX - STREET_OVERHANG, maxX: maxX + STREET_OVERHANG, nearZ, farZ: nearZ + STREET_ROAD_DEPTH };
}
