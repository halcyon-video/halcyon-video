// Back-cover technical-specifications table — the long rectangular "spec box"
// every retail DVD grew near the bottom of its back panel: a bordered light
// panel with a dark header strip (format logos), a label/value grid (running
// time, rating, aspect ratio, resolution, audio, subtitles) and a footer legal
// line (region / NTSC / color / languages). Everything is filled DYNAMICALLY
// from the movie's real Jellyfin metadata — audio + subtitle streams, video
// frame geometry, container/codec — with period-authentic defaults only when a
// field is genuinely unknown (see buildTechSpecs).
//
// Pure 2D-canvas + data; no three.js. drawn by drawJellyfinBack (video-case.ts)
// onto the 640x960 retail-back canvas. Kept out of video-case.ts so that file
// stays under its line budget and the derivation stays unit-testable.
import type { Movie, MediaStreamInfo, MediaPlaybackInfo } from './jellyfin';
import { BB_OUTFIT, BB_ORBITRON } from './bundled-fonts';

// ----------------------------------------------------------------------------
// Data derivation
// ----------------------------------------------------------------------------

export interface TechSpecs {
  runningTime: string;    // "105 min."
  rating: string;         // "PG-13"
  aspectRatio: string;    // "1.85:1"
  aspectNote: string;     // "Widescreen" | "Full Screen"
  enhanced16x9: boolean;  // anamorphic / 16:9-enhanced
  resolution: string;     // "1080p" | "2160p" | "480p"
  hdr: string;            // "" | "HDR10" | "Dolby Vision"
  is4k: boolean;
  audioPrimary: string;   // "English Dolby Digital 5.1"
  audioExtraCount: number;// additional audio tracks beyond the primary
  audioLangs: string;     // "English, Français"
  subtitles: string;      // "English, Español" | "None"
  closedCaptioned: boolean;
  surround: 'dolby' | 'dts' | 'stereo';
  region: string;         // "1"
  year: number;
}

// Latin-script language names only — Orbitron/Outfit have no CJK/Arabic glyphs,
// so mapping to native scripts would render as tofu on the canvas.
const LANG_NAMES: Record<string, string> = {
  eng: 'English', en: 'English',
  spa: 'Español', es: 'Español',
  fra: 'Français', fre: 'Français', fr: 'Français',
  deu: 'Deutsch', ger: 'Deutsch', de: 'Deutsch',
  ita: 'Italiano', it: 'Italiano',
  por: 'Português', pt: 'Português',
  nld: 'Nederlands', dut: 'Nederlands', nl: 'Nederlands',
  jpn: 'Japanese', ja: 'Japanese',
  kor: 'Korean', ko: 'Korean',
  zho: 'Chinese', chi: 'Chinese', zh: 'Chinese', cmn: 'Chinese',
  rus: 'Russian', ru: 'Russian',
  ara: 'Arabic', ar: 'Arabic',
  hin: 'Hindi', tha: 'Thai', tur: 'Türkçe', tr: 'Türkçe',
  swe: 'Svenska', pol: 'Polski', dan: 'Dansk', nor: 'Norsk',
  fin: 'Suomi', ces: 'Čeština', cze: 'Čeština',
  ell: 'Greek', gre: 'Greek', heb: 'Hebrew', hun: 'Magyar',
  ron: 'Română', ro: 'Română', ukr: 'Ukrainian', vie: 'Vietnamese',
  ind: 'Indonesia', id: 'Indonesia',
};

function langName(code?: string): string {
  if (!code) return '';
  const c = code.toLowerCase();
  if (LANG_NAMES[c]) return LANG_NAMES[c];
  // Some servers report the 2/3-letter code we don't know — title-case it.
  return c.length <= 3 ? c.toUpperCase() : c.charAt(0).toUpperCase() + c.slice(1);
}

function codecName(codec?: string): string {
  if (!codec) return '';
  const c = codec.toLowerCase();
  if (c === 'ac3') return 'Dolby Digital';
  if (c === 'eac3') return 'Dolby Digital+';
  if (c === 'truehd') return 'Dolby TrueHD';
  if (c === 'mlp') return 'Dolby TrueHD';
  if (c.startsWith('dts') || c === 'dca') return 'DTS';
  if (c === 'aac') return 'AAC';
  if (c === 'mp3' || c === 'mp2') return 'MP3';
  if (c === 'flac') return 'FLAC';
  if (c === 'opus') return 'Opus';
  if (c === 'vorbis') return 'Vorbis';
  if (c.includes('pcm')) return 'PCM';
  return codec.toUpperCase();
}

