#!/usr/bin/env node
// Sign-art slot manifest + signage-config validation.
//
//   node tools/list-slots.mjs            human-readable tables
//   node tools/list-slots.mjs --json     the same data as JSON on stdout
//   node tools/list-slots.mjs --json art-slots.json   ...written to a file
//   node tools/list-slots.mjs --check    validate DEFAULT_SIGNAGE_CONFIG
//                                        (wired into `npm run build`; exit 1
//                                        on unknown slot ids / sign ids)
//
// Enumerates every signage slot, every catalog sign (carrier fixture + the
// face size/aspect its carrier renders the art at), the exact
// public/user-assets/signs/ path that overrides each (see that README), and
// the registered fixture kinds. NO duplicated lists: the data is imported
// from the real src modules (signage-config.ts, signage-catalog.ts,
// themes.ts, fixture-registry.ts) via a small esbuild bundle — esbuild ships
// inside node_modules as vite's own dependency.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const checkMode = args.includes('--check');
const jsonIdx = args.indexOf('--json');
const jsonMode = jsonIdx !== -1;
const jsonPath = jsonMode && args[jsonIdx + 1] && !args[jsonIdx + 1].startsWith('-')
  ? args[jsonIdx + 1] : null;

// ── Import the real modules ──────────────────────────────────────────────────
// Browser-only globals some module graphs touch lazily; stubbed so import-time
// code paths never explode under node. (No `window` shim on purpose: modules
// gate browser behavior on `typeof window !== 'undefined'`.)
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document ??= { createElement: () => ({ getContext: () => null, style: {} }) };

async function bundleImport(entrySource) {
  // Plain specifier, not a hardcoded root/node_modules path: esbuild is
  // hoisted to node_modules as vite's dependency, and normal resolution also
  // walks UP from here — so this works from dependency-less git worktrees
  // that share the main checkout's install.
  const { build } = await import('esbuild');
  const result = await build({
    stdin: { contents: entrySource, resolveDir: root, loader: 'ts', sourcefile: 'list-slots-entry.ts' },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
    logLevel: 'silent',
    // Vite-style asset imports (fonts etc.) become inline data URLs so the
    // bundle stays a single importable module.
    loader: {
      '.ttf': 'dataurl', '.woff': 'dataurl', '.woff2': 'dataurl',
      '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl',
    },
  });
  const code = result.outputFiles.find(f => f.path.endsWith('.js')) ?? result.outputFiles[0];
  return import('data:text/javascript;base64,' + Buffer.from(code.text).toString('base64'));
}

const signage = await bundleImport(`
  export {
    DEFAULT_SIGNAGE_CONFIG, STATIC_SIGNAGE_SLOT_IDS, CEILING_NAV_SLOT_PREFIX,
    validateSignageConfig
  } from './src/signage-config';
  export { getSignDef, listCatalogSignDefs } from './src/signage-catalog';
  export { THEMES } from './src/themes';
  export { validateBrandManifest } from './src/brand-pack';
`);
const {
  DEFAULT_SIGNAGE_CONFIG, STATIC_SIGNAGE_SLOT_IDS, CEILING_NAV_SLOT_PREFIX,
  validateSignageConfig, getSignDef, listCatalogSignDefs, THEMES,
  validateBrandManifest,
} = signage;

