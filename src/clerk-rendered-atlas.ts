// Blender color pass + an occlusion-correct uniform coverage pass. Tint once
// while loading; runtime rendering remains the existing single lit billboard.
import * as THREE from 'three';
import { assetUrl } from './asset-url';
import { getActiveTheme } from './themes';

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
  const primary = new THREE.Color(getActiveTheme().palette.primary);
  primary.convertLinearToSRGB();
  const tint = [primary.r, primary.g, primary.b];
  const [color, mask] = await Promise.all([
    loadImage('textures/clerk/color.png'),
    loadImage('textures/clerk/livery.png'),
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
  for (let i = 0; i < pixels.data.length; i += 4) {
    // The unlit pass has black non-uniform surfaces and white cloth, including
    // the carried case stripe. Alpha belongs entirely to the original render.
    const amount = coverage[i] / 255;
    if (!amount || !pixels.data[i + 3]) continue;
    for (let c = 0; c < 3; c++) {
      const shade = pixels.data[i + c];
      const dyed = Math.min(255, shade * (tint[c] * .90 + .10));
      pixels.data[i + c] = shade + (dyed - shade) * amount;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'blender-clerk-atlas';
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
