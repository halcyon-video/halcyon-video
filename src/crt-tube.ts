// Curved-CRT-tube-glass illusion kit, shared by every IN-SCENE screen: the
// ceiling-hung ambient TVs (+ the bb-2000 wall bank), the clerk-desk terminal
// CRTs (search + manager terminal), and the back-room hero TV. One illusion
// family everywhere, per the 1993 POS reference ("the
// curved-glass illusion"): gentle convex curvature, rounded tube corners that
// fall off dark, an edge vignette, and faint static scanlines.
//
// Everything in this file is PHOSPHOR — the raster and the tube shadowing it,
// all of which only ever darkens. The room REFLECTION is not here: it lives on
// a separate glass pane in front (glass-reflection.ts) so it is view-dependent.
// This module used to bake an arcing white "sheen" band into the texture to
// fake that reflection; it read as a static smudge, because a painted arc
// cannot slide across the tube as you walk past it. See glass-reflection.ts for why
// the real reflection wasn't visible underneath it.
//
// Perf doctrine (the app idles for days): everything here is STATIC — the
// overlay art is ONE small canvas drawn once per page life and module-cached.
// The generic scene-teardown traverse disposes mesh MATERIALS but never their
// .map textures, so the cached texture survives store rebuilds; materials are
// created per call because that same traverse eats them. The overlay material
// is the exact program variant the ambient TVs' scanline overlay has always
// used (MeshBasicMaterial + map + transparent), so the boot shader warm-up
// coverage is unchanged — no new GL programs appear mid-session.
import * as THREE from 'three';
import { BB_ARCHIVO_BLACK } from './bundled-fonts';
import { brandString } from './brand-pack';

// Overlay art resolution. 4:3 like every tube it stretches onto; small on
// purpose — it's soft gradients + 2px scanlines, mipmapped away at distance.
const TUBE_W = 512;
const TUBE_H = 384;

// Curved "glass": a subdivided plane bulged outward toward its centre, like a
// shallow section of a large-radius CRT tube — enough to read as glass, not a
// dome. Built once per screen at store build; the bulge catches real
// specular/env light, which IS the glass illusion. (Moved here from
// ambient-tvs so the back room + future screens share one recipe.)
export function makeCurvedScreenGeometry(w: number, h: number, bulge: number, seg = 10): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(w, h, seg, seg);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const hw = w / 2, hh = h / 2;
  for (let i = 0; i < pos.count; i++) {
    const nx = pos.getX(i) / hw, ny = pos.getY(i) / hh;
    const r2 = Math.min(1, nx * nx + ny * ny);
    pos.setZ(i, bulge * (1 - r2));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Tube mask: rounded corners + vignette (no scanlines) ────────────────────
// The desk terminals composite this straight into their text canvas (their
// scanlines run at the canvas's own pitch); the 3D overlay texture below adds
// scanlines on top of the same art. Everything drawn here only ever DARKENS,
// so one variant is safe over any content in any lighting — a dim back room
// and a troffer-lit sales floor included.
let tubeMaskCanvas: HTMLCanvasElement | null = null;

export function getTubeMaskCanvas(): HTMLCanvasElement {
  const cached = tubeMaskCanvas;
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = TUBE_W;
  canvas.height = TUBE_H;
  const ctx = canvas.getContext('2d')!;
  const W = TUBE_W, H = TUBE_H;
  const r = H * 0.17; // tube corner radius

  // Tube corners fall off dark: black out everything outside the rounded
  // rect, then feather its rim inward so the falloff reads as curved glass
  // swallowing the raster, not a die-cut sticker.
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  roundedRectPath(ctx, 1, 1, W - 2, H - 2, r);
  ctx.fillStyle = 'rgba(0,0,0,0.97)';
  ctx.fill('evenodd');
  ctx.lineWidth = 16;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  roundedRectPath(ctx, 1, 1, W - 2, H - 2, r);
  ctx.stroke();
  ctx.lineWidth = 36;
  ctx.strokeStyle = 'rgba(0,0,0,0.20)';
  ctx.beginPath();
  roundedRectPath(ctx, 1, 1, W - 2, H - 2, r);
  ctx.stroke();

  // Edge vignette: the phosphor dims toward every edge of the tube.
  const edge = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(0,0,0,0.32)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(rx, ry, rw, rh);
  };
  edge(0, 0, 0, H * 0.17, 0, 0, W, H * 0.17);                    // top
  edge(0, H, 0, H - H * 0.19, 0, H - H * 0.19, W, H * 0.19);     // bottom
  edge(0, 0, W * 0.12, 0, 0, 0, W * 0.12, H);                    // left
  edge(W, 0, W - W * 0.12, 0, W - W * 0.12, 0, W * 0.12, H);     // right

  tubeMaskCanvas = canvas;
  return canvas;
}

// ── 3D overlay texture: the tube mask + faint static scanlines ───────────────
let tubeOverlayTex: THREE.CanvasTexture | null = null;

export function getTubeOverlayTexture(): THREE.CanvasTexture {
  const cached = tubeOverlayTex;
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = TUBE_W;
  canvas.height = TUBE_H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (let y = 0; y < TUBE_H; y += 4) ctx.fillRect(0, y, TUBE_W, 2);
  ctx.drawImage(getTubeMaskCanvas(), 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tubeOverlayTex = tex;
  return tex;
}

// One overlay MESH material per screen (teardown disposes materials), all
// sharing the cached texture. Same program variant as the ambient TVs'
// original scanline overlay — covered by the existing boot warm-up.
export function makeTubeOverlayMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: getTubeOverlayTexture(),
    transparent: true,
    depthWrite: false,
  });
}

// ── Harness/dev test card ─────────────────────────────────────────────────────
// The screenshot harness has no Jellyfin stream, so the ambient TVs show dead
// glass — this SMPTE-style card stands in as bright screen content (enabled
// via localStorage bb_tv_testcard=1) so the tube treatment can be verified
// over a lit picture. Static texture on the same MeshBasicMaterial path the
// video uses; caller owns disposal. Never enabled in normal app flow.
export function makeCrtTestCardTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TUBE_W;
  canvas.height = TUBE_H;
  const ctx = canvas.getContext('2d')!;
  const W = TUBE_W, H = TUBE_H;
  const bars = ['#c8c8c8', '#c8c800', '#00c8c8', '#00c800', '#c800c8', '#c80000', '#0000c8'];
  const bw = W / bars.length;
  bars.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(i * bw, 0, bw + 1, H * 0.64);
  });
  bars.slice().reverse().forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(i * bw, H * 0.64, bw + 1, H * 0.09);
  });
  ctx.fillStyle = '#101010';
  ctx.fillRect(0, H * 0.73, W, H * 0.27);
  ctx.fillStyle = '#ffcc00';
  ctx.font = `bold ${Math.round(H * 0.085)}px ${BB_ARCHIVO_BLACK}, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(brandString('brand-wordmark-video', 'HALCYON VIDEO'), W / 2, H * 0.87);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(W / 2, H * 0.37, H * 0.24, 0, Math.PI * 2);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
