// logo-wrap.ts — procedural LogoSpec BOX WRAPS (Phase B2 of the store-branding
// system). Two flat [BACK | SPINE | FRONT] wraps drawn at boot from the user's
// active LogoSpec instead of a scanned JPEG, registered in video-case.ts's
// COVER_VARIANTS alongside the scans:
//
//   • 'custom' — the cream-template analog of the 1988 "Standard Version" VHS
//     wrap (and the 2003 DVD rental wrap on the DVD medium): cream/white paper
//     stock, front brand emblem via drawLogo(), a printed spine FORM
//     (CATEGORY:/RATING:/RENT CODE:/DIST: fields) and the back label window.
//     CRITICAL CONTRACT: every printed blank sits at the SAME full-scan pixel
//     coordinates the real scans have, because video-case.ts's
//     drawStandardVhsOverlays / drawDvd2003Overlays type each movie's real
//     metadata at hardcoded pixel positions (and erase the front title
//     placeholder with a hardcoded stock color). Match the geometry and the
//     whole typed-metadata pass works on the procedural wrap unchanged.
//   • 'custom-ticket' — the all-emblem analog of the ticket-* scans: giant
//     brand emblem printed on BOTH faces, brand-colored spine band, no
//     metadata blanks anywhere (the variant is registered `plain`, so
//     drawBoxOverlays never types onto it).
//
// Canvases are sized exactly like the scans (VHS 1024×762, DVD 1024×683) so
// every downstream fold/crop constant in BOX_LAYOUTS applies untouched. Each
// wrap is drawn ONCE per boot (the spec is immutable per boot — brand changes
// reload the page like theme/medium changes do) and cached; nothing here runs
// per frame. Pure 2D canvas: no three.js.
import type { CaseMedium } from './video-case';
import type { LogoSpec } from './logo-spec';
import { HALCYON_GOLD, HALCYON_CREAM, HALCYON_BLUE, HALCYON_INK } from './logo-spec';
import { drawLogo, getLogoFontString } from './logo-renderer';
import { brandString } from './brand-pack';
import { bundledFontsReady } from './bundled-fonts';

// ─── Print constants (mirror the scans / the overlay typists) ────────────────
// Stock + ink per medium. The stock colors are LOAD-BEARING: the overlay pass
// erases the front title placeholder with fillRect in exactly these colors
// ('#f3eadb' in drawStandardVhsOverlays, '#ffffff' in drawDvd2003Overlays), so
// the procedural paper must be the same color or the erase reads as a patch.
// The inks match what the typed metadata uses (STANDARD_INK / DVD_2003_INK) so
// print and typing look like the same ribbon.
const STOCK: Record<CaseMedium, string> = { vhs: '#f3eadb', dvd: '#ffffff' };
const INK: Record<CaseMedium, string> = { vhs: '#211d19', dvd: '#0a0a0a' };
const IMG_W = 1024;
const IMG_H: Record<CaseMedium, number> = { vhs: 762, dvd: 683 };

// Print inks. A wrap is a PRINTED object, not a lit sign: the panel emerald
// runs a shade deeper than the emblem's, and the lettering prints in a warm
// rust-brass rather than the signage's bright brass. Swapped in ONLY while the
// spec still carries the untouched Halcyon defaults; any user recolor is
// honored verbatim.
const WRAP_PRINT_LETTER = '#b5731f'; // rust-brass lettering ink
const WRAP_PRINT_BODY = HALCYON_INK; // deeper emerald for the printed panels

function wrapPrintColors(spec: LogoSpec): { body: string; letter: string; stripe: string } {
  const isDefaultInk = spec.textColor.toLowerCase() === HALCYON_CREAM;
  return {
    body: spec.bodyColor.toLowerCase() === HALCYON_BLUE ? WRAP_PRINT_BODY : spec.bodyColor,
    letter: isDefaultInk ? WRAP_PRINT_LETTER : spec.textColor,
    stripe: spec.borderColor.toLowerCase() === HALCYON_GOLD ? WRAP_PRINT_LETTER : spec.borderColor,
  };
}

// Spine form geometry, in full-scan pixels — copied from the coordinate
// audits in video-case.ts's overlay comments. Each printed label reads
// top→bottom (glyph tops facing right) and ENDS at endY; the typist puts the
// movie's value 10px below that, so the label must end exactly there.
interface SpineField { text: string; cx: number; endY: number }
const SPINE_FIELDS: Record<CaseMedium, SpineField[]> = {
  vhs: [
    { text: 'CATEGORY:', cx: 519, endY: 114 },
    { text: 'RATING:', cx: 497, endY: 89 },
    { text: 'RENT CODE:', cx: 497, endY: 266 },
    { text: 'DIST:', cx: 497, endY: 358 },
  ],
  dvd: [
    { text: 'CATEGORY:', cx: 518, endY: 187 },
    { text: 'RATING:', cx: 498, endY: 158 },
    { text: 'RENT CODE:', cx: 498, endY: 335 },
    { text: 'DIST:', cx: 498, endY: 427 },
  ],
};