// A pack's wrap prints have to match the app's wrap geometry exactly, so read
// USER_WRAP_SPECS out of video-case.ts rather than keeping a second copy here.
// Source-scanned, not imported, for the reason getFixtureKinds() documents
// below: that module's graph needs real browser globals at import time.
function readUserWrapSpecs() {
  const src = fs.readFileSync(path.join(root, 'src/video-case.ts'), 'utf8');
  const block = src.match(/USER_WRAP_SPECS[^=]*=\s*\{([\s\S]*?)\n\};/);
  const specs = {};
  if (block) {
    for (const m of block[1].matchAll(/(\w+):\s*\{\s*w:\s*(\d+),\s*h:\s*(\d+),\s*folds:\s*\[(\d+),\s*(\d+)\]/g)) {
      specs[m[1]] = { w: +m[2], h: +m[3], folds: [+m[4], +m[5]] };
    }
  }
  return specs;
}
const USER_WRAP_SPECS = readUserWrapSpecs();

// ── Installed brand packs ────────────────────────────────────────────────────
// public/user-assets/brands/<id>/brand.json — git-ignored, so this is normally
// an empty list. Validation uses the app's OWN validateBrandManifest (no second
// schema to keep in step); --check fails the build on a broken manifest, the
// same way it does for a signage-config typo.
const BRANDS_DIR = path.join(root, 'public/user-assets/brands');
function installedBrandPacks() {
  if (!fs.existsSync(BRANDS_DIR)) return [];
  const out = [];
  for (const e of fs.readdirSync(BRANDS_DIR, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const file = path.join(BRANDS_DIR, e.name, 'brand.json');
    if (!fs.existsSync(file)) {
      out.push({ id: e.name, ok: false, problems: ['brand.json is missing'] });
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      out.push({ id: e.name, ok: false, problems: [`brand.json is not valid JSON: ${err.message}`] });
      continue;
    }
    const problems = validateBrandManifest(parsed);
    if (parsed && parsed.id !== undefined && parsed.id !== e.name) {
      problems.push(`id: "${parsed.id}" does not match the directory name "${e.name}"`);
    }
    out.push({
      id: e.name,
      ok: problems.length === 0,
      problems,
      declares: parsed && typeof parsed === 'object' ? Object.keys(parsed).filter(k => k !== 'version' && k !== 'id') : [],
    });
  }
  return out;
}

// ── The simple drop ─────────────────────────────────────────────────────────
// public/user-assets/brand/ (SINGULAR). No manifest is required — a logo file
// alone is the whole install — but if a brand.json IS there it is a full pack
// and gets the same validation as one under brands/.
const DROP_DIR = path.join(root, 'public/user-assets/brand');
const DROP_LOGO_FILES = ['logo.svg', 'logo.png', 'logo.webp', 'logo.jpg', 'logo.jpeg'];
function installedBrandDrop() {
  if (!fs.existsSync(DROP_DIR)) return null;
  const art = DROP_LOGO_FILES.filter(f => fs.existsSync(path.join(DROP_DIR, f)));
  const manifestFile = path.join(DROP_DIR, 'brand.json');
  const hasManifest = fs.existsSync(manifestFile);
  const nameFile = path.join(DROP_DIR, 'brand.txt');
  let problems = [];
  if (hasManifest) {
    try {
      problems = validateBrandManifest(JSON.parse(fs.readFileSync(manifestFile, 'utf8')));
    } catch (err) {
      problems = [`brand.json is not valid JSON: ${err.message}`];
    }
  } else if (!art.length) {
    problems = [`no logo found — add one of ${DROP_LOGO_FILES.join(', ')} (or a brand.json)`];
  }
  return {
    dir: 'public/user-assets/brand',
    art,
    manifest: hasManifest,
    name: fs.existsSync(nameFile) ? fs.readFileSync(nameFile, 'utf8').split(/\r?\n/)[0].trim() : null,
    ok: problems.length === 0,
    problems,
  };
}

// ── --check: fail the build on config typos ─────────────────────────────────
if (checkMode) {
  const problems = validateSignageConfig(DEFAULT_SIGNAGE_CONFIG, getSignDef);
  if (problems.length) {
    console.error('SIGNAGE CONFIG INVALID (src/signage-config.ts):');
    for (const p of problems) console.error(`  - ${p}`);
    console.error('Known slots/signs: node tools/list-slots.mjs');
    process.exit(1);
  }
  const packs = installedBrandPacks();
  const broken = packs.filter(p => !p.ok);
  if (broken.length) {
    console.error('BRAND PACK INVALID (public/user-assets/brands/):');
    for (const p of broken) for (const msg of p.problems) console.error(`  - ${p.id}: ${msg}`);
    console.error('Pack manifest fields: node tools/list-slots.mjs');
    process.exit(1);
  }
  const drop = installedBrandDrop();
  if (drop && !drop.ok) {
    console.error('BRAND DROP INVALID (public/user-assets/brand/):');
    for (const msg of drop.problems) console.error(`  - ${msg}`);
    console.error('The drop folder: public/user-assets/README.md');
    process.exit(1);
  }
  const packNote = packs.length ? `; ${packs.length} brand pack(s) validated` : '';
  const dropNote = drop ? `; brand drop OK (${drop.manifest ? 'brand.json' : drop.art.join(', ')})` : '';
  console.log(`signage config OK (${Object.keys(DEFAULT_SIGNAGE_CONFIG).length} slot mappings validated${packNote}${dropNote})`);
  process.exit(0);
}

// Fixture kinds: importing fixture-registry pulls the full fixture module
// graph (game-section → three-scene → poster pipeline), which needs real
// browser globals at import time (Worker, window, …). Try the import — if the
// graph ever becomes node-cleanly importable it wins — but expect the
// fallback: reading the actual registerFixtureKind() calls out of the source
// (still the real modules and the real registrations, no hand-kept list).
async function getFixtureKinds() {
  try {
    const mod = await bundleImport(`
      import './src/store-fixtures-config';
      export { listFixtureKinds } from './src/fixture-registry';
    `);
    return { kinds: mod.listFixtureKinds(), via: 'import' };
  } catch {
    const kinds = new Set();
    const scan = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) scan(p);
        else if (e.name.endsWith('.ts')) {
          for (const m of fs.readFileSync(p, 'utf8').matchAll(/registerFixtureKind\(\s*'([^']+)'/g)) {
            kinds.add(m[1]);
          }
        }
      }
    };
    scan(path.join(root, 'src'));
    return { kinds: [...kinds].sort(), via: 'source-scan' };
  }
}

