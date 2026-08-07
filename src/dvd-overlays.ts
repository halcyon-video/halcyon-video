// DVD wrap TYPED-METADATA passes — the fill-in step that types each title's
// own title/synopsis/credits/spine fields onto the two cream-stock DVD wrap
// prints (video-case.ts's `drawBoxOverlays` dispatches here off the layout
// flags). The wrap ARTWORK itself is painted in logo-wrap.ts; this file only
// writes the per-title text onto a full-resolution copy of it.
//
// Extracted from video-case.ts on 2026-08-06, when adding the 'blue' DVD
// variant pushed that file past its 6000-line budget
// (tools/check-file-budget.mjs). Per CLAUDE.md, hitting the ceiling means
// EXTRACT, never raise the budget — same reason hero-lowres-front.ts exists.
// The shared text/measure helpers stay in video-case.ts (they serve the VHS
// passes too) and are imported back here; video-case.ts imports only these
// two painters plus the layout override, so the cycle is function-level and
// resolves at call time, never at module evaluation.
import type { Movie } from './jellyfin';
import {
  drawVerticalText,
  drawVerticalTextUp,
  fitFontPx,
  scanColor,
  spineTextXScale,
  wrapText,
  STANDARD_INK,
  type BoxLayout,
} from './video-case';

/** DVD analog of the VHS blue rental wrap: the print carries a synopsis
 *  window, spine form fields and a front placeholder, so it takes the full
 *  typed-metadata pass (`dvdBlue`) rather than rendering plain. */
export const DVD_BLUE_WRAP_LAYOUT: Partial<BoxLayout> = {
  dvd2003: false,
  dvdBlue: true,
};

// ── 2003 DVD rental wrap fill-in ─────────────────────────────────────────────
// Same printed-form idea as drawStandardVhsOverlays (typed values into a
// printed form), remeasured on this scan's own 1024×683 canvas — its fold
// lines, column positions and window bounds don't match the VHS scan's.
// Coordinates are full-scan pixels, measured off the scan:
//   • spine fields read top→bottom, tops right (drawVerticalText): CATEGORY:
//     column cx≈518 (label ends y≈187), RATING:/RENT CODE:/DIST: column
//     cx≈498 (labels end y≈158, y≈335, y≈427). The big printed spine line
//     (cx≈540, caps x 531-548, y 95-478) is the spine's title placeholder —
//     erased and retyped as the movie's title, sized to end clear of the
//     barcode digits (start y≈492).
//   • back-panel label window: interior x≈48-350, printed "<BRAND> VIDEO
//     RENTAL" heading ends y≈125, window bottom (checkout-day chart starts)
//     y≈500.
//   • front right edge: printed "<BRAND> VIDEO RENTAL" placeholder line
//     at x≈989-1002, y≈230-518 (art background ends ~x974, safe to erase from
//     x≈978), reading bottom→top like the VHS scan's equivalent line.
const DVD_2003_INK = '#0a0a0a'; // sampled print ink (near-black, cooler than VHS's)