function channelLayout(ch?: number): string {
  switch (ch) {
    case 1: return 'Mono';
    case 2: return '2.0';
    case 3: return '2.1';
    case 4: return '4.0';
    case 5: return '5.0';
    case 6: return '5.1';
    case 7: return '6.1';
    case 8: return '7.1';
    default: return ch && ch > 0 ? `${ch}.0` : '';
  }
}

function surroundFamily(codec?: string): 'dolby' | 'dts' | 'stereo' {
  const c = (codec || '').toLowerCase();
  if (c.startsWith('dts') || c === 'dca') return 'dts';
  if (c === 'ac3' || c === 'eac3' || c === 'truehd' || c === 'mlp') return 'dolby';
  return 'stereo';
}

function audioDescriptor(s: MediaStreamInfo): string {
  const parts = [langName(s.language), codecName(s.codec), channelLayout(s.channels)].filter(Boolean);
  return parts.join(' ').trim();
}

function fallbackAudio(info?: MediaPlaybackInfo): string {
  const codec = info?.audioCodecs?.[0];
  return `English ${codec ? codecName(codec) : 'Dolby Digital'} 5.1`;
}

function parseMinutes(dur?: string): number {
  if (!dur) return 0;
  let total = 0;
  const h = dur.match(/(\d+)\s*h/i);
  const m = dur.match(/(\d+)\s*m/i);
  if (h) total += parseInt(h[1], 10) * 60;
  if (m) total += parseInt(m[1], 10);
  if (!h && !m) {
    const n = dur.match(/(\d+)/);
    if (n) total = parseInt(n[1], 10);
  }
  return total;
}

// Nearest standard theatrical ratio, so real frame geometry reads as a
// recognizable "1.85:1" rather than "1.847:1".
const STD_ASPECTS: [number, string][] = [
  [1.33, '1.33:1'], [1.37, '1.37:1'], [1.66, '1.66:1'], [1.78, '1.78:1'],
  [1.85, '1.85:1'], [2.0, '2.00:1'], [2.20, '2.20:1'], [2.35, '2.35:1'],
  [2.39, '2.39:1'], [2.40, '2.40:1'],
];

function describeAspect(arStr?: string, w?: number, h?: number): { ratio: string; note: string; enhanced: boolean } {
  let num: number | undefined;
  if (arStr) {
    const m = arStr.match(/^\s*(\d+(?:\.\d+)?)\s*[:xX/]\s*(\d+(?:\.\d+)?)\s*$/);
    if (m && +m[2] > 0) num = +m[1] / +m[2];
    else {
      const n = parseFloat(arStr);
      if (!isNaN(n) && n > 0.5 && n < 5) num = n;
    }
  }
  if (num === undefined && w && h && h > 0) num = w / h;
  if (num === undefined) num = 1.85;
  let best = STD_ASPECTS[0];
  for (const s of STD_ASPECTS) if (Math.abs(s[0] - num) < Math.abs(best[0] - num)) best = s;
  return {
    ratio: best[1],
    note: num < 1.45 ? 'Full Screen' : 'Widescreen',
    enhanced: num >= 1.7,
  };
}

function describeResolution(h?: number, is4k?: boolean): string {
  if (typeof h === 'number' && h > 0) {
    if (h >= 2000) return '2160p';
    if (h >= 1400) return '1440p';
    if (h >= 1000) return '1080p';
    if (h >= 700) return '720p';
    return '480p';
  }
  return is4k ? '2160p' : '1080p';
}

function describeHdr(range?: string): string {
  const r = (range || '').toLowerCase();
  if (r.includes('dovi') || r.includes('dolby')) return 'Dolby Vision';
  if (r.includes('hdr10+') || r.includes('plus')) return 'HDR10+';
  if (r.includes('hdr')) return 'HDR10';
  if (r.includes('hlg')) return 'HLG';
  return '';
}

function uniq(xs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) if (x && !seen.has(x)) { seen.add(x); out.push(x); }
  return out;
}

