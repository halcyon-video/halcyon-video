// ─── T17: Jellyfin membership cards ────────────────────────────────────────
//
// Household user switching, diegetically: each Jellyfin user shows up as a
// laminated store membership card. Picking your card is how you log
// in / switch profiles.
//
// This module is intentionally self-contained -- it owns its own DOM
// overlay (built entirely in JS, styles injected once) and a capture-phase
// keydown listener, the same pattern src/main.ts already uses for the
// diegetic search terminal (see handleSearchKeydown). It has no dependency
// on the three.js scene or on video-case.ts, so it can be wired into the
// existing DOM login flow with minimal changes elsewhere.
//
// The boot/login screen in this app is a 2D DOM overlay (not a three.js
// scene), so "MeshPhysicalMaterial + clearcoat" from the ticket is
// reinterpreted here as its 2D equivalent: a canvas-drawn card face plus a
// CSS glint sweep and heavy box-shadow to sell the laminated look.

import { signInAsPublicUser, buildUserAvatarUrl } from './media-backend.ts';
import type { PublicUser } from './media-types.ts';
import { getActiveTheme } from './themes';
import { BB_ANTON, BB_ARCHIVO_BLACK } from './bundled-fonts';
import { HALCYON_CREAM } from './logo-spec';

export interface MembershipLoginSession {
  accessToken: string;
  userId: string;
  userName: string;
}

export interface OpenCardPickerOptions {
  serverUrl: string;
  users: PublicUser[];
  /** Last-used user id, if any -- pre-highlighted (not auto-logged-in). */
  lastUserId?: string | null;
  /**
   * Session token the user list was fetched with. Jellyfin ignores it (each
   * card signs in on its own name+password), but Plex needs it: its cards are
   * Home members of an already-authenticated ACCOUNT, and picking one swaps
   * the account token for that member's own.
   */
  sessionToken?: string;
  onLogin: (session: MembershipLoginSession) => void | Promise<void>;
  onManualLogin: () => void;
  onDemoMode?: () => void;
  log?: (message: string) => void;
}

let isOpen = false;
let overlayEl: HTMLDivElement | null = null;
let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
let cardEls: HTMLDivElement[] = [];
let focusIndex = 0;
let flippedIndex: number | null = null;

export function isMembershipPickerOpen(): boolean {
  return isOpen;
}

// ─── Deterministic "fake" card art helpers ─────────────────────────────────

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable fake 16-digit "member number" derived from the Jellyfin user id. */
function fakeMemberNumber(userId: string): string {
  const h1 = hashString(`${userId}:a`);
  const h2 = hashString(`${userId}:b`);
  const digits = (String(h1).padStart(10, '0') + String(h2).padStart(10, '0')).slice(0, 16);
  return digits.match(/.{1,4}/g)!.join(' ');
}

function drawBarcode(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number): void {
  const rnd = mulberry32(seed);
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
  ctx.fillStyle = '#111111';
  let cx = x;
  while (cx < x + w) {
    const barW = 1 + Math.floor(rnd() * 3);
    if (rnd() > 0.42) ctx.fillRect(cx, y, barW, h);
    cx += barW + 1;
  }
  ctx.restore();
}

