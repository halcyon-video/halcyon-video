import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../asset-url';
import { disposeDetachedModel } from '../model-resources';
import type { FixtureContext } from '../fixtures';

/** This installation owns its GLB, including embedded surface textures. */
export function installCounterTvModel(ctx: FixtureContext, parent: THREE.Group,
  anchor: THREE.Group, fallback: THREE.Group): void {
  let retired = false;
  let installed: THREE.Group | null = null;
  const cleanup = () => {
    if (retired) return;
    retired = true;
    parent.removeEventListener('removed', cleanup);
    anchor.removeEventListener('removed', cleanup);
    if (installed) { installed.removeFromParent(); disposeDetachedModel(installed); installed = null; }
  };
  parent.addEventListener('removed', cleanup);
  anchor.addEventListener('removed', cleanup);
  new GLTFLoader().load(assetUrl('models/counter-tv.glb'), ({ scene }) => {
    let root: THREE.Object3D = anchor;
    while (root.parent) root = root.parent;
    if (retired || root !== ctx.scene) { disposeDetachedModel(scene); return; }
    scene.name = 'counter-tv-model';
    scene.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true; });
    installed = scene;
    anchor.add(scene);
    fallback.visible = false;
    ctx.requestShadowRefresh();
    ctx.requestRender();
  }, undefined, error => {
    if (!retired) ctx.log(`Counter TV model unavailable; keeping built-in shell. ${String(error)}`, 'system');
  });
}
