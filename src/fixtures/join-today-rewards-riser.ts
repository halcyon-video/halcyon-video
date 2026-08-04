// 2004-2008 REWARDS-relaunch "JOIN TODAY." shelf-end riser card.
//
// Gated by POP PERIOD, not theme (pop-period.ts): this is a corporate POP kit
// attested [2004..2008] — ERAS.md's campaign timeline names it directly
// ("REWARDS relaunch purple/yellow JOIN TODAY 2004-2008 [1279537289]"),
// bounded backward by the 1999-2003 first-generation REWARDS program it
// supersedes and forward by Total Access. Under the owner's fabric-vs-kit
// model it therefore hangs on any fabric refit by the period in play, which
// makes it visible at BOTH the 2005 and 2008 pop periods — i.e. bb-2000's
// default period and bb-2010's, the two fabrics that plausibly hosted it.
//
// Reference + measurements: public/user-assets/fixtures/join-today-rewards-banner/
// (NOTES.md — 14 x 39 in, aspect 0.36 corroborated by the TWO independent
// copies of the same card in photo 1279537289; the absolute inches are that
// file's own LOW-confidence "order-of-magnitude" estimate and are used here
// as such). The art below is a brand-free recreation of the same measured
// layout in a SHIFTED palette — that requirement comes from that NOTES.md's
// "Genericization needs" section, because the real art's purple/yellow pairing
// plus the card graphic read as the trademark together.
//
// NO USER-ASSET OVERRIDE ANY MORE (owner F8 pin 026, 2026-08-03). The
// git-ignored front.png that used to swap in here carried a real chain's
// membership card, and the pin ordered it off the aisle end; it is retired to
// that dir's retired/ and this module no longer loads it, so re-dropping the
// file cannot put the mark back. What stands in the footer band instead is the
// STORE'S OWN card, painted from canon by drawRewardsCardFace
// (src/membership-cards.ts) at the measured centre/width/tilt — a depicted
// product that follows whatever brand pack is installed (signage rules 2+5).
//
// PLACEMENT — read straight off the reference photo (zoom the near copy in
// reference/original_1279537289.jpg at ~+380+330, 400x500). The card is
// clipped flat to the blond
// GABLE END of an aisle run, standing a fraction proud of the panel, with a
// second copy visible on the next run end receding down the same aisle.
// INVENTORY.md calls the class `endcap-header` and describes it as "clipped
// to successive shelf ends down the aisle" — a mailed kit, not a one-off. So
// this builds one riser on EVERY entrance-facing run-end cap that isn't
// already hosting an endcap: a genre/collection endcap suppresses its run's
// blue front cap (shelving.ts `suppressFrontCapLineIds`) and mounts its own
// back panel on that exact plane, so a riser there would be buried inside it.
// buildStore hands the reserved line ids in.
//
// HEIGHT — a PROPORTION, because the absolute height is unreachable here.
// An evidence pass (2026-08-02) solved reference photo 1279537289 against two
// independent in-frame anchors: the customer standing beside the card (65 in
// tall -> 7.03 px/in at his depth) and the back wall's ceiling-to-floor run
// (-> 4.63 px/in at its depth), with the camera eye at ~61 in and the horizon
// on y ~ 434. Both anchors agree that the real card's TOP edge sits at ~5.7 ft
// and its bottom at ~2.45 ft, on a gondola end ~6.6 ft tall. As fractions of
// the fixture it hangs on:
//   card_top    / fixture_height = 5.70 / 6.6 = 0.86
//   card_height / fixture_height = 3.25 / 6.6 = 0.49
// Our run-end cap is only 5.1 ft (shelving.ts capTrapezoidGeo builds every cap
// at that height), so 5.7 ft is 0.6 ft ABOVE the cap's own top edge — the
// absolute height simply cannot be hit without floating the card off the end
// of the fixture. THE ABSOLUTE HEIGHT IS THEREFORE MISSED BY DESIGN, 5.70 ft
// wanted vs 4.39 ft built, and what is matched instead is the top-edge
// PROPORTION: 0.86 x 5.1 = 4.39 ft.
// The two fractions cannot both be honoured either. The card is a fixed 39 in
// artifact (its own measured size, and the same 3.25 ft the photo solves for
// the real one), which is 3.25/5.1 = 0.64 of our shorter cap against the
// reference's 0.49 — matching the height fraction as well would mean printing
// the card 23 % under its measured size. The TOP edge wins because that is the
// datum the eye actually reads: a row of card tops running level down the
// aisle, the reference's own composition. The bottom edge consequently lands
// at 4.39 - 3.25 = 1.14 ft rather than the proportional 0.37 x 5.1 = 1.89 ft.
//
// NOT MODELLED, on purpose: the two small clear plastic clips visible on the
// card's right edge in the reference. They are ~1 in of blurred hardware in a
// ~100 px-wide crop, and approximating them is the invent-the-shape failure
// the signage rules exist to stop. The card sits 0.18 in off the cap face,
// which reads as clipped-on at any real viewing distance.
import * as THREE from 'three';
import type { StoreScene } from '../three-scene';
import { FIELD_Z_FRONT } from '../store-layout';
import { markSignMesh } from '../sign-builders';
import { popKitVisible } from '../pop-period';
import { BB_ARCHIVO_BLACK, ensureBundledFont } from '../bundled-fonts';
import { drawRewardsCardFace } from '../membership-cards';