// ─── Small print helpers ─────────────────────────────────────────────────────

// Deterministic PRNG for the barcode stripes (same seed → same print every
// boot, matching logo-renderer's torn-edge philosophy).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Vertical column reading top→bottom (glyph tops right), starting at yTop —
// the same orientation video-case's drawVerticalText types the form values
// in. Returns the column's downward extent.
function vTextDown(ctx: CanvasRenderingContext2D, text: string, cx: number, yTop: number, font: string, fill: string): number {
  ctx.font = font;
  const len = ctx.measureText(text).width;
  ctx.save();
  ctx.fillStyle = fill;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.translate(cx, yTop);
  ctx.rotate(Math.PI / 2);
  ctx.fillText(text, 0, 0);
  ctx.restore();
  return len;
}

// Same column but positioned by where it must END (the form labels are all
// specified by their end coordinate, since the typed value follows them).
function vTextDownEndingAt(ctx: CanvasRenderingContext2D, text: string, cx: number, yEnd: number, font: string, fill: string): void {
  ctx.font = font;
  const len = ctx.measureText(text).width;
  vTextDown(ctx, text, cx, yEnd - len, font, fill);
}

// Vertical column reading bottom→top (glyph tops LEFT), drawn upward from
// yBottom — the orientation of the scans' printed right-edge placeholder line
// and their giant front wordmark.
function vTextUp(ctx: CanvasRenderingContext2D, text: string, cx: number, yBottom: number, font: string, fill: string): number {
  ctx.font = font;
  const len = ctx.measureText(text).width;
  ctx.save();
  ctx.fillStyle = fill;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.translate(cx, yBottom);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(text, 0, 0);
  ctx.restore();
  return len;
}

// Largest brand-font size ≤ basePx at which `text` fits maxLen (single-shot
// proportional shrink, same approach as video-case's fitFontPx).
function fitSpecFontPx(ctx: CanvasRenderingContext2D, spec: LogoSpec, text: string, basePx: number, maxLen: number, minPx = 10): number {
  ctx.font = getLogoFontString(spec, basePx);
  const m = ctx.measureText(text).width;
  return m <= maxLen ? basePx : Math.max(minPx, Math.floor((basePx * maxLen) / m));
}

function fitArialPx(ctx: CanvasRenderingContext2D, text: string, basePx: number, weight: string, maxLen: number, minPx = 10): number {
  ctx.font = `${weight} ${basePx}px Arial, sans-serif`;
  const m = ctx.measureText(text).width;
  return m <= maxLen ? basePx : Math.max(minPx, Math.floor((basePx * maxLen) / m));
}

