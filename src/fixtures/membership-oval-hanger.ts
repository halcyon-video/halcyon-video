// 2012 "MEMBERSHIP SERVICES" die-cut ceiling hanger, over the checkout counter.
//
// Gated by POP PERIOD, not theme (pop-period.ts): this is a corporate POP kit
// attested for 2012 only (ERAS.md intervals), so under the owner's
// fabric-vs-kit model it hangs on ANY fabric refit by 2012 — bb-1990 through
// bb-2010 — whenever the store's pop period is 2012, and never when the period
// is 2005/2008. bb-2010's default period is 2008, so on that fabric it takes an
// explicit `bb_pop_period=2012` (harness: --set bb_pop_period=2012).
//
// Reference + measurements: public/user-assets/fixtures/membership-services-oval/
// (NOTES.md — 40 x 18.7 in die-cut, ellipse conic fit on 239 boundary points,
// two-photo triangulation of the true aspect; generate.html draws it). The
// committed fallback below is a GENERIC brand-free recreation of the same
// measured layout — the wording "MEMBERSHIP SERVICES" carries no mark — and
// installing the git-ignored front.png swaps the real art in.
//
// This follows the storefront-campaign-poster.ts pattern rather than the
// fixture registry: FixturePlacement is a floor-footprint model (x/z + yaw,
// validated against walkway clearances by the layout validator), and a sign on
// two monofilaments has no footprint and needs the CEILING, which over the
// checkout zone is the dropped cash-wrap soffit rather than the tile deck.
// store-shell passes that height in with the same `(x,z) => y` resolver
// buildSecurityCamera93 takes.
import * as THREE from 'three';
import type { StoreScene } from '../three-scene';
import { markSignMesh } from '../sign-builders';
import { popKitVisible } from '../pop-period';
import { tryLoadUserAssetTexture } from '../user-assets';
import { BB_ARCHIVO_BLACK } from '../bundled-fonts';

// ── Measured spec, in the measurement record's own L UNITS ──────────────────
// L = the ellipse's major axis = the sign's 40 in width; origin = ellipse
// centre; +u right, +v DOWN. Keeping this module in the same frame as
// NOTES.md/generate.html means the quad, the fallback canvas and the hang-hole
// anchors all fall out of one set of numbers.
const L_IN = 40;
const L_FT = L_IN / 12;
const ELLIPSE_B = 0.2;            // semi-minor: the 40 x 16 in blank is 5:2
const ARROW = {
  shaftTopV: 0.1138,              // flat top of the shaft, printed on the blue
  shaftW: 0.1588,
  shoulderV: 0.1513,
  headW: 0.2406,
  apexV: 0.2682,                  // adopted tip (NOTES.md orchestrator decision)
};
const HOLES = [{ u: -0.2166, v: -0.1616 }, { u: 0.2184, v: -0.1594 }];
const HOLE_D = 0.0050;
const LINE1 = { text: 'MEMBERSHIP', u0: -0.4006, u1: 0.4175, capV0: -0.0932, cap: 0.0850 };
const LINE2 = { text: 'SERVICES', u0: -0.3206, u1: 0.2944, capV0: 0.0018, cap: 0.0862 };
const BLUE = '#384AC9';
const YELLOW = '#FFDB40';
const WHITE = '#FFFFFF';
const KEYLINE = '#1A1A20';
const KEYLINE_L = 0.0015;         // ~0.06 in printed keyline on arrow + letters

// The quad carries front.png's WHOLE frame, bleed included, so the die-cut
// lands at its measured size: the PNG is 2048x980 with frame originY 410, i.e.
// v -0.2002 (ellipse top, flush to row 0 — measured alpha bbox 2048x957) down
// to +0.2783, which is the 0.2682 arrow tip plus ~23 transparent rows of bleed.
// Cropping the quad to the bare 18.7 in die-cut box instead would squash the
// installed art by 2.3 %.
const FRAME_V0 = -410 / 2048;
const FRAME_V1 = (980 - 410) / 2048;
const QUAD_W_FT = L_FT;
const QUAD_H_FT = (FRAME_V1 - FRAME_V0) * L_FT;
// The ellipse centre (v = 0) sits this far DOWN from the quad's own centre, so
// the mesh hangs that much higher than the height we quote for the oval.
const QUAD_CENTER_V = (FRAME_V0 + FRAME_V1) / 2;

// Oval centre height. The arrow tip lands at 8.2 - 0.2682 L = 7.31 ft — over a
// foot of head clearance under the lowest ink — while the ellipse top (8.87 ft)
// stays well under the cash-wrap soffit at 11.5 ft, leaving a believable ~2.8 ft
// of monofilament rather than a sign glued to the lid.
const OVAL_CENTER_Y = 8.2;

// Loaded user art survives signage rebuilds (clearActiveSignage disposes
// materials and geometries, not maps) and is only fetched once per session.
let userTex: THREE.Texture | null = null;
let userTexMissing = false;