// Measured physical size (NOTES.md): 14 x 39 in.
const RISER_W_FT = 14 / 12;
const RISER_H_FT = 39 / 12;

// The run-end cap is a 5.1 ft trapezoid centred at y 2.55 whose broad face
// sits at local z = frontLocalZ + 0.10 (shelving.ts: mesh at +0.05, geometry
// 0.1 thick and centred). The riser's top edge lands on the reference's
// top-edge fraction of that cap — see the HEIGHT note in the header for the
// two-anchor solve and for why the absolute 5.7 ft is unreachable. The cap
// tapers from UNIT_DEPTH 2.16 ft at the floor to UNIT_TOP_DEPTH 1.26 ft at
// 5.1, so at 4.39 ft it is still 1.39 ft across and a 1.17 ft card keeps
// ~1.3 in of blond panel showing either side all the way up (it kept 0.9 in
// at the 4.75 ft this used to hang at).
const CAP_FACE_LOCAL_Z = 0.10;
const CARD_STANDOFF = 0.015;      // 0.18 in of clip proud of the panel
// The cap height the top-edge fraction below was SOLVED against. The gondola
// crown has since been trimmed to UNIT_FRAME_HEIGHT = 4.6 ft (F8 pin 023 — the
// frame used to clear its top row of stock by 7 in), and this fixture's
// ABSOLUTE placement is deliberately held at what that solve produced rather
// than re-proportioned: the card still fits, with 0.21 ft of panel above it
// and the cap still 1.39 ft across at the card's top edge, and re-hanging a
// gated sign is its own change with its own overlay gate.
const CAP_H_FT = 5.1;
const RISER_TOP_FRAC = 0.86;      // card top / fixture height, off the reference
const RISER_TOP_Y = RISER_TOP_FRAC * CAP_H_FT;   // 4.386 ft
const RISER_CENTER_Y = RISER_TOP_Y - RISER_H_FT / 2;

// ── Measured layout, as fractions of the card (NOTES.md / generate.html) ────
// Eight single-word display lines, each with its own measured ink box and cap
// band; the purple footer band starts at 0.798 H and carries the membership
// card at (0.505, 0.815) with a projected width of 0.58 W, tilted -12 deg.
const BAND_Y0 = 0.798;
const TOP_CORNER_R = 0.06;        // rounded TOP corners only (bottom is cut square)
type Line = { text: string; x0: number; x1: number; capY0: number; capY1: number; gap: number; ink: 0 | 1 | 2 };
const LINES: Line[] = [
  { text: 'JOIN',    x0: 0.070, x1: 0.900, capY0: 0.070,   capY1: 0.140,   gap: 0.300, ink: 0 },
  { text: 'TODAY.',  x0: 0.070, x1: 0.865, capY0: 0.144,   capY1: 0.191,   gap: 0.045, ink: 0 },
  { text: 'GET',     x0: 0.065, x1: 0.865, capY0: 0.196,   capY1: 0.279,   gap: 0.158, ink: 1 },
  { text: 'FREE',    x0: 0.100, x1: 0.865, capY0: 0.281,   capY1: 0.35283, gap: 0.120, ink: 1 },
  { text: 'RENTALS', x0: 0.110, x1: 0.865, capY0: 0.36073, capY1: 0.39777, gap: 0.120, ink: 1 },
  { text: 'ALL',     x0: 0.075, x1: 0.915, capY0: 0.407,   capY1: 0.486,   gap: 0.514, ink: 2 },
  { text: 'YEAR',    x0: 0.060, x1: 0.900, capY0: 0.491,   capY1: 0.569,   gap: 0.045, ink: 2 },
  { text: 'LONG.',   x0: 0.075, x1: 0.980, capY0: 0.572,   capY1: 0.641,   gap: 0.131, ink: 2 },
];
const CARD = { cx: 0.505, cy: 0.815, w: 0.58, hOverW: 0.79, rotDeg: -12 };

