// Decorative rental repeats: one compact opaque batch per physical shell class.
import * as THREE from 'three';
import type { StoreScene } from './three-scene';
import type { MovieSlot } from './store-layout';
import { COPY_X_JITTER_RANGE, STAGGER_OFFSET, seededRandom01 } from './store-layout';
import { createClonedCaseGeometry, getGlobalBackMaterials, gameRentalDims, CASE_MEDIUM } from './video-case';
const batches = new WeakMap<StoreScene, Map<string, THREE.InstancedMesh>>();
export function forgetBackstock(scene: StoreScene): void { batches.delete(scene); scene.extraCopiesMesh = null; scene.extraCopiesCapacity = 0; }
export function updateBackstock(scene: StoreScene, copies: Map<MovieSlot, { count: number; pitch: number }>): void {
  const groups = new Map<string, { slot: MovieSlot; count: number; pitch: number }[]>();
  for (const [slot, plan] of copies) {
    const dims = slot.movie.game ? gameRentalDims(slot.movie.platform) : undefined;
    const key = dims ? `${dims.w}:${dims.h}:${dims.d}` : CASE_MEDIUM;
    const group = groups.get(key) ?? []; group.push({ slot, ...plan }); groups.set(key, group);
  }
  let cache = batches.get(scene); if (!cache) batches.set(scene, cache = new Map());
  for (const [key, old] of cache) if (!groups.has(key)) {
    old.removeFromParent(); old.geometry.dispose(); scene.meshes = scene.meshes.filter(m => m !== old); cache.delete(key);
  }
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(1,1,1), quaternion = new THREE.Quaternion(), euler = new THREE.Euler(0,0,0,'YXZ');
  let total = 0;
  for (const [key, entries] of groups) {
    const count = entries.reduce((n,e) => n + e.count,0); total += count;
    let mesh = cache.get(key);
    if (!mesh || mesh.count !== count) {
      if (mesh) { mesh.removeFromParent(); mesh.geometry.dispose(); scene.meshes = scene.meshes.filter(m => m !== mesh); }
      const first = entries[0].slot.movie;
      mesh = new THREE.InstancedMesh(createClonedCaseGeometry(count,false,true,first.game ? gameRentalDims(first.platform) : undefined),getGlobalBackMaterials(),count);
      mesh.name = `rental-backstock-${key}`; mesh.castShadow = mesh.receiveShadow = true;
      cache.set(key,mesh); scene.scene.add(mesh); scene.meshes.push(mesh);
    }
    let index=0;
    for (const {slot,count,pitch} of entries) {
      const theta=slot.restingRotY; euler.set(slot.restingRotX ?? 0,theta,0,'YXZ'); quaternion.setFromEuler(euler);
      for (let n=0;n<count;n++) {
        if (slot.hidden) matrix.makeScale(0,0,0);
        else {
          const x=(slot.source==='fixture'?0:-STAGGER_OFFSET)+(seededRandom01(`${slot.movie.id}_${n}`)-.5)*COPY_X_JITTER_RANGE;
          const z=(slot.rentalRestZ ?? slot.backZ)-pitch*(n+1);
          position.set(slot.restingX+x*Math.cos(theta)+z*Math.sin(theta),slot.restingY+slot.backYLift,slot.restingZ-x*Math.sin(theta)+z*Math.cos(theta));
          matrix.compose(position,quaternion,scale);
        }
        mesh.setMatrixAt(index++,matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate=true; mesh.boundingSphere=null;
  }
  scene.extraCopiesMesh=cache.values().next().value ?? null; scene.extraCopiesCapacity=total;
}
