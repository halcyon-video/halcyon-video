// COMING SOON counter letterboard — the 1990 changeable-letter coming-
// attractions board that stood ON the back ledge of the checkout counter,
// propped against the glass behind it.
//
// Reference + measurements: public/user-assets/fixtures/coming-soon-letterboard/
// (NOTES.md — a 24 x 36 in navy face in a 0.75 in silver aluminium snap frame;
// generate.html draws the face and takes live rows). The MEASURED FACE below
// is unchanged; only where the board stands has moved.
//
// ── CORRECTION 2026-07-30: the pedestal was wrong ───────────────────────────
// This file used to build a floor post and a weighted disc, and stand the
// whole thing on the open floor in the left front-glass pocket. That read came
// from stills where the counter cut off the board's lower third — the missing
// bottom was assumed to be a post. A 1990 counter frame the owner supplied
// (/uploads/…828a835c-6482.png, a "WELCOME / COMING SOON" letterboard
// behind a clerk) shows what the counter was actually hiding: the board rests
// DIRECTLY ON the counter's back ledge and LEANS BACK against the glazed
// vestibule wall behind it. There is no post and no disc anywhere in frame —
// the board's silhouette runs straight down behind the register terminals to
// the counter top, and the clerk's head passes IN FRONT of its lower half,
// which a floor-standing board at the end of the counter could not do.
// So: pedestal geometry deleted, board re-based onto the ledge.
//
// What the frame does NOT pin is the lean angle: the board's bottom is
// occluded, and its silhouette is too near-frontal to measure a keystone
// (measured on that frame: outline width 635 px across the top vs 625 px a
// thousand rows lower — a 1.6% difference, i.e. inside the edge-blur noise, so
// any lean under ~10 deg is unresolvable). The lean is therefore DERIVED from
// the store's own geometry rather than guessed — see LEAN below.
//
// THEME-gated, not POP-period gated (contrast membership-oval-hanger.ts): this
// is store FURNITURE the manager kept and re-lettered by hand, not a kit
// corporate mailed out, so it belongs to the 1990 fabric and only to it. The
// 1993 tours attest its ABSENCE (288 frames, no such board anywhere), so unlike
// the pop-period fixtures it does NOT survive forward onto later fabrics. The
// gate is armed by the PLACEMENT (`options.themes`), the trick pv-drape-table
// uses for its era gate: the single-asset void viewer builds a registry kind
// with no options and no store around it, and dating a fixture out of existence
// there would only make `assetshot` fail on an asset that is perfectly fine to
// look at.
//
// Viewable alone: `npm run assetshot -- --kind fixture --name coming-soon-letterboard`.
import * as THREE from 'three';
import { FixturePlacement } from '../store-layout';
import { FixtureContext, StoreFixture } from '../fixtures';
import { Footprint } from '../layout-validator';
import { getActiveTheme, themeTrimDarkHex, themeKneeGoldHex, scaleHex } from '../themes';
import { markSignMesh } from '../sign-builders';
import { tryLoadUserAssetTexture } from '../user-assets';
import { getRequestedDiscoveryIds, onJellyseerrRequestChange } from '../jellyseerr';
import { activeMediaCutoff } from '../media-release-date';
import {
  ComingSoonRow,
  collectComingSoon,
  comingSoonRows,
  comingSoonRowsSignature,
  fitLetterboardTitle,
} from '../coming-soon-feed';

/** Themes this board belongs to. 1990 fabric ONLY — see the header note. */
export const COMING_SOON_LETTERBOARD_THEMES = ['bb-1990'];

