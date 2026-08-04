// COLLECTION ENDCAP — the franchise-collection aisle end.
//
// Reference: public/user-assets/reference/video-stores-flickr-2026-07-26
//   • photo 2580265323_f355e24f61_o.jpg (2721x4153), Dec 1990, the corpus's
//     only 1990 interior. Three deployments of the same Christmas kit are in
//     frame: the "HITS" tree at `560,440,420,910`, the checkout-tower tree at
//     `2180,700,360,600` (the best-resolved, most face-on instance — every
//     tree number below is measured off it), and the BOND collection end
//     behind it at `2490,900,220,360` with its header card `2541,1055,85,144`.
//   • INVENTORY.md entries `bond-collection-endcap` + `xmas-tree-standee-1990`;
//     STUDY-2580265323.md (see its 2026-07-30 CORRECTION section);
//     VIGNETTES.md entry #1 ("THE TYPE CASE"), which is where the object was
//     first read as one composed thing rather than four category lines.
//
// What the photo actually proves: a slatwall shelf-end wing carrying
// stepped acrylic pockets of ONE franchise's sell-through tapes, headed by a
// DIE-CUT CARDBOARD CHRISTMAS TREE that rises FLUSH out of the fixture top —
// no foot, no stick, nothing planted on the deck, the tree's bottom edge simply
// meets the fixture top — with the white franchise card (wordmark in heavy red
// slab caps, one red price line) MOUNTED ON THE TREE at mid-height, and a red
// gift tag cocked near the tip. Four parameters, one object:
//
//     fixture end + die-cut header + curated single-category stock + overlay
//
// ── 2026-07-30 OWNER CORRECTION ─────────────────────────────────────────────
// The card ON A STICK this module shipped in 64b049e was an INVENTION. Nothing
// in the photo is footed on the fixture top: re-read at 4-6x, the card hangs on
// the tree and the tree is what rises from the deck. The stick, its riser gap
// and its constants were removed 2026-07-30. There is no bare card-on-stick
// presentation anywhere in the app any more.
//
// Only the PARAMETERS are era-dated: the 1990 header FORMAT (white card, red
// slab caps, raised-cents price) ships as the `slab-1990` style, and
// `COLLECTION_HEADER_STYLE_BY_THEME` is the hook a later era's card format
// drops into (see below). The grammar itself is timeless retail — collection
// ends are attested across the chain's whole life — so this fixture is NOT
// theme-gated.
//
// ── Grammar note: the presentation is LIMITED to the attested composition ────
// One photo, one presentation. Until a second format is attested IN A PHOTO,
// every collection endcap in every theme wears exactly this Christmas kit —
// tree flush on the carcass, card on the tree, tag at the tip. That is the
// owner's ruling and it is deliberately narrow: a "generic" year-round header
// would be a format nothing measures, which is how the stick got invented in
// the first place. Adding a second presentation means adding a photo first.
//
// ── Architecture: a variant, not a second fixture ───────────────────────────
// A collection endcap IS a genre endcap with a different header and different
// stock curation — same carcass, same shelves, same slot geometry, same browse
// flow-through. So it subclasses GenreEndcap and overrides exactly the two
// things the photo shows differing (`buildHeader`, `coreMaterial`), instead of
// re-implementing a 350-line fixture that would then drift. Everything the
// scene keys on ("is this an endcap?") goes through `isEndcapKind` in
// genre-endcap.ts, so adding a third variant later touches this list and
// nothing else.
//
// ── Gating ──────────────────────────────────────────────────────────────────
// Media-server gated by CONSTRUCTION, the way the clasps are Jellyseerr-gated:
// the only source of `Movie.collectionName` is Jellyfin's BoxSet sync
// (jellyfin.ts `fetchCollectionMembership`) or the synthetic demo catalog. No
// collections in the library data => no qualifying collections => no
// placements => no fixtures. That is the correct outcome, not an error.
//
// ── Trademarks ──────────────────────────────────────────────────────────────
// The header is TYPESET, never licensed art: whatever the user's own Jellyfin
// BoxSet is called gets set in the era's face on the era's card. Nothing
// brand-bearing is committed — the demo/harness catalog ships invented
// collections ("SPY SAGA", "STARBOUND", "NIGHT PRECINCT", see demo-library.ts).
//
// Verify: `npm run shot -- --state colcap --out scratch/cc.png` (framed at the
// endcap, inventory on window.__colcaps), and
// `npm run shot -- --state endcapbrowse --title collection` for the browse
// flow-through onto one.
import * as THREE from 'three';
import { Movie } from '../jellyfin';
import { FixturePlacement, shelfTitleCompare } from '../store-layout';
import { FixtureContext } from '../fixtures';
import { markSignMesh } from '../sign-builders';
import { GenreEndcap, ENDCAP_CORE_DEPTH, ENDCAP_CORE_HEIGHT, ENDCAP_WIDTH, buildEndcapFooter } from './genre-endcap';
import { getActiveTheme, themeTrimDarkHex, type StoreTheme } from '../themes';
import { tryLoadUserAssetTexture, tryLoadUserSignArtTexture } from '../user-assets';
import type { StoreScene } from '../three-scene';
import { BB_BRUSH } from '../bundled-fonts';
import { inSeason } from '../promo-campaigns';

// ─── Selection tuning ───────────────────────────────────────────────────────
/**
 * A collection needs this many OWNED titles before it earns an aisle end. Four
 * is the point where a franchise reads as a franchise on a 9-slot endcap: at
 * three the top shelf is short and the thing looks like broken stock rather
 * than curation (the same judgement staff-picks makes with its MIN_PICKS).
 */
export const MIN_COLLECTION_TITLES = 4;
/**
 * Ceiling on collection endcaps per store. Run ends are a scarce resource that
 * the staff-picks genre endcaps also want, and a store whose every aisle end
 * is a franchise shrine stops reading as a video store. Two or three is what
 * the photos show.
 */
export const MAX_COLLECTION_ENDCAPS = 3;

/** The sell-through price line. Parametric — the 1990 card reads $19.99. */
export const DEFAULT_COLLECTION_PRICE = '$19.99';
export function collectionPriceToken(): string {
  try {
    return localStorage.getItem('bb_collection_price') || DEFAULT_COLLECTION_PRICE;
  } catch {
    return DEFAULT_COLLECTION_PRICE;
  }
}

// ─── Header styles: the era hook ────────────────────────────────────────────
/**
 * A header-card FORMAT. This is the era hook: the grammar (a card mounted on
 * the standee over the fixture, wordmark + price) is fixed, the format is
 * dated. Only `slab-1990` is built — it is the one format the corpus measures.
 * To add an
 * era, add a style here and point that theme at it in
 * COLLECTION_HEADER_STYLE_BY_THEME; nothing else in the app changes.
 *
 * Sketches for the formats the corpus has NOT yet measured, so the next agent
 * knows what the fields are for:
 *   • a 1993-fabric card would keep the portrait proportion but take the
 *     torn-ticket/blue-and-gold livery — `card` navy, `ink` gold, a
 *     `rule`d price band, `wordmarkFont` the condensed sans the 1993 signage
 *     uses (signage-catalog.ts), `raisedCents` still true.
 *   • a 2000s card goes landscape and loses the raised cents entirely
 *     (`raisedCents: false`, `aspect` > 1) — the price sits on one line with
 *     the wordmark, the way the PV drape-table rails do.
 * Neither ships: dating a format the photos don't show is invention, not
 * reconstruction.
 */
export interface CollectionHeaderStyle {
  id: string;
  /** Card width / card height. 1990: measured 0.615 off photo 2580265323. */
  aspect: number;
  /** Card stock. */
  card: string;
  /** Wordmark ink. */
  ink: string;
  /** Script-line + price ink; falls back to `ink` when absent. */
  accent?: string;
  /** Optional hairline under the wordmark (null on the 1990 card — it has none). */
  rule: string | null;
  wordmarkFont: (px: number) => string;
  priceFont: (px: number) => string;
  /** Optional script slogan between wordmark and price (the kit's own line). */
  scriptText?: string;
  scriptFont?: (px: number) => string;
  /** Script baseline as a fraction of card height. */
  scriptY?: number;
  /** `$19⁹⁹` (1990 sell-through convention) vs a flat `$19.99`. */
  raisedCents: boolean;
  /** Synthetic-bold stroke width as a fraction of type size (0 = none). */
  slabStroke: number;
  /** Baseline positions as a fraction of card height. */
  wordmarkY: number;
  priceY: number;
}

