// Runtime loader for the git-ignored public/user-assets/ tree: scans and
// faithful recreations of REAL branded products (trademarked art) that must
// never be committed — see public/user-assets/README.md. Callers build their
// generic procedural fallback first and swap in the user asset only if the
// file is actually installed; the 404 when it isn't is the normal case and
// stays silent. Surface PBR sets additionally fall back to the CC0 scans
// shipped at public/textures/surfaces/ before the procedural maps win.
import * as THREE from 'three';
import { assetUrl } from './asset-url';
import { brandPackDir } from './brand-pack';
import { tryLoadShippedSurfaceKtx2 } from './surface-textures';

// The HOSTED build (VITE_DEMO=1 baked at build time — the GitHub Pages
// deploy, see deploy-demo.yml) is built from the public repo, whose
// public/user-assets/ tree is git-ignored: every drop-in probe it could make
// is a guaranteed 404. On a home connection that was ~70 requests (signs,
// surfaces, brand) per boot, each a 404 page, all sharing the pipe with the
// covers the reveal waits on. Build-time flag on purpose, NOT the runtime
// `?demo=1` switch (demo-mode.ts), so a local run with drop-ins installed
// still sees them in demo mode.
const HOSTED_BUILD = typeof import.meta.env !== 'undefined' && import.meta.env.VITE_DEMO === '1';

// One load attempt at an exact public/-relative path.
function loadOne(
  urlPath: string,
  onLoad: (tex: THREE.Texture) => void,
  srgb: boolean,
  onMiss: () => void,
): void {
  new THREE.TextureLoader().load(
    assetUrl(urlPath),
    (tex) => {
      tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      onLoad(tex);
    },
    undefined,
    onMiss,
  );
}

export function tryLoadUserAssetTexture(
  relPath: string,
  onLoad: (tex: THREE.Texture) => void,
  opts: { srgb?: boolean; onMiss?: () => void; allowKtx2?: boolean } = {}
): void {
  // Colour/albedo maps are sRGB (the default); data maps (normal, roughness,
  // metalness, AO, displacement) MUST stay linear or PBR lighting goes wrong —
  // pass { srgb: false } for those.
  const srgb = opts.srgb ?? true;
  // 404 = asset not installed. Surface PBR sets (surfaces/<name>/) have CC0
  // default scans SHIPPED IN THE REPO at public/textures/surfaces/ — a user
  // drop-in wins, the shipped GPU-compressed .ktx2 fills in behind it, the
  // shipped .png behind THAT, and only when all three are absent does the
  // caller's procedural canvas fallback stay up (see src/surface-textures.ts
  // for the .ktx2 step — same pixels, 4-6x less VRAM, soft-falls to .png on
  // any failure). Other asset kinds keep the old contract: miss = not
  // installed. onMiss lets a caller fall through to the next candidate path
  // (e.g. the sign-art slot/sign/theme resolution chain below).
  //
  // { allowKtx2: false } opts a call OUT of the .ktx2 step entirely (straight
  // to shipped .png on miss): a KTX2Loader texture is a GPU-native
  // CompressedTexture with no CPU-readable `.image` — any caller that reads
  // pixels back out (canvas drawImage/getImageData, e.g. store-shell.ts's
  // neutralizeScanTexture on the carpet color map) cannot work on it. Those
  // callers keep paying the PNG's extra VRAM for that one map; every other
  // surface map still gets the compressed path.
  const miss = relPath.startsWith('surfaces/') && opts.allowKtx2 !== false
    ? () => tryLoadShippedSurfaceKtx2(relPath, onLoad, srgb,
        () => loadOne(`textures/${relPath}`, onLoad, srgb, () => opts.onMiss?.()))
    : relPath.startsWith('surfaces/')
      ? () => loadOne(`textures/${relPath}`, onLoad, srgb, () => opts.onMiss?.())
      : () => opts.onMiss?.();
  // The hosted build has no user-assets tree to probe (see HOSTED_BUILD).
  if (HOSTED_BUILD) { miss(); return; }
  // An installed brand pack owns the same tree one level down: its copy of an
  // asset wins, and anything it doesn't ship falls through to the flat path,
  // so a pack is a partial overlay rather than an all-or-nothing swap.
  const dir = brandPackDir();
  if (dir) loadOne(`user-assets/${dir}/${relPath}`, onLoad, srgb, () => loadOne(`user-assets/${relPath}`, onLoad, srgb, miss));
  else loadOne(`user-assets/${relPath}`, onLoad, srgb, miss);
}

// Sign-art override resolution (see public/user-assets/README.md "signs/").
// `keys` is the priority-ordered list of directory names a sign answers to —
// buildSignage passes [slotId, signId] so a per-slot drop wins over the
// sign-wide one. Within each directory the active theme's variant
// (<themeId>.png) wins over default.png. The first file that actually loads
// takes it; if none of the candidates exist this resolves silently and the
// procedural canvas art stays up (the normal case).
//
// SPECIFICITY still ranks first with a brand pack installed: each candidate is
// tried inside the pack, then flat (tryLoadUserAssetTexture), so a hand-dropped
// per-slot PNG is not shadowed by a pack's sign-wide one.
export function tryLoadUserSignArtTexture(
  keys: string[],
  themeId: string,
  onLoad: (tex: THREE.Texture) => void
): void {
  const candidates: string[] = [];
  for (const key of keys) {
    if (!key) continue;
    candidates.push(`signs/${key}/${themeId}.png`);
    candidates.push(`signs/${key}/default.png`);
  }
  const tryNext = (i: number) => {
    if (i >= candidates.length) return;
    tryLoadUserAssetTexture(candidates[i], onLoad, { onMiss: () => tryNext(i + 1) });
  };
  tryNext(0);
}

// Load a color/normal/roughness PBR set from a user-asset surface directory
// (surfaces/<name>/{color,normal,roughness}.png) and hand each map to `assign`
// once it arrives. The caller decides how to attach it (which material/slot,
// whether to tint, whether to share the map across materials). Each map is
// wrapped/repeated/anisotropy-configured before assign() sees it. Any missing
// file is silently skipped (procedural fallback stays up for that slot).
export function loadUserAssetSurface(
  assetDir: string,
  assign: (slot: 'map' | 'normalMap' | 'roughnessMap', tex: THREE.Texture) => void,
  opts: { repeat?: [number, number]; anisotropy?: number } = {}
): void {
  const cfg = (t: THREE.Texture) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
    t.anisotropy = opts.anisotropy ?? 8;
  };
  tryLoadUserAssetTexture(`${assetDir}/color.png`, (t) => { cfg(t); assign('map', t); });
  tryLoadUserAssetTexture(`${assetDir}/normal.png`, (t) => { cfg(t); assign('normalMap', t); }, { srgb: false });
  tryLoadUserAssetTexture(`${assetDir}/roughness.png`, (t) => { cfg(t); assign('roughnessMap', t); }, { srgb: false });
}