// ── Brand-free procedural fallback ──────────────────────────────────────────
// Same die-cut discipline as generate.html: the canvas starts TRANSPARENT and
// the only opaque region is (blue ellipse) ∪ (yellow arrow), so the alpha is
// the silhouette. All print goes down `source-atop` — ink can only exist on the
// board, or stray glyphs read in 3D as text floating beside the sign.
function fallbackTexture(): THREE.CanvasTexture {
  const unit = 1024;                                  // px per L
  const canvas = document.createElement('canvas');
  canvas.width = unit;
  canvas.height = Math.round((FRAME_V1 - FRAME_V0) * unit);
  const ctx = canvas.getContext('2d')!;
  const X = (u: number) => unit / 2 + u * unit;
  const Y = (v: number) => (v - FRAME_V0) * unit;
  const S = (l: number) => l * unit;

  // 1. Blue ellipse blank (no printed keyline — the bright rim in the photo is
  //    the board's cut edge, sub-pixel at store distances).
  ctx.beginPath();
  ctx.ellipse(X(0), Y(0), S(0.5), S(ELLIPSE_B), 0, 0, Math.PI * 2);
  ctx.fillStyle = BLUE;
  ctx.fill();

  // 2. Yellow arrow, shaft down through the shoulders to the tip below the
  //    ellipse — part of the die-cut, so it is filled, not printed.
  const sh = ARROW.shaftW / 2, hh = ARROW.headW / 2;
  ctx.beginPath();
  ctx.moveTo(X(-sh), Y(ARROW.shaftTopV));
  ctx.lineTo(X(sh), Y(ARROW.shaftTopV));
  ctx.lineTo(X(sh), Y(ARROW.shoulderV));
  ctx.lineTo(X(hh), Y(ARROW.shoulderV));
  ctx.lineTo(X(0), Y(ARROW.apexV));
  ctx.lineTo(X(-hh), Y(ARROW.shoulderV));
  ctx.lineTo(X(-sh), Y(ARROW.shoulderV));
  ctx.closePath();
  ctx.fillStyle = YELLOW;
  ctx.fill();
  // Keyline INSIDE the outline (clipped, double width) so the die-cut
  // silhouette stays exactly the polygon.
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = KEYLINE;
  ctx.lineWidth = S(KEYLINE_L) * 2;
  ctx.stroke();
  ctx.restore();

  // 3. Display lines, fitted to the measured ink boxes and cap bands.
  ctx.globalCompositeOperation = 'source-atop';
  const drawLine = (
    line: { text: string; u0: number; u1: number; capV0: number; cap: number },
    color: string,
  ) => {
    const font = (px: number) => `900 ${px}px ${BB_ARCHIVO_BLACK}, sans-serif`;
    // Solve the pixel size that puts the CAP height on the measured band —
    // measured off the face actually resolved, not a hardcoded 0.72 ratio.
    const probe = 200;
    ctx.font = font(probe);
    const capRatio = (ctx.measureText('H').actualBoundingBoxAscent || probe * 0.72) / probe;
    ctx.font = font(S(line.cap) / capRatio);
    const natural = ctx.measureText(line.text).width;
    const target = S(line.u1 - line.u0);
    ctx.save();
    ctx.translate(X(line.u0), Y(line.capV0 + line.cap)); // cap top + cap = baseline
    ctx.scale(target / natural, 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = KEYLINE;
    ctx.lineWidth = (S(KEYLINE_L) * 2 * natural) / target; // undo the x-scale
    ctx.strokeText(line.text, 0, 0);
    ctx.fillStyle = color;
    ctx.fillText(line.text, 0, 0);
    ctx.restore();
  };
  drawLine(LINE1, YELLOW);
  drawLine(LINE2, WHITE);
  // (The real sign's micro colophon is a 2-3 px illegible smudge in the source
  // photo — a reconstruction the fallback has no business inventing.)

  // 4. Punch the two hang holes back out of the board.
  ctx.globalCompositeOperation = 'destination-out';
  for (const h of HOLES) {
    ctx.beginPath();
    ctx.arc(X(h.u), Y(h.v), S(HOLE_D) / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * @param ceilingYAt Height of the ceiling the filament ties off to at (x, z) —
 * the dropped cash-wrap soffit over the checkout zone, the tile deck elsewhere.
 */
export function buildMembershipOvalHanger(
  scene: StoreScene,
  ceilingYAt?: (x: number, z: number) => number,
): void {
  if (!popKitVisible(2012, 2013)) return;

  // OVER OPEN FLOOR, not over the register — owner correction against the
  // reference (photo 11347352413): the employee hangs it standing on open
  // floor with the register zone and its COMING ATTRACTIONS wall far in the
  // background. The sign marks the WAY to membership services, so it hangs
  // over the walkway a few feet store-side of the counter apex, on the
  // centreline — from the sales floor you see the oval overhead with the
  // counter behind it, the reference's composition. Nothing else hangs here:
  // the suspended lightboxes are parented to the front glass at z=15, the
  // ceiling-nav genre signs sit out over the aisle runs deeper in, and the
  // counter soffit ends at the apex. Derived from the live apex so it tracks
  // the counter as the vestibule depth changes.
  const x = 11.0;
  const z = scene.deskApexZ() - 5.0;

  const group = new THREE.Group();
  group.name = 'membership-oval-hanger';
  scene.scene.add(group);
  scene.activeSignageObjects.push(group);

  const mat = new THREE.MeshStandardMaterial({
    map: userTex ?? fallbackTexture(),
    // Die-cut alpha: without an alpha cut the transparent field renders as an
    // opaque black rectangle around the oval. A HARD cut (alphaTest 0.5, no
    // `transparent`) rather than the 0.05 + transparent it shipped with —
    // same treatment join-today-rewards-riser.ts gives its 4-corner die-cut.
    // Two reasons, and the first is the owner-facing one: `transparent` puts
    // BOTH halves of the back-to-back pair in the sorted transparent pass, and
    // they sit 0.012 ft apart, so which half wins is decided by a distance
    // compare on two near-coplanar quads — the one mechanism that could ever
    // hand a shopper the sign's mirrored reverse. In the opaque pass the depth
    // buffer decides, always, and the nearer face wins by construction. The
    // second is the standing perf rule: no blend, no sort, no back-to-front
    // re-order every frame the camera moves.
    alphaTest: 0.5,
    // FrontSide, not DoubleSide: with a back-to-back pair each half already
    // covers one side of the store, so DoubleSide only paid to shade a
    // mirrored reverse that is never the visible surface.
    side: THREE.FrontSide,
    roughness: 0.6,   // printed board stock, not a gloss poster
    metalness: 0.0,
  });
  // Back-to-back pair, sharing one geometry and one material.
  //
  // FACING — owner call 2026-08-02 ("just needs to be facing the entrance side
  // of the store"), then VERIFIED IN SITU rather than reasoned about. The
  // ENTRANCE half is the unrotated one: PlaneGeometry's front normal is +Z and
  // the store's entrance is at +Z (front glass z=15), so the mesh at +dz reads
  // forwards to a shopper who has just walked in and is facing the back wall.
  // The -dz half is spun 180 deg about Y, which turns the printed side to face
  // -Z and reads forwards to anyone deeper in the store looking BACK at the
  // entrance. Shots that establish this (scratch/wiring3, bb-2000 +
  // bb_pop_period=2012): from the vestibule at 11,12,0; walking in at 11,6,0;
  // off-centre at 4,2,0; close on the entrance side at 11,-7,0 — all four read
  // MEMBERSHIP SERVICES forwards, as does 11,-20,180 from the sales floor.
  // DO NOT "fix" this by moving the Math.PI onto the +dz half: that turns the
  // entrance half's printed side away and hands every entering shopper the
  // mirrored reverse, which is the bug this note exists to prevent.
  const geo = new THREE.PlaneGeometry(QUAD_W_FT, QUAD_H_FT);
  const y = OVAL_CENTER_Y - QUAD_CENTER_V * L_FT;
  for (const dz of [0.006, -0.006]) {
    const face = new THREE.Mesh(geo, mat);
    face.name = dz > 0 ? 'membership-oval-front-entrance' : 'membership-oval-back-salesfloor';
    face.position.set(x, y, z + dz);
    if (dz < 0) face.rotation.y = Math.PI;
    markSignMesh(face); // no castShadow: an alpha-cut card throws its full
    group.add(face);    // rectangle's silhouette without a custom depth material
  }

  // Two monofilaments from the punched hang holes up to the ceiling. Nylon
  // reads as a dark hairline against a lit ceiling, not as wire.
  const anchorY = ceilingYAt ? ceilingYAt(x, z) : scene.ceilingY;
  const lineMat = new THREE.MeshStandardMaterial({
    color: 0x14141a, roughness: 0.4, metalness: 0.0, transparent: true, opacity: 0.35,
  });
  for (const h of HOLES) {
    const holeX = x + h.u * L_FT;
    const holeY = OVAL_CENTER_Y - h.v * L_FT; // +v is DOWN in the sign's frame
    const len = Math.max(0.05, anchorY - holeY);
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, len, 4), lineMat);
    line.position.set(holeX, holeY + len / 2, z);
    group.add(line);
  }

  if (!userTex && !userTexMissing) {
    tryLoadUserAssetTexture('fixtures/membership-services-oval/front.png', (tex) => {
      tex.anisotropy = 8;
      userTex = tex; // cache across rebuilds; teardown never disposes maps
      mat.map = tex; // harmless if this build was already torn down
      mat.needsUpdate = true;
      scene.requestRender();
    }, { onMiss: () => { userTexMissing = true; } });
  }
}