// ─── Measured geometry (feet) ───────────────────────────────────────────────
// SIZE 2026-08-02 — owner call on the store walkthrough: "lets make the sign a
// little bigger." The whole fixture is scaled UNIFORMLY rather than the face
// being stretched. Everything the board draws is a fraction of W/H (GRID,
// HEADER, ROWS below, and the fallback canvas takes its own aspect from
// BOARD_H/BOARD_W), so a uniform scale grows the push-in letters with the
// board and leaves the measured layout byte-identical — the letter grid is
// never distorted.
// 7/6 (+16.7 %) rather than a round 1.2: it lands the face on 28 x 42 in, a
// real stock snap-frame / letterboard size, instead of an off-catalogue
// 28.8 x 43.2, and it holds the measured 2:3 aspect exactly. The aluminium
// profile scales with it (0.75 -> 0.875 in) because the metal lip has to keep
// covering the frame band front.png paints at 0.031 W; holding the profile at
// 0.75 in while the board grew would leave a sliver of PRINTED frame showing
// outside it. LEAN is re-derived below for the taller board.
const SCALE = 7 / 6;
// Face 24 x 36 in before SCALE (NOTES.md §3: the letter-kit sizes pin the
// height at 36 in and the measured aspect band 0.65 ± 0.04 puts the width at
// 24), i.e. 28 x 42 in as built.
const BOARD_W = SCALE * 24 / 12;
const BOARD_H = SCALE * 36 / 12;
const BOARD_D = SCALE * 0.1;            // panel + snap-frame carcass, ~1.4 in
// 0.75 in aluminium snap-frame profile (NOTES: 0.031 W), 0.875 in at SCALE.
// Built as a real lip standing proud of the face, so it catches the room light
// along its length instead of being a painted rectangle — it lands exactly on
// the band the face art paints its own frame into, covering it.
const FRAME_W = SCALE * 0.75 / 12;
// How far the lip stands off the face. Kept to ~0.17 in on purpose: the face
// art's last row is painted ON TOP of its own frame band (generate.html draws
// the rows after the frame, and the letter field runs to 0.986 H), so a real
// lip over that band clips the bottom line for anyone reading from BELOW —
// measured, a 0.36 in profile ate a third of its caps at 3.6 ft. At 0.17 in
// the same view loses a hairline, and from standing eye height — where the
// board is read — the bottom lip faces the viewer and occludes nothing.
const FRAME_PROUD = SCALE * 0.014;
// ── Where it rests, and how far it leans ────────────────────────────────────
// The counter's back run (shield counter, the default storefront) is a 1.5 ft
// deep band: outer face on z = 8.5, inner face on z = 7.0, top surface at
// 3.4 ft band body + 0.14 ft cap = 3.54 ft. Those are entrance/counter.ts's
// private `bandH`/`bandD`/`zBackC`, mirrored here as constants for the same
// reason period-fixtures.ts mirrors 3.54: fixtures are built BEFORE
// EntranceCheckout exists, so there is nothing live to ask.
const LEDGE_TOP_Y = 3.54;               // counter band top = the resting plane
// The rest of that band, for the record and for the placement's derivation:
// outer face on z = 8.5, 1.5 ft deep (inner face z = 7.0), so its centre line —
// where store-fixtures-config.ts puts the board's foot — is z = 7.75. Directly
// behind it is the vestibule's back glazed wall on z = 8.6, 0.12 ft thick
// (entrance/index.ts buildGlazedWall('X', backZ, …)), i.e. the surface the
// board leans on is its store-side face at z = 8.54.
//
// LEAN, derived not guessed (the reference frame cannot resolve it — see the
// header): the board is propped, so its top BACK corner is what meets the
// glass. Pivoting on the foot at z = 7.75 that corner lands at
//   7.75 + BOARD_H*sin(LEAN) + (BOARD_D/2)*cos(LEAN)
// = 7.75 + 0.668 + 0.057 = 8.475 at 11 deg — 0.8 in shy of the glass face at
// 8.54. Close enough to read as resting against it, far enough that the two
// surfaces never touch or z-fight. (5 deg, the old free-standing pedestal
// tilt, left a 5 in gap and read as a board standing up by itself.) The board
// then tops out at 3.54 + BOARD_H*cos(LEAN) = 6.98 ft, well under the 11.5 ft
// vestibule soffit and comfortably above a standing reader's eye line, which
// is the same top-of-band read the pedestal version was aiming for.
//
// RE-DERIVED with SCALE 2026-08-02: the same 0.8 in standoff, solved again for
// the taller board. A 42 in board left at 13 deg would have put that corner on
// z = 8.594 — 0.65 in INSIDE the glass. Lean is the free variable here (the
// reference never pinned it, and anything under ~10 deg is unresolvable in the
// frame), so it takes up the extra height rather than the standoff doing it.
const LEAN = 11 * Math.PI / 180;

