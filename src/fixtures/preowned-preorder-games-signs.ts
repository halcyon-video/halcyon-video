// 2009 games-department slat boards: the orange "GREAT PRE-OWNED GAMES $14⁹⁹
// OR LESS" and the red "pre-order your copy TODAY", mounted side by side.
//
// BOTH colourways ship, because the reference deploys both TOGETHER: photo
// 3523390600 has the two boards in ONE frame, hung as a pair on the same panel
// with a measured relationship between them (NOTES.md "Relative placement" —
// the red board's left edge sits ~0.18 board-widths right of the orange
// board's right edge). Placing only one would be discarding an attested fact.
//
// Gated by POP PERIOD, not theme (pop-period.ts). The era is firm — "Both
// signs: May 2009, attested directly (photo metadata / ERAS.md 2009 entry cites
// this exact photo id). No RESURRECT needed — this is a firm date, not an
// inferred one." The period axis is a three-bucket model (2005 / 2008 / 2012),
// so 2009 has no bucket and goes to a neighbour, the same judgement
// the 2006 movies-middle hanger made (unwired 2026-08-02; the reasoning
// survives in git history). It goes in the 2008 bucket —
// `popKitVisible(2008, 2009)` — one year out rather than three, and ERAS.md
// puts the boundary the right side of it: the 2009 price-point family ($2
// 5-DAY, $5.99 pylons) is what CLOSES the 2007-2008 PV interval, so 2009 is the
// tail of that generation, while the 2012 bucket is the separate final
// MEMBERSHIP SERVICES / white-on-blue generation [2012-2013]. Practically that
// hangs them on bb-2010's default period, whose 2008-refit fabric is the same
// black-wire, yellow-wall build the photo shows.
//
// Reference + measurements: public/user-assets/fixtures/preowned-preorder-games-signs/
// (NOTES.md — both boards warped to 1140x1140 at the settled "square within
// noise" aspect, every line re-derived at half-max on the warp, price re-set as
// three top-aligned groups with no decimal point). The committed fallback below
// reproduces that layout, palette and copy: that NOTES.md's genericization
// section is explicit that "GREAT PRE-OWNED GAMES $14.99 OR LESS" and
// "PRE-ORDER YOUR COPY TODAY" are ordinary retail merchandising copy with "no
// genericization required for the copy itself", and that the palette and layout
// "are original-enough to keep as-is" — nothing here reproduces a wordmark or
// licensed character art. It is also explicitly cleared against the standing
// liquidation ban: pre-owned/trade-in pricing is living-store merchandising,
// the named allowed example, not store-closing signalling. Installing the
// git-ignored front_orange.png / front_red.png swaps the real art in.
//
// PHYSICAL SIZE: 12 in square, NOTES.md's own value — "the ~1:1 aspect matches
// the trade-standard 12"x12" slatwall header-card / shelf-talker stock size ...
// a plausible inference from standard hardware, NOT independently confirmed —
// confidence LOW on the inches figure". Adopted as-is rather than re-derived;
// the boards are ~110 px in a 1600x1200 frame with no clean metric anchor at
// their depth, which is the same gap NOTES.md reports. The quads are sized off
// each PNG's own aspect so the art is never stretched, which means the shipped
// art's known aspect residual (the single-mode canvases render the board at
// 0.932 / 0.957 rather than square — NOTES.md's last listed residual) shows up
// as ~11.2 x 12 in and ~11.5 x 12 in boards rather than as distortion.
//
// PLACEMENT — from the reference. The pair hangs flat and high on a panel above
// a slat merchandiser in the games/accessories corner, orange left, red right,
// with the games and carded stock below them. Our analogue is the VIDEO GAMES
// gondola's UNSTOCKED outward face: game-section.ts builds the department's
// rows with `faces: 'front'`, so each row's outward side is a bare backing
// panel — slatwall-textured in the wire-frame theme, i.e. literally the
// reference's substrate — and it is the face a shopper meets walking in from
// the entrance. The boards go in the top shelf bay that can hold them, on the
// row whose outward face looks toward the front of the store.
//
// NOT MODELLED, and disclosed: the reference's ~0.19 board-height vertical
// STAGGER between the two boards. A 12 in board plus that stagger needs 14.3 in
// of clear panel; the gondola's shelf pitch gives 12.7 in, so the pair ships
// LEVEL. NOTES.md rates that stagger MEDIUM confidence and itself allows it
// "could be partly perspective from the camera's off-axis angle across the
// corner"; the horizontal gap, which is the load-bearing part of the pair's
// relationship, is kept at the measured 0.18 board-widths.
import * as THREE from 'three';
import type { StoreScene } from '../three-scene';
import { markSignMesh } from '../sign-builders';
import { popKitVisible } from '../pop-period';
import { tryLoadUserAssetTexture } from '../user-assets';
import { GameSection } from './game-section';
import { BB_ARCHIVO_BLACK } from '../bundled-fonts';

