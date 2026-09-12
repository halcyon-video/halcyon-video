// Original Blender hardware; image planes and marquee anchors stay caller-owned.
import * as THREE from 'three';
import type { StoreScene } from './three-scene';
import { installDisplayModel } from './fixtures/display-model';
import { markSignMesh } from './sign-builders';

export function installPosterFrame(
  scene: StoreScene, parent: THREE.Group, fallback: THREE.Group,
  variant: 'window' | 'wall', finish: THREE.Material,
  imageWidth: number, imageHeight: number,
): void {
  const nativeWidth = variant === 'window' ? 2.5 : 4.7 * 2 / 3;
  const nativeHeight = variant === 'window' ? 3.75 : 4.7;
  const stop = installDisplayModel({
    scene: scene.scene,
    requestRender: () => scene.requestRender(),
    requestShadowRefresh: () => {
      scene.renderer.shadowMap.needsUpdate = true;
      scene.queueStructuralShadowRefresh();
    },
    log: message => console.warn('[poster-frame]', message),
  }, parent, fallback, `models/poster-frame-${variant}.glb`, { FrameFinish: finish },
  new THREE.Vector3(imageWidth / nativeWidth, imageHeight / nativeHeight, 1),
  model => {
    model.userData.posterFrameVariant = variant;
    if (variant === 'wall') model.traverse(o => { if (o instanceof THREE.Mesh) markSignMesh(o); });
  });
  // StoreScene disposes static geometry during teardown. The retained fallback
  // is its lifetime sentinel, including while the asynchronous GLB is in flight.
  const sentinel = fallback.children.find(o => o instanceof THREE.Mesh) as THREE.Mesh;
  const cancel = () => {
    sentinel.geometry.removeEventListener('dispose', onGeometryDispose);
    parent.removeEventListener('removed', cancel);
    stop();
  };
  // Do not remove a sibling while StoreScene's recursive traversal is visiting
  // the fallback. Defer detachment until that synchronous traversal finishes.
  const onGeometryDispose = () => queueMicrotask(cancel);
  sentinel.geometry.addEventListener('dispose', onGeometryDispose);
  parent.addEventListener('removed', cancel);
}
