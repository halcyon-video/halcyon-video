// Blender color pass + an occlusion-correct uniform coverage pass. Tint once
// while loading; runtime rendering remains the existing single lit billboard.
import * as THREE from 'three';
import { assetUrl } from './asset-url';
import { tryLoadUserAssetTexture } from './user-assets';
import { resolveClerkIdentity } from './cast-catalog';
import { getActiveTheme } from './themes';
import { recolorClerkPixels, resolveClerkUniform } from './clerk-uniform';

function loadImage(path: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Clerk atlas unavailable: ${path}`));
    image.src = assetUrl(path);
  });
}

function validPair(pair: HTMLImageElement[]): boolean {
  return pair.length === 2 && pair.every(image => image.width === 4096 && image.height === 1920);
}

async function loadInstalledPair(base: string): Promise<HTMLImageElement[] | null> {
  // Use the existing brand-overlay and hosted-build rules. Never mix a private
  // color sheet with a shipped coverage mask: both must describe the same body.
  const images = await Promise.all(['color', 'livery'].map(pass =>
    new Promise<HTMLImageElement | null>(resolve => {
      tryLoadUserAssetTexture(`${base}/${pass}.png`, texture => {
        const image = texture.image as HTMLImageElement;
        texture.dispose();
        resolve(image);
      }, { onMiss: () => resolve(null) });
    })));
  return images.every(image => image !== null) && validPair(images as HTMLImageElement[])
    ? images as HTMLImageElement[] : null;
}

export async function loadRenderedClerkAtlas(): Promise<THREE.CanvasTexture> {
  // Capture the theme before asynchronous work: an old clerk can finish loading
  // during a settings rebuild, and must retain its own palette until disposed.
  const theme = getActiveTheme();
  const palette = theme.palette;
  const primary = new THREE.Color(palette.primary).convertLinearToSRGB();
  const secondary = new THREE.Color(palette.secondary).convertLinearToSRGB();
  const uniform = resolveClerkUniform(theme.id);
  const identity = resolveClerkIdentity(localStorage.getItem('bb_clerk_identity'));
  const base = identity === 'clerk-b' ? `textures/cast/clerk-b/${uniform}`
    : uniform === 'oxford' ? 'textures/clerk/oxford' : 'textures/clerk';
  const installed = await loadInstalledPair(`clerk/${identity}/${uniform}`);
  const [color, mask] = installed ?? await Promise.all([
    loadImage(`${base}/color.png`),
    loadImage(`${base}/livery.png`),
  ]);
  if (!validPair([color, mask])) {
    throw new Error('Rendered clerk atlas must use the 16 by 5 sprite grid');
  }
  const canvas = document.createElement('canvas');
  canvas.width = color.width; canvas.height = color.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(mask, 0, 0);
  const coverage = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(color, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  recolorClerkPixels(pixels.data, coverage,
    [primary.r, primary.g, primary.b], [secondary.r, secondary.g, secondary.b], uniform);
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = identity === 'clerk-a' ? `blender-clerk-atlas-${uniform}` : `blender-clerk-b-atlas-${uniform}`;
  texture.userData.installedClerkAtlas = installed !== null;
  texture.userData.atlasSpanFeet = identity === 'clerk-b' ? 6.4 : 5.7;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
