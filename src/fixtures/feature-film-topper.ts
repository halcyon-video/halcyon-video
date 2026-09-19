import * as THREE from 'three';
import type { Movie } from '../jellyfin';
import type { FixtureContext } from '../fixtures';
import { getBackdropArt } from '../video-case';
import type { PromoTopperFactory } from './promo-topper';

/** A small 16:9 metadata backdrop above the shelves. Missing, failed or portrait
 * artwork leaves the top bare: no poster substitution, title strip or empty frame.
 * The shared backdrop cache owns the decoded art; this factory owns its texture.
 */
export function createFeatureFilmTopper(movie: Movie, ctx: FixtureContext): PromoTopperFactory {
  let retired = false, requested = false;
  let texture: THREE.CanvasTexture | null = null;
  const panels: { root: THREE.Group; width: number }[] = [];
  const populate = ({ root, width }: typeof panels[number]) => {
    if (!texture || root.children.length) return;
    const w = Math.min(2, Math.max(.1, width - .08)), h = w * 9 / 16;
    const backing = new THREE.Mesh(new THREE.BoxGeometry(w + .04, h + .04, .035),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: .85 }));
    backing.position.y = h / 2; backing.castShadow = backing.receiveShadow = true;
    const print = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: texture, roughness: .72 }));
    print.name = 'feature-backdrop'; print.position.set(0, h / 2, .019);
    root.add(backing, print);
  };
  return {
    get height() { return texture ? 1.125 : 0; },
    build(_label, width) {
      const root = new THREE.Group(); root.name = 'feature-film-header: ' + movie.title;
      const panel = { root, width }; panels.push(panel); populate(panel);
      if (!requested && movie.backdropUrl) {
        requested = true;
        getBackdropArt(movie, art => {
          if (retired || !art.width || art.width <= art.height) return;
          const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 288;
          const paint = canvas.getContext('2d'); if (!paint) return;
          const scale = Math.max(canvas.width / art.width, canvas.height / art.height);
          const w = art.width * scale, h = art.height * scale;
          paint.drawImage(art, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
          texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = 4;
          panels.forEach(populate);
          ctx.requestShadowRefresh(); ctx.requestRender();
        });
      }
      return root;
    },
    dispose() { retired = true; texture?.dispose(); texture = null; panels.length = 0; },
  };
}