// ── Assemble the manifest ────────────────────────────────────────────────────
const themeIds = Object.values(THEMES).map(t => t.id);
const slotDir = (id) => `public/user-assets/signs/${id}/`;
// Suggested PNG size: the carrier maps the art 1:1 onto a w×h ft face, so any
// px size at that aspect works; we print long-side-1024 as the reference.
const pxFor = (w, h) => {
  const s = 1024 / Math.max(w, h);
  return { w: Math.round(w * s), h: Math.round(h * s) };
};

const signRow = (def, note) => ({
  id: def.id,
  category: def.category,
  carrier: def.fixture,
  faceFt: { w: def.size.w, h: def.size.h },
  aspect: +(def.size.w / def.size.h).toFixed(3),
  suggestedPx: pxFor(def.size.w, def.size.h),
  overrideDir: slotDir(def.id),
  ...(note ? { note } : {}),
});

const signs = listCatalogSignDefs().map(d => signRow(d));
// The dynamic per-genre ceiling sign (id ceiling-nav-<NAME>, generated by
// getSignDef); sample one to expose the carrier/size it renders at.
const navSample = getSignDef('ceiling-nav-COMEDY');
if (navSample) {
  signs.push(signRow(
    { ...navSample, id: 'ceiling-nav-<NAME>' },
    "dynamic: one per genre/library, e.g. signs/ceiling-nav-COMEDY/ (name uppercased); '93 signage mode renders 3.0x1.25 ft die-cut"
  ));
}