/**
 * The 1990 format, RE-measured 2026-07-30 off the kit's own generic card — the
 * "HITS / Priced to Own / FROM $19⁹⁵" instance in photo 2580265323 (crop
 * `620,980,300,330` @5x) — after the owner flagged the first pass's family and
 * weight as wrong. They were: the first pass read the BOND card, whose red
 * slab "BOND" is the licensed 007 franchise LOGO, not the kit face. The kit's
 * own typesetting is:
 *   • white portrait card, no border, no rule — 0.615 aspect (unchanged);
 *   • wordmark in ULTRA-HEAVY CONDENSED GROTESQUE caps, near-black navy ink,
 *     tight tracking, filling the card's top ~0.30 H (flat terminals, no
 *     serifs — Helvetica-Compressed-class), baseline ~0.42 H;
 *   • a red BRUSH-SCRIPT slogan "Priced to Own" under it with an underline
 *     swash, baseline ~0.55 H;
 *   • the red price line at ~0.80 H, raised $ and cents, small FROM allowed
 *     to lead it.
 * Reds: saturated core pixels balanced against the card white land at #C2242C.
 * Wordmark ink: the HITS letters sample near-neutral dark with a blue lean —
 * #23232E.
 */
const SLAB_1990: CollectionHeaderStyle = {
  id: 'slab-1990', // id kept for placement-option compat; the face is the kit grotesque
  aspect: 0.615,
  card: '#F4F1E8',
  // The measured kit ink, kept as the format's own record of what the photo
  // read. It is not what ships: houseHeaderStyle() overwrites `ink` with the
  // active brand's near-black before the card is ever painted.
  ink: '#23232E',
  accent: '#C2242C',
  rule: null,
  // Noto Sans Condensed Black is the closest installed face to the kit's
  // compressed grotesque (verified via fc-list on this box); the stack then
  // degrades through the narrow sans a desktop is likely to have. The small
  // synthetic-bold stroke (drawHeavy) keeps the weight on machines that
  // resolve only a regular condensed — sized so it cannot clog Black's
  // counters where the real face IS available.
  wordmarkFont: (px) => `900 ${px}px "Noto Sans Condensed Black", "Noto Sans Condensed", "Archivo Narrow", "Liberation Sans Narrow", "Arial Narrow", "Noto Sans", sans-serif`,
  priceFont: (px) => `900 ${px}px "Noto Sans Condensed Black", "Noto Sans Condensed", "Archivo Narrow", "Liberation Sans Narrow", "Arial Narrow", "Noto Sans", sans-serif`,
  scriptText: 'Priced to Own',
  // The kit's slogan is a CONNECTED BRUSH script — Brush-Script-MT class. The
  // stack that stood here asked for Segoe Script then Brush Script MT, neither
  // of which exists on this host or on a stock Linux box, so `cursive` decided
  // it and the slogan came out in Z003, a formal CHANCERY italic: a broad-nib
  // calligraphic hand, not a sign-painter's brush. Yellowtail (Astigmatic,
  // Apache-2.0, bundled) is the free face of the right class — a 1940s-style
  // retail brush script, connected, right-leaning, single weight. Weight 400
  // upright is deliberate: the face is already inclined and already brush
  // weight, so asking for italic/700 only buys synthetic slant and synthetic
  // bold on top of a design that has both.
  scriptFont: (px) => `400 ${px}px ${BB_BRUSH}, cursive`,
  scriptY: 0.55,
  raisedCents: true,
  /** Extra stem weight as a fraction of the type size (synthetic bold). */
  slabStroke: 0.02,
  wordmarkY: 0.42,
  priceY: 0.80,
};

export const COLLECTION_HEADER_STYLES: Record<string, CollectionHeaderStyle> = {
  [SLAB_1990.id]: SLAB_1990,
};

/**
 * Which header format each store fabric prints. Every theme currently prints
 * the 1990 card: the format is the only one the corpus attests, and a
 * collection end with no header is not the fixture. Re-point a theme here when
 * its own card format gets measured.
 */
export const COLLECTION_HEADER_STYLE_BY_THEME: Record<string, string> = {
  'bb-1990': 'slab-1990',
  'bb-1993': 'slab-1990',
  'bb-2000': 'slab-1990',
  'bb-2010': 'slab-1990',
  'hv-90s': 'slab-1990',
};

/**
 * Bind a header FORMAT to the active house.
 *
 * The format is measured (proportions, baselines, the raised cents); the
 * wordmark INK is livery and must follow the brand, the same way every other
 * sign in the store takes `palette.primary` / `palette.secondary` rather than a
 * literal. `#23232E` — the kit ink, a near-neutral dark with a blue lean — was
 * indistinguishable from the house near-black while the house was navy; against
 * an emerald room it read as the one unconverted piece on an otherwise
 * on-palette fixture. `themeTrimDarkHex` is the same derivation the baseboards
 * and sill caps use, so the card's wordmark is a deep shade of whatever the
 * brand is (and an installed brand pack reaches it for free).
 *
 * What deliberately does NOT follow the palette: the card stock (white is
 * paper, not livery) and the slogan/price red, which is the retail sale-red
 * every sell-through card of the era printed regardless of the chain's own
 * colors. Retinting those would be reading "palette-driven" as "monochrome".
 */
export function houseHeaderStyle(
  style: CollectionHeaderStyle,
  theme: StoreTheme = getActiveTheme(),
): CollectionHeaderStyle {
  return {
    ...style,
    ink: themeTrimDarkHex(theme),
    // The optional hairline is trim, so it takes the trim color; a format that
    // declares no rule still declares none.
    rule: style.rule ? theme.palette.secondary : null,
  };
}

export function collectionHeaderStyleFor(themeId: string): CollectionHeaderStyle {
  const base = COLLECTION_HEADER_STYLES[COLLECTION_HEADER_STYLE_BY_THEME[themeId] ?? 'slab-1990'] ?? SLAB_1990;
  return houseHeaderStyle(base, getActiveTheme());
}

// ─── Header art ─────────────────────────────────────────────────────────────
/** "Spy Saga Collection" -> "SPY SAGA" (Jellyfin/TMDB box sets carry the suffix). */
export function collectionWordmark(name: string): string {
  return name.replace(/\s+collection$/i, '').trim().toUpperCase();
}

/**
 * The header card, drawn from the collection NAME. Brand-free by construction:
 * this is typesetting, not licensed art — a trademarked box-set name is the
 * user's own data on the user's own screen, and nothing trademarked is
 * committed (see the module header).
 */
