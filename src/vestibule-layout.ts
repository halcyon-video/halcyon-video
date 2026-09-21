/** Shared entrance depth, in feet. Side glazing frames the door rather than its approach. */
export interface VestibuleSpec { doorWidth: number; entryStyle: 'vestibule' | 'storefront-door'; counterShape?: string }
export function vestibuleLayout(spec: VestibuleSpec, frontZ = 15) {
  const hasChamber = spec.entryStyle === 'vestibule';
  const rearPanelDepth = hasChamber ? 1 : 0;
  const frontPanelDepth = hasChamber ? (spec.doorWidth + 1) * Math.SQRT1_2 - 1 : 0;
  const depth = hasChamber ? rearPanelDepth + spec.doorWidth + frontPanelDepth : 0;
  const backZ = frontZ - depth;
  const sideDoorZ = hasChamber ? backZ + rearPanelDepth + spec.doorWidth / 2 : frontZ;
  return { depth, backZ, sideDoorZ, frontPanelDepth, rearPanelDepth };
}
/** Existing band prop coordinates use the original 3.2-foot-door datum. */
export function counterDatumShift(spec: VestibuleSpec): number {
  return spec.entryStyle === 'vestibule' ? vestibuleLayout(spec).backZ - 8.6 : 0;
}

export const vestibuleBackHalf = (spec: VestibuleSpec) => spec.counterShape === 'usquare' ? 6.8 : 6.2;

/** The clipped rear corners mirror the shield shoulders; the frontage stays straight. */
export function vestibuleFrontHalf(spec: VestibuleSpec) {
  return vestibuleBackHalf(spec) + (spec.doorWidth + 1) * Math.SQRT1_2;
}
export function vestibuleSide(spec: VestibuleSpec, side: -1 | 1, cx = 11) {
  const v = vestibuleLayout(spec), length = spec.doorWidth + 1;
  const sin = side * Math.SQRT1_2, cos = Math.SQRT1_2;
  const x = cx + side * vestibuleBackHalf(spec), z = v.backZ;
  const doorAlong = length / 2;
  return {x,z,length,sin,cos,yaw:Math.atan2(sin,cos),doorAlong,doorWidth:length,
    doorX:x+sin*doorAlong,doorZ:z+cos*doorAlong};
}
export function vestibuleStraightSide(spec: VestibuleSpec, side: -1 | 1, cx = 11) {
  const corner = vestibuleSide(spec,side,cx);
  const x=corner.x+corner.sin*corner.length, z=corner.z+corner.cos*corner.length;
  return {x,z,length:15-z,sin:0,cos:1,yaw:0,doorAlong:-100,doorWidth:0,doorX:x,doorZ:z};
}

/** Resolve a walking body against one slanted wall, leaving its door open. */
export function clampVestibuleSide(point: {x:number;z:number}, old: {x:number;z:number},
  wall: ReturnType<typeof vestibuleSide>, _doorWidth:number, radius:number, doorRadius:number) {
  const dx=point.x-wall.x,dz=point.z-wall.z;
  const along=dx*wall.sin+dz*wall.cos;
  if(along < -radius || along > wall.length+radius || Math.abs(along-wall.doorAlong)<=wall.doorWidth/2-doorRadius) return point;
  const normal=dx*wall.cos-dz*wall.sin;
  const oldNormal=(old.x-wall.x)*wall.cos-(old.z-wall.z)*wall.sin;
  const clamped=oldNormal<0?Math.min(normal,-radius):Math.max(normal,radius);
  return {x:point.x+(clamped-normal)*wall.cos,z:point.z-(clamped-normal)*wall.sin};
}

/** Exit-only sensor pair on the sales-floor side of the tapered doorway. */
export function vestibuleExitGates(spec: VestibuleSpec) {
  const wall=vestibuleSide(spec,-1), standOff=-1.2, half=wall.doorWidth/2+.55;
  return [-half,half].map(along=>({x:wall.doorX+standOff*wall.cos+along*wall.sin,
    z:wall.doorZ-standOff*wall.sin+along*wall.cos,yaw:wall.yaw}));
}
