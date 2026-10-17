// Original seasonal window kit; no textures, marks or external artwork.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { assetUrl } from '../asset-url';
import { inSeason } from '../promo-campaigns';
import { onWalkBlocked } from '../walk-bump';
import type { CounterBandEdge } from './counter';
import { buildHalloweenGarland } from './halloween-garland';
import { HALLOWEEN_CLING_FINISH, halloweenClingPlacements } from './halloween-layout';
import { carveJackOLantern, jackOLanternSeason } from './jack-o-lantern';
import clings from '/art/halloween-clings.svg?raw';

interface PumpkinPose {
  position: THREE.Vector3;
  yaw: number;
  /** World heading (x = sin, z = cos) the carved face looks along: the
   *  counter's customer side, toward the sales floor. */
  faceYaw: number;
}

/** One glazed run: the storefront, or a side-wall ribbon (feedback pin 276). */
export interface HalloweenWindow {
  parent: THREE.Group;
  panes: { lo: number; hi: number }[];
  /** Panes carrying a poster or door hardware; clings leave them clear. */
  occupied?: readonly number[];
}

export interface HalloweenInstall {
  /** Storefront first: its removal tears the whole kit down. */
  windows: HalloweenWindow[];
  counterParent: THREE.Object3D;
  pumpkinPose: PumpkinPose;
  /** The walk-in band's customer faces, for the garland (none on a desk). */
  band: { edges: CounterBandEdge[]; topY: number } | null;
  /** Shadows and a frame after a structural change (the model landing). */
  refresh: () => void;
  /** One more frame, for the pumpkin's hop. */
  requestRender: () => void;
}

// A bump is the walking player stopping against the counter with the
// pumpkin within reach (eye ~0.45 ft off the band face, pumpkin mid-band).
const BUMP_REACH_FT = 1.9;
const BUMP_GAP_MS = 250;   // a fresh push, not the same lean held against it
const HOP_MS = 420;
const HOP_FT = 0.07;
const HOP_TILT = 0.06;

