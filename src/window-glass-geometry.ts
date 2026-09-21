import * as THREE from 'three';
export interface WindowAperture { x: number; width: number; bottom: number; top: number }

/** One glazing sheet with an actual through-opening; reflection reuses this geometry. */
export function windowGlassGeometry(lo:number,hi:number,bottom:number,top:number,hole?:WindowAperture) {
  const outline=new THREE.Shape();
  outline.moveTo(lo,bottom);outline.lineTo(hi,bottom);outline.lineTo(hi,top);outline.lineTo(lo,top);outline.closePath();
  if(hole && hole.x-hole.width/2>lo && hole.x+hole.width/2<hi && hole.bottom>bottom && hole.top<top) {
    const cut=new THREE.Path(),a=hole.x-hole.width/2,b=hole.x+hole.width/2;
    cut.moveTo(a,hole.bottom);cut.lineTo(a,hole.top);cut.lineTo(b,hole.top);cut.lineTo(b,hole.bottom);cut.closePath();
    outline.holes.push(cut);
  }
  const geometry=new THREE.ShapeGeometry(outline),p=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
  for(let i=0;i<p.count;i++)uv.setXY(i,(p.getX(i)-lo)/(hi-lo),(p.getY(i)-bottom)/(top-bottom));
  return geometry;
}
