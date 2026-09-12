// Original Blender fixtures. Feet, origin at ceiling contact, beam down -Y.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from './asset-url.ts';
import { disposeDetachedModel } from './model-resources.ts';
import { selfLit } from './material-lighting.ts';
export type LuminaireVariant = 'dome' | 'directional';
export interface LuminaireAnchor { x: number; y: number; z: number; variant: LuminaireVariant }
export function exposedCeilingEnabled(format: string, height: number, setting: string | null): boolean {
  return format === 'corporate' && height >= 13.5 && setting === 'exposed';
}
export function lampPosition(a: LuminaireAnchor): THREE.Vector3 {
  return new THREE.Vector3(a.x, a.y - (a.variant === 'dome' ? 1.37 : .87), a.z - (a.variant === 'directional' ? .04 : 0));
}
export function aimLuminaire(key: THREE.SpotLight, a: LuminaireAnchor): void {
  key.position.copy(lampPosition(a));
  key.target.position.set(a.x, 0, a.z - (a.variant === 'directional' ? key.position.y * Math.tan(25 * Math.PI / 180) : .01));
}

/** Instances every named GLB part; total draw cost independent of bay count. */
export function installCeilingLuminaires(scene: THREE.Scene, anchors: LuminaireAnchor[], refresh: () => void): THREE.Group {
  const root = new THREE.Group(); root.name = 'Ceiling luminaires'; scene.add(root);
  let disposed = false;
  const fallback = new THREE.Group(); fallback.name = 'Luminaire fallback'; root.add(fallback);
  const paint = new THREE.MeshStandardMaterial({ color: 0xe3e4df, metalness: .12, roughness: .4 });
  const inner = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, metalness: .55, roughness: .25 });
  const lamp = selfLit(new THREE.MeshStandardMaterial({ color: 0xf3f5ff, emissive: 0xf3f5ff, emissiveIntensity: 1.4 }), 'light-source');
  const batch = (parent: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], places: LuminaireAnchor[], transform = new THREE.Matrix4(), name = '') => {
    const mesh = new THREE.InstancedMesh(geo, mat, places.length); mesh.name = name;
    places.forEach((a, i) => mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(a.x, a.y, a.z).multiply(transform)));
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  };
  for (const variant of ['dome', 'directional'] as const) {
    const places = anchors.filter(a => a.variant === variant); if (!places.length) continue;
    const dome = variant === 'dome';
    const points = (dome ? [[.14,-1.04],[.25,-1.25],[.46,-1.61],[.75,-1.92],[.73,-1.96],[.44,-1.64],[.23,-1.27],[.12,-1.08],[.14,-1.04]] : [[.17,-.58],[.23,-.82],[.37,-1.18],[.35,-1.20],[.20,-.82],[.14,-.60],[.17,-.58]]).map(([r,y])=>new THREE.Vector2(r,y));
    const transform = dome ? new THREE.Matrix4() : new THREE.Matrix4().makeTranslation(0,-.78,0).multiply(new THREE.Matrix4().makeRotationX(25*Math.PI/180)).multiply(new THREE.Matrix4().makeTranslation(0,.78,0));
    batch(fallback, new THREE.LatheGeometry(points, 32), inner, places, transform, variant + ' hollow fallback');
    batch(fallback, new THREE.BoxGeometry(.38,.08,.34), paint, places, new THREE.Matrix4().makeTranslation(0,-.04,0));
    if (dome) {
      batch(fallback, new THREE.BoxGeometry(.46,.34,.4), paint, places, new THREE.Matrix4().makeTranslation(0,-.58,0));
      batch(fallback, new THREE.CylinderGeometry(.14,.14,.34,16), paint, places, new THREE.Matrix4().makeTranslation(0,-.91,0));
    } else {
      batch(fallback, new THREE.BoxGeometry(.70,.12,.13), paint, places, new THREE.Matrix4().makeTranslation(0,-.45,0));
      for (const x of [-.3,.3]) {
        batch(fallback, new THREE.BoxGeometry(.09,.38,.13), paint, places, new THREE.Matrix4().makeTranslation(x,-.64,0));
        batch(fallback, new THREE.CylinderGeometry(.07,.07,.18,12), paint, places,
          new THREE.Matrix4().makeTranslation(Math.sign(x)*.265,-.78,0).multiply(new THREE.Matrix4().makeRotationZ(Math.PI/2)));
      }
    }
    batch(fallback, new THREE.CylinderGeometry(.045,.045,.42,12), paint, places, new THREE.Matrix4().makeTranslation(0,-.21,0));
    batch(fallback, new THREE.SphereGeometry(dome?.16:.105,16,8), lamp, places, new THREE.Matrix4().makeTranslation(0,dome?-1.30:-.84,0));
    new GLTFLoader().load(assetUrl(`models/ceiling-luminaire-${variant}.glb`), ({scene:model}) => {
      if (disposed) { disposeDetachedModel(model); return; }
      model.updateMatrixWorld(true);
      const installed = new THREE.Group(); installed.name = variant + ' Blender instances';
      model.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        const materials = (Array.isArray(o.material) ? o.material : [o.material]).map(m => {
          const copy = m.clone(); if (copy.name === 'Lamp') selfLit(copy, 'light-source'); return copy;
        });
        batch(installed, o.geometry.clone(), Array.isArray(o.material) ? materials : materials[0], places, o.matrixWorld, o.name);
      });
      root.add(installed);
      // Each variant completes independently; its fallback is only hidden then.
      fallback.children.filter(o => o.userData.variant === variant).forEach(o => { o.visible = false; });
      disposeDetachedModel(model); refresh();
    }, undefined, () => { /* Offline retains hollow shades and physical supports. */ });
    fallback.children.filter(o => !o.userData.variant).forEach(o => { o.userData.variant = variant; });
  }
  const stop = () => { if (disposed) return; disposed = true; root.traverse(o => { if (o instanceof THREE.InstancedMesh) o.dispose(); }); disposeDetachedModel(root); };
  root.addEventListener('removed', stop);
  (fallback.children[0] as THREE.Mesh | undefined)?.geometry.addEventListener('dispose', stop);
  return root;
}

/** Joist undersides share the exact attachment plane of the fixture anchors. */
export function buildLuminaireStructure(scene: THREE.Scene, anchors: LuminaireAnchor[], left: number, right: number): void {
  if (!anchors.length) return;
  const rows = [...new Set(anchors.map(a=>a.z))];
  const geo = new THREE.BoxGeometry(right-left,.35,.16);
  const mat = new THREE.MeshStandardMaterial({color:0x6d706c,metalness:.35,roughness:.65});
  const mesh = new THREE.InstancedMesh(geo,mat,rows.length); mesh.name='Exposed ceiling bay joists';
  rows.forEach((z,i)=>mesh.setMatrixAt(i,new THREE.Matrix4().makeTranslation((left+right)/2,anchors[0].y+.175,z)));
  mesh.computeBoundingSphere();mesh.receiveShadow=true;scene.add(mesh);
}
