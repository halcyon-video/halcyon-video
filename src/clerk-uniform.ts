export type ClerkUniform = 'polo' | 'oxford';

/** Uniforms are part of the era, never a saved customer preference. */
export function resolveClerkUniform(themeId: unknown): ClerkUniform {
  return themeId === 'bb-1990' || themeId === 'bb-1993' ? 'oxford' : 'polo';
}

/** Red covers primary cloth; green covers the polo collar and cuffs. */
export function recolorClerkPixels(pixels: Uint8ClampedArray, coverage: Uint8ClampedArray,
  primary: readonly number[], secondary: readonly number[], style: ClerkUniform): void {
  const p = primary.map(c => style === 'oxford' ? .82 + c * .18 : .10 + c * .90);
  const s = secondary.map(c => .10 + c * .90);
  for (let i = 0; i < pixels.length; i += 4) {
    if (!pixels[i + 3]) continue;
    let a = coverage[i] / 255, b = coverage[i + 1] / 255;
    const total = Math.max(1, a + b); a /= total; b /= total;
    if (!a && !b) continue;
    for (let c = 0; c < 3; c++) pixels[i + c] *= 1 - a - b + a * p[c] + b * s[c];
  }
}