const slots = STATIC_SIGNAGE_SLOT_IDS.map(id => ({
  id,
  sign: Object.prototype.hasOwnProperty.call(DEFAULT_SIGNAGE_CONFIG, id)
    ? DEFAULT_SIGNAGE_CONFIG[id]
    : null,
  mapped: Object.prototype.hasOwnProperty.call(DEFAULT_SIGNAGE_CONFIG, id),
  overrideDir: slotDir(id),
}));
// Config keys beyond the static list (per-line ceiling-nav overrides etc.)
for (const [id, sign] of Object.entries(DEFAULT_SIGNAGE_CONFIG)) {
  if (!slots.some(s => s.id === id)) {
    slots.push({ id, sign, mapped: true, overrideDir: slotDir(id) });
  }
}
slots.push({
  id: `${CEILING_NAV_SLOT_PREFIX}<lineId>`,
  sign: 'auto',
  mapped: false,
  dynamic: true,
  overrideDir: slotDir(`${CEILING_NAV_SLOT_PREFIX}<lineId>`),
  note: 'one slot per shelving line; auto = sign ceiling-nav-<GENRE> for whatever is shelved underneath',
});

const { kinds: fixtureKinds, via: fixtureKindsVia } = await getFixtureKinds();

// ── Brand-pack manifest section ──────────────────────────────────────────────
// What a pack directory may contain and what each file has to be. The wrap
// geometry is the app's own USER_WRAP_SPECS, not a copy of it.
const wrapPath = (m) => {
  const s = USER_WRAP_SPECS[m];
  return {
    path: `wraps/${m}.png`,
    px: { w: s.w, h: s.h },
    aspect: +(s.w / s.h).toFixed(3),
    note: `flat [BACK | SPINE | FRONT] print; fold lines at x ${s.folds[0]} and ${s.folds[1]}`,
  };
};
const brandPack = {
  dir: 'public/user-assets/brands/<pack-id>/',
  manifest: 'brand.json',
  activatedBy: 'localStorage bb_brand_pack=<pack-id> (npm run shot -- --set bb_brand_pack=<pack-id>)',
  // Required/optional manifest fields, mirroring BrandPackManifest.
  manifestFields: {
    required: ['version (number)', 'id (kebab-case, must match the directory name)'],
    optional: [
      'name', 'displayName', 'appliesTo (theme ids)',
      'fonts [{family,file,descriptors}]', 'logo (LogoSpec partial + pathD/pathTiltDeg/imageSrc/wordmarkPathD)',
      'palette (StoreTheme.palette partial)', 'themes {<theme-id>: {palette}} (per-era deviations)',
      'strings {key: text}', 'wraps {vhs,dvd}', 'signageSet',
    ],
  },
  // Paths a pack may override, beyond the sign/surface trees it shadows.
  paths: [
    { path: 'brand.json', note: 'the manifest — everything else is optional' },
    { path: 'fonts/<file>.ttf', note: 'referenced by fonts[].file; registered under a BBPack-prefixed family' },
    { path: 'logo/<file>.png|svg', note: 'referenced by logo.imageSrc (shape "image"); drawn contained, aspect kept' },
    { path: 'signs/<slot-id or sign-id>/{<theme-id>|default}.png', note: 'checked BEFORE the flat signs/ tree — see SIGNS below for sizes' },
    { path: 'surfaces/<name>/{color,normal,roughness}.png', note: 'checked before the flat surfaces/ tree' },
    { path: 'fixtures/<name>/front.png', note: 'checked before the flat fixtures/ tree' },
    wrapPath('vhs'),
    wrapPath('dvd'),
  ],
  installed: installedBrandPacks(),
};

// The one-folder tier: no id, no setting, no manifest required.
const brandDrop = {
  dir: 'public/user-assets/brand/',
  activatedBy: 'presence — consulted only when bb_brand_pack is blank',
  accepts: [
    { path: 'logo.svg', note: 'biggest shape = the emblem outline (die-cuts every signboard); the rest ride as artLayers keeping their own colours' },
    { path: 'logo.png|webp|jpg', note: 'the art IS the emblem; its alpha is traced into the silhouette' },
    { path: 'brand.txt', note: 'first line = the store name (optional)' },
    { path: 'brand.json', note: 'optional — present means this folder is a full pack, nothing is synthesized' },
  ],
  installed: installedBrandDrop(),
};

