import * as THREE from 'three';
import type { FixtureContext } from '../fixtures';
import { onBrandChange } from '../brand-live';
import { getActiveTheme } from '../themes';
import type { Footprint } from '../layout-validator';
import { installDisplayModel } from '../fixtures/display-model';
import { getRentalCaseGeometry, createHeroRentalMaterials, CASE_DEPTH } from '../video-case';

import { exitReturnLayout, type ExitGeometry } from '../exit-return-layout';

/** The countertop, not the stock, forms the exit passage. Employee side is +Z. */
export function buildExitReturnCounter(ctx: FixtureContext, parent: THREE.Group, vest: ExitGeometry): Footprint[] {
  const footprint=exitReturnLayout(ctx.storeWidth,vest);if(!footprint)return [];
  const length=footprint.w;
  const root=new THREE.Group();root.name='exit-return-counter';
  root.position.set(footprint.cx,0,footprint.cz);root.rotation.y=footprint.yaw;parent.add(root);
  const body = new THREE.MeshStandardMaterial({ color: ctx.activeTheme.palette.counterBody, roughness: .58 });
  const top = new THREE.MeshStandardMaterial({ color: ctx.activeTheme.palette.counterTop, roughness: .38 });
  const plinth = new THREE.MeshStandardMaterial({ color: 0x191919, roughness: .7 });
  const fallback = new THREE.Group(); root.add(fallback);
  const slab = (height: number,y: number,mat: THREE.Material,inset=0) => {
    const shape=new THREE.Shape();
    const outline=[[-7.75,-1.25],[7.75,-1.25],[7.75,-.65],[5.75,1.25],[-7.75,1.25]];
    outline.forEach(([x,z],i)=>{const px=x*length/15.5*(1-inset),pz=z*(1-inset);if(i)shape.lineTo(px,pz);else shape.moveTo(px,pz);});shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false});geometry.rotateX(-Math.PI/2);
    const mesh=new THREE.Mesh(geometry,mat);mesh.position.y=y;mesh.castShadow=mesh.receiveShadow=true;fallback.add(mesh);return mesh;
  };
  slab(2.88,.22,body,.014);slab(.15,3.10,top);slab(.22,0,plinth,.035);
  const unsubscribe=onBrandChange(()=>{const t=getActiveTheme();body.color.set(t.palette.counterBody);top.color.set(t.palette.counterTop);});
  ctx.addCollider(fallback);
  const release = installDisplayModel(ctx,root,fallback,'models/exit-return-counter.glb',
    {ReturnBody:body,ReturnTop:top,ReturnWorktop:body,ReturnPlinth:plinth},new THREE.Vector3(length/15.5,1,1));
  const titles = ctx.libraries.flatMap(l=>l.movies).filter(m=>!m.discovery&&!m.collectionGap&&!m.comingSoon&&!m.game).slice(0,5);
  const ownedMaterials: THREE.Material[]=[];
  const geometry = getRentalCaseGeometry(false).clone();
  titles.forEach((movie,index)=>{
    const materials = createHeroRentalMaterials(movie).map(m=>m.clone());ownedMaterials.push(...materials);
    const levels = 3 + index % 3;
    for(let level=0;level<levels;level++) {
      const copy = new THREE.Mesh(geometry,materials);copy.name='Store-copy returns awaiting reshelving';
      // Cases lie flat wholly on the employee half, never in the passage.
      copy.position.set(-length*.36+index*length*.17,3.25+CASE_DEPTH/2+level*CASE_DEPTH,.67);
      copy.rotation.set(-Math.PI/2,0,(index%2?1:-1)*.035);copy.castShadow=copy.receiveShadow=true;root.add(copy);
    }
  });
  parent.addEventListener('removed',function retire(){
    parent.removeEventListener('removed',retire);unsubscribe();release();geometry.dispose();ownedMaterials.forEach(m=>m.dispose());
    fallback.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});body.dispose();top.dispose();plinth.dispose();root.removeFromParent();
  });
  ctx.requestShadowRefresh();
  return [footprint];
}
