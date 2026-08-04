// 2008 PS2 rental-bay signage cluster in the VIDEO GAMES department: the blue
// "what's NEW" portrait PYLON card at the head of each game run, and the
// "GAME RENTALS 2 for $10" shelf-edge STRIP clipped to a shelf lip mid-run.
//
// Gated by POP PERIOD, not theme (pop-period.ts). The asset's NOTES.md dates
// it to a POINT, not a range — "2008-04-18, attested by the photo's Flickr
// page date ... Single-photo attestation ... so the interval is a POINT
// (2008-04-18), not a range. Do not extend it without a second photo." The
// period axis has a 2008 bucket, so this needs no neighbour-bucket judgement
// call at all (unlike the 2006 movies-middle hanger, unwired 2026-08-02 but
// preserved in git history for its bucket reasoning): `popKitVisible(2008, 2008)`
// is the interval as attested. That renders it on bb-2010's default period
// (2008 fabric hosting a 2008 kit) and on any older fabric forced to
// `bb_pop_period=2008`, and never on a 2005 or 2012 period.
//
// Reference + measurements: public/user-assets/fixtures/game-rentals-2for10/
// (NOTES.md — warp corners, pylon aspect 0.460 later widened to 0.644 on the
// owner's bench call + a typographic solve, strip aspect 7.79:1, layout
// fractions re-derived on the warp at half-max). The committed fallback below
// recreates the same measured layout in a SHIFTED palette: that NOTES.md's
// genericization section is explicit that the copy ("what's NEW", "GAME
// RENTALS 2 for $10") is ordinary retail promo language needing no swap and
// that "the only brand-specific elements are the exact typefaces/colors
// (house blue #1D3EAD-family, the gold accent) which a generic fallback
// should recolor". So the copy stays and the blue/gold pairing goes.
// Installing the git-ignored front.png swaps the real art in.
//
// ── ABSOLUTE SIZE IS NEW HERE, and it is a wiring-time derivation ───────────
// NOTES.md records no physical inches for either piece ("no reliable in-frame
// anchor ... standard-hardware guess only ... do not treat as attested"). Both
// numbers below were measured for this wiring off an anchor the NOTES.md did
// not use: the face-out game cases on the same bay, at each piece's own depth,
// against a standard DVD/PS2 keepcase (7.48 x 5.31 in).
//   STRIP — the case row directly behind it reads 26 px case pitch and 35.5 px
//   case height in the 1024x768 original, i.e. 4.90 and 4.75 px/in, mean 4.82.
//   The strip's warp corners (182,317)-(284,330) are 102 x 13 px => 21.2 x 2.70
//   in, and 21.2/2.70 = 7.85 lands on NOTES.md's independently-measured 7.79
//   aspect. That agreement is what makes it worth adopting. Shipped 21.0 in
//   long. Confidence MEDIUM.
//   PYLON — no case at exactly its depth resolves both dimensions, so it is
//   bracketed: the SpongeBob cases immediately right of it measure 27.3 px tall
//   => 3.69 px/in => 22.0 in; transferring the strip's scale by the rack pitch
//   ratio (22.9/26 px) gives 4.24 px/in => 19.1 in. Midpoint 20.0 in adopted,
//   width from the shipped 0.6468 art aspect. Confidence LOW-MEDIUM, and the
//   bracket is +-8%. NOTES.md's own "4x8.5 in acrylic insert" hardware guess is
//   rejected by both anchors — the card plainly spans most of the bay front in
//   the photo, which 8.5 in cannot.
//
// PLACEMENT — read off reference/original_2427655437.jpg (zoom the games bay at
// +30+220, 320x160). The pylon is a tall portrait card standing PROUD of the
// shelf front at the head of the game bay, occluding the cases behind it; the
// strip is clipped to a shelf's front lip mid-run, overlapping the bottom of
// the cases standing on that shelf. So: pylon on the gondola's stocked face
// hugging the run's aisle-mouth end, top on the same line as the department's
// existing platform blade cards; strip on the stocked face's lip, one per unit,
// centred. Both degrade to nothing when the VIDEO GAMES department is absent
// (no Romm games, or bb_games_only where games-only.ts builds no department).
//
// PERF: front.png is a 3400x1760 ATLAS holding two physically separate printed
// pieces with ~2/3 of the canvas transparent — its own NOTES.md flags this and
// recommends "two separate small props/textures" for a tighter GPU footprint.
// Uploading 6.0 Mpx to draw two small signs is exactly what the prime directive
// forbids, so the loaded image is sliced into two right-sized canvases (512 and
// 1024 px wide, 0.55 Mpx total) and the atlas image is never handed to a
// material. One geometry + one material per piece; the strip's four copies and
// the pylon's two share theirs.
import * as THREE from 'three';
import type { StoreScene } from '../three-scene';
import { UNIT_DEPTH, UNIT_TOP_DEPTH, BOX_SPACING } from '../store-layout';
import { markSignMesh } from '../sign-builders';
import { popKitVisible } from '../pop-period';
import { tryLoadUserAssetTexture } from '../user-assets';
import { GameSection } from './game-section';
import { BB_ANTON, BB_ARCHIVO_BLACK } from '../bundled-fonts';