export function createCollectionHeaderTexture(
  name: string,
  price: string,
  style: CollectionHeaderStyle = SLAB_1990,
): THREE.CanvasTexture {
  const W = 512;
  const H = Math.round(W / style.aspect);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d')!;

  c.fillStyle = style.card;
  c.fillRect(0, 0, W, H);

  const word = collectionWordmark(name) || 'COLLECTION';
  const inset = W * 0.06;
  const maxW = W - inset * 2;

  // Fit the wordmark to the card's WIDTH, the way the 1990 card sets a
  // four-letter franchise nearly edge to edge; the ceiling only stops a
  // two-letter name from becoming a poster. A multi-word name that would have
  // to be set small on one line breaks onto two instead — bigger type beats a
  // single line on a card read from six feet away.
  const fitSize = (text: string, ceiling: number): number => {
    c.font = style.wordmarkFont(ceiling);
    const w = c.measureText(text).width;
    return Math.max(12, w > maxW ? Math.floor(ceiling * (maxW / w)) : ceiling);
  };
  let lines = [word];
  const oneLine = fitSize(word, H * 0.30);
  if (oneLine < H * 0.15 && word.includes(' ')) {
    // Break at the word boundary nearest the middle so the two lines balance.
    const words = word.split(/\s+/);
    let best = 1, bestDelta = Infinity;
    for (let i = 1; i < words.length; i++) {
      const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
      if (d < bestDelta) { bestDelta = d; best = i; }
    }
    lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
  }
  const ceiling = H * (lines.length > 1 ? 0.19 : 0.30);
  const size = Math.min(...lines.map((l) => fitSize(l, ceiling)));

  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  const lineH = size * 1.06;
  const blockTop = H * style.wordmarkY - (lines.length - 1) * lineH;
  lines.forEach((line, i) => {
    c.font = style.wordmarkFont(size);
    drawHeavy(c, line, W / 2, blockTop + i * lineH, size, style);
  });

  if (style.rule) {
    c.fillStyle = style.rule;
    c.fillRect(inset, H * (style.wordmarkY + 0.06), maxW, Math.max(2, H * 0.006));
  }

  // The kit's script slogan, with the underline swash the photo shows: a
  // shallow arc kicking up at its right end, sitting a hair under the baseline.
  if (style.scriptText && style.scriptFont && style.scriptY) {
    const accent = style.accent ?? style.ink;
    const scriptCeil = H * 0.085;
    c.font = style.scriptFont(scriptCeil);
    const w = c.measureText(style.scriptText).width;
    const px = w > maxW ? Math.floor(scriptCeil * (maxW / w)) : scriptCeil;
    c.font = style.scriptFont(px);
    c.fillStyle = accent;
    const sy = H * style.scriptY;
    c.fillText(style.scriptText, W / 2, sy);
    const sw = c.measureText(style.scriptText).width;
    c.strokeStyle = accent;
    c.lineWidth = Math.max(2, px * 0.055);
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(W / 2 - sw * 0.52, sy + px * 0.28);
    c.quadraticCurveTo(W / 2 + sw * 0.10, sy + px * 0.46, W / 2 + sw * 0.56, sy + px * 0.10);
    c.stroke();
  }

  drawPrice(c, price, W / 2, H * style.priceY, H * 0.125, style);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Set one run of type at the style's slab weight: fill plus a matching stroke,
 * which fattens every stem by the same amount whatever face the machine
 * actually resolved. Without it the card comes out in whatever book weight the
 * fallback serif has, and a 1990 header card is not a book weight.
 */
function drawHeavy(
  c: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  style: CollectionHeaderStyle,
  ink: string = style.ink,
): void {
  c.fillStyle = ink;
  if (style.slabStroke > 0) {
    c.strokeStyle = ink;
    c.lineWidth = size * style.slabStroke;
    c.lineJoin = 'round';
    c.miterLimit = 2;
    c.strokeText(text, x, y);
  }
  c.fillText(text, x, y);
}

/**
 * `$19⁹⁹` — the 1990 sell-through price form: a small raised dollar sign, a
 * full-height numeral, and the cents set small along the cap line. Falls back
 * to a flat single-run string for formats whose style says so.
 */
function drawPrice(
  c: CanvasRenderingContext2D,
  price: string,
  cx: number,
  baseline: number,
  size: number,
  style: CollectionHeaderStyle,
): void {
  const m = /^(\D*)(\d+)(?:[.,](\d+))?(.*)$/.exec(price.trim());
  const ink = style.accent ?? style.ink;   // the kit prints its price in red
  c.fillStyle = ink;
  c.textBaseline = 'alphabetic';
  if (!m || !style.raisedCents) {
    c.textAlign = 'center';
    c.font = style.priceFont(size);
    drawHeavy(c, price, cx, baseline, size, style, ink);
    return;
  }
  const [, sym, whole, cents = '', tail] = m;
  const small = size * 0.5;
  c.textAlign = 'left';
  c.font = style.priceFont(small);
  const symW = sym ? c.measureText(sym).width : 0;
  const centsW = cents ? c.measureText(cents).width : 0;
  const tailW = tail ? c.measureText(tail).width : 0;
  c.font = style.priceFont(size);
  const wholeW = c.measureText(whole).width;
  let x = cx - (symW + wholeW + centsW + tailW) / 2;
  if (sym) {
    c.font = style.priceFont(small);
    drawHeavy(c, sym, x, baseline - size * 0.52, small, style, ink);
    x += symW;
  }
  c.font = style.priceFont(size);
  drawHeavy(c, whole, x, baseline, size, style, ink);
  x += wholeW;
  if (cents) {
    c.font = style.priceFont(small);
    drawHeavy(c, cents, x, baseline - size * 0.52, small, style, ink);
    x += centsW;
  }
  if (tail) {
    c.font = style.priceFont(small);
    drawHeavy(c, tail, x, baseline, small, style, ink);
  }
}

// ─── Slatwall face ──────────────────────────────────────────────────────────
// The 1990 endcap is REAL slatwall (horizontal slat grooves, the same part as
// the head-cleaner sidekick two units left in the same frame), not the flat
// pegboard panel the staff-picks endcap wears. One shared 4x64 stripe texture
// tiled up the panel: no extra geometry, no extra draw call, and the same
// texture serves every collection endcap in the store.
const SLAT_PITCH_FT = 3 / 12; // 3 in on centre, the standard slatwall pitch
let slatTexture: THREE.Texture | null = null;
function getSlatTexture(): THREE.Texture {
  if (slatTexture) return slatTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 64;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, 4, 64);
  c.fillStyle = '#cfcfcf';      // slat lip catching the room light
  c.fillRect(0, 44, 4, 3);
  c.fillStyle = '#6e6e6e';      // the kerf itself, in shadow
  c.fillRect(0, 47, 4, 8);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, ENDCAP_CORE_HEIGHT / SLAT_PITCH_FT);
  slatTexture = tex;
  return tex;
}

// ─── Christmas-tree standee: measured off photo 2580265323 ──────────────────
// Method (sign-lab pipeline, .claude/skills/match-real-asset/SKILL.md): every
// number below comes from gridded magick crops of the ORIGINAL 2721x4153 scan
// at 2-6x, read against a 25/50 px coordinate lattice, on the CHECKOUT-TOWER
// tree (`2180,700,360,600`) — the only instance that is simultaneously
// face-on (its two edge slopes agree to 3%: -0.240 left, +0.2485 right, and
// its silhouette centre is vertical at x=2359 +/-1 over 400 px), fully based
// (green meets the blue deck at y=1292 with NO foot, NO stick, NO plinth), and
// unoccluded down both flanks. The nearer "HITS" tree cross-checks every
// ratio; the BOND tree is too chewed by the door mullion and the window
// reflections behind it to fit independently.
//
//   • ENVELOPE     apex y=719 (extrapolated from the fitted edges; green IS
//                  visible above the tag at y~700, so the tip really does
//                  clear it), base y=1292, base width 280 px.
//                  => height 573 px, W/H = 280/573 = 0.489. The HITS tree
//                  agrees: half-width 144 px at y=1082 with base y=1340 puts
//                  its apex at 480 and its base width at 421 => 0.49.
//   • SIDES        half-slope 0.2445 px/px = 13.7 deg off vertical.
//   • DIE-CUT      the edges are finely PINKED, not big stepped tiers: ~26
//                  sawteeth per edge, pitch ~22 px (0.038 H), amplitude ~9 px
//                  (0.016 H). The "tier" read in the crops is the GARLAND
//                  diagonals, not a silhouette step.
//   • GARLAND      6 dotted bead strings, vertical pitch ~85-90 px (0.15 H),
//                  rising to the RIGHT at 12-15 deg (crossings logged on both
//                  flanks); bead d ~8 px (0.014 H) at ~13 px pitch (0.023 H).
//   • ORNAMENTS    round, d 17-18 px = 0.061 W = 0.030 H, ~65 of them, in
//                  crimson / orange / pale blue / pink / cream-yellow.
//   • COLOUR       tree field samples (99,124,83) against the HITS card's own
//                  white (246,245,239) — a near-neutral local illuminant, so
//                  the grey-world balance is nearly a no-op: (103,129,89) =
//                  #678159. Committed a shade deeper/greener on the same
//                  reasoning the card ink uses (17 years of dye fade reads
//                  lighter than the press sheet).
//   • FIXTURE FIT  tree base 280 px vs the deck it stands on 317 px (blue
//                  detected 2203..2520 at y=1300) => 0.88 of the fixture's
//                  top width. Measured on the same object at the same depth,
//                  so this ratio survives the absolute-scale uncertainty.
//
// LOW CONFIDENCE, and deliberately not used: absolute inches. The only
// same-depth anchors are the Scotch head-cleaner box (~4.4 x 7.75 in => the
// tree is ~11 x 22 in) and the tower's own height (=> ~20 x 42 in); they
// disagree by 2x and the photo gives no third anchor, so the build scales off
// the carcass instead, which is what the fixture-fit ratio is for.
const TREE_W_FRAC = 0.88;     // tree base width / carcass width (measured)
// tree width / tree height. Its half, 0.245, IS the fitted flank slope 0.2445
// — the two measurements are the same measurement and agree to within a pixel.
const TREE_ASPECT = 0.49;
const TREE_TEETH = 26;        // sawteeth per flank (pitch 0.038 H)
const TREE_TOOTH_AMP = 0.016; // tooth depth as a fraction of tree HEIGHT
const TREE_GARLANDS = 6;
const TREE_GARLAND_DEG = 13;  // rising to the right
const TREE_ORNAMENTS = 72;

