// Flat scan art for a game case's NON-front faces — the back panel, the spine,
// and the disc/cartridge label. romm.ts resolves the URLs (gameArtUrls); this
// module turns them into textures and hands video-case.ts ready-made materials.
//
// Why this is NOT the poster pipeline (poster-worker.ts / posterPixelCache):
// that pipeline decodes to a fixed COVER_WIDTH x COVER_HEIGHT buffer sized for
// the FRONT face and keys its caches on movie.id. A spine is a 59x640-ish
// strip and a label is square; forcing either through a 320x480 front-face
// decode would resample the art to the wrong aspect before it ever reached a
// material. These faces are also cold — you see them on an inspected case, not
// on the hundreds of boxes standing on a shelf — so they don't need the
// worker's priority queue, its LRU, or its low-res tier. A plain fetch +
// createImageBitmap on demand is the right weight.
//
// Dependency direction: this module must NOT import video-case.ts (video-case
// imports it). Anything geometry-shaped — which face, what aspect — is decided
// there and passed in.
import * as THREE from 'three';
import { Movie } from './jellyfin';

// One entry per (title, face). Textures are shared by every mesh showing that
// title and are never evicted mid-session: only the inspected case builds
// them, so the working set is the handful of titles the user has picked up,
// not the library. Kept as a promise so two near-simultaneous requests for the
// same face (hero rebuild on a browse keypress) share one fetch.
const artCache = new Map<string, Promise<THREE.Texture | null>>();

export type GameFace = 'back' | 'spine' | 'label';

/** Has this title art on file for the given face? Synchronous, no fetch. */
export function hasGameFaceArt(movie: Movie, face: GameFace): boolean {
  return !!movie.gameArt?.[face];
}

/**
 * Fetch one face's scan and upload it as a texture. Resolves null — never
 * rejects — when the title has no art for that face, when the file isn't on
 * disk (the re-scrape is per-platform, so coverage is uneven), or when the
 * response isn't actually an image. Callers keep their generated fallback.
 */
export function loadGameFaceTexture(movie: Movie, face: GameFace): Promise<THREE.Texture | null> {
  const url = movie.gameArt?.[face];
  if (!url) return Promise.resolve(null);
  const key = `${movie.id}:${face}`;
  let pending = artCache.get(key);
  if (!pending) {
    pending = fetchFaceTexture(url).catch((err) => {
      console.warn(`[game-case-art] ${face} art failed for ${movie.title}:`, err);
      return null;
    });
    artCache.set(key, pending);
  }
  return pending;
}

