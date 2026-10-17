// October endcap cutouts (feedback pin 274): a construction-paper silhouette
// — arched cat, pumpkin, ghost or bat, the same motifs the window clings use —
// taped to the top of every gondola end cap so about a foot of it stands above
// the run. One instanced mesh per motif sharing one matte paper material;
// nothing is built outside October.
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { inSeason } from './promo-campaigns';
import clings from '/art/halloween-clings.svg?raw';

const CUTOUT_FT = 1.2;     // silhouette height
const TAPED_FT = 0.15;     // foot taped just over the cap's top edge, ~1 ft above
const MAX_WIDTH_FT = 1.7;
const PAPER_GRAIN_PER_FT = 1.6;
// Clings SVG path order is bat, pumpkin, ghost, cat; the caps cycle
// cat, pumpkin, ghost, bat so neighbouring ends differ.
const CYCLE = [3, 1, 2, 0] as const;

let paperGrain: THREE.CanvasTexture | null = null;

/** Construction-paper tooth: pale fibres and flecks over white, seeded so
 *  every boot (and screenshot) is identical. Shared for the app lifetime. */
function paperTexture(): THREE.CanvasTexture {
  if (paperGrain) return paperGrain;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, size, size);
  let seed = 0x2f6e2b1;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 2600; i++) {
    const shade = 200 + Math.floor(rand() * 55);
    g.fillStyle = `rgba(${shade},${shade},${shade},${0.25 + rand() * 0.35})`;
    g.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 1 + rand() * 2);
  }
  g.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const x = rand() * size, y = rand() * size, a = rand() * Math.PI, l = 4 + rand() * 10;
    const shade = 170 + Math.floor(rand() * 60);
    g.strokeStyle = `rgba(${shade},${shade},${shade},0.35)`;
    g.lineWidth = 0.6 + rand() * 0.6;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  paperGrain = new THREE.CanvasTexture(canvas);
  paperGrain.wrapS = paperGrain.wrapT = THREE.RepeatWrapping;
  paperGrain.colorSpace = THREE.SRGBColorSpace;
  return paperGrain;
}

/** Flat die-cut normalised to unit height, base at y = 0, facing +Z, with
 *  UVs in feet-scaled paper space. Returns the width/height ratio too. */
function cutoutGeometry(shapes: THREE.Shape[]): { geo: THREE.BufferGeometry; aspect: number } {
  const geo = new THREE.ShapeGeometry(shapes, 8);
  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  const height = box.max.y - box.min.y;
  // SVG space is y-down: flip, then sit the silhouette on y = 0.
  geo.translate(-(box.min.x + box.max.x) / 2, -box.max.y, 0);
  geo.scale(1 / height, -1 / height, 1);
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) * PAPER_GRAIN_PER_FT, pos.getY(i) * PAPER_GRAIN_PER_FT);
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  return { geo, aspect: (box.max.x - box.min.x) / height };
}

export function installHalloweenEndcapCutouts(parent: THREE.Object3D, caps: readonly THREE.Mesh[]): void {
  if (!inSeason('halloween') || !caps.length) return;
  const paths = new SVGLoader().parse(clings).paths;
  if (paths.length < 4) return;
  // Black construction paper is a neutral charcoal, not a void, so the
  // paper's tooth still reads under store light on the cat and the bat.
  const hsl = { h: 0, s: 0, l: 0 };
  const designs = paths.map(path => {
    const color = new THREE.Color(path.color);
    if (color.getHSL(hsl).l < 0.2) color.setHex(0x29282c);
    return { ...cutoutGeometry(SVGLoader.createShapes(path)), color };
  });
  const placements: THREE.Matrix4[][] = designs.map(() => []);
  const box = new THREE.Box3();
  const local = new THREE.Matrix4();
  caps.forEach((cap, i) => {
    if (!cap.geometry.boundingBox) cap.geometry.computeBoundingBox();
    box.copy(cap.geometry.boundingBox!);
    cap.updateWorldMatrix(true, false);
    const design = CYCLE[i % CYCLE.length];
    const capWidth = box.max.x - box.min.x;
    const height = Math.min(CUTOUT_FT, MAX_WIDTH_FT / designs[design].aspect, capWidth * 0.8 / designs[design].aspect);
    // On the cap's outward face, centred, its foot taped below the top edge.
    local.makeScale(height, height, 1).setPosition((box.min.x + box.max.x) / 2, box.max.y - TAPED_FT, box.max.z + 0.012);
    placements[design].push(new THREE.Matrix4().multiplyMatrices(cap.matrixWorld, local));
  });
  const group = new THREE.Group();
  group.name = 'halloween-endcap-cutouts';
  const paper = new THREE.MeshStandardMaterial({ map: paperTexture(), roughness: 0.96, metalness: 0, side: THREE.DoubleSide });
  designs.forEach((d, i) => {
    if (!placements[i].length) { d.geo.dispose(); return; }
    const mesh = new THREE.InstancedMesh(d.geo, paper, placements[i].length);
    mesh.name = `halloween-endcap-cutout-${i}`;
    placements[i].forEach((m, k) => { mesh.setMatrixAt(k, m); mesh.setColorAt(k, d.color); });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  });
  parent.add(group);
}