const manifest = {
  generated: new Date().toISOString(),
  resolutionOrder: [
    'brands/<pack-id>/signs/<slot-id>/<theme-id>.png   (when a pack is active)',
    'signs/<slot-id>/<theme-id>.png',
    'brands/<pack-id>/signs/<slot-id>/default.png',
    'signs/<slot-id>/default.png',
    'brands/<pack-id>/signs/<sign-id>/<theme-id>.png',
    'signs/<sign-id>/<theme-id>.png',
    'brands/<pack-id>/signs/<sign-id>/default.png',
    'signs/<sign-id>/default.png',
  ],
  themeIds,
  slots,
  signs,
  fixtureKinds,
  brandPack,
  brandDrop,
};

// ── Output ───────────────────────────────────────────────────────────────────
if (jsonMode) {
  const out = JSON.stringify(manifest, null, 2);
  if (jsonPath) {
    fs.writeFileSync(jsonPath, out + '\n');
    console.error(`wrote ${jsonPath}`);
  } else {
    console.log(out);
  }
  process.exit(0);
}

const pad = (s, n) => String(s).padEnd(n);
const ft = (v) => String(+v.toFixed(2));
console.log('SIGN ART SLOTS — drop a PNG in public/user-assets/signs/ to replace a sign\'s art (no code)');
console.log('Per-slot dir beats per-sign dir; <theme>.png beats default.png. Theme ids: ' + themeIds.join(', '));
console.log('');
console.log('SLOTS (DEFAULT_SIGNAGE_CONFIG: slot -> sign; null = sign omitted)');
console.log(pad('  SLOT ID', 32) + pad('SIGN', 26) + 'PER-SLOT OVERRIDE DIR');
for (const s of slots) {
  const signLabel = s.dynamic ? '(auto: genre)' : s.sign === null ? (s.mapped ? '(null: omitted)' : '(unmapped)') : s.sign;
  console.log(pad('  ' + s.id, 32) + pad(signLabel, 26) + s.overrideDir);
  if (s.note) console.log(`      ${s.note}`);
}
console.log('');
console.log('SIGNS (catalog: per-sign override applies at every slot showing it)');
console.log(pad('  SIGN ID', 26) + pad('CARRIER', 17) + pad('FACE ft', 13) + pad('PNG @1024', 12) + 'OVERRIDE DIR');
for (const s of signs) {
  console.log(
    pad('  ' + s.id, 26) + pad(s.carrier, 17) +
    pad(`${ft(s.faceFt.w)} x ${ft(s.faceFt.h)}`, 13) +
    pad(`${s.suggestedPx.w}x${s.suggestedPx.h}`, 12) +
    s.overrideDir
  );
  if (s.note) console.log(`      ${s.note}`);
}
console.log('');
console.log(`FIXTURE KINDS (fixture-registry, via ${fixtureKindsVia}; placements: store-fixtures-config.ts)`);
console.log('  ' + fixtureKinds.join(', '));
console.log('');
console.log(`BRAND PACK — a whole store identity as files (${brandPack.dir})`);
console.log(`  Activate: ${brandPack.activatedBy}`);
console.log(`  brand.json required: ${brandPack.manifestFields.required.join(', ')}`);
console.log(`  brand.json optional: ${brandPack.manifestFields.optional.join(', ')}`);
console.log(pad('  PATH', 52) + 'EXPECTED / NOTE');
for (const p of brandPack.paths) {
  const size = p.px ? `${p.px.w}x${p.px.h} (${p.aspect}) — ` : '';
  console.log(pad('  ' + p.path, 52) + size + (p.note ?? ''));
}
if (brandPack.installed.length === 0) {
  console.log('  INSTALLED: none (the tree is git-ignored; the committed brand is the built-in one)');
} else {
  for (const p of brandPack.installed) {
    console.log(`  INSTALLED: ${p.id} — ${p.ok ? 'OK' : 'INVALID'}${p.declares?.length ? ` [${p.declares.join(', ')}]` : ''}`);
    for (const msg of p.problems) console.log(`      ${msg}`);
  }
}