// ─── Red gift tag ───────────────────────────────────────────────────────────
// Measured on the HITS tree's tag (`660,600,250,150`), the most face-on of the
// three: 225 x 118 px => aspect 1.90; width 0.52 of that tree's 431 px base
// (the checkout tree's tag gives 135/280 = 0.48 — call it half the tree width).
// Vertically it straddles the UPPER FLANK, not the point: its centre sits
// 0.833 H (checkout tree) / 0.753 H (HITS) above the base and its top edge is
// ~0.17 H BELOW the tip, which is why green shows above it in both crops.
// TILT is the one number that fights the brief: measured 0 deg on the checkout
// tree and +4.2..+5.0 deg on the HITS tree (top edge, bottom edge and both
// text baselines all agree), against an eyeballed 12-15 deg. The tag is
// hand-hung so it genuinely varies; 8 deg is the measured spread's top plus a
// little, enough to read as "cocked" from six feet without out-running the
// evidence.
// Red samples (196,94,91), balanced on the same white to (203,98,97) =
// #CB6261, opened toward press red the way the card ink is.
const TAG_W_FRAC = 0.50;      // tag width / tree base width
const TAG_ASPECT = 1.90;      // tag width / tag height
const TAG_Y_FRAC = 0.79;      // tag centre height above the tree base / tree H
const TAG_X_FRAC = 0.055;     // tag centre right of the tree axis / tree W
const TAG_TILT = (-8 * Math.PI) / 180; // negative Z = clockwise on screen

// ─── Header-card geometry (feet) ────────────────────────────────────────────
// 8 x 13 in card at the measured 0.615 aspect — in frame it stands about a
// third of the fixture's width, and 8 in of a 26 in endcap is that third. The
// card is NOT scaled with the tree: it is a real 8 x 13 in printed card and
// stays one whatever the carcass is.
const CARD_W = 8 / 12;
const CARD_H = CARD_W / SLAB_1990.aspect;
const CARD_T = 0.03;
// Where it hangs ON the tree. Both legible instances put the card centre at
// 0.30 of the tree height above the base (HITS: (1340-1082.5)/860 = 0.299;
// BOND: 123/~410 = 0.30) and a whisker right of the tree axis (HITS +0.02 W,
// BOND +0.09 W once the mullion is allowed for — 0.055 splits them). Tilt is
// ~2 deg clockwise on both (card edges vs the frame verticals), which is what
// "looks near-vertical" measures to.
//
// NOTE on the "straddles the serrated edge" read: it does in the photo, and it
// does NOT here, on purpose. In the photo the card is HALF the tree's width,
// because that tree stands on a ~14-20 in wedge tower; scaled to a 26 in
// endcap the same tree makes the true-size 8 in card only 0.31 of its width,
// so the card sits inside the foliage instead of hanging off it. Keeping the
// card honest (8 x 13 in) and the tree honest (bottom tier ~ carcass width)
// costs the overhang; faking either to buy it back would be the stick again.
const CARD_ON_TREE_H = 0.30;
// Centred on the tree axis — owner ruling 2026-07-30. The HITS instance
// measures +0.02 W (≈ centred); the +0.09 W BOND read that pulled the split
// to +0.055 is the one instance skewed by the door mullion. Centred is both
// the ruling and the better-attested number.
const CARD_ON_TREE_X = 0;
const CARD_TILT = (-2 * Math.PI) / 180;

// ─── Die-cut art (procedural, brand-free, committed) ────────────────────────
// One shared texture per face for the whole store: every collection endcap
// wears the identical kit sheet, so these are module-level and never disposed
// per fixture — same contract as the slat texture above. Four canvases total
// (tree front/back, tag front/back), built lazily on first use.
//
// The BACK faces are drawn MIRRORED because the back plane is spun 180 deg
// about Y (the membership-oval-hanger pattern): without the mirror the alpha
// cut would be the silhouette's reflection and the two faces' pinked edges
// would not line up.
//
// The TREE is printed on BOTH sides — owner ruling 2026-07-30, "the tree
// should be visible from both sides". 'tree-front-back' is the green art run
// through that same back-mirror pass, so the two green faces' pinked die-cuts
// stay registered tooth-for-tooth. 'tree-back' (plain kraft) is retired for
// the standee but the drawKraftBack pass stays: the TAG keeps the real kit's
// asymmetry — red print to the interior, bare kraft to the walkway — because
// the tag is a small stapled-on piece, not the sign people read from across
// the store.
type KitFace = 'tree-front' | 'tree-front-back' | 'tag-front' | 'tag-back';
const kitTextures = new Map<KitFace, THREE.Texture>();

/** Deterministic 32-bit PRNG — the kit sheet must be byte-identical every boot. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/**
 * The pinked tree silhouette, in texture space (apex at top centre, base edge
 * along the bottom). Half-slope and tooth pitch/depth are the measured ones.
 */
function treeSilhouette(c: CanvasRenderingContext2D, W: number, H: number): void {
  const amp = H * TREE_TOOTH_AMP;
  // The canvas is cut to the tree's own aspect, so the envelope's half-width
  // at the base IS W/2 and TREE_HALF_SLOPE falls out of W/H — asserted here
  // rather than re-derived, so a change to either constant stays consistent.
  const half = (y: number) => (W / 2) * (y / H);
  c.beginPath();
  c.moveTo(W / 2, 0);
  // Right flank, apex -> base: each tooth kicks out and drops back onto the
  // envelope, which is what a pinking-shear die reads as at this scale.
  for (let i = 0; i < TREE_TEETH; i++) {
    const y0 = (H * i) / TREE_TEETH, y1 = (H * (i + 1)) / TREE_TEETH;
    c.lineTo(W / 2 + half(y0) + amp, y0 + (y1 - y0) * 0.62);
    c.lineTo(W / 2 + half(y1), y1);
  }
  c.lineTo(W / 2 - half(H), H);              // flush base edge
  for (let i = TREE_TEETH - 1; i >= 0; i--) { // left flank, base -> apex
    const y0 = (H * i) / TREE_TEETH, y1 = (H * (i + 1)) / TREE_TEETH;
    c.lineTo(W / 2 - half(y0) - amp, y0 + (y1 - y0) * 0.62);
    c.lineTo(W / 2 - half(y0), y0);
  }
  c.closePath();
}

/** The gift tag: half-round left end (the string end), clipped right corners. */
function tagSilhouette(c: CanvasRenderingContext2D, W: number, H: number): void {
  const r = H / 2, notch = W * 0.055;
  c.beginPath();
  c.moveTo(r, 0);
  c.lineTo(W - notch, 0);
  c.lineTo(W, notch * TAG_ASPECT * 0.5);
  c.lineTo(W, H - notch * TAG_ASPECT * 0.5);
  c.lineTo(W - notch, H);
  c.lineTo(r, H);
  c.arc(r, H / 2, r, Math.PI / 2, -Math.PI / 2);
  c.closePath();
}

/** Kraft board: flat stock plus a faint flute mottle, cut to the silhouette. */
function drawKraftBack(
  c: CanvasRenderingContext2D, W: number, H: number,
  path: (c: CanvasRenderingContext2D, W: number, H: number) => void,
): void {
  path(c, W, H);
  c.fillStyle = '#B9996A';
  c.fill();
  c.save();
  c.clip();
  const rng = makeRng(0x5EED1);
  c.strokeStyle = 'rgba(120,94,58,0.16)';
  c.lineWidth = Math.max(1, H * 0.003);
  for (let y = 0; y < H; y += Math.max(3, H * 0.012)) {
    c.beginPath();
    c.moveTo(0, y + rng() * 2);
    c.lineTo(W, y + rng() * 2);
    c.stroke();
  }
  c.restore();
}