// ── Atlas geometry (front.png / generate.html `layout`) ─────────────────────
// Each rect is the printed piece INCLUDING its hairline die-cut edge, which
// generate.html draws 6 px (pylon) / 5 px (strip) outside the card rect.
const ATLAS_W = 3400;
const ATLAS_H = 1760;
const PYLON_RECT = { x: 94, y: 74, w: 1062, h: 1642 };
const STRIP_RECT = { x: 1285, y: 1395, w: 2020, h: 268 };

// Measured physical size (see the header note — derived for this wiring).
const PYLON_H_FT = 20.0 / 12;
const PYLON_W_FT = PYLON_H_FT * (PYLON_RECT.w / PYLON_RECT.h);
const STRIP_W_FT = 21.0 / 12;
const STRIP_H_FT = STRIP_W_FT * (STRIP_RECT.h / STRIP_RECT.w);

// Standoff off the shelf-front plane. The gondola's own pricing bar already
// sits 0.003-0.02 ft proud of shelfDepth/2 (game-section.ts STRIP_EPS), so
// anything less than ~0.02 z-fights the lip it is supposed to clip onto.
const FACE_STANDOFF = 0.02;
// Shelf index the strip clips to: the second-from-top board, which is where the
// reference hangs it — up in the display, under the bay header, not at knee
// height. Clamped for any gondola with a different shelf set.
const STRIP_SHELF_IDX = 2;
// Pylon top edge, on the same line as the department's platform blade cards
// (game-section.ts TOP_SHELF_TIP = top shelf 4.3 + half the 0.04 board).
const PYLON_TOP_Y = 4.32;

// ── Genericized palette (NOTES.md "Genericization needs") ───────────────────
// Layout, copy and print structure are kept; the house blue + gold
// pairing that NOTES.md names as the brand-specific part is replaced by a deep
// teal field with white display type and a pale-teal secondary, and the strip's
// campaign orange-red by the same teal ink on its cream stock.
const PYLON_FIELD = '#154A45';
const PYLON_FIELD_EDGE = '#0D302C';
const PYLON_WHATS = '#9BD6CE';
const PYLON_NEW = '#F4F8F7';
const PYLON_NEW_SHADOW = '#0B2724';
const STRIP_CREAM = '#F3EDD9';
const STRIP_CREAM_EDGE = '#D8CFAE';
const STRIP_BLACK = '#141210';
const STRIP_INK = '#1B6B63';
const STRIP_INK_DARK = '#14524C';

// Measured layout fractions of each card (NOTES.md / generate.html `layout`).
const WHATS_LINE = { x0: 0.06, x1: 0.80, y0: 0.30, y1: 0.465 };
const NEW_LINE = { x0: 0.06, x1: 0.945, capY0: 0.485, capY1: 0.79 };
const CREAM_FRAC = 0.685;
const SEAM_LEAN_FRAC = -0.023; // signed: the tab's left edge leans LEFT going down
const GR_TEXT = { x0: 0.035, y0: 0.26, y1: 0.85 };
const PRICE_GROUP = { y0: 0.22, y1: 0.85, forSizeFrac: 0.40, forRise: 0.30, gapFrac: 0.010 };
const ITALIC_SKEW = -0.26;

// Loaded user art survives signage rebuilds (clearActiveSignage disposes
// materials and geometries, not maps) and is only fetched once per session.
let pylonTex: THREE.Texture | null = null;
let stripTex: THREE.Texture | null = null;
let userTexMissing = false;

