// Platform logo plaques for the games department's modern topper (owner pin
// 281): when the RomM server supplies a platform's logo, the bays holding that
// platform wear it on a plaque above them instead of the generic VIDEO GAMES
// banner. The logo is fetched at runtime from the URL RomM reports — no
// platform logo is stored or shipped. A face falls back to the generic banner
// unless EVERY stocked bay on it has a logo, so the two never collide.
import * as THREE from 'three';
import { loadArt } from '../video-case';
import { rommPlatformLogoUrl } from '../romm';
import { BB_ANTON } from '../bundled-fonts';

/** Consecutive bays on one face that share a platform. */
export interface PlatformLogoRun { platform: string; url: string; first: number; last: number }

/** The face's logo runs, or null when any stocked bay lacks a RomM logo. */
export function platformLogoRuns(platforms: (string | undefined)[], sections: number): PlatformLogoRun[] | null {
  const runs: PlatformLogoRun[] = [];
  for (let s = 0; s < sections; s++) {
    const platform = platforms[s];
    if (!platform) continue;
    const url = rommPlatformLogoUrl(platform);
    if (!url) return null;
    const prev = runs[runs.length - 1];
    if (prev && prev.platform === platform && prev.last === s - 1) prev.last = s;
    else runs.push({ platform, url, first: s, last: s });
  }
  return runs.length ? runs : null;
}

/**
 * A plaque face for one run: the platform name lettered in place while the
 * logo loads (and if it never does), then the logo trimmed of its padding and
 * centred on its own background colour. `alive` stops a late load from
 * painting a retired fixture.
 */
export function createPlatformLogoTexture(
  run: PlatformLogoRun, aspect: number, alive: () => boolean, repaint: () => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.height = 192;
  canvas.width = Math.min(2048, Math.round(192 * aspect));
  const paint = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  paint.fillStyle = '#111111';
  paint.fillRect(0, 0, W, H);
  paint.fillStyle = '#ffffff';
  paint.textAlign = 'center';
  paint.textBaseline = 'middle';
  const label = run.platform.toUpperCase();
  let px = 96;
  paint.font = `${px}px ${BB_ANTON}, Impact, sans-serif`;
  while (px > 30 && paint.measureText(label).width > W * .88) paint.font = `${px -= 4}px ${BB_ANTON}, Impact, sans-serif`;
  paint.fillText(label, W / 2, H / 2 + 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  loadArt(run.url, 512, (logo) => {
    try {
      if (!alive() || !logo?.width || !logo.height) return;
      const scratch = document.createElement('canvas');
      scratch.width = logo.width; scratch.height = logo.height;
      const ink = scratch.getContext('2d', { willReadFrequently: true });
      if (!ink) return;
      ink.drawImage(logo, 0, 0);
      // Throws on a non-CORS image, which then never reaches the texture.
      const rgba = ink.getImageData(0, 0, scratch.width, scratch.height).data;
      // The corner is the logo's own field; anything clearly off it is ink.
      const [br, bg, bb, ba] = [rgba[0], rgba[1], rgba[2], rgba[3]];
      let left = scratch.width, top = scratch.height, right = -1, bottom = -1;
      for (let y = 0; y < scratch.height; y++) for (let x = 0; x < scratch.width; x++) {
        const i = (y * scratch.width + x) * 4;
        if (Math.abs(rgba[i] - br) + Math.abs(rgba[i + 1] - bg) + Math.abs(rgba[i + 2] - bb)
          + Math.abs(rgba[i + 3] - ba) < 60) continue;
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
      if (right < left || bottom < top) return;
      const sw = right - left + 1, sh = bottom - top + 1;
      const fit = Math.min(W * .88 / sw, H * .72 / sh);
      paint.fillStyle = ba < 128 ? '#ffffff' : `rgb(${br},${bg},${bb})`;
      paint.fillRect(0, 0, W, H);
      paint.drawImage(scratch, left, top, sw, sh, (W - sw * fit) / 2, (H - sh * fit) / 2, sw * fit, sh * fit);
      texture.needsUpdate = true;
      repaint();
    } catch {
      // An unreadable logo leaves the lettered platform name in place.
    } finally {
      if (logo && 'close' in logo) logo.close();
    }
  });
  return texture;
}
