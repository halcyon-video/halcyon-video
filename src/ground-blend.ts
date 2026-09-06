// GH #144: feathers the modeled parking lot's exposed outer edges (left,
// right, and the street-facing far edge — the near edge sits flush against
// the building, under the sidewalk, and is never seen) into whatever ground
// the current sky pano shows there. Without this the lot reads as a
// hard-edged rectangle pasted onto the photo, since every pano now carries
// real ground running out to the horizon (see GH #142).
//
// One flat, lit quad covers the lot's whole surrounding footprint, textured
// with a canvas-baked field using a rectangle-distance falloff (Euclidean,
// not Chebyshev, so the two outer corners round off instead of mitering into
// a visible notch): alpha runs 1 at/inside the lot's own boundary down to 0
// `fadeWidth` ft beyond it, and — over that same falloff — RGB runs from a
// dark asphalt tone (so the ring reads as a continuation of the lot's own
// surface right at the seam, not a sudden color jump) to the active pano's
// sampled ground color (so what little of the ring is still visible near the
// outer edge nods toward the photo instead of just fading to gray). Grass,
// cobbles, and tide pools all just work without any per-pano authoring —
// setColor() re-rasterizes with the new ground color as panos load/change.
import * as THREE from 'three';

export interface GroundBlend {
  mesh: THREE.Mesh;
  setColor(color: THREE.Color): void;
  dispose(): void;
}

export interface GroundBlendOptions {
  minX: number; // lot's exposed left edge (world x)
  maxX: number; // lot's exposed right edge (world x)
  frontZ: number; // lot's near edge (against the building — not blended)
  farZ: number; // lot's far/street-facing edge (world z)
  fadeWidth: number; // how far beyond the lot edge the fade reaches, ft
  y?: number; // just under the lot surface, avoids z-fighting
  initialColor: THREE.Color;
}

// Matches createAsphaltTexture's base fill (canvas-textures.ts) so the ring's
// inner edge reads as a continuation of the lot surface, not a seam of its own.
const ASPHALT_EDGE_COLOR = new THREE.Color(0x242424);

// Rasterized in world feet, one texel roughly every 0.2 ft — the gradient is
// smooth by construction, so this is about avoiding visible stairstepping at
// the rounded corners, not fine detail.
const PX_PER_FT = 5;
const MAX_TEXTURE_DIM = 400;

// THREE.Color components are in the linear working color space, not display
// sRGB — the standard transfer function three.js itself uses internally
// (ColorManagement.js) to convert a linear component back to the
// gamma-encoded byte the canvas 2D API (and every other display surface)
// expects.
function linearToSRGB(c: number): number {
  return c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function rasterize(
  canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D,
  opts: GroundBlendOptions, xMin: number, xMax: number, zMin: number, zMax: number,
  groundColor: THREE.Color,
) {
  const { minX, maxX, farZ, fadeWidth } = opts;
  const w = canvas.width, h = canvas.height;
  const img = ctx.createImageData(w, h);
  const edge = ASPHALT_EDGE_COLOR;
  for (let py = 0; py < h; py++) {
    const worldZ = zMin + (py / (h - 1)) * (zMax - zMin);
    // The near (building) side never fades — it's occluded and unreachable —
    // so only the excess past farZ contributes to the distance field.
    const dz = worldZ > farZ ? worldZ - farZ : 0;
    for (let px = 0; px < w; px++) {
      const worldX = xMin + (px / (w - 1)) * (xMax - xMin);
      const dx = worldX < minX ? minX - worldX : worldX > maxX ? worldX - maxX : 0;
      const t = Math.max(0, Math.min(1, Math.hypot(dx, dz) / fadeWidth));
      // Lerp in the linear working space (matching THREE.Color.lerp's own
      // convention elsewhere in this codebase), converting to sRGB bytes only
      // at the very end, once per pixel.
      const i = (py * w + px) * 4;
      img.data[i] = Math.round(linearToSRGB(edge.r + (groundColor.r - edge.r) * t) * 255);
      img.data[i + 1] = Math.round(linearToSRGB(edge.g + (groundColor.g - edge.g) * t) * 255);
      img.data[i + 2] = Math.round(linearToSRGB(edge.b + (groundColor.b - edge.b) * t) * 255);
      img.data[i + 3] = Math.round((1 - t) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function buildGroundBlend(parent: THREE.Object3D, opts: GroundBlendOptions): GroundBlend {
  const { minX, maxX, frontZ, farZ, fadeWidth, initialColor } = opts;
  const y = opts.y ?? -0.035;
  const xMin = minX - fadeWidth, xMax = maxX + fadeWidth;
  const zMin = frontZ, zMax = farZ + fadeWidth;

  // Explicit world-space quad (rather than a rotated PlaneGeometry) so the
  // u/v <-> world mapping the raster above uses never depends on reasoning
  // through three.js's default UV/rotation conventions.
  const positions = new Float32Array([
    xMin, y, zMin, xMax, y, zMin,
    xMin, y, zMax, xMax, y, zMax,
  ]);
  const uvs = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex([0, 1, 2, 2, 1, 3]);

  const w = Math.max(8, Math.min(MAX_TEXTURE_DIM, Math.round((xMax - xMin) * PX_PER_FT)));
  const h = Math.max(8, Math.min(MAX_TEXTURE_DIM, Math.round((zMax - zMin) * PX_PER_FT)));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  rasterize(canvas, ctx, opts, xMin, xMax, zMin, zMax, initialColor);
  const tex = new THREE.CanvasTexture(canvas);
  // Row 0 (worldZ = zMin) maps straight to v=0 below with no implicit
  // flip — keeps the raster loop the only place that has to reason about
  // the world <-> pixel mapping.
  tex.flipY = false;
  tex.needsUpdate = true;

  const material = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    fog: false,
    roughness: 1, // surrounding terrain responds to the same light as the lot
    side: THREE.DoubleSide, // a flat ground quad — cull direction isn't worth tracking
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'groundBlend';
  mesh.receiveShadow = true;
  parent.add(mesh);

  return {
    mesh,
    setColor(color: THREE.Color) {
      rasterize(canvas, ctx, opts, xMin, xMax, zMin, zMax, color);
      tex.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      material.dispose();
      tex.dispose();
      parent.remove(mesh);
    },
  };
}
