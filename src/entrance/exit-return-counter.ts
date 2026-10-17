import { FRAME_REVEAL_CENTER } from '../frame-reveal';
import quickDrop from '../exit-return-spec.json' with { type: 'json' };
import { addFastReturnWindow } from './fast-return-window';
import * as THREE from 'three';
import type { FixtureContext } from '../fixtures';
import { brandPackDir } from '../brand-pack';
import { onBrandChange } from '../brand-live';
import { getActiveTheme } from '../themes';
import type { Footprint } from '../layout-validator';
import { installDisplayModel } from '../fixtures/display-model';
import { prepareRetailModel } from '../fixtures/retail-model';
import { getRentalCaseGeometry, createHeroRentalMaterials, CASE_DEPTH } from '../video-case';

import { exitReturnLayout, exitReturnSegments, returnWindowPane, RETURN_WINDOW_CLEARANCE, type ExitGeometry } from '../exit-return-layout';

/** The countertop, not the stock, forms the exit passage. Employee side is +Z. */
export function buildExitReturnCounter(ctx: FixtureContext, parent: THREE.Group, vest: ExitGeometry): Footprint[] {
  const footprint=exitReturnLayout(ctx.storeWidth,vest);if(!footprint)return [];
  const length=footprint.w;
  const pane=returnWindowPane(ctx.storefrontSpec,footprint);
  const metal=new THREE.MeshStandardMaterial({color:0x9fa5ab,roughness:.36,metalness:.85});
  metal.name='CounterReturnMetal';
  const segments=exitReturnSegments(footprint);
  const root=new THREE.Group();root.name='exit-return-counter';
  root.position.set(footprint.cx,0,footprint.cz+footprint.d/2-quickDrop.glassOffset);root.rotation.y=footprint.yaw;parent.add(root);
  const early = ctx.activeTheme.id === 'bb-1990';
  const body = new THREE.MeshStandardMaterial({ color: early ? ctx.activeTheme.palette.primary : ctx.activeTheme.palette.counterBody, roughness: .58 });
  const top = new THREE.MeshStandardMaterial({ color: early ? ctx.activeTheme.palette.primary : ctx.activeTheme.palette.counterTop, roughness: .38 });
  const plinth = new THREE.MeshStandardMaterial({ color: 0x191919, roughness: .7 });
  const fallback = new THREE.Group(); root.add(fallback);
  const worktop = new THREE.MeshStandardMaterial({color:0xf4f4f0,roughness:.5});
  const stripe = new THREE.MeshStandardMaterial({color:ctx.activeTheme.palette.secondary,roughness:.5});
  for(const f of segments) {
    const lower=f.label.includes('worktop');
    const piece=new THREE.Group();piece.position.set(f.cx-footprint.cx,0,f.cz-root.position.z);piece.rotation.y=f.yaw;
    for(const [height,y,material] of (lower ? [[2.7,1.35,early ? worktop : body],[.12,2.76,worktop]] :
      (early ? [[2.74,1.37,body],[.8,3.14,top]] : [[2.28,1.14,body],[1.26,2.91,top],[.13,3.29,stripe]])) as [number,number,THREE.Material][]) {
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(f.w,height,f.d),material);
      mesh.position.y=y;mesh.castShadow=mesh.receiveShadow=true;piece.add(mesh);
    }
    fallback.add(piece);
  }
  // Loading fallback uses the same low white window upstand as the millwork.
  const backsplash=new THREE.Mesh(new THREE.BoxGeometry(length,quickDrop.backsplashHeight,quickDrop.backsplashDepth),worktop);
  backsplash.name='White window backsplash';
  backsplash.position.set(0,quickDrop.worktopHeight+quickDrop.backsplashHeight/2,quickDrop.glassOffset-quickDrop.backsplashDepth/2);
  backsplash.castShadow=backsplash.receiveShadow=true;fallback.add(backsplash);
  if(pane) {
    // Loading/offline fallback retains the insert and its through-slot.
    const shape=new THREE.Shape();
    const lo=pane.lo-footprint.cx,hi=pane.hi-footprint.cx;
    shape.moveTo(lo,2.1);shape.lineTo(hi,2.1);shape.lineTo(hi,quickDrop.hoodBackHeight);shape.lineTo(lo,quickDrop.hoodBackHeight);shape.closePath();
    const slot=new THREE.Path(),x=quickDrop.receiverX*length/15.5,half=(quickDrop.receiverWidth/2-.09)*length/15.5;
    slot.moveTo(x-half,3.22);slot.lineTo(x-half,quickDrop.hoodBackHeight-.08);slot.lineTo(x+half,quickDrop.hoodBackHeight-.08);slot.lineTo(x+half,3.22);slot.closePath();shape.holes.push(slot);
    const insert=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:quickDrop.faceClearance,bevelEnabled:false}),metal);
    insert.name='Full pane metal return insert fallback';insert.position.z=quickDrop.glassOffset+RETURN_WINDOW_CLEARANCE+FRAME_REVEAL_CENTER;
    insert.castShadow=insert.receiveShadow=true;fallback.add(insert);
  }
  const unsubscribe=onBrandChange(()=>{const t=getActiveTheme();body.color.set(early ? t.palette.primary : t.palette.counterBody);
    worktop.color.set(0xf4f4f0);top.color.set(early ? t.palette.primary : t.palette.counterTop);stripe.color.set(t.palette.secondary);});
  ctx.addCollider(fallback);
  const rel = `fixtures/exit-return-counter/counter${early ? '-1990' : ''}.glb`;
  const pack = brandPackDir();
  const hosted = import.meta.env.VITE_DEMO === '1';
  const paths = [...(!hosted && pack ? [`user-assets/${pack}/${rel}`] : []),
    ...(!hosted ? [`user-assets/${rel}`] : []), `models/exit-return-counter${early ? '-1990' : ''}.glb`];
  const releaseWindow = addFastReturnWindow(ctx,root,length/15.5);
  const release = installDisplayModel(ctx,root,fallback,paths,
    {CounterBody:body,CounterTop:top,CounterWorktop:worktop,CounterInterior:worktop,CounterInlay:stripe,CounterPlinth:plinth,CounterReturnMetal:metal},new THREE.Vector3(length/15.5,1,length/15.5),model=>{
      // The plan scales with the store; the receiver must still pass through the moved glazing.
      model.traverse(o=>{
        if (!(o instanceof THREE.Mesh)) return;
        const p=o.geometry.getAttribute('position');
        // Pin 217: the exterior metal face stands one millimetre proud of
        // the glazing, not several inches out in the walkway.
        const receiverFront = quickDrop.glassOffset + quickDrop.faceClearance + RETURN_WINDOW_CLEARANCE + FRAME_REVEAL_CENTER;
        const materials=Array.isArray(o.material)?o.material:[o.material];
        const allMetal=materials.length===1 && materials[0]===metal;
        const metalVertices=new Set<number>();
        for(const group of o.geometry.groups) {
          if(materials[group.materialIndex??0]!==metal)continue;
          for(let at=group.start;at<group.start+group.count;at++)metalVertices.add(o.geometry.index?.getX(at)??at);
        }
        for(let i=0;i<p.count;i++) {
          const x=p.getX(i),z=p.getZ(i),scale=length/15.5,isMetal=allMetal||metalVertices.has(i);
          if(isMetal && pane) {
            // Keep the actual slot aligned with the chute; only the insert's
            // outer edges fit the full clear width between the pane stiles.
            if(x<quickDrop.receiverX-1.99) p.setX(i,(pane.lo-footprint.cx)/scale);
            if(x>quickDrop.receiverX+1.99) p.setX(i,(pane.hi-footprint.cx)/scale);
          }
          // Pin 280: the backsplash boards end on the cheeks' outer planes. Their
          // end vertices stay put, or the long board tapers out to the glazing.
          const boardEnd=Math.abs(x-quickDrop.receiverX)>quickDrop.receiverWidth/2-.001 && z<=quickDrop.glassOffset+.0005
            && p.getY(i)<=quickDrop.worktopHeight+quickDrop.backsplashHeight+.001;
          if(z>=quickDrop.glassOffset-.001 && (isMetal || (!boardEnd && Math.abs(x-quickDrop.receiverX)<quickDrop.receiverWidth/2+.001)))
            p.setZ(i,(isMetal?z-quickDrop.glassOffset:0)+(receiverFront-quickDrop.faceClearance)/scale);
        }
        p.needsUpdate=true;o.geometry.computeVertexNormals();o.geometry.computeBoundingBox();o.geometry.computeBoundingSphere();
      });
      prepareRetailModel(model);
    });
  const titles = ctx.libraries.flatMap(l=>l.movies).filter(m=>!m.discovery&&!m.collectionGap&&!m.comingSoon&&!m.game).slice(0,12);
  const stacks: THREE.InstancedMesh[]=[];
  const pose = new THREE.Object3D();
  const geometry = getRentalCaseGeometry(false).clone();
  titles.forEach((movie,index)=>{
    // These cached shelf materials belong to video-case, including live artwork refresh.
    const materials = createHeroRentalMaterials(movie);
    const positions = [[-2.7,-1.92],[-1.8,-1.88],[-.4,-1.94],[.48,-1.90],[2.15,-1.91],
      [-5.25,-6.15],[-4.10,-7.30],[-2.95,-8.45],[-.88,-8.38],[.02,-7.6],[.73,-6.84],[1.37,-6.2]];
    const [x,z] = positions[index];
    const levels = [3,5,2,4,6,3,5,2,4,3,6,2][index];
    const stack = new THREE.InstancedMesh(geometry,materials,levels);
    stack.name='Store-copy returns awaiting reshelving';
    for(let level=0;level<levels;level++) {
      // Cases lie flat wholly on the employee half, never in the passage.
      pose.position.set(x*length/15.5,2.82+CASE_DEPTH/2+level*CASE_DEPTH,z*length/15.5);
      pose.rotation.set(-Math.PI/2,0,[-.12,.08,-.035,.17,-.08,.65,.81,.72,-.72,-.88,-.7,-.8][index] + (level%3-1)*.018);
      pose.updateMatrix();stack.setMatrixAt(level,pose.matrix);
    }
    stack.castShadow=stack.receiveShadow=true;stack.computeBoundingSphere();
    root.add(stack);stacks.push(stack);
  });
  parent.addEventListener('removed',function retire(){
    parent.removeEventListener('removed',retire);unsubscribe();release();releaseWindow();geometry.dispose();stacks.forEach(stack=>stack.dispose());
    fallback.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});body.dispose();top.dispose();plinth.dispose();metal.dispose();worktop.dispose();stripe.dispose();root.removeFromParent();
  });
  ctx.requestShadowRefresh();
  return segments;
}
