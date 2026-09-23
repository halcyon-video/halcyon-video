import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from './asset-url';
import { disposeSceneMeshes } from './scene-mesh-disposal';
import type { FixtureContext } from './fixtures';

/** Model coordinates match the existing CRT; only the drop tube changes length. */
export async function installTvMount(ctx: FixtureContext, ceiling: THREE.Group, television: THREE.Group,
  fallback: THREE.Object3D[], alive: () => boolean, triple = false): Promise<void> {
  let source: THREE.Group | null = null;
  try {
    source = (await new GLTFLoader().loadAsync(assetUrl('models/tv-suspension.glb'))).scene;
    if (!alive()) { disposeSceneMeshes(source); return; }
    const plate = source.getObjectByName('CeilingPlate');
    const stem = source.getObjectByName('DropStem');
    const joint = source.getObjectByName('Swivel');
    const cradle = source.getObjectByName(triple ? 'TripleCradle' : 'Cradle');
    if (!plate || !stem || !joint || !cradle) throw new Error('Missing suspension part');
    television.updateMatrix();
    const pivot = new THREE.Vector3(0, triple ? 1.425 : 1.32, 0).applyMatrix4(television.matrix);
    // The ceiling plate follows the actual rotated attachment, so the drop is
    // plumb rather than terminating in the middle of a tilted cabinet.
    const end = pivot.clone().add(new THREE.Vector3(0, .06, 0));
    const top = new THREE.Vector3(end.x, -.24, end.z);
    const length = top.distanceTo(end);
    if (end.y >= -.28 || length < .1) throw new Error('Insufficient ceiling clearance');
    plate.position.set(end.x, 0, end.z);
    stem.position.copy(end); stem.scale.y = length;
    stem.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(end).normalize());
    joint.position.copy(pivot); joint.quaternion.copy(television.quaternion);
    television.add(cradle); ceiling.add(plate, stem, joint);
    // Retain the unused variant hidden: its materials are shared with the
    // installed parts and the scene owns their eventual single disposal.
    source.visible = false; ceiling.add(source);
    for (const root of [plate, stem, joint, cradle]) root.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
    });
    for (const part of fallback) part.visible = false;
    ceiling.userData.tvMount = {variant: triple ? 'triple' : 'single', dropFeet: length,
      ceilingAttachment: top.toArray(), cabinetAttachment: pivot.toArray()};
    ctx.requestShadowRefresh(); ctx.requestRender();
  } catch (error) {
    if (source) disposeSceneMeshes(source);
    if (alive()) console.warn('[ambient-tvs] suspension fallback retained', error);
  }
}
