// The tip jar's shared parts: the QR code, the counter card's art, and the
// full-screen overlay the card opens.
//
// Why the QR is a literal matrix and not a library: the payload never changes,
// so encoding it at runtime would ship a Reed-Solomon implementation to draw
// one constant. The 29x29 grid below is version 3, EC level M, generated with
// `qrencode -l M` and then DECODED back (OpenCV's QRCodeDetector) to prove it
// reads as exactly TIP_URL before it was pasted here. A reviewer can see the
// three finder squares in the source, and regenerating it is one shell line —
// which is the point: no vendored encoder, no dependency, no network.
//
// The store shows this to a living room, so the card is deliberately quiet: a
// counter card next to the register (9 in wide as of GH #10, up from the
// original 6 — it read too small to bother scanning), no glow, no animation,
// nothing on the marquee. It is also switchable off entirely (`bb_tip_jar`),
// because the same build runs on a family TV where a donation ask is not
// wanted.
import { getActiveLogoSpec, HALCYON_GOLD, HALCYON_CREAM, HALCYON_BLUE } from './logo-spec';
import { getActiveTheme } from './themes';
import { BB_ARCHIVO_BLACK, bundledFontReady, ensureBundledFont } from './bundled-fonts';
import { getSetting } from './settings';

export const TIP_URL = 'https://ko-fi.com/halcyonvideo';
/** The URL as it is PRINTED — no scheme, the way a card of the era would set it. */
export const TIP_URL_LABEL = 'ko-fi.com/halcyonvideo';
export const TIP_HEADLINE = 'TIPS';
export const TIP_SUBLINE = 'KEEP THE TAPES ROLLING';

/** `true` unless the owner switched the jar off (default ON). */
export function tipJarEnabled(): boolean {
  try {
    return getSetting<boolean>('bb_tip_jar') !== false;
  } catch {
    return true;
  }
}

// QR version 3 (29x29), EC level M, byte mode, payload = TIP_URL.
const QR_ROWS: readonly string[] = [
  '11111110101101110101101111111',
  '10000010100001001100001000001',
  '10111010010010001010001011101',
  '10111010110000110100001011101',
  '10111010001100101001001011101',
  '10000010010011011111001000001',
  '11111110101010101010101111111',
  '00000000111010011110000000000',
  '10110111000011010110001001011',
  '10000100000001110111111110001',
  '10111110101011001010001110110',
  '10000000010010001001011100001',
  '11100111100100110100010001100',
  '01100101111100101111001000111',
  '00100010011101011111010100111',
  '01010100110110101010011100010',
  '11000010001000111011110111010',
  '01001101001100101100100001110',
  '10001111011111111010110100100',
  '00001100001111100111011010100',
  '01100010100101101110111111100',
  '00000000100010011010100011111',
  '11111110101010110111101011010',
  '10000010110101110001100011000',
  '10111010010110000100111110101',
  '10111010101100000101110111010',
  '10111010100110100010100100101',
  '10000010010111001000101101010',
  '11111110110001110011111110010',
];

export const QR_MODULES = QR_ROWS.length;
/** Quiet zone, in modules. Four is the spec minimum; below it, scanners miss. */
export const QR_QUIET = 4;

/**
 * Paint the code into `size` px square at (x, y), quiet zone included. Modules
 * are snapped to whole pixels — a fractional module edge is what makes a
 * rendered QR fail to scan on the second try.
 */
export function drawTipQr(
  c: CanvasRenderingContext2D, x: number, y: number, size: number,
  dark = '#000000', light = '#ffffff',
): void {
  const span = QR_MODULES + QR_QUIET * 2;
  const m = Math.max(1, Math.floor(size / span));
  const side = m * span;
  // Centre whatever rounding left over, so the code sits square in its box.
  const ox = Math.round(x + (size - side) / 2);
  const oy = Math.round(y + (size - side) / 2);
  c.fillStyle = light;
  c.fillRect(ox, oy, side, side);
  c.fillStyle = dark;
  for (let r = 0; r < QR_MODULES; r++) {
    const row = QR_ROWS[r];
    for (let q = 0; q < QR_MODULES; q++) {
      if (row.charCodeAt(q) === 49 /* '1' */) {
        c.fillRect(ox + (q + QR_QUIET) * m, oy + (r + QR_QUIET) * m, m, m);
      }
    }
  }
}

