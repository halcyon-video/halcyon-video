// 2007 "SUMMER SEQUELS START HERE" shelf-edge campaign talker — the repeating
// yellow strip clipped into the label channel along every aisle shelf lip.
//
// ── GATING: TWO gates, and both are evidence-led ────────────────────────────
// 1. POP PERIOD (pop-period.ts). The asset is dated 2007 by its INVENTORY.md
//    entry, corroborated only qualitatively (mid-2000s DVD-era stock in frame);
//    NOTES.md is explicit there is "no independent date-stamp on the strip
//    itself". The period axis is a three-bucket model (2005 / 2008 / 2012), so
//    2007 has no bucket of its own and must be filed under a neighbour.
//    It goes in the 2008 bucket — `popKitVisible(2007, 2008)` — which is the
//    exact interval store-fixtures-config.ts already arms for the 2007-2008 PV
//    "BUNDLE OF SAVINGS" drape tables, the corpus's other 2007-attested kit.
//    ERAS.md backs the boundary from both sides: the 2005 bucket's material
//    (End of Late Fees) is "[2005-2006], bounded by the 2007 Total Access
//    window program", and the 2009 price-point family closes 2008. So 2007
//    sits inside the 2008 generation, not the 2005 one.
// 2. SEASON. This is not a year-round kit: the copy is a SUMMER campaign, and
//    a summer talker hanging in December is the same class of error as an
//    out-of-period kit. The repo already has a seasonal clock —
//    promo-campaigns.ts's `promoToday()`, overridable with `bb_promo_date`, and
//    its SEASONS table puts summer at months [6,7,8]. That same window is
//    reused here rather than inventing a second calendar, so
//    `--set bb_promo_date=2007-07-04` shows the strip and any other date hides
//    it. (pop-period alone was not enough and a calendar alone was not enough:
//    the kit needs the right YEAR generation and the right MONTH.)
//    OWNER CALL AVAILABLE: dropping the season gate makes this a year-round
//    2008-period fixture — a one-line change.
//
// Reference + measurements: public/user-assets/fixtures/summer-sequels-shelf-strip/
// (NOTES.md — rectified from a near-frontal quad, cap 0.2316 of strip height at
// capY 0.4263-0.6579, phrase gap 1.06 cap, repeat gap 2.68 cap; final pass
// re-measured ink weight and both spot colours at half-max). The committed
// fallback below reproduces that rhythm, palette and italic setting with
// DIFFERENT seasonal wording, exactly as that NOTES.md's genericization section
// requires ("the wording ... is a specific chain's ad campaign copy — a generic
// fallback must use different, non-trademarked seasonal wording"). Installing
// the git-ignored front.png swaps the real campaign art in.
//
// ── ABSOLUTE HEIGHT IS NEW HERE, and it closes a gap NOTES.md left open ─────
// NOTES.md declines to give one: it tried to anchor on the Die Hard 2 keepcase
// above the lower strip, got a case height:width of 1.955 against a keepcase's
// 1.389, distrusted it, and filed the size as "an explicit gap rather than
// inventing a number ... a downstream wiring decision". Re-measured here on the
// same case and it resolves: the printed face boxes at (310,255)-(555,595) in
// the 768x1024 original, 245 x 340 px, ratio 1.388 against a DVD keepcase's
// 7.48/5.31 = 1.408 — a 1.5% match, so the earlier 1.955 was a mis-boxed crop
// (most likely the security sleeve), not a bad anchor. That gives 46.1 px/in
// across and 45.5 px/in up, mean 45.8. The strip's own warp quad is 44.5 px
// tall => 0.97 in. Shipped 1.00 in, which also lands on the "typical
// wire-shelving label channel ~1.25-1.5 in" family NOTES.md offered as a
// planning assumption. Confidence MEDIUM (two agreeing axes on a sharp,
// same-depth anchor); the strip sits marginally nearer the lens than the case,
// which biases the true height DOWN by a percent or two, not up.
//
// PLACEMENT — straight off the reference: the strip is clipped into the label
// channel on a wire shelf's front rail, running the full shelf and repeating,
// with the DVD cases standing on that shelf overlapping its top edge. TWO shelf
// levels in one frame carry the identical print, which NOTES.md reads as
// "corroborat[ing] this being a standard printed campaign roll, not a one-off".
// So it goes on EVERY aisle-shelf lip, both faces, all levels — the roll as
// mailed — as one InstancedMesh per shelf length.
import * as THREE from 'three';
import type { StoreScene } from '../three-scene';
import { AISLE_SHELF_HEIGHTS, UNIT_DEPTH, UNIT_TOP_DEPTH, BOX_SPACING } from '../store-layout';
import { markSignMesh } from '../sign-builders';
import { popKitVisible } from '../pop-period';
import { promoToday } from '../promo-campaigns';
import { tryLoadUserAssetTexture } from '../user-assets';