// Genericized palette. NOTES.md's genericization section is explicit that the
// purple/yellow pairing plus the card graphic together read as the REWARDS
// trademark, so the committed art shifts the accent hue while keeping every
// measured position: mid TEAL field, deep navy display + footer band, white
// mid-block, tone-on-tone pale teal for the ALL/YEAR/LONG block.
const FIELD = '#2E9CA6';
const FIELD_SHADE = '#26868F';
const BAND = '#123A52';
const BAND_SHADE = '#0E2E42';
const INKS = ['#123A52', '#FFFFFF', '#8FD3D6'];

function roundRectTop(ctx: CanvasRenderingContext2D, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, r);
  ctx.arcTo(0, 0, r, 0, r);
  ctx.lineTo(w - r, 0);
  ctx.arcTo(w, 0, w, r, r);
  ctx.lineTo(w, h);
  ctx.closePath();
}

// Fit one word into its measured ink box: solve the pixel size that puts the
// CAP height on the measured band (read off the face actually resolved, not a
// hardcoded 0.72 ratio), lay the letters out at the measured tracking, then
// take up the residual with a horizontal scale. Same discipline as
// membership-oval-hanger.ts's fallback.
function inkLine(
  ctx: CanvasRenderingContext2D, text: string,
  x0: number, x1: number, capTop: number, capH: number,
  color: string, gapFrac: number,
): void {
  const font = (px: number) => `900 ${px}px ${BB_ARCHIVO_BLACK}, sans-serif`;
  const probe = 200;
  ctx.font = font(probe);
  const capRatio = (ctx.measureText('H').actualBoundingBoxAscent || probe * 0.72) / probe;
  ctx.font = font(capH / capRatio);
  const gap = gapFrac * capH;
  const chars = Array.from(text);
  const widths = chars.map((c) => ctx.measureText(c).width);
  const natural = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
  ctx.save();
  ctx.translate(x0, capTop + capH); // cap top + cap height = baseline
  ctx.scale((x1 - x0) / natural, 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  let cx = 0;
  chars.forEach((c, i) => {
    ctx.fillText(c, cx, 0);
    cx += widths[i] + gap;
  });
  ctx.restore();
}

// ── Brand-free procedural art ───────────────────────────────────────────────
// Starts TRANSPARENT so the rounded top corners are real alpha (the card is
// die-cut) — the material's alphaTest cuts them.
function paintRiser(canvas: HTMLCanvasElement): void {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // Field, clipped to the rounded-top silhouette, with the slight vertical
  // shade a printed sheet carries.
  ctx.save();
  roundRectTop(ctx, w, h, TOP_CORNER_R * w);
  ctx.clip();
  const grad = ctx.createLinearGradient(0, 0, 0, BAND_Y0 * h);
  grad.addColorStop(0, FIELD);
  grad.addColorStop(1, FIELD_SHADE);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, BAND_Y0 * h);
  const bandGrad = ctx.createLinearGradient(0, BAND_Y0 * h, 0, h);
  bandGrad.addColorStop(0, BAND);
  bandGrad.addColorStop(1, BAND_SHADE);
  ctx.fillStyle = bandGrad;
  ctx.fillRect(0, BAND_Y0 * h, w, h - BAND_Y0 * h);

  for (const l of LINES) {
    inkLine(ctx, l.text, l.x0 * w, l.x1 * w, l.capY0 * h, (l.capY1 - l.capY0) * h, INKS[l.ink], l.gap);
  }

  // The card in the footer band. The REAL sign composites a photographed
  // chain REWARDS card — the artifact the owner filed F8 pin 026 against
  // (the depicted card was "straight up unambiguously" a real chain's mark),
  // now retired
  // out of the user-assets tree. What stands there instead is the STORE'S OWN
  // membership card (drawRewardsCardFace, membership-cards.ts — the same house
  // band / brass rule / cream stock / brand wordmark the login picker fans
  // out), so the depicted product follows whatever brand pack is installed
  // (signage rules 2 + 5). Position, projected width, tilt and the contact
  // shadow it casts on the band are all still the measured ones.
  const cardW = CARD.w * w;
  const cardH = cardW * CARD.hOverW;
  const drawCardPath = () => {
    const r = cardH * 0.09;
    const x = -cardW / 2, y = -cardH / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + cardW, y, x + cardW, y + cardH, r);
    ctx.arcTo(x + cardW, y + cardH, x, y + cardH, r);
    ctx.arcTo(x, y + cardH, x, y, r);
    ctx.arcTo(x, y, x + cardW, y, r);
    ctx.closePath();
  };
  ctx.save();
  ctx.beginPath();                                   // shadow lives on the band only
  ctx.rect(0, BAND_Y0 * h, w, h - BAND_Y0 * h);
  ctx.clip();
  ctx.translate(CARD.cx * w - 0.010 * cardW, CARD.cy * h + 0.034 * cardW);
  ctx.rotate((CARD.rotDeg * Math.PI) / 180);
  ctx.filter = `blur(${Math.max(1, 0.026 * cardW)}px)`;
  ctx.fillStyle = 'rgba(4, 14, 22, 0.62)';
  drawCardPath();
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(CARD.cx * w, CARD.cy * h);
  ctx.rotate((CARD.rotDeg * Math.PI) / 180);
  drawRewardsCardFace(ctx, -cardW / 2, -cardH / 2, cardW, cardH);
  ctx.restore();
  ctx.restore();
}

function fallbackTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = Math.round(w * (RISER_H_FT / RISER_W_FT));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  paintRiser(canvas);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  // Eight display lines AND the depicted card's wordmark all set in the
  // bundled display face; it registers async, so the first pass can land on a
  // system fallback. Repaint in place once it arrives — this used to be
  // invisible because front.png always covered the fallback on the owner's
  // kiosk, and pin 026 retired that override.
  ensureBundledFont(BB_ARCHIVO_BLACK, () => {
    paintRiser(canvas);
    tex.needsUpdate = true;
    riserRepaint?.();
  });
  return tex;
}

// Set for the life of one build so the font-ready repaint can ask for a frame
// (render-on-demand). Cleared implicitly by the next build overwriting it.
let riserRepaint: (() => void) | null = null;

/**
 * @param endcapHostLineIds Run lines whose front end is already claimed by a
 * genre/collection endcap — buildStore's own reservation set, and the SAME set
 * it hands shelving.ts as `suppressFrontCapLineIds`. Those ends are the only
 * ones with no cap panel to clip to: the endcap mounts its own back panel on
 * that exact plane, so a riser there would be buried inside it.
 *
 * Every OTHER line front gets a cap, in EVERY arrangement — shelving.ts's
 * build is `if (unit.isLineFront && !suppressFrontCapLineIds.has(lineId))`,
 * with no arrangement term anywhere in it (straight / diagonal / herringbone
 * only change where the runs sit and how they are yawed). What DOES vary is
 * the cap's COLOUR: `isFrontCapFacingStore` compares which end of the run
 * lands nearer the x=11 centreline and passes that to
 * createLibraryEndCapMaterial, so a run whose front end faces away wears the
 * white/slatwall material and carries its library label on the back cap
 * instead. The riser never reads that flag — it clips to the panel, not to the
 * livery — so a non-blue front cap hosts one exactly like a blue one.
 * (An earlier revision of this comment said those ends had "no blue front cap
 * to clip a riser to", which read as "no cap at all in some arrangements" and
 * sent an agent hunting a build bug that does not exist. Verified 2026-08-02:
 * risers build in all three arrangements — see scratch/wiring3.)
 */
export function buildJoinTodayRewardsRisers(
  scene: StoreScene,
  endcapHostLineIds?: Set<number>,
): void {
  if (!popKitVisible(2004, 2008)) return;

  const hosts = scene.plan.shelvingUnits.filter(
    (u) => u.isLineFront && u.libraryIdx >= 0 && !endcapHostLineIds?.has(u.lineId),
  );
  if (hosts.length === 0) return;

  const group = new THREE.Group();
  group.name = 'join-today-rewards-risers';
  scene.scene.add(group);
  scene.activeSignageObjects.push(group);

  riserRepaint = () => scene.requestRender();
  const art = fallbackTexture();
  const mat = new THREE.MeshStandardMaterial({
    map: art,
    // Rounded TOP corners are real alpha in the art. A straight alphaTest cut
    // keeps the card in the OPAQUE pass — no transparent sort, no blending —
    // which is what a 4-corner die-cut wants.
    alphaTest: 0.5,
    side: THREE.FrontSide,
    roughness: 0.5,   // coated card stock, between the 93 matte and a gloss poster
    metalness: 0.0,
  });
  // One geometry, one material, one mesh per run end: the kit's own
  // "clipped to successive shelf ends" pattern at two triangles a copy.
  const geo = new THREE.PlaneGeometry(RISER_W_FT, RISER_H_FT);
  for (const u of hosts) {
    const localZ = FIELD_Z_FRONT + u.zPos + CAP_FACE_LOCAL_Z + CARD_STANDOFF;
    const p = scene.plan.unitToWorld(u, u.xCenter, localZ);
    const card = new THREE.Mesh(geo, mat);
    card.position.set(p.x, RISER_CENTER_Y, p.z);
    card.rotation.y = u.yaw; // same convention unitToWorld uses — local +Z out
    markSignMesh(card);      // flush on the cap: nothing to cast onto
    group.add(card);
  }
  // No user-asset swap: the branded override that used to land on this
  // material was retired on the owner's F8 pin 026 (see
  // public/user-assets/fixtures/join-today-rewards-banner/NOTES.md), and
  // re-dropping that file must not put the chain's card back on the aisle end.
}
