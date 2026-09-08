// Demo mode: the real app shell (index.html/main.ts) with no server or login,
// using real streaming stock on the hosted root; credential
// settings hidden, playback blocked. Baked into the GitHub Pages build via
// VITE_DEMO=1 (see .github/workflows/deploy-demo.yml); '?demo=1' enables it
// per-boot with synthetic stock for local verification. Dependency-free so anything
// (settings.ts, main.ts) can import it without creating cycles.
export const isDemoMode: boolean =
  (typeof import.meta.env !== 'undefined' && import.meta.env.VITE_DEMO === '1') ||
  (typeof location !== 'undefined' && new URLSearchParams(location.search).get('demo') === '1');

// Synthetic titles are an explicit development fixture. The hosted root
// stocks the real bundled streaming catalog without generating fake covers.
export const useSyntheticDemoStock =
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('demo') === '1';

/** The hosted product path, distinct from the explicit synthetic fixture. */
export const isPublicDemo = isDemoMode && !useSyntheticDemoStock;