// front.png is ONE tileable repeat period at 3773x600 (NOTES.md "Redraw"), so
// the tile's length follows from the measured strip height.
const ART_ASPECT = 3773 / 600;
const STRIP_H_FT = 1.0 / 12;
const TILE_LEN_FT = STRIP_H_FT * ART_ASPECT;

// Clear of the shelf's own pricing bar, whose outer face sits ~0.003 ft proud
// of shelfDepth/2 in both the laminate and the chunkier wire-black build
// (shelving.ts STRIP_EPS / stripOffset). 0.02 reads as a clipped-on talker.
const FACE_STANDOFF = 0.02;
// Centre on the bar: the wire theme's rail spans yPos..yPos+0.06, the laminate
// strip yPos+0.005..yPos+0.035, and a 1 in card centred at +0.03 covers either
// while overlapping the bottom of the cases above — as the reference does.
const LIP_Y_OFFSET = 0.03;
// Shy of the run's ends so the strip never overhangs the end caps (the same
// 0.003 ft each end shelving.ts pulls its own pricing bar in by).
const END_INSET = 0.003;

// Measured layout, as fractions of strip height / cap height (NOTES.md).
const CAP_FRAC = 0.2316;
const CAP_Y0_FRAC = 0.4263;
const WORD_GAP_CAP = 0.65;
const PHRASE_GAP_CAP = 1.06;
const REPEAT_GAP_CAP = 2.68;
const INK_SPREAD_CAP = 0.112;   // press ink-spread; the face has no Black cut
const KEYLINE_CAP = 0.05;       // black keyline under the two spot colours

// Palette as settled in NOTES.md's final pass (half-max core colour, exposure-
// normalised on the strip's own field). Generic POP spot colours, and the
// campaign COPY is what the genericization section actually bars.
const FIELD_YELLOW = '#FFC60A';
const INK_RED = '#F94C36';
const INK_BLUE = '#636CA0';
const KEYLINE = '#1A0F08';
// Non-trademarked seasonal wording for the committed fallback, per NOTES.md.
const FALLBACK_PHRASE_1 = 'SUMMER PREVIEWS';
const FALLBACK_PHRASE_2 = 'BROWSE NOW';

// Loaded user art survives signage rebuilds (clearActiveSignage disposes
// materials and geometries, not maps) and is only fetched once per session.
let userTex: THREE.Texture | null = null;
let userTexMissing = false;

/** Summer, on the same calendar the promo stands read (SEASONS' summer entry
 *  is months [6,7,8]); `bb_promo_date` forces it. */
function inSummer(): boolean {
  const month = promoToday().getMonth() + 1;
  return month >= 6 && month <= 8;
}

// ── Brand-free procedural fallback ──────────────────────────────────────────
// One repeat period at the art's own aspect, so the tiling maths below is
// identical on either texture. The repeat gap straddles the tile boundary
// (half at each edge), which is what keeps RepeatWrapping seamless.
function fallbackTexture(): THREE.CanvasTexture {
  const h = 160;
  const w = Math.round(h * ART_ASPECT);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = FIELD_YELLOW;
  ctx.fillRect(0, 0, w, h);

  const cap = CAP_FRAC * h;
  const baseline = (CAP_Y0_FRAC + CAP_FRAC) * h;
  // Real italic, not a synthetic skew — NOTES.md measured the reference's
  // ~12.8 deg lean as a genuine italic cut and rejected canvas shear.
  const font = (px: number) => `italic 900 ${px}px Arial, Helvetica, sans-serif`;
  const probe = 200;
  ctx.font = font(probe);
  const capRatio = (ctx.measureText('H').actualBoundingBoxAscent || probe * 0.72) / probe;
  const size = cap / capRatio;
  ctx.font = font(size);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 2.2;

  // Word spacing is a measured multiple of cap height, not the face's own
  // space glyph, so a swapped phrase keeps the reference's rhythm.
  const measure = (phrase: string) => {
    const words = phrase.split(' ');
    const widths = words.map((word) => ctx.measureText(word).width + INK_SPREAD_CAP * cap);
    const total = widths.reduce((a, b) => a + b, 0) + WORD_GAP_CAP * cap * (words.length - 1);
    return { words, widths, total };
  };
  const p1 = measure(FALLBACK_PHRASE_1);
  const p2 = measure(FALLBACK_PHRASE_2);
  const content = p1.total + PHRASE_GAP_CAP * cap + p2.total;
  // The measured repeat gap is held (it is the rhythm that makes the strip read
  // as "two phrases, then a pause"), split across the two tile edges so the
  // dead space straddles the seam under RepeatWrapping. Substituted wording of
  // a different length condenses into what is left rather than eating the gap.
  const repeatGap = REPEAT_GAP_CAP * cap;
  const squeeze = Math.min(1, (w - repeatGap) / content);
  let x = (w - content * squeeze) / 2;

  const drawPhrase = (p: ReturnType<typeof measure>, color: string) => {
    p.words.forEach((word, i) => {
      ctx.save();
      ctx.translate(x, baseline);
      ctx.scale(squeeze, 1);
      ctx.strokeStyle = KEYLINE;
      ctx.lineWidth = (INK_SPREAD_CAP + KEYLINE_CAP) * cap;
      ctx.strokeText(word, 0, 0);
      ctx.strokeStyle = color;
      ctx.lineWidth = INK_SPREAD_CAP * cap;
      ctx.strokeText(word, 0, 0);
      ctx.fillStyle = color;
      ctx.fillText(word, 0, 0);
      ctx.restore();
      x += (p.widths[i] + WORD_GAP_CAP * cap) * squeeze;
    });
    x += (PHRASE_GAP_CAP - WORD_GAP_CAP) * cap * squeeze;
  };
  drawPhrase(p1, INK_RED);
  drawPhrase(p2, INK_BLUE);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function configureTiling(tex: THREE.Texture): void {
  // The geometry carries the repeat count in its own U coordinates (see below),
  // so the texture only has to agree to wrap.
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
}

/** One period's worth of U per TILE_LEN_FT of strip, baked into the quad. */
function tiledStripGeometry(lengthFt: number): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(lengthFt, STRIP_H_FT);
  const uv = geo.getAttribute('uv');
  const reps = lengthFt / TILE_LEN_FT;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * reps);
  uv.needsUpdate = true;
  return geo;
}

