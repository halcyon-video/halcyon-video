import * as THREE from 'three';
import type { Movie } from '../jellyfin';
import type { FixtureContext } from '../fixtures';
import { getBackdropArt, loadArt } from '../video-case';
import type { PromoTopperFactory } from './promo-topper';

/** A shallow, centre-cropped backdrop with the provider's transparent title art.
 * Missing/failed backdrop metadata leaves the stand flat and bare. */
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
    const print = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: texture, roughness: .72 }));
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
          if (movie.titleLogoUrl) loadArt(movie.titleLogoUrl, 1024, logo => {
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
            } catch {
              // An unreadable image leaves the already rendered backdrop intact.
            } finally {
              // This logo decode belongs to us; the shared backdrop does not.
              if (logo && 'close' in logo) logo.close();
            }
          });
        });
      }
      return root;
    },
    dispose() { retired = true; texture?.dispose(); texture = null; panels.length = 0; },
  };
}
