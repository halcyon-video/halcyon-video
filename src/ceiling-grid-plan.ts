// Geometry-only plan. Feet; source span X=0..1, +Z points into the field.
export interface GridPoint { x: number; z: number }
export interface GridSpan { a: GridPoint; b: GridPoint; edge: boolean }
export interface CeilingGridPlan { spans: GridSpan[]; joints: GridPoint[] }
const key = (p: GridPoint) => `${p.x.toFixed(5)},${p.z.toFixed(5)}`;

/** One rail per shared tile boundary; exposed edges become inward-facing angles. */
export function moduleGridPlan(centers: GridPoint[], width: number, depth: number): CeilingGridPlan {
  const edges = new Map<string, { a: GridPoint; b: GridPoint; count: number }>();
  for (const p of centers) {
    const corners = [{x:p.x-width/2,z:p.z-depth/2},{x:p.x+width/2,z:p.z-depth/2},
      {x:p.x+width/2,z:p.z+depth/2},{x:p.x-width/2,z:p.z+depth/2}];
    for (let i=0;i<4;i++) {
      const a=corners[i], b=corners[(i+1)%4], id=[key(a),key(b)].sort().join('|');
      const previous=edges.get(id); if(previous) previous.count++; else edges.set(id,{a,b,count:1});
    }
  }
  const joints=new Map<string,GridPoint>();
  const spans=Array.from(edges.values(),e=>{
    if(e.count>1){joints.set(key(e.a),e.a);joints.set(key(e.b),e.b);}
    return {a:e.a,b:e.b,edge:e.count===1};
  });
  return {spans,joints:[...joints.values()]};
}

/** Clip a grid to a convex soffit lid; phase matches its printed tile UVs. */
export function polygonGridPlan(poly: GridPoint[], phase: GridPoint, width: number, depth: number): CeilingGridPlan {
  if(poly.length<3)return {spans:[],joints:[]};
  const spans:GridSpan[]=poly.map((a,i)=>({a,b:poly[(i+1)%poly.length],edge:true}));
  const minX=Math.min(...poly.map(p=>p.x)),maxX=Math.max(...poly.map(p=>p.x));
  const minZ=Math.min(...poly.map(p=>p.z)),maxZ=Math.max(...poly.map(p=>p.z));
  const clip=(axis:'x'|'z',v:number):GridPoint[]=>{
    const other=axis==='x'?'z':'x', hits:number[]=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length];
      if(Math.abs(a[axis]-b[axis])<1e-8)continue;
      const t=(v-a[axis])/(b[axis]-a[axis]);
      if(t>=0&&t<=1)hits.push(a[other]+t*(b[other]-a[other]));
    }
    if(hits.length<2)return [];
    const lo=Math.min(...hits),hi=Math.max(...hits);
    if(hi-lo<.15)return [];
    return axis==='x'?[{x:v,z:lo},{x:v,z:hi}]:[{x:lo,z:v},{x:hi,z:v}];
  };
  // Continuous runners meet cross tees without duplicate coplanar flanges.
  const xs:number[]=[],zs:number[]=[];
  for(let x=phase.x+Math.ceil((minX-phase.x)/width)*width;x<maxX-1e-6;x+=width)if(x>minX+1e-6)xs.push(x);
  for(let z=phase.z+Math.ceil((minZ-phase.z)/depth)*depth;z<maxZ-1e-6;z+=depth)if(z>minZ+1e-6)zs.push(z);
  const joints=new Map<string,GridPoint>();
  for(const [axis,values,cross] of [['x',xs,zs],['z',zs,xs]] as const)for(const v of values){
    const ends=clip(axis,v);if(!ends.length)continue;
    const other=axis==='x'?'z':'x';
    const points=[ends[0],...cross.filter(c=>c>ends[0][other]+.075&&c<ends[1][other]-.075).map(c=>axis==='x'?{x:v,z:c}:{x:c,z:v}),ends[1]];
    points.slice(1,-1).forEach(p=>joints.set(key(p),p));
    for(let i=0;i<points.length-1;i++)spans.push({a:points[i],b:points[i+1],edge:false});
  }
  // Normalize polygon winding so every angle's +Z points inward.
  const area=poly.reduce((sum,a,i)=>{const b=poly[(i+1)%poly.length];return sum+a.x*b.z-b.x*a.z;},0);
  if(area<0)for(const s of spans)if(s.edge)[s.a,s.b]=[s.b,s.a];
  return {spans,joints:[...joints.values()]};
}
