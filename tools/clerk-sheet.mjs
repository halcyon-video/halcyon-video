#!/usr/bin/env node
// clerk-sheet — split, restitch and check a clerk sprite sheet.
//
// The clerk's art is one 16x5 atlas of 2:3 cells (public/user-assets/README.md
// "clerk/"). Editing that as a single 4096x1920 image is miserable, and it is
// hopeless as the target of an image generator, which wants one picture at a
// time. So:
//
//   split   sheet.png cells/          one PNG per cell, named by grid position
//   stitch  cells/    sheet.png       the folder back into a drop-in sheet
//   check   sheet.png                 does this sheet honour the contract?
//
// The round trip is the point: export the procedural sheet with
// ?clerk_template=1, split it, replace cells however you like (by hand, or by
// generating against each cell as a pose reference), stitch, and drop the
// result at public/user-assets/clerk/default.png.
//
// No new dependencies: the canvas work runs in the puppeteer Chromium that is
// already a devDependency of this repo.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import puppeteer from 'puppeteer';

// The grid contract. Mirrors src/clerk-art.ts (DIRS, ANIM_ORDER, ANIM_DEF,
// CELL_W, CELL_H) — that module is the source of truth; this is the copy a
// plain .mjs can read without a TypeScript loader. `check` fails loudly if a
// sheet disagrees, which is what catches drift.
const CELL_W = 256;
const CELL_H = 384;
const DIRS = ['front', 'frontSide', 'side', 'backSide', 'back'];
const ANIMS = [
  ['idle', 2], ['walk', 4], ['stockHigh', 2], ['stockMid', 2],
  ['stockLow', 2], ['talk', 2], ['type', 2],
];
const COLS = ANIMS.reduce((s, [, n]) => s + n, 0); // 16
const ROWS = DIRS.length;                          // 5

/** Column index -> { anim, frame }, so a filename can say what it depicts. */
const COL_LABEL = (() => {
  const out = [];
  for (const [anim, n] of ANIMS) for (let f = 0; f < n; f++) out.push({ anim, frame: f });
  return out;
})();

const cellName = (row, col) =>
  `${String(row).padStart(2, '0')}-${String(col).padStart(2, '0')}` +
  `_${DIRS[row]}_${COL_LABEL[col].anim}${COL_LABEL[col].frame}.png`;

// ── browser plumbing ────────────────────────────────────────────────────────

async function withPage(fn) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
    await page.setContent('<!doctype html><meta charset="utf-8"><title>clerk-sheet</title>');
    return await fn(page);
  } finally {
    await browser.close();
  }
}

const dataUrl = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;

/**
 * Decode a PNG in the page, park it on `self.__img` for the draw calls that
 * follow, and hand back its natural size. A real function, not a source
 * string: puppeteer evaluates a string as a bare expression and drops the
 * arguments on the floor, which fails as a silent undefined rather than a
 * throw.
 */
async function loadImage(url) {
  const img = new Image();
  await new Promise((ok, no) => {
    img.onload = ok;
    img.onerror = () => no(new Error('decode failed'));
    img.src = url;
  });
  self.__img = img;
  return { w: img.naturalWidth, h: img.naturalHeight };
}

function writePng(file, dataUri) {
  writeFileSync(file, Buffer.from(dataUri.split(',')[1], 'base64'));
}

// ── split ───────────────────────────────────────────────────────────────────

async function split(sheetFile, outDir, opts) {
  if (!existsSync(sheetFile)) die(`no such sheet: ${sheetFile}`);
  mkdirSync(outDir, { recursive: true });

  await withPage(async (page) => {
    const { w, h } = await page.evaluate(loadImage, dataUrl(sheetFile));
    assertGrid(w, h, sheetFile);

    const srcW = w / COLS, srcH = h / ROWS;
    const outW = CELL_W * opts.scale, outH = CELL_H * opts.scale;
    console.log(`sheet ${w}x${h} -> ${ROWS * COLS} cells at ${outW}x${outH}` +
      (opts.scale !== 1 ? ` (${opts.scale}x the ${CELL_W}x${CELL_H} atlas cell)` : ''));

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const uri = await page.evaluate((sx, sy, sw, sh, dw, dh) => {
          const c = document.createElement('canvas');
          c.width = dw; c.height = dh;
          const ctx = c.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(self.__img, sx, sy, sw, sh, 0, 0, dw, dh);
          return c.toDataURL('image/png');
        }, col * srcW, row * srcH, srcW, srcH, outW, outH);
        writePng(join(outDir, cellName(row, col)), uri);
      }
    }
  });

  // A manifest, so a batch script (ComfyUI included) can walk the grid without
  // re-deriving it from filenames.
  writeFileSync(join(outDir, 'grid.json'), JSON.stringify({
    cols: COLS, rows: ROWS, cellW: CELL_W, cellH: CELL_H, scale: opts.scale,
    dirs: DIRS,
    note: 'Rows are facings, all drawn heading screen-RIGHT; the runtime mirrors them for the other octants. Columns are animation frames.',
    cells: Array.from({ length: ROWS }, (_, row) => Array.from({ length: COLS }, (_, col) => ({
      row, col, dir: DIRS[row], ...COL_LABEL[col], file: cellName(row, col),
    }))).flat(),
  }, null, 2) + '\n');

  console.log(`wrote ${ROWS * COLS} cells + grid.json to ${outDir}`);
  console.log('edit or regenerate the cells, keep the filenames, then: stitch');
}