export function buildSummerSequelsShelfStrips(scene: StoreScene): void {
  if (!popKitVisible(2007, 2008)) return;
  if (!inSummer()) return;

  const units = scene.plan.shelvingUnits;
  if (units.length === 0) return;

  // Group by run length: every unit of the same column count shares one
  // geometry (and therefore one repeat count), so the whole store's shelf
  // edges come out as a handful of instanced draws.
  const byCols = new Map<number, THREE.Matrix4[]>();
  const dummy = new THREE.Object3D();
  for (const u of units) {
    if (u.libraryIdx < 0) continue;
    const zCenter = scene.plan.aisleZCenter(u);
    let list = byCols.get(u.cols);
    if (!list) { list = []; byCols.set(u.cols, list); }
    for (const yPos of AISLE_SHELF_HEIGHTS) {
      const shelfDepth = UNIT_DEPTH - (UNIT_DEPTH - UNIT_TOP_DEPTH) * (yPos / 5.1);
      const off = shelfDepth / 2 + FACE_STANDOFF;
      for (const side of [1, -1] as const) {
        const p = scene.plan.unitToWorld(u, u.xCenter + side * off, zCenter);
        dummy.position.set(p.x, yPos + LIP_Y_OFFSET, p.z);
        // Plane normal runs along the unit's local +-X, i.e. out of the face
        // the shelf lip belongs to (unitToWorld's convention: +Z is yaw).
        dummy.rotation.set(0, u.yaw + (side > 0 ? Math.PI / 2 : -Math.PI / 2), 0);
        dummy.updateMatrix();
        list.push(dummy.matrix.clone());
      }
    }
  }
  if (byCols.size === 0) return;

  const group = new THREE.Group();
  group.name = 'summer-sequels-shelf-strips';
  scene.scene.add(group);
  scene.activeSignageObjects.push(group);

  const fallback = userTex ? null : fallbackTexture();
  const map = userTex ?? fallback!;
  configureTiling(map);
  const mat = new THREE.MeshStandardMaterial({
    map,
    side: THREE.FrontSide,
    roughness: 0.42, // laminated POP print — glossier than the 93 matte stock
    metalness: 0.0,
  });

  for (const [cols, matrices] of byCols) {
    const geo = tiledStripGeometry((cols - 1) * BOX_SPACING + 1.0 - 2 * END_INSET);
    const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.name = `summer-sequels-strips-${cols}`;
    markSignMesh(mesh); // clipped flat to the lip: nothing to cast onto
    group.add(mesh);
  }

  if (!userTex && !userTexMissing) {
    tryLoadUserAssetTexture('fixtures/summer-sequels-shelf-strip/front.png', (tex) => {
      configureTiling(tex);
      userTex = tex;  // cache across rebuilds; teardown never disposes maps
      mat.map = tex;  // harmless if this build was already torn down
      mat.needsUpdate = true;
      fallback?.dispose(); // the canvas the real art just replaced
      scene.requestRender();
    }, { onMiss: () => { userTexMissing = true; } });
  }
}