export function buildTechSpecs(movie: Movie): TechSpecs {
  const info = movie.mediaPlaybackInfo;
  const hasStreamData = Array.isArray(movie.mediaStreams);
  const streams = movie.mediaStreams || [];
  const audio = streams.filter((s) => s.type === 'Audio');
  const subs = streams.filter((s) => s.type === 'Subtitle');

  const mins = parseMinutes(movie.duration);
  const runningTime = mins > 0
    ? `${mins} min.`
    : (movie.duration && movie.duration !== 'N/A' ? movie.duration : '—');

  // Frame geometry: default source, else the best-quality version, else is4k.
  let w = info?.width;
  let h = info?.height;
  const arStr = info?.aspectRatio;
  if ((!w || !h) && movie.versions && movie.versions.length) {
    w = w || movie.versions[0].width;
    h = h || movie.versions[0].height;
  }
  const aspect = describeAspect(arStr, w, h);
  const resolution = describeResolution(h, movie.is4k);
  const hdr = describeHdr(info?.videoRange);

  const primaryStream = audio.find((a) => a.isDefault) || audio[0];
  const audioPrimary = primaryStream ? audioDescriptor(primaryStream) : fallbackAudio(info);
  const audioLangs = audio.length
    ? uniq(audio.map((a) => langName(a.language)).filter(Boolean)).join(', ') || 'English'
    : 'English';
  const surround = surroundFamily(primaryStream?.codec || info?.audioCodecs?.[0]);

  const subLangs = uniq(subs.map((s) => langName(s.language)).filter(Boolean));
  let subtitles: string;
  let closedCaptioned: boolean;
  if (hasStreamData) {
    subtitles = subLangs.length ? subLangs.join(', ') : (subs.length ? 'Available' : 'None');
    closedCaptioned = subs.some((s) => (s.language || '').toLowerCase().startsWith('en'));
  } else {
    // No stream metadata at all (games, older syncs) — period-standard default.
    subtitles = 'English SDH';
    closedCaptioned = true;
  }

  return {
    runningTime,
    rating: movie.rating || 'NR',
    aspectRatio: aspect.ratio,
    aspectNote: aspect.note,
    enhanced16x9: aspect.enhanced,
    resolution,
    hdr,
    is4k: !!movie.is4k,
    audioPrimary,
    audioExtraCount: Math.max(0, audio.length - 1),
    audioLangs,
    subtitles,
    closedCaptioned,
    surround,
    region: '1',
    year: movie.year,
  };
}

// ----------------------------------------------------------------------------
// Drawing
// ----------------------------------------------------------------------------

export interface TechSpecTableOptions {
  /** Dark theme accent (genre) — tints the header strip. */
  accent: string;
}

// Fixed vertical metrics (tuned for the 640x960 retail-back canvas). Exported
// as a total so drawJellyfinBack can bottom-anchor the panel — the height has
// to be known BEFORE drawing to place the table's top edge.
const HEAD_H = 30;
const ROW_H = 30;
const AUDIO_H = 28;
const SUB_H = 26;
const FOOT_H = 22;
/** Total height drawTechSpecsTable consumes. */
export const TECH_SPECS_TABLE_H = HEAD_H + ROW_H * 2 + AUDIO_H + SUB_H + FOOT_H;

// Palette: a light "spec sticker" panel with slate ink, sitting over the case's
// darker bottom half — the way the real box's spec strip is a lighter block.
const PANEL_BG = 'rgba(236, 239, 244, 0.97)';
const PANEL_BORDER = 'rgba(15, 20, 30, 0.55)';
const INK = '#182029';
const LABEL_INK = '#5b6472';
const DIVIDER = 'rgba(15, 20, 30, 0.16)';
const FOOTER_BG = 'rgba(15, 20, 30, 0.06)';
const FOOTER_INK = '#3c4450';
const HEADER_INK = '#f0f3f8';        // light marks on the dark header strip
const SILVER = '#dbe0e8';            // format-logo pill fill

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Truncate to fit maxW, appending an ellipsis. ctx.font must already be set.
function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

// The iconic silver DVD-Video / 4K-UltraHD pill in the header's top-left.
function drawFormatPill(ctx: CanvasRenderingContext2D, x: number, cy: number, is4k: boolean): number {
  const big = is4k ? '4K' : 'DVD';
  const small = is4k ? 'ULTRA HD' : 'VIDEO';
  ctx.font = `900 13px ${BB_OUTFIT}, sans-serif`;
  const bigW = ctx.measureText(big).width;
  ctx.font = `700 6px ${BB_ORBITRON}, sans-serif`;
  const smallW = ctx.measureText(small).width + 4;
  const pillW = Math.max(bigW, smallW) + 14;
  const pillH = 23;
  roundRectPath(ctx, x, cy - pillH / 2, pillW, pillH, 4);
  ctx.fillStyle = SILVER;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.75;
  ctx.stroke();
  const midX = x + pillW / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#1a222e';
  ctx.font = `900 13px ${BB_OUTFIT}, sans-serif`;
  ctx.fillText(big, midX, cy - 2);
  ctx.font = `700 6px ${BB_ORBITRON}, sans-serif`;
  ctx.fillText(small, midX, cy + 8);
  ctx.textAlign = 'left';
  return pillW;
}

