import * as THREE from 'three';
import profile from './storefront-cone-canopy-profile.json';
import { fitFacadeEntryVertex } from './storefront-entry-fit';

/** Lightweight, independently renderable fallback for the authored slate pavilion. */
export function buildConeCanopyFallback(
  group: THREE.Group, finishes: Record<string, THREE.Material>,
  ceilingY: number, half: number, opening: number,
): void {
  const add = (name: string, geometry: THREE.BufferGeometry, material: string) => {
    const positions = geometry.getAttribute('position');
    for (let i=0; i<positions.count; i++) {
      const [x,y] = fitFacadeEntryVertex(positions.getX(i), positions.getY(i), ceilingY, half, opening, 'cone-canopy');
      positions.setXYZ(i,x,y,positions.getZ(i));
    }
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, finishes[material]);
    mesh.name = name; mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  };
  const box = (name: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, material: string) =>
    add(name, new THREE.BoxGeometry(x1-x0,y1-y0,z1-z0).translate((x0+x1)/2,(y0+y1)/2,(z0+z1)/2), material);
  const {spanHalf: w, front, bottom, top} = profile;
  // Recessed substrate and panel joints; separate front and side sheets meet at corners.
  box('Canopy substrate',-w+.1,w-.1,bottom+.12,top-.15,.1,front-.1,'FacadeCoping');
  for (let row=0; row<3; row++) {
    const lo=bottom+.12+row*(top-bottom-.27)/3, hi=bottom+.12+(row+1)*(top-bottom-.27)/3-.035;
    box('Slate front panel',-w,w,lo,hi,front-.1,front,'FacadeCanopy');
    for (const s of [-1,1]) box('Slate return panel',s<0?-w:w-.1,s<0?-w+.1:w,lo,hi,.1,front-.1,'FacadeCanopy');
  }
  box('Coping cap',-w-.06,w+.06,top-.15,top,.02,front+.06,'FacadeCoping');
  box('Soffit',-w,w,bottom,bottom+.12,.1,front,'FacadeSoffit');
  for (const s of [-1,1]) {
    add('Inverted cone and tiered capital', new THREE.LatheGeometry(profile.pillarProfile.map(([r,y])=>new THREE.Vector2(r,y)),48).translate(s*profile.pillarX,0,profile.pillarZ),'FacadeCanopy');
    const a=s<0?-profile.massHalf:5.55, b=s<0?-5.55:profile.massHalf;
    box('Rear glazing jamb',a,b,0,bottom,-.18,.25,'FacadeSlate');
    box('Recessed downlight',s*4-.32,s*4+.32,bottom-.015,bottom,.1+5.8,.1+6.44,'FacadeDownlight');
  }
}