/** Fakes an embossed-plastic look by layering a dark/light offset behind the main fill. */
function embossText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, color: string): void {
  ctx.font = font;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillText(text, x + 1.5, y + 2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText(text, x - 1, y - 1);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// Credit-card proportions (ISO/IEC 7810 ID-1 ratio ~1.586:1), rendered wide
// enough that names stay crisp per the ticket's >=512px requirement.
const CARD_W = 1024;
const CARD_H = 646;

function drawCardFront(canvas: HTMLCanvasElement, user: PublicUser, avatarImg: HTMLImageElement | null): void {
  const theme = getActiveTheme();
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const house = theme.palette.primary;
  const trim = theme.palette.secondary;

  // Cream laminate card stock.
  ctx.fillStyle = HALCYON_CREAM;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // House-color header band with a diagonal underside, and a brass rule
  // hugging that edge — the card's whole brand statement.
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(CARD_W, 0);
  ctx.lineTo(CARD_W, 92);
  ctx.lineTo(0, 152);
  ctx.closePath();
  ctx.fillStyle = house;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, 152);
  ctx.lineTo(CARD_W, 92);
  ctx.lineTo(CARD_W, 106);
  ctx.lineTo(0, 166);
  ctx.closePath();
  ctx.fillStyle = trim;
  ctx.fill();

  ctx.fillStyle = HALCYON_CREAM;
  ctx.font = `900 42px ${BB_ARCHIVO_BLACK}, ${BB_ANTON}, sans-serif`;
  ctx.fillText(theme.brand.name.toUpperCase(), 36, 72);

  ctx.fillStyle = house;
  ctx.font = `700 26px ${BB_ARCHIVO_BLACK}, ${BB_ANTON}, sans-serif`;
  ctx.fillText('PREFERRED MEMBER', 36, 194);

  // Photo corner.
  const px = 36, py = 224, pw = 190, ph = 220;
  ctx.fillStyle = house;
  ctx.fillRect(px - 6, py - 6, pw + 12, ph + 12);
  ctx.strokeStyle = trim;
  ctx.lineWidth = 3;
  ctx.strokeRect(px - 6, py - 6, pw + 12, ph + 12);
  if (avatarImg) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();
    ctx.drawImage(avatarImg, px, py, pw, ph);
    ctx.restore();
  } else {
    ctx.fillStyle = house;
    ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = trim;
    ctx.font = `900 120px ${BB_ARCHIVO_BLACK}, ${BB_ANTON}, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText((user.name[0] || '?').toUpperCase(), px + pw / 2, py + ph / 2 + 42);
    ctx.textAlign = 'left';
  }

  embossText(ctx, user.name.toUpperCase(), px + pw + 40, py + 70, `900 50px ${BB_ARCHIVO_BLACK}, ${BB_ANTON}, sans-serif`, house);
  embossText(ctx, `MEMBER SINCE ${new Date().getFullYear()}`, px + pw + 40, py + 114, `600 22px ${BB_ARCHIVO_BLACK}, sans-serif`, trim);

  ctx.fillStyle = house;
  ctx.font = '600 32px "Courier New", monospace';
  ctx.fillText(fakeMemberNumber(user.id), px + pw + 40, py + 186);

  if (user.hasPassword) {
    ctx.fillStyle = HALCYON_CREAM;
    ctx.font = `700 20px ${BB_ARCHIVO_BLACK}, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText('PASSWORD REQUIRED', CARD_W - 40, 60);
    ctx.textAlign = 'left';
  }

  drawBarcode(ctx, 36, CARD_H - 74, CARD_W - 72, 44, hashString(user.id));
}