// ─── The counter card ───────────────────────────────────────────────────────
/** Printed card proportions (5 x 4 in), shared by the fixture and the art. */
export const TIP_CARD_ASPECT = 5 / 4;

const CARD_STOCK = '#f6efdc'; // the same card stock the house boards print on

function cardFont(px: number, weight = '700'): string {
  const face = bundledFontReady(BB_ARCHIVO_BLACK) ? `${BB_ARCHIVO_BLACK}, ` : '';
  return `${weight} ${px}px ${face}"Noto Sans", sans-serif`;
}

/**
 * The card face. Original art for a fictional chain: a cream card with the
 * house emerald header band, the brass hairline the boards use, the code, and
 * the URL set as a line of type. No emblem — a tip card is a manager's index
 * card, not a piece of the sign package, and the store already says whose it is.
 *
 * `ensureBundledFont` is armed by the caller (the fixture repaints when Archivo
 * lands, same contract as the fascia blades).
 */
export function drawTipCard(c: CanvasRenderingContext2D, W: number, H: number): void {
  c.fillStyle = CARD_STOCK;
  c.fillRect(0, 0, W, H);

  // Header band + the brass rule under it.
  const bandH = Math.round(H * 0.21);
  c.fillStyle = HALCYON_BLUE;
  c.fillRect(0, 0, W, bandH);
  c.fillStyle = HALCYON_GOLD;
  c.fillRect(0, bandH, W, Math.max(2, Math.round(H * 0.018)));

  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = HALCYON_CREAM;
  c.font = cardFont(Math.round(bandH * 0.62), '900');
  c.fillText(TIP_HEADLINE, W / 2, bandH * 0.52);

  // Subline, emerald on the stock — shrunk to fit rather than clipped, so a
  // brand pack's own face can be wider than Archivo without breaking the card.
  c.fillStyle = HALCYON_BLUE;
  const subPx = Math.round(H * 0.082);
  c.font = cardFont(subPx, '700');
  const subW = c.measureText(TIP_SUBLINE).width;
  const maxSubW = W * 0.88;
  if (subW > maxSubW) c.font = cardFont(Math.max(8, Math.floor(subPx * (maxSubW / subW))), '700');
  c.fillText(TIP_SUBLINE, W / 2, bandH + H * 0.10);

  // The code, on its own white patch so the stock's warmth can't eat contrast.
  const qrSize = Math.round(H * 0.50);
  drawTipQr(c, (W - qrSize) / 2, Math.round(bandH + H * 0.17), qrSize, HALCYON_BLUE, '#ffffff');

  // The URL, printed.
  c.fillStyle = HALCYON_BLUE;
  c.font = cardFont(Math.round(H * 0.072), '700');
  c.fillText(TIP_URL_LABEL, W / 2, H * 0.935);
}

/** A card texture-sized canvas, ready to hand to a CanvasTexture. */
export function paintTipCardCanvas(canvas: HTMLCanvasElement): void {
  const c = canvas.getContext('2d');
  if (c) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    drawTipCard(c, canvas.width, canvas.height);
  }
}

/** Arm the card's face and repaint when it lands (fonts register async). */
export function ensureTipCardFont(onReady: () => void): void {
  ensureBundledFont(BB_ARCHIVO_BLACK, onReady);
}

// ─── The overlay ────────────────────────────────────────────────────────────
//
// Owned here, not in main.ts, so the harness gets the identical thing without
// the DOM shell — `npm run shot -- --state tipjar` is shooting the real overlay.
//
// Remote-first dismissal: ANY key closes it, and the handler runs in the
// capture phase and swallows exactly that one event, so a TV remote's OK / Back
// / arrow all work and nothing behind it also acts on the press.
let overlayEl: HTMLDivElement | null = null;
let overlayKeyHandler: ((e: KeyboardEvent) => void) | null = null;

