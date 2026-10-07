import { RETURN_WINDOW_CLEARANCE } from '../exit-return-layout';
import quickDrop from '../exit-return-spec.json' with { type: 'json' };
import { markSignMesh } from '../sign-builders';
import * as THREE from 'three';
import type { FixtureContext } from '../fixtures';
import { BB_ARCHIVO_BLACK, ensureBundledFont } from '../bundled-fonts';
import { onBrandChange } from '../brand-live';
import { getActiveTheme } from '../themes';

/** Window vinyl over the receiving well; the glazing stays uninterrupted. */
export function addFastReturnWindow(ctx: FixtureContext, root: THREE.Group, scale: number) {
  const group = new THREE.Group(); group.name = 'fast-return-window';
  // Keep the outward vinyl just clear of the glazing to avoid z-fighting.
  group.position.set(quickDrop.receiverX*scale,0,quickDrop.glassOffset + RETURN_WINDOW_CLEARANCE + quickDrop.faceClearance - .025); root.add(group);
  const geometries: THREE.BufferGeometry[]=[];
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=200;
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const labelMat=new THREE.MeshStandardMaterial({map:texture,transparent:true,depthWrite:true,alphaTest:.1,side:THREE.DoubleSide,roughness:.8,metalness:0});
  const geo=new THREE.PlaneGeometry(2.75*scale,.54);geometries.push(geo);
  const label=markSignMesh(new THREE.Mesh(geo,labelMat));label.name='FAST RETURN outward window vinyl';label.position.set(0,quickDrop.labelHeight,.035);group.add(label);
  let disposed=false;
  const paint=()=>{
    if(disposed)return;
    const t=getActiveTheme();
    const c=canvas.getContext('2d')!;c.clearRect(0,0,1024,200);
    c.font=`120px "${BB_ARCHIVO_BLACK}"`;c.textAlign='center';c.textBaseline='middle';
    c.lineJoin='round';c.lineWidth=9;c.strokeStyle=t.palette.primary;c.fillStyle=t.palette.secondary;
    c.strokeText('FAST RETURN',512,105,990);c.fillText('FAST RETURN',512,105,990);
    texture.needsUpdate=true;ctx.requestRender();
  };
  ensureBundledFont(BB_ARCHIVO_BLACK,paint);paint();const unsubscribe=onBrandChange(paint);
  return ()=>{disposed=true;unsubscribe();geometries.forEach(g=>g.dispose());
    labelMat.dispose();texture.dispose();group.removeFromParent();};
}
