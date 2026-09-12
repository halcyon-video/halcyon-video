// One asset load, three merged material batches; the caller owns live finishes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { assetUrl } from './asset-url';
import { disposeDetachedModel } from './model-resources';
import { curbKitPlan, type EdgeBounds } from './curb-kit-plan';

export function installCurbKit(
  parent: THREE.Group, bounds: EdgeBounds, width: number, depth: number,
  fallback: THREE.Object3D[], sidewalkMaterial: THREE.MeshStandardMaterial,
  refresh: () => void,
) {
  let disposed = false;
  const installed = new THREE.Group(); installed.name = 'Blender concrete edges';
  const concrete = new THREE.MeshStandardMaterial({color:'#6d6a60',roughness:.85});
  const gutter = new THREE.MeshStandardMaterial({color:'#5c584e',roughness:.9});
  // Existing aggregate/joint texture, shared rather than another texture fetch.
  concrete.map = gutter.map = sidewalkMaterial.map;
  concrete.name = 'CurbConcrete'; gutter.name = 'GutterConcrete';
  const materials: Record<string,THREE.MeshStandardMaterial> = {
    CurbConcrete:concrete, GutterConcrete:gutter, SidewalkConcrete:sidewalkMaterial,
  };
  new GLTFLoader().load(assetUrl('models/curb-kit.glb'), ({scene:source}) => {
    const chunks = new Map<string,THREE.BufferGeometry[]>();
    try {
      if (disposed) return;
      const plan = curbKitPlan(bounds,width,depth);
      // Validate the complete kit before changing any visible fallback.
      for (const part of plan) {
        const mesh = source.getObjectByName(part.part);
        if (!(mesh instanceof THREE.Mesh) || !mesh.geometry.getAttribute('uv')) throw Error(`Missing edge part ${part.part}`);
      }
      for (const part of plan) {
        const mesh = source.getObjectByName(part.part) as THREE.Mesh;
        const role = (Array.isArray(mesh.material)?mesh.material[0]:mesh.material).name;
        if (!materials[role]) throw Error(`Unknown concrete role ${role}`);
        const geo = mesh.geometry.clone();
        const p = geo.getAttribute('position'), uv = geo.getAttribute('uv');
        const angle = part.yaw || 0, cos = Math.cos(angle), sin = Math.sin(angle);
        for (let i=0;i<p.count;i++) {
          const x = p.getX(i)*part.length*(part.mirror?-1:1);
          const y = p.getY(i);
          // Preserve the 0.012 ft front chamfer while fitting any sidewalk depth.
          const rawZ = p.getZ(i);
          const z = part.depth === undefined ? rawZ : rawZ>4 ? part.depth-(4.7-rawZ) : rawZ;
          const wx = part.x+x*cos+z*sin, wz = part.z-x*sin+z*cos;
          p.setXYZ(i,wx,y,wz);
          if (role==='SidewalkConcrete') uv.setXY(i,(wx-(bounds.centerX-width/2))/width,1-(wz-bounds.frontZ)/depth);
          else {
            // Counteract the shared sidewalk texture repeat: 4.5 ft aggregate tiles.
            const repeat = sidewalkMaterial.map?.repeat;
            uv.setXY(i,wx/4.5/(repeat?.x||1),wz/4.5/(repeat?.y||1));
          }
        }
        if (part.mirror) {
          const index = geo.getIndex()!;
          for (let i=0;i<index.count;i+=3) {const a=index.getX(i);index.setX(i,index.getX(i+2));index.setX(i+2,a);}
        }
        // GLB has split hard-edge vertices; keep them split when recalculating.
        geo.computeVertexNormals();
        const list = chunks.get(role)||[]; list.push(geo); chunks.set(role,list);
      }
      for (const [role,geos] of chunks) {
        const geo=mergeGeometries(geos);
        if (!geo) throw Error('Concrete batch merge failed');
        const mesh=new THREE.Mesh(geo,materials[role]); mesh.name=role;
        mesh.receiveShadow=true; installed.add(mesh);
      }
      let scene:THREE.Object3D = parent;
      while(scene.parent) scene=scene.parent;
      const intensity=scene instanceof THREE.Scene?scene.environmentIntensity:1;
      concrete.envMapIntensity=gutter.envMapIntensity=.2/Math.max(.2,intensity);
      parent.add(installed);
      fallback.forEach(o=>{o.visible=false;});
      refresh();
    } catch (error) {
      installed.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});
      installed.clear();
      console.warn('[exterior] Concrete kit invalid; retaining fallback.',error);
    } finally {
      chunks.forEach(geos=>geos.forEach(g=>g.dispose()));
      disposeDetachedModel(source);
    }
  }, undefined, () => { /* Offline: keep the existing sidewalk, curb and gutter. */ });
  return {dispose() {
    if(disposed)return;
    disposed=true;
    installed.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});
    installed.removeFromParent(); installed.clear();
    concrete.dispose();gutter.dispose();
  }};
}
