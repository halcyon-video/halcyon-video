// Feet; exact mating planes. Only the span axis is stretched on curb/pan parts.
export interface EdgePart {
  part: 'CurbSpan' | 'CurbJunction' | 'GutterSpan' | 'SidewalkSpan' | 'SidewalkReturn';
  x: number; z: number; length: number; yaw?: number; mirror?: boolean; depth?: number;
}
export interface EdgeBounds {
  centerX: number; minX: number; maxX: number; frontZ: number; farZ: number;
}
export function curbKitPlan(bounds: EdgeBounds, sidewalkWidth: number, sidewalkDepth: number): EdgePart[] {
  const {centerX, minX, maxX, frontZ, farZ} = bounds;
  const parts: EdgePart[] = [];
  function span(part: EdgePart['part'], x: number, z: number, length: number, yaw = 0) {
    // No geometric gaps or bevels at mating ends; fine joints live in the texture.
    const count = Math.ceil(length / 4.5);
    for (let i=0; i<count; i++) {
      const start = length*i/count;
      parts.push({part, x:x+Math.cos(yaw)*start, z:z-Math.sin(yaw)*start, length:length/count, yaw});
    }
  }
  const left = centerX-sidewalkWidth/2;
  parts.push({part:'SidewalkSpan',x:left+.2,z:frontZ,length:sidewalkWidth-.4,depth:sidewalkDepth});
  parts.push({part:'SidewalkReturn',x:left,z:frontZ,length:1,depth:sidewalkDepth});
  parts.push({part:'SidewalkReturn',x:left+sidewalkWidth,z:frontZ,length:1,depth:sidewalkDepth,mirror:true});
  span('CurbSpan',left,frontZ+sidewalkDepth-.15,sidewalkWidth);
  // Side curb ends at the junction's rear face (no old box overlap at farZ).
  span('CurbSpan',minX+.2,frontZ,farZ-frontZ,-Math.PI/2);
  span('CurbSpan',maxX+.2,frontZ,farZ-frontZ,-Math.PI/2);
  for (const x of [minX,maxX]) parts.push({part:'CurbJunction',x:x-.2,z:farZ,length:1});
  span('CurbSpan',minX-70,farZ,69.8);
  span('CurbSpan',minX+.2,farZ,maxX-minX-.4);
  span('CurbSpan',maxX+.2,farZ,69.8);
  span('GutterSpan',minX-70,farZ+.4,maxX-minX+140);
  return parts;
}
