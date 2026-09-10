// Resolves a public/ asset path against Vite's base URL so the app works both
// at the dev-server root ('/') and under a subpath deploy (e.g. GitHub Pages
// serving the demo at /media-server-video-store/).
export function assetUrl(p: string): string {
  const base = (typeof import.meta.env !== 'undefined' && import.meta.env?.BASE_URL) ? import.meta.env.BASE_URL : '/';
  return base + p.replace(/^\//, '');
}