// Shipped canvases (NOTES.md "Deliverable"): a single board centred in its own
// canvas with a 5.5% transparent mount margin on every side.
const ART = {
  orange: { w: 1100, h: 1180, file: 'front_orange.png' },
  red: { w: 1100, h: 1150, file: 'front_red.png' },
} as const;
const MOUNT_MARGIN = 0.055;
const BOARD_H_FT = 12 / 12;
// Quad height = board height grossed up by the transparent margin; width then
// follows each canvas's own aspect, so neither colourway is stretched.
const QUAD_H_FT = BOARD_H_FT / (1 - 2 * MOUNT_MARGIN);
const quadW = (a: { w: number; h: number }) => QUAD_H_FT * (a.w / a.h);
const boardW = (a: { w: number; h: number }) => quadW(a) * (1 - 2 * MOUNT_MARGIN);
// Measured gap between the two boards: 0.18 board-widths (NOTES.md).
const PAIR_GAP_FT = 0.18 * BOARD_H_FT;

// The gondola's backing panel is a 0.5 ft spine centred on the run, so its
// outward face sits at local x = -0.25; the boards hang a hair proud of it.
const PANEL_LOCAL_X = -0.25;
const PANEL_STANDOFF = 0.02;

// ── Measured layout, as fractions of each board (NOTES.md FINAL PASS) ────────
// Every capY below is a half-max read re-derived on the 1140x1140 warp; the
// price is three separately-positioned, TOP-ALIGNED groups and carries no
// decimal point, which is the round-2 correction.
const ORANGE = {
  border: 0.018,
  fieldY1: 0.877,           // dark footer strip runs 0.877 -> 1.000
  lines: [
    { text: 'GREAT', x0: 0.06, x1: 0.94, y0: 0.093, y1: 0.244 },
    { text: 'PRE-OWNED', x0: 0.06, x1: 0.94, y0: 0.260, y1: 0.339 },
    { text: 'GAMES', x0: 0.06, x1: 0.94, y0: 0.355, y1: 0.490 },
  ],
  price: [
    { text: '$', x0: 0.116, x1: 0.254, y0: 0.545, y1: 0.706 },
    { text: '14', x0: 0.256, x1: 0.575, y0: 0.539, y1: 0.792 },
    { text: '99', x0: 0.577, x1: 0.892, y0: 0.539, y1: 0.726 },
  ],
  orLess: { text: 'OR LESS', x0: 0.617, x1: 0.892, y0: 0.735, y1: 0.775 },
};
const RED = {
  border: 0.016,
  lines: [
    { text: 'pre-order', x0: 0.06, x1: 0.94, y0: 0.252, y1: 0.330 },
    { text: 'your copy', x0: 0.06, x1: 0.94, y0: 0.329, y1: 0.412 },
  ],
  today: { text: 'TODAY', x0: 0.06, x1: 0.94, y0: 0.456, y1: 0.643 },
};

// Palette: NOTES.md's white-balance-corrected "used" column.
const ORANGE_FIELD = '#FFB93A';
const ORANGE_INK = '#140D04';
const FOOTER = '#3F4356';
const PRICE_WHITE = '#FFFFFF';
const RED_FIELD = '#FF6E52';
const TODAY_INK = '#F2E93E';
const BOARD_EDGE = '#140D04';

// Loaded user art survives signage rebuilds (clearActiveSignage disposes
// materials and geometries, not maps) and is only fetched once per session.
let orangeTex: THREE.Texture | null = null;
let redTex: THREE.Texture | null = null;
let userTexMissing = false;