/** The printed tree face: field, needles, bead garland, ball ornaments. */
function drawTreeFront(c: CanvasRenderingContext2D, W: number, H: number): void {
  treeSilhouette(c, W, H);
  const grad = c.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#5F8551');   // the balanced sample, #678159, at the top
  grad.addColorStop(1, '#476E42');   // deeper toward the base, as printed
  c.fillStyle = grad;
  c.fill();
  c.save();
  c.clip();

  const rng = makeRng(0x1990C);
  const half = (y: number) => (W / 2) * (y / H);
  // The garland rows are also the TIER rows: on the real board each string
  // runs along the bottom of a printed tier and the board goes a shade darker
  // just above the next one down. Without that banding the die reads as one
  // flat green triangle, which is the one thing the crops never look like.
  const slope = Math.tan((TREE_GARLAND_DEG * Math.PI) / 180);
  const rowY = (g: number) => (H * (g + 0.15)) / (TREE_GARLANDS + 1);
  for (let g = 1; g <= TREE_GARLANDS; g++) {
    const y = rowY(g);
    const band = H * 0.055;
    const grad2 = c.createLinearGradient(0, y - band, 0, y + band * 0.25);
    grad2.addColorStop(0, 'rgba(30,54,28,0.00)');
    grad2.addColorStop(1, 'rgba(30,54,28,0.20)');
    c.fillStyle = grad2;
    c.save();
    c.translate(W / 2, y);
    c.rotate(-Math.atan(slope));
    c.fillRect(-W, -band, W * 2, band * 1.25);
    c.restore();
  }
  // Needle ticks: the short light/dark strokes that give the flat field its
  // "foliage" read at six feet. Cheap, and the only thing between the garland
  // rows on the real board.
  for (let i = 0; i < 900; i++) {
    const y = rng() * H;
    const x = W / 2 + (rng() * 2 - 1) * half(y);
    const a = (rng() * 2 - 1) * 1.1;
    const len = H * (0.006 + rng() * 0.008);
    c.strokeStyle = rng() < 0.5 ? 'rgba(140,170,120,0.30)' : 'rgba(48,78,44,0.34)';
    c.lineWidth = Math.max(1, H * 0.0016);
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    c.stroke();
  }

  // Bead garland: dotted strings running up to the right, six of them, at the
  // measured vertical pitch. Drawn as discrete beads, not a dashed line — at
  // this scale the gaps are as legible as the beads.
  const beadD = H * 0.014, beadPitch = H * 0.023;
  for (let g = 1; g <= TREE_GARLANDS; g++) {
    const yAtCentre = rowY(g);
    for (let x = -W; x < W * 2; x += beadPitch) {
      const y = yAtCentre + (W / 2 - x) * slope;
      if (y < 0 || y > H) continue;
      if (Math.abs(x - W / 2) > half(y)) continue;
      c.fillStyle = 'rgba(246,244,232,0.92)';
      c.beginPath();
      c.arc(x, y, beadD / 2, 0, Math.PI * 2);
      c.fill();
    }
  }

  // Ball ornaments, rejection-sampled inside the die with a margin so none
  // straddles a pinked tooth. Palette weighted the way the crops count them:
  // reds and oranges carry the field, the pale blue/pink/cream are accents.
  const BALLS = [
    '#C0392B', '#C0392B', '#A8232B', '#E08A2E', '#E08A2E', '#D9752A',
    '#9FC4DE', '#E0A9BE', '#EBD98C', '#D4718A',
  ];
  const r = (W * 0.061) / 2;
  for (let i = 0, tries = 0; i < TREE_ORNAMENTS && tries < TREE_ORNAMENTS * 40; tries++) {
    const y = H * (0.06 + rng() * 0.92);
    const x = W / 2 + (rng() * 2 - 1) * (half(y) - r * 1.4);
    if (Math.abs(x - W / 2) > half(y) - r * 1.2) continue;
    const col = BALLS[Math.floor(rng() * BALLS.length)];
    c.fillStyle = col;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.30)';   // the one print highlight each ball carries
    c.beginPath();
    c.arc(x - r * 0.30, y - r * 0.32, r * 0.22, 0, Math.PI * 2);
    c.fill();
    i++;
  }
  c.restore();
}

/**
 * The red gift tag. The SLOGAN is generic retail copy ("give the gift of
 * entertainment for the holidays") and is fine to commit; the campaign's own
 * lettering, ornament vignette and exact tag die are trademarked art and
 * belong in public/user-assets/, not here.
 */
function drawTagFront(c: CanvasRenderingContext2D, W: number, H: number): void {
  tagSilhouette(c, W, H);
  c.fillStyle = '#CE2027';
  c.fill();
  c.save();
  c.clip();
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  const cx = W * 0.54;
  // FIT, don't guess: "OF ENTERTAINMENT" set at the measured cap height (0.17
  // of the tag height) overruns a 512 px sheet in whatever grotesque the
  // machine actually resolves, and an overrunning line prints outside the
  // die-cut. Both caps lines take the size the LONGER one can carry, which is
  // also how the photo's tag is set — the two lines are optically the same
  // width, edge to edge.
  const maxW = W * 0.88;
  const capsFont = (px: number) =>
    `800 ${px}px "Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif`;
  const fit = (text: string, ceiling: number, font: (px: number) => string): number => {
    c.font = font(ceiling);
    const w = c.measureText(text).width;
    return w > maxW ? Math.floor(ceiling * (maxW / w)) : ceiling;
  };
  const caps = Math.min(
    fit('GIVE THE GIFT', H * 0.20, capsFont),
    fit('OF ENTERTAINMENT', H * 0.20, capsFont)
  );
  c.fillStyle = '#FFFFFF';
  c.font = capsFont(caps);
  c.fillText('GIVE THE GIFT', cx, H * 0.42);
  c.fillText('OF ENTERTAINMENT', cx, H * 0.64);
  const scriptFont = (px: number) =>
    `400 ${px}px ${BB_BRUSH}, cursive`;
  c.fillStyle = '#E8C24A';
  c.font = scriptFont(fit('for the holidays', H * 0.16, scriptFont));
  c.fillText('for the holidays', cx, H * 0.85);
  // Two small white snowflake dots, d ~0.107 of the tag width, at the measured
  // corners (upper-left inside the round end, and centre-right).
  const d = W * 0.107;
  for (const [u, v] of [[0.124, 0.305], [0.827, 0.407]] as const) {
    const x = u * W, y = v * H;
    c.fillStyle = 'rgba(255,255,255,0.95)';
    c.beginPath();
    c.arc(x, y, d * 0.30, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.95)';
    c.lineWidth = Math.max(1, d * 0.10);
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI) / 3;
      c.beginPath();
      c.moveTo(x - Math.cos(a) * d * 0.5, y - Math.sin(a) * d * 0.5);
      c.lineTo(x + Math.cos(a) * d * 0.5, y + Math.sin(a) * d * 0.5);
      c.stroke();
    }
  }
  c.restore();
}

