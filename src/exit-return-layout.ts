import type { Footprint } from './layout-validator.ts';
export interface ExitGeometry { xL: number; frontZ: number; sideDoorZ: number; doorW: number; hasChamber: boolean }
/** Enclosed returns station against the glass; a short clipped corner clears the exit. */
export function exitReturnLayout(storeWidth: number,vest: ExitGeometry): Footprint | null {
  if (!vest.hasChamber) return null;
  const right=vest.xL-.58;
  const width=Math.min(15.5,right-(11-storeWidth/2)-3.6);
  if(width<7)return null;
  return {label:'structure:exit-return-counter',kind:'structure',cx:right-width/2,
    cz:vest.frontZ-.18-9.4/2,w:width,d:9.4,yaw:0};
}

/** Physical millwork only: preserve the open interior and the left staff entrance. */
export function exitReturnSegments(f: Footprint): Footprint[] {
  const sx=f.w/15.5, back=f.cz+f.d/2;
  const segment=(a:number[],b:number[],depth:number,label:string):Footprint=>{
    const dx=(b[0]-a[0])*sx,dz=b[1]-a[1],length=Math.hypot(dx,dz);
    const nx=-dz/length,nz=dx/length;
    return {label:'structure:return-'+label,kind:'structure',cx:f.cx+(a[0]+b[0])*sx/2+nx*depth/2,
      cz:back+(a[1]+b[1])/2+nz*depth/2,w:length,d:depth,yaw:-Math.atan2(dz,dx)};
  };
  return [segment([-7.75,-4.8],[-7.75,-9.4],.8,'left'),
    segment([-7.75,-9.4],[4.75,-9.4],.8,'front'),
    segment([4.75,-9.4],[7.75,-6.4],.8,'corner'),
    segment([7.75,-6.4],[7.75,0],.8,'right'),
    segment([7.75,0],[-7.75,0],.8,'back'),
    segment([-7.75,0],[-7.75,-1.6],.8,'rear-end'),
    segment([3.5,-.8],[-6.95,-.8],1.4,'window-worktop'),
    segment([-6.95,-8.6],[4,-8.6],1.3,'inner-worktop')];
}
