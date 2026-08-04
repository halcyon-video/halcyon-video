// Screensaver: the classic bouncing-DVD-logo idle screen, except the bouncer
// is a 3D CSS object — a rental VHS clamshell, or (rolled per activation
// and occasionally re-rolled on a wall bounce) a DVD disc. The markup lives in
// index.html under #screensaver-logo; this module only moves and spins it.
//
// The rotation is deliberately stepped at ~12fps for the chunky
// standalone-DVD-player look; the bounce keeps the original smooth ~30fps
// style-write cap. This loop is the app's steady state for days at a time
// (issue #106), so it stays cheap: motion is dt-based (velocities are px/sec
// at a 60fps baseline, scaled by real elapsed time so a 120Hz display doesn't
// double the speed), and rAF ticks that fall between the style/rotation
// intervals do only arithmetic — no style mutation. main.ts stops the loop
// entirely while the window is occluded (issue #102).

import { rentalWrapFaceImages } from './video-case';

type SaverMode = 'vhs' | 'disc';

const DISC_CHANCE_AT_START = 0.3; // per screensaver activation
const SWAP_CHANCE_ON_HIT = 0.1;   // re-roll the object on a wall bounce
const HIT_COLORS = ['#00f0ff', '#ff007f', '#ffaa00', '#00ff66', '#a855f7'];
const STYLE_INTERVAL_MS = 1000 / 30; // bounce style writes
const ROT_INTERVAL_MS = 1000 / 12;   // stepped rotation frames
const ROT_STEP_DEG: Record<SaverMode, number> = { vhs: 4, disc: 6 };
const TILT_DEG: Record<SaverMode, number> = { vhs: -12, disc: -14 };

let x = 100;
let y = 100;
let vx = 2.5;
let vy = 2.0;
let angle = 0;
let mode: SaverMode = 'vhs';
let rafId: number | null = null;

let boxW = 0;
let boxH = 0;
let parentW = 0;
let parentH = 0;

function measure() {
  const logo = document.getElementById('screensaver-logo');
  const overlay = document.getElementById('screensaver-overlay');
  if (logo && overlay) {
    // The container's layout box is fixed per mode (children's 3D transforms
    // don't affect it), so the bounce walls stay stable while the object spins.
    const rect = logo.getBoundingClientRect();
    const parentRect = overlay.getBoundingClientRect();
    boxW = rect.width;
    boxH = rect.height;
    parentW = parentRect.width;
    parentH = parentRect.height;
  }
}

// The VHS box wears the store's real rental wrap (the 1988 Standard Version
// scan from video-case.ts), cropped per face and applied as backgrounds on
// first use. The box's width/depth come from the printed panel proportions so
// the art lands 1:1 instead of stretched.
const VHS_BOX_H_PX = 200;
let wrapApplied = false;

function applyWrapFaces() {
  if (wrapApplied) return;
  wrapApplied = true;
  rentalWrapFaceImages().then(({ front, back, spine, frontAspect, spineAspect }) => {
    const vhs = document.querySelector<HTMLElement>('.ss-vhs');
    if (!vhs) return;
    vhs.style.setProperty('--vhsW', `${Math.round(VHS_BOX_H_PX * frontAspect)}px`);
    vhs.style.setProperty('--vhsD', `${Math.round(VHS_BOX_H_PX * spineAspect)}px`);
    const bg = (sel: string, url: string) => {
      const el = vhs.querySelector<HTMLElement>(sel);
      if (el) el.style.backgroundImage = `url(${url})`;
    };
    bg('.ss-vhs-front', front);
    bg('.ss-vhs-back', back);
    // Clamshell hinge side, like a book: the printed spine is the left face.
    bg('.ss-vhs-left', spine);
  });
}

function applyMode(next: SaverMode) {
  mode = next;
  applyWrapFaces();
  const logo = document.getElementById('screensaver-logo');
  if (!logo) return;
  logo.classList.toggle('mode-vhs', next === 'vhs');
  logo.classList.toggle('mode-disc', next === 'disc');
  measure();
  // The two objects have different container sizes — clamp so a swap near a
  // wall doesn't leave the box already past it (which would jitter-flip vx/vy).
  x = Math.min(Math.max(x, 0), Math.max(0, parentW - boxW));
  y = Math.min(Math.max(y, 0), Math.max(0, parentH - boxH));
}

function spinTo(deg: number) {
  angle = ((deg % 360) + 360) % 360;
  const rotor = document.getElementById('ss-rotor');
  if (rotor) rotor.style.transform = `rotateX(${TILT_DEG[mode]}deg) rotateY(${angle}deg)`;
}

export function startScreensaverAnimation() {
  const logo = document.getElementById('screensaver-logo');
  const rotor = document.getElementById('ss-rotor');
  const overlay = document.getElementById('screensaver-overlay');
  if (!logo || !rotor || !overlay) return;

  vx = (Math.random() > 0.5 ? 1 : -1) * (2.0 + Math.random() * 1.5);
  vy = (Math.random() > 0.5 ? 1 : -1) * (2.0 + Math.random() * 1.5);
  applyMode(Math.random() < DISC_CHANCE_AT_START ? 'disc' : 'vhs');
  spinTo(Math.random() * 360);

  // Clear left/top styles so they do not conflict with transform
  logo.style.left = '0px';
  logo.style.top = '0px';

  window.addEventListener('resize', measure);

  let lastFrameTime: number | null = null;
  let timeSinceDraw = 0;
  let timeSinceRot = 0;

  function tick(now: number) {
    if (lastFrameTime === null) lastFrameTime = now;
    const dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    timeSinceDraw += dt * 1000;
    timeSinceRot += dt * 1000;

    x += vx * dt * 60;
    y += vy * dt * 60;

    let hit = false;

    if (x <= 0) {
      x = 0;
      vx = -vx;
      hit = true;
    } else if (x + boxW >= parentW) {
      x = parentW - boxW;
      vx = -vx;
      hit = true;
    }

    if (y <= 0) {
      y = 0;
      vy = -vy;
      hit = true;
    } else if (y + boxH >= parentH) {
      y = parentH - boxH;
      vy = -vy;
      hit = true;
    }

    if (hit && Math.random() < SWAP_CHANCE_ON_HIT) {
      applyMode(mode === 'vhs' ? 'disc' : 'vhs');
    }

    if (timeSinceDraw >= STYLE_INTERVAL_MS) {
      timeSinceDraw = 0;
      logo!.style.transform = `translate3d(${x}px, ${y}px, 0)`;

      if (hit) {
        const randomColor = HIT_COLORS[Math.floor(Math.random() * HIT_COLORS.length)];
        logo!.style.filter = `drop-shadow(0 0 25px ${randomColor})`;
      }
    }

    if (timeSinceRot >= ROT_INTERVAL_MS) {
      timeSinceRot = 0;
      spinTo(angle + ROT_STEP_DEG[mode]);
    }

    rafId = requestAnimationFrame(tick);
  }

  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(tick);
}

export function stopScreensaverAnimation() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  window.removeEventListener('resize', measure);
}

// Verification/debug hook (same spirit as window.__clerkAudit): lets a
// puppeteer run force the overlay, pin the object and angle, and screenshot.
(window as unknown as Record<string, unknown>).__screensaver = {
  start: startScreensaverAnimation,
  stop: stopScreensaverAnimation,
  setMode: applyMode,
  spinTo,
};
