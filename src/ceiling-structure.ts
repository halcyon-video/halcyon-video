import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from './asset-url.ts';
import { disposeDetachedModel } from './model-resources.ts';
import type { LuminaireAnchor } from './ceiling-luminaire.ts';

type Part = 'TrussChord' | 'TrussWeb' | 'DuctSpan' | 'DuctCollar' | 'DuctElbow' | 'DuctStrap' | 'DuctOutlet';
export interface CeilingStructurePlan {
  parts: Map<Part, THREE.Matrix4[]>;
  rows: number[];
  bottom: number;
  top: number;
  ductRuns: { x: number; y: number; start: number; end: number; side: number }[];
}
export const exposedStructureBottom = (ceiling: number): number => ceiling - 1.3;

/** Inferred generic construction, fitted to actual room bounds and light anchors. */
export function planCeilingStructure(left: number, right: number, back: number, front: number,
  ceiling: number, anchors: Pick<LuminaireAnchor, 'x' | 'z'>[], serviceBoxes: THREE.Box3[] = [], step?: { x: number; depth: number }, edgeInset = 0, structureBoxes = serviceBoxes): CeilingStructurePlan {
  const plan: CeilingStructurePlan = { parts: new Map(), rows: [], bottom: exposedStructureBottom(ceiling),
    top: ceiling + .3, ductRuns: [] };
  if (right - left < 8 || front - back < 4 || ceiling < 13.5) return plan;
  const add = (part: Part, position: THREE.Vector3, rotation = new THREE.Quaternion(), scale = new THREE.Vector3(1, 1, 1)) => {
    const matrices = plan.parts.get(part) ?? []; matrices.push(new THREE.Matrix4().compose(position, rotation, scale)); plan.parts.set(part, matrices);
  };
  const segment = (part: Part, a: THREE.Vector3, b: THREE.Vector3, axis: 'x' | 'z' = 'x', roll = 0) => {
    const delta = b.clone().sub(a), length = delta.length(); if (length < .001) return;
    if (part === 'TrussWeb' && structureBoxes.some(box => {
      const hit = new THREE.Ray(a, delta.clone().normalize()).intersectBox(box, new THREE.Vector3());
      return box.containsPoint(a) || box.containsPoint(b) || (hit && hit.distanceTo(a) <= length);
    })) return;
    const source = axis === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const rotation = new THREE.Quaternion().setFromUnitVectors(source, delta.normalize());
    if (roll) rotation.multiply(new THREE.Quaternion().setFromAxisAngle(source, roll));
    add(part, a.clone().add(b).multiplyScalar(.5), rotation, axis === 'x' ? new THREE.Vector3(length, 1, 1) : new THREE.Vector3(1, 1, length));
  };
  const knots = [...new Set([back + .15, ...anchors.map(a => a.z).filter(z => z >= back && z <= front), front - .15])].sort((a, b) => a - b);
  plan.rows.push(knots[0]);
  for (let i = 1; i < knots.length; i++) {
    const count = Math.max(1, Math.ceil((knots[i] - knots[i - 1]) / 5));
    for (let j = 1; j <= count; j++) plan.rows.push(j === count ? knots[i] : knots[i - 1] + (knots[i] - knots[i - 1]) * j / count);
  }
  const rightAt = (z: number) => step && z < back + step.depth ? Math.min(right, step.x) : right;
  for (const z of plan.rows) {
    const edge = rightAt(z);
    segment('TrussChord', new THREE.Vector3(left, plan.top, z), new THREE.Vector3(edge, plan.top, z), 'x', Math.PI);
    let runs = [[left, edge]];
    for (const box of structureBoxes) {
      if (box.max.y < plan.bottom || box.min.y > plan.top || z < box.min.z - .12 || z > box.max.z + .12) continue;
      runs = runs.flatMap(([lo, hi]) => box.max.x < lo || box.min.x > hi ? [[lo, hi]] :
        [[lo, Math.max(lo, box.min.x)], [Math.min(hi, box.max.x), hi]].filter(([a, b]) => b - a > .2));
    }
    for (const [lo, hi] of runs) {
      segment('TrussChord', new THREE.Vector3(lo, plan.bottom, z), new THREE.Vector3(hi, plan.bottom, z));
      const panels = Math.ceil((hi - lo) / 2.5);
      for (let i = 0; i < panels; i++) {
        const x0 = lo + (hi - lo) * i / panels, x1 = lo + (hi - lo) * (i + 1) / panels;
        segment('TrussWeb', new THREE.Vector3(x0, i % 2 ? plan.top - .04 : plan.bottom + .04, z),
          new THREE.Vector3(x1, i % 2 ? plan.bottom + .04 : plan.top - .04, z));
      }
      for (const x of [lo + .04, hi - .04]) segment('TrussWeb', new THREE.Vector3(x, plan.bottom + .04, z), new THREE.Vector3(x, plan.top - .04, z));
    }
  }
  // Longitudinal bridging triangulates adjacent joists, with open negative space.
  for (let x = left + 4; x < right - 2; x += 8) for (let i = 1; i < plan.rows.length; i++) {
    if (x > Math.min(rightAt(plan.rows[i - 1]), rightAt(plan.rows[i])) - .2) continue;
    segment('TrussWeb', new THREE.Vector3(x, plan.bottom + .04, plan.rows[i - 1]), new THREE.Vector3(x, plan.top - .04, plan.rows[i]));
    segment('TrussWeb', new THREE.Vector3(x, plan.top - .04, plan.rows[i - 1]), new THREE.Vector3(x, plan.bottom + .04, plan.rows[i]));
  }
  // The visible feed begins at the fascia's service face. Omit pipework
  // concealed behind the opaque cornice, and keep the runs clear of lights/TVs.
  const end = Math.min(front - edgeInset - 1, Math.max(back + 3, ...anchors.map(a => a.z + 1)));
  for (const side of [1, -1]) {
    const wall = side === 1 ? left + edgeInset : right - edgeInset, y = ceiling - 2;
    const inletZ = back + (side === -1 && step ? step.depth : 0) + edgeInset + 1, start = inletZ + .65;
    if (end <= start + .5) continue;
    const candidates = [wall + side * 1.3, ...serviceBoxes.map(b => side === 1 ? b.max.x + .55 : b.min.x - .55),
      ...anchors.map(a => a.x + side * 1.25)].filter(x => side * (x - wall) >= 1.3 - 1e-6 && side * (x - (left + right) / 2) < -1).sort((a, b) => Math.abs(a - wall) - Math.abs(b - wall));
    const x = candidates.find(x => {
      const volume = new THREE.Box3(new THREE.Vector3(x - .37, y - .37, start), new THREE.Vector3(x + .37, y + .37, end));
      return !serviceBoxes.some(b => b.intersectsBox(volume)) && !anchors.some(a => a.z >= start - .8 && a.z <= end + .8 && Math.abs(a.x - x) < 1.2);
    });
    if (x === undefined) continue;
    const bendStart = x - side * .65;
    segment('DuctSpan', new THREE.Vector3(wall, y, inletZ), new THREE.Vector3(bendStart, y, inletZ), 'z');
    add('DuctElbow', new THREE.Vector3(bendStart, y, inletZ), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), side === 1 ? 0 : Math.PI));
    segment('DuctSpan', new THREE.Vector3(x, y, start), new THREE.Vector3(x, y, end), 'z');
    add('DuctCollar', new THREE.Vector3(wall + side * .02, y, inletZ), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
    for (let z = start; z <= end; z += 3) add('DuctCollar', new THREE.Vector3(x, y, z));
    add('DuctCollar', new THREE.Vector3(x, y, end));
    add('DuctOutlet', new THREE.Vector3(x, y, end + .018));
    for (let z = start + .5; z < end - .1; z += 4) {
      add('DuctStrap', new THREE.Vector3(x, y, z));
      for (const dx of [-.28, .28]) segment('TrussWeb', new THREE.Vector3(x + dx, y + .23, z), new THREE.Vector3(x + dx, ceiling + .34, z));
    }
    plan.ductRuns.push({ x, y, start, end, side });
  }
  return plan;
}