// ── stitch ──────────────────────────────────────────────────────────────────

async function stitch(inDir, outFile, opts) {
  if (!existsSync(inDir)) die(`no such folder: ${inDir}`);

  // Grid position comes from the "RR-CC" prefix, so the rest of the name is
  // yours to rename however a generator likes to number its output.
  const found = new Map();
  for (const f of readdirSync(inDir)) {
    const m = /^(\d{2})-(\d{2})[_.-]/.exec(f);
    if (!m || !/\.png$/i.test(f)) continue;
    const row = +m[1], col = +m[2];
    if (row >= ROWS || col >= COLS) die(`${f}: cell ${row}-${col} is outside the ${ROWS}x${COLS} grid`);
    const key = `${row}-${col}`;
    if (found.has(key)) die(`two files claim cell ${key}: ${basename(found.get(key))} and ${f}`);
    found.set(key, join(inDir, f));
  }

  const missing = [];
  for (let row = 0; row < ROWS; row++)
    for (let col = 0; col < COLS; col++)
      if (!found.has(`${row}-${col}`)) missing.push(cellName(row, col));

  if (missing.length && !opts.allowMissing) {
    console.error(`missing ${missing.length} of ${ROWS * COLS} cells:`);
    for (const m of missing.slice(0, 12)) console.error(`  ${m}`);
    if (missing.length > 12) console.error(`  ...and ${missing.length - 12} more`);
    die('every cell must be present, or pass --allow-missing to leave holes transparent');
  }
  if (missing.length) console.warn(`WARNING: leaving ${missing.length} cells transparent`);

  const soft = [];
  await withPage(async (page) => {
    await page.evaluate((w, h) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      self.__sheet = c;
      self.__ctx = c.getContext('2d');
      self.__ctx.imageSmoothingQuality = 'high';
    }, CELL_W * COLS, CELL_H * ROWS);

    for (const [key, file] of found) {
      const [row, col] = key.split('-').map(Number);
      const { w, h } = await page.evaluate(loadImage, dataUrl(file));
      const aspect = w / h;
      if (Math.abs(aspect - CELL_W / CELL_H) > 0.01) {
        die(`${basename(file)} is ${w}x${h} (${aspect.toFixed(3)}:1) — every cell must be 2:3 ` +
          `(${(CELL_W / CELL_H).toFixed(3)}:1), or the clerk stretches`);
      }
      const softPct = await page.evaluate((dx, dy, dw, dh) => {
        self.__ctx.drawImage(self.__img, dx, dy, dw, dh);
        // The sprite renders with alphaTest 0.5: pixels below half alpha are
        // cut outright. A cell carrying a lot of partial alpha (a soft glow, a
        // feathered matte) will lose it as a ragged edge, so measure it.
        const probe = document.createElement('canvas');
        probe.width = 128; probe.height = 192;
        const pc = probe.getContext('2d');
        pc.drawImage(self.__img, 0, 0, probe.width, probe.height);
        const d = pc.getImageData(0, 0, probe.width, probe.height).data;
        let partial = 0, opaque = 0;
        for (let i = 3; i < d.length; i += 4) {
          if (d[i] > 250) opaque++;
          else if (d[i] > 12) partial++;
        }
        return opaque === 0 ? -1 : (100 * partial) / (partial + opaque);
      }, col * CELL_W, row * CELL_H, CELL_W, CELL_H);

      if (softPct < 0) soft.push(`${basename(file)}: cell is empty (nothing opaque in it)`);
      else if (softPct > 25) soft.push(`${basename(file)}: ${softPct.toFixed(0)}% of the figure is partial alpha — alphaTest 0.5 will chew that edge`);
    }

    writePng(outFile, await page.evaluate(() => self.__sheet.toDataURL('image/png')));
  });

  for (const s of soft) console.warn(`WARNING: ${s}`);
  console.log(`wrote ${outFile} — ${CELL_W * COLS}x${CELL_H * ROWS}, ${found.size} cells`);
  console.log('drop it at public/user-assets/clerk/default.png and reload the store');
}

// ── check ───────────────────────────────────────────────────────────────────