// Palette — livery routes through the active theme (CLAUDE.md rule: never
// hardcode a house color). Field/lip derive from palette.primary, the letter
// kit from palette.secondary — so the board wears house colors by default and
// the 1990 navy/gold returns automatically under a brand pack that swaps the
// palette. Silver frame and white letters are hardware, not livery.
const boardField = () => themeTrimDarkHex();
const SILVER = '#C2C6C7';
const LETTER_WHITE = '#EDECE4';
const letterGold = () => getActiveTheme().palette.secondary;
const ruleGold = () => themeKneeGoldHex();
const frameLip = () => scaleHex(getActiveTheme().palette.primary, 0.11);

/**
 * Row slots the real board physically holds (NOTES.md: "22 slots on the real
 * board"). The live feed is capped to this — a letterboard cannot show a
 * 23rd line, so a longer queue is trimmed rather than shrunk into illegibility.
 */
export const COMING_SOON_LETTERBOARD_SLOTS = 22;

// Loaded user art survives fixture teardown (dispose() releases geometries and
// materials, never maps) and is fetched once per session.
let userTex: THREE.Texture | null = null;
let userTexMissing = false;

// ─── Brand-free procedural fallback ─────────────────────────────────────────
// The measured layout of the real board (NOTES.md §3 vertical/horizontal
// fractions) with none of its copy: the same six-element header stack, the
// same two-column tab grid, generic filler in the rows. Installing the
// git-ignored front.png swaps the real face in.
//
// Everything is set on the letterboard's MONOSPACED TAB GRID (NOTES.md §4):
// each character owns a tab of exactly `advance`, its glyph centred in that
// tab, wide glyphs condensed to fit — which is what makes push-in letters read
// as applied copy instead of typeset text. A hair of seeded per-glyph jitter
// (letters sit a touch proud/low and cocked in their tracks) finishes it.
const GRID = {
  x0: 0.090,          // tab-grid origin, fraction of W
  dateTabs: 6,        // date column is 6 tabs wide, right-aligned
  gapTabs: 1,
  advanceOfCap: 0.865,
  capOfPitch: 0.62,
  tabInkMax: 0.88,
  bodyCapFrac: 0.0178,
  maxRowPitchFrac: 0.062,
  minTitleTabs: 24,
  squeezeMin: 0.62,
  rightLimit: 0.955,
  areaTop: 0.356,
  areaBottom: 0.986,
};
// Header stack. `x0..x1` is the MEASURED ink extent of the real line and
// `refChars` its character count — together they give the header kit's tab
// advance. The generic house line is shorter than the one that was measured,
// so it keeps that advance (a manager doesn't re-space the kit for a short
// word) and centres on the box instead of stretching across it.
const HEADER = [
  { text: 'WELCOME TO', refChars: 10, centreY: 0.083, cap: 0.0320, x0: 0.198, x1: 0.755 },
  { text: 'VIDEO', refChars: 11, centreY: 0.159, cap: 0.0345, x0: 0.198, x1: 0.755 },
  { text: 'COMING SOON', refChars: 11, centreY: 0.314, cap: 0.0355, x0: 0.176, x1: 0.780 },
];
const RULES = [0.187, 0.341];
const ADDR = [
  { text: 'STORE #0000  ANYTOWN, USA', centreY: 0.224, centreX: 0.483 },
  { text: '(000) 555-0000', centreY: 0.261, centreX: 0.455 },
];
// Generic filler in the real board's shape: two blank spacer lines, a
// month+day at the head of each street-date block, bare days under it. No real
// titles — the copy is a spec token, and front.png carries the read one.
//
// This is now the FALLBACK only. The board letters itself from the live
// coming-soon feed (coming-soon-feed.ts) whenever that feed has anything in
// it; these rows stand in when it is empty, which is the honest state for a
// store with no Jellyseerr orders and nothing unreleased in its catalog — a
// board that hasn't been re-lettered, rather than a blank one that reads as
// broken.
const PLACEHOLDER_ROWS: ComingSoonRow[] = [
  { date: '', title: 'SPACE ADVENTURE' },
  { date: '', title: 'COMEDY DOUBLE BILL' },
  { date: '', title: 'THE DETECTIVE PICTURE' },
  { date: '', title: '' },
  { date: 'AUG 3', title: 'WESTERN ROUNDUP' },
  { date: '', title: 'FAMILY PICNIC' },
  { date: '4', title: 'THE RACING PICTURE' },
  { date: '10', title: 'MYSTERY AT SEA' },
  { date: '', title: 'ROBOT FRIENDS' },
  { date: '', title: 'SUMMER CAMP TALE' },
  { date: '', title: 'THE COOKING SHOW' },
  { date: '17', title: 'PIRATE VOYAGE' },
  { date: '18', title: 'THE DANCE PICTURE' },
  { date: '', title: 'JUNGLE EXPEDITION' },
  { date: '', title: '' },
  { date: 'SEPT 7', title: 'SPY THRILLER' },
  { date: '8', title: 'THE BASEBALL PICTURE' },
  { date: '', title: 'HAUNTED TOUR BUS' },
  { date: '21', title: 'DESERT CHASE' },
  { date: '22', title: 'THE LOVE STORY' },
  { date: '', title: 'SCIENCE FICTION EPIC' },
  { date: '', title: 'ANIMATED FEATURE' },
];

