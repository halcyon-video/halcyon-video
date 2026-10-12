import { compactAssets, mobileAssetPath } from './mobile-assets.ts';
// Resolves a public/ asset path against Vite's base URL so the app works both
// at the dev-server root ('/') and under a subpath deploy (e.g. GitHub Pages
// serving the demo at /media-server-video-store/).
export function assetUrl(p: string): string {
  const base = (typeof import.meta.env !== 'undefined' && import.meta.env?.BASE_URL) ? import.meta.env.BASE_URL : '/';
  return base + mobileAssetPath(p.replace(/^\//, ''), compactAssets());
}

// The HOSTED build (VITE_DEMO=1, the GitHub Pages deploy) is built from the
// public repo, whose public/user-assets/ tree is git-ignored: every drop-in
// probe it could make is a guaranteed 404 sharing a phone's link with the
// startup downloads. Build-time on purpose, not the runtime `?demo=1` switch,
// so a local demo-mode run with drop-ins installed still sees them.
export const HOSTED_BUILD = typeof import.meta.env !== 'undefined' && import.meta.env?.VITE_DEMO === '1';

/** Drop-in candidate paths minus the user-assets ones the hosted build can never have. */
export function dropInCandidates(paths: string[]): string[] {
  return HOSTED_BUILD ? paths.filter(p => !p.startsWith('user-assets/')) : paths;
}
