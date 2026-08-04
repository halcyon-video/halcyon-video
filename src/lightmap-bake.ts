// Phase 1 of docs/lightmap-pipeline.md: geometry-only baked floor AO.
//
// Ambient occlusion on the carpet depends on geometry alone — not sun, not
// theme, not day/night — so it can be baked once per layout and stays valid
// until the store itself is rebuilt. Rather than rendering hemicube probes,
// this bakes the footprint-projection variant: every ground-plan rectangle
// the layout validator / clerk nav already trusts (shelving units, fixtures,
// the exact counter band) is rasterized into a floor-plan canvas, blurred
// into a two-layer penumbra, and inverted into an aoMap the carpet samples
// on UV channel 0 (the floor plane's raw 0..1 uvs — the carpet tiling lives
// in the albedo texture's repeat matrix, so the AO map lies 1:1 across the
// slab). The perimeter gets a soft wall-contact band for the corner
// occlusion screen-space AO can't see at grazing angles.
//
// Cost: a few canvas draws at boot (<10 ms), one 1024-wide texture, zero
// per-frame work. The full texel-accurate hemicube bake (and the Phase 2
// sun-free irradiance bake) remain follow-ups per the design doc.

import * as THREE from 'three';

export interface FloorAORect {
  label?: string;
  cx: number; cz: number;   // world-space centre, feet
  w: number; d: number;     // extents at yaw=0, feet
  yaw: number;              // radians
}

export interface FloorAOBounds {
  minX: number; maxX: number; // world X span of the carpet slab, feet
  minZ: number; maxZ: number; // world Z span (backWallZ .. front glass)
}

const PX_PER_FT = 8;
const MAX_W = 1024;

// Two-layer penumbra: a tight dark core hugging each base plus a wide faint
// skirt, matching how real fixtures shade low-pile carpet.
const CORE_BLUR_FT = 0.5;
const CORE_ALPHA = 0.55;
const SKIRT_BLUR_FT = 1.6;
const SKIRT_ALPHA = 0.28;
// Wall-contact band around the perimeter.
const WALL_BAND_FT = 1.1;
const WALL_BLUR_FT = 0.9;
const WALL_ALPHA = 0.38;

export function bakeFloorAO(rects: FloorAORect[], bounds: FloorAOBounds): THREE.CanvasTexture {
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanZ = Math.max(1, bounds.maxZ - bounds.minZ);
  const scale = Math.min(PX_PER_FT, MAX_W / spanX);
  const w = Math.max(4, Math.round(spanX * scale));
  const h = Math.max(4, Math.round(spanZ * scale));

  // Silhouette mask: white shapes on transparent, drawn once and stamped
  // twice through different blurs.
  const mask = document.createElement('canvas');
  mask.width = w; mask.height = h;
  const mctx = mask.getContext('2d')!;
  mctx.fillStyle = '#ffffff';
  for (const r of rects) {
    // Canvas x tracks world +X; canvas y tracks world +Z measured from the
    // back wall (the floor plane's v=1 edge lands on the canvas top row via
    // CanvasTexture's default flipY). A world yaw about +Y turns +X toward
    // -Z, which in this y-down plan view is a counter-clockwise ctx.rotate
    // of -yaw.
    const px = (r.cx - bounds.minX) * scale;
    const py = (r.cz - bounds.minZ) * scale;
    mctx.save();
    mctx.translate(px, py);
    mctx.rotate(-r.yaw);
    mctx.fillRect((-r.w / 2) * scale, (-r.d / 2) * scale, r.w * scale, r.d * scale);
    mctx.restore();
  }

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  // Occlusion layers land as black-at-varying-alpha over the white base;
  // the shader reads red as the AO factor, so darker = more occluded.
  const stamp = (blurFt: number, alpha: number) => {
    ctx.save();
    ctx.filter = `blur(${Math.max(1, blurFt * scale)}px)`;
    ctx.globalAlpha = alpha;
    // Tint the white mask black via source canvas composite: draw the mask,
    // then use it as a stencil for a black fill.
    const tint = document.createElement('canvas');
    tint.width = w; tint.height = h;
    const tctx = tint.getContext('2d')!;
    tctx.drawImage(mask, 0, 0);
    tctx.globalCompositeOperation = 'source-in';
    tctx.fillStyle = '#000000';
    tctx.fillRect(0, 0, w, h);
    ctx.drawImage(tint, 0, 0);
    ctx.restore();
  };
  stamp(SKIRT_BLUR_FT, SKIRT_ALPHA);
  stamp(CORE_BLUR_FT, CORE_ALPHA);

  // Perimeter wall-contact band. The blur softens it inward; the hard
  // outer half of the stroke falls outside the canvas.
  ctx.save();
  ctx.filter = `blur(${WALL_BLUR_FT * scale}px)`;
  ctx.globalAlpha = WALL_ALPHA;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = WALL_BAND_FT * scale * 2;
  ctx.strokeRect(0, 0, w, h);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

// Wall contact shading: a 1-texel-wide vertical gradient shared by every
// wall segment. scaleWallUV keeps uv.v = worldY/roomHeight on all wall
// pieces (full walls, bands above glazing, step faces), so one gradient
// lands at the true floor/ceiling lines everywhere. Occlusion pools where
// the drywall meets the carpet and, more faintly, under the ceiling grid —
// the always-present corner shading screen-space AO only finds when the
// camera looks straight at it.
export function makeWallContactAO(roomHeightFt: number): THREE.CanvasTexture {
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = 1; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const floorDarken = 0.42;   // strength at the very floor line
  const floorReachFt = 1.3;   // fades out by this height
  const ceilDarken = 0.22;
  const ceilReachFt = 0.9;
  for (let i = 0; i < H; i++) {
    // Canvas row 0 is v=1 (ceiling) under CanvasTexture's default flipY.
    const v = 1 - (i + 0.5) / H;
    const yFt = v * roomHeightFt;
    const floorT = Math.max(0, 1 - yFt / floorReachFt);
    const ceilT = Math.max(0, 1 - (roomHeightFt - yFt) / ceilReachFt);
    // smoothstep the falloffs so neither band reads as a painted stripe
    const s = (t: number) => t * t * (3 - 2 * t);
    const ao = 1 - floorDarken * s(floorT) - ceilDarken * s(ceilT);
    const g = Math.round(255 * Math.max(0, Math.min(1, ao)));
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(0, i, 1, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}
