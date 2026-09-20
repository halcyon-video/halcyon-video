// Lightweight idle animation: the store's rental VHS clamshell tumbles and
// bounces off viewport walls. Every wall contact applies a small edge-derived
// impulse to its three-axis tumble. The loop retains the 30fps movement /
// 12fps rotation caps.

import { rentalWrapFaceImages } from './video-case';
import type { Movie } from './jellyfin';

const HIT_COLORS = ['#00f0ff', '#ff007f', '#ffaa00', '#00ff66', '#a855f7'];
const STYLE_INTERVAL_MS = 1000 / 30;
const ROT_INTERVAL_MS = 1000 / 12;
const PROJECTED_BOX_PX = 240;
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

let boxW = PROJECTED_BOX_PX;
let boxH = PROJECTED_BOX_PX;
let pairScale = 1;
let parentW = 0;
let parentH = 0;

export function screensaverBoxMetrics(width: number, height: number) {
  const available = Math.max(1, Math.min(
    PROJECTED_BOX_PX,
    width - VIEWPORT_MARGIN_PX * 2,
    height - VIEWPORT_MARGIN_PX * 2,
  ));
  return { side: available, scale: Math.min(1, available / PROJECTED_BOX_PX) };
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

// The rental shell always uses the existing rental-wrap renderer. There is
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

// Backwards-compatible stubs for external callers/tests
export function getScreensaverMovies(): Movie[] { return []; }
export function chooseNextScreensaverMovie(_movies: Movie[], _currentId: string | null): Movie | null { return null; }
export function pickNextScreensaverMovie(): Movie | null { return null; }
export function applyMovieFaces(_movie: Movie | null): void {}
export function swapMovie(_specificMovie?: Movie | null): void {}

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
    setMovie: (_movie: Movie | null) => {},
    setMovies: (_movies: Movie[] | null) => {},
    getCurrentMovie: () => null,
    swapMovie: () => {},
    forceBounce,
    getBounces: () => bounceCount,
    getTumble: () => ({ rotX, rotY, rotZ, omegaX, omegaY, omegaZ, vx, vy, x, y, boxW, boxH, pairScale }),
    getArtDebug: () => ({ cacheSize: 0, cacheIds: [], currentBackMatchesCache: true }),
    isRunning: () => rafId !== null,
    applyWrapFaces,
  };
}
