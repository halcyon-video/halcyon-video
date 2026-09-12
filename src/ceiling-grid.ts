import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from './asset-url.ts';
import { disposeDetachedModel } from './model-resources.ts';
import type { CeilingGridPlan, GridPoint } from './ceiling-grid-plan.ts';

interface GridInstall {
  parent: THREE.Object3D; plan: CeilingGridPlan; y: number;
  paint: THREE.Material; fiber?: THREE.MeshStandardMaterial;
  tiles?: GridPoint[]; fallback?: THREE.Object3D[];
  colors?: THREE.InstancedBufferAttribute | null; refresh: () => void;
}
/** Geometry and finishes are shared by part, never allocated per tile. */
export function installCeilingGrid(options: GridInstall): THREE.Group {
  const {parent,plan,y,tiles=[],fallback=[],refresh}=options;
  const root=new THREE.Group();root.name='Suspended ceiling kit';parent.add(root);
  // Empty owned sentinel participates in the existing scene geometry teardown.
  const sentinel=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial());
  sentinel.visible=false;sentinel.name='Grid lifetime';root.add(sentinel);
  let stopped=false;
  const stop=()=>{
    if(stopped)return;stopped=true;parent.removeEventListener('removed',stop);
    root.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();});
    disposeDetachedModel(root);
  };
  root.addEventListener('removed',stop);parent.addEventListener('removed',stop);
  sentinel.geometry.addEventListener('dispose',stop);
  if(typeof window==='undefined')return root;
  new GLTFLoader().load(assetUrl('models/ceiling-grid.glb'),({scene:model})=>{
    if(stopped){disposeDetachedModel(model);return;}
    model.updateMatrixWorld(true);
    const sources=new Map<string,THREE.BufferGeometry>();
    const names=['TBar','EdgeAngle','CrossTee','TileRim'];
    if(names.some(name=>!(model.getObjectByName(name) instanceof THREE.Mesh))){disposeDetachedModel(model);return;}
    for(const name of names){
      const mesh=model.getObjectByName(name);
      if(!(mesh instanceof THREE.Mesh)){disposeDetachedModel(model);return;}
      sources.set(name,mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
    }
    const paint=options.paint.clone();paint.name='GridPaint';
    const fiber=tiles.length&&options.fiber?options.fiber.clone():null;
    if(fiber){fiber.name='AcousticFiber';fiber.map=null;fiber.bumpMap=null;}
    const add=(name:string,mat:THREE.Material,transforms:THREE.Matrix4[])=>{
      const geo=sources.get(name)!;sources.delete(name);
      if(!transforms.length){geo.dispose();return;}
      const mesh=new THREE.InstancedMesh(geo,mat,transforms.length);mesh.name=name;
      transforms.forEach((m,i)=>mesh.setMatrixAt(i,m));
      if(name==='TileRim'&&options.colors)mesh.instanceColor=new THREE.InstancedBufferAttribute(options.colors.array.slice(),3);
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();
      mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);
    };
    // Fit perimeter angles to shared mitres, then merge into one draw. Section
    // width stays constant even on diagonal soffit cuts and concave notches.
    const edges=plan.spans.filter(s=>s.edge), fitted:THREE.BufferGeometry[]=[];
    const same=(a:GridPoint,b:GridPoint)=>Math.hypot(a.x-b.x,a.z-b.z)<1e-5;
    for(const edge of edges){
      const dx=edge.b.x-edge.a.x,dz=edge.b.z-edge.a.z,len=Math.hypot(dx,dz);
      const ux=dx/len,uz=dz/len,nx=-uz,nz=ux;
      const miter=(p:GridPoint,start:boolean)=>{
        const other=edges.find(e=>e!==edge&&same(start?e.b:e.a,p));
        if(!other)return 0;
        const ox=other.b.x-other.a.x,oz=other.b.z-other.a.z,ol=Math.hypot(ox,oz);
        const onx=-oz/ol,onz=ox/ol,den=onx*ux+onz*uz;
        return Math.abs(den)<1e-6?0:(1-onx*nx-onz*nz)/den;
      };
      const a=miter(edge.a,true),b=miter(edge.b,false);
      const geo=sources.get('EdgeAngle')!.clone(),p=geo.getAttribute('position');
      for(let i=0;i<p.count;i++){
        const t=p.getX(i),d=p.getZ(i),along=t*len+d*(a*(1-t)+b*t);
        p.setXYZ(i,edge.a.x+ux*along+nx*d,y+p.getY(i),edge.a.z+uz*along+nz*d);
      }
      geo.computeVertexNormals();fitted.push(geo);
    }
    if(fitted.length){
      const mesh=new THREE.Mesh(mergeGeometries(fitted),paint);mesh.name='EdgeAngle';
      mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);fitted.forEach(g=>g.dispose());
    }
    const transforms=plan.spans.filter(s=>!s.edge).flatMap(s=>{
      const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,len=Math.hypot(dx,dz);
      // Stop at the cross-tee flange ports; angles meet at cut endpoints.
      const inset=.054;if(len<=2*inset)return [];
      return [new THREE.Matrix4().makeTranslation(s.a.x+dx/len*inset,y,s.a.z+dz/len*inset)
        .multiply(new THREE.Matrix4().makeRotationY(-Math.atan2(dz,dx)))
        .multiply(new THREE.Matrix4().makeScale(len-2*inset,1,1))];
    });
    add('TBar',paint,transforms);
    add('CrossTee',paint,plan.joints.map(p=>new THREE.Matrix4().makeTranslation(p.x,y,p.z)));
    if(fiber)add('TileRim',fiber,tiles.map(p=>new THREE.Matrix4().makeTranslation(p.x,y,p.z)));
    sources.forEach(g=>g.dispose());
    fallback.forEach(o=>{o.visible=false;});root.userData.loaded=true;
    disposeDetachedModel(model);refresh();
    if(fiber)new THREE.TextureLoader().load(assetUrl('models/ceiling-tile-grain.png'),texture=>{
      if(stopped){texture.dispose();return;}
      texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
      fiber.map=texture;fiber.bumpMap=texture;fiber.bumpScale=.008;fiber.needsUpdate=true;refresh();
    },undefined,()=>{ /* Neutral fibre remains usable if grain is unavailable. */ });
  },undefined,()=>{ /* Keep the established procedural ceiling on missing/offline GLB. */ });
  return root;
}