// ─── The card as a DEPICTED PRODUCT ─────────────────────────────────────────
//
// The same house card the login picker fans out, painted into an arbitrary
// rect of any 2D canvas so signage can composite it (signage rule 5: a product
// depicted ON a sign is its own artifact, shared — the rewards card serves
// more than one sign). It carries no Jellyfin user: a card lying on artwork is
// the PROGRAMME's card, not a member's, so there is no name, no photo and no
// member number to invent.
//
// Every brand element comes from canon (rule 2): the header band is
// palette.primary, the rule under it palette.secondary, the wordmark is
// theme.brand.name in the bundled display face. Install a brand pack and this
// card changes with it — which is the whole point of the F8 pin (026) that
// asked for it. HALCYON_CREAM is the card STOCK, not a house colour: it is
// logo-spec's print-knockout token and stands in for laminated white board,
// the same way drawCardFront uses it.
export function drawRewardsCardFace(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
): void {
  const theme = getActiveTheme();
  const house = theme.palette.primary;
  const trim = theme.palette.secondary;
  const r = h * 0.09;

  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(w, 0, w, h, r);
  ctx.arcTo(w, h, 0, h, r);
  ctx.arcTo(0, h, 0, 0, r);
  ctx.arcTo(0, 0, w, 0, r);
  ctx.closePath();
  ctx.save();
  ctx.clip();

  ctx.fillStyle = HALCYON_CREAM;
  ctx.fillRect(0, 0, w, h);

  // House-colour header band with the diagonal underside and the brass rule
  // hugging it — drawCardFront's whole brand statement, at card-on-artwork
  // scale (its 92/152/166 of 646 px become the same fractions of h).
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, 0);
  ctx.lineTo(w, h * 0.142);
  ctx.lineTo(0, h * 0.235);
  ctx.closePath();
  ctx.fillStyle = house;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, h * 0.235);
  ctx.lineTo(w, h * 0.142);
  ctx.lineTo(w, h * 0.164);
  ctx.lineTo(0, h * 0.257);
  ctx.closePath();
  ctx.fillStyle = trim;
  ctx.fill();

  // Shrink-to-fit, both lines: a brand name is arbitrary length (and this card
  // is small), so nothing here may run off the stock. Uniform scale only — no
  // scaleX, which would forge a condensed cut of the display face.
  const fitted = (text: string, px: number, maxW: number): string => {
    let size = px;
    for (let i = 0; i < 12; i++) {
      ctx.font = `900 ${Math.round(size)}px ${BB_ARCHIVO_BLACK}, ${BB_ANTON}, sans-serif`;
      if (ctx.measureText(text).width <= maxW || size <= 6) break;
      size *= 0.92;
    }
    return ctx.font;
  };

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = HALCYON_CREAM;
  const brandName = theme.brand.name.toUpperCase();
  ctx.font = fitted(brandName, h * 0.17, w * 0.93);
  ctx.fillText(brandName, w * 0.035, h * 0.155);

  ctx.fillStyle = house;
  ctx.font = fitted('PREFERRED MEMBER', h * 0.105, w * 0.93);
  ctx.fillText('PREFERRED MEMBER', w * 0.035, h * 0.40);

  // The signature/number strip and the barcode block the real card carries —
  // set as blocks, not as invented digits: at depiction scale a card's number
  // is a texture, and typing one would be inventing a fact.
  ctx.fillStyle = trim;
  ctx.fillRect(w * 0.035, h * 0.50, w * 0.60, h * 0.055);
  ctx.fillStyle = house;
  ctx.fillRect(w * 0.035, h * 0.60, w * 0.44, h * 0.045);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(w * 0.035, h * 0.72, w * 0.93, h * 0.20);
  ctx.fillStyle = house;
  for (let bx = w * 0.055; bx < w * 0.95; bx += w * 0.035) {
    ctx.fillRect(bx, h * 0.745, w * 0.014, h * 0.15);
  }

  ctx.restore();          // un-clip, keep the path
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = Math.max(1, h * 0.012);
  ctx.stroke();
  ctx.restore();
}

function drawCardBack(canvas: HTMLCanvasElement, user: PublicUser): void {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#12173a';
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = '#080a1a';
  ctx.fillRect(0, 44, CARD_W, 92);
  ctx.fillStyle = '#e9e6da';
  ctx.fillRect(56, 240, CARD_W - 340, 64);
  ctx.fillStyle = '#333333';
  ctx.font = 'italic 22px "Courier New", monospace';
  ctx.fillText('Sign in as', 72, 278);
  ctx.font = 'italic 700 26px "Courier New", monospace';
  ctx.fillText(user.name, 240, 278);
  drawBarcode(ctx, 56, CARD_H - 92, CARD_W - 112, 38, hashString(`${user.id}:back`));
}

// ─── DOM / overlay construction ─────────────────────────────────────────────