/** Deterministic RNG so the fallback face is identical on every build. */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Plain condensed grotesque: a letter kit casts a medium-weight condensed
// cap, and every line is fitted to a MEASURED ink box below anyway, so the
// family only has to be plausible — not resolved.
const FAMILY = `"Liberation Sans Narrow", "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;

/** One line of push-in letters on the tab grid, bound to a canvas + jitter stream. */
function makeTabLine(c: CanvasRenderingContext2D, rnd: () => number) {
  // Cap height as a fraction of the em, measured off the face that actually
  // resolved rather than assumed.
  c.font = `200px ${FAMILY}`;
  const capEm = (c.measureText('H').actualBoundingBoxAscent || 144) / 200;
  return (text: string, x0: number, baseline: number, cap: number, advance: number, color: string) => {
    c.save();
    c.font = `${cap / capEm}px ${FAMILY}`;
    c.textBaseline = 'alphabetic';
    c.lineJoin = 'round';
    c.lineWidth = 0.045 * cap;          // the kit's medium weight
    c.strokeStyle = color;
    c.fillStyle = color;
    const maxInk = GRID.tabInkMax * advance;
    const chars = [...text];
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (ch === ' ') continue;
      const m = c.measureText(ch);
      const inkW = Math.max(1, m.actualBoundingBoxRight + m.actualBoundingBoxLeft);
      const sx = inkW > maxInk ? maxInk / inkW : 1;   // M/W are cast narrower
      c.save();
      c.translate(x0 + (i + 0.5) * advance + (rnd() - 0.5) * 0.1 * advance,
        baseline + (rnd() - 0.5) * 0.11 * cap);
      c.rotate((rnd() - 0.5) * 0.024);
      if (sx !== 1) c.scale(sx, 1);
      c.globalAlpha = 1 - rnd() * 0.10;
      const ox = -inkW / 2 + m.actualBoundingBoxLeft;
      c.strokeText(ch, ox, 0);
      c.fillText(ch, ox, 0);
      c.restore();
    }
    c.restore();
  };
}

/**
 * Strip the letter field back to bare navy — the state a board is in between
 * one set of copy and the next. Used before re-lettering the INSTALLED face
 * art, whose own rows are baked into the PNG.
 *
 * Two rects, because the field and the frame overlap: the navy field runs from
 * the letter area's top to the frame's inner edge, and the last row's caps
 * spill a couple of pixels onto the dark inner lip below it (the face art
 * paints its rows after its frame — see FRAME_PROUD's note), so that sliver of
 * lip is repainted too. Inset past the lip's corner radius so the rounded
 * corners are never touched; the copy never reaches them anyway.
 */
function clearLetterField(c: CanvasRenderingContext2D, w: number, h: number): void {
  const fw = FRAME_W / BOARD_W * w;
  const lip = 0.010 * w;
  const cornerR = 0.030 * w;
  c.fillStyle = boardField();
  c.fillRect(fw, GRID.areaTop * h, w - 2 * fw, (h - fw) - GRID.areaTop * h);
  c.fillStyle = frameLip();
  c.fillRect(fw + cornerR, h - fw, w - 2 * (fw + cornerR), lip);
}

/**
 * The changeable-letter field: track grooves at the fitted pitch, then the two
 * columns. Shared by the brand-free procedural face and by the live re-letter
 * over the installed art, so both run the one measured grid (NOTES.md §3/§4).
 *
 * Pitch auto-fits the row count under two ceilings — vertical
 * (maxRowPitchFrac) and horizontal (a minTitleTabs-character title must still
 * fit) — and the rows TOP-ANCHOR, leaving bare navy below, which is what the
 * real board looks like when it isn't full.
 */
function drawLetterField(
  c: CanvasRenderingContext2D, w: number, h: number, rows: ComingSoonRow[], rnd: () => number
): void {
  const tabLine = makeTabLine(c, rnd);
  const fw = FRAME_W / BOARD_W * w;
  const areaTop = GRID.areaTop * h;
  const areaH = (GRID.areaBottom - GRID.areaTop) * h;
  let pitch = Math.min(areaH / Math.max(1, rows.length), GRID.maxRowPitchFrac * h);
  let cap = GRID.capOfPitch * pitch;
  let advance = GRID.advanceOfCap * cap;
  const advanceMax = ((GRID.rightLimit - GRID.x0) * w) / (GRID.dateTabs + GRID.gapTabs + GRID.minTitleTabs);
  if (advance > advanceMax) {
    advance = advanceMax;
    cap = advance / GRID.advanceOfCap;
    pitch = cap / GRID.capOfPitch;
  }
  const gridX0 = GRID.x0 * w;
  const dateRight = gridX0 + GRID.dateTabs * advance;
  const titleX = dateRight + GRID.gapTabs * advance;
  const titleRoom = GRID.rightLimit * w - titleX;
  const maxTitleTabs = Math.max(1, Math.floor(titleRoom / advance));
  // The kit runs out of tabs here: past this the letters would have to squeeze
  // narrower than squeezeMin, which no real letter kit casts. The feed trims a
  // title to this budget (word boundary, subtitle first) rather than letting
  // the renderer chop it mid-word.
  const maxTitleChars = Math.max(8, Math.floor(maxTitleTabs / GRID.squeezeMin));

  // Letter TRACK GROOVES run the full letter area at the current pitch —
  // empty tracks still show theirs. Subtle: the 1990 tape can't resolve them.
  const gx0 = fw * 1.5, gx1 = w - fw * 1.5;
  const ridge = Math.max(1, 0.0015 * h);
  for (let gy = areaTop + pitch; gy <= areaTop + areaH + 0.5; gy += pitch) {
    c.fillStyle = 'rgba(0,0,0,0.32)';
    c.fillRect(gx0, gy - ridge, gx1 - gx0, ridge);
    c.fillStyle = 'rgba(255,255,255,0.07)';
    c.fillRect(gx0, gy, gx1 - gx0, ridge * 0.8);
  }

  rows.forEach((row, i) => {
    const baseline = areaTop + i * pitch + (pitch + cap) / 2;
    if (row.date) {
      // Right-aligned: the manager sets month/day flush to the same tab.
      tabLine(row.date, Math.max(gx0, dateRight - [...row.date].length * advance),
        baseline, cap, advance, LETTER_WHITE);
    }
    if (row.title) {
      // Over budget = SQUEEZED (narrower tabs, same cap) before anything is
      // lost — the letterboard equivalent of reaching for the condensed
      // letters. Only a title past even the squeezed budget gets shortened.
      const text = fitLetterboardTitle(row.title, maxTitleChars);
      const len = [...text].length;
      const rowAdv = len > maxTitleTabs ? Math.max(advance * GRID.squeezeMin, titleRoom / len) : advance;
      tabLine(text.slice(0, Math.max(1, Math.floor(titleRoom / rowAdv))),
        titleX, baseline, cap, rowAdv, LETTER_WHITE);
    }
  });
}

/**
 * Brand-free procedural face: the measured layout of the real board with none
 * of its copy, lettered with `rows`. Used when the git-ignored front.png isn't
 * installed.
 */
function fallbackTexture(rows: ComingSoonRow[]): THREE.CanvasTexture {
  const w = 1024;
  const h = Math.round(w * (BOARD_H / BOARD_W));   // 1536, the face's 2:3
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;
  const rnd = mulberry32(19900613);
  const tabLine = makeTabLine(c, rnd);

  // Header lines share the body's grid one size up: the stills give ink
  // EXTENTS, not tracking, so the advance is that extent over the char count.
  const headerLine = (b: typeof HEADER[number], color: string) => {
    const cap = b.cap * h;
    const advance = ((b.x1 - b.x0) * w) / Math.max(1, b.refChars);
    const n = [...b.text].length;
    tabLine(b.text, ((b.x0 + b.x1) / 2) * w - (n * advance) / 2,
      b.centreY * h + cap / 2, cap, advance, color);
  };

  // 1. Silver frame carcass, dark inner lip, navy face.
  const fw = FRAME_W / BOARD_W * w;
  const lip = 0.010 * w;
  c.fillStyle = SILVER;
  c.fillRect(0, 0, w, h);
  c.fillStyle = frameLip();
  c.fillRect(fw - lip, fw - lip, w - 2 * (fw - lip), h - 2 * (fw - lip));
  c.fillStyle = boardField();
  c.fillRect(fw, fw, w - 2 * fw, h - 2 * fw);

  // 2. Header stack: WELCOME TO / house line / rule / two address lines /
  //    COMING SOON / rule. All six elements, none of the real board's copy.
  headerLine(HEADER[0], letterGold());
  headerLine(HEADER[1], letterGold());
  for (const y of RULES) {
    c.fillStyle = ruleGold();
    c.fillRect(0.185 * w, y * h - 0.0017 * h, 0.63 * w, 0.0034 * h);
  }
  const addrCap = GRID.bodyCapFrac * h;
  const addrAdv = GRID.advanceOfCap * addrCap;
  for (const a of ADDR) {
    tabLine(a.text, a.centreX * w - ([...a.text].length * addrAdv) / 2,
      a.centreY * h + addrCap / 2, addrCap, addrAdv, LETTER_WHITE);
  }
  headerLine(HEADER[2], letterGold());

  // 3. The changeable-letter rows.
  drawLetterField(c, w, h, rows, rnd);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * RE-LETTER the installed face art: the real board's header stack, frame and
 * address lines are kept exactly as the PNG has them, and only the letter
 * field is stripped and set with the live rows — which is precisely what a
 * manager did to this object. Returns null if the art hasn't loaded yet.
 */
function relettered(base: THREE.Texture, rows: ComingSoonRow[]): THREE.CanvasTexture | null {
  const img = base.image as (HTMLImageElement | HTMLCanvasElement | undefined);
  const w = (img as HTMLImageElement)?.naturalWidth || (img as HTMLCanvasElement)?.width || 0;
  const h = (img as HTMLImageElement)?.naturalHeight || (img as HTMLCanvasElement)?.height || 0;
  if (!img || !w || !h) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;
  c.drawImage(img as CanvasImageSource, 0, 0, w, h);
  clearLetterField(c, w, h);
  drawLetterField(c, w, h, rows, mulberry32(19900613));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// The board that is actually standing in the live store, so the one
// order-book listener below always re-letters the CURRENT one. A scene
// rebuild swaps this; there is deliberately no growing listener list.
let activeBoard: ComingSoonLetterboard | null = null;
let feedSubscribed = false;

export class ComingSoonLetterboard implements StoreFixture {
  public placement: FixturePlacement;

  private ctx: FixtureContext;
  private group: THREE.Group | null = null;
  private disposables: Array<{ dispose(): void }> = [];
  // Face material + the texture THIS fixture owns (null while the material is
  // showing the shared, module-cached front.png verbatim).
  private faceMat: THREE.MeshStandardMaterial | null = null;
  private ownedTex: THREE.CanvasTexture | null = null;
  // Content signature of the rows currently ON the board. The texture is
  // regenerated only when this changes — never per frame, never per render.
  private rowSig: string | null = null;

  constructor(placement: FixturePlacement, ctx: FixtureContext) {
    this.placement = placement;
    this.ctx = ctx;
  }

  /**
   * The live copy: what is genuinely coming to this store, in the shape the
   * board's 22 letter tracks can hold. Empty when there is no such data — the
   * caller then leaves the asset's own face alone.
   */
  private liveRows(): ComingSoonRow[] {
    try {
      const feed = collectComingSoon(this.ctx.libraries, {
        extra: this.ctx.staffPickMovies,
        requestedIds: getRequestedDiscoveryIds(),
        // Media Release Date pin (#42): "not out yet" means after the store's
        // rolling today, not the wall clock's — a store pinned ahead of real
        // time must not board already-premiered-there titles as coming soon.
        now: activeMediaCutoff() ?? undefined,
      });
      return comingSoonRows(feed, COMING_SOON_LETTERBOARD_SLOTS);
    } catch (e) {
      // A board is furniture: a bad catalog must never take the store down.
      console.warn('[coming-soon-letterboard] live feed failed, keeping the shipped face:', e);
      return [];
    }
  }

  /**
   * Put `rows` on the face, reusing whatever is already there when the copy
   * hasn't moved. Regenerating a 1366 x 2048 canvas is the expensive act here,
   * so it happens exactly once per genuine change of the underlying data, and
   * the texture it replaces is disposed on the spot.
   */
  private setRows(rows: ComingSoonRow[]): void {
    const mat = this.faceMat;
    if (!mat) return;
    const sig = rows.length > 0 ? comingSoonRowsSignature(rows) : '';
    // `base` matters as well as the copy: the shipped art can land after the
    // first face was built, which is a real change even at the same signature.
    const key = `${userTex ? 'user' : 'proc'}|${sig}`;
    if (key === this.rowSig) return;

    let next: THREE.CanvasTexture | null = null;
    if (rows.length === 0) {
      // No real data. Keep the board exactly as the asset ships it: the
      // installed face verbatim, or the brand-free procedural one with its
      // spec-token filler. Never a blank or half-set board.
      next = userTex ? null : fallbackTexture(PLACEHOLDER_ROWS);
    } else {
      next = (userTex ? relettered(userTex, rows) : null) ?? fallbackTexture(rows);
    }

    const old = this.ownedTex;
    mat.map = next ?? userTex;
    mat.needsUpdate = true;
    this.ownedTex = next;
    this.rowSig = key;
    if (old) {
      const at = this.disposables.indexOf(old);
      if (at >= 0) this.disposables.splice(at, 1);
      old.dispose();
    }
    if (next) this.disposables.push(next);
    this.ctx.requestRender();
  }

  /** Re-read the feed and re-letter if (and only if) the copy actually moved. */
  public refreshFromFeed(): void {
    if (!this.faceMat) return;
    this.setRows(this.liveRows());
  }

  /** False when this placement's theme list doesn't include the active fabric. */
  private inEra(): boolean {
    const themes = this.placement.options?.themes as string[] | undefined;
    if (!Array.isArray(themes) || themes.length === 0) return true;
    return themes.includes(getActiveTheme().id);
  }

  build(): void {
    if (!this.inEra()) return;

    // The board needs a back ledge to stand on, and only the SHIELD counter
    // has one: the usquare counter's back edge is never built — that side is
    // the open walk-in (entrance/counter.ts's bandSegDefs emits edges 0..2
    // only). Rather than float the board in that doorway, skip it there.
    if (this.ctx.storefrontSpec?.counterShape === 'usquare') {
      this.ctx.log('[coming-soon-letterboard] usquare counter has no back ledge — not built', 'system');
      return;
    }

    const group = new THREE.Group();
    group.name = `coming-soon-letterboard-${this.placement.id}`;
    // Origin ON the ledge: the placement's x/z is where the board's FOOT sits,
    // and y is the ledge top. No post, no base disc — see the header note.
    group.position.set(this.placement.position.x, LEDGE_TOP_Y, this.placement.position.z);
    group.rotation.y = this.placement.yaw;
    this.group = group;

    // ── Board ───────────────────────────────────────────────────────────────
    // Its own sub-group so the lean and the frame lip move together. The lean
    // pivots on the BOTTOM EDGE, not the face centre: the bottom edge is the
    // part actually touching the ledge, so it is what has to stay pinned at
    // y = 0 (ledge top) whatever LEAN is set to. Rotating about local X by
    // -LEAN sends local +Y to local -Z, so the sub-group is pushed back up and
    // forward by exactly the half-diagonal the rotation swung away.
    const board = new THREE.Group();
    board.position.y = (BOARD_H / 2) * Math.cos(LEAN);
    board.position.z = -(BOARD_H / 2) * Math.sin(LEAN);
    board.rotation.x = -LEAN;    // top edge back toward the glass, face to the queue
    group.add(board);

    // SINGLE-faced: the real board's reverse was never dressed, so the
    // carcass's other five sides are plain navy. One box, two materials —
    // the face art on +Z, navy everywhere else.
    const navyMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(boardField()), roughness: 0.55, metalness: 0.02,
    });
    const faceMat = new THREE.MeshStandardMaterial({
      // Painted sheet steel under a letter kit: satin, so the room's light
      // travels across it, but nothing like the frame's aluminium.
      roughness: 0.52, metalness: 0.02,
    });
    this.faceMat = faceMat;
    const coreGeo = new THREE.BoxGeometry(BOARD_W, BOARD_H, BOARD_D);
    this.disposables.push(coreGeo, navyMat, faceMat);
    // Letter the board from the live feed (or leave it as the asset ships it
    // when there's nothing real to say). This is the ONLY place the face
    // texture is generated.
    this.refreshFromFeed();
    // BoxGeometry group order: +X, -X, +Y, -Y, +Z, -Z.
    const core = markSignMesh(
      new THREE.Mesh(coreGeo, [navyMat, navyMat, navyMat, navyMat, faceMat, navyMat]),
      { casts: true },
    );
    board.add(core);

    // Snap-frame lip: four bars standing proud of the face on the exact band
    // the art paints its own frame into, so the printed frame is covered by
    // the real one. ONE InstancedMesh — four boxes, one draw call.
    const lipGeo = new THREE.BoxGeometry(1, 1, 1);
    const lipMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(SILVER), roughness: 0.34, metalness: 0.72,
    });
    this.disposables.push(lipGeo, lipMat);
    const innerH = BOARD_H - 2 * FRAME_W;
    const lipZ = BOARD_D / 2 + FRAME_PROUD / 2;
    const bars: [number, number, number, number][] = [
      // x, y, sx, sy
      [0, (BOARD_H - FRAME_W) / 2, BOARD_W, FRAME_W],
      [0, -(BOARD_H - FRAME_W) / 2, BOARD_W, FRAME_W],
      [-(BOARD_W - FRAME_W) / 2, 0, FRAME_W, innerH],
      [(BOARD_W - FRAME_W) / 2, 0, FRAME_W, innerH],
    ];
    const lip = new THREE.InstancedMesh(lipGeo, lipMat, bars.length);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    bars.forEach(([x, y, sx, sy], i) => {
      p.set(x, y, lipZ);
      s.set(sx, sy, FRAME_PROUD);
      lip.setMatrixAt(i, m.compose(p, q, s));
    });
    lip.instanceMatrix.needsUpdate = true;
    lip.castShadow = true;
    lip.receiveShadow = true;
    board.add(lip);

    this.ctx.scene.add(group);
    this.ctx.addCollider(core);
    this.ctx.requestShadowRefresh();

    // One order-book listener for the whole module, pointed at whichever board
    // is currently standing: ordering a title at the shelf re-letters the
    // counter board live, and nothing is polled to make that happen.
    activeBoard = this;
    if (!feedSubscribed) {
      feedSubscribed = true;
      onJellyseerrRequestChange(() => activeBoard?.refreshFromFeed());
    }

    if (!userTex && !userTexMissing) {
      tryLoadUserAssetTexture('fixtures/coming-soon-letterboard/front.png', (tex) => {
        tex.anisotropy = 8;
        userTex = tex;             // cached for the session; teardown never disposes maps
        // Re-letter onto the real face now that it's here (harmless if this
        // build was already torn down — setRows no-ops without a material).
        this.refreshFromFeed();
      }, { onMiss: () => { userTexMissing = true; } });
    }
  }

  // NO floor footprint any more — this is a counter-top prop now, the case the
  // StoreFixture.getFootprint doc names TapeRewinder for. Nothing about it
  // touches the floor: it starts 3.54 ft up, on furniture the validator and
  // the clerk's A* already know about as `structure:counter-band-back`
  // (x 6.2..15.8, z 7.0..8.5). Returning a rect here would double-book that
  // same ground and trip the fixture-vs-structure collision check.
  getFootprint(): Footprint | null {
    return null;
  }

  update(_timeMs: number): void {
    // Static fixture — the copy changes when a manager re-letters it, not per
    // frame. The live feed pushes (onComingSoonFeedChange); nothing polls here.
  }

  dispose(): void {
    if (activeBoard === this) activeBoard = null;
    if (this.group) {
      this.ctx.scene.remove(this.group);
      this.group = null;
    }
    this.faceMat = null;
    this.ownedTex = null;
    this.rowSig = null;
    // A loaded user face texture is a module cache that outlives any single
    // build (as in membership-oval-hanger.ts) and is deliberately not here;
    // the re-lettered canvas on top of it IS this fixture's, and is.
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}
