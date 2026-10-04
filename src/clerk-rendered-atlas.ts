// Blender color pass + an occlusion-correct uniform coverage pass. Tint once
// while loading; runtime rendering remains the existing single lit billboard.
import * as THREE from 'three';
import { assetUrl } from './asset-url';
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

export async function loadRenderedClerkAtlas(): Promise<THREE.CanvasTexture> {
  // Capture the theme before asynchronous work: an old clerk can finish loading
  // during a settings rebuild, and must retain its own palette until disposed.
  const palette = getActiveTheme().palette;
  const primary = new THREE.Color(palette.primary).convertLinearToSRGB();
  const secondary = new THREE.Color(palette.secondary).convertLinearToSRGB();
  const uniform = resolveClerkUniform(localStorage.getItem('bb_clerk_uniform'));
  const base = uniform === 'oxford' ? 'textures/clerk/oxford' : 'textures/clerk';
  const [color, mask] = await Promise.all([
    loadImage(`${base}/color.png`),
    loadImage(`${base}/livery.png`),
  ]);
  if (color.width !== 4096 || color.height !== 1920 ||
      mask.width !== color.width || mask.height !== color.height) {
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
  texture.name = `blender-clerk-atlas-${uniform}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