// A little rounded chip (outline) with a caption — [CC], 16:9, etc.
function drawChip(ctx: CanvasRenderingContext2D, right: number, cy: number, label: string, glyph?: (gx: number, gy: number) => number): number {
  ctx.font = `800 10px ${BB_ORBITRON}, sans-serif`;
  const textW = ctx.measureText(label).width;
  const padX = 6;
  const glyphW = glyph ? 15 : 0;
  const chipW = textW + glyphW + padX * 2;
  const chipH = 17;
  const x = right - chipW;
  roundRectPath(ctx, x, cy - chipH / 2, chipW, chipH, 3.5);
  ctx.strokeStyle = 'rgba(240,243,248,0.85)';
  ctx.lineWidth = 1;
  ctx.stroke();
  let tx = x + padX;
  if (glyph) tx += glyph(x + padX, cy) + 3;
  ctx.fillStyle = HEADER_INK;
  ctx.textAlign = 'left';
  ctx.fillText(label, tx, cy + 3.5);
  return chipW;
}

// Dolby "double-D" mark: two back-to-back rounded blocks.
function drawDolbyMark(ctx: CanvasRenderingContext2D, x: number, cy: number): number {
  const w = 13, h = 12;
  ctx.fillStyle = HEADER_INK;
  ctx.beginPath();
  // left half-D
  ctx.moveTo(x + w / 2 - 1, cy - h / 2);
  ctx.lineTo(x, cy - h / 2);
  ctx.quadraticCurveTo(x - 3, cy, x, cy + h / 2);
  ctx.lineTo(x + w / 2 - 1, cy + h / 2);
  ctx.closePath();
  ctx.fill();
  // right half-D (mirror)
  ctx.beginPath();
  ctx.moveTo(x + w / 2 + 1, cy - h / 2);
  ctx.lineTo(x + w, cy - h / 2);
  ctx.quadraticCurveTo(x + w + 3, cy, x + w, cy + h / 2);
  ctx.lineTo(x + w / 2 + 1, cy + h / 2);
  ctx.closePath();
  ctx.fill();
  return w;
}

// A small monitor glyph for the aspect chip.
function drawMonitorGlyph(ctx: CanvasRenderingContext2D, x: number, cy: number): number {
  const w = 14, h = 10;
  roundRectPath(ctx, x, cy - h / 2, w, h, 1.5);
  ctx.strokeStyle = 'rgba(240,243,248,0.9)';
  ctx.lineWidth = 1;
  ctx.stroke();
  return w;
}

function drawCell(ctx: CanvasRenderingContext2D, x: number, top: number, cellW: number, label: string, value: string) {
  ctx.textAlign = 'left';
  ctx.fillStyle = LABEL_INK;
  ctx.font = `700 9.5px ${BB_ORBITRON}, sans-serif`;
  ctx.fillText(label, x, top + 12);
  ctx.fillStyle = INK;
  ctx.font = `600 15px ${BB_OUTFIT}, sans-serif`;
  ctx.fillText(fitText(ctx, value, cellW), x, top + 27);
}

/**
 * Draw the spec table at (x, y), width w. Returns the height consumed so the
 * caller can lay content above it. Absolute pixel sizing tuned for the
 * 640x960 retail-back canvas.
 */
