// GH #398: a complete panorama projects its own photographed floor through
// GroundedSkybox, and that floor is only correct from the entrance eye point.
// Anywhere else it streaks radially, and its curb, road and stall marks land
// under the modeled lot. The lot, street and verges now always cover the near
// field; this disc of matched pavement carries the level ground on toward the
// horizon and fades into the photograph only where the remaining band is a few
// pixels tall, so the photo supplies distant buildings, trees and sky rather
// than a smeared floor. Toward its rim the disc takes on the photograph's own
// ground tone just below the horizon, bearing by bearing, so the hand-off has
// no tonal step either.
//
// One static mesh, drawn after the opaque pass with its depth pushed back, so
// every modeled surface above it wins without a cut-out and nothing z-fights.
import * as THREE from 'three';

export interface GroundSurroundOptions {
  centerX: number; // panorama projection origin (world feet)
  centerZ: number;
  opaqueRadius: number; // solid pavement out to here
  fadeRadius: number; // fully transparent here, inside the projected floor
  y: number; // just under the lowest modeled pavement
  tileSize: number; // world feet per texture tile, shared with the lot asphalt
  initialGroundColor: THREE.Color;
  panoramaRotationY: number; // the GroundedSkybox mesh's fixed yaw
  eyeHeight: number; // the GroundedSkybox projection height
}

/** Matched pavement (matched-pavement.ts), so the surround shares the lot's tile and color. */
export interface SurroundPavement {
  material: THREE.MeshBasicMaterial;
  setColor(color: THREE.Color): void;
  dispose(): void;
}

export interface GroundSurround {
  mesh: THREE.Mesh;
  /** `panorama` is the complete (2:1) photograph, or null when none supplies a floor. */
  setGroundColor(color: THREE.Color, panorama?: CanvasImageSource & { width: number; height: number } | null): void;
  dispose(): void;
}

// GroundedSkybox keeps the photograph's floor level out to ~radius/1.5 (400 ft
// at the 600 ft minimum radius, exterior-panorama.ts). The surround stays
// opaque well past every modeled edge and has faded out before that floor
// starts curving up into the horizon band.
export const SURROUND_OPAQUE_RADIUS = 300;
export const SURROUND_FADE_RADIUS = 390;
// The rim tint ramps in from here, beyond every modeled edge.
const TINT_START_RADIUS = 160;
const SEGMENTS = 96;

/** Bearing a (world x = cos a, z = sin a) to the panorama's u, for a GroundedSkybox yawed by rotationY. */
export function panoramaU(bearing: number, rotationY: number): number {
  // SphereGeometry puts u at local (-cos 2πu, -sin 2πu) and GroundedSkybox
  // mirrors z, so after the mesh yaw the bearing is 2πu - rotationY + π.
  const u = (bearing + rotationY - Math.PI) / (Math.PI * 2);
  return u - Math.floor(u);
}

/** Rings: [radius, alpha, rim tint weight]. Vertex 0 is the centre. */
function rings(o: Pick<GroundSurroundOptions, 'opaqueRadius' | 'fadeRadius'>): [number, number, number][] {
  return [[TINT_START_RADIUS, 1, 0], [o.opaqueRadius, 1, 1], [o.fadeRadius, 0, 1]];
}

/** Disc geometry: a solid fan, then rings that tint toward the rim and fade out. */
export function groundSurroundGeometry(o: Pick<GroundSurroundOptions, 'centerX' | 'centerZ' | 'opaqueRadius' | 'fadeRadius' | 'y' | 'tileSize'>): THREE.BufferGeometry {
  const positions: number[] = [o.centerX, o.y, o.centerZ], colors: number[] = [1, 1, 1, 1];
  for (const [radius, alpha] of rings(o)) {
    for (let i = 0; i < SEGMENTS; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2;
      positions.push(o.centerX + Math.cos(a) * radius, o.y, o.centerZ + Math.sin(a) * radius);
      colors.push(1, 1, 1, alpha);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const a = 1 + i, b = 1 + (i + 1) % SEGMENTS;
    // Wound so the faces point up (+Y) in three's counter-clockwise convention.
    index.push(0, b, a);
    for (let ring = 0; ring < 2; ring++) {
      const p = a + ring * SEGMENTS, q = b + ring * SEGMENTS;
      index.push(p, q, q + SEGMENTS, p, q + SEGMENTS, p + SEGMENTS);
    }
  }
  const uv: number[] = [];
  for (let i = 0; i < positions.length; i += 3) uv.push(positions[i] / o.tileSize, -positions[i + 2] / o.tileSize);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** The photograph's ground just below the horizon around the fade band, per surround segment. */
function horizonGround(image: CanvasImageSource & { width: number; height: number }, o: GroundSurroundOptions): THREE.Color[] | null {
  // Depressions where the fade band and the first stretch past it project.
  const near = Math.atan(o.eyeHeight / o.opaqueRadius), far = Math.atan(o.eyeHeight / (o.fadeRadius * 1.35));
  const rowTop = Math.floor(image.height * (.5 + far / Math.PI));
  const rowBottom = Math.max(rowTop + 1, Math.ceil(image.height * (.5 + near / Math.PI)));
  const width = SEGMENTS * 8, canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, rowTop, image.width, rowBottom - rowTop, 0, 0, width, 1);
  const data = ctx.getImageData(0, 0, width, 1).data;
  const out: THREE.Color[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const centre = Math.round(panoramaU((i / SEGMENTS) * Math.PI * 2, o.panoramaRotationY) * width);
    let r = 0, g = 0, b = 0, n = 0;
    for (let dx = -4; dx < 4; dx++) {
      const at = ((centre + dx + width) % width) * 4;
      r += data[at]; g += data[at + 1]; b += data[at + 2]; n++;
    }
    out.push(new THREE.Color().setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace));
  }
  return out;
}

export function buildGroundSurround(parent: THREE.Object3D, o: GroundSurroundOptions, pavement: SurroundPavement): GroundSurround {
  pavement.setColor(o.initialGroundColor);
  const material = pavement.material;
  material.vertexColors = true;
  material.transparent = true;
  material.depthWrite = false;
  material.polygonOffset = true;
  material.polygonOffsetFactor = 4;
  material.polygonOffsetUnits = 4;
  const geometry = groundSurroundGeometry(o);
  const colors = geometry.getAttribute('color') as THREE.BufferAttribute;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'exterior-ground-surround';
  parent.add(mesh);
  let rim: THREE.Color[] | null = null;
  function tint(ground: THREE.Color) {
    const ringList = rings(o);
    for (let ring = 0; ring < ringList.length; ring++) {
      const weight = ringList[ring][2];
      for (let i = 0; i < SEGMENTS; i++) {
        const target = rim?.[i];
        // Linear-light ratio from the matched ground to the photograph's rim tone.
        const ratio = (c: 'r' | 'g' | 'b') => target ? THREE.MathUtils.clamp(target[c] / Math.max(ground[c], 1e-4), .25, 4) : 1;
        colors.setXYZ(1 + ring * SEGMENTS + i, 1 + (ratio('r') - 1) * weight, 1 + (ratio('g') - 1) * weight, 1 + (ratio('b') - 1) * weight);
      }
    }
    colors.needsUpdate = true;
  }
  return {
    mesh,
    setGroundColor(color, panorama) {
      pavement.setColor(color);
      if (panorama !== undefined) rim = panorama && panorama.width ? horizonGround(panorama, o) : null;
      tint(color);
    },
    dispose() { geometry.dispose(); pavement.dispose(); mesh.removeFromParent(); },
  };
}