const CARD_CSS = `
#membership-card-overlay {
  position: fixed; inset: 0; z-index: 30;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 26px;
  background: rgba(2, 2, 6, 0.9);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  opacity: 0; pointer-events: none;
  transition: opacity 0.35s ease-in-out;
}
#membership-card-overlay.visible { opacity: 1; pointer-events: auto; }
.mc-title {
  font-family: var(--font-title, sans-serif);
  color: #fff; font-size: 2rem; letter-spacing: 2px; text-transform: uppercase;
  text-shadow: 0 0 14px var(--crt-gold, #ffcc00);
  margin: 0;
}
.mc-hint {
  font-family: var(--font-body, sans-serif);
  color: #94a3b8; font-size: 0.9rem; margin: 0;
}
.mc-card-row {
  display: flex; gap: 14px; perspective: 1600px; padding: 40px 10px;
  flex-wrap: wrap; justify-content: center; max-width: 92vw;
}
.mc-card {
  position: relative; width: 300px; height: 189px; cursor: pointer;
  transition: transform 0.25s ease, filter 0.25s ease;
  transform: scale(0.92) translateY(6px);
  filter: brightness(0.68);
}
.mc-card.selected {
  transform: scale(1.06) translateY(-14px);
  filter: brightness(1);
  z-index: 2;
}
.mc-card.mc-shake { animation: mc-shake-anim 0.4s ease; }
@keyframes mc-shake-anim {
  0%, 100% { transform: scale(1.06) translateY(-14px) translateX(0); }
  20% { transform: scale(1.06) translateY(-14px) translateX(-10px); }
  40% { transform: scale(1.06) translateY(-14px) translateX(9px); }
  60% { transform: scale(1.06) translateY(-14px) translateX(-6px); }
  80% { transform: scale(1.06) translateY(-14px) translateX(4px); }
}
.mc-card-name {
  text-align: center; margin-top: 10px; color: #fff;
  font-family: var(--font-title, sans-serif); font-size: 0.85rem; letter-spacing: 1px;
  text-transform: uppercase; opacity: 0.7;
}
.mc-card.selected .mc-card-name { opacity: 1; text-shadow: 0 0 8px var(--crt-gold, #ffcc00); }
.mc-card-inner {
  position: relative; width: 100%; height: 100%;
  transform-style: preserve-3d; transition: transform 0.5s cubic-bezier(0.4, 0.1, 0.2, 1);
  border-radius: 14px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.06);
}
.mc-card-inner.flipped { transform: rotateY(180deg); }
.mc-card-face {
  position: absolute; inset: 0; width: 100%; height: 100%;
  backface-visibility: hidden; -webkit-backface-visibility: hidden;
  border-radius: 14px; display: block;
}
.mc-card-front { position: absolute; }
/* Laminate glint: a soft diagonal highlight standing in for the clearcoat
   sheen a MeshPhysicalMaterial would give this card in the 3D store. */
.mc-card-front::after {
  content: ''; position: absolute; inset: 0; border-radius: 14px; pointer-events: none;
  background: linear-gradient(115deg, rgba(255,255,255,0) 35%, rgba(255,255,255,0.35) 48%, rgba(255,255,255,0) 60%);
  mix-blend-mode: screen; opacity: 0.85;
}
.mc-card-back { transform: rotateY(180deg); }
.mc-back-form {
  position: absolute; left: 9%; right: 9%; top: 60%; display: flex; flex-direction: column; gap: 6px;
}
.mc-pass-input {
  background: rgba(255, 255, 255, 0.94); border: none; border-radius: 4px; padding: 7px 10px;
  font-family: var(--font-mono, monospace); font-size: 0.85rem; color: #111;
  cursor: text !important;
  user-select: text !important;
}
.mc-back-error {
  color: #ff5f5f; font-size: 0.7rem; font-family: var(--font-mono, monospace); min-height: 14px;
}
.mc-manual-btn {
  background: transparent; border: 1px solid rgba(255, 255, 255, 0.25); color: #94a3b8;
  padding: 10px 20px; border-radius: 8px; cursor: pointer; font-family: var(--font-title, sans-serif);
  text-transform: uppercase; letter-spacing: 1px; font-size: 0.8rem;
}
.mc-manual-btn:hover, .mc-manual-btn:focus { color: #fff; border-color: #fff; }
.mc-card.mc-loading { opacity: 0.55; pointer-events: none; }
`;

function ensureStylesInjected(): void {
  if (document.getElementById('membership-card-styles')) return;
  const style = document.createElement('style');
  style.id = 'membership-card-styles';
  style.textContent = CARD_CSS;
  document.head.appendChild(style);
}

