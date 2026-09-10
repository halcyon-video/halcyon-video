// Original seasonal window kit; no textures, marks or external artwork.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { assetUrl } from '../asset-url';
import { posterBayIndices } from '../store-layout';
import { inSeason } from '../promo-campaigns';
import clings from '../../public/art/halloween-clings.svg?raw';

export function installHalloween(parent: THREE.Group, panes: { lo: number; hi: number }[], refresh: () => void): void {
  if (!inSeason('halloween') || !panes.length) return;
  const kit = new THREE.Group(); kit.name = 'halloween-decor'; parent.add(kit);
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
    disposed = true; parent.removeEventListener('removed', dispose);
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    kit.removeFromParent();
  };
  parent.addEventListener('removed', dispose);
  const pane = panes[0];
  const x = pane.lo + .95;
  // Parent faces inward (+local Z); footprint stays against the knee wall.
  const fallback = new THREE.Mesh(new THREE.SphereGeometry(.58, 16, 10), new THREE.MeshStandardMaterial({ color: 0xb95717, roughness: .45 }));
  fallback.name = 'pumpkin-loading-fallback'; fallback.scale.y = .85;
  fallback.position.set(x, .50, .88); kit.add(fallback); own(fallback);
  new GLTFLoader().load(assetUrl('models/halloween-pumpkin.glb'), ({ scene: model }) => {
    if (disposed) {
      const gs = new Set<THREE.BufferGeometry>(); const ms = new Set<THREE.Material>();
      model.traverse(o => { if (o instanceof THREE.Mesh) { gs.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => ms.add(m)); } });
      gs.forEach(g => g.dispose()); ms.forEach(m => m.dispose()); return;
    }
    model.name = 'halloween-molded-pumpkin'; model.position.set(x, .01, .88);
    model.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true; });
    kit.add(model); own(model); fallback.visible = false; refresh();
  }, undefined, () => { /* Retain the inexpensive fallback on load failure. */ });
  // Flat SVG paths become actual die-cut geometry: transparent outside each
  // silhouette, two-sided, no alpha texture allocation or rectangular backing.
  const posterPanes = posterBayIndices(panes.length);
  const clingPane = panes.find((_, i) => !posterPanes.includes(i)) ?? pane;
  const paths = new SVGLoader().parse(clings).paths;
  const parts: THREE.BufferGeometry[] = [];
  paths.forEach(path => SVGLoader.createShapes(path).forEach(shape => {
    const geo = new THREE.ShapeGeometry(shape, 8);
    const color = new THREE.Color(path.color);
    const count = geo.getAttribute('position').count;
    geo.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: count }, () => [color.r, color.g, color.b]).flat(), 3));
    // 300px master spans 1.5ft, clear of the centre mullion and posters.
    geo.scale(.005, -.005, 1); geo.translate(clingPane.lo + .25, 4.9, .025); parts.push(geo);
  }));
  const merged = mergeGeometries(parts); parts.forEach(g => g.dispose());
  if (merged) {
    const art = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .62 }));
    art.name = 'halloween-window-clings'; kit.add(art); own(art);
  }
}
