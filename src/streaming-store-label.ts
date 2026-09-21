// A readable streaming insert on the existing store sleeve. The surrounding
// wrap still supplies the active house branding, barcode and physical case.
import type { Movie } from './jellyfin';
import { wrapText } from './video-case';
import { STANDARD_INK, streamingAvailabilityText, isStreamingChoiceActive,
  drawStreamingChoiceOverlays } from './streaming-checkout';

export function drawStreamingStoreLabel(ctx: CanvasRenderingContext2D,
  w: number, h: number, movie: Movie): void {
  ctx.save();
  ctx.scale(w / 480, h / 768);
  ctx.fillStyle = '#f3eadb';
  ctx.fillRect(28, 110, 424, 638);
  ctx.strokeStyle = STANDARD_INK;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(28, 110, 424, 638);
  ctx.fillStyle = STANDARD_INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const x = 44, width = 392;
  function lines(text: string, font: string, max: number): string[] {
    ctx.font = font;
    const all = wrapText(ctx, text, width), kept = all.slice(0, max);
    if (all.length > max && kept.length) {
      let last = kept[kept.length - 1];
      while (last && ctx.measureText(last + '…').width > width) last = last.slice(0, -1);
      kept[kept.length - 1] = last + '…';
    }
    return kept;
  }
  let y = 128;
  for (const line of lines(movie.title.toUpperCase(), 'bold 30px Arial, sans-serif', 3)) {
    ctx.fillText(line, x, y); y += 34;
  }
  y += 16;
  if (isStreamingChoiceActive(movie)) {
    drawStreamingChoiceOverlays(ctx, { card: { y } }, movie);
  } else {
    const credits = [
      movie.director ? `DIRECTOR: ${movie.director}` : '',
      movie.actors?.length ? `STARRING: ${movie.actors.slice(0, 3).join(', ')}` : '',
      [movie.year, movie.rating, movie.duration].filter(Boolean).join(' · '),
      movie.genres.slice(0, 3).join(' · '),
      streamingAvailabilityText(movie),
    ].filter(Boolean).flatMap(text => lines(text, '22px Arial, sans-serif', 3));
    const shown = credits.slice(0, 11);
    const creditY = 728 - shown.length * 27;
    for (const line of lines(movie.overview || 'No synopsis available.', '24px Arial, sans-serif',
      Math.max(1, Math.floor((creditY - y - 24) / 30)))) {
      ctx.fillText(line, x, y); y += 30;
    }
    ctx.font = '22px Arial, sans-serif';
    shown.forEach((line, i) => ctx.fillText(line, x, creditY + i * 27));
  }
  ctx.restore();
}
