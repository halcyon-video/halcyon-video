import type { Footprint } from './layout-validator.ts';
export interface ExitGeometry { xL: number; frontZ: number; sideDoorZ: number; doorW: number; hasChamber: boolean }
/** Returns station against the glass; an angled customer face opens beside the exit. */
export function exitReturnLayout(storeWidth: number,vest: ExitGeometry): Footprint | null {
  if (!vest.hasChamber) return null;
  const right=vest.xL-.15;
  const width=Math.min(15.5,right-(11-storeWidth/2)-3.6);
  if(width<6.4)return null;
  // Uniform plan scaling preserves the model's 45-degree customer faces.
  const depth=width*11.5/15.5;
  return {label:'structure:exit-return-counter',kind:'structure',cx:right-width/2,
    cz:vest.frontZ-.18-depth/2,w:width,d:depth,yaw:0};
}

/** Physical millwork only: preserve the open interior and vestibule-side staff entrance. */
export function exitReturnSegments(f: Footprint): Footprint[] {
  const sx=f.w/15.5, sz=sx, back=f.cz+f.d/2;
  const segment=(a:number[],b:number[],depth:number,label:string):Footprint=>{
    depth *= sx;
    const dx=(b[0]-a[0])*sx,dz=(b[1]-a[1])*sz,length=Math.hypot(dx,dz);
    const nx=-dz/length,nz=dx/length;
    return {label:'structure:return-'+label,kind:'structure',cx:f.cx+(a[0]+b[0])*sx/2+nx*depth/2,
      cz:back+(a[1]+b[1])*sz/2+nz*depth/2,w:length,d:depth,yaw:-Math.atan2(dz,dx)};
  };
  return [segment([7.75,-2.4],[7.75,0],.8,'vestibule-stub'),
    segment([7.75,0],[-7.75,0],.8,'back'),
    segment([-7.75,0],[-7.75,-5.75],.8,'left'),
    segment([-7.75,-5.75],[-2,-11.5],.8,'outer-angle'),
    segment([-2,-11.5],[3.25,-6.25],.8,'front-angle'),
    segment([6.95,-.8],[-6.95,-.8],1.4,'window-worktop'),
    segment([-6.95,-5.35],[-2,-10.3],1.3,'inner-worktop-left'),
    segment([-2,-10.3],[2.4,-5.9],1.3,'inner-worktop-right')];
}
