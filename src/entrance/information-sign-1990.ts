import * as THREE from 'three';
import type { FixtureContext } from '../fixtures';
import type { CounterBuildResult } from './counter';
import { BB_OUTFIT, ensureBundledFont } from '../bundled-fonts';
import { getActiveTheme, themeTrimDarkHex } from '../themes';
import { registerBrandRepaint } from '../brand-live';

/** Slim, double-sided suspended counter marker with gently rounded corners. */
export function addInformationSign1990(ctx: FixtureContext, parent: THREE.Group, counter: CounterBuildResult): void {
  if (ctx.activeTheme.id !== 'bb-1990' || ctx.storefrontSpec.counterShape === 'desk') return;
  const group=new THREE.Group();group.name='information-sign-1990';
  const anchor=counter.spineAt(-4.4), shift=.75+counter.innerDepth/2;
  group.position.set(anchor.x-Math.sin(anchor.rotY)*shift,3.54,anchor.z-Math.cos(anchor.rotY)*shift);
  group.rotation.y=anchor.rotY;parent.add(group);
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=200;
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  let alive=true;
  const paint=()=>{
    if(!alive)return;
    const c=canvas.getContext('2d')!,palette=getActiveTheme().palette;
    c.fillStyle=themeTrimDarkHex();c.fillRect(0,0,1080,200);
    c.fillStyle=palette.secondary;c.font=`400 160px ${BB_OUTFIT}`;
    const metrics=c.measureText('INFORMATION');
    const cap=metrics.actualBoundingBoxAscent,descent=metrics.actualBoundingBoxDescent;
    c.save();c.translate(540,100);c.scale(990/metrics.width,144/(cap+descent));
    c.fillText('INFORMATION',-metrics.width/2,(cap-descent)/2);c.restore();
    texture.needsUpdate=true;ctx.requestRender();
  };
  paint();ensureBundledFont(BB_OUTFIT,paint);
  const unsubscribe=registerBrandRepaint(texture,paint);
  const frame=new THREE.MeshStandardMaterial({color:themeTrimDarkHex(),roughness:.65});
  const face=new THREE.MeshStandardMaterial({map:texture,roughness:.7});
  const parts: THREE.BufferGeometry[]=[];
  const box=(w:number,h:number,d:number,x:number,y:number)=>{
    const geo=new THREE.BoxGeometry(w,h,d);parts.push(geo);
    const mesh=new THREE.Mesh(geo,frame);mesh.position.set(x,y,0);mesh.castShadow=true;group.add(mesh);
  };
  const rodHeight=Math.max(.1,ctx.ceilingY-3.54-3.28);
  for(const x of [-1.15,1.15])box(.035,rodHeight,.035,x,3.28+rodHeight/2);
  const shape=new THREE.Shape(),w=3.8,h=.7,r=.065;
  shape.moveTo(-w/2+r,-h/2);shape.lineTo(w/2-r,-h/2);
  shape.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);shape.lineTo(w/2,h/2-r);
  shape.quadraticCurveTo(w/2,h/2,w/2-r,h/2);shape.lineTo(-w/2+r,h/2);
  shape.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);shape.lineTo(-w/2,-h/2+r);
  shape.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);
  const boardGeo=new THREE.ExtrudeGeometry(shape,{depth:.08,bevelEnabled:false,curveSegments:6});parts.push(boardGeo);
  const board=new THREE.Mesh(boardGeo,frame);board.position.set(0,2.915,-.04);board.castShadow=true;group.add(board);
  const geo=new THREE.ShapeGeometry(shape,6);parts.push(geo);
  const positions=geo.getAttribute('position'),uv=geo.getAttribute('uv');
  for(let i=0;i<uv.count;i++)uv.setXY(i,positions.getX(i)/w+.5,positions.getY(i)/h+.5);
  for(const direction of [-1,1]){
    const mesh=new THREE.Mesh(geo,face);mesh.position.set(0,2.915,direction*.051);
    mesh.rotation.y=direction===1?0:Math.PI;group.add(mesh);
  }
  parent.addEventListener('removed',function retire(){
    parent.removeEventListener('removed',retire);alive=false;unsubscribe();
    parts.forEach(p=>p.dispose());texture.dispose();frame.dispose();face.dispose();group.removeFromParent();
  });
}
