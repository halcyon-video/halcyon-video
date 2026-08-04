// Demo mode: the real app shell (index.html/main.ts) running against the
// synthetic placeholder library — no Jellyfin server or login, credential
// settings hidden, playback blocked. Baked into the GitHub Pages build via
// VITE_DEMO=1 (see .github/workflows/deploy-demo.yml); '?demo=1' enables it
// per-boot for local verification. Deliberately dependency-free so anything
// (settings.ts, main.ts) can import it without creating cycles.
export const isDemoMode: boolean =
  (typeof import.meta.env !== 'undefined' && import.meta.env.VITE_DEMO === '1') ||
  (typeof location !== 'undefined' && new URLSearchParams(location.search).get('demo') === '1');
