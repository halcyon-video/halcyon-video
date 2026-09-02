// Procedural fallback carton art for the video games aisle.
// Gives demo / un-scraped game cartridges authentic retail box styling and
// true platform proportions (landscape SNES/N64, grid-bordered Genesis,
// jewel-cased PSX) rather than borrowing the movie poster rotation.
const BB_ARCHIVO_BLACK = 'BBArchivoBlack';

const artCache = new Map<string, string>();

// 1x1 transparent PNG fallback for non-DOM / test environments.
const BLANK_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export interface GameCartonSpec {
  platform: string;
  title: string;
  year?: number;
  rating?: number;
}

export function generateGameCartonArt(spec: GameCartonSpec): string {
  const key = `${spec.platform}:${spec.title}`;
  const cached = artCache.get(key);
  if (cached) return cached;

  if (typeof document === 'undefined') {
    return BLANK_PNG;
  }

  const plat = (spec.platform || '').toUpperCase();
  let w = 480;
  let h = 600;

  if (plat.includes('SNES') || plat.includes('SUPER NINTENDO')) {
    w = 600;
    h = 420; // 7.5 : 5.25 NA landscape carton
  } else if (plat.includes('N64') || plat.includes('NINTENDO 64')) {
    w = 600;
    h = 420; // 7.5 : 5.25 NA landscape carton
  } else if (plat.includes('GENESIS') || plat.includes('SEGA')) {
    w = 440;
    h = 600; // 5.5 : 7.5 portrait clamshell
  } else if (plat.includes('PLAYSTATION') || plat.includes('PSX')) {
    w = 560;
    h = 490; // 5.6 : 4.9 jewel case
  } else if (plat.includes('GBA') || plat.includes('ADVANCE')) {
    w = 480;
    h = 540; // 4.8 : 5.4 portrait carton
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return BLANK_PNG;

  if (plat.includes('SNES') || plat.includes('SUPER NINTENDO')) {
    drawSnesCarton(ctx, w, h, spec);
  } else if (plat.includes('N64') || plat.includes('NINTENDO 64')) {
    drawN64Carton(ctx, w, h, spec);
  } else if (plat.includes('GENESIS') || plat.includes('SEGA')) {
    drawGenesisCarton(ctx, w, h, spec);
  } else if (plat.includes('PLAYSTATION') || plat.includes('PSX')) {
    drawPlayStationCarton(ctx, w, h, spec);
  } else {
    drawGenericCarton(ctx, w, h, spec);
  }

  const dataUrl = canvas.toDataURL('image/png');
  artCache.set(key, dataUrl);
  return dataUrl;
}

function drawSnesCarton(ctx: CanvasRenderingContext2D, w: number, h: number, spec: GameCartonSpec) {
  // Deep space / dark magenta gradient background
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#101428');
  grad.addColorStop(0.5, '#1e1b4b');
  grad.addColorStop(1, '#090a14');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Subtle grid / scanlines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 1;
  for (let y = 0; y < h; y += 12) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Right-hand red Super Nintendo vertical stripe
  const stripeW = 90;
  const stripeX = w - stripeW;
  const redGrad = ctx.createLinearGradient(stripeX, 0, w, 0);
  redGrad.addColorStop(0, '#c01525');
  redGrad.addColorStop(1, '#8b0e1b');
  ctx.fillStyle = redGrad;
  ctx.fillRect(stripeX, 0, stripeW, h);

  // Red stripe divider highlight
  ctx.fillStyle = '#ff4d5a';
  ctx.fillRect(stripeX, 0, 3, h);

  // Vertical text in red band
  ctx.save();
  ctx.translate(stripeX + 50, h / 2);
  ctx.rotate(Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.font = `bold 16px sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.letterSpacing = '2px';
  ctx.fillText('SUPER NINTENDO', 0, -8);
  ctx.font = `10px sans-serif`;
  ctx.fillStyle = '#fca5a5';
  ctx.letterSpacing = '1px';
  ctx.fillText('ENTERTAINMENT SYSTEM', 0, 8);
  ctx.restore();

  // Oval 4-color logo dots at top of red stripe
  const dotX = stripeX + stripeW / 2;
  const dotY = 36;
  const colors = ['#facc15', '#3b82f6', '#ef4444', '#22c55e'];
  const offsets = [[-8, -8], [8, -8], [-8, 8], [8, 8]];
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(dotX + offsets[i][0], dotY + offsets[i][1], 5, 0, Math.PI * 2);
    ctx.fillStyle = colors[i];
    ctx.fill();
  }

  // Title in main art box
  drawCartonTitle(ctx, spec.title, (w - stripeW) / 2, h * 0.44, w - stripeW - 40);

  // Year & genre footer
  if (spec.year) {
    ctx.font = `bold 13px sans-serif`;
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText(`${spec.year} • 16-BIT CARTRIDGE`, (w - stripeW) / 2, h * 0.72);
  }

  // Official Nintendo Seal badge (bottom left)
  drawSealBadge(ctx, 48, h - 45, 'NINTENDO');
}

function drawN64Carton(ctx: CanvasRenderingContext2D, w: number, h: number, spec: GameCartonSpec) {
  // Rich midnight cosmic gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0b132b');
  grad.addColorStop(0.6, '#1c2541');
  grad.addColorStop(1, '#070b19');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Bottom red N64 banner
  const bannerH = 75;
  const bannerY = h - bannerH;
  const bannerGrad = ctx.createLinearGradient(0, bannerY, 0, h);
  bannerGrad.addColorStop(0, '#dc2626');
  bannerGrad.addColorStop(1, '#991b1b');
  ctx.fillStyle = bannerGrad;
  ctx.fillRect(0, bannerY, w, bannerH);
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(0, bannerY, w, 2);

  // N64 Logo text
  ctx.font = `bold 24px sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.letterSpacing = '2px';
  ctx.fillText('NINTENDO', 32, bannerY + 45);
  ctx.font = `900 32px sans-serif`;
  ctx.fillStyle = '#fbbf24';
  ctx.fillText('64', 165, bannerY + 46);

  // "ONLY FOR" top-right corner notch
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.moveTo(w - 110, 0);
  ctx.lineTo(w, 0);
  ctx.lineTo(w, 40);
  ctx.lineTo(w - 90, 40);
  ctx.closePath();
  ctx.fill();
  ctx.font = `bold 10px sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText('ONLY FOR N64', w - 50, 24);

  // Title in center
  drawCartonTitle(ctx, spec.title, w / 2, h * 0.38, w - 60);

  if (spec.year) {
    ctx.font = `bold 13px sans-serif`;
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText(`${spec.year} • 64-BIT 3D REALITY`, w / 2, h * 0.64);
  }

  // Seal on banner right
  drawSealBadge(ctx, w - 55, bannerY + bannerH / 2, 'NINTENDO');
}

function drawGenesisCarton(ctx: CanvasRenderingContext2D, w: number, h: number, spec: GameCartonSpec) {
  // Iconic Sega Genesis black & silver grid background
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, w, h);

  // White/silver gridlines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  const grid = 24;
  for (let x = 0; x < w; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Top header with red GENESIS bar
  const headerH = 75;
  ctx.fillStyle = '#b91c1c';
  ctx.fillRect(0, 0, w, headerH);
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(0, headerH - 3, w, 3);

  // SEGA badge
  ctx.font = `900 24px sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText('SEGA', 24, 46);

  // GENESIS text
  ctx.font = `900 30px sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.letterSpacing = '4px';
  ctx.fillText('GENESIS', w - 24, 48);

  // Main art panel
  const margin = 20;
  const panelY = headerH + 20;
  const panelH = h - panelY - 70;
  ctx.fillStyle = '#18181b';
  ctx.fillRect(margin, panelY, w - margin * 2, panelH);
  ctx.strokeStyle = '#3f3f46';
  ctx.lineWidth = 2;
  ctx.strokeRect(margin, panelY, w - margin * 2, panelH);

  // Title inside panel
  drawCartonTitle(ctx, spec.title, w / 2, panelY + panelH * 0.45, w - margin * 2 - 30);

  // 16-BIT banner bottom
  ctx.font = `bold 14px sans-serif`;
  ctx.fillStyle = '#fbbf24';
  ctx.textAlign = 'center';
  ctx.fillText('16-BIT CARTRIDGE', w / 2, h - 35);
  if (spec.year) {
    ctx.font = `11px sans-serif`;
    ctx.fillStyle = '#71717a';
    ctx.fillText(String(spec.year), w / 2, h - 18);
  }
}

function drawPlayStationCarton(ctx: CanvasRenderingContext2D, w: number, h: number, spec: GameCartonSpec) {
  // Dark charcoal jewel case card
  ctx.fillStyle = '#111215';
  ctx.fillRect(0, 0, w, h);

  // Left vertical PlayStation black banner
  const bannerW = 65;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, bannerW, h);
  ctx.fillStyle = '#374151';
  ctx.fillRect(bannerW, 0, 2, h);

  // PlayStation logo mark (PS)
  const psX = bannerW / 2;
  const psY = 40;
  ctx.font = `900 28px sans-serif`;
  ctx.fillStyle = '#ef4444';
  ctx.textAlign = 'center';
  ctx.fillText('P', psX - 4, psY);
  ctx.fillStyle = '#0ea5e9';
  ctx.fillText('S', psX + 6, psY + 4);

  // Vertical "PlayStation" text
  ctx.save();
  ctx.translate(psX + 4, h * 0.55);
  ctx.rotate(-Math.PI / 2);
  ctx.font = `bold 16px sans-serif`;
  ctx.fillStyle = '#f8fafc';
  ctx.letterSpacing = '3px';
  ctx.textAlign = 'center';
  ctx.fillText('PlayStation', 0, 0);
  ctx.restore();

  // Title in main jewel case window
  drawCartonTitle(ctx, spec.title, bannerW + (w - bannerW) / 2, h * 0.44, w - bannerW - 35);

  // Disc indicator & year
  ctx.font = `bold 12px sans-serif`;
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'center';
  ctx.fillText(spec.year ? `${spec.year} • COMPACT DISC` : 'COMPACT DISC', bannerW + (w - bannerW) / 2, h * 0.76);
}

function drawGenericCarton(ctx: CanvasRenderingContext2D, w: number, h: number, spec: GameCartonSpec) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#18181b');
  grad.addColorStop(1, '#09090b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Top platform strip
  ctx.fillStyle = '#27272a';
  ctx.fillRect(0, 0, w, 50);
  ctx.font = `bold 16px sans-serif`;
  ctx.fillStyle = '#f4f4f5';
  ctx.textAlign = 'center';
  ctx.fillText(spec.platform || 'VIDEO GAME', w / 2, 32);

  drawCartonTitle(ctx, spec.title, w / 2, h * 0.48, w - 40);

  if (spec.year) {
    ctx.font = `12px sans-serif`;
    ctx.fillStyle = '#71717a';
    ctx.textAlign = 'center';
    ctx.fillText(String(spec.year), w / 2, h * 0.78);
  }
}

function drawCartonTitle(ctx: CanvasRenderingContext2D, title: string, cx: number, cy: number, maxW: number) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Break title into lines if too long
  const words = title.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word;
    if (test.length > 18 && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);

  const fontSize = lines.length > 2 ? 24 : lines.length > 1 ? 30 : 36;
  ctx.font = `900 ${fontSize}px ${BB_ARCHIVO_BLACK}, sans-serif`;
  const lineH = fontSize * 1.15;
  const startY = cy - ((lines.length - 1) * lineH) / 2;

  lines.forEach((line, i) => {
    const y = startY + i * lineH;
    // Dark drop shadow
    ctx.fillStyle = '#000000';
    ctx.fillText(line, cx + 2, y + 2, maxW);
    // Main text
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(line, cx, y, maxW);
  });
  ctx.restore();
}

function drawSealBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, text: string) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, 28, 18, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#d97706';
  ctx.fill();
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = `bold 6px sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Official', cx, cy - 6);
  ctx.fillText(text, cx, cy);
  ctx.fillText('Seal', cx, cy + 6);
  ctx.restore();
}
