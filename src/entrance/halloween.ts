// Original seasonal window kit; no textures, marks or external artwork.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { assetUrl } from '../asset-url';
import { inSeason } from '../promo-campaigns';
import { HALLOWEEN_CLING_FINISH, halloweenClingPlacements } from './halloween-layout';
import clings from '../../public/art/halloween-clings.svg?raw';

interface PumpkinPose { position: THREE.Vector3; yaw: number }

export function installHalloween(
  windowParent: THREE.Group,
  panes: { lo: number; hi: number }[],
  pumpkinParent: THREE.Object3D,
  pumpkinPose: PumpkinPose,
  refresh: () => void,
): void {
  if (!inSeason('halloween') || !panes.length) return;
  const kit = new THREE.Group(); kit.name = 'halloween-window-decor'; windowParent.add(kit);
  const counterKit = new THREE.Group(); counterKit.name = 'halloween-counter-decor'; pumpkinParent.add(counterKit);
  let disposed = false;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const own = (object: THREE.Object3D) => object.traverse(o => {
    if (o instanceof THREE.Mesh) {
      geometries.add(o.geometry);
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m));
    }
  });
  const dispose = () => {
    disposed = true; windowParent.removeEventListener('removed', dispose);
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    kit.removeFromParent(); counterKit.removeFromParent();
  };
  windowParent.addEventListener('removed', dispose);
  // The pumpkin's authored origin is its stable base, so the model rests
  // directly on the real counter-top anchor instead of beside the window.
  const fallback = new THREE.Mesh(new THREE.SphereGeometry(.58, 16, 10), new THREE.MeshStandardMaterial({ color: 0xb95717, roughness: .45 }));
  fallback.name = 'pumpkin-loading-fallback'; fallback.scale.y = .85;
  fallback.position.copy(pumpkinPose.position).add(new THREE.Vector3(0, .50, 0));
  fallback.rotation.y = pumpkinPose.yaw; counterKit.add(fallback); own(fallback);
  new GLTFLoader().load(assetUrl('models/halloween-pumpkin.glb'), ({ scene: model }) => {
    if (disposed) {
      const gs = new Set<THREE.BufferGeometry>(); const ms = new Set<THREE.Material>();
      model.traverse(o => { if (o instanceof THREE.Mesh) { gs.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => ms.add(m)); } });
      gs.forEach(g => g.dispose()); ms.forEach(m => m.dispose()); return;
    }
    model.name = 'halloween-molded-pumpkin'; model.position.copy(pumpkinPose.position);
    model.rotation.y = pumpkinPose.yaw + 0.18;
    model.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true; });
    counterKit.add(model); own(model); fallback.visible = false; refresh();
  }, undefined, () => { /* Retain the inexpensive fallback on load failure. */ });
  // Each SVG path becomes a reusable die-cut master. Larger clones are then
  // scattered across every other pane with deterministic variation and a
  // measured clear margin from frames and mullions.
  const paths = new SVGLoader().parse(clings).paths;
  const masters: THREE.BufferGeometry[] = [];
  paths.forEach(path => SVGLoader.createShapes(path).forEach(shape => {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 2.4, bevelEnabled: true, bevelSize: 1.5, bevelThickness: 1.2, bevelSegments: 2, curveSegments: 10 });
    const color = new THREE.Color(path.color);
    const count = geo.getAttribute('position').count;
    geo.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: count }, () => [color.r, color.g, color.b]).flat(), 3));
    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    const width = box.max.x - box.min.x;
    const cx = (box.min.x + box.max.x) / 2;
    const cy = (box.min.y + box.max.y) / 2;
    geo.translate(-cx, -cy, -box.min.z);
    geo.scale(1 / width, -1 / width, .005);
    masters.push(geo);
  }));
  const parts: THREE.BufferGeometry[] = [];
  halloweenClingPlacements(panes).forEach(placement => {
    const geo = masters[placement.designIndex % masters.length].clone();
    geo.scale(placement.width, placement.width, 1);
    geo.rotateZ(placement.rotation);
    geo.translate(placement.x, placement.y, .024);
    parts.push(geo);
  });
  masters.forEach(g => g.dispose());
  const merged = mergeGeometries(parts); parts.forEach(g => g.dispose());
  if (merged) {
    const art = new THREE.Mesh(merged, new THREE.MeshPhongMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      ...HALLOWEEN_CLING_FINISH,
    }));
    art.name = 'halloween-window-clings'; kit.add(art); own(art);
  }
}