export function installHalloween(o: HalloweenInstall): void {
  const front = o.windows[0];
  if (!inSeason('halloween') || !front?.panes.length) return;
  const counterKit = new THREE.Group(); counterKit.name = 'halloween-counter-decor'; o.counterParent.add(counterKit);
  const kits: THREE.Group[] = [];
  let disposed = false;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const own = (object: THREE.Object3D) => object.traverse(obj => {
    if (obj instanceof THREE.Mesh) {
      geometries.add(obj.geometry);
      (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => {
        materials.add(m);
        if ((m as THREE.MeshBasicMaterial).map) textures.add((m as THREE.MeshBasicMaterial).map!);
      });
    }
  });

  // The pumpkin rides a rig at its counter-top pose so a bump can lift and
  // rock it without disturbing the model's authored yaw.
  const rig = new THREE.Group(); rig.name = 'halloween-pumpkin-rig';
  rig.position.copy(o.pumpkinPose.position); counterKit.add(rig);
  let hopStart = -1, lastNearStop = -Infinity, leanX = 0, leanZ = 0;
  const tickHop = () => {
    if (hopStart < 0) return;
    const u = (performance.now() - hopStart) / HOP_MS;
    if (u >= 1) {
      hopStart = -1; rig.position.y = o.pumpkinPose.position.y; rig.rotation.set(0, 0, 0);
      o.requestRender(); return;
    }
    const lift = u < 0.68 ? Math.sin(Math.PI * u / 0.68) : 0.22 * Math.sin(Math.PI * (u - 0.68) / 0.32);
    const lean = HOP_TILT * Math.sin(Math.PI * 2 * u) * (1 - u);
    rig.position.y = o.pumpkinPose.position.y + HOP_FT * lift;
    rig.rotation.set(lean * leanX, 0, lean * leanZ);
    o.requestRender();
  };
  const stopListening = onWalkBlocked((x, z) => {
    const dx = o.pumpkinPose.position.x - x, dz = o.pumpkinPose.position.z - z;
    const d2 = dx * dx + dz * dz;
    if (d2 > BUMP_REACH_FT * BUMP_REACH_FT) return;
    const now = performance.now();
    const fresh = now - lastNearStop > BUMP_GAP_MS;
    lastNearStop = now;
    if (!fresh || hopStart >= 0) return;
    // Rock away from the player: the top leans along the push.
    const len = Math.sqrt(d2) || 1;
    leanX = dz / len; leanZ = -dx / len;
    hopStart = now; o.requestRender();
  });

  const dispose = () => {
    disposed = true; front.parent.removeEventListener('removed', dispose);
    stopListening();
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
    kits.forEach(k => k.removeFromParent()); counterKit.removeFromParent();
  };
  front.parent.addEventListener('removed', dispose);
  // The pumpkin's authored origin is its stable base, so the model rests
  // directly on the real counter-top anchor instead of beside the window.
  const fallback = new THREE.Mesh(new THREE.SphereGeometry(.58, 16, 10), new THREE.MeshStandardMaterial({ color: 0xb95717, roughness: .45 }));
  fallback.name = 'pumpkin-loading-fallback'; fallback.scale.y = .85;
  fallback.position.set(0, .50, 0);
  fallback.onBeforeRender = tickHop;
  rig.add(fallback); own(fallback);
  new GLTFLoader().load(assetUrl('models/halloween-pumpkin.glb'), ({ scene: model }) => {
    if (disposed) {
      const gs = new Set<THREE.BufferGeometry>(); const ms = new Set<THREE.Material>();
      model.traverse(obj => { if (obj instanceof THREE.Mesh) { gs.add(obj.geometry); (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => ms.add(m)); } });
      gs.forEach(g => g.dispose()); ms.forEach(m => m.dispose()); return;
    }
    model.name = 'halloween-molded-pumpkin';
    model.traverse(obj => {
      if (obj instanceof THREE.Mesh) { obj.castShadow = obj.receiveShadow = true; obj.onBeforeRender = tickHop; }
    });
    // Carved for the second half of October, the face turned to the sales
    // floor (expressed in the model's own frame).
    const modelYaw = o.pumpkinPose.yaw + 0.18;
    if (jackOLanternSeason()) carveJackOLantern(model, o.pumpkinPose.faceYaw - modelYaw);
    model.rotation.y = modelYaw;
    rig.add(model); own(model); fallback.visible = false; o.refresh();
  }, undefined, () => { /* Retain the inexpensive fallback on load failure. */ });
  // Each SVG path becomes a reusable die-cut master. Larger clones are then
  // distributed across clear panes, leaving posters and return hardware
  // unobstructed, with measured margins from frames and mullions.
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
  // Front and side glazing share one cling material; each run is one mesh.
  const clingMaterial = new THREE.MeshPhongMaterial({ vertexColors: true, side: THREE.DoubleSide, ...HALLOWEEN_CLING_FINISH });
  o.windows.forEach((win, runIndex) => {
    const parts: THREE.BufferGeometry[] = [];
    halloweenClingPlacements(win.panes, 2, 7.7, win.occupied ?? []).forEach(placement => {
      const geo = masters[placement.designIndex % masters.length].clone();
      geo.scale(placement.width, placement.width, 1);
      geo.rotateZ(placement.rotation);
      geo.translate(placement.x, placement.y, .024);
      parts.push(geo);
    });
    const merged = parts.length ? mergeGeometries(parts) : null; parts.forEach(g => g.dispose());
    if (!merged) return;
    const kit = new THREE.Group(); kit.name = runIndex ? `halloween-window-decor-${runIndex}` : 'halloween-window-decor';
    win.parent.add(kit); kits.push(kit);
    const art = new THREE.Mesh(merged, clingMaterial);
    art.name = 'halloween-window-clings'; kit.add(art); own(art);
  });
  const garland = o.band && paths.length >= 2
    ? buildHalloweenGarland(o.band.edges, o.band.topY, SVGLoader.createShapes(paths[0]), SVGLoader.createShapes(paths[1]))
    : null;
  if (garland) { counterKit.add(garland); own(garland); }
  masters.forEach(g => g.dispose());
}
