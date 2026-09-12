// One shared carrier and jaw-pair geometry per clasp set; no per-card GLB loads.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { assetUrl } from '../asset-url.ts';
import { disposeDetachedModel } from '../model-resources.ts';

export function installClaspHardware(targets: THREE.Mesh[], finish: THREE.Material, wake: () => void): () => void {
  let retired = false;
  const installed: THREE.Mesh[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const steel = new THREE.MeshStandardMaterial({ color: 0x555b64, roughness: .4, metalness: .55 });
  if (targets.length) new GLTFLoader().load(assetUrl('models/shelf-components.glb'), ({ scene }) => {
    try {
      if (retired) return;
      const carrier = scene.getObjectByName('ClaspCarrier') as THREE.Mesh;
      const jaw = scene.getObjectByName('ClaspJaw') as THREE.Mesh;
      if (!carrier?.isMesh || !jaw?.isMesh) return;
      const body = carrier.geometry.clone();
      const pieces = [-.33, .33].map(z => jaw.geometry.clone().translate(0, 0, z));
      const jaws = mergeGeometries(pieces)!;
      pieces.forEach(g => g.dispose());
      geometries.push(body, jaws);
      for (const target of targets) {
        if (!target.parent) continue;
        for (const [geometry, material, name] of [[body, finish, 'clasp-carrier'], [jaws, steel, 'clasp-jaws']] as const) {
          const mesh = new THREE.Mesh(geometry, material);
          mesh.name = name;
          mesh.castShadow = mesh.receiveShadow = true;
          target.add(mesh); installed.push(mesh);
        }
      }
      wake();
    } finally { disposeDetachedModel(scene); }
  }, undefined, () => {}); // The printed card remains functional on failure.
  return () => {
    retired = true;
    installed.forEach(mesh => mesh.removeFromParent());
    geometries.forEach(g => g.dispose());
    steel.dispose();
  };
}
