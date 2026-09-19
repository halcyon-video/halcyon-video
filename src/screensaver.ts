// Lightweight idle animation: the store's real rental shell travels beside a
// movie box selected from stocked library titles. Every wall contact selects
// another title and applies a small edge-derived impulse to its three-axis
// tumble. The loop retains the original 30fps movement / 12fps rotation caps.

import { drawJellyfinBack, fitFontPx, leftmostColorCache, rentalWrapFaceImages } from './video-case';
import type { Movie } from './jellyfin';

const HIT_COLORS = ['#00f0ff', '#ff007f', '#ffaa00', '#00ff66', '#a855f7'];
const STYLE_INTERVAL_MS = 1000 / 30;
const ROT_INTERVAL_MS = 1000 / 12;
const ART_CACHE_LIMIT = 12;
const PROJECTED_PAIR_BOX_PX = 340;
const VIEWPORT_MARGIN_PX = 12;

let x = 100;
let y = 100;
let vx = 2.5;
let vy = 2.0;
let rotX = 14;
let rotY = 25;
let rotZ = -10;
let omegaX = 25;
let omegaY = 45;
let omegaZ = -18;
let bounceCount = 0;
let rafId: number | null = null;
let animationGeneration = 0;
let faceGeneration = 0;

let boxW = PROJECTED_PAIR_BOX_PX;
let boxH = PROJECTED_PAIR_BOX_PX;
let pairScale = 1;
let parentW = 0;
let parentH = 0;
let customMovies: Movie[] | null = null;
let currentMovie: Movie | null = null;

export function screensaverBoxMetrics(width: number, height: number) {
  const available = Math.max(1, Math.min(
    PROJECTED_PAIR_BOX_PX,
    width - VIEWPORT_MARGIN_PX * 2,
    height - VIEWPORT_MARGIN_PX * 2,
  ));
  return { side: available, scale: Math.min(1, available / PROJECTED_PAIR_BOX_PX) };
}

function measure() {
  const logo = document.getElementById('screensaver-logo');
  const overlay = document.getElementById('screensaver-overlay');
  if (!logo || !overlay) return;
  const parentRect = overlay.getBoundingClientRect();
  parentW = parentRect.width || window.innerWidth;
  parentH = parentRect.height || window.innerHeight;
  const metrics = screensaverBoxMetrics(parentW, parentH);
  boxW = boxH = metrics.side;
  pairScale = metrics.scale;
  logo.style.width = `${boxW}px`;
  logo.style.height = `${boxH}px`;
  logo.style.setProperty('--ss-pair-scale', String(pairScale));
  x = Math.min(Math.max(x, 0), Math.max(0, parentW - boxW));
  y = Math.min(Math.max(y, 0), Math.max(0, parentH - boxH));
}

// The generic shell always uses the existing rental-wrap renderer. There is
// no second brand literal or fallback drawing in this module.
const VHS_BOX_H_PX = 200;
let wrapPromise: Promise<void> | null = null;

export function applyWrapFaces(): Promise<void> {
  if (wrapPromise) return wrapPromise;
  wrapPromise = rentalWrapFaceImages().then(({ front, back, spine, frontAspect, spineAspect }) => {
    const vhs = document.querySelector<HTMLElement>('.ss-vhs');
    if (!vhs) return;
    vhs.style.setProperty('--vhsW', `${Math.round(VHS_BOX_H_PX * frontAspect)}px`);
    vhs.style.setProperty('--vhsD', `${Math.round(VHS_BOX_H_PX * spineAspect)}px`);
    const bg = (selector: string, url: string) => {
      const face = vhs.querySelector<HTMLElement>(selector);
      if (face) face.style.backgroundImage = `url(${url})`;
    };
    bg('.ss-vhs-front', front);
    bg('.ss-vhs-back', back);
    bg('.ss-vhs-left', spine);
  }).catch((error) => {
    wrapPromise = null;
    console.warn('[screensaver] Rental wrap unavailable; retaining molded shell.', error);
  });
  return wrapPromise;
}

interface MovieArt {
  backUrl: string;
  spineUrl: string;
}

const artCache = new Map<string, MovieArt>();

function rememberArt(id: string, art: MovieArt) {
  artCache.delete(id);
  artCache.set(id, art);
  while (artCache.size > ART_CACHE_LIMIT) {
    const oldest = artCache.keys().next().value as string | undefined;
    if (!oldest) break;
    artCache.delete(oldest);
  }
}

