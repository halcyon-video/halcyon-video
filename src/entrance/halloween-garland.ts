// October counter garland (feedback pin 275): a black cord swagged along the
// walk-in band's customer faces, taped at every swag point just under the
// band top, strung with small shiny purple and black bats, pumpkins and
// skulls. Static decor: one merged cord, one instanced mesh per charm shape
// and one for the tape tabs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CounterBandEdge } from './counter';

const SWAG_FT = 2.4;      // target span between tape tabs
const SAG_FT = 0.17;      // drop at the middle of a swag
const TAPE_DROP = 0.08;   // cord height below the band top at a tab
const OUT_FT = 0.07;      // clear of the band face and its bevel
const CORD_R = 0.026;
const CHARM_STEP = 0.4;   // spacing along a swag
const CHARM_FT = 0.2;     // charm width
const CHARM_COLORS = [0x5d2a8c, 0x18151c] as const;

/** A small skull, unit-ish and y-up: cranium, cheeks, jaw, sockets and nose. */
function skullShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.3, -0.16);
  s.bezierCurveTo(-0.56, 0.02, -0.5, 0.52, 0, 0.53);
  s.bezierCurveTo(0.5, 0.52, 0.56, 0.02, 0.3, -0.16);
  s.lineTo(0.24, -0.47); s.lineTo(-0.24, -0.47);
  s.closePath();
  for (const cx of [-0.18, 0.18]) {
    const eye = new THREE.Path();
    eye.absellipse(cx, 0.07, 0.12, 0.14, 0, Math.PI * 2, true, 0);
    s.holes.push(eye);
  }
  const nose = new THREE.Path();
  nose.moveTo(0, -0.1); nose.lineTo(0.06, -0.23); nose.lineTo(-0.06, -0.23); nose.closePath();
  s.holes.push(nose);
  return s;
}

/** Thin foil charm normalised to unit width, centred, facing +Z. */
function charmGeometry(shapes: THREE.Shape[], flipY: boolean): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(shapes, { depth: 1, bevelEnabled: false, curveSegments: 6 });
  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  const width = box.max.x - box.min.x;
  geo.translate(-(box.min.x + box.max.x) / 2, -(box.min.y + box.max.y) / 2, 0);
  geo.scale(1 / width, (flipY ? -1 : 1) / width, 0.035);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Build the garland for every band edge. `batShapes`/`pumpkinShapes` are the
 * window-cling silhouettes (SVG space, y down), shared so the counter and the
 * glass wear one set of motifs.
 */
export function buildHalloweenGarland(
  edges: readonly CounterBandEdge[],
  topY: number,
  batShapes: THREE.Shape[],
  pumpkinShapes: THREE.Shape[],
): THREE.Group | null {
  if (!edges.length) return null;
  const group = new THREE.Group();
  group.name = 'halloween-counter-garland';
  const cords: THREE.BufferGeometry[] = [];
  const tabs: { x: number; y: number; z: number; yaw: number; roll: number }[] = [];
  const charms: { x: number; y: number; z: number; yaw: number; roll: number }[][] = [[], [], []];
  let charmIndex = 0;
  const point = new THREE.Vector3();
  edges.forEach((edge, edgeIndex) => {
    const dx = edge.bx - edge.ax, dz = edge.bz - edge.az;
    const len = Math.hypot(dx, dz);
    if (len < 0.8) return;
    const ox = -edge.nx * OUT_FT, oz = -edge.nz * OUT_FT;
    const yaw = Math.atan2(-edge.nx, -edge.nz); // local +Z looks out at the customer
    const swags = Math.max(1, Math.round(len / SWAG_FT));
    // Inset the end tabs off the mitred corners so neighbours never stack.
    const inset = Math.min(0.25, len * 0.1) / len;
    for (let k = 0; k <= swags; k++) {
      const t = inset + (1 - 2 * inset) * (k / swags);
      tabs.push({ x: edge.ax + dx * t + ox * 1.5, y: topY - 0.1, z: edge.az + dz * t + oz * 1.5,
        yaw, roll: Math.sin((edgeIndex + 1) * 12.9 + k * 4.1) * 0.12 });
    }
    for (let k = 0; k < swags; k++) {
      const t0 = inset + (1 - 2 * inset) * (k / swags);
      const t1 = inset + (1 - 2 * inset) * ((k + 1) / swags);
      const along = (s: number, out: THREE.Vector3) => {
        const t = t0 + (t1 - t0) * s;
        return out.set(edge.ax + dx * t + ox, topY - TAPE_DROP - SAG_FT * 4 * s * (1 - s), edge.az + dz * t + oz);
      };
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) pts.push(along(i / 8, new THREE.Vector3()));
      cords.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, CORD_R, 5, false));
      const spanFt = len * (t1 - t0);
      const count = Math.max(2, Math.floor(spanFt / CHARM_STEP));
      for (let i = 0; i < count; i++) {
        along((i + 0.5) / count, point);
        const roll = Math.sin(charmIndex * 7.31 + edgeIndex) * 0.3;
        charms[charmIndex % 3].push({ x: point.x + ox * 0.25, y: point.y - CHARM_FT * 0.32,
          z: point.z + oz * 0.25, yaw, roll });
        charmIndex++;
      }
    }
  });
  if (!cords.length) return null;
  const cord = mergeGeometries(cords); cords.forEach(g => g.dispose());
  if (cord) {
    const mesh = new THREE.Mesh(cord, new THREE.MeshStandardMaterial({ color: 0x0e0d11, roughness: 0.38, metalness: 0.45 }));
    mesh.name = 'halloween-garland-cord';
    group.add(mesh);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const color = new THREE.Color();
  const foil = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.24, metalness: 0.75, side: THREE.DoubleSide });
  const designs = [charmGeometry(batShapes, true), charmGeometry(pumpkinShapes, true), charmGeometry([skullShape()], false)];
  designs.forEach((geo, d) => {
    const list = charms[d];
    if (!list.length) { geo.dispose(); return; }
    const inst = new THREE.InstancedMesh(geo, foil, list.length);
    inst.name = `halloween-garland-charms-${['bat', 'pumpkin', 'skull'][d]}`;
    const size = d === 0 ? CHARM_FT * 1.25 : d === 1 ? CHARM_FT : CHARM_FT * 0.9;
    list.forEach((c, i) => {
      m.compose(p.set(c.x, c.y, c.z), q.setFromEuler(e.set(0, c.yaw, c.roll)), sc.set(size, size, size));
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, color.setHex(CHARM_COLORS[(i + d) % 2]));
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    group.add(inst);
  });
  const tape = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.15, 0.22), new THREE.MeshStandardMaterial({
    color: 0xf3f0e4, roughness: 0.18, transparent: true, opacity: 0.5, depthWrite: false,
  }), tabs.length);
  tape.name = 'halloween-garland-tape';
  tabs.forEach((t, i) => {
    m.compose(p.set(t.x, t.y, t.z), q.setFromEuler(e.set(0, t.yaw, t.roll)), sc.set(1, 1, 1));
    tape.setMatrixAt(i, m);
  });
  tape.instanceMatrix.needsUpdate = true;
  group.add(tape);
  return group;
}
