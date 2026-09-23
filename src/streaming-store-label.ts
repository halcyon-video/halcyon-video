// Service selection uses the existing printed metadata window. Ordinary
// inspection retains the normal wrap, including its availability credits.
import type { Movie } from './jellyfin';
import { scanColor, type BoxLayout } from './video-case';
import { isStreamingChoiceActive, drawStreamingChoiceOverlays } from './streaming-checkout';

export function drawStreamingStoreLabel(ctx: CanvasRenderingContext2D,
  layout: BoxLayout, movie: Movie): void {
  if (!movie.streaming || !isStreamingChoiceActive(movie)) return;
  const window = layout.standardVhs ? { x: 115, y: 152, width: 280, bottom: 440 }
    : layout.dvdBlue ? { x: 60, y: 140, width: 300, bottom: 389 }
    : { x: 48, y: 140, width: 302, bottom: 490 };
  ctx.save();
  ctx.fillStyle = layout.dvd2003 ? '#fcfdfa' : scanColor(layout.standardVhs ? 'vhs' : 'dvd', '#f3eadb');
  ctx.fillRect(window.x, window.y, window.width, window.bottom - window.y);
  drawStreamingChoiceOverlays(ctx, { ...layout, window }, movie);
  ctx.restore();
}
