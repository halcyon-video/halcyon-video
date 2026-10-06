import type { NavPoint } from './clerk-nav.ts';

function pointSegment(p:NavPoint,a:NavPoint,b:NavPoint):number {
  const dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz;
  const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/length)):0;
  return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
}
function segmentDistance(a:NavPoint,b:NavPoint,c:NavPoint,d:NavPoint):number {
  const rx=b.x-a.x,rz=b.z-a.z,sx=d.x-c.x,sz=d.z-c.z;
  const cross=rx*sz-rz*sx;
  if(Math.abs(cross)>1e-12){
    const qx=c.x-a.x,qz=c.z-a.z,t=(qx*sz-qz*sx)/cross,u=(qx*rz-qz*rx)/cross;
    if(t>=0&&t<=1&&u>=0&&u<=1)return 0;
  }
  return Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b));
}
/** Remaining routes are spatial reservations; crossing routes wait their turn. */
export function customerRoutesSeparated(a:readonly NavPoint[],b:readonly NavPoint[],clearance:number):boolean {
  if(!a.length||!b.length)return true;
  for(let i=0;i<Math.max(1,a.length-1);i++)for(let j=0;j<Math.max(1,b.length-1);j++) {
    if(segmentDistance(a[i],a[Math.min(i+1,a.length-1)],b[j],b[Math.min(j+1,b.length-1)])<clearance-1e-8)return false;
  }
  return true;
}
/** Circle samples feed the existing occupied-cell A*, not a second pathfinder. */
export function customerRouteObstacles(points:readonly NavPoint[],radius:number): (NavPoint&{radius:number})[] {
  if(!points.length)return [];
  const result=[{x:points[0].x,z:points[0].z,radius}];
  for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/2));
    for(let j=1;j<=n;j++)result.push({x:a.x+(b.x-a.x)*j/n,z:a.z+(b.z-a.z)*j/n,radius});
  }
  return result;
}