async function check(sheetFile) {
  if (!existsSync(sheetFile)) die(`no such sheet: ${sheetFile}`);
  const report = await withPage(async (page) => {
    const { w, h } = await page.evaluate(loadImage, dataUrl(sheetFile));
    assertGrid(w, h, sheetFile);
    console.log(`${basename(sheetFile)}: ${w}x${h}, ${COLS}x${ROWS} grid, cells ${w / COLS}x${h / ROWS}`);
    return page.evaluate((cols, rows, dirs, labels) => {
      const c = document.createElement('canvas');
      const cw = Math.round(self.__img.naturalWidth / cols);
      const ch = Math.round(self.__img.naturalHeight / rows);
      c.width = cw; c.height = ch;
      const ctx = c.getContext('2d');
      const out = [], notes = [];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          ctx.clearRect(0, 0, cw, ch);
          ctx.drawImage(self.__img, col * cw, row * ch, cw, ch, 0, 0, cw, ch);
          const d = ctx.getImageData(0, 0, cw, ch).data;
          let opaque = 0, partial = 0, minX = cw, maxX = -1, minY = ch, maxY = -1;
          for (let i = 0, p = 0; i < d.length; i += 4, p++) {
            const a = d[i + 3];
            if (a > 250) opaque++; else if (a > 12) { partial++; continue; } else continue;
            const x = p % cw, y = (p / cw) | 0;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
          const where = `${dirs[row]} ${labels[col]}`;
          if (opaque === 0) { out.push(`${where}: empty cell`); continue; }
          const cover = (100 * opaque) / (cw * ch);
          if (cover < 3) out.push(`${where}: only ${cover.toFixed(1)}% opaque — is the figure there?`);
          if (partial / (partial + opaque) > 0.25) out.push(`${where}: mostly partial alpha; alphaTest 0.5 will cut it ragged`);
          // The billboard is anchored at the cell's foot: a figure floating
          // clear of the bottom edge reads as hovering over the carpet.
          if (maxY < ch * 0.9) out.push(`${where}: figure stops ${(100 * (1 - maxY / ch)).toFixed(0)}% above the cell foot — she will float`);
          // Touching a side edge is only a fault if content is being cut off
          // there. The shipped procedural sheet legitimately runs the carried
          // restock case right out to the edge on the stocking poses, so a bare
          // touch is a note, not a failure.
          if (minX < 1 || maxX > cw - 2) notes.push(`${where}: figure reaches the cell's side edge — fine unless it is cut off there`);
        }
      }
      return { problems: out, notes };
    }, COLS, ROWS, DIRS, COL_LABEL.map((l) => `${l.anim}${l.frame}`));
  });

  for (const n of report.notes) console.log(`note: ${n}`);
  if (!report.problems.length) { console.log('OK — every cell honours the contract'); return; }
  console.error(`${report.problems.length} problem(s):`);
  for (const p of report.problems) console.error(`  ${p}`);
  process.exitCode = 1;
}

function assertGrid(w, h, file) {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
    die(`${basename(file)}: could not read the image size (${w}x${h})`);
  }
  if (w % COLS || h % ROWS) {
    die(`${basename(file)} is ${w}x${h}, which does not divide into a ${COLS}x${ROWS} grid ` +
      `(want a multiple of ${COLS}x${ROWS}, e.g. ${CELL_W * COLS}x${CELL_H * ROWS})`);
  }
  const aspect = (w / COLS) / (h / ROWS);
  if (Math.abs(aspect - CELL_W / CELL_H) > 0.01) {
    die(`${basename(file)}: cells are ${w / COLS}x${h / ROWS} (${aspect.toFixed(3)}:1), but must be 2:3`);
  }
}

function die(msg) { console.error(`clerk-sheet: ${msg}`); process.exit(1); }

// ── cli ─────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const cmd = argv[0];
const VALUE_FLAGS = new Set(['scale']);   // everything else is a bare switch
const flags = new Map();
const positional = [];
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) { positional.push(a); continue; }
  const name = a.slice(2);
  if (VALUE_FLAGS.has(name)) flags.set(name, argv[++i]);
  else flags.set(name, true);
}
const flag = (name, fallback) => (flags.has(name) ? flags.get(name) : fallback);
const has = (name) => flags.get(name) === true;

const USAGE = `clerk-sheet — split / restitch / check a clerk sprite sheet

  node tools/clerk-sheet.mjs split  <sheet.png> <outdir> [--scale 3]
  node tools/clerk-sheet.mjs stitch <dir> <sheet.png> [--allow-missing]
  node tools/clerk-sheet.mjs check  <sheet.png>

Get a sheet to start from by opening the store with ?clerk_template=1.
The grid is ${COLS} columns (animation frames) x ${ROWS} rows (facings), cells 2:3.
--scale writes cells larger than the ${CELL_W}x${CELL_H} atlas cell, which is what
you want when the cells are going through an image generator; stitch scales
whatever it is handed back down to the atlas cell.`;

if (cmd === 'split') {
  const [sheet, out] = positional;
  if (!sheet || !out) die(`split needs a sheet and an output folder\n\n${USAGE}`);
  const scale = Number(flag('scale', 3));
  if (!Number.isFinite(scale) || scale <= 0) die('--scale must be a positive number');
  await split(resolve(sheet), resolve(out), { scale });
} else if (cmd === 'stitch') {
  const [dir, out] = positional;
  if (!dir || !out) die(`stitch needs a folder and an output file\n\n${USAGE}`);
  await stitch(resolve(dir), resolve(out), { allowMissing: has('allow-missing') });
} else if (cmd === 'check') {
  const [sheet] = positional;
  if (!sheet) die(`check needs a sheet\n\n${USAGE}`);
  await check(resolve(sheet));
} else {
  console.log(USAGE);
  process.exit(cmd ? 1 : 0);
}