/** All repeated members instance one authored template. The legacy beams stay
 * until the entire kit is available; no partially assembled ceiling is exposed. */
export function installCeilingStructure(scene: THREE.Scene, plan: CeilingStructurePlan, refresh: () => void): THREE.Group {
  const root = new THREE.Group(); root.name = 'Authored exposed ceiling'; scene.add(root);
  if (!plan.parts.size) return root;
  let disposed = false;
  const chords = plan.parts.get('TrussChord')!;
  const fallback = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .085, .24).translate(0, .0425, 0),
    new THREE.MeshStandardMaterial({ color: 0xbfc5c1, metalness: .25, roughness: .55 }), chords.length);
  fallback.name = 'Exposed ceiling fallback';
  chords.forEach((matrix, i) => fallback.setMatrixAt(i, matrix));
  fallback.instanceMatrix.needsUpdate = true; fallback.computeBoundingSphere(); root.add(fallback);
  const stop = () => {
    if (disposed) return; disposed = true;
    root.traverse(o => { if (o instanceof THREE.InstancedMesh) o.dispose(); });
    disposeDetachedModel(root);
  };
  root.addEventListener('removed', stop); fallback.geometry.addEventListener('dispose', stop);
  new GLTFLoader().load(assetUrl('models/ceiling-structure.glb'), ({ scene: source }) => {
    if (disposed) { disposeDetachedModel(source); return; }
    const missing = [...plan.parts.keys()].filter(name => !source.getObjectByName(name));
    if (missing.length) { disposeDetachedModel(source); console.warn('[ceiling] Incomplete structure kit', missing); return; }
    source.updateMatrixWorld(true);
    for (const [name, matrices] of plan.parts) source.getObjectByName(name)!.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const geometry = o.geometry.clone().applyMatrix4(o.matrixWorld);
      const material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
      const mesh = new THREE.InstancedMesh(geometry, material, matrices.length); mesh.name = name + ' instances';
      matrices.forEach((m, i) => mesh.setMatrixAt(i, m)); mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
      mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
    });
    fallback.visible = false; root.userData.ceilingStructureLoaded = true;
    root.userData.joistRows = plan.rows; root.userData.ductRuns = plan.ductRuns;
    disposeDetachedModel(source); refresh();
  }, undefined, () => { /* Missing models retain supported light anchors and beams. */ });
  return root;
}