// ─── The footer ribbon dressing ─────────────────────────────────────────────
// Photo 2580265323, fixture bases (crops `2150,1500,600,900` + `1750,1900,
// 700,800`): the kit paints the plinth GREEN (holiday field, sampled and
// balanced to #4E9153) and wraps it in the same red GIVE-THE-GIFT ribbon the
// tree tag carries — a thin horizontal "string" band with a fat diagonal
// banner over it, pennant point on the left, swallowtail notch on the right,
// two white ball ornaments at the point. Band height ~5.4 in of the ~15.6 in
// face, rising ~10 deg to the right. Same generic-slogan rule as the tag: the
// copy is committed, the campaign's own art belongs in user-assets.
const FOOTER_GREEN = '#4E9153';
function drawFooterRibbon(c: CanvasRenderingContext2D, W: number, H: number): void {
  c.fillStyle = FOOTER_GREEN;
  c.fillRect(0, 0, W, H);
  // Bottom-edge shade so the plinth reads as a body, not a flat decal.
  const shade = c.createLinearGradient(0, H * 0.8, 0, H);
  shade.addColorStop(0, 'rgba(20,40,22,0)');
  shade.addColorStop(1, 'rgba(20,40,22,0.25)');
  c.fillStyle = shade;
  c.fillRect(0, H * 0.8, W, H * 0.2);

  // The "string": the thin band the ribbon rides on, running the full face.
  c.fillStyle = '#A8181F';
  c.fillRect(0, H * 0.44, W, H * 0.10);

  // The banner, in the band's own rotated frame.
  c.save();
  c.translate(W * 0.52, H * 0.47);
  c.rotate((-10 * Math.PI) / 180);
  const bw = W * 0.86, bh = H * 0.36;
  c.beginPath();
  c.moveTo(-bw / 2, -bh / 2);            // pennant point cut into the left end
  c.lineTo(-bw / 2 + bh * 0.55, 0);
  c.lineTo(-bw / 2, bh / 2);
  c.lineTo(bw / 2, bh / 2);              // swallowtail notch on the right end
  c.lineTo(bw / 2 - bh * 0.45, 0);
  c.lineTo(bw / 2, -bh / 2);
  c.closePath();
  c.fillStyle = '#CE2027';
  c.fill();
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  const capsFont = (px: number) =>
    `800 ${px}px "Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif`;
  const fit = (text: string, ceiling: number): number => {
    c.font = capsFont(ceiling);
    const w = c.measureText(text).width;
    return w > bw * 0.66 ? Math.floor(ceiling * ((bw * 0.66) / w)) : ceiling;
  };
  const caps = Math.min(fit('GIVE THE GIFT', bh * 0.30), fit('OF ENTERTAINMENT', bh * 0.30));
  c.fillStyle = '#FFFFFF';
  c.font = capsFont(caps);
  c.fillText('GIVE THE GIFT', bh * 0.10, -bh * 0.08);
  c.fillText('OF ENTERTAINMENT', bh * 0.10, bh * 0.24);
  c.fillStyle = '#E8C24A';
  c.font = `400 ${Math.round(bh * 0.20)}px ${BB_BRUSH}, cursive`;
  c.fillText('for the holidays', bh * 0.10, bh * 0.44);
  // Ornament pair at the pennant point.
  for (const [dx, dy, r] of [[-bw / 2 + bh * 0.42, -bh * 0.18, bh * 0.15], [-bw / 2 + bh * 0.62, bh * 0.12, bh * 0.11]] as const) {
    c.fillStyle = '#F4F1E8';
    c.beginPath();
    c.arc(dx, dy, r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(35,35,46,0.35)';
    c.fillRect(dx - r * 0.18, dy - r * 1.28, r * 0.36, r * 0.35);
  }
  c.restore();
}

/** Shared kit sheet for one face; built once, never disposed per fixture. */
function getKitTexture(face: KitFace): THREE.Texture {
  const cached = kitTextures.get(face);
  if (cached) return cached;
  const isTree = face.startsWith('tree');
  const W = 512;
  const H = Math.round(W / (isTree ? TREE_ASPECT : TAG_ASPECT));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d')!;
  const back = face.endsWith('back');
  if (back) { c.translate(W, 0); c.scale(-1, 1); }  // see the kitTextures note
  // Both tree faces take drawTreeFront; 'tree-front-back' differs only in that
  // it went through the mirror above, which is exactly what keeps the two
  // pinked silhouettes registered when the back plane is spun.
  if (face === 'tree-front' || face === 'tree-front-back') drawTreeFront(c, W, H);
  else if (face === 'tag-front') drawTagFront(c, W, H);
  else drawKraftBack(c, W, H, tagSilhouette);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  kitTextures.set(face, tex);
  return tex;
}

export class CollectionEndcap extends GenreEndcap {
  /** The collection this end is dedicated to (raw Jellyfin BoxSet name). */
  public collectionName: string;
  private headerTex: THREE.Texture | null = null;
  private coreTex: THREE.Texture | null = null;
  /** Only set when a user-asset tree skin actually landed (see buildHeader). */
  private treeArtTex: THREE.Texture | null = null;
  /** Its mirrored twin for the tree's BACK plane — this fixture owns both. */
  private treeArtBackTex: THREE.Texture | null = null;

  constructor(placement: FixturePlacement, ctx: FixtureContext) {
    super(placement, ctx);
    const opts = placement.options || {};
    this.collectionName =
      typeof opts.collection === 'string' ? (opts.collection as string) : this.genre;
  }

  /** The kit's green plinth is not optional here — buildHeader always builds it. */
  protected override hasFooter(): boolean {
    return true;
  }

  /** Slatwall (in the theme's own color) rather than flat pegboard — see the
   *  slat-texture note. */
  protected override coreMaterial(primary: string | number): THREE.Material {
    this.coreTex = getSlatTexture();
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(primary as any),
      map: this.coreTex,
      roughness: 0.7,
      metalness: 0.05,
    });
  }

  /**
   * The attested 1990 composition: die-cut Christmas tree flush on the carcass,
   * the white franchise card mounted on it, the red gift tag cocked near the
   * tip. Two drop-in art hooks, both silent-404:
   *   • the CARD keeps the sign-art rule —
   *     `public/user-assets/signs/collection-header-<slug>/…png` replaces the
   *     typeset card for one collection (see user-assets/README.md);
   *   • the TREE takes `fixtures/xmas-tree-standee/front.png`, which is where
   *     the faithful campaign skin belongs (alpha then comes from the PNG).
   */
  protected override buildHeader(coreWidth: number, coreHeight: number, coreDepth: number): void {
    if (!this.group) return;
    const price =
      typeof this.placement.options?.price === 'string'
        ? (this.placement.options.price as string)
        : collectionPriceToken();
    const styleId =
      typeof this.placement.options?.headerStyle === 'string'
        ? (this.placement.options.headerStyle as string)
        : undefined;
    // Either route ends at houseHeaderStyle: a placement that names a format
    // explicitly still prints it in the active house's ink.
    const named = styleId ? COLLECTION_HEADER_STYLES[styleId] : undefined;
    const style = named ? houseHeaderStyle(named) : collectionHeaderStyleFor(getActiveTheme().id);

    // ── The footer plinth, ribbon-dressed ───────────────────────────────────
    // The kit's green base with the GIVE-THE-GIFT ribbon — the same plinth
    // GenreEndcap arms via `options.footer` for its plain 80s form, dressed
    // here because a collection end IS the kit (photo 2580265323, both bases).
    this.footerTex = buildEndcapFooter(this.group, coreWidth, coreDepth, {
      color: FOOTER_GREEN,
      dressFront: drawFooterRibbon,
    });

    // ── The tree, FLUSH on the carcass ──────────────────────────────────────
    // Bottom edge at y = coreHeight exactly: no riser, no foot, nothing planted
    // on the deck. That flush join is the whole correction.
    const treeW = coreWidth * TREE_W_FRAC;
    const treeH = treeW / TREE_ASPECT;
    // BACK edge of the deck — owner correction 2026-07-30, and what all three
    // photo instances show: the tree rises from the far edge with the stock in
    // front of it, art (and card) facing the walkway. Kept just inside the
    // carcass footprint so the plane never pokes into the aisle run behind.
    const treeZ = -coreDepth / 2 + 0.03;
    const treeGeo = new THREE.PlaneGeometry(treeW, treeH);
    // Die-cut honesty: without transparent + alphaTest the cut-away field
    // renders as an opaque rectangle around the tree. alphaTest (not blending
    // alone) also keeps it out of the transparent sort, which a fixture this
    // big would otherwise fight the case rows over.
    const treeMat = new THREE.MeshStandardMaterial({
      map: getKitTexture('tree-front'),
      transparent: true, alphaTest: 0.5, roughness: 0.85, metalness: 0.0,
    });
    // GREEN on the back plane too (owner ruling 2026-07-30) — the standee is
    // read from the outer walkway as often as from the aisle, and the kraft
    // reverse made that half of the store look at the back of a cardboard box.
    // Slightly rougher than the front only because it is the shaded side.
    const treeBackMat = new THREE.MeshStandardMaterial({
      map: getKitTexture('tree-front-back'),
      transparent: true, alphaTest: 0.5, roughness: 0.9, metalness: 0.0,
    });
    // Back-to-back pair sharing one geometry (the membership-oval-hanger
    // pattern): the tree is read from across the store as often as from the
    // aisle, and a lone double-sided quad would print the tree mirrored at
    // everyone behind it. markSignMesh's default casts:false — an alpha-cut
    // card throws its full rectangle's silhouette in the static shadow bake.
    //
    // The whole tree+tag sub-kit rides one group spun 180 deg — owner ruling
    // 2026-07-30: the GREEN face (and its tag) shows to the store interior,
    // where people browse; the kraft back shows to the outer walkway, which
    // is where the white collection card mounts (centred, below). The kit
    // pieces really were independent staples on cardboard, so splitting card
    // from art across the two faces is deployment, not invention.
    const kit = new THREE.Group();
    kit.position.set(0, 0, treeZ);
    kit.rotation.y = Math.PI;
    this.group.add(kit);
    for (const dz of [0.006, -0.006]) {
      const face = markSignMesh(new THREE.Mesh(treeGeo, dz > 0 ? treeMat : treeBackMat));
      face.position.set(0, coreHeight + treeH / 2, dz);
      if (dz < 0) face.rotation.y = Math.PI;
      kit.add(face);
    }
    // Faithful campaign art drops in here, off the repo (silent 404 = the
    // procedural tree stays up). Alpha then comes from the PNG.
    tryLoadUserAssetTexture('fixtures/xmas-tree-standee/front.png', (artTex) => {
      // The fetch outlives a theme switch / store rebuild — dispose() nulls the
      // group, so a late arrival for a torn-down fixture drops its own texture.
      if (!this.group) { artTex.dispose(); return; }
      artTex.anisotropy = 8;
      this.treeArtTex?.dispose();
      this.treeArtTex = artTex;
      treeMat.map = artTex;
      treeMat.needsUpdate = true;
      // The BACK plane takes the same skin, MIRRORED — the back plane is spun
      // 180 deg about Y, so an un-mirrored copy would hang the art reversed and
      // slide its alpha cut off the front's. Same trick the procedural faces get
      // in getKitTexture, just done to a loaded bitmap instead of a canvas pass.
      // Without this the skin only ever replaced the front and the far side kept
      // whatever the procedural pass drew.
      const img = artTex.image as CanvasImageSource & { width?: number; height?: number };
      const iw = Number(img?.width) || 0, ih = Number(img?.height) || 0;
      if (iw && ih) {
        const mirror = document.createElement('canvas');
        mirror.width = iw;
        mirror.height = ih;
        const mc = mirror.getContext('2d')!;
        mc.translate(iw, 0);
        mc.scale(-1, 1);
        mc.drawImage(img, 0, 0);
        const mirrorTex = new THREE.CanvasTexture(mirror);
        mirrorTex.colorSpace = THREE.SRGBColorSpace;
        mirrorTex.anisotropy = 8;
        this.treeArtBackTex?.dispose();
        this.treeArtBackTex = mirrorTex;
        treeBackMat.map = mirrorTex;
        treeBackMat.needsUpdate = true;
      }
      this.ctx.requestRender();
    });

    // ── The gift tag, cocked near the tip ───────────────────────────────────
    // Held in a group so the tilt applies to both faces identically; the back
    // plane's own 180 deg spin then stays local and the two silhouettes stay
    // registered (its canvas is drawn mirrored to match — see getKitTexture).
    const tagW = treeW * TAG_W_FRAC;
    const tagH = tagW / TAG_ASPECT;
    const tagGeo = new THREE.PlaneGeometry(tagW, tagH);
    const tagGroup = new THREE.Group();
    // Local to the spun kit group: the tag stays with the green face, on the
    // interior side. Its lateral offset lands mirrored in world space, which
    // is within the instance-to-instance spread the photo shows anyway.
    tagGroup.position.set(treeW * TAG_X_FRAC, coreHeight + treeH * TAG_Y_FRAC, 0.02);
    tagGroup.rotation.z = TAG_TILT;
    for (const dz of [0.005, -0.005]) {
      const mat = new THREE.MeshStandardMaterial({
        map: getKitTexture(dz > 0 ? 'tag-front' : 'tag-back'),
        transparent: true, alphaTest: 0.5, roughness: 0.85, metalness: 0.0,
      });
      const face = markSignMesh(new THREE.Mesh(tagGeo, mat));
      face.position.z = dz;
      if (dz < 0) face.rotation.y = Math.PI;
      tagGroup.add(face);
    }
    kit.add(tagGroup);

    // ── The card, mounted on the OUTER (kraft) face ─────────────────────────
    // Owner ruling 2026-07-30: the white sign reads to the outer walkway,
    // centred on the tree axis, while the green art faces the interior. World
    // +Z here IS the outer side; the kraft plane sits at treeZ + 0.006 after
    // the kit spin, so this clears it by ~0.03 ft.
    const cardZ = treeZ + 0.02 + CARD_T / 2;
    const cardCenterY = coreHeight + treeH * CARD_ON_TREE_H;

    this.headerTex = createCollectionHeaderTexture(this.collectionName, price, style);
    const faceMat = new THREE.MeshStandardMaterial({
      map: this.headerTex,
      roughness: 0.85,
      metalness: 0.0,
    });
    // Drop-in art, same rule as every other sign: a PNG under
    // public/user-assets/signs/collection-header-<slug>/ (or the sign-wide
    // collection-header/) replaces the typeset card — which is also where a
    // user's licensed franchise wordmark belongs, off the repo. 404 is the
    // normal case and leaves the procedural card up.
    const slug = collectionWordmark(this.collectionName).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    tryLoadUserSignArtTexture(
      [`collection-header-${slug}`, 'collection-header'],
      getActiveTheme().id,
      (artTex) => {
        // The fetch outlives a theme switch / store rebuild: dispose() nulls
        // the group, so a late arrival for a torn-down fixture drops its own
        // texture instead of writing onto a disposed material.
        if (!this.group) { artTex.dispose(); return; }
        this.headerTex?.dispose();
        this.headerTex = artTex;
        faceMat.map = artTex;
        faceMat.needsUpdate = true;
        this.ctx.requestRender();
      }
    );
    const edgeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(style.card),
      roughness: 0.9,
      metalness: 0.0,
    });
    // Face materials in BoxGeometry order (+x, -x, +y, -y, +z, -z): only the
    // +Z face (the walkway side) carries the print.
    // markSignMesh's default (casts: false) on purpose: a 0.36-in card lit
    // from the ceiling self-shadows across its own lower third in the static
    // shadow bake — measured, a grey band over the price line — and it has
    // nothing worth casting onto anyway.
    const card = markSignMesh(
      new THREE.Mesh(new THREE.BoxGeometry(CARD_W, CARD_H, CARD_T), [
        edgeMat, edgeMat, edgeMat, edgeMat, faceMat, edgeMat,
      ])
    );
    card.position.set(treeW * CARD_ON_TREE_X, cardCenterY, cardZ);
    card.rotation.z = CARD_TILT;
    this.group.add(card);
  }

  protected override disposeHeader(): void {
    super.disposeHeader();
    // The slat texture AND the four kit-sheet textures (tree/tag, front/back)
    // are module-shared and outlive the fixture — never disposed here, same
    // contract as genre-endcap's REQUESTED tag texture. Only the two textures
    // this fixture owns outright go back.
    this.coreTex = null;
    this.headerTex?.dispose();
    this.headerTex = null;
    this.treeArtTex?.dispose();
    this.treeArtTex = null;
    this.treeArtBackTex?.dispose();
    this.treeArtBackTex = null;
  }
}

