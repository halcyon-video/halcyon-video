// Optional, locally installed counter equipment. Units: feet, floor at y=0,
// controls face +Z. The existing counter owns placement and navigation.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../asset-url';
import { brandPackDir } from '../brand-pack';
import type { StoreScene } from '../three-scene';
import { markSignMesh } from '../sign-builders';

export function buildImpactPrinter93(
  scene: StoreScene,
  parent: THREE.Group,
  anchor: { x: number; y: number; z: number; rotY: number },
  paperTexture: THREE.Texture,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'impact-printer-93';
  group.position.set(anchor.x, anchor.y, anchor.z);
  group.rotation.y = anchor.rotY;
  parent.add(group);
  const fallback = new THREE.Group();
  fallback.name = 'impact-printer-fallback';
  group.add(fallback);
  const box = (w: number, h: number, d: number, y: number, z: number, color: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: .6 }));
    mesh.position.set(0, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    fallback.add(mesh);
  };
  box(.9, .3, .6, .15, 0, 0xd9cdb2);
  box(.86, .03, .3, .31, 0, 0xbfb49a);
  box(.66, .16, .5, .08, -.5, 0xfbfaf4);
  const sheet = markSignMesh(new THREE.Mesh(new THREE.PlaneGeometry(.62, .5),
    new THREE.MeshStandardMaterial({ map: paperTexture, roughness: .9, side: THREE.DoubleSide })));
  sheet.position.set(0, .52, -.12);
  sheet.rotation.x = -.35;
  fallback.add(sheet);

  // Follow texture drop-in precedence: active pack first, flat user-assets
  // second. A missing/corrupt optional model leaves the built-in fixture up.
  const rel = 'fixtures/impact-printer-1993/model.glb';
  const pack = brandPackDir();
  const candidates = pack ? [`user-assets/${pack}/${rel}`, `user-assets/${rel}`] : [`user-assets/${rel}`];
  const isAttached = () => {
    let root: THREE.Object3D = group;
    while (root.parent) root = root.parent;
    return root === scene.scene;
  };
  const load = (index: number) => {
    if (!isAttached() || index >= candidates.length) return;
    new GLTFLoader().load(assetUrl(candidates[index]), ({ scene: model }) => {
      const textures = new Set<THREE.Texture>();
      const materials = new Set<THREE.Material>();
      const geometries = new Set<THREE.BufferGeometry>();
      model.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        geometries.add(object.geometry);
        const list = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of list) {
          materials.add(material);
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) textures.add(value);
          }
        }
        object.castShadow = object.receiveShadow = true;
      });
      if (!isAttached()) {
        geometries.forEach(geometry => geometry.dispose());
        materials.forEach(material => material.dispose());
        textures.forEach(texture => texture.dispose());
        return;
      }
      // clearActiveSignage owns mesh/material disposal. It does not dispose
      // texture maps: only maps from THIS GLB are released on parent removal;
      // the fallback's cached canvas remains owned by counter-props-93.
      const releaseTextures = () => {
        parent.removeEventListener('removed', releaseTextures);
        textures.forEach(texture => texture.dispose());
      };
      parent.addEventListener('removed', releaseTextures);
      model.name = 'impact-printer-model';
      group.add(model);
      fallback.visible = false;
      scene.fixtureContext().requestShadowRefresh();
      scene.requestRender();
    }, undefined, () => load(index + 1));
  };
  load(0);
  return group;
}
