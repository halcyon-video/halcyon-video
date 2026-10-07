// Original Blender profiles, applied to existing owned geometry and anchors.
// A batch shares one download. Its source buffers retire after all targets adopt
// their own copy; disposal during loading cancels only that target.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from './asset-url.ts';

export type JoineryPart = 'Baseboard' | 'SillCap' | 'WindowVertical' | 'WindowHorizontal' | 'FinishedPanel' | 'TelevisionStand' | 'DoubleDoorLeaf' | 'SingleDoorLeaf' | 'DoorPushBar' | 'Coping' | 'SignBracket' | 'ArchedPlaque';
type Request = { target: THREE.BufferGeometry; part: JoineryPart; fit: (g: THREE.BufferGeometry) => void; alive: boolean; cancel: () => void };
let queue: Request[] = [];
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();
export function onJoineryModelsChanged(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }
export async function joineryModelsReady(): Promise<void> { await pending; }
export function joineryGeometry<T extends THREE.BufferGeometry>(target: T, part: JoineryPart, fit: (g: THREE.BufferGeometry) => void): T {
  if (typeof document === 'undefined') return target;
  const request: Request = { target, part, fit, alive: true, cancel: () => { request.alive = false; } };
  target.addEventListener('dispose', request.cancel);
  queue.push(request);
  if (!pending) pending = new GLTFLoader().loadAsync(assetUrl('models/visible-joinery.glb')).then(({ scene }) => {
    const kit = new Map<string, THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    scene.updateMatrixWorld(true);
    scene.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.applyMatrix4(o.matrixWorld); kit.set(o.name, o.geometry);
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m));
    });
    const requests = queue; queue = [];
    try {
      for (const r of requests) {
        r.target.removeEventListener('dispose', r.cancel);
        if (!r.alive) continue;
        const source = kit.get(r.part);
        if (!source) continue;
        const fitted = source.clone();
        try {
          r.fit(fitted); fitted.computeBoundingBox(); fitted.computeBoundingSphere();
          // Keep the geometry object used by existing collision and click rigs.
          r.target.dispose(); r.target.copy(fitted);
          r.target.userData = { ...r.target.userData, authoredJoinery: r.part };
        } finally { fitted.dispose(); }
      }
      listeners.forEach(fn => fn());
    } finally {
      requests.forEach(r => r.target.removeEventListener('dispose', r.cancel));
      kit.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    }
  }).catch(error => {
    queue.forEach(r => r.target.removeEventListener('dispose', r.cancel)); queue = [];
    console.warn('[joinery] Keeping built-in profiles:', error);
  }).finally(() => { pending = null; });
  return target;
}

/** Change a flat span while retaining the authored finished edge radius. */
export function stretchJoinery(g: THREE.BufferGeometry, axis: 'x' | 'y' | 'z', from: number, to: number, edge = .02): void {
  const p = g.getAttribute('position'); const channel = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  for (let i = 0; i < p.count; i++) {
    const v = p.getComponent(i, channel);
    p.setComponent(i, channel, Math.abs(v) >= from / 2 - edge ? v + Math.sign(v) * (to - from) / 2 : v * (to - 2 * edge) / (from - 2 * edge));
  }
  p.needsUpdate = true; g.computeVertexNormals();
}
export function finishedPanelGeometry(w: number, h: number, d: number): THREE.BoxGeometry {
  return joineryGeometry(new THREE.BoxGeometry(w,h,d), 'FinishedPanel', g => {
    stretchJoinery(g,'x',1,w,.006); stretchJoinery(g,'y',1,h,.006); stretchJoinery(g,'z',1,d,.006); boxMaterialLanes(g,w,h,d);
  });
}

