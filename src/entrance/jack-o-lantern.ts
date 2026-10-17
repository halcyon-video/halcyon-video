// Second-half-of-October face for the counter pumpkin (feedback pin 272): a
// classic carved jack-o'-lantern — upward triangle eyes, a triangle nose and
// a gap-toothed grin — projected onto the molded shell as a decal so the cut
// follows its ribs. Each opening reads as a dark cut wall around a warm
// candle glow. Unlit on purpose: the glow holds at night, and the material is
// a plain textured basic program.
import * as THREE from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import { promoToday } from '../promo-campaigns';

/** October 16 onward the counter pumpkin is carved for the run-up to the 31st. */
export function jackOLanternSeason(): boolean {
  const today = promoToday();
  return today.getMonth() === 9 && today.getDate() >= 16;
}

// Face outlines on a 512 x 384 canvas (4:3, the decal's aspect), y down.
function traceFace(g: CanvasRenderingContext2D): void {
  g.beginPath();
  for (const cx of [150, 362]) {          // eyes: classic upward triangles
    g.moveTo(cx - 52, 162); g.lineTo(cx + 52, 162); g.lineTo(cx + 4, 78); g.closePath();
  }
  g.moveTo(232, 222); g.lineTo(280, 222); g.lineTo(258, 180); g.closePath(); // nose
  // Grin: two teeth hang from the upper lip, one rises from the lower.
  g.moveTo(74, 228);
  g.quadraticCurveTo(118, 266, 168, 276);
  g.lineTo(168, 306); g.lineTo(202, 306); g.lineTo(202, 282);
  g.lineTo(310, 282); g.lineTo(310, 306); g.lineTo(344, 306); g.lineTo(344, 276);
  g.quadraticCurveTo(394, 266, 438, 228);
  g.quadraticCurveTo(410, 318, 300, 346);
  g.lineTo(286, 346); g.lineTo(286, 320); g.lineTo(226, 320); g.lineTo(226, 346);
  g.lineTo(212, 346);
  g.quadraticCurveTo(102, 318, 74, 228);
  g.closePath();
}

function faceTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 384;
  const g = canvas.getContext('2d')!;
  g.lineJoin = 'round';
  traceFace(g);
  g.lineWidth = 18; g.strokeStyle = '#3b1806'; g.stroke();   // the cut wall
  const glow = g.createRadialGradient(256, 210, 20, 256, 210, 250);
  glow.addColorStop(0, '#fff3b0');
  glow.addColorStop(0.45, '#ffc04a');
  glow.addColorStop(1, '#ec7414');
  g.fillStyle = glow; g.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Carve `model` (the molded pumpkin, still at its authored identity pose) so
 * the face looks along model-space heading `heading` (x = sin, z = cos). The
 * decal is returned as a child of the model, so it rides every later move.
 */
export function carveJackOLantern(model: THREE.Object3D, heading: number): THREE.Mesh | null {
  let shell: THREE.Mesh | null = null;
  let best = -1;
  model.updateMatrixWorld(true);
  model.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.computeBoundingSphere();
    const r = o.geometry.boundingSphere!.radius;
    if (r > best) { best = r; shell = o; }
  });
  if (!shell) return null;
  const body = shell as THREE.Mesh;
  const box = new THREE.Box3().setFromObject(body);
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
  const dir = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
  // A shallow projector straddling the front wall only: deep enough for the
  // ribs, too shallow to reach the back of the shell.
  const at = center.clone().addScaledVector(dir, radius * 0.8);
  const orient = new THREE.Euler().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(at.clone().add(dir), at, new THREE.Vector3(0, 1, 0)));
  const width = radius * 1.38;
  const geometry = new DecalGeometry(body, at, orient, new THREE.Vector3(width, width * 0.75, radius * 0.85));
  const decal = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    map: faceTexture(),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  }));
  decal.name = 'halloween-jack-o-lantern-face';
  model.add(decal);
  return decal;
}
