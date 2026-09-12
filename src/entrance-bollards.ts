import * as THREE from 'three';
import { installDisplayModel } from './fixtures/display-model';

/** Feet; unchanged exterior anchors, decorative only (no collision registry). */
export function buildEntranceBollards(
  scene: THREE.Scene,
  parent: THREE.Group,
  xs: readonly number[],
  z: number,
  requestRender: () => void,
): { dispose(): void } {
  const group = new THREE.Group();
  group.name = 'entranceBollards';
  group.userData.anchors = xs.map(x => [x, 0, z]);
  parent.add(group);
  const fallback = new THREE.Group();
  group.add(fallback);
  const paint = new THREE.MeshStandardMaterial({ color: '#2b2b2e', roughness: .5, metalness: .4 });
  const band = new THREE.MeshStandardMaterial({ color: '#ffcc33', roughness: .4, metalness: .15 });
  const steel = new THREE.MeshStandardMaterial({ color: '#999fa6', roughness: .36, metalness: .75 });
  const finishes = { PostPaint: paint, SafetyBand: band, FixingSteel: steel };
  Object.entries(finishes).forEach(([name, material]) => { material.name = name; });
  // Preserve the simple loading/error representation, corrected to full scale.
  const postGeometry = new THREE.CylinderGeometry(.25, .25, 3, 12);
  const bandGeometry = new THREE.CylinderGeometry(.252, .252, .25, 12);
  for (const x of xs) {
    const post = new THREE.Mesh(postGeometry, paint);
    post.position.set(x, 1.5, z);
    post.castShadow = post.receiveShadow = true;
    const stripe = new THREE.Mesh(bandGeometry, band);
    stripe.position.set(x, 2.425, z);
    fallback.add(post, stripe);
  }
  const release = installDisplayModel({
    scene, requestRender,
    // Exterior callback already invalidates structural shadows and the frame.
    requestShadowRefresh: () => {},
    log: message => console.warn(message),
  }, group, fallback, 'models/entrance-bollard.glb', finishes, new THREE.Vector3(1, 1, 1), model => {
    const parts = [...model.children];
    model.clear();
    for (const x of xs) {
      const post = new THREE.Group();
      post.name = 'EntranceBollard';
      post.position.set(x, 0, z);
      // Object clones share the one imported mesh's geometry and materials.
      parts.forEach(part => post.add(part.clone(true)));
      model.add(post);
    }
  });
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    release();
    postGeometry.dispose();
    bandGeometry.dispose();
    Object.values(finishes).forEach(material => material.dispose());
    group.removeFromParent();
  };
  group.addEventListener('removed', dispose);
  return { dispose };
}