function updateFocus(): void {
  cardEls.forEach((c, i) => c.classList.toggle('selected', i === focusIndex));
}

function flipCard(index: number, flip: boolean): void {
  const card = cardEls[index];
  const inner = card?.querySelector('.mc-card-inner') as HTMLElement | null;
  if (!inner) return;
  inner.classList.toggle('flipped', flip);
  flippedIndex = flip ? index : null;
  if (flip) {
    window.setTimeout(() => {
      (card.querySelector('.mc-pass-input') as HTMLInputElement | null)?.focus();
    }, 260);
  }
}

function shakeCard(index: number, message?: string): void {
  const card = cardEls[index];
  if (!card) return;
  const errEl = card.querySelector('.mc-back-error') as HTMLElement | null;
  if (errEl) errEl.textContent = message || 'Incorrect password. Try again.';
  card.classList.remove('mc-shake');
  void card.offsetWidth; // restart the CSS animation
  card.classList.add('mc-shake');
  const input = card.querySelector('.mc-pass-input') as HTMLInputElement | null;
  if (input) {
    input.value = '';
    input.focus();
  }
}

async function attemptLogin(opts: OpenCardPickerOptions, user: PublicUser, password: string, cardIndex: number): Promise<void> {
  const card = cardEls[cardIndex];
  card?.classList.add('mc-loading');
  try {
    const session = await signInAsPublicUser(opts.serverUrl, user, password, opts.sessionToken);
    opts.log?.(`[System] Authenticated as ${session.userName} via membership card.`);
    closeMembershipCardPicker();
    await opts.onLogin(session);
  } catch (err: any) {
    card?.classList.remove('mc-loading');
    const msg = err?.message ?? (typeof err === 'string' ? err : String(err));
    opts.log?.(`[System] Membership card login failed: ${msg}`);
    shakeCard(cardIndex, user.hasPassword ? 'Incorrect password. Try again.' : msg);
  }
}

function selectCard(opts: OpenCardPickerOptions, index: number): void {
  focusIndex = index;
  updateFocus();
  const user = opts.users[index];
  if (!user) return;
  if (!user.hasPassword) {
    void attemptLogin(opts, user, '', index);
    return;
  }
  flipCard(index, true);
}

function buildCardElement(opts: OpenCardPickerOptions, user: PublicUser, index: number): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'mc-card';

  const inner = document.createElement('div');
  inner.className = 'mc-card-inner';
  card.appendChild(inner);

  const front = document.createElement('canvas');
  front.className = 'mc-card-face mc-card-front';
  inner.appendChild(front);
  drawCardFront(front, user, null);

  // Avatars are loaded best-effort: not setting crossOrigin so a server
  // without CORS headers still renders the image (canvas is only ever
  // displayed live here, never read back with getImageData/toDataURL, so a
  // "tainted" canvas is harmless).
  const avatarUrl = buildUserAvatarUrl(opts.serverUrl, user);
  if (avatarUrl) {
    const img = new Image();
    img.onload = () => drawCardFront(front, user, img);
    img.onerror = () => { /* keep the initial-letter placeholder */ };
    img.src = avatarUrl;
  }

  const back = document.createElement('div');
  back.className = 'mc-card-face mc-card-back';
  inner.appendChild(back);
  const backCanvas = document.createElement('canvas');
  backCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border-radius:14px;';
  back.appendChild(backCanvas);
  drawCardBack(backCanvas, user);

  if (user.hasPassword) {
    const form = document.createElement('form');
    form.className = 'mc-back-form';
    const input = document.createElement('input');
    input.type = 'password';
    input.className = 'mc-pass-input';
    input.placeholder = 'Password';
    input.autocomplete = 'off';
    const errEl = document.createElement('div');
    errEl.className = 'mc-back-error';
    form.appendChild(input);
    form.appendChild(errEl);
    form.addEventListener('click', (e) => e.stopPropagation());
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void attemptLogin(opts, user, input.value, index);
    });
    back.appendChild(form);
  }

  card.addEventListener('click', () => selectCard(opts, index));

  const nameTag = document.createElement('div');
  nameTag.className = 'mc-card-name';
  nameTag.textContent = user.name;
  card.appendChild(nameTag);

  return card;
}

