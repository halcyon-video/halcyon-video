import * as THREE from 'three';
import { markSignMesh } from '../sign-builders';
import type { Movie } from '../jellyfin';
import type { FixtureContext } from '../fixtures';
import { getBackdropArt, loadArt } from '../video-case';
import { BB_ANTON, ensureBundledFont } from '../bundled-fonts';
import type { PromoTopperFactory } from './promo-topper';

/** No usable title art: letter the title across the backdrop so the header
 * still names the film (owner pin 267 — a bare backdrop read as unlabelled). */
function paintTitleText(paint: CanvasRenderingContext2D, title: string): void {
  const { width: W, height: H } = paint.canvas;
  const text = title.trim().toUpperCase();
  if (!text) return;
  const font = (px: number) => `${px}px ${BB_ANTON}, Impact, sans-serif`;
  const fit = (lines: string[]) => {
    let px = Math.floor(H * (lines.length > 1 ? .34 : .44));
    paint.font = font(px);
    while (px > 18 && Math.max(...lines.map(l => paint.measureText(l).width)) > W * .9) paint.font = font(px -= 2);
    return px;
  };
  let lines = [text], px = fit(lines);
  const words = text.split(/\s+/);
  if (px < H * .3 && words.length > 1) {
    // A long title breaks at the word nearest its middle when that letters larger.
    let at = 1;
    for (let i = 2; i < words.length; i++) {
      const gap = (k: number) => Math.abs(words.slice(0, k).join(' ').length - words.slice(k).join(' ').length);
      if (gap(i) < gap(at)) at = i;
    }
    const two = [words.slice(0, at).join(' '), words.slice(at).join(' ')], px2 = fit(two);
    if (px2 > px) { lines = two; px = px2; } else paint.font = font(px);
  }
  const band = paint.createLinearGradient(0, 0, 0, H);
  band.addColorStop(0, 'rgba(0,0,0,0)'); band.addColorStop(.5, 'rgba(0,0,0,.5)'); band.addColorStop(1, 'rgba(0,0,0,0)');
  paint.fillStyle = band; paint.fillRect(0, 0, W, H);
  paint.textAlign = 'center'; paint.textBaseline = 'middle'; paint.lineJoin = 'round';
  paint.lineWidth = Math.max(2, px * .08); paint.strokeStyle = 'rgba(0,0,0,.85)'; paint.fillStyle = '#fff';
  const lead = px * 1.02, top = H / 2 - (lines.length - 1) * lead / 2;
  lines.forEach((line, i) => { paint.strokeText(line, W / 2, top + i * lead); paint.fillText(line, W / 2, top + i * lead); });
}

/** A shallow, centre-cropped backdrop with the provider's transparent title art,
 * or the title lettered over it when there is none. Missing/failed backdrop
 * metadata leaves the stand flat and bare. */
export function createFeatureFilmTopper(movie: Movie, ctx: FixtureContext): PromoTopperFactory {
  let retired = false, requested = false;
  let texture: THREE.CanvasTexture | null = null;
  const panels: { root: THREE.Group; width: number }[] = [];
  const populate = ({ root, width }: typeof panels[number]) => {
    if (!texture || root.children.length) return;
    const w = Math.min(2, Math.max(.1, width - .08)), h = w / 3;
    const backing = new THREE.Mesh(new THREE.BoxGeometry(w + .04, h + .04, .035),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: .85 }));
    backing.position.y = h / 2; backing.castShadow = backing.receiveShadow = true;
    const print = markSignMesh(new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: texture, roughness: .85 })));
    print.name = 'feature-backdrop'; print.position.set(0, h / 2, .019);
    root.add(backing, print);
  };
  return {
    get height() { return texture ? 2 / 3 + .04 : 0; },
    build(_label, width) {
      const root = new THREE.Group(); root.name = 'feature-film-header: ' + movie.title;
      const panel = { root, width }; panels.push(panel); populate(panel);
      if (!requested && movie.backdropUrl) {
        requested = true;
        getBackdropArt(movie, art => {
          if (retired || !art.width || art.width <= art.height) return;
          const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 256;
          const paint = canvas.getContext('2d'); if (!paint) return;
          const scale = Math.max(canvas.width / art.width, canvas.height / art.height);
          const w = art.width * scale, h = art.height * scale;
          paint.drawImage(art, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
          texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = 4; panels.forEach(populate);
          ctx.requestShadowRefresh(); ctx.requestRender();
          const letter = () => ensureBundledFont(BB_ANTON, () => {
            if (retired || !texture) return;
            paintTitleText(paint, movie.title);
            texture.needsUpdate = true; ctx.requestRender();
          });
          if (!movie.titleLogoUrl) { letter(); return; }
          loadArt(movie.titleLogoUrl, 1024, logo => {
            let drawn = false;
            try {
              if (retired || !texture || !logo?.width || !logo.height) return;
              // Trim transparent padding so visible lettering, not the PNG's
              // outer rectangle, is centred. Preserve the original aspect ratio.
              const title = document.createElement('canvas'); title.width = logo.width; title.height = logo.height;
              const ink = title.getContext('2d', { willReadFrequently: true }); if (!ink) return;
              ink.drawImage(logo, 0, 0);
              const rgba = ink.getImageData(0, 0, title.width, title.height).data;
              let left = title.width, top = title.height, right = -1, bottom = -1;
              for (let y = 0; y < title.height; y++) for (let x = 0; x < title.width; x++) {
                if (rgba[(y * title.width + x) * 4 + 3] < 8) continue;
                left = Math.min(left, x); top = Math.min(top, y);
                right = Math.max(right, x); bottom = Math.max(bottom, y);
              }
              if (right < left || bottom < top) return;
              const sw = right - left + 1, sh = bottom - top + 1;
              const fit = Math.min(canvas.width * .9 / sw, canvas.height * .8 / sh);
              const dw = sw * fit, dh = sh * fit;
              paint.drawImage(title, left, top, sw, sh, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
              texture.needsUpdate = true; ctx.requestRender();
              drawn = true;
            } catch {
              // An unreadable image leaves the already rendered backdrop intact.
            } finally {
              // This logo decode belongs to us; the shared backdrop does not.
              if (logo && 'close' in logo) logo.close();
              if (!drawn) letter();
            }
          });
        });
      }
      return root;
    },
    dispose() { retired = true; texture?.dispose(); texture = null; panels.length = 0; },
  };
}