// ─── Selection: which collections, and where they stand ─────────────────────
/** Deterministic 32-bit string hash (same helper shape as membership-cards.ts). */
function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A collection with enough owned stock to earn an aisle end. */
interface CollectionCandidate {
  name: string;
  members: Movie[];
  libraryIdx: number;
  libraryName: string | undefined;
}

/** Real, rentable stock — gaps/discovery/coming-soon/games are not owned tapes. */
function isOwnedStock(m: Movie): boolean {
  return !m.collectionGap && !m.discovery && !m.comingSoon && !m.game;
}

/**
 * Collections in the store's own catalog with at least MIN_COLLECTION_TITLES
 * owned titles, best-stocked first. Exported for the harness/diagnostics: it is
 * the answer to "why did/didn't this store build a collection endcap".
 */
export function qualifyingCollections(scene: StoreScene): CollectionCandidate[] {
  const byName = new Map<string, { members: Movie[]; perLib: Map<number, number> }>();
  scene.libraries.forEach((lib, libIdx) => {
    for (const m of lib?.movies ?? []) {
      if (!m.collectionName || !isOwnedStock(m)) continue;
      let g = byName.get(m.collectionName);
      if (!g) byName.set(m.collectionName, (g = { members: [], perLib: new Map() }));
      g.members.push(m);
      g.perLib.set(libIdx, (g.perLib.get(libIdx) ?? 0) + 1);
    }
  });

  const out: CollectionCandidate[] = [];
  for (const [name, g] of byName) {
    if (g.members.length < MIN_COLLECTION_TITLES) continue;
    // A collection can straddle libraries (the same box set tagged in Movies
    // and in Anime); it belongs to whichever holds most of it, because that is
    // the aisle whose end it will stand on.
    let libraryIdx = -1, best = -1;
    for (const [idx, n] of g.perLib) if (n > best) { best = n; libraryIdx = idx; }
    out.push({
      name,
      // Chronological within the collection — the same order the shelf files
      // it in, so the endcap reads like the aisle it advertises.
      members: g.members.slice().sort(shelfTitleCompare),
      libraryIdx,
      libraryName: scene.libraries[libraryIdx]?.name,
    });
  }
  // Best-stocked first; ties broken on a hash of the name so the order is
  // stable across boots without being alphabetical (which would pin the same
  // franchise to the same end forever in an alphabetically-clustered catalog).
  out.sort((a, b) => b.members.length - a.members.length || hashString(a.name) - hashString(b.name));
  return out;
}

