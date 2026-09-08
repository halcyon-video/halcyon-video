// Blender-authored rolled fascia, ledge and mirror seat fitted to the room plan.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { assetUrl } from './asset-url';
import { disposeDetachedModel } from './model-resources';
import { corniceJoints, fitCorniceVertex, CORNICE_MIRROR_HEIGHT, CORNICE_MIRROR_TILT, type CornicePoint } from './cornice-plan';

export function buildCornice(
  scene: THREE.Scene, points: CornicePoint[], ceilingY: number,
  live: boolean, target: {w:number;h:number}, refresh: () => void,
): THREE.Group {
  const group = new THREE.Group(); group.name = 'Fitted ceiling cornice';
  group.position.y = ceilingY; scene.add(group);
  const joints = corniceJoints(points);
  const chrome = new THREE.MeshStandardMaterial({color:0xd6dbe2,metalness:1,roughness:.23});
  const fallback = new THREE.Group(); fallback.name = 'Cornice loading fallback'; group.add(fallback);
  const mh = CORNICE_MIRROR_HEIGHT, tilt = CORNICE_MIRROR_TILT;
  const top = -1.35+mh/2*Math.cos(tilt), bottom = -1.35-mh/2*Math.cos(tilt);
  const spread = mh*Math.sin(tilt);
  const fit = (source: THREE.BufferGeometry, i: number) => {
    const geo = source.clone(), p = geo.getAttribute('position');
    const a = joints[i], b = joints[(i+1)%joints.length];
    for(let j=0;j<p.count;j++) p.setXYZ(j,...fitCorniceVertex(a,b,p.getX(j),p.getY(j),p.getZ(j)));
    p.needsUpdate=true; geo.computeVertexNormals();geo.computeBoundingBox();geo.computeBoundingSphere();return geo;
  };
  // A fitted closed strip remains usable on an offline/missing model boot.
  const fallbackSection = new THREE.BufferGeometry();
  const section = [[-1.8,0],[-1.8,-2.7],[.06,-2.7],[0,bottom],[spread,top],[.60,0]];
  const positions:number[]=[], indices:number[]=[];
  for(const t of [0,1]) for(const [d,y] of section) positions.push(t,y,d);
  for(let i=0;i<section.length;i++){const j=(i+1)%section.length,n=section.length;indices.push(i,j,j+n,i,j+n,i+n);}
  fallbackSection.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));fallbackSection.setIndex(indices);
  for(let i=0;i<joints.length;i++){
    const body = new THREE.Mesh(fit(fallbackSection,i),chrome);body.castShadow=body.receiveShadow=true;fallback.add(body);
    const a=joints[i],b=joints[(i+1)%joints.length],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
    if(len<.75)continue;
    const ux=dx/len,uz=dz/len,nx=-uz,nz=ux;
    // Mitred trapezoids stay planar: both ends meet their neighbours at the
    // same bisector at EVERY mirror height, including the sharp V peak.
    const pos:number[]=[];
    for(const [t,y,d] of [[0,top,spread+.02],[0,bottom,.02],[1,top,spread+.02],[1,bottom,.02]]){
      const p=fitCorniceVertex(a,b,t,y,d);
      pos.push((p[0]-a.x)*ux+(p[2]-a.z)*uz,(y+1.35)/Math.cos(tilt),0);
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex([0,1,2,2,1,3]);
    geo.setAttribute('uv',new THREE.Float32BufferAttribute([0,1,0,0,1,1,1,0],2));geo.computeVertexNormals();
    const mirror=live ? new Reflector(geo,{clipBias:.003,textureWidth:target.w,textureHeight:target.h,color:0xffffff}) : new THREE.Mesh(geo,chrome);
    mirror.castShadow = mirror.receiveShadow = true;
    mirror.name='Mitred mirror'; mirror.position.set(a.x+nx*(spread/2+.02),-1.35,a.z+nz*(spread/2+.02));
    mirror.rotation.order='YXZ';mirror.rotation.y=Math.atan2(nx,nz);mirror.rotation.x=tilt;group.add(mirror);
  }
  fallbackSection.dispose();
  let removed=false;
  group.addEventListener('removed',()=>{removed=true;});
  // Scene teardown disposes the fallback geometry. Its dispose event also
  // guards against a request finishing after a renderer has been destroyed.
  (fallback.children[0] as THREE.Mesh).geometry.addEventListener('dispose',()=>{removed=true;});
  new GLTFLoader().load(assetUrl('models/ceiling-cornice.glb'),({scene:model})=>{
    const sourceMeshes:THREE.Mesh[]=[];model.traverse(o=>{if(o instanceof THREE.Mesh)sourceMeshes.push(o);});
    if(!removed && group.parent===scene && sourceMeshes.length){
      const seat = new THREE.MeshStandardMaterial({color:0x181a1c,metalness:.35,roughness:.48});
      const installed=new THREE.Group();installed.name='Blender cornice profiles';
      for(const source of sourceMeshes) for(let i=0;i<joints.length;i++){
        const original=Array.isArray(source.material)?source.material:[source.material];
        const materials=original.map(m=>m.name==='MirrorSeat'?seat:chrome);
        const mesh=new THREE.Mesh(fit(source.geometry,i),Array.isArray(source.material)?materials:materials[0]);
        mesh.castShadow=mesh.receiveShadow=true;installed.add(mesh);
      }
      group.add(installed);fallback.visible=false;refresh();
    }
    disposeDetachedModel(model);
  },undefined,()=>{ /* Offline: retain the fitted loading fallback. */ });
  return group;
}
