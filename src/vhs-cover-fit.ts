// Where a letterboxed cover goes on the 2:3 decode canvas for the narrow VHS
// sleeve (poster-worker's 'vhs' mode). The sleeve shows only the canvas's
// central band (POSTER_CROP_X off each side, video-case.ts), so the art is
// fitted to that band's WIDTH, never its height: bars only ever go above and
// below it. A cover narrower than the sleeve itself overflows the top and
// bottom by a few pixels instead. Fitting the old 262x393 box by both sides
// shrank every cover narrower than 2:3 inside bars on the left and right too.

// The share of the canvas width the sleeve shows: sleeve face over poster face,
// w/h each (CASE_DIMS.vhs and .dvd in video-case.ts, which the worker cannot
// import). 0.82, i.e. 262.5 of the 320 base pixels.
export const VHS_VISIBLE_BAND = (0.365 / 0.667) / (0.445 / 0.667);

// The art runs this many base (320-wide) pixels past each edge of the band, so
// a filtered sample on the crop line never blends in the hidden strip beside it.
const OVERSCAN_PX = 1;

export interface ArtRect { dx: number; dy: number; dw: number; dh: number }

/** The art's rectangle on a W x H canvas (any decode scale; 320x480 is 1x). */
export function vhsLetterboxRect(imgW: number, imgH: number, W: number, H: number): ArtRect {
  const dw = Math.round(W * VHS_VISIBLE_BAND + 2 * OVERSCAN_PX * (W / 320));
  const dh = Math.round(dw * imgH / imgW);
  return { dx: Math.round((W - dw) / 2), dy: Math.round((H - dh) / 2), dw, dh };
}