/**
 * How many run ends this store will hand to collections. A RESERVATION, taken
 * before the staff-picks deal — not leftovers.
 *
 * Leftovers do not work: staffPickEndcapPlacements deals its discovery pool
 * round-robin across EVERY qualifying run end, so with any real watch history
 * nothing is ever left over and a collection endcap would be code that never
 * runs. The chain's own stores show the opposite priority anyway — the 1990
 * photo's franchise end is at the mouth of an aisle, in the best spot in the
 * store.
 *
 * So collections take up to MAX_COLLECTION_ENDCAPS ends and never more than
 * HALF of them: genre endcaps always keep the majority of the store's aisle
 * ends, and a store with a single usable end keeps it for the staff picks.
 * (The staff-picks deal re-spreads its pool over the ends it does get, so the
 * surviving genre endcaps come out better stocked, not thinner.)
 */
export function collectionEndcapReservation(totalRunEnds: number): number {
  return Math.max(0, Math.min(MAX_COLLECTION_ENDCAPS, Math.floor(totalRunEnds / 2)));
}

/**
 * Placements for the collection endcaps (fixtures registered as
 * `collection-endcap`).
 *
 * Runs BEFORE staffPickEndcapPlacements, which is then handed these lineIds to
 * exclude. Both selectors read the SAME host list
 * (StorePlan.openLineFrontEnds), so "an endcap fits here" means one thing.
 *
 * Deterministic: candidate order comes from stock counts + a name hash, host
 * order from the plan, so the same catalog lays the same store out every boot.
 * Returns [] when the media server surfaced no collections — the gate.
 *
 * SEASON GATE (feedback pin 020, "holiday stuff should only appear in the
 * month they match"). This fixture IS a Christmas kit: the attested 1990
 * composition is a die-cut Christmas TREE rising out of the carcass with the
 * franchise card mounted on it, a red gift tag at the tip, and a "GIVE THE
 * GIFT OF ENTERTAINMENT / for the holidays" footer — and the grammar note at
 * the top of this file limits the presentation to exactly that until a second
 * format is attested IN A PHOTO. There is no non-holiday header to fall back
 * on and inventing one is precisely the card-on-a-stick failure that ruling
 * was written after, so out of season the fixture simply doesn't deploy: the
 * run end goes back into the pool and the staff-picks genre endcap takes it
 * (this selector runs first and hands its lineIds to that one as exclusions,
 * so an empty return needs no other change). Force the season for shots with
 * `--set bb_promo_date=2026-12-10`, same override the promo stands use.
 */
export function collectionEndcapPlacements(scene: StoreScene): FixturePlacement[] {
  if (!inSeason('holiday')) {
    console.log('[Collections] out of season — the 1990 Christmas-kit endcap deploys in December only');
    return [];
  }
  const collections = qualifyingCollections(scene);
  if (collections.length === 0) return [];

  // Run ends dealt alternating across the two shelving fields (store centreline
  // x=11) so the franchises don't all land on one side — the same spread rule
  // the genre endcaps use.
  const allEnds = scene.plan.openLineFrontEnds();
  const reservation = collectionEndcapReservation(allEnds.length);
  // PER-LIBRARY cap, and the reason the store still reads right: a collection
  // wants an end on its own aisle, and three franchises out of one big Movies
  // library would otherwise take every Movies end — leaving the staff-picks
  // deal only the small libraries' ends, whose matched pools then fail its
  // MIN_PICKS test and build nothing. Measured on the --full harness: 3 of 7
  // ends taken that way dropped the genre endcaps from 5 to 1. Half of each
  // library's own ends, rounded down, keeps every aisle's mouth shared.
  const endsPerLib = new Map<number, number>();
  for (const e of allEnds) endsPerLib.set(e.unit.libraryIdx, (endsPerLib.get(e.unit.libraryIdx) ?? 0) + 1);
  const libCap = new Map<number, number>();
  for (const [idx, n] of endsPerLib) libCap.set(idx, Math.floor(n / 2));
  console.log(
    `[Collections] ${collections.length} qualifying: ` +
      collections.map((c) => `${c.name} (${c.members.length})`).join(', ') +
      ` — ${allEnds.length} run end(s) ` +
      `[${[...endsPerLib].map(([i, n]) => `lib${i}:${n}`).join(' ')}], ` +
      `reserving ${reservation} (per-library cap ${[...libCap].map(([i, n]) => `lib${i}:${n}`).join(' ')})`
  );
  if (reservation === 0) return [];
  const left = allEnds.filter((e) => e.worldX < 11);
  const right = allEnds.filter((e) => e.worldX >= 11);
  const order: typeof allEnds = [];
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if (i < left.length) order.push(left[i]);
    if (i < right.length) order.push(right[i]);
  }

  const price = collectionPriceToken();
  const styleId = COLLECTION_HEADER_STYLE_BY_THEME[getActiveTheme().id] ?? 'slab-1990';
  const placements: FixturePlacement[] = [];
  const used = new Set<number>();

  const takenPerLib = new Map<number, number>();
  const canTake = (libraryIdx: number): boolean =>
    (takenPerLib.get(libraryIdx) ?? 0) < (libCap.get(libraryIdx) ?? 0);

  for (const coll of collections) {
    if (placements.length >= reservation) break;
    // An end on the collection's OWN aisle, always: a SPY SAGA end butted onto
    // the Anime run advertises a shelf three aisles over, which is exactly the
    // read feedback pin 012 rejected for the staff-picks endcaps. A collection
    // whose aisle has no end left simply doesn't get one.
    const end = order.find(
      (e) => !used.has(e.unit.lineId) && e.unit.libraryIdx === coll.libraryIdx && canTake(e.unit.libraryIdx)
    );
    if (!end) continue;
    used.add(end.unit.lineId);
    takenPerLib.set(end.unit.libraryIdx, (takenPerLib.get(end.unit.libraryIdx) ?? 0) + 1);

    const u = end.unit;
    // Core centred so the footprint's back edge lands exactly on the unit's
    // end face (see genre-endcap.ts's abutment contract).
    const pos = scene.plan.unitToWorld(u, u.xCenter, end.frontLocalZ + ENDCAP_CORE_DEPTH / 2);
    const label = collectionWordmark(coll.name);
    placements.push({
      id: `collection-endcap-${u.lineId}`,
      kind: 'collection-endcap',
      position: { x: pos.x, z: pos.z },
      yaw: u.yaw,
      options: {
        collection: coll.name,
        // `genre` is the SlottedFixture identity string the overview label and
        // the harness read; `title` is the topper text a plain endcap uses.
        genre: `Collection: ${label}`,
        title: label,
        price,
        headerStyle: styleId,
        libraryName: coll.libraryName,
        pickIds: coll.members.map((m) => m.id),
        // Read back in buildStore (the hosting run suppresses its own house
        // front cap — same plane would z-fight) and by store-nav's browse
        // flow-through, which needs the aisle's real library index to step
        // back off the endcap onto the shelves.
        lineId: u.lineId,
        libraryIdx: u.libraryIdx,
      },
    });
  }

  if (placements.length > 0) {
    scene.onConsoleLog(
      `[Collections] ${placements.length} collection endcap(s): ` +
        placements.map((p) => `${p.options!.title} (${(p.options!.pickIds as string[]).length})`).join(', '),
      'system'
    );
  }
  return placements;
}

/**
 * Top of the composed unit in feet — what a camera has to include to frame the
 * whole thing (the harness `colcap` checkpoint is aimed off this).
 *
 * It is the TREE TIP, not the tag: the brief expected the tag to crown the
 * unit, but both legible instances put the tag's top edge ~0.17 H *below* the
 * point (green shows above it in `2280,640,220,240` and `620,400,320,260`), and
 * the arithmetic agrees — a 0.50-tree-wide tag centred at 0.79 H and cocked 8
 * deg reaches 0.86 H at its highest corner. So the tip wins by a clear foot.
 */
export const COLLECTION_HEADER_TOP_Y =
  ENDCAP_CORE_HEIGHT + (ENDCAP_WIDTH * TREE_W_FRAC) / TREE_ASPECT;