export function baseboardGeometry(w: number, h = .3, d = .04): THREE.BoxGeometry {
  return joineryGeometry(new THREE.BoxGeometry(w,h,d), 'Baseboard', g => g.scale(w,h/.3,d/.04));
}
export function sillGeometry(w: number): THREE.BoxGeometry {
  return joineryGeometry(new THREE.BoxGeometry(w,.12,.4), 'SillCap', g => g.scale(w,1,1));
}
export function windowFrameGeometry(w: number, h: number, d: number, vertical = h > w): THREE.BoxGeometry {
  return joineryGeometry(new THREE.BoxGeometry(w,h,d), vertical ? 'WindowVertical' : 'WindowHorizontal', g => g.scale(w/(vertical?.2:1),h/(vertical?1:.2),d/.3));
}

// Preserve BoxGeometry's six face lanes and UV handedness for existing art.
function boxMaterialLanes(geometry: THREE.BufferGeometry,w:number,h:number,d:number): void {
  const g=geometry.index?geometry.toNonIndexed():geometry.clone();
  const p=g.getAttribute('position'), n=g.getAttribute('normal');
  const bins: number[][]=Array.from({length:6},()=>[]);
  for(let i=0;i<p.count;i+=3){
    const normal=new THREE.Vector3();for(let j=0;j<3;j++)normal.add(new THREE.Vector3().fromBufferAttribute(n,i+j));
    const a=[Math.abs(normal.x),Math.abs(normal.y),Math.abs(normal.z)];const axis=a.indexOf(Math.max(...a));
    const role=axis*2+(normal.getComponent(axis)<0?1:0);bins[role].push(i,i+1,i+2);
  }
  const positions:number[]=[],normals:number[]=[],uv:number[]=[];geometry.clearGroups();
  for(let role=0;role<6;role++){
    const start=positions.length/3;
    for(const i of bins[role]){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);positions.push(x,y,z);normals.push(n.getX(i),n.getY(i),n.getZ(i));
      uv.push(...(role===0?[.5-z/d,.5+y/h]:role===1?[.5+z/d,.5+y/h]:role===2?[.5+x/w,.5-z/d]:role===3?[.5+x/w,.5+z/d]:role===4?[.5+x/w,.5+y/h]:[.5-x/w,.5+y/h]));
    }
    geometry.addGroup(start,bins[role].length,role);
  }
  geometry.setIndex(null);geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.dispose();
}
export function copingGeometry(w:number,h:number,d:number):THREE.BoxGeometry {
  return joineryGeometry(new THREE.BoxGeometry(w,h,d),'Coping',g=>{
    if(w>=d)g.scale(w,h/.3,d);else{g.scale(d,h/.3,w);g.rotateY(Math.PI/2);}
  });
}
export function signBracketGeometry():THREE.BoxGeometry {
  return joineryGeometry(new THREE.BoxGeometry(.04,.06,.08),'SignBracket',()=>{});
}

export function plaqueGeometry<T extends THREE.BufferGeometry>(fallback:T,w:number,h:number,d:number,r:number):T {
  return joineryGeometry(fallback,'ArchedPlaque',g=>{
    const flat=g.index?g.toNonIndexed():g.clone(),p=flat.getAttribute('position'),n=flat.getAttribute('normal');
    const bins:number[][]=[[],[]];
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i);p.setXYZ(i,Math.sign(x)*(w/2-(.5-Math.abs(x))*r/.1),y>.3?h-(.5-y)*r/.1:0,p.getZ(i)*d/.01);
    }
    for(let i=0;i<p.count;i+=3)bins[Math.abs(n.getZ(i))>.5?0:1].push(i,i+1,i+2);
    const positions:number[]=[],normals:number[]=[],uv:number[]=[];g.clearGroups();
    bins.forEach((indices,role)=>{
      const start=positions.length/3;
      for(const i of indices){positions.push(p.getX(i),p.getY(i),p.getZ(i));normals.push(n.getX(i),n.getY(i),n.getZ(i));uv.push(p.getX(i)/w+.5,p.getY(i)/h);}
      g.addGroup(start,indices.length,role);
    });
    g.setIndex(null);g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));flat.dispose();
  });
}