function stockedMovie(movie: Movie | null | undefined): movie is Movie {
  return !!movie?.id && !movie.isSeries && !movie.game
    && !movie.comingSoon && !movie.discovery && !movie.collectionGap;
}

function uniqueStock(libraries: Array<{ movies?: Movie[] }> | undefined): Movie[] {
  if (!libraries) return [];
  const result: Movie[] = [];
  const seen = new Set<string>();
  for (const library of libraries) {
    for (const movie of library.movies ?? []) {
      if (!stockedMovie(movie) || seen.has(movie.id)) continue;
      seen.add(movie.id);
      result.push(movie);
    }
  }
  return result;
}

export function getScreensaverMovies(): Movie[] {
  if (customMovies !== null) return customMovies.filter(stockedMovie);
  if (typeof window === 'undefined') return [];
  const app = window as typeof window & {
    storeScene?: { libraries?: Array<{ movies?: Movie[] }>; slotsByPosition?: Map<unknown, { movie?: Movie }> };
    store?: { libraries?: Array<{ movies?: Movie[] }>; slotsByPosition?: Map<unknown, { movie?: Movie }> };
    librariesList?: Array<{ movies?: Movie[] }>;
  };
  const scene = app.storeScene ?? app.store;
  const fromLibraries = uniqueStock(scene?.libraries);
  if (fromLibraries.length) return fromLibraries;
  if (scene?.slotsByPosition instanceof Map) {
    const seen = new Set<string>();
    const fromShelves: Movie[] = [];
    for (const slot of scene.slotsByPosition.values()) {
      const movie = slot?.movie;
      if (!stockedMovie(movie) || seen.has(movie.id)) continue;
      seen.add(movie.id);
      fromShelves.push(movie);
    }
    if (fromShelves.length) return fromShelves;
  }
  return uniqueStock(app.librariesList);
}

export function chooseNextScreensaverMovie(
  movies: Movie[], currentId: string | null, randomValue = Math.random(),
): Movie | null {
  const stock = movies.filter(stockedMovie);
  if (!stock.length) return null;
  const alternatives = stock.filter((movie) => movie.id !== currentId);
  const pool = alternatives.length ? alternatives : stock;
  const bounded = Math.max(0, Math.min(.999999, randomValue));
  return pool[Math.floor(bounded * pool.length)];
}

export function pickNextScreensaverMovie(): Movie | null {
  return chooseNextScreensaverMovie(getScreensaverMovies(), currentMovie?.id ?? null);
}

function drawMovieSpine(ctx: CanvasRenderingContext2D, w: number, h: number, movie: Movie) {
  const spineBg = leftmostColorCache.get(movie.id) || '#24262a';
  ctx.fillStyle = spineBg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.fillRect(0, 0, 2, h);
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.fillRect(w - 2, 0, 2, h);
  const title = movie.title.toUpperCase();
  const size = fitFontPx(ctx, title, 22, 'bold', h - 90, 12, 'Arial, sans-serif');
  ctx.save();
  ctx.translate(w / 2, 24);
  ctx.rotate(Math.PI / 2);
  ctx.font = `bold ${size}px Arial, sans-serif`;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 0, 0);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.82)';
  ctx.font = 'bold 11px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText([movie.rating, movie.year].filter(Boolean).join(' · '), w / 2, h - 18);
}

// Every cache entry owns its canvas closure. A late backdrop callback can only
// repaint that entry; it can never read pixels from a canvas reused by a newer
// title. Evicted entries silently ignore their late callbacks.
function renderMovieArt(movie: Movie, onUpdate?: (art: MovieArt) => void): MovieArt {
  const cached = artCache.get(movie.id);
  if (cached) {
    rememberArt(movie.id, cached);
    return cached;
  }
  const backCanvas = document.createElement('canvas');
  backCanvas.width = 320;
  backCanvas.height = 480;
  const backCtx = backCanvas.getContext('2d')!;
  const spineCanvas = document.createElement('canvas');
  spineCanvas.width = 60;
  spineCanvas.height = 480;
  drawMovieSpine(spineCanvas.getContext('2d')!, 60, 480, movie);
  const art: MovieArt = { backUrl: '', spineUrl: spineCanvas.toDataURL('image/png') };
  rememberArt(movie.id, art);
  drawJellyfinBack(backCtx, 320, 480, movie, undefined, () => {
    if (artCache.get(movie.id) !== art) return;
    art.backUrl = backCanvas.toDataURL('image/png');
    onUpdate?.(art);
  });
  art.backUrl = backCanvas.toDataURL('image/png');
  return art;
}