export function drawDvd2003Overlays(ctx: CanvasRenderingContext2D, movie: Movie) {
  ctx.save();

  let h = 0;
  for (let i = 0; i < movie.id.length; i++) h = (h * 31 + movie.id.charCodeAt(i)) >>> 0;

  // --- Spine: type real metadata into the printed form fields ---
  const dXs = spineTextXScale('dvd');
  const spineValue = (text: string, cx: number, yTop: number, maxLen: number) => {
    if (!text) return;
    const size = fitFontPx(ctx, text, 18, 'normal', maxLen / dXs, 9);
    drawVerticalText(ctx, text, cx, yTop, `${size}px Arial, sans-serif`, DVD_2003_INK, dXs);
  };
  spineValue((movie.genres[0] || 'FEATURE').toUpperCase(), 518, 197, 260); // CATEGORY:
  spineValue((movie.rating || 'NR').toUpperCase(), 498, 168, 60);          // RATING:
  spineValue(String(10 + (h % 90)), 498, 345, 40);                        // RENT CODE:
  const distributor = (movie.studios?.[0] || String(10000 + (h % 90000))).toUpperCase();
  spineValue(distributor, 498, 437, 54);                                  // DIST:

  // Erase the print's big "<BRAND> VIDEO RENTAL" spine line and set the
  // movie's title in its exact spot (see the coordinate comment above).
  ctx.fillStyle = '#fcfdfa'; // spine label white, sampled beside the line
  ctx.fillRect(526, 80, 30, 408);
  const SPINE_TITLE_MAX = 385 / dXs; // y 95 → 480 after xScale, clear of the barcode digits
  let spineTitle = movie.title.toUpperCase();
  const sSize = fitFontPx(ctx, spineTitle, 36, 'bold', SPINE_TITLE_MAX, 11);
  ctx.font = `bold ${sSize}px Arial, sans-serif`;
  if (ctx.measureText(spineTitle).width > SPINE_TITLE_MAX) {
    while (spineTitle.length > 3 && ctx.measureText(spineTitle + '…').width > SPINE_TITLE_MAX) {
      spineTitle = spineTitle.slice(0, -1);
    }
    spineTitle += '…';
  }
  drawVerticalText(ctx, spineTitle, 540, 95, `bold ${sSize}px Arial, sans-serif`, DVD_2003_INK, dXs);

  // --- Back-panel label window: typed title card under the printed heading ---
  const wx = 48;
  const wMax = 302; // interior right edge ≈ 350, short of the website strip at x≈363
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = DVD_2003_INK;
  const titleSize = 26, overSize = 16, metaSize = 15;
  const windowBottom = 490;
  let y = 140;
  ctx.font = `bold ${titleSize}px Arial, sans-serif`;
  for (const ln of wrapText(ctx, movie.title.toUpperCase(), wMax).slice(0, 3)) {
    ctx.fillText(ln, wx, y);
    y += titleSize + 3;
  }
  y += 8;

  ctx.font = `bold ${metaSize}px Arial, sans-serif`;
  const genreList = movie.genres.slice(0, 3).join(', ').toUpperCase() || 'FEATURE';
  const metaRaw = [
    movie.director ? `DIRECTED BY ${movie.director.toUpperCase()}` : '',
    `${genreList}   ·   RATED ${movie.rating || 'NR'}`,
    `RELEASED ${movie.year}${movie.duration ? `   ·   ${movie.duration}` : ''}`,
  ].filter(Boolean);
  const metaLines: string[] = [];
  for (const m of metaRaw) metaLines.push(...wrapText(ctx, m, wMax));
  const metaTop = windowBottom - metaLines.length * (metaSize + 3);

  ctx.font = `${overSize}px Arial, sans-serif`;
  const maxOverLines = Math.max(0, Math.floor((metaTop - 10 - y) / (overSize + 3)));
  for (const ln of wrapText(ctx, movie.overview || '', wMax).slice(0, maxOverLines)) {
    ctx.fillText(ln, wx, y);
    y += overSize + 3;
  }
  ctx.font = `bold ${metaSize}px Arial, sans-serif`;
  let my = metaTop;
  for (const ln of metaLines) {
    ctx.fillText(ln, wx, my);
    my += metaSize + 3;
  }

  // --- Front right edge: erase the printed placeholder line, set the title ---
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(978, 205, 36, 340);
  const F_TITLE_MAX = 560;
  const fTitle = movie.title.toUpperCase();
  const fSize = fitFontPx(ctx, fTitle, 19, 'bold', F_TITLE_MAX, 11);
  ctx.font = `bold ${fSize}px Arial, sans-serif`;
  const fLen = ctx.measureText(fTitle).width;
  drawVerticalTextUp(ctx, fTitle, 995.5, 374 + fLen / 2, `bold ${fSize}px Arial, sans-serif`, DVD_2003_INK);

  ctx.restore();
}

