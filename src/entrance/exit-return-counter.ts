import * as THREE from 'three';
import type { FixtureContext } from '../fixtures';
import { brandPackDir } from '../brand-pack';
import { onBrandChange } from '../brand-live';
import { getActiveTheme } from '../themes';
import type { Footprint } from '../layout-validator';
import { installDisplayModel } from '../fixtures/display-model';
import { prepareRetailModel } from '../fixtures/retail-model';
import { getRentalCaseGeometry, createHeroRentalMaterials, CASE_DEPTH } from '../video-case';

import { exitReturnLayout, exitReturnSegments, type ExitGeometry } from '../exit-return-layout';

/** The countertop, not the stock, forms the exit passage. Employee side is +Z. */
export function buildExitReturnCounter(ctx: FixtureContext, parent: THREE.Group, vest: ExitGeometry): Footprint[] {
  const footprint=exitReturnLayout(ctx.storeWidth,vest);if(!footprint)return [];
  const length=footprint.w;
  const segments=exitReturnSegments(footprint);
  const root=new THREE.Group();root.name='exit-return-counter';
  root.position.set(footprint.cx,0,footprint.cz+footprint.d/2);root.rotation.y=footprint.yaw;parent.add(root);
  const body = new THREE.MeshStandardMaterial({ color: ctx.activeTheme.palette.counterBody, roughness: .58 });
  const top = new THREE.MeshStandardMaterial({ color: ctx.activeTheme.palette.counterTop, roughness: .38 });
  const plinth = new THREE.MeshStandardMaterial({ color: 0x191919, roughness: .7 });
  const fallback = new THREE.Group(); root.add(fallback);
  const worktop = new THREE.MeshStandardMaterial({color:ctx.activeTheme.palette.counterBody,roughness:.5});
  const stripe = new THREE.MeshStandardMaterial({color:ctx.activeTheme.palette.secondary,roughness:.5});
  for(const f of segments) {
    const lower=f.label.includes('worktop');
    const piece=new THREE.Group();piece.position.set(f.cx-footprint.cx,0,f.cz-root.position.z);piece.rotation.y=f.yaw;
    for(const [height,y,material] of (lower ? [[2.7,1.35,body],[.12,2.76,worktop]] :
      [[2.28,1.14,body],[1.26,2.91,top],[.13,3.29,stripe]]) as [number,number,THREE.Material][]) {
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(f.w,height,f.d),material);
      mesh.position.y=y;mesh.castShadow=mesh.receiveShadow=true;piece.add(mesh);
    }
    fallback.add(piece);
  }
  const unsubscribe=onBrandChange(()=>{const t=getActiveTheme();body.color.set(t.palette.counterBody);
    worktop.color.set(t.palette.counterBody);top.color.set(t.palette.counterTop);stripe.color.set(t.palette.secondary);});
  ctx.addCollider(fallback);
  const rel = 'fixtures/exit-return-counter/counter.glb';
  const pack = brandPackDir();
  const hosted = import.meta.env.VITE_DEMO === '1';
  const paths = [...(!hosted && pack ? [`user-assets/${pack}/${rel}`] : []),
    ...(!hosted ? [`user-assets/${rel}`] : []), 'models/exit-return-counter.glb'];
  const release = installDisplayModel(ctx,root,fallback,paths,
    {CounterBody:body,CounterTop:top,CounterWorktop:worktop,CounterInlay:stripe,CounterPlinth:plinth},new THREE.Vector3(length/15.5,1,length/15.5),prepareRetailModel);
  const titles = ctx.libraries.flatMap(l=>l.movies).filter(m=>!m.discovery&&!m.collectionGap&&!m.comingSoon&&!m.game).slice(0,5);
  const stacks: THREE.InstancedMesh[]=[];
  const pose = new THREE.Object3D();
  const geometry = getRentalCaseGeometry(false).clone();
  titles.forEach((movie,index)=>{
    // These cached shelf materials belong to video-case, including live artwork refresh.
    const materials = createHeroRentalMaterials(movie);
    const levels = 3 + index % 3;
    const stack = new THREE.InstancedMesh(geometry,materials,levels);
    stack.name='Store-copy returns awaiting reshelving';
    for(let level=0;level<levels;level++) {
      // Cases lie flat wholly on the employee half, never in the passage.
      pose.position.set((-2.7+index*1.35)*length/15.5,2.82+CASE_DEPTH/2+level*CASE_DEPTH,-1.45*footprint.d/11.5);
      pose.rotation.set(-Math.PI/2,0,(index%2?1:-1)*.035);
      pose.updateMatrix();stack.setMatrixAt(level,pose.matrix);
    }
    stack.castShadow=stack.receiveShadow=true;stack.computeBoundingSphere();
    root.add(stack);stacks.push(stack);
  });
  parent.addEventListener('removed',function retire(){
    parent.removeEventListener('removed',retire);unsubscribe();release();geometry.dispose();stacks.forEach(stack=>stack.dispose());
    fallback.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});body.dispose();top.dispose();plinth.dispose();worktop.dispose();stripe.dispose();root.removeFromParent();
  });
  ctx.requestShadowRefresh();
  return segments;
}
