import type { Footprint } from './layout-validator.ts';
export interface ExitGeometry { xL: number; frontZ: number; sideDoorZ: number; doorW: number; hasChamber: boolean }
/** Conservative furniture envelope shared by placement, navigation and the mesh. */
export function exitReturnLayout(storeWidth: number,vest: ExitGeometry): Footprint | null {
  if (!vest.hasChamber) return null;
  const yaw=-Math.atan(.34), c=Math.cos(yaw), s=Math.sin(yaw);
  const endX=vest.xL-.58;
  const endZ=Math.max(vest.sideDoorZ+vest.doorW/2+1.05,vest.frontZ-1.30);
  const length=Math.min(15.5,(endX-(11-storeWidth/2)-3.5)/c);
  if(length<7)return null;
  return {label:'structure:exit-return-counter',kind:'structure',cx:endX-length*c/2,cz:endZ+length*s/2,w:length,d:2.5,yaw};
}
