import type { SettingDef } from './settings';

export type ClerkUniform = 'polo' | 'oxford';
export const CLERK_UNIFORM_SETTING: SettingDef = {
  key: 'bb_clerk_uniform', label: 'Clerk Uniform', kind: 'cycle',
  group: 'Store Look', values: [{ id: 'polo', label: 'Polo' }, { id: 'oxford', label: 'Oxford Shirt' }],
  default: 'polo', applyMode: 'rebuild-scene',
  hint: 'Uniform colours follow the store brand; khakis stay the same.',
};
export function resolveClerkUniform(value: unknown): ClerkUniform {
  return value === 'oxford' ? 'oxford' : 'polo';
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