export function drawTechSpecsTable(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  movie: Movie,
  opts: TechSpecTableOptions,
): number {
  const spec = buildTechSpecs(movie);
  const P = 14;
  const headH = HEAD_H;
  const rowH = ROW_H;
  const audioH = AUDIO_H;
  const footH = FOOT_H;
  const H = TECH_SPECS_TABLE_H;
  const r = 9;

  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // Panel + clipped header/footer fills.
  roundRectPath(ctx, x, y, w, H, r);
  ctx.fillStyle = PANEL_BG;
  ctx.fill();
  ctx.save();
  roundRectPath(ctx, x, y, w, H, r);
  ctx.clip();
  ctx.fillStyle = opts.accent;
  ctx.fillRect(x, y, w, headH);
  ctx.fillStyle = FOOTER_BG;
  ctx.fillRect(x, y + H - footH, w, footH);
  ctx.restore();

  // ---- Header strip: format pill (left) + logo chips (right) ----
  const headCy = y + headH / 2;
  drawFormatPill(ctx, x + P, headCy, spec.is4k);

  let chipRight = x + w - P;
  chipRight -= drawChip(ctx, chipRight, headCy, 'DOLBY DIGITAL',
    (gx, gy) => drawDolbyMark(ctx, gx, gy)) + 8;
  if (spec.surround === 'dts') {
    // Relabel the just-drawn chip region is awkward; instead prepend a DTS chip.
    chipRight -= drawChip(ctx, chipRight, headCy, 'DTS') + 8;
  }
  const arChipLabel = spec.aspectNote === 'Full Screen' ? '4:3' : '16:9';
  chipRight -= drawChip(ctx, chipRight, headCy, arChipLabel,
    (gx, gy) => drawMonitorGlyph(ctx, gx, gy)) + 8;
  if (spec.closedCaptioned) {
    chipRight -= drawChip(ctx, chipRight, headCy, 'CC') + 8;
  }

  // ---- Grid: two 30px rows split into L/R cells ----
  const gridTop = y + headH;
  const innerX = x + P;
  const midX = x + w / 2;
  const leftW = midX - innerX - 8;
  const rightX = midX + 10;
  const rightW = x + w - P - rightX;

  const videoVal = spec.hdr ? `${spec.resolution} · ${spec.hdr}` : spec.resolution;
  const aspectVal = `${spec.aspectRatio}  ${spec.aspectNote}`;

  drawCell(ctx, innerX, gridTop, leftW, 'FEATURE RUNNING TIME', spec.runningTime);
  drawCell(ctx, rightX, gridTop, rightW, 'RATED', spec.rating);
  drawCell(ctx, innerX, gridTop + rowH, leftW, 'ASPECT RATIO', aspectVal);
  drawCell(ctx, rightX, gridTop + rowH, rightW, 'VIDEO', videoVal);

  // ---- Full-width audio + subtitle rows ----
  const audioTop = gridTop + rowH * 2;
  const subTop = audioTop + audioH;
  const labelColW = 96;
  const valX = innerX + labelColW;
  const valW = x + w - P - valX;

  ctx.textAlign = 'left';
  ctx.fillStyle = LABEL_INK;
  ctx.font = `700 9.5px ${BB_ORBITRON}, sans-serif`;
  ctx.fillText('AUDIO', innerX, audioTop + 18);
  ctx.fillText('SUBTITLES', innerX, subTop + 17);

  ctx.fillStyle = INK;
  ctx.font = `600 14px ${BB_OUTFIT}, sans-serif`;
  const audioVal = spec.audioExtraCount > 0
    ? `${spec.audioPrimary}  (+${spec.audioExtraCount} more)`
    : spec.audioPrimary;
  ctx.fillText(fitText(ctx, audioVal, valW), valX, audioTop + 18);
  ctx.fillText(fitText(ctx, spec.subtitles, valW), valX, subTop + 17);

  // ---- Dividers ----
  ctx.strokeStyle = DIVIDER;
  ctx.lineWidth = 1;
  const hlines = [gridTop + rowH, gridTop + rowH * 2, audioTop + audioH];
  for (const ly of hlines) {
    ctx.beginPath();
    ctx.moveTo(x + 8, ly + 0.5);
    ctx.lineTo(x + w - 8, ly + 0.5);
    ctx.stroke();
  }
  // vertical divider between the two grid rows only
  ctx.beginPath();
  ctx.moveTo(midX + 0.5, gridTop + 5);
  ctx.lineTo(midX + 0.5, gridTop + rowH * 2 - 5);
  ctx.stroke();

  // ---- Footer legal / format line ----
  const footTop = y + H - footH;
  const footCy = footTop + footH / 2 + 3.5;
  ctx.fillStyle = FOOTER_INK;
  ctx.font = `600 10px ${BB_OUTFIT}, sans-serif`;
  ctx.textAlign = 'left';
  const footLeft = `REGION ${spec.region}  ·  NTSC  ·  COLOR  ·  ${spec.audioLangs}`;
  ctx.fillText(fitText(ctx, footLeft, w - 2 * P - 60), innerX, footCy);
  ctx.textAlign = 'right';
  ctx.font = `600 9px ${BB_ORBITRON}, sans-serif`;
  ctx.fillText(`© ${spec.year}`, x + w - P, footCy);

  // ---- Panel border on top ----
  roundRectPath(ctx, x, y, w, H, r);
  ctx.strokeStyle = PANEL_BORDER;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
  return H;
}
