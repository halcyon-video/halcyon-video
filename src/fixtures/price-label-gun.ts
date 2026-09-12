// Original static staff tool; Entrance owns both fallback and loaded resources.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../asset-url';
import { disposeDetachedModel } from '../model-resources';
import type { FixtureContext } from '../fixtures';

export function installPriceLabelGun(
  ctx: FixtureContext, parent: THREE.Group,
  anchor: { x: number; y: number; z: number },
): void {
  const root = new THREE.Group(); root.name = 'counter-price-label-gun';
  root.position.set(anchor.x, anchor.y, anchor.z); parent.add(root);
  const fallback = new THREE.Group(); fallback.name = 'price-label-gun-fallback'; root.add(fallback);
  const plastic = new THREE.MeshStandardMaterial({ color: 0xc69653, roughness: .58 });
  const shape = new THREE.Shape();
  shape.moveTo(-.33, .04); shape.lineTo(-.31, .23); shape.lineTo(.28, .16);
  shape.lineTo(.33, .02); shape.lineTo(-.04, -.02); shape.lineTo(-.02, -.28);
  shape.quadraticCurveTo(-.18, -.30, -.17, -.20); shape.lineTo(-.18, .01); shape.closePath();
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .19, bevelEnabled: false, steps: 1 }), plastic);
  mesh.rotation.x = -Math.PI / 2; mesh.castShadow = mesh.receiveShadow = true; fallback.add(mesh);
  let retired = false;
  const cleanup = () => {
    retired = true; parent.removeEventListener('removed', cleanup);
    disposeDetachedModel(root); root.removeFromParent();
  };
  parent.addEventListener('removed', cleanup);
  new GLTFLoader().load(assetUrl('models/price-label-gun.glb'), ({ scene: model }) => {
    if (retired) { disposeDetachedModel(model); return; }
    model.name = 'price-label-gun-model';
    model.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true; });
    root.add(model); disposeDetachedModel(fallback); fallback.removeFromParent();
    ctx.requestShadowRefresh(); ctx.requestRender();
  }, undefined, () => {
    if (!retired) ctx.log('Price label gun unavailable; using built-in staff tool.', 'system');
  });
}