function clearMovieFaces(movieEl: HTMLElement) {
  for (const face of movieEl.querySelectorAll<HTMLElement>('.ss-case-face')) face.style.backgroundImage = '';
}

export function applyMovieFaces(movie: Movie | null) {
  currentMovie = movie;
  const generation = ++faceGeneration;
  const pair = document.querySelector<HTMLElement>('.ss-pair');
  const movieEl = document.querySelector<HTMLElement>('.ss-movie');
  if (!pair || !movieEl) return;
  pair.classList.toggle('no-movie', !movie);
  if (!movie) {
    clearMovieFaces(movieEl);
    return;
  }
  const front = movieEl.querySelector<HTMLElement>('.ss-movie-front');
  const back = movieEl.querySelector<HTMLElement>('.ss-movie-back');
  const spine = movieEl.querySelector<HTMLElement>('.ss-movie-left');
  const art = renderMovieArt(movie, (updated) => {
    if (faceGeneration === generation && currentMovie?.id === movie.id && back) {
      back.style.backgroundImage = `url(${updated.backUrl})`;
    }
  });
  if (back) back.style.backgroundImage = `url(${art.backUrl})`;
  if (spine) spine.style.backgroundImage = `url(${art.spineUrl})`;
  if (front) {
    front.style.backgroundImage = '';
    if (movie.posterUrl) {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        if (faceGeneration === generation && currentMovie?.id === movie.id) {
          front.style.backgroundImage = `url(${movie.posterUrl})`;
        }
      };
      image.onerror = () => {};
      image.src = movie.posterUrl;
    }
  }
}

export function swapMovie(specificMovie?: Movie | null) {
  applyMovieFaces(specificMovie === undefined ? pickNextScreensaverMovie() : specificMovie);
}

