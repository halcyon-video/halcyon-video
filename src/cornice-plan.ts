// Feet, in the store X/Z plane. Every profile shares the same corner bisector.
export interface CornicePoint { x: number; z: number }
export interface CorniceJoint extends CornicePoint { nx: number; nz: number }
export const CORNICE_MIRROR_HEIGHT = 2.3;
export const CORNICE_MIRROR_TILT = 14 * Math.PI / 180;
export function corniceJoints(points: CornicePoint[]): CorniceJoint[] {
  return points.map((p, i) => {
    const a = points[(i + points.length - 1) % points.length], b = points[(i + 1) % points.length];
    const al = Math.hypot(p.x-a.x,p.z-a.z), bl = Math.hypot(b.x-p.x,b.z-p.z);
    if (Math.min(al, bl) < 1e-6) throw new Error('Cornice has a zero-length span');
    const ax = -(p.z-a.z)/al, az = (p.x-a.x)/al;
    const bx = -(b.z-p.z)/bl, bz = (b.x-p.x)/bl;
    const den = 1 + ax*bx + az*bz;
    if (den < .02) throw new Error('Cornice turn doubles back');
    return { ...p, nx: (ax+bx)/den, nz: (az+bz)/den };
  });
}
export function corniceOffset(points: CornicePoint[], distance: number): CornicePoint[] {
  return corniceJoints(points).map(p => ({x:p.x+p.nx*distance,z:p.z+p.nz*distance}));
}
/** Fit a one-foot Blender span without stretching its transverse profile. */
export function fitCorniceVertex(a: CorniceJoint, b: CorniceJoint, t: number, y: number, depth: number): [number,number,number] {
  return [a.x+(b.x-a.x)*t+(a.nx+(b.nx-a.nx)*t)*depth, y,
    a.z+(b.z-a.z)*t+(a.nz+(b.nz-a.nz)*t)*depth];
}
