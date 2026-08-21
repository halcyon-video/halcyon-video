// Die-cut corner-label stickers for a case standing in for a title the store
// doesn't have on the shelf for real: a missing entry of a partly-owned
// collection or an inline discovery suggestion (REQUEST / gold COMING SOON,
// see jellyseerr.ts), or a streaming-service title (WATCH ON <SERVICE>, GH
// #86 — see streaming-catalog.ts). Extracted out of video-case.ts (which
// sits at its enforced line budget, tools/check-file-budget.mjs) — a straight
// move, not a rewrite; every comment/geometry constant here is unchanged from
// the original.
import { getActiveLogoSpec } from './logo-spec';
import { getActiveTheme } from './themes';
import { drawLogo } from './logo-renderer';
import { getMovieOffsets } from './video-case';

const wrapLogoSpec = () => getActiveLogoSpec(getActiveTheme());

// A case for a title the store doesn't have — a missing entry of a collection
// you partly own (see jellyseerr.ts's fetchCollectionGaps) or an inline
// discovery suggestion (fetchDiscoverMovies): it stands in its real
// alphabetical/chronological spot on the shelf, so it needs to read as "not
// ours" up close without shouting across the aisle. A small store-logo
// sticker in the bottom-right corner does that — and with extraCopiesCount
// returning 0 there are no backstock copies behind it, which is the cue you
// actually notice from a distance.
//
// Once the title has been ORDERED through Jellyseerr the label flips to the
// requested variant: brand colours swapped (gold body, blue lettering),
// reading COMING SOON, and stamped slightly larger so a live re-stamp covers
// the original label completely — the clerk slapping a new sticker over the
// old one.
/**
 * Shared paint routine behind stampCollectionGapSticker and
 * stampStreamingSticker: a die-cut corner label using the store's own
 * LogoSpec board/ticket shape with a text override, in the bottom-right
 * corner. `widthFrac` is a fraction of the poster width, wide enough for the
 * given `text` to stay legible once drawLogo's shrink-to-fit takes it (a
 * longer label like "WATCH ON NETFLIX" wants more room than "REQUEST").
 */
function stampCornerLabel(
  data: Uint8Array,
  w: number,
  h: number,
  movieId: string,
  text: string,
  widthFrac: number,
  altColors: boolean,
): Uint8Array {
  // Same hand-applied jitter the 4K badge uses, so a shelf of these doesn't
  // look machine-stickered. None of the titles that carry this label are
  // ever is4k (you don't own the file), so the two stickers can't collide.
  const { r1, r2, r3 } = getMovieOffsets(movieId);
  const spec = wrapLogoSpec();
  const label = altColors
    ? { ...spec, bodyColor: spec.textColor, textColor: spec.bodyColor, borderColor: spec.bodyColor }
    : spec;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(w, h);
  imgData.data.set(data);
  ctx.putImageData(imgData, 0, 0);

  // Geometry as a fraction of the poster so both resolutions place
  // the sticker identically. Note the poster buffer is stored
  // bottom-up, so the BOTTOM-right corner is a LOW y here — the same
  // inversion the 4K badge compensates for when it draws its text.
  const stickerW = w * widthFrac;
  const stickerH = stickerW / 1.647; // the logo board's 1400x850 aspect
  const cx = w * 0.76 + r1 * (w * 0.012);
  const cy = h * 0.13 + r2 * (h * 0.010);
  const radius = stickerW * 0.10;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(r3 * 0.12);

  // Clip to the label before painting the emblem: drawLogo composes
  // a whole sign (board, ticket, wordmark) sized to its own aspect,
  // and without this its body bleeds past the sticker edge.
  ctx.beginPath();
  ctx.roundRect(-stickerW / 2, -stickerH / 2, stickerW, stickerH, radius);
  ctx.save();
  ctx.clip();

  // Backing colour shows through wherever the emblem doesn't reach,
  // so the label is opaque over any poster.
  ctx.fillStyle = label.bodyColor;
  ctx.fillRect(-stickerW / 2, -stickerH / 2, stickerW, stickerH);

  if (w >= 320) {
    // Flip back for the emblem. Pure -1 — the 4K badge's extra 1.45
    // is a stretch on its lettering, not a buffer correction, and
    // would squash the ticket.
    ctx.scale(1, -1);
    drawLogo(ctx, label, {
      x: -stickerW / 2,
      y: -stickerH / 2,
      w: stickerW,
      h: stickerH,
      textOverride: text,
    });
  }
  // At 64x96 the emblem is a few pixels tall and renders as mud, so
  // the low-res layer stays a plain colour chip — enough to say "a
  // sticker is there" until the high-res layer lands.

  ctx.restore(); // drop the clip, keep the transform
  // Die-cut white edge on top, so the label reads as something stuck
  // ON the art rather than printed into it.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.lineWidth = Math.max(1.5, w * 0.008);
  ctx.stroke();

  ctx.restore();
  return new Uint8Array(ctx.getImageData(0, 0, w, h).data);
}

export function stampCollectionGapSticker(
  data: Uint8Array,
  w: number,
  h: number,
  movieId: string,
  requested: boolean
): Uint8Array {
  return stampCornerLabel(
    data, w, h, movieId,
    requested ? 'COMING SOON' : 'REQUEST',
    requested ? 0.37 : 0.34,
    requested,
  );
}

// GH #86: a streaming-service case reads as "not library stock" the same way
// a collection-gap/discovery case does (this file's corner-label machinery),
// but the label never flips state — a streaming title has no order/dismiss
// lifecycle to restamp, so this is stamped once at decode time
// (stampPosterBadges) and never restamped live. Wider than REQUEST/COMING
// SOON's box: "WATCH ON <SERVICE>" is a longer string, and drawLogo's
// shrink-to-fit needs the extra room to stay legible at shelf resolution.
export function stampStreamingSticker(
  data: Uint8Array,
  w: number,
  h: number,
  movieId: string,
  serviceName: string,
): Uint8Array {
  return stampCornerLabel(data, w, h, movieId, `WATCH ON ${serviceName}`, 0.46, false);
}