export function spinTo(degXOrDeg: number, degY?: number, degZ?: number) {
  if (degY === undefined || degZ === undefined) {
    rotX = -12;
    rotY = degXOrDeg;
    rotZ = 0;
  } else {
    rotX = degXOrDeg;
    rotY = degY;
    rotZ = degZ;
  }
  const rotor = document.getElementById('ss-rotor');
  if (rotor) rotor.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg) rotateZ(${rotZ}deg)`;
}

function applyBounceImpulse(left: boolean, right: boolean, top: boolean, bottom: boolean) {
  if (left || right) {
    omegaZ += (left ? 1 : -1) * vy * 12 + (Math.random() * 20 - 10);
    omegaY = -omegaY * .75 + (Math.random() > .5 ? 1 : -1) * (30 + Math.random() * 25);
    omegaX += (Math.random() - .5) * 35;
  }
  if (top || bottom) {
    omegaZ += (top ? 1 : -1) * vx * 12 + (Math.random() * 20 - 10);
    omegaX = -omegaX * .75 + (Math.random() > .5 ? 1 : -1) * (35 + Math.random() * 25);
    omegaY += (Math.random() - .5) * 30;
  }
  omegaX = Math.max(-140, Math.min(140, omegaX));
  omegaY = Math.max(-160, Math.min(160, omegaY));
  omegaZ = Math.max(-100, Math.min(100, omegaZ));
  if (Math.abs(omegaX) < 20) omegaX = (Math.random() > .5 ? 1 : -1) * (25 + Math.random() * 20);
  if (Math.abs(omegaY) < 25) omegaY = (Math.random() > .5 ? 1 : -1) * (30 + Math.random() * 25);
  if (Math.abs(omegaZ) < 15) omegaZ = (Math.random() > .5 ? 1 : -1) * (20 + Math.random() * 15);
}

export function startScreensaverAnimation() {
  if (rafId !== null) return;
  const logo = document.getElementById('screensaver-logo');
  const rotor = document.getElementById('ss-rotor');
  const overlay = document.getElementById('screensaver-overlay');
  if (!logo || !rotor || !overlay) return;
  vx = (Math.random() > .5 ? 1 : -1) * (2 + Math.random() * 1.5);
  vy = (Math.random() > .5 ? 1 : -1) * (2 + Math.random() * 1.5);
  omegaX = (Math.random() > .5 ? 1 : -1) * (25 + Math.random() * 25);
  omegaY = (Math.random() > .5 ? 1 : -1) * (40 + Math.random() * 35);
  omegaZ = (Math.random() > .5 ? 1 : -1) * (20 + Math.random() * 20);
  void applyWrapFaces();
  swapMovie();
  measure();
  logo.style.left = '0px';
  logo.style.top = '0px';
  window.removeEventListener('resize', measure);
  window.addEventListener('resize', measure);

  const generation = ++animationGeneration;
  let lastFrameTime: number | null = null;
  let timeSinceDraw = 0;
  let timeSinceRot = 0;
  const tick = (now: number) => {
    if (generation !== animationGeneration) return;
    if (lastFrameTime === null) lastFrameTime = now;
    const dt = Math.min(.1, Math.max(0, (now - lastFrameTime) / 1000));
    lastFrameTime = now;
    timeSinceDraw += dt * 1000;
    timeSinceRot += dt * 1000;
    x += vx * dt * 60;
    y += vy * dt * 60;
    rotX = (rotX + omegaX * dt) % 360;
    rotY = (rotY + omegaY * dt) % 360;
    rotZ = (rotZ + omegaZ * dt) % 360;

    let left = false, right = false, top = false, bottom = false;
    if (x <= 0) { x = 0; vx = Math.abs(vx); left = true; }
    else if (x + boxW >= parentW) { x = Math.max(0, parentW - boxW); vx = -Math.abs(vx); right = true; }
    if (y <= 0) { y = 0; vy = Math.abs(vy); top = true; }
    else if (y + boxH >= parentH) { y = Math.max(0, parentH - boxH); vy = -Math.abs(vy); bottom = true; }
    const hit = left || right || top || bottom;
    if (hit) {
      bounceCount++;
      swapMovie();
      applyBounceImpulse(left, right, top, bottom);
    }
    if (timeSinceDraw >= STYLE_INTERVAL_MS) {
      timeSinceDraw = 0;
      logo.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
      if (hit) logo.style.filter = `drop-shadow(0 0 25px ${HIT_COLORS[Math.floor(Math.random() * HIT_COLORS.length)]})`;
    }
    if (timeSinceRot >= ROT_INTERVAL_MS) {
      timeSinceRot = 0;
      rotor.style.transform = `rotateX(${Math.round(rotX)}deg) rotateY(${Math.round(rotY)}deg) rotateZ(${Math.round(rotZ)}deg)`;
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

export function stopScreensaverAnimation() {
  animationGeneration++;
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
  window.removeEventListener('resize', measure);
}

function forceBounce(edge: 'left' | 'right' | 'top' | 'bottom' = 'left') {
  measure();
  if (edge === 'left') { x = -1; vx = -Math.abs(vx); }
  if (edge === 'right') { x = parentW - boxW + 1; vx = Math.abs(vx); }
  if (edge === 'top') { y = -1; vy = -Math.abs(vy); }
  if (edge === 'bottom') { y = parentH - boxH + 1; vy = Math.abs(vy); }
}

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__screensaver = {
    start: startScreensaverAnimation,
    stop: stopScreensaverAnimation,
    setMode: (_mode: string) => { void applyWrapFaces(); measure(); },
    spinTo,
    setMovie: (movie: Movie | null) => applyMovieFaces(movie),
    setMovies: (movies: Movie[] | null) => { customMovies = movies; },
    getCurrentMovie: () => currentMovie,
    swapMovie,
    forceBounce,
    getBounces: () => bounceCount,
    getTumble: () => ({ rotX, rotY, rotZ, omegaX, omegaY, omegaZ, vx, vy, x, y, boxW, boxH, pairScale }),
    getArtDebug: () => {
      const cached = currentMovie ? artCache.get(currentMovie.id) : null;
      const background = document.querySelector<HTMLElement>('.ss-movie-back')?.style.backgroundImage ?? '';
      return { cacheSize: artCache.size, cacheIds: [...artCache.keys()],
        currentBackMatchesCache: !currentMovie || (!!cached && background.includes(cached.backUrl)) };
    },
    isRunning: () => rafId !== null,
    applyWrapFaces,
  };
}
