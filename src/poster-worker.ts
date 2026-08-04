// IndexedDB v2: 'posters' stores raw image bytes, 'pixels' stores pre-decoded
// RGBA pixel data so subsequent sessions skip createImageBitmap + canvas decode.
let dbPromise: Promise<IDBDatabase | null> | null = null;
function getDB(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const req = indexedDB.open('poster-cache-v2', 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('posters')) db.createObjectStore('posters');
        if (!db.objectStoreNames.contains('pixels')) db.createObjectStore('pixels');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }
  return dbPromise;
}

function dbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(undefined);
  });
}

function dbPut(db: IDBDatabase, store: string, key: string, value: unknown): void {
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value, key);
}

interface PixelEntry {
  high: ArrayBuffer;
  low: ArrayBuffer;
  color: string;
  edgeBusy?: boolean;
  bandEnergy?: number;
  mode?: string;
  // Face aspect (w/h) the art was contain-fitted to. 'cart' only: the retail
  // box shape varies by platform, so pixels fitted to one are wrong for another.
  fa?: number;
  v?: number;
}

// Decode-algorithm version for the 'pixels' store. Entries written by an older
// decoder (e.g. landscape game covers center-cropped to garbage before the
// aspect-preserving contain-fit landed, or pixels letterboxed regardless of
// medium before decode became mode-aware — GH #93; v6: game modes exempted
// from the rotated-poster heuristic, which was turning genuinely-landscape
// box scans sideways) are treated as misses and re-decoded from the
// still-cached raw bytes — no network refetch, no full-cache nuke; v7: 'cart'
// fits onto the platform's real retail box face instead of the VHS clamshell,
// so its bars (and often the whole drawn size) changed; v8: platforms with a
// real carton on file switched from 'cart' to 'fill' — no bars at all.
const PIXELS_VERSION = 8;

// How decoded art is fitted onto the 320x480 face (GH #93):
// - 'crop': object-fit cover, never letterboxed. DVD movie fronts — Jellyfin
//   art is authored to fill a DVD face exactly, so bars are never correct.
// - 'vhs': cover-crop, but contain-fit letterbox into the visible VHS band
//   when the edges look busy (#21) or the source is landscape, so the VHS
//   face's horizontal crop doesn't cut art or text.
// - 'fill': stretch to fill the face, never letterboxed or cropped. DISC
//   game covers — keep-case art is authored at (near) the DVD face aspect,
//   so the stretch is imperceptible and the complete scan shows.
// - 'cart': CARTRIDGE game covers on the generic VHS-shaped rental
//   clamshell. Box scans come in every aspect (portrait NES, landscape
//   SNES/N64, square Game Boy), so contain-fit the whole scan undistorted —
//   pre-compensated for the clamshell face's horizontal squeeze (the 2:3
//   canvas maps onto the narrower VHS face) — with edge-color bars, like a
//   real rental insert under the clamshell window.
export type DecodeMode = 'crop' | 'vhs' | 'fill' | 'cart';

// Threshold for the mean absolute luminance difference between vertically adjacent pixels.
// Text/edges show sharp vertical luminance transitions, yielding high variance/energy.
// Values above this threshold trigger contain-fit letterboxing instead of cropping.
const EDGE_BUSY_THRESHOLD = 20.0;