/** Tear down the overlay and its listener. Safe to call when already closed. */
export function closeMembershipCardPicker(): void {
  isOpen = false;
  if (keydownHandler) {
    window.removeEventListener('keydown', keydownHandler, true);
    keydownHandler = null;
  }
  overlayEl?.remove();
  overlayEl = null;
  cardEls = [];
  flippedIndex = null;
}

/**
 * Show the fanned membership-card picker. Fully keyboard/remote navigable:
 * Left/Right move between cards, Enter selects (logs straight in for a
 * passwordless user, flips to the password face otherwise), Escape backs
 * out to the manual server-entry form.
 */
export function openMembershipCardPicker(opts: OpenCardPickerOptions): void {
  closeMembershipCardPicker();
  ensureStylesInjected();
  isOpen = true;
  flippedIndex = null;
  cardEls = [];

  const lastIdx = opts.lastUserId ? opts.users.findIndex((u) => u.id === opts.lastUserId) : -1;
  focusIndex = lastIdx >= 0 ? lastIdx : 0;

  overlayEl = document.createElement('div');
  overlayEl.id = 'membership-card-overlay';
  overlayEl.className = 'visible';

  const title = document.createElement('h2');
  title.className = 'mc-title';
  title.textContent = "Who's Renting Tonight?";
  overlayEl.appendChild(title);

  const row = document.createElement('div');
  row.className = 'mc-card-row';
  overlayEl.appendChild(row);
  opts.users.forEach((user, i) => {
    const card = buildCardElement(opts, user, i);
    cardEls.push(card);
    row.appendChild(card);
  });

  const hint = document.createElement('p');
  hint.className = 'mc-hint';
  hint.textContent = 'Arrow keys to choose a card, Enter to select.';
  overlayEl.appendChild(hint);

  const manualBtn = document.createElement('button');
  manualBtn.type = 'button';
  manualBtn.className = 'mc-manual-btn';
  manualBtn.textContent = 'Enter a Different Server';
  manualBtn.addEventListener('click', () => {
    closeMembershipCardPicker();
    opts.onManualLogin();
  });
  overlayEl.appendChild(manualBtn);

  if (opts.onDemoMode) {
    const demoBtn = document.createElement('button');
    demoBtn.type = 'button';
    demoBtn.className = 'mc-manual-btn';
    demoBtn.style.marginTop = '8px';
    demoBtn.textContent = 'Try Demo Store (No Server Required)';
    demoBtn.addEventListener('click', () => {
      closeMembershipCardPicker();
      opts.onDemoMode?.();
    });
    overlayEl.appendChild(demoBtn);
  }

  document.body.appendChild(overlayEl);
  updateFocus();

  // Capture-phase listener, same trick as main.ts's search-terminal input
  // capture: runs (and stops propagation) before InputManager's bubble-phase
  // listener, so the global remote/keyboard handling is fully suppressed
  // while this overlay owns the keyboard -- except for the real password
  // <input>, which needs ordinary text-entry key handling.
  keydownHandler = (e: KeyboardEvent) => {
    if (!isOpen) return;
    const active = document.activeElement;
    const typingPassword = active instanceof HTMLInputElement && active.type === 'password';

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (flippedIndex !== null) {
        flipCard(flippedIndex, false);
      } else {
        closeMembershipCardPicker();
        opts.onManualLogin();
      }
      return;
    }

    if (typingPassword) return; // let the browser + form submit handler manage it

    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'ArrowLeft') {
      focusIndex = (focusIndex - 1 + cardEls.length) % cardEls.length;
      updateFocus();
    } else if (e.key === 'ArrowRight') {
      focusIndex = (focusIndex + 1) % cardEls.length;
      updateFocus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      selectCard(opts, focusIndex);
    }
  };
  window.addEventListener('keydown', keydownHandler, true);
}