// The overlay carries its own stylesheet instead of living in styles.css: the
// screenshot harness (harness.html) has no DOM shell and no styles.css, and a
// verification shot of an unstyled overlay verifies nothing.
const OVERLAY_CSS = `
#tip-overlay {
  position: fixed; inset: 0; z-index: 1400;
  display: flex; align-items: center; justify-content: center;
  background: rgba(8, 18, 14, 0.82);
  opacity: 0; transition: opacity 160ms ease;
  font-family: "Noto Sans", system-ui, sans-serif;
}
#tip-overlay.visible { opacity: 1; }
#tip-overlay .tip-overlay-card {
  background: var(--tip-stock, ${CARD_STOCK});
  border: 3px solid var(--tip-rule, ${HALCYON_GOLD});
  border-radius: 10px;
  padding: 2.2vh 3vh 2.6vh;
  text-align: center;
  max-width: min(52vh, 86vw);
  box-shadow: 0 2vh 6vh rgba(0, 0, 0, 0.55);
}
#tip-overlay .tip-overlay-head {
  background: var(--tip-field, ${HALCYON_BLUE});
  color: var(--tip-knockout, ${HALCYON_CREAM});
  font-weight: 900; letter-spacing: 0.06em;
  font-size: clamp(13px, 2.2vh, 26px);
  padding: 0.9vh 1.4vh; border-radius: 5px;
}
#tip-overlay .tip-overlay-qr {
  display: block; margin: 2vh auto 1.4vh;
  width: min(30vh, 62vw); height: auto;
  image-rendering: pixelated;
  border: 0.6vh solid #ffffff; border-radius: 4px;
}
#tip-overlay .tip-overlay-url {
  color: var(--tip-field, ${HALCYON_BLUE});
  font-weight: 800; letter-spacing: 0.04em;
  font-size: clamp(12px, 2vh, 24px);
}
#tip-overlay .tip-overlay-note {
  color: #4a4438; margin-top: 1.2vh;
  font-size: clamp(10px, 1.4vh, 16px); line-height: 1.4;
}
`;

function ensureOverlayStyles(): void {
  if (document.getElementById('tip-overlay-style')) return;
  const style = document.createElement('style');
  style.id = 'tip-overlay-style';
  style.textContent = OVERLAY_CSS;
  document.head.appendChild(style);
}

export function isTipOverlayOpen(): boolean {
  return !!overlayEl;
}

export function openTipOverlay(): void {
  if (overlayEl || typeof document === 'undefined') return;
  ensureOverlayStyles();

  const el = document.createElement('div');
  el.id = 'tip-overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Tip jar');
  // Follows the active house (and any installed brand pack) the way the card
  // itself does; the literals in the stylesheet are only the no-theme fallback.
  try {
    const p = getActiveTheme().palette;
    el.style.setProperty('--tip-field', p.primary);
    el.style.setProperty('--tip-rule', p.secondary);
    el.style.setProperty('--tip-knockout', getActiveLogoSpec().textColor);
  } catch { /* no theme (pure-DOM callers) — the stylesheet's fallbacks stand */ }

  const card = document.createElement('div');
  card.className = 'tip-overlay-card';

  const head = document.createElement('div');
  head.className = 'tip-overlay-head';
  head.textContent = `${TIP_HEADLINE} — ${TIP_SUBLINE}`;
  card.appendChild(head);

  const qr = document.createElement('canvas');
  qr.className = 'tip-overlay-qr';
  // 8 device px per module at the largest sane size; the CSS scales it down,
  // and a whole-pixel source is what keeps the modules crisp when it does.
  const span = (QR_MODULES + QR_QUIET * 2) * 12;
  qr.width = span;
  qr.height = span;
  const qc = qr.getContext('2d');
  if (qc) drawTipQr(qc, 0, 0, span, '#0f2a20', '#ffffff');
  card.appendChild(qr);

  const url = document.createElement('div');
  url.className = 'tip-overlay-url';
  url.textContent = TIP_URL_LABEL;
  card.appendChild(url);

  const note = document.createElement('div');
  note.className = 'tip-overlay-note';
  note.textContent = 'Scan it, or type it in. Nothing here is paywalled — press any key to go back.';
  card.appendChild(note);

  el.appendChild(card);
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); closeTipOverlay(); });
  document.body.appendChild(el);
  overlayEl = el;
  // Opened from a walk-mode click, the pointer is locked and the overlay would
  // be unclickable. Hand the cursor back; walk mode re-acquires on the next
  // click exactly as it does after any other overlay.
  try { document.exitPointerLock?.(); } catch { /* not locked */ }

  overlayKeyHandler = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    closeTipOverlay();
  };
  window.addEventListener('keydown', overlayKeyHandler, { capture: true });
  // A frame later so the transition actually runs from the un-shown state.
  requestAnimationFrame(() => el.classList.add('visible'));
}

export function closeTipOverlay(): void {
  if (overlayKeyHandler) {
    window.removeEventListener('keydown', overlayKeyHandler, { capture: true });
    overlayKeyHandler = null;
  }
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
}