// Greedy word wrap (measuring font must already be set on ctx).
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width <= maxWidth) cur = test;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Spine barcode: print stripes stacked DOWN the spine (each stripe a short
// horizontal bar), the way the scans' rotated barcodes read. Deterministic.
function drawSpineBarcode(ctx: CanvasRenderingContext2D, rand: () => number, x: number, y: number, w: number, h: number, ink: string): void {
  ctx.fillStyle = ink;
  let cy = y;
  while (cy < y + h - 1) {
    const bar = 1 + Math.floor(rand() * 3);        // stripe thickness 1-3px
    const gap = 1 + Math.floor(rand() * 3);
    ctx.fillRect(x, cy, w, Math.min(bar, y + h - cy));
    cy += bar + gap;
  }
}

// Horizontal barcode (top address strip): classic vertical bars.
function drawFlatBarcode(ctx: CanvasRenderingContext2D, rand: () => number, x: number, y: number, w: number, h: number, ink: string): void {
  ctx.fillStyle = ink;
  let cx = x;
  while (cx < x + w - 1) {
    const bar = 1 + Math.floor(rand() * 3);
    const gap = 1 + Math.floor(rand() * 3);
    ctx.fillRect(cx, y, Math.min(bar, x + w - cx), h);
    cx += bar + gap;
  }
}

// A subtle drop shadow for drawLogo text on paper — the renderer's default
// sign shadow is too deep for a printed wrap.
const PRINT_SHADOW = { color: 'rgba(0,0,0,0.22)', blur: 2, ox: 1, oy: 1.5 };

// Brand wording used across the printed fixtures ("<BRAND> VIDEO RENTAL"):
// mainText + subText + RENTAL, collapsed when subText is empty.
function brandRentalLine(spec: LogoSpec): string {
  return `${spec.mainText} ${spec.subText} RENTAL`.replace(/\s+/g, ' ').trim().toUpperCase();
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Settings-drawer label for the procedural variants, derived from the brand. */
export function customWrapLabel(spec: LogoSpec, kind: 'custom' | 'custom-ticket'): string {
  const brand = spec.mainText.toUpperCase().trim() || 'CUSTOM';
  return kind === 'custom' ? `${brand} — custom wrap` : `${brand} — custom ticket back`;
}

// One canvas per (kind, medium) per boot. The spec can't change under us
// mid-boot (brand edits persist to localStorage and reload, like theme /
// medium changes), so kind+medium is a sufficient key.
const wrapCache = new Map<string, HTMLCanvasElement>();
function cachedWrap(key: string, build: () => HTMLCanvasElement): HTMLCanvasElement {
  let c = wrapCache.get(key);
  if (!c) {
    c = build();
    wrapCache.set(key, c);
  }
  return c;
}

// The wrap prints brand text in the spec's font. main.ts gates boot on
// document.fonts.load() on the emblem family, but the harness constructs the
// scene directly — so gate the FIRST wrap build here: synchronous when the
// face is already available (the common case), else one deferred build when
// it resolves. Panel draws pass onUpdate callbacks for exactly this (async
// scan decodes), so a deferred first paint refreshes textures the same way.
let wrapFontsReady = false;
export function ensureWrapFontsLoaded(spec: LogoSpec, cb: () => void): void {
  if (wrapFontsReady || typeof document === 'undefined' || !document.fonts) {
    cb();
    return;
  }
  const done = () => { wrapFontsReady = true; cb(); };
  // The spec's family resolves to a BUNDLED face (or a pack-registered runtime
  // one) via getLogoFontString, so awaiting the bundle is what actually
  // guarantees glyphs. fonts.check() cannot answer "is this registered?" — for
  // a family with no declared face it returns TRUE (an unknown family
  // "matches" as a system font), which is exactly the harness situation.
  const probe = getLogoFontString(spec, 16);
  if (document.fonts.check(probe)) {
    done();
    return;
  }
  Promise.all([bundledFontsReady(), document.fonts.load(probe)]).then(done, done);
}

/** The 'custom' cream-template wrap (typed-metadata compatible). */
export function buildCustomTemplateWrap(spec: LogoSpec, medium: CaseMedium): HTMLCanvasElement {
  return cachedWrap(`custom-${medium}`, () => drawTemplateWrap(spec, medium));
}

/** The 'custom-ticket' all-emblem wrap (plain — no metadata anywhere). */
export function buildCustomTicketWrap(spec: LogoSpec, medium: CaseMedium): HTMLCanvasElement {
  return cachedWrap(`custom-ticket-${medium}`, () => drawTicketWrap(spec, medium));
}

// ─── The cream/white TEMPLATE wrap ───────────────────────────────────────────
// Geometry is the scans', pixel for pixel where the typists care:
//   VHS (1024×762, folds x 473/589): spine labels end y 114/89/266/358 at
//   cx 519/497; big spine brand line ends y 414 (the typed title strip goes in
//   the blank y 424-536 gap, then the barcode from y 549); back label window
//   interior x 104-400 with the printed heading ending y≈140 (typed title
//   starts y 152) and frame bottom y 446; front placeholder line at cx 1004.5
//   centred on y 354.5 — the typist erases x 990-1018 × y 200-510 in stock
//   cream and needs the whole x≈990-1018 column clear for long titles.
//   DVD (1024×683, folds x 478/558): labels end y 187/158/335/427 at
//   cx 518/498; the big spine line ends y≈473 with the barcode from y 493 (no
//   typed spine title on DVD); back window interior x 48-350, heading ends
//   y≈125 (typed title starts y 140), window bottom y 500 (checkout chart
//   below); front placeholder at cx 995.5 centred on y 374, erase region
//   x 978-1014 × y 205-545 in white, column x≈986-1005 kept clear.
function drawTemplateWrap(spec: LogoSpec, medium: CaseMedium): HTMLCanvasElement {
  return medium === 'vhs' ? drawVhsTemplateWrap(spec) : drawDvdTemplateWrap(spec);
}

// The printed store address block (top of the back AND front faces). The
// address is fictional — a brand pack overrides all three lines; only the
// brand line comes from the spec.
function drawAddressBlock(ctx: CanvasRenderingContext2D, spec: LogoSpec, cx: number, ink: string): void {
  const brand = `${spec.mainText} ${spec.subText}`.replace(/\s+/g, ' ').trim().toUpperCase() || 'VIDEO RENTAL';
  ctx.save();
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const bpx = fitArialPx(ctx, brand, 14, 'bold', 210, 8);
  ctx.font = `bold ${bpx}px Arial, sans-serif`;
  ctx.fillText(brand, cx, 26);
  ctx.font = 'bold 10px Arial, sans-serif';
  ctx.fillText(brandString('wrap-address-street', '2 4 0 0   K I N G F I S H E R   P K W Y'), cx, 40);
  ctx.font = '10px Arial, sans-serif';
  ctx.fillText(brandString('wrap-address-city', 'C E D A R  F A L L S ,  I A      5 0 6 1 3'), cx, 53);
  ctx.font = 'bold 10px Arial, sans-serif';
  ctx.fillText(brandString('wrap-address-store', 'S T O R E  #    0 1 1 7'), cx, 66);
  ctx.restore();
}

// A printed brand panel: square sides, a softly rounded top edge, full bleed
// off the bottom of the wrap. Deliberately a CLEAN panel — a ripped edge is a
// specific chain's trade dress, and this store's print is its own.
// `rand` is kept in the signature so the caller's seeded stream stays in step
// across panels (the paper grain and the placeholder jitter draw from it).
function printedPanelPath(_rand: () => number, x0: number, x1: number, yTop: number, _depth: number, yBottom: number): Path2D {
  const path = new Path2D();
  const r = Math.min(18, (x1 - x0) / 8);
  path.moveTo(x0, yBottom);
  path.lineTo(x0, yTop + r);
  path.quadraticCurveTo(x0, yTop, x0 + r, yTop);
  path.lineTo(x1 - r, yTop);
  path.quadraticCurveTo(x1, yTop, x1, yTop + r);
  path.lineTo(x1, yBottom);
  path.closePath();
  return path;
}


// ── VHS template (recreates the 1988 "Standard Version" wrap) ────────────────
function drawVhsTemplateWrap(spec: LogoSpec): HTMLCanvasElement {
  const W = IMG_W, H = IMG_H.vhs; // 1024×762
  const stock = STOCK.vhs, ink = INK.vhs;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const rand = mulberry32(spec.tornSeed ^ 0x56485320);
  const brandLine = brandRentalLine(spec);
  const brandName = `${spec.mainText} ${spec.subText}`.replace(/\s+/g, ' ').trim().toUpperCase();
  const pc = wrapPrintColors(spec); // scan-sampled inks for untouched defaults
  // Deterministic store barcode number, printed scan-style ("390 39...").
  const bcDigits = `390 39${String(10000000 + ((spec.tornSeed * 7919) % 90000000)).slice(0, 8)}`;

  // Paper stock + faint fold creases at the crop boundaries.
  ctx.fillStyle = stock;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  ctx.fillRect(473, 0, 1, H);
  ctx.fillRect(588, 0, 1, H);

  // ── BACK top strip: barcode + number left, address block centred ──
  ctx.fillStyle = ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 15px Arial, sans-serif';
  ctx.fillText(bcDigits, 78, 30);
  drawFlatBarcode(ctx, rand, 80, 38, 112, 26, ink);
  drawAddressBlock(ctx, spec, 345, ink);

  // ── BACK panel: printed brand panel bleeding off the bottom ──
  const backPanel = printedPanelPath(rand, 65, 441, 82, 30, H);
  ctx.fillStyle = pc.body;
  ctx.fill(backPanel);
  // Rights micro-print down the panel's left edge, where a real sleeve prints
  // its corporate line. Fictional by construction; a pack overrides it.
  vTextDown(ctx, brandString('wrap-rights-line', `${brandName} — ALL RIGHTS RESERVED`),
    74, 112, '8.5px Arial, sans-serif', 'rgba(255,255,255,0.92)');

  // Label window: stock card set into the panel. Interior x 104-400 with the
  // printed heading ending y≈140 — the typist types the title from y 152.
  ctx.fillStyle = stock;
  ctx.fillRect(95, 105, 313, 350); // x 95-408, y 105-455
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(96.5, 106.5, 310, 347);
  ctx.fillStyle = ink;
  const headPx = fitArialPx(ctx, brandLine, 15, 'bold', 290, 9);
  ctx.font = `bold ${headPx}px Arial, sans-serif`;
  ctx.fillText(brandLine, 105, 133);

  // Care print on the panel below the window — the scan's own brand-neutral
  // wording, gold heads (textColor) + white body, kept inside the ticket
  // frame's verticals (x 90.5-408.5) like the print.
  const head = (t: string, y: number, px: number): number => {
    ctx.fillStyle = spec.textColor;
    ctx.font = `bold ${px}px Arial, sans-serif`;
    let yy = y;
    for (const ln of wrapLines(ctx, t, 291)) { ctx.fillText(ln, 104, yy); yy += px + 2; }
    return yy;
  };
  const body = (t: string, y: number): number => {
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = '10.5px Arial, sans-serif';
    let yy = y;
    for (const ln of wrapLines(ctx, t, 291)) { ctx.fillText(ln, 104, yy); yy += 12; }
    return yy;
  };
  let cy = 482;
  cy = head('PLEASE REWIND AFTER VIEWING', cy, 17);
  cy = head('VIEWING HINTS:', cy, 17) + 3;
  cy = head("IF THE PICTURE ROLLS, OR HAS A LOT OF ''INTERFERENCE,'' ADJUST THE TRACKING DEVICE ON YOUR VCR.", cy, 11.5);
  cy = body('(This solves 90% of all picture problems. If difficulties persist, adjust your TV controls. If you still have problems, bring the cassette back to the store.)', cy) + 3;
  cy = head('DO NOT LEAVE THIS CASSETTE IN A HOT PLACE, LIKE GLOVE BOX OR CAR SEAT.', cy, 11.5);
  cy = body('Always view at room temperature (above 50º or below 85º) to prevent damage.', cy) + 3;
  cy = head("DO NOT OPEN THE CASSETTE'S PLASTIC SHELL, OR TOUCH THE TAPE ITSELF.", cy, 11.5);
  cy = body('(Doing so can cause serious damage or erasure.)', cy) + 3;
  head('TAPES MUST BE RETURNED TO LOCATION RENTED.', cy, 11);
  // Back ticket frame, printed like the scan's: the verticals run OPEN-ENDED
  // up into the tear (clipped by the torn edge — no closing line across the
  // top) and only close at the bottom, above the punched half-circle; the
  // extra horizontal under the label window is the care-panel divider the
  // print carries.
  ctx.strokeStyle = pc.stripe;
  ctx.lineWidth = 2;
  ctx.save();
  ctx.clip(backPanel);
  ctx.beginPath();
  ctx.moveTo(90.5, 60);
  ctx.lineTo(90.5, 714.5);
  ctx.moveTo(408.5, 60);
  ctx.lineTo(408.5, 714.5);
  ctx.moveTo(89.5, 462.5);
  ctx.lineTo(409.5, 462.5);
  ctx.moveTo(89.5, 714.5);
  ctx.lineTo(409.5, 714.5);
  ctx.stroke();
  ctx.restore();
  // ── SPINE: the printed rental form ──
  // Labels end exactly where the typists expect them; 18px regular Arial in
  // the print ink, same as the values that get typed after them.
  for (const f of SPINE_FIELDS.vhs) {
    vTextDownEndingAt(ctx, f.text, f.cx, f.endY, '18px Arial, sans-serif', ink);
  }
  // Big printed spine brand line — this is the spine's TITLE PLACEHOLDER, so it
  // must sit in the column the typist erases (x 527-557, y 14-426 in
  // drawStandardVhsOverlays) or the movie's title prints on top of it. Ends
  // y 414; the y 424-536 gap stays BLANK; rotated barcode from y 549.
  const bp = fitArialPx(ctx, brandLine, 28, 'bold', 395, 12);
  ctx.font = `bold ${bp}px Arial, sans-serif`;
  const blen = ctx.measureText(brandLine).width;
  vTextDown(ctx, brandLine, 542, 414 - blen, `bold ${bp}px Arial, sans-serif`, ink);
  drawSpineBarcode(ctx, rand, 480, 549, 50, 105, ink);
  vTextDown(ctx, bcDigits.replace(/\s/g, ''), 548, 549, '14px Arial, sans-serif', ink);

  // ── FRONT top: address block + barcode top-right (stops left of the title
  // column at x≈990, which must stay clear stock for the typed title). ──
  drawAddressBlock(ctx, spec, 700, ink);
  ctx.fillStyle = ink;
  ctx.textAlign = 'left';
  ctx.font = 'bold 15px Arial, sans-serif';
  ctx.fillText(bcDigits, 828, 30);
  drawFlatBarcode(ctx, rand, 830, 38, 125, 26, ink);

  // ── FRONT panel: the giant brand ticket ──
  const frontPanel = printedPanelPath(rand, 630, 970, 104, 33, H);
  ctx.fillStyle = pc.body;
  ctx.fill(frontPanel);

  const hasBand = spec.bandText !== '';
  const hasTag = spec.taglineText !== '';
  const hasSub = spec.subText !== '';
  const contentTop = 148;
  const contentBottom = hasBand ? 638 : 700;
  // Ticket pinstripes, run the way the scan prints them: the verticals are
  // OPEN-ENDED at the tear — they ride up under the rip and get cut by the
  // torn edge (clipped to the panel), with no closing line across the top —
  // and only close at the bottom, where the band box above the punched
  // half-circle ends the ticket. Scan geometry: verticals x 654.5 / 952.5
  // (plus the 844.5 tagline divider stopping at the band), band lines
  // y 662.5 / 712.5.
  const bandTop = 662.5;
  const bandBottom = 712.5;
  const stripeBottom = hasBand ? bandBottom : H;
  ctx.strokeStyle = pc.stripe;
  ctx.lineWidth = 2.25;
  ctx.save();
  ctx.clip(frontPanel);
  ctx.beginPath();
  ctx.moveTo(654.5, 60);
  ctx.lineTo(654.5, stripeBottom);
  ctx.moveTo(952.5, 60);
  ctx.lineTo(952.5, stripeBottom);
  if (hasTag) {
    ctx.moveTo(844.5, 60);
    ctx.lineTo(844.5, hasBand ? bandTop : H);
  }
  if (hasBand) {
    ctx.moveTo(653.5, bandTop);
    ctx.lineTo(953.5, bandTop);
    ctx.moveTo(653.5, bandBottom);
    ctx.lineTo(953.5, bandBottom);
  }
  ctx.stroke();
  ctx.restore();
  if (hasBand) {
    // Bottom count strip, printed upside-down exactly like the scan's
    // "10,000 VIDEOS" — and in a LIGHT plain sans, slightly condensed: the
    // print sets this strip in a much lighter face (~4px strokes on a 28px
    // cap, 222px long) than the brand slab, which read far too bold here.
    const bt = spec.bandText.toUpperCase();
    const bpx = fitArialPx(ctx, bt, 38, 'normal', 264, 12);
    ctx.save();
    ctx.translate(801, (bandTop + bandBottom) / 2 + 1);
    ctx.rotate(Math.PI);
    ctx.scale(0.85, 1);
    ctx.font = `${bpx}px Arial, sans-serif`;
    ctx.fillStyle = pc.letter;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bt, 0, 0);
    ctx.restore();
  }
  if (hasTag) {
    // Tagline column right of its divider ("THE REEL SUPERSTORE" on the
    // videos wrap). The scan anchors the glyph run at the BOTTOM — it ends
    // 19px above the band (y 643) and runs 402px up the column — rather than
    // centring it.
    const tt = spec.taglineText.toUpperCase();
    const tpx = fitSpecFontPx(ctx, spec, tt, 56, 402, 12);
    ctx.font = getLogoFontString(spec, tpx);
    vTextUp(ctx, tt, 897, hasBand ? 643 : H - 20, getLogoFontString(spec, tpx), pc.letter);
  }
  // Main wordmark column (+ optional sub column, top-aligned like the print's
  // VIDEO line), reading bottom→top up the front face. KNOCKED OUT of the
  // panel — the stock shows through the letters, which is how a one-ink print
  // gets a second colour without a second pass.
  const colsRight = hasTag ? 836 : 945;
  const colLen = contentBottom - contentTop;
  const colMidY = (contentTop + contentBottom) / 2;
  const RW = colsRight - 655;
  const main = spec.mainText.toUpperCase();
  const mpx = fitSpecFontPx(ctx, spec, main, RW * (hasSub ? 0.58 : 0.68), colLen, 16);
  const mainCx = 655 + (hasSub ? RW * 0.36 : RW * 0.5);
  ctx.font = getLogoFontString(spec, mpx);
  const mlen = ctx.measureText(main).width;
  const mainBottom = colMidY + mlen / 2;
  vTextUp(ctx, main, mainCx, mainBottom, getLogoFontString(spec, mpx), stock);
  if (hasSub) {
    const sub = spec.subText.toUpperCase();
    const spx = fitSpecFontPx(ctx, spec, sub, mpx * 0.42, colLen * 0.6, 10);
    ctx.font = getLogoFontString(spec, spx);
    const slen = ctx.measureText(sub).width;
    vTextUp(ctx, sub, 655 + RW * 0.78, mainBottom - mlen + slen, getLogoFontString(spec, spx), stock);
  }
  drawFrontPlaceholder(ctx, spec, 'vhs');
  return canvas;
}

// ── DVD template (the 2003 rental wrap's printed-form analog) ────────────────
function drawDvdTemplateWrap(spec: LogoSpec): HTMLCanvasElement {
  const W = IMG_W, H = IMG_H.dvd; // 1024×683
  const stock = STOCK.dvd, ink = INK.dvd;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const rand = mulberry32(spec.tornSeed ^ 0x44564420);
  const brandLine = brandRentalLine(spec);

  // Paper stock + faint fold creases at the crop boundaries.
  ctx.fillStyle = stock;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.07)';
  ctx.fillRect(478, 0, 1, H);
  ctx.fillRect(557, 0, 1, H);

  // Top strip (BACK PANEL ONLY — the spine's form labels start right at the
  // top, and the front's title column must stay clear white full-height).
  ctx.fillStyle = ink;
  ctx.fillRect(16, 14, 446, 1);
  ctx.fillRect(16, 44, 446, 1);
  drawFlatBarcode(ctx, rand, 24, 18, 88, 22, ink);
  const stripText =
    `© ${spec.mainText.toUpperCase()} ${spec.subText.toUpperCase()}`.trim() + ' · ALL RIGHTS RESERVED';
  const stripPx = fitArialPx(ctx, stripText, 11, 'normal', 306, 8);
  ctx.font = `${stripPx}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(stripText, (128 + 462) / 2, 29);

  // ── BACK: label window (interior x 48-350; heading ends y≈125, the typist
  // types the title from y 140; window bottom y 500) ──
  const win = { x0: 40, y0: 46, x1: 358, y1: 500, headEndY: 125 };
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  ctx.strokeRect(win.x0, win.y0, win.x1 - win.x0, win.y1 - win.y0);
  ctx.lineWidth = 0.75;
  ctx.strokeRect(win.x0 + 4, win.y0 + 4, win.x1 - win.x0 - 8, win.y1 - win.y0 - 8);
  const headMax = win.x1 - win.x0 - 24;
  const hp = fitSpecFontPx(ctx, spec, brandLine, 22, headMax, 11);
  ctx.font = getLogoFontString(spec, hp);
  ctx.fillStyle = spec.bodyColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(brandLine, (win.x0 + win.x1) / 2, win.headEndY - 6);
  ctx.fillStyle = ink;
  ctx.fillRect(win.x0 + 12, win.headEndY + 2, win.x1 - win.x0 - 24, 0.75);

  // Checkout-day chart under the window — its top edge shares the window's
  // bottom border ("window bottom (checkout-day chart starts) y≈500"); the
  // caption goes UNDER the grid, clear of the frame.
  const chart = { x0: 40, y0: 500, x1: 440, y1: 636 };
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = ink;
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillText('RETURN BY NOON ON THE DAY MARKED ABOVE', chart.x0, chart.y1 + 10);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.25;
  ctx.strokeRect(chart.x0, chart.y0, chart.x1 - chart.x0, chart.y1 - chart.y0);
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const colW = (chart.x1 - chart.x0) / 7;
  ctx.font = 'bold 11px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 7; i++) {
    const cx0 = chart.x0 + i * colW;
    if (i) { ctx.beginPath(); ctx.moveTo(cx0, chart.y0); ctx.lineTo(cx0, chart.y1); ctx.stroke(); }
    ctx.fillText(days[i], cx0 + colW / 2, chart.y0 + 12);
  }
  ctx.beginPath();
  ctx.moveTo(chart.x0, chart.y0 + 24);
  ctx.lineTo(chart.x1, chart.y0 + 24);
  ctx.stroke();
  // Vertical brand strip right of the window (the store-website strip the
  // typists' wMax deliberately stops short of, at x≈363).
  ctx.fillStyle = ink;
  ctx.fillRect(366, 40, 0.75, 460);
  const strip = `${spec.mainText} ${spec.subText}`.trim().toUpperCase();
  const sp = fitSpecFontPx(ctx, spec, strip, 30, 430, 12);
  vTextUp(ctx, strip, 414, 495, getLogoFontString(spec, sp), spec.bodyColor);

  // ── SPINE: form labels + the big line running nearly the full height
  // (ends ~y 473, only a ~20px gap before the barcode at y 493 — no typed
  // spine title on this medium) ──
  for (const f of SPINE_FIELDS.dvd) {
    vTextDownEndingAt(ctx, f.text, f.cx, f.endY, '18px Arial, sans-serif', ink);
  }
  const bp = fitSpecFontPx(ctx, spec, brandLine, 28, 420, 12);
  ctx.font = getLogoFontString(spec, bp);
  const blen = ctx.measureText(brandLine).width;
  vTextDown(ctx, brandLine, 540, 473 - blen, getLogoFontString(spec, bp), spec.bodyColor);
  drawSpineBarcode(ctx, rand, 486, 493, 66, 70, ink);

  // ── FRONT: rental banner, horizontal emblem, small brand footer — all kept
  // left of x≈980 so the typed title column stays white. ──
  ctx.fillStyle = spec.textColor;
  ctx.fillRect(586, 46, 394, 66);
  const bannerText = 'DVD · 1-WEEK RENTAL';
  const bnp = fitSpecFontPx(ctx, spec, bannerText, 34, 360, 14);
  ctx.font = getLogoFontString(spec, bnp);
  ctx.fillStyle = spec.bodyColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(bannerText, 783, 80);
  drawLogo(ctx, spec, { x: 791 - 400 / 2, y: 380 - 420 / 2, w: 400, h: 420, shadow: PRINT_SHADOW });
  ctx.fillStyle = ink;
  ctx.font = '13px Arial, sans-serif';
  ctx.fillText(brandLine, 783, 640);

  drawFrontPlaceholder(ctx, spec, 'dvd');
  return canvas;
}

// Printed right-edge title placeholder — the "<BRAND> VIDEO RENTAL" line the
// rental print carries. Same column, centre, orientation, ~19px
// bold and ink as the print, and kept INSIDE the typist's erase rect
// (VHS x 990-1018 × y 200-510; DVD x 978-1014 × y 205-545) so replacing it
// with the movie's title leaves no ghost.
function drawFrontPlaceholder(ctx: CanvasRenderingContext2D, spec: LogoSpec, medium: CaseMedium): void {
  const brandLine = brandRentalLine(spec);
  const ph = medium === 'vhs'
    ? { cx: 1004.5, centerY: 354.5, maxLen: 289 }
    : { cx: 995.5, centerY: 374, maxLen: 288 };
  const pp = fitArialPx(ctx, brandLine, 19, 'bold', ph.maxLen, 11);
  ctx.font = `bold ${pp}px Arial, sans-serif`;
  const plen = ctx.measureText(brandLine).width;
  vTextUp(ctx, brandLine, ph.cx, ph.centerY + plen / 2, `bold ${pp}px Arial, sans-serif`, INK[medium]);
}

// ─── The all-emblem TICKET wrap ──────────────────────────────────────────────
// Analog of the ticket-* scans: brand emblem printed huge on both faces and a
// brand-colored spine band with pinstripes + vertical brand text. Registered
// `plain` in COVER_VARIANTS, so nothing ever types onto it — the print IS the
// whole design. Band edges land exactly on the crop fold lines the variant's
// layout declares (VHS: TICKET_WRAP_LAYOUT's x 484/571 of 1024; DVD: the base
// layout's x 478/558), so each face crops band-edge to wrap-edge.
function drawTicketWrap(spec: LogoSpec, medium: CaseMedium): HTMLCanvasElement {
  const W = IMG_W, H = IMG_H[medium];
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = STOCK[medium];
  ctx.fillRect(0, 0, W, H);

  // Spine band: body fill, pinstripes riding its edges, brand text reading
  // top→bottom (the printed-spine direction the cream scans use). Colors run
  // through the same scan-sampled swap as the template wrap, so the default
  // brand prints in the ticket-* scans' deep blue + orange.
  const pc = wrapPrintColors(spec);
  const band = medium === 'vhs' ? { x0: 484, x1: 571 } : { x0: 478, x1: 558 };
  ctx.fillStyle = pc.body;
  ctx.fillRect(band.x0, 0, band.x1 - band.x0, H);
  ctx.fillStyle = pc.stripe;
  ctx.fillRect(band.x0 + 5, 0, 2.5, H);
  ctx.fillRect(band.x1 - 7.5, 0, 2.5, H);
  const spineText = `${spec.mainText} ${spec.subText}`.trim().toUpperCase();
  const sPx = fitSpecFontPx(ctx, spec, spineText, medium === 'vhs' ? 44 : 38, H - 80, 14);
  ctx.font = getLogoFontString(spec, sPx);
  const sLen = ctx.measureText(spineText).width;
  vTextDown(ctx, spineText, (band.x0 + band.x1) / 2, (H - sLen) / 2, getLogoFontString(spec, sPx), pc.letter);

  // Giant emblem on each face (color-swapped spec copy carries the print
  // inks; the swap is color-only so builtin specs keep their vector route).
  // VHS faces are portrait, so the emblem box is authored landscape and
  // rotated -90° (reads bottom→top, like the scans' giant wordmark);
  // DVD-era prints sat horizontal.
  const printSpec = { ...spec, bodyColor: pc.body, textColor: pc.letter, borderColor: pc.stripe };
  for (const f of [{ cx: band.x0 / 2 }, { cx: (band.x1 + W) / 2 }]) {
    if (medium === 'vhs') {
      drawLogo(ctx, printSpec, {
        x: f.cx - 640 / 2, y: H / 2 - 360 / 2, w: 640, h: 360,
        rotation: -Math.PI / 2, shadow: PRINT_SHADOW,
      });
    } else {
      drawLogo(ctx, printSpec, {
        x: f.cx - 450 / 2, y: H / 2 - 600 / 2, w: 450, h: 600,
        shadow: PRINT_SHADOW,
      });
    }
  }
  return canvas;
}
