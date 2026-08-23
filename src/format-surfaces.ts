// SURFACES THE STORE FORMAT OWNS — the room finishes that change when the
// FORMAT changes rather than when the theme does.
//
// A theme repaints the walls and re-dyes the carpet; it never changes what the
// wall or the floor IS. A format does: the corporate box is painted drywall
// over commercial loop pile, and the mom-and-pop (GH #33) is tongue-and-groove
// wood panelling over deep brown shag. Those are different materials, with
// different relief, different sheen, and colours that belong to the format
// rather than to whichever era's signage is hanging up.
//
// store-shell.ts calls `formatCarpetTextures()` / `formatWallTextures()` and
// gets whatever the active format's room is made of, so adding a third format's
// finish is a branch in here plus two fields in its preset — not another
// special case threaded through the shell build.
import * as THREE from 'three';
import { aniso, stampTiled, heightToNormalTexture, createCarpetTextures, createWallTextures } from './canvas-textures';
import { getActiveTheme } from './themes';
import { activeStoreFormat } from './store-format';

export interface SurfaceTextureSet {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

/**
 * Deep brown SHAG — long, loose, individually visible strands lying every which
 * way, the floor of every neighbourhood video store that was a carpet showroom
 * or a hair salon before it was a video store.
 *
 * The distinction from the commercial loop pile in canvas-textures.ts is
 * physical, not just a colour swap, and all three maps carry it:
 *
 *  - ALBEDO: far coarser tonal variation. Shag self-shadows between strands, so
 *    the darkest parts of the floor are dark because of GEOMETRY, and the mottle
 *    has to be strong enough (and large enough) to read that way from standing
 *    height rather than as a slightly dirty flat colour.
 *  - NORMAL: long strokes, several times the loop pile's, with real directional
 *    scatter — a loop pile is a regular grid of identical loops and reads as
 *    fabric; shag is a pile of noodles and reads as fur.
 *  - ROUGHNESS: uniformly matte, with none of the loop pile's burnished traffic
 *    lanes. Shag does not polish flat under footfall; it mats and goes duller,
 *    so the only variation is a little extra roughness where it has been walked.
 */
export function createShagCarpetTextures(baseHex: string): SurfaceTextureSet {
  const S = 512;

  // ── Albedo ────────────────────────────────────────────────────────────────
  const albedo = document.createElement('canvas');
  albedo.width = albedo.height = S;
  const a = albedo.getContext('2d')!;
  a.fillStyle = baseHex;
  a.fillRect(0, 0, S, S);

  // Broad clump shadowing: the low-frequency "this floor has depth" cue.
  // Biased dark, and much stronger than the loop pile's ≤14% — the gaps
  // between shag clumps genuinely go several stops down.
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 90 + Math.random() * 160;
    const g = a.createRadialGradient(x, y, 0, x, y, r);
    const roll = Math.random();
    g.addColorStop(0, roll > 0.72 ? 'rgba(255,236,206,0.07)' : `rgba(0,0,0,${0.16 + roll * 0.14})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    stampTiled(a, S, (c) => { c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); });
  }
  // Individual strands. Long (8–22 px against the loop pile's 1–4), drawn as
  // strokes at scattered angles, in a warm/dark pair so the pile reads as
  // twisted two-tone yarn rather than a single flat brown.
  for (let i = 0; i < 5200; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    const ang = Math.random() * Math.PI * 2;
    const len = 8 + Math.random() * 14;
    const lit = Math.random();
    const col = lit > 0.62
      ? `rgba(255,226,180,${0.05 + Math.random() * 0.07})`   // strand catching the light
      : `rgba(0,0,0,${0.10 + Math.random() * 0.16})`;        // strand in its neighbour's shadow
    stampTiled(a, S, (c) => {
      c.strokeStyle = col;
      c.lineWidth = 1 + Math.random() * 1.6;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      c.stroke();
    });
  }
  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = aniso(16);

  // ── Normal ────────────────────────────────────────────────────────────────
  // A height field of long strands at every angle. Deliberately high contrast
  // and driven at more than double the loop pile's strength: the relief IS the
  // material here.
  const height = document.createElement('canvas');
  height.width = height.height = S;
  const h = height.getContext('2d')!;
  h.fillStyle = '#787878';
  h.fillRect(0, 0, S, S);
  for (let i = 0; i < 7000; i++) {
    const g = 40 + Math.floor(Math.random() * 190);
    const x = Math.random() * S, y = Math.random() * S;
    const ang = Math.random() * Math.PI * 2;
    const len = 9 + Math.random() * 16;
    stampTiled(h, S, (c) => {
      c.strokeStyle = `rgb(${g},${g},${g})`;
      c.lineWidth = 1.2 + Math.random() * 1.8;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      c.stroke();
    });
  }
  const normalMap = heightToNormalTexture(height, 3.0);
  normalMap.anisotropy = aniso(16);

  // ── Roughness ─────────────────────────────────────────────────────────────
  // Matte everywhere. Shag mats rather than burnishes, so worn areas get
  // slightly ROUGHER, the opposite of the loop pile's shiny traffic lanes.
  const rough = document.createElement('canvas');
  rough.width = rough.height = S;
  const r2 = rough.getContext('2d')!;
  r2.fillStyle = '#f0f0f0'; // ~0.94 base
  r2.fillRect(0, 0, S, S);
  for (let i = 0; i < 16; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 60 + Math.random() * 130;
    const g = r2.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(240,240,240,0)');
    stampTiled(r2, S, (c) => { c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); });
  }
  const roughnessMap = new THREE.CanvasTexture(rough);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;

  return { map, normalMap, roughnessMap };
}

/**
 * Tongue-and-groove WOOD PANELLING — vertical boards with a V-groove between
 * each, the wall of every small store fitted out on a budget in the seventies
 * and never redecorated.
 *
 * The tile is one square of wall; the shell repeats it across the real wall
 * size, so board width is set in tile fractions and comes out around 8 in on
 * the built wall. Grain runs ALONG the boards (vertically in the tile) because
 * the boards are hung vertically; a horizontal grain would read as floorboards
 * stood on end.
 */
export function createWoodPanelTextures(baseHex: string): SurfaceTextureSet {
  const S = 512;
  const BOARDS = 12;                 // boards across one tile
  const BW = S / BOARDS;             // board width in px

  const base = new THREE.Color(baseHex);
  const shade = (f: number, alpha = 1): string => {
    const c = base.clone().multiplyScalar(f);
    return `rgba(${Math.round(Math.min(1, c.r) * 255)},${Math.round(Math.min(1, c.g) * 255)},${Math.round(Math.min(1, c.b) * 255)},${alpha})`;
  };

  // ── Albedo ────────────────────────────────────────────────────────────────
  const albedo = document.createElement('canvas');
  albedo.width = albedo.height = S;
  const a = albedo.getContext('2d')!;
  for (let b = 0; b < BOARDS; b++) {
    // Every board is cut from a different part of the log: each gets its own
    // tone. Without this the wall tiles visibly, because a run of identical
    // boards is a pattern the eye locks onto immediately.
    const tone = 0.86 + Math.random() * 0.3;
    a.fillStyle = shade(tone);
    a.fillRect(b * BW, 0, BW, S);

    // Grain: long vertical strokes with slow horizontal wander, plus the
    // occasional cathedral arch where the saw crossed a growth ring.
    const grainCount = 26 + Math.floor(Math.random() * 16);
    for (let g = 0; g < grainCount; g++) {
      const x0 = b * BW + Math.random() * BW;
      const amp = 0.6 + Math.random() * 2.4;
      const freq = 0.006 + Math.random() * 0.02;
      const phase = Math.random() * Math.PI * 2;
      a.strokeStyle = Math.random() > 0.34
        ? shade(tone * 0.72, 0.16 + Math.random() * 0.2)
        : shade(tone * 1.22, 0.1 + Math.random() * 0.12);
      a.lineWidth = 0.6 + Math.random() * 1.5;
      a.beginPath();
      for (let y = 0; y <= S; y += 6) {
        const x = x0 + Math.sin(y * freq + phase) * amp;
        if (y === 0) a.moveTo(x, y); else a.lineTo(x, y);
      }
      a.stroke();
    }

    // A knot or two on some boards — the detail that says "wood" instantly.
    if (Math.random() > 0.55) {
      const kx = b * BW + BW * (0.3 + Math.random() * 0.4);
      const ky = Math.random() * S;
      const kr = 2.5 + Math.random() * 4;
      for (let ring = 4; ring >= 1; ring--) {
        a.strokeStyle = shade(tone * (0.55 + ring * 0.06), 0.5);
        a.lineWidth = 1.1;
        a.beginPath();
        a.ellipse(kx, ky, kr * ring * 0.42, kr * ring * 0.8, 0, 0, Math.PI * 2);
        a.stroke();
      }
      a.fillStyle = shade(tone * 0.45, 0.85);
      a.beginPath();
      a.ellipse(kx, ky, kr * 0.32, kr * 0.6, 0, 0, Math.PI * 2);
      a.fill();
    }

    // The V-groove between boards: a dark line with a lit lip on its far side,
    // so the join reads as a cut rather than a drawn stripe even before the
    // normal map lands.
    a.fillStyle = shade(0.34, 0.9);
    a.fillRect(b * BW - 0.9, 0, 1.8, S);
    a.fillStyle = shade(1.3, 0.22);
    a.fillRect(b * BW + 1.0, 0, 1.0, S);
  }
  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = aniso(16);

  // ── Normal ────────────────────────────────────────────────────────────────
  // Each board is very slightly domed (planed stock is never dead flat) and the
  // grooves cut hard between them.
  const height = document.createElement('canvas');
  height.width = height.height = S;
  const h = height.getContext('2d')!;
  h.fillStyle = '#8c8c8c';
  h.fillRect(0, 0, S, S);
  for (let b = 0; b < BOARDS; b++) {
    const g = h.createLinearGradient(b * BW, 0, (b + 1) * BW, 0);
    g.addColorStop(0.0, '#6e6e6e');
    g.addColorStop(0.5, '#9a9a9a');
    g.addColorStop(1.0, '#6e6e6e');
    h.fillStyle = g;
    h.fillRect(b * BW, 0, BW, S);
    h.fillStyle = '#2a2a2a';
    h.fillRect(b * BW - 1.1, 0, 2.2, S);
  }
  // Grain relief, shallow, so grazing light travels along the boards.
  for (let i = 0; i < 900; i++) {
    const x0 = Math.random() * S;
    const v = 120 + Math.floor(Math.random() * 60);
    h.strokeStyle = `rgb(${v},${v},${v})`;
    h.lineWidth = 0.7;
    h.beginPath();
    h.moveTo(x0, 0);
    h.lineTo(x0 + (Math.random() * 3 - 1.5), S);
    h.stroke();
  }
  const normalMap = heightToNormalTexture(height, 1.7);
  normalMap.anisotropy = aniso(16);

  // ── Roughness ─────────────────────────────────────────────────────────────
  // Satin varnish, duller in the grooves where nobody ever wiped it, and
  // slightly polished on a few boards where hands and shoulders have passed.
  const rough = document.createElement('canvas');
  rough.width = rough.height = S;
  const r2 = rough.getContext('2d')!;
  r2.fillStyle = '#a8a8a8'; // ~0.66 — varnished wood, not chalky
  r2.fillRect(0, 0, S, S);
  for (let b = 0; b < BOARDS; b++) {
    r2.fillStyle = '#d8d8d8';
    r2.fillRect(b * BW - 1.1, 0, 2.2, S);
    if (Math.random() > 0.65) {
      r2.fillStyle = 'rgba(120,120,120,0.5)';
      r2.fillRect(b * BW + 2, 0, BW - 4, S);
    }
  }
  const roughnessMap = new THREE.CanvasTexture(rough);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;

  return { map, normalMap, roughnessMap };
}

/**
 * Stained TIMBER for shelving — boards, carcass sides, dividers and end panels.
 *
 * The tile is deliberately generic rather than board-per-plank like the wall
 * panelling: this one texture dresses horizontal shelf boards, vertical
 * dividers and big flat end panels alike, and a strong plank rhythm baked into
 * it would land at a different scale on each of them. So it is veneer — long
 * grain along one axis, a couple of figure sweeps, the odd knot — which reads
 * correctly whichever way the piece it lands on happens to run.
 *
 * The shelf material tiles this 6x2 (see store-shell.ts), the same as the
 * melamine it replaces, so the grain comes out at roughly plank scale on a
 * shelf board without any caller needing to know it changed.
 */
export function createWoodShelfTextures(baseHex: string): SurfaceTextureSet {
  const S = 512;
  const base = new THREE.Color(baseHex);
  const shade = (f: number, alpha = 1): string => {
    const c = base.clone().multiplyScalar(f);
    return `rgba(${Math.round(Math.min(1, c.r) * 255)},${Math.round(Math.min(1, c.g) * 255)},${Math.round(Math.min(1, c.b) * 255)},${alpha})`;
  };

  const albedo = document.createElement('canvas');
  albedo.width = albedo.height = S;
  const a = albedo.getContext('2d')!;
  a.fillStyle = shade(1.0);
  a.fillRect(0, 0, S, S);

  // Broad figure: slow tonal sweeps across the grain, so a big end panel is not
  // one flat colour with lines drawn on it.
  for (let i = 0; i < 7; i++) {
    const y = Math.random() * S;
    const g = a.createLinearGradient(0, y - 70, 0, y + 70);
    g.addColorStop(0, shade(1.0, 0));
    g.addColorStop(0.5, Math.random() > 0.5 ? shade(0.8, 0.35) : shade(1.2, 0.22));
    g.addColorStop(1, shade(1.0, 0));
    stampTiled(a, S, (c) => { c.fillStyle = g; c.fillRect(0, y - 70, S, 140); });
  }
  // Grain lines running the length of the tile with a slow vertical wander.
  for (let i = 0; i < 220; i++) {
    const y0 = Math.random() * S;
    const amp = 1 + Math.random() * 5;
    const freq = 0.004 + Math.random() * 0.014;
    const phase = Math.random() * Math.PI * 2;
    a.strokeStyle = Math.random() > 0.3
      ? shade(0.66, 0.1 + Math.random() * 0.18)
      : shade(1.28, 0.08 + Math.random() * 0.1);
    a.lineWidth = 0.6 + Math.random() * 1.4;
    a.beginPath();
    for (let x = 0; x <= S; x += 8) {
      const y = y0 + Math.sin(x * freq + phase) * amp;
      if (x === 0) a.moveTo(x, y); else a.lineTo(x, y);
    }
    a.stroke();
  }
  // A couple of knots.
  for (let k = 0; k < 3; k++) {
    const kx = Math.random() * S, ky = Math.random() * S;
    const kr = 3 + Math.random() * 5;
    for (let ring = 5; ring >= 1; ring--) {
      a.strokeStyle = shade(0.5 + ring * 0.07, 0.45);
      a.lineWidth = 1.1;
      a.beginPath();
      a.ellipse(kx, ky, kr * ring * 0.8, kr * ring * 0.4, 0, 0, Math.PI * 2);
      a.stroke();
    }
  }
  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = aniso(16);

  // Shallow grain relief only — this is sanded, sealed veneer, not sawn timber.
  const height = document.createElement('canvas');
  height.width = height.height = S;
  const h = height.getContext('2d')!;
  h.fillStyle = '#8a8a8a';
  h.fillRect(0, 0, S, S);
  for (let i = 0; i < 700; i++) {
    const y0 = Math.random() * S;
    const v = 110 + Math.floor(Math.random() * 80);
    h.strokeStyle = `rgb(${v},${v},${v})`;
    h.lineWidth = 0.7 + Math.random();
    h.beginPath();
    h.moveTo(0, y0);
    h.lineTo(S, y0 + (Math.random() * 5 - 2.5));
    h.stroke();
  }
  const normalMap = heightToNormalTexture(height, 0.9);
  normalMap.anisotropy = aniso(16);

  // Sealed satin: fairly even, a little glossier along the sanded grain and
  // duller where the finish has worn through at handling height.
  const rough = document.createElement('canvas');
  rough.width = rough.height = S;
  const r2 = rough.getContext('2d')!;
  r2.fillStyle = '#9c9c9c'; // ~0.61
  r2.fillRect(0, 0, S, S);
  for (let i = 0; i < 22; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 40 + Math.random() * 110;
    const g = r2.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, Math.random() > 0.5 ? 'rgba(200,200,200,0.45)' : 'rgba(130,130,130,0.4)');
    g.addColorStop(1, 'rgba(156,156,156,0)');
    stampTiled(r2, S, (c) => { c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); });
  }
  const roughnessMap = new THREE.CanvasTexture(rough);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;

  return { map, normalMap, roughnessMap };
}

/**
 * The active format's shelving finish, or null when it is the chain's laminate
 * (in which case the caller keeps every material it already built — this is the
 * "corporate store is unchanged, value for value" path).
 */
export function formatShelfWood(): { hex: string; endPanelHex: string; textures: SurfaceTextureSet } | null {
  const f = activeStoreFormat();
  if (f.shelfFinish !== 'wood' || !f.shelfWoodHex) return null;
  return {
    hex: f.shelfWoodHex,
    endPanelHex: f.shelfEndPanelHex ?? f.shelfWoodHex,
    textures: createWoodShelfTextures(f.shelfWoodHex),
  };
}

/**
 * The colour the active format's floor is dyed. A format that declares no
 * colour of its own defers to the theme, which is what the corporate box has
 * always done (theme.palette.carpet).
 */
export function formatCarpetHex(): string {
  const f = activeStoreFormat();
  return f.carpetHex ?? getActiveTheme().palette.carpet;
}

/** The colour the active format's walls are finished in. See formatCarpetHex. */
export function formatWallHex(): string {
  const f = activeStoreFormat();
  return f.wallHex ?? getActiveTheme().palette.wall;
}

/** Floor covering for the active format. */
export function formatCarpetTextures(): SurfaceTextureSet {
  const f = activeStoreFormat();
  if (f.carpet === 'shag') return createShagCarpetTextures(formatCarpetHex());
  return createCarpetTextures();
}

/** Wall finish for the active format. */
export function formatWallTextures(): SurfaceTextureSet {
  const f = activeStoreFormat();
  if (f.wallFinish === 'wood-panel') return createWoodPanelTextures(formatWallHex());
  return createWallTextures();
}

/**
 * Does this format's wall finish carry its OWN colour in the texture?
 *
 * The drywall path paints a neutral scan and lets the theme's paint colour
 * multiply through it (store-shell.ts's "scan is the texture, theme is the
 * paint" split, and the same trick the carpet scan uses). Wood panelling
 * cannot work that way — the grain, the tone-per-board variation and the
 * groove shading are all baked into the albedo in the format's own timber
 * colour, so multiplying a wall-paint tint over it would tint the timber.
 * Callers use this to decide whether to apply a colour at all, and to skip the
 * optional user-asset drywall scan swap, which would replace the panelling
 * with painted plaster.
 */
export function formatWallIsPrefinished(): boolean {
  return activeStoreFormat().wallFinish !== 'drywall';
}