async function fetchFaceTexture(url: string): Promise<THREE.Texture | null> {
  // Same marker the poster worker unwraps (poster-worker.ts): the real URL
  // rides in the query because Romm answers no CORS, and the middleware wants
  // it in a header instead. No `alt` handling here — gameArtUrls() never sets
  // one, deliberately (see the comment on it).
  let response: Response;
  if (url.startsWith('/dev-proxy?')) {
    const q = new URLSearchParams(url.slice(url.indexOf('?') + 1));
    const headers: Record<string, string> = { 'X-Proxy-Target': q.get('art') || '' };
    const auth = q.get('auth');
    if (auth) headers['Authorization'] = auth;
    response = await fetch('/dev-proxy', { headers });
  } else {
    response = await fetch(url);
  }
  // The content-type test matters as much as the status — a Romm miss can
  // answer 200 with a JSON error body, which decodes to nothing useful.
  if (!response.ok) return null;
  if (!(response.headers.get('content-type') || '').startsWith('image')) return null;

  // `imageOrientation: 'flipY'` is NOT optional. three.js ignores
  // Texture.flipY for an ImageBitmap source — the flip has to happen when the
  // bitmap is created, not at upload — so the default 'from-image' orientation
  // puts every scan on the case upside down (verified: the FF IX back panel
  // shot mirrored about its horizontal axis).
  const bitmap = await createImageBitmap(await response.blob(), { imageOrientation: 'flipY' });
  const tex = new THREE.Texture(bitmap as unknown as HTMLImageElement);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// ── Spine scans are not all one thing ───────────────────────────────────────
// Measured across the 2026-07-28 re-scrape, every `box-2D-side` is 680px tall
// and the WIDTH is the tell:
//
//   PlayStation   72px  (n=101, uniform)  TWO spine flaps in one image
//   Sega Saturn   37px  (n=21)            one spine
//   PS2 / GameCube 55px                   one spine
//   N64           97px, but one is 680x95 one spine, some scanned LANDSCAPE
//   3DS           59-63px                 one spine
//
// The PlayStation case is the odd one because its back inlay is a single sheet
// with a printed flap on EACH side, and ScreenScraper scans the flat sheet. The
// two flaps are not duplicates: on Final Fantasy IX the right flap carries
// `PlayStation` + the title + `4 DISCS`, the left carries `SLUS-01251/...` +
// `NTSC U/C`. Mapping the whole scan onto one face squeezes both onto one
// spine, which is what the first pass did.
//
// Detection is deliberately conservative — a jewel-case platform AND a scan
// measurably wider than the face it is going onto. On this data that fires for
// PlayStation and nothing else (Saturn's ratio is 0.76, GameCube's 1.00, and
// 3DS reaches 1.31 but is a keep case, never a jewel case, so it is never
// considered).
const TWO_FLAP_MIN_RATIO = 1.25;

export function isTwoFlapSpine(tex: THREE.Texture, faceAspect: number, jewelCase: boolean): boolean {
  const img = tex.image as { width?: number; height?: number } | undefined;
  if (!jewelCase || !img?.width || !img?.height) return false;
  return (img.width / img.height) > faceAspect * TWO_FLAP_MIN_RATIO;
}

// A jewel-case spine face, composited at the FACE's aspect. Art direction
// comes from ScreenScraper's own `box3d` renders (owner's call — "the 3d box
// is actually a good example for how the jewel case edges should look"):
//
//   SINGLE case (Ace Combat 3 box3d): the print fills the spine face
//     EDGE-TO-EDGE — no plastic bands — with only a hairline bright rim
//     where the clear edges catch light. The mild stretch is authentic:
//     the real print runs full bleed on the spine.
//   FAT case (FF IX box3d): reading back edge -> front edge, the spine is
//     [thin rim][ribbed HINGE TEETH column][both flap prints at natural
//     width]. Teeth + two single-width prints ≈ the fat depth, which is
//     exactly why the real fat case looks like that.
//
// `flap` picks the print: 'left'/'right' = one flap of a two-flap scan,
// 'both' = the whole sheet, 'single' = a one-flap scan (Saturn).
// `teeth` places the hinge-teeth column on that CANVAS side, or 'none'
// (the opening edge of the case has no hinge).
const spineCompositeCache = new Map<string, THREE.CanvasTexture>();

// Ribbed hinge-teeth column, the molded look of the case's hinge side.
function drawHingeTeeth(ctx: CanvasRenderingContext2D, x: number, w: number, H: number) {
  ctx.fillStyle = '#101316'; // the dark well between and behind the teeth
  ctx.fillRect(x, 0, w, H);
  const teeth = 16;
  const pitch = H / teeth;
  const ribH = pitch * 0.58;
  for (let i = 0; i < teeth; i++) {
    const y = i * pitch + (pitch - ribH) / 2;
    const grad = ctx.createLinearGradient(0, y, 0, y + ribH);
    grad.addColorStop(0, '#3c434a');   // lit top of the rib
    grad.addColorStop(0.5, '#272c31');
    grad.addColorStop(1, '#14171a');   // shadowed underside
    ctx.fillStyle = grad;
    ctx.fillRect(x + Math.max(1, w * 0.08), y, w - Math.max(2, w * 0.16), ribH);
  }
}

export function jewelSpineComposite(
  spineTex: THREE.Texture,
  opts: { key: string; faceAspect: number; flap: 'left' | 'right' | 'both' | 'single'; teeth: 'left' | 'right' | 'none' },
): THREE.Texture {
  const cached = spineCompositeCache.get(opts.key);
  if (cached) return cached;
  const img = spineTex.image as ImageBitmap;
  const H = img.height;
  const W = Math.max(8, Math.round(opts.faceAspect * H));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Smoked polycarbonate bed with a bright hairline at each edge.
  ctx.fillStyle = '#24282c';
  ctx.fillRect(0, 0, W, H);

  // Source rect: one flap, or the whole sheet for 'both'/'single'.
  const half = img.width / 2;
  const sx = opts.flap === 'right' ? half : 0;
  const sw = opts.flap === 'left' || opts.flap === 'right' ? half : img.width;

  // Print area: everything except the teeth column (when present).
  const teethW = opts.teeth === 'none' ? 0 : Math.round(W * 0.25);
  const printX = opts.teeth === 'left' ? teethW : 0;
  const printW = W - teethW;
  if (teethW > 0) drawHingeTeeth(ctx, opts.teeth === 'left' ? 0 : W - teethW, teethW, H);

  // The print. Singles fill their area edge-to-edge (the box3d reference —
  // full-bleed print, mild stretch and all). 'both' keeps natural width
  // inside the print area, which it nearly fills by construction.
  let drawW = printW;
  if (opts.flap === 'both') {
    const natural = sw * (H / img.height);
    if (natural < printW) drawW = natural;
  }
  // Orientation: the bitmap was created flipY'd for DIRECT GPU use (three
  // ignores Texture.flipY on an ImageBitmap — see fetchFaceTexture), but on
  // the canvas path that flip and the CanvasTexture upload flip do NOT
  // cancel (measured: the composite landed upside down on the case). Flip
  // the draw itself. NOTE the destination x must be re-derived after the
  // flip only if the transform touched x — it doesn't (y-only flip).
  ctx.save();
  ctx.translate(0, H);
  ctx.scale(1, -1);
  ctx.drawImage(img, sx, 0, sw, H, printX + (printW - drawW) / 2, 0, drawW, H);
  ctx.restore();

  // The clear polycarbonate LIP over both extreme edges — the bright
  // silver-gray band that frames the case in the box3d renders (measured off
  // FF IX: peaks #545-#9e9 grays with a cool cast, ~10-13% of the spine
  // width). Drawn OVER the print with an alpha falloff: the real lip
  // overhangs the full-bleed print, it doesn't push it aside.
  const lipW = Math.max(3, Math.round(W * 0.11));
  for (const side of [0, 1]) {
    const grad = side === 0
      ? ctx.createLinearGradient(0, 0, lipW, 0)
      : ctx.createLinearGradient(W, 0, W - lipW, 0);
    grad.addColorStop(0, 'rgba(196, 202, 208, 0.95)'); // bright outer edge
    grad.addColorStop(0.4, 'rgba(122, 129, 136, 0.55)');
    grad.addColorStop(1, 'rgba(70, 75, 80, 0)');       // fades over the print
    ctx.fillStyle = grad;
    ctx.fillRect(side === 0 ? 0 : W - lipW, 0, lipW, H);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  spineCompositeCache.set(opts.key, tex);
  return tex;
}

// A few spine scans are photographed lying down (N64 has one at 680x95 among
// 373 portrait ones). Turning a landscape scan a quarter turn is the only way
// it reads on an upright spine; without this it maps sideways and unreadably
// squashed. Rotates about the texture's centre, so no UV surgery is needed.
const rotatedCache = new Map<string, THREE.Texture>();
export function uprightSpine(tex: THREE.Texture, key: string): THREE.Texture {
  const img = tex.image as { width?: number; height?: number } | undefined;
  if (!img?.width || !img?.height || img.width <= img.height) return tex;
  let out = rotatedCache.get(key);
  if (!out) {
    out = tex.clone();
    out.center.set(0.5, 0.5);
    out.rotation = Math.PI / 2;
    out.needsUpdate = true;
    rotatedCache.set(key, out);
  }
  return out;
}

/** Load every face this title has art for. Used to warm an inspected case. */
export async function loadGameCaseArt(movie: Movie): Promise<Partial<Record<GameFace, THREE.Texture>>> {
  const faces: GameFace[] = ['back', 'spine', 'label'];
  const loaded = await Promise.all(faces.map((f) => loadGameFaceTexture(movie, f)));
  const out: Partial<Record<GameFace, THREE.Texture>> = {};
  faces.forEach((f, i) => { if (loaded[i]) out[f] = loaded[i]!; });
  return out;
}

/** Already-resolved texture for a face, or undefined. Never starts a fetch. */
const settled = new Map<string, THREE.Texture | null>();
export function peekGameFaceTexture(movie: Movie, face: GameFace): THREE.Texture | undefined {
  return settled.get(`${movie.id}:${face}`) || undefined;
}
export function rememberSettled(movie: Movie, face: GameFace, tex: THREE.Texture | null) {
  settled.set(`${movie.id}:${face}`, tex);
}
