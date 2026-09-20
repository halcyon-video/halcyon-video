import { markSignMesh } from '../sign-builders';
import * as THREE from 'three';
import type { FixtureContext } from '../fixtures';
import { BB_ARCHIVO_BLACK, ensureBundledFont } from '../bundled-fonts';
import { onBrandChange } from '../brand-live';
import { getActiveTheme } from '../themes';

/** Glazing infill over the receiving well; the millwork owns the through-wall hood. */
export function addFastReturnWindow(ctx: FixtureContext, root: THREE.Group, scale: number) {
  const group = new THREE.Group(); group.name = 'fast-return-window';
  group.position.set(5.6*scale,0,.38); root.add(group);
  const panel = new THREE.MeshStandardMaterial({color:ctx.activeTheme.palette.counterBody,roughness:.62});
  const metal = new THREE.MeshStandardMaterial({color:0xd5d4ce,roughness:.58,metalness:.15});
  const flapMaterial = new THREE.MeshStandardMaterial({color:0x454749,roughness:.7});
  const geometries: THREE.BufferGeometry[]=[];
  const box=(w:number,h:number,x:number,y:number,material:THREE.Material)=>{
    const geo=new THREE.BoxGeometry(w*scale,h,.05);geometries.push(geo);
    const mesh=new THREE.Mesh(geo,material);mesh.position.set(x*scale,y,0);group.add(mesh);
    mesh.castShadow=mesh.receiveShadow=true;return mesh;
  };
  // Two-foot tape aperture is genuinely open between the infill rails.
  box(2.3,.16,0,4.23,panel);box(2.3,.88,0,3.26,panel);
  box(.16,.39,-1.07,3.91,metal);box(.16,.39,1.07,3.91,metal);
  const flap=box(1.96,.32,0,3.90,flapMaterial);flap.position.z=-.07;flap.rotation.x=-.12;
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=200;
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const labelMat=new THREE.MeshStandardMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.FrontSide,roughness:.8,metalness:0});
  const geo=new THREE.PlaneGeometry(2.75*scale,.54);geometries.push(geo);
  const label=markSignMesh(new THREE.Mesh(geo,labelMat));label.name='FAST RETURN outward window vinyl';label.position.set(0,4.8,.015);group.add(label);
  let disposed=false;
  const paint=()=>{
    if(disposed)return;
    const t=getActiveTheme();panel.color.set(t.palette.counterBody);
    const c=canvas.getContext('2d')!;c.clearRect(0,0,1024,200);
    c.font=`120px "${BB_ARCHIVO_BLACK}"`;c.textAlign='center';c.textBaseline='middle';
    c.lineJoin='round';c.lineWidth=9;c.strokeStyle=t.palette.primary;c.fillStyle=t.palette.secondary;
    c.strokeText('FAST RETURN',512,105,990);c.fillText('FAST RETURN',512,105,990);
    texture.needsUpdate=true;ctx.requestRender();
  };
  ensureBundledFont(BB_ARCHIVO_BLACK,paint);paint();const unsubscribe=onBrandChange(paint);
  return ()=>{disposed=true;unsubscribe();geometries.forEach(g=>g.dispose());
    panel.dispose();metal.dispose();flapMaterial.dispose();labelMat.dispose();texture.dispose();group.removeFromParent();};
}