// ── DVD "Blue" wrap fill-in ─────────────────────────────────────────────────
// Same typed-form idea as drawDvd2003Overlays above, and the SAME DVD spine/
// front-placeholder geometry (that geometry doesn't depend on how the back/
// front panels are styled, so it's reused verbatim rather than re-derived) —
// only the print colors change: cream stock (scanColor-corrected, matching
// drawDvdBlueTemplateWrap's stock in logo-wrap.ts) and the VHS wrap's warm
// ink (STANDARD_INK) instead of the plain white 2003 print's near-black. The
// back-window position (wx/wMax/windowBottom/titleSize below) matches
// drawDvdBlueTemplateWrap's window bounds (x48-376, y104-404) — keep the two
// in step.
export function drawDvdBlueOverlays(ctx: CanvasRenderingContext2D, movie: Movie) {
  ctx.save();

  let h = 0;
  for (let i = 0; i < movie.id.length; i++) h = (h * 31 + movie.id.charCodeAt(i)) >>> 0;

  // --- Spine: type real metadata into the printed form fields (same field
  // positions as the plain DVD wrap's own form) ---
  const dXs = spineTextXScale('dvd');
  const spineValue = (text: string, cx: number, yTop: number, maxLen: number) => {
    if (!text) return;
    const size = fitFontPx(ctx, text, 18, 'normal', maxLen / dXs, 9);
    drawVerticalText(ctx, text, cx, yTop, `${size}px Arial, sans-serif`, STANDARD_INK, dXs);
  };
  spineValue((movie.genres[0] || 'FEATURE').toUpperCase(), 518, 197, 260); // CATEGORY:
  spineValue((movie.rating || 'NR').toUpperCase(), 498, 168, 60);          // RATING:
  spineValue(String(10 + (h % 90)), 498, 345, 40);                        // RENT CODE:
  const distributor = (movie.studios?.[0] || String(10000 + (h % 90000))).toUpperCase();
  spineValue(distributor, 498, 437, 54);                                  // DIST:

  // Erase the print's big "<BRAND> VIDEO RENTAL" spine line and set the
  // movie's title in its exact spot — same erase rect as drawDvd2003Overlays,
  // in this wrap's cream stock instead of white.
  ctx.fillStyle = scanColor('dvd', '#f3eadb');
  ctx.fillRect(526, 80, 30, 408);
  const SPINE_TITLE_MAX = 385 / dXs; // y 95 → 480 after xScale, clear of the barcode digits
  let spineTitle = movie.title.toUpperCase();
  const sSize = fitFontPx(ctx, spineTitle, 34, 'bold', SPINE_TITLE_MAX, 11);
  ctx.font = `bold ${sSize}px Arial, sans-serif`;
  if (ctx.measureText(spineTitle).width > SPINE_TITLE_MAX) {
    while (spineTitle.length > 3 && ctx.measureText(spineTitle + '…').width > SPINE_TITLE_MAX) {
      spineTitle = spineTitle.slice(0, -1);
    }
    spineTitle += '…';
  }
  drawVerticalText(ctx, spineTitle, 540, 95, `bold ${sSize}px Arial, sans-serif`, STANDARD_INK, dXs);

  // --- Back-panel label window: typed title card under the printed heading
  // (window interior x48-376/y104-404 in drawDvdBlueTemplateWrap) ---
  const wx = 60;
  const wMax = 300;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = STANDARD_INK;
  const titleSize = 22, overSize = 14, metaSize = 13;
  const windowBottom = 389; // clear of the window's y404 bottom edge
  let y = 140;
  ctx.font = `bold ${titleSize}px Arial, sans-serif`;
  for (const ln of wrapText(ctx, movie.title.toUpperCase(), wMax).slice(0, 3)) {
    ctx.fillText(ln, wx, y);
    y += titleSize + 3;
  }
  y += 6;

  ctx.font = `bold ${metaSize}px Arial, sans-serif`;
  const genreList = movie.genres.slice(0, 3).join(', ').toUpperCase() || 'FEATURE';
  const metaRaw = [
    movie.director ? `DIRECTED BY ${movie.director.toUpperCase()}` : '',
    `${genreList}   ·   RATED ${movie.rating || 'NR'}`,
    `RELEASED ${movie.year}${movie.duration ? `   ·   ${movie.duration}` : ''}`,
  ].filter(Boolean);
  const metaLines: string[] = [];
  for (const m of metaRaw) metaLines.push(...wrapText(ctx, m, wMax));
  const metaTop = windowBottom - metaLines.length * (metaSize + 3);

  ctx.font = `${overSize}px Arial, sans-serif`;
  const maxOverLines = Math.max(0, Math.floor((metaTop - 10 - y) / (overSize + 3)));
  for (const ln of wrapText(ctx, movie.overview || '', wMax).slice(0, maxOverLines)) {
    ctx.fillText(ln, wx, y);
    y += overSize + 3;
  }
  ctx.font = `bold ${metaSize}px Arial, sans-serif`;
  let my = metaTop;
  for (const ln of metaLines) {
    ctx.fillText(ln, wx, my);
    my += metaSize + 3;
  }

  // --- Front right edge: erase the printed placeholder line, set the title
  // (same column as the plain DVD wrap's own placeholder) ---
  ctx.fillStyle = scanColor('dvd', '#f3eadb');
  ctx.fillRect(978, 205, 36, 340);
  const F_TITLE_MAX = 560;
  const fTitle = movie.title.toUpperCase();
  const fSize = fitFontPx(ctx, fTitle, 18, 'bold', F_TITLE_MAX, 11);
  ctx.font = `bold ${fSize}px Arial, sans-serif`;
  const fLen = ctx.measureText(fTitle).width;
  drawVerticalTextUp(ctx, fTitle, 995.5, 374 + fLen / 2, `bold ${fSize}px Arial, sans-serif`, STANDARD_INK);

  ctx.restore();
}