const CAPS_FONT = (px: number) =>
  `900 ${px}px ${BB_ARCHIVO_BLACK}, sans-serif`;
const LOWER_FONT = (px: number) =>
  `900 ${px}px ${BB_ARCHIVO_BLACK}, sans-serif`;

/** Fit one line's own ink box onto its measured box, condensing/stretching
 *  horizontally the way period price printing width-solves each line. */
function inkBox(
  ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string,
  x0: number, x1: number, yTop: number, yBot: number, color: string,
): void {
  const probe = 200;
  ctx.font = font(probe);
  const p = ctx.measureText(text);
  const inkH = (p.actualBoundingBoxAscent + p.actualBoundingBoxDescent) || probe * 0.72;
  ctx.font = font(((yBot - yTop) * probe) / inkH);
  const m = ctx.measureText(text);
  const inkW = (m.actualBoundingBoxLeft + m.actualBoundingBoxRight) || m.width;
  ctx.save();
  ctx.translate(x0, yBot - m.actualBoundingBoxDescent);
  ctx.scale((x1 - x0) / inkW, 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.fillText(text, m.actualBoundingBoxLeft, 0);
  ctx.restore();
}

// ── Brand-free procedural fallbacks ─────────────────────────────────────────
// Same canvas proportions and same transparent mount margin as the shipped
// PNGs, so the quad sizes above are correct on either texture.
function fallbackBoard(which: 'orange' | 'red'): THREE.CanvasTexture {
  const art = ART[which];
  const W = 512;
  const H = Math.round((W * art.h) / art.w);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const bx = MOUNT_MARGIN * W, by = MOUNT_MARGIN * H;
  const bw = W - 2 * bx, bh = H - 2 * by;

  const spec = which === 'orange' ? ORANGE : RED;
  ctx.fillStyle = BOARD_EDGE;             // dark near-black board rail
  ctx.fillRect(bx, by, bw, bh);
  const ix = bx + spec.border * bw, iy = by + spec.border * bh;
  const iw = bw - 2 * spec.border * bw, ih = bh - 2 * spec.border * bh;

  if (which === 'orange') {
    ctx.fillStyle = ORANGE_FIELD;
    ctx.fillRect(ix, iy, iw, ORANGE.fieldY1 * ih);
    ctx.fillStyle = FOOTER;               // no legible copy on it: left blank
    ctx.fillRect(ix, iy + ORANGE.fieldY1 * ih, iw, (1 - ORANGE.fieldY1) * ih);
    for (const l of ORANGE.lines) {
      inkBox(ctx, l.text, CAPS_FONT, ix + l.x0 * iw, ix + l.x1 * iw,
        iy + l.y0 * ih, iy + l.y1 * ih, ORANGE_INK);
    }
    // $14⁹⁹ — three top-aligned groups, smaller raised cents, NO decimal.
    for (const g of ORANGE.price) {
      inkBox(ctx, g.text, CAPS_FONT, ix + g.x0 * iw, ix + g.x1 * iw,
        iy + g.y0 * ih, iy + g.y1 * ih, PRICE_WHITE);
    }
    const o = ORANGE.orLess;
    inkBox(ctx, o.text, CAPS_FONT, ix + o.x0 * iw, ix + o.x1 * iw,
      iy + o.y0 * ih, iy + o.y1 * ih, PRICE_WHITE);
  } else {
    ctx.fillStyle = RED_FIELD;
    ctx.fillRect(ix, iy, iw, ih);
    for (const l of RED.lines) {
      inkBox(ctx, l.text, LOWER_FONT, ix + l.x0 * iw, ix + l.x1 * iw,
        iy + l.y0 * ih, iy + l.y1 * ih, PRICE_WHITE);
    }
    const t = RED.today;
    inkBox(ctx, t.text, CAPS_FONT, ix + t.x0 * iw, ix + t.x1 * iw,
      iy + t.y0 * ih, iy + t.y1 * ih, TODAY_INK);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function buildPreownedPreorderGamesSigns(scene: StoreScene): void {
  if (!popKitVisible(2008, 2009)) return;

  // Needs a VIDEO GAMES department with an UNSTOCKED outward face. No games
  // (no Romm catalog) and games-only mode (games-only.ts builds no department
  // at all) both land here; so does the small-store single gondola, which
  // stocks BOTH faces and therefore has no bare panel to hang a board on.
  const hosts = scene.slottedFixtures.filter(
    (f): f is GameSection =>
      f instanceof GameSection && f.frontPlatforms.length > 0 && f.backPlatforms.length === 0,
  );
  if (hosts.length === 0) return;

  // The outward face is the gondola's local -X, which points along
  // (-cos yaw, sin yaw). Prefer the row whose outward face looks toward the
  // front of the store (+Z, the entrance a shopper arrives from); within it,
  // the unit nearest the sales floor.
  const outwardZ = (u: GameSection) => Math.sin(u.placement.yaw as number);
  const facingFront = hosts.filter((u) => outwardZ(u) > 0);
  const pool = facingFront.length > 0 ? facingFront : hosts;
  const host = pool.reduce((a, b) =>
    (a.placement.position.x as number) <= (b.placement.position.x as number) ? a : b);

  // Top-most shelf bay with clear height for a board (0.04 ft boards, plus a
  // little air). Below that the panel is the same everywhere, so the highest
  // one that fits is the closest we can get to the reference's hanging height.
  const shelves = host.shelfHeights;
  let bayY: number | null = null;
  for (let i = shelves.length - 2; i >= 0; i--) {
    const clear = shelves[i + 1] - shelves[i] - 0.04;
    if (clear >= BOARD_H_FT + 0.02) { bayY = (shelves[i] + shelves[i + 1]) / 2; break; }
  }
  if (bayY === null) return;

  const group = new THREE.Group();
  group.name = 'preowned-preorder-games-signs';
  scene.scene.add(group);
  scene.activeSignageObjects.push(group);

  const yaw = host.placement.yaw as number;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const lx = PANEL_LOCAL_X - PANEL_STANDOFF;
  // Screen-right for a viewer facing the outward panel is the gondola's local
  // +Z, so orange (left in the reference) takes the negative side.
  const centreGap = (boardW(ART.orange) + boardW(ART.red)) / 2 + PAIR_GAP_FT;
  const placements: [keyof typeof ART, number][] = [
    ['orange', -centreGap / 2],
    ['red', centreGap / 2],
  ];

  const fallbacks: Partial<Record<keyof typeof ART, THREE.CanvasTexture>> = {};
  const mats: Record<string, THREE.MeshStandardMaterial> = {};
  for (const [which, lz] of placements) {
    const art = ART[which];
    const cached = which === 'orange' ? orangeTex : redTex;
    const fallback = cached ? null : fallbackBoard(which);
    if (fallback) fallbacks[which] = fallback;
    const mat = new THREE.MeshStandardMaterial({
      map: cached ?? fallback,
      // The 5.5% mount margin is transparent in both the art and the fallback;
      // an alphaTest cut keeps the board in the OPAQUE pass — no blending, no
      // transparent sort — which is what a flat mounted card wants.
      alphaTest: 0.5,
      side: THREE.FrontSide,
      roughness: 0.45, // coated board stock under store fluorescents
      metalness: 0.0,
    });
    mats[which] = mat;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(quadW(art), QUAD_H_FT), mat);
    mesh.position.set(
      (host.placement.position.x as number) + lx * c + lz * s,
      bayY,
      (host.placement.position.z as number) - lx * s + lz * c,
    );
    mesh.rotation.y = yaw - Math.PI / 2; // plane normal along the gondola's local -X
    markSignMesh(mesh); // flat on the panel: nothing to cast onto
    group.add(mesh);
  }

  if ((!orangeTex || !redTex) && !userTexMissing) {
    let misses = 0;
    for (const which of ['orange', 'red'] as const) {
      tryLoadUserAssetTexture(`fixtures/preowned-preorder-games-signs/${ART[which].file}`, (tex) => {
        tex.anisotropy = 8;
        if (which === 'orange') orangeTex = tex; else redTex = tex;
        mats[which].map = tex;  // harmless if this build was already torn down
        mats[which].needsUpdate = true;
        fallbacks[which]?.dispose(); // the canvas the real art just replaced
        scene.requestRender();
      }, { onMiss: () => { if (++misses === 2) userTexMissing = true; } });
    }
  }
}