const DISPLAY_FONT = (px: number) =>
  `900 ${px}px ${BB_ARCHIVO_BLACK}, sans-serif`;
const CONDENSED_FONT = (px: number) =>
  `900 ${px}px ${BB_ANTON}, "Arial Narrow", ${BB_ARCHIVO_BLACK}, sans-serif`;

/**
 * Draw `text` so its own ink box lands on [x0..x1] x [yTop..yBot]. `fill` makes
 * the line fill the width (the justified/condensed setting the real print
 * uses); otherwise x1 is only a clamp. Height is solved from the string's OWN
 * measured ink, not a hardcoded cap ratio — same discipline as
 * join-today-rewards-riser's inkLine.
 */
function inkFit(
  ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string,
  x0: number, x1: number, yTop: number, yBot: number,
  color: string, fill: boolean, skew = 0,
): void {
  const probe = 200;
  ctx.font = font(probe);
  const p = ctx.measureText(text);
  const inkH = (p.actualBoundingBoxAscent + p.actualBoundingBoxDescent) || probe * 0.72;
  const size = ((yBot - yTop) * probe) / inkH;
  ctx.font = font(size);
  const m = ctx.measureText(text);
  const inkW = (m.actualBoundingBoxLeft + m.actualBoundingBoxRight) || m.width;
  const sx = fill ? (x1 - x0) / inkW : Math.min(1, (x1 - x0) / inkW);
  ctx.save();
  // Baseline = target ink bottom minus the descender the face actually carries.
  ctx.translate(x0, yBot - m.actualBoundingBoxDescent);
  if (skew) ctx.transform(1, 0, skew, 1, 0, 0);
  ctx.scale(sx, 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.fillText(text, m.actualBoundingBoxLeft, 0);
  ctx.restore();
}

// ── Brand-free procedural fallbacks ─────────────────────────────────────────
// Both canvases carry the SAME hairline-edge geometry as the atlas rects, so
// the quad sizes below are correct on either texture.
function fallbackPylon(): THREE.CanvasTexture {
  const w = 384;
  const h = Math.round((w * PYLON_RECT.h) / PYLON_RECT.w);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const edge = Math.max(1, Math.round((6 / PYLON_RECT.w) * w));
  ctx.fillStyle = PYLON_FIELD_EDGE;
  ctx.fillRect(0, 0, w, h);
  const cx = edge, cy = edge, cw = w - 2 * edge, ch = h - 2 * edge;
  ctx.fillStyle = PYLON_FIELD;
  ctx.fillRect(cx, cy, cw, ch);
  // Moulded-plastic sheen across the face — a material cue baked by the real
  // art too, not a light.
  const sheen = ctx.createLinearGradient(cx, 0, cx + cw, 0);
  sheen.addColorStop(0, 'rgba(255,255,255,0.05)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.08)');
  ctx.fillStyle = sheen;
  ctx.fillRect(cx, cy, cw, ch);

  inkFit(ctx, "what's", DISPLAY_FONT,
    cx + WHATS_LINE.x0 * cw, cx + WHATS_LINE.x1 * cw,
    cy + WHATS_LINE.y0 * ch, cy + WHATS_LINE.y1 * ch, PYLON_WHATS, false);
  ctx.save();
  ctx.shadowColor = PYLON_NEW_SHADOW;
  ctx.shadowOffsetX = cw * 0.010;
  ctx.shadowOffsetY = cw * 0.010;
  ctx.shadowBlur = cw * 0.006;
  inkFit(ctx, 'NEW', DISPLAY_FONT,
    cx + NEW_LINE.x0 * cw, cx + NEW_LINE.x1 * cw,
    cy + NEW_LINE.capY0 * ch, cy + NEW_LINE.capY1 * ch, PYLON_NEW, true);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function fallbackStrip(): THREE.CanvasTexture {
  const w = 768;
  const h = Math.round((w * STRIP_RECT.h) / STRIP_RECT.w);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const edge = Math.max(1, Math.round((5 / STRIP_RECT.w) * w));
  ctx.fillStyle = STRIP_CREAM_EDGE;
  ctx.fillRect(0, 0, w, h);
  const cx = edge, cy = edge, cw = w - 2 * edge, ch = h - 2 * edge;
  ctx.fillStyle = STRIP_CREAM;
  ctx.fillRect(cx, cy, cw, ch);

  // Black price tab: a parallelogram, not a rectangle — its left seam leans
  // LEFT going down (warp-measured sign, NOTES.md REWORK).
  const seamTop = cx + CREAM_FRAC * cw;
  const seamBot = seamTop + SEAM_LEAN_FRAC * cw;
  ctx.fillStyle = STRIP_BLACK;
  ctx.beginPath();
  ctx.moveTo(seamTop, cy);
  ctx.lineTo(cx + cw, cy);
  ctx.lineTo(cx + cw, cy + ch);
  ctx.lineTo(seamBot, cy + ch);
  ctx.closePath();
  ctx.fill();

  inkFit(ctx, 'GAME RENTALS', CONDENSED_FONT,
    cx + GR_TEXT.x0 * cw, seamBot - 0.02 * cw,
    cy + GR_TEXT.y0 * ch, cy + GR_TEXT.y1 * ch, STRIP_INK_DARK, false, ITALIC_SKEW);

  // "2 for $10" — big / small-raised / big, inside the tab.
  const tabX0 = seamTop + 0.05 * cw;
  const bigTop = cy + PRICE_GROUP.y0 * ch;
  const bigBot = cy + PRICE_GROUP.y1 * ch;
  const bigH = bigBot - bigTop;
  const smallH = bigH * PRICE_GROUP.forSizeFrac;
  const gap = PRICE_GROUP.gapFrac * cw;
  ctx.font = CONDENSED_FONT(bigH);
  const twoW = ctx.measureText('2').width;
  ctx.font = DISPLAY_FONT(smallH);
  const forW = ctx.measureText('for').width;
  inkFit(ctx, '2', CONDENSED_FONT, tabX0, tabX0 + twoW, bigTop, bigBot, STRIP_INK, true, ITALIC_SKEW);
  const forX = tabX0 + twoW + gap;
  const forBot = bigBot - PRICE_GROUP.forRise * bigH;
  inkFit(ctx, 'for', DISPLAY_FONT, forX, forX + forW, forBot - smallH, forBot,
    STRIP_INK, true, ITALIC_SKEW * 0.6);
  const tenX = forX + forW + gap;
  inkFit(ctx, '$10', CONDENSED_FONT, tenX, cx + cw - 0.02 * cw, bigTop, bigBot,
    STRIP_INK, true, ITALIC_SKEW);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Cut one printed piece out of the loaded atlas at a sane on-screen size. */
function sliceAtlas(
  src: CanvasImageSource,
  rect: { x: number; y: number; w: number; h: number },
  outW: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = Math.round((outW * rect.h) / rect.w);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, rect.x, rect.y, rect.w, rect.h, 0, 0, canvas.width, canvas.height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Half-depth of a game gondola's shelf front edge at height y (the trapezoid
 *  taper game-section.ts's shelves and end caps both follow). */
function frontHalfDepth(y: number): number {
  return (UNIT_DEPTH - (UNIT_DEPTH - UNIT_TOP_DEPTH) * (y / 5.1)) / 2;
}

export function buildGameRentals2For10Signs(scene: StoreScene): void {
  if (!popKitVisible(2008, 2008)) return;

  // The department only exists when Romm surfaced games AND the store is not in
  // games-only mode (games-only.ts turns every platform into an aisle library
  // and builds no game-section fixtures at all). Either way: no units, no signs.
  const units = scene.slottedFixtures.filter(
    (f): f is GameSection => f instanceof GameSection && f.frontPlatforms.length > 0,
  );
  if (units.length === 0) return;

  const group = new THREE.Group();
  group.name = 'game-rentals-2for10-signs';
  scene.scene.add(group);
  scene.activeSignageObjects.push(group);

  const pylonFallback = pylonTex ? null : fallbackPylon();
  const stripFallback = stripTex ? null : fallbackStrip();
  // Printed card stock under a store's fluorescents: satin, not gloss paper.
  const matOpts = { side: THREE.FrontSide, roughness: 0.5, metalness: 0.0 } as const;
  const pylonMat = new THREE.MeshStandardMaterial({ map: pylonTex ?? pylonFallback, ...matOpts });
  const stripMat = new THREE.MeshStandardMaterial({ map: stripTex ?? stripFallback, ...matOpts });
  const pylonGeo = new THREE.PlaneGeometry(PYLON_W_FT, PYLON_H_FT);
  const stripGeo = new THREE.PlaneGeometry(STRIP_W_FT, STRIP_H_FT);

  // Local (x = depth, +X is the stocked face; z = along the run) -> world, the
  // same transform game-section.ts's own group applies (rotation.y = yaw).
  const place = (
    u: GameSection, geo: THREE.BufferGeometry, mat: THREE.Material,
    lx: number, y: number, lz: number,
  ): void => {
    const yaw = u.placement.yaw as number;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      u.placement.position.x + lx * c + lz * s,
      y,
      u.placement.position.z - lx * s + lz * c,
    );
    mesh.rotation.y = yaw + Math.PI / 2; // plane normal along local +X
    markSignMesh(mesh); // flush on the fixture: nothing to cast onto
    group.add(mesh);
  };

  // ── Shelf-edge strip: one per unit, centred on the run ─────────────────────
  for (const u of units) {
    const shelfY = u.shelfHeights[Math.min(STRIP_SHELF_IDX, u.shelfHeights.length - 1)];
    place(u, stripGeo, stripMat, frontHalfDepth(shelfY) + FACE_STANDOFF, shelfY + 0.02, 0);
  }

  // ── "what's NEW" pylon: one per row, at the row's aisle-mouth end ─────────
  // Rows are the gondola pairs sharing a Z; the department's mouth is the end
  // that opens back toward the sales floor, i.e. the smallest world X. A local
  // +Z step moves world X by sin(yaw), so the low-X end is at local Z sign
  // -sign(sin yaw).
  const rows = new Map<string, GameSection[]>();
  for (const u of units) {
    const key = (u.placement.position.z as number).toFixed(2);
    const row = rows.get(key);
    if (row) row.push(u); else rows.set(key, [u]);
  }
  const pylonBottom = PYLON_TOP_Y - PYLON_H_FT;
  for (const row of rows.values()) {
    const host = row.reduce((a, b) =>
      (a.placement.position.x as number) <= (b.placement.position.x as number) ? a : b);
    const yaw = host.placement.yaw as number;
    const s = Math.sin(yaw);
    const endSign = Math.abs(s) < 1e-6 ? 1 : -Math.sign(s);
    const shelfLength = (host.cols - 1) * BOX_SPACING + 1.0;
    // Outer edge flush with the run's end-cap plane (shelfLength/2 + 0.05).
    const lz = endSign * (shelfLength / 2 + 0.05 - PYLON_W_FT / 2);
    // Stand proud of the WIDEST shelf edge the card spans (its own bottom) so
    // an upright plane on a tapered gondola never cuts into a lower shelf.
    const lx = frontHalfDepth(pylonBottom) + FACE_STANDOFF;
    place(host, pylonGeo, pylonMat, lx, PYLON_TOP_Y - PYLON_H_FT / 2, lz);
  }

  if ((!pylonTex || !stripTex) && !userTexMissing) {
    tryLoadUserAssetTexture('fixtures/game-rentals-2for10/front.png', (tex) => {
      const img = tex.image as CanvasImageSource | undefined;
      if (!img) return;
      // Guard the rects against an art re-rasterise at a different canvas size:
      // slice by FRACTION of whatever came back, not by raw pixels.
      const src = tex.image as { width: number; height: number };
      const sx = src.width / ATLAS_W, sy = src.height / ATLAS_H;
      const scaled = (r: typeof PYLON_RECT) =>
        ({ x: r.x * sx, y: r.y * sy, w: r.w * sx, h: r.h * sy });
      pylonTex = sliceAtlas(img, scaled(PYLON_RECT), 512);
      stripTex = sliceAtlas(img, scaled(STRIP_RECT), 1024);
      pylonMat.map = pylonTex;   // harmless if this build was already torn down
      stripMat.map = stripTex;
      pylonMat.needsUpdate = true;
      stripMat.needsUpdate = true;
      pylonFallback?.dispose();  // the canvases the real art just replaced
      stripFallback?.dispose();
      tex.dispose();             // the 6.0 Mpx atlas never reaches the GPU
      scene.requestRender();
    }, { onMiss: () => { userTexMissing = true; } });
  }
}