function checkEdgeBusy(lowResPixels: Uint8ClampedArray): { edgeBusy: boolean; bandEnergy: number } {
  const width = 64;
  const height = 96;

  function getLuminance(x: number, y: number): number {
    const idx = (y * width + x) * 4;
    const r = lowResPixels[idx];
    const g = lowResPixels[idx + 1];
    const b = lowResPixels[idx + 2];
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // Left band: x in [0, 5] (inclusive, so 6 columns)
  let leftDiffSum = 0;
  let leftCount = 0;
  for (let x = 0; x <= 5; x++) {
    for (let y = 0; y < height - 1; y++) {
      const lum1 = getLuminance(x, y);
      const lum2 = getLuminance(x, y + 1);
      leftDiffSum += Math.abs(lum1 - lum2);
      leftCount++;
    }
  }
  const leftEnergy = leftDiffSum / leftCount;

  // Right band: x in [58, 63] (inclusive, so 6 columns)
  let rightDiffSum = 0;
  let rightCount = 0;
  for (let x = 58; x <= 63; x++) {
    for (let y = 0; y < height - 1; y++) {
      const lum1 = getLuminance(x, y);
      const lum2 = getLuminance(x, y + 1);
      rightDiffSum += Math.abs(lum1 - lum2);
      rightCount++;
    }
  }
  const rightEnergy = rightDiffSum / rightCount;

  const bandEnergy = Math.max(leftEnergy, rightEnergy);
  return { edgeBusy: bandEnergy > EDGE_BUSY_THRESHOLD, bandEnergy };
}

async function decodeImageBytes(bytes: ArrayBuffer, mode: DecodeMode, faceAspect?: number): Promise<{ highResData: ArrayBuffer; lowResData: ArrayBuffer; hexColor: string; edgeBusy: boolean; bandEnergy: number }> {
  const blob = new Blob([bytes]);
  const sourceImage = await createImageBitmap(blob, { imageOrientation: 'flipY' });

  let imgWidth = sourceImage.width;
  let imgHeight = sourceImage.height;
  let imgAspect = imgWidth / imgHeight;

  let processedImage: ImageBitmap | OffscreenCanvas = sourceImage;

  // The rotated-poster heuristic is for MOVIE art (posters photographed
  // sideways). Game box scans ('fill'/'cart') are often genuinely landscape
  // (SNES/N64) — rotating them turns real art sideways.
  const isGameMode = mode === 'fill' || mode === 'cart';
  if (!isGameMode && imgAspect >= 1.30 && imgAspect <= 1.55) {
    // Landscape source that looks like a rotated 2:3 portrait.
    // We rotate the image by 90 degrees CW before fit.
    // Mind the existing `imageOrientation: 'flipY'` option to prevent mirroring (rotate after flipping Y).
    // F_Y * R_CW * F_Y = R_CCW. So rotate 90 degrees CCW on the Y-flipped sourceImage.
    const rotCanvas = new OffscreenCanvas(imgHeight, imgWidth);
    const rotCtx = rotCanvas.getContext('2d')!;
    rotCtx.translate(0, imgWidth);
    rotCtx.rotate(-Math.PI / 2);
    rotCtx.drawImage(sourceImage, 0, 0);
    processedImage = rotCanvas;
    imgWidth = rotCanvas.width;
    imgHeight = rotCanvas.height;
    imgAspect = imgWidth / imgHeight;
  }

  const canvas = new OffscreenCanvas(320, 480);
  const ctx = canvas.getContext('2d')!;

  if (mode === 'fill') {
    // Stretch to fill the whole face — complete art, no bars, no crop.
    ctx.drawImage(processedImage, 0, 0, imgWidth, imgHeight, 0, 0, 320, 480);
  } else if (mode === 'cart') {
    // Contain-fit onto the cartridge clamshell face. The 2:3 canvas is
    // displayed on the narrower VHS-shaped face (w/h 0.365/0.667 — mirrors
    // CASE_DIMS.vhs in video-case.ts, which this worker can't import), so a
    // scan drawn at aspect a displays at a × (face/canvas); pre-widen by the
    // inverse so the displayed art keeps its true aspect.
    // The face is the platform's RETAIL box (gameCaseDims in video-case.ts,
    // passed in because this worker can't import it); fall back to the generic
    // clamshell for platforms with no box shape of their own.
    const face = faceAspect && faceAspect > 0 ? faceAspect : 0.365 / 0.667;
    const canvasAspect = 320 / 480;
    const drawnAspect = imgAspect * (canvasAspect / face);
    let dw = 320, dh = Math.round(320 / drawnAspect);
    if (dh > 480) { dh = 480; dw = Math.round(480 * drawnAspect); }
    const dx = Math.round((320 - dw) / 2);
    const dy = Math.round((480 - dh) / 2);
    ctx.drawImage(processedImage, 0, 0, imgWidth, imgHeight, dx, dy, dw, dh);

    // Bars pick up the scan's own edge colors (same trick as the 'vhs'
    // letterbox below): sample just inside each edge of the drawn region.
    // The canvas is Y-flipped at this point, so "top of the art" is dy+dh.
    if (dy > 0) {
      const bottomC = ctx.getImageData(Math.min(319, dx + dw / 2), Math.min(479, dy + 1), 1, 1).data;
      const topC = ctx.getImageData(Math.min(319, dx + dw / 2), Math.max(0, dy + dh - 2), 1, 1).data;
      ctx.fillStyle = `rgb(${bottomC[0]}, ${bottomC[1]}, ${bottomC[2]})`;
      ctx.fillRect(0, 0, 320, dy);
      ctx.fillStyle = `rgb(${topC[0]}, ${topC[1]}, ${topC[2]})`;
      ctx.fillRect(0, dy + dh, 320, 480 - dy - dh);
    }
    if (dx > 0) {
      const leftC = ctx.getImageData(Math.min(319, dx + 1), 240, 1, 1).data;
      const rightC = ctx.getImageData(Math.min(319, dx + dw - 2), 240, 1, 1).data;
      ctx.fillStyle = `rgb(${leftC[0]}, ${leftC[1]}, ${leftC[2]})`;
      ctx.fillRect(0, 0, dx, 480);
      ctx.fillStyle = `rgb(${rightC[0]}, ${rightC[1]}, ${rightC[2]})`;
      ctx.fillRect(dx + dw, 0, 320 - dx - dw, 480);
    }
  } else {
    // object-fit: cover into 320×480
    const canvasAspect = 320 / 480;
    let drawW = imgWidth, drawH = imgHeight, drawX = 0, drawY = 0;
    if (imgAspect > canvasAspect) {
      drawW = imgHeight * canvasAspect;
      drawX = (imgWidth - drawW) / 2;
    } else {
      drawH = imgWidth / canvasAspect;
      drawY = (imgHeight - drawH) / 2;
    }
    ctx.drawImage(processedImage, drawX, drawY, drawW, drawH, 0, 0, 320, 480);
  }

  // Sample leftmost column for spine color
  const leftEdge = ctx.getImageData(4, 0, 1, 480).data;
  let rSum = 0, gSum = 0, bSum = 0, n = 0;
  for (let y = 0; y < 480; y += 8, n++) {
    const i = y * 4;
    rSum += leftEdge[i]; gSum += leftEdge[i + 1]; bSum += leftEdge[i + 2];
  }
  const hexColor = '#' + [rSum, gSum, bSum]
    .map(v => Math.round(v / n).toString(16).padStart(2, '0'))
    .join('');

  // Scale down to low-res (must happen before getImageData on the high-res canvas)
  const lowResCanvas = new OffscreenCanvas(64, 96);
  const lowResCtx = lowResCanvas.getContext('2d')!;
  lowResCtx.drawImage(canvas, 0, 0, 320, 480, 0, 0, 64, 96);

  const lowResDataCheck = lowResCtx.getImageData(0, 0, 64, 96).data.buffer;
  const { edgeBusy, bandEnergy } = checkEdgeBusy(new Uint8ClampedArray(lowResDataCheck));

  // VHS ONLY (GH #93): contain-fit (letterbox) instead of the cover-crop
  // above when either the edges look busy (text/art would be cut by the VHS
  // face's horizontal crop, #21) or the source is landscape. DVD ('crop') and
  // game ('fill') faces must never be letterboxed.
  if (mode === 'vhs' && (edgeBusy || imgAspect > 1.05)) {
    ctx.clearRect(0, 0, 320, 480);
    ctx.fillStyle = hexColor;
    ctx.fillRect(0, 0, 320, 480);

    // Fit the source into a 262x393 box PRESERVING ITS ASPECT (the old code
    // stretched the full frame into the box, squashing non-2:3 art), centered
    // on the canvas.
    const scale = Math.min(262 / imgWidth, 393 / imgHeight);
    const dw = Math.round(imgWidth * scale);
    const dh = Math.round(imgHeight * scale);
    const dx = Math.round((320 - dw) / 2);
    const dy = Math.round((480 - dh) / 2);
    ctx.drawImage(processedImage, 0, 0, imgWidth, imgHeight, dx, dy, dw, dh);

    // Since imageOrientation is 'flipY', the poster is drawn upside-down on
    // the canvas: the poster's bottom edge is at y=dy, its top at y=dy+dh.
    const bottomColorData = ctx.getImageData(160, Math.min(479, dy + 1), 1, 1).data;
    const topColorData = ctx.getImageData(160, Math.max(0, dy + dh - 2), 1, 1).data;

    const bottomColor = `rgb(${bottomColorData[0]}, ${bottomColorData[1]}, ${bottomColorData[2]})`;
    const topColor = `rgb(${topColorData[0]}, ${topColorData[1]}, ${topColorData[2]})`;

    // Extend the poster's own edge colors into the horizontal bars.
    ctx.fillStyle = bottomColor;
    ctx.fillRect(0, 0, 320, dy);
    ctx.fillStyle = topColor;
    ctx.fillRect(0, dy + dh, 320, 480 - dy - dh);

    // Re-draw low-res canvas with the new letterboxed image
    lowResCtx.clearRect(0, 0, 64, 96);
    lowResCtx.drawImage(canvas, 0, 0, 320, 480, 0, 0, 64, 96);
  }

  const lowResData = lowResCtx.getImageData(0, 0, 64, 96).data.buffer;
  const highResData = ctx.getImageData(0, 0, 320, 480).data.buffer;

  sourceImage.close();
  return { highResData, lowResData, hexColor, edgeBusy, bandEnergy };
}

self.onmessage = async (e) => {
  const { url, id, buffer } = e.data;
  // Default to 'crop' (never letterbox) if the caller didn't say — bars are
  // only ever correct when explicitly asked for ('vhs').
  const mode: DecodeMode = e.data.mode === 'vhs' || e.data.mode === 'fill' || e.data.mode === 'cart' ? e.data.mode : 'crop';
  const faceAspect: number | undefined = typeof e.data.faceAspect === 'number' ? e.data.faceAspect : undefined;
  // Pixels are baked to one face shape; only reuse a 'cart' entry fitted to the
  // same one (rounded — the aspect is derived from floats on the main thread).
  const faKey = faceAspect ? Math.round(faceAspect * 1000) / 1000 : undefined;
  try {
    const db = url ? await getDB() : null;

    // Fast path: pre-decoded pixel data already in IndexedDB — skip all image
    // decoding. This is the common case after the first session has warmed up.
    // The fit mode is baked into the stored pixels, so a hit requires the same
    // mode (a medium swap re-decodes from the still-cached raw bytes).
    if (db && url) {
      const cached = await dbGet<PixelEntry>(db, 'pixels', url);
      if (cached && cached.v === PIXELS_VERSION && cached.mode === mode
          && (mode !== 'cart' || cached.fa === faKey)) {
        let edgeBusy = cached.edgeBusy;
        let bandEnergy = cached.bandEnergy;
        if (edgeBusy === undefined || bandEnergy === undefined) {
          const res = checkEdgeBusy(new Uint8ClampedArray(cached.low));
          edgeBusy = res.edgeBusy;
          bandEnergy = res.bandEnergy;
          cached.edgeBusy = edgeBusy;
          cached.bandEnergy = bandEnergy;
          dbPut(db, 'pixels', url, cached);
        }
        self.postMessage(
          { id, highResData: cached.high, lowResData: cached.low, leftmostColor: cached.color, edgeBusy, bandEnergy, success: true },
          { transfer: [cached.high, cached.low] }
        );
        return;
      }
    }

    // Slow path: decode from image bytes.
    let rawBytes: ArrayBuffer;
    if (buffer) {
      rawBytes = buffer;
    } else {
      // Web fetch — check raw-bytes cache first, then network.
      const byteCached = db ? await dbGet<ArrayBuffer>(db, 'posters', url) : undefined;
      if (byteCached) {
        rawBytes = byteCached;
      } else {
        // Integration art marker (romm.ts coverUrl): the real cross-origin
        // URL rides in the query because its server never answers CORS —
        // unwrap it into the header-addressed same-origin /dev-proxy request
        // the vite middleware expects (vite.config.ts integrationProxyPlugin).
        let response: Response;
        if (url.startsWith('/dev-proxy?')) {
          const q = new URLSearchParams(url.slice(url.indexOf('?') + 1));
          const target = q.get('art') || '';
          const auth = q.get('auth');
          const alt = q.get('alt');
          const proxied = (t: string, withAuth: boolean) => {
            const headers: Record<string, string> = { 'X-Proxy-Target': t };
            if (withAuth && auth) headers['Authorization'] = auth;
            return fetch('/dev-proxy', { headers });
          };
          response = await proxied(target, true);
          // A miss on the local copy falls back to whatever remote link the
          // integration recorded. The content-type test matters as much as the
          // status: a dead ScreenScraper link answers 200 with a plain-text
          // error page, which would otherwise be handed to the decoder.
          const looksLikeImage = (r: Response) =>
            r.ok && (r.headers.get('content-type') || '').startsWith('image');
          if (!looksLikeImage(response) && alt) {
            response = await proxied(alt, false);
          }
        } else {
          response = await fetch(url, { mode: 'cors' });
        }
        if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
        rawBytes = await response.arrayBuffer();
        if (db) dbPut(db, 'posters', url, rawBytes.slice(0));
      }
    }

    const { highResData, lowResData, hexColor, edgeBusy, bandEnergy } = await decodeImageBytes(rawBytes, mode, faceAspect);

    // Persist decoded pixels so the next session skips decode entirely.
    if (db && url) {
      dbPut(db, 'pixels', url, { high: highResData.slice(0), low: lowResData.slice(0), color: hexColor, edgeBusy, bandEnergy, mode, fa: faKey, v: PIXELS_VERSION });
    }

    self.postMessage(
      { id, highResData, lowResData, leftmostColor: hexColor, edgeBusy, bandEnergy, success: true },
      { transfer: [highResData, lowResData] }
    );
  } catch (error: any) {
    self.postMessage({ id, error: error.message, success: false });
  }
};
