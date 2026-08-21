// Brand pack loader — the drop-in seam for a WHOLE store identity.
//
// TWO TIERS, one loader:
//
//   SIMPLE DROP (no setting, no manifest) — public/user-assets/brand/, the
//     singular well-known folder. Put logo.svg or logo.png in it and the store
//     wears it on the next boot; brand-drop.ts synthesizes the manifest from
//     the art. This is the "one step" tier, and it is ON by presence alone.
//   BRAND PACK (explicit) — one directory in public/user-assets/brands/:
//     `brands/<pack-id>/brand.json` plus whatever art it overrides (logo,
//     fonts, signs, surfaces, wraps). `localStorage.bb_brand_pack` names the
//     active one. Several identities can live side by side and be switched
//     between; a drop is one identity that is simply there.
//
// PRECEDENCE: brand/ (drop) < bb_brand_pack (explicit) < bb_logo (the user's
// own live edits in the brand editor). Naming a pack is an explicit choice, so
// it wins over a folder that just happens to exist — and the drop is never
// consulted when bb_brand_pack is set, so a typo'd pack id reports itself as a
// typo instead of silently landing on some other identity.
//
// No drop, no key, or a manifest that isn't installed means NO pack: every
// accessor below answers with the caller's own fallback, so a store with
// neither renders exactly as it did before this module existed. That is the
// contract — the committed default look must never depend on a pack existing.
//
// NO three.js imports here: this is consumed by the pure-canvas painters
// (logo-renderer, logo-wrap), by the identity resolvers (themes.ts,
// logo-spec.ts) and by the texture loader (user-assets.ts) alike, and by
// tools/list-slots.mjs under node. Module eval touches no browser global.
//
// ORDERING IS LOAD-BEARING (the same rule bundled-fonts.ts documents): the
// manifest and its fonts/images must be settled BEFORE the store builds. Most
// sign canvases are painted once into a texture cache and never repainted, so
// a pack landing a few ms late bakes the DEFAULT brand in permanently and
// nothing says so. Boot funnels await loadBrandPack() ahead of
// initializeStoreScene (main.ts waitForFontsAndInit, harness-boot.ts's
// watchdog race, asset-viewer.ts's).
import type { LogoSpec } from './logo-spec';
import type { StoreTheme } from './themes';
import { assetUrl } from './asset-url';
import { registerRuntimeFace } from './bundled-fonts';
import { BRAND_DROP_DIR, detectBrandDrop } from './brand-drop';
import { setBrandStringResolver } from './counter-terminal';

/** One face the pack ships, registered under a collision-proof runtime family. */
export interface BrandPackFontSpec {
  /** The name the pack's own logo spec / strings refer to, e.g. 'Halcyon Display'. */
  family: string;
  /** Pack-relative file, e.g. 'fonts/display.ttf'. */
  file: string;
  descriptors?: FontFaceDescriptors;
}

/**
 * brand.json. Only `version` and `id` are required — every other field is an
 * override, and absence means "keep today's value". A pack that declares
 * nothing but those two is legal and changes nothing.
 */
export interface BrandPackManifest {
  version: number;
  id: string;
  /** Brand name for rendered prose (brandString's 'brand-name' default). */
  name?: string;
  /** Longer display name for UI chrome; falls back to `name`. */
  displayName?: string;
  /** Theme ids this identity is for. Absent/empty = every theme. */
  appliesTo?: string[];
  fonts?: BrandPackFontSpec[];
  /** LogoSpec partial, merged UNDER the user's own bb_logo edits. */
  logo?: Partial<LogoSpec>;
  palette?: Partial<StoreTheme['palette']>;
  /**
   * PER-ERA deviations from `palette`, keyed by theme id. A real chain that
   * spans decades is not one palette: it repaints. Without this a pack's single
   * palette flattens every era onto the one the pack was authored in — the
   * era's own wall colour, its own livery blue, gone. Merged AFTER `palette`,
   * so a theme lists only what it does differently.
   */
  themes?: Record<string, { palette?: Partial<StoreTheme['palette']> }>;
  /** Rendered-string overrides, keyed by the ids brandString() names. */
  strings?: Record<string, string>;
  /**
   * Flat wrap prints per medium, pack-relative (USER_WRAP_SPECS geometry).
   * A bare string is the one-print shorthand; a LIST is how a pack ships the
   * several prints a real chain used, each choosable in the settings drawer.
   */
  wraps?: { vhs?: string | BrandPackWrapSpec[]; dvd?: string | BrandPackWrapSpec[] };
  signageSet?: string;
}

/**
 * One selectable wrap print a pack ships. `layout` names which of the app's
 * print geometries the scan follows — the difference between "metadata is
 * TYPED INTO this print's blank form fields" and "this print is final art":
 *   base   — the medium's own scan geometry + its typed-metadata pass
 *   plain  — the medium's crops, nothing typed over the art (default)
 *   ticket — the all-emblem VHS crops (fold lines at the spine band's edges)
 */
export interface BrandPackWrapSpec {
  /** Persisted `bb_cover_<medium>` value, e.g. 'standard'. */
  id: string;
  /** Settings-drawer label; defaults to the id. */
  label?: string;
  /** Pack-relative image, e.g. 'wraps/vhs-standard.jpg'. */
  file: string;
  layout?: 'base' | 'plain' | 'ticket';
}

export type BrandPackStatus = 'none' | 'loading' | 'loaded' | 'failed';

/** Which tier supplied the active identity. */
export type BrandPackSource = 'none' | 'drop' | 'pack';

// Legacy theme ids, canonicalized here rather than by importing resolveThemeId
// from themes.ts — that module imports US at runtime (getActiveTheme merges the
// pack palette), and this keeps the dependency one-directional. Same tiny
// duplication logo-spec.ts already carries; keep it in step with THEME_ALIASES.
const THEME_ID_ALIASES: Record<string, string> = { 'bb-90s': 'bb-1990', 'bb-2000s': 'bb-2010' };

let pack: BrandPackManifest | null = null;
let status: BrandPackStatus = 'none';
let loadPromise: Promise<BrandPackManifest | null> | null = null;
// Which tier answered, and the user-assets-relative directory it lives in.
// A simple drop is rooted at `brand/`, an explicit pack at `brands/<id>/`.
let source: BrandPackSource = 'none';
let packDir: string | null = null;
// Declared family name -> the runtime family it was actually registered under.
const packFamilies = new Map<string, string>();
// Resolved emblem-image url -> the decoded element (null once it has failed).
const packImages = new Map<string, HTMLImageElement | null>();

function readSetting(key: string): string | null {
  return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
}

/** The pack id the user asked for (localStorage bb_brand_pack), or null. */
export function activeBrandPackId(): string | null {
  const id = readSetting('bb_brand_pack');
  return id && id.trim() ? id.trim() : null;
}

/** The loaded manifest, or null — the sync accessor every consumer uses. */
export function getBrandPack(): BrandPackManifest | null {
  return pack && packApplies() ? pack : null;
}

/** Load state for the SERVICE MODE diagnostic line. */
export function brandPackStatus(): BrandPackStatus {
  return status;
}

/** Which tier the active identity came from — 'drop', 'pack' or 'none'. */
export function brandPackSource(): BrandPackSource {
  return getBrandPack() ? source : 'none';
}

/**
 * Does the loaded pack cover the ACTIVE theme? `appliesTo` lets a pack scope
 * itself to the eras it was authored for (a 1990 identity has nothing to say
 * about a 2010 store); absent/empty means every theme. One gate for the whole
 * pack — when it's shut, the store is exactly the no-pack store.
 */
function packApplies(): boolean {
  if (!pack) return false;
  const list = pack.appliesTo;
  if (!Array.isArray(list) || list.length === 0) return true;
  const saved = readSetting('bb_theme');
  const themeId = saved ? (THEME_ID_ALIASES[saved] ?? saved) : 'bb-1990';
  return list.includes(themeId);
}

/**
 * The active identity's directory relative to user-assets/ — `brands/<id>` for
 * an explicit pack, `brand` for a simple drop — or null. user-assets.ts's
 * override prefix.
 */
export function brandPackDir(): string | null {
  return getBrandPack() ? packDir : null;
}

/**
 * Resolve a pack-relative path ('logo/emblem.png') to a fetchable URL, or null
 * when no pack is active. Absolute/data/http sources pass through untouched so
 * a manifest can point at something outside its own directory.
 */
export function brandAssetUrl(rel: string): string | null {
  if (/^(?:https?:|data:|blob:|\/)/.test(rel)) return rel;
  const dir = brandPackDir();
  return dir ? assetUrl(`user-assets/${dir}/${rel.replace(/^\.?\//, '')}`) : null;
}

/**
 * A rendered brand string: the pack's override for `key`, else `fallback`.
 * Fallbacks are the CURRENT literals at every call site, so this is a no-op
 * until a pack declares the key.
 */
export function brandString(key: string, fallback: string): string {
  const s = getBrandPack()?.strings;
  const v = s && typeof s[key] === 'string' ? s[key] : null;
  return v !== null ? v : fallback;
}
// counter-terminal.ts keeps its imports empty for node-testability (#77), so
// its one branded label reads through a seam we fill in here.
setBrandStringResolver(brandString);

/**
 * The runtime family a pack-declared font name was registered under, or null.
 * Pack faces get a BBPack-prefixed family (the rule bundled-fonts.ts sets out)
 * so a manifest naming 'Helvetica' can never resolve to the host's copy —
 * canvas painters must measure the face we actually loaded.
 */
export function brandPackFontFamily(declared: string): string | null {
  return packFamilies.get(declared) ?? null;
}

/** Declared family names, for the brand editor's font picker. */
export function brandPackFontFamilies(): string[] {
  return getBrandPack() ? [...packFamilies.keys()] : [];
}

/**
 * A pack image preloaded by loadBrandPack, or null. Sync on purpose: the
 * emblem painters run inside a once-only texture paint and cannot await.
 */
export function brandImage(src: string): HTMLImageElement | null {
  const url = brandAssetUrl(src);
  return url ? (packImages.get(url) ?? null) : null;
}

// ─── Manifest validation ─────────────────────────────────────────────────────

/**
 * Structural problems with a parsed brand.json, as human-readable lines (empty
 * = valid). Shared with `node tools/list-slots.mjs --check`, which validates an
 * installed manifest at build time — same rule set, one implementation.
 */
export function validateBrandManifest(raw: unknown): string[] {
  const problems: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['manifest is not a JSON object'];
  const m = raw as Record<string, unknown>;
  if (typeof m.version !== 'number') problems.push('version: required, must be a number');
  if (typeof m.id !== 'string' || !m.id.trim()) problems.push('id: required, must be a non-empty string');
  else if (!/^[a-z0-9][a-z0-9-]*$/.test(m.id)) problems.push(`id: "${m.id}" must be kebab-case (a-z, 0-9, -)`);
  const str = (k: string) => {
    if (m[k] !== undefined && typeof m[k] !== 'string') problems.push(`${k}: must be a string`);
  };
  str('name'); str('displayName'); str('signageSet');
  if (m.appliesTo !== undefined && (!Array.isArray(m.appliesTo) || m.appliesTo.some((t) => typeof t !== 'string'))) {
    problems.push('appliesTo: must be an array of theme ids');
  }
  if (m.fonts !== undefined) {
    if (!Array.isArray(m.fonts)) problems.push('fonts: must be an array');
    else m.fonts.forEach((f, i) => {
      const face = f as Record<string, unknown> | null;
      if (!face || typeof face !== 'object') problems.push(`fonts[${i}]: must be an object`);
      else {
        if (typeof face.family !== 'string' || !face.family.trim()) problems.push(`fonts[${i}].family: required string`);
        if (typeof face.file !== 'string' || !face.file.trim()) problems.push(`fonts[${i}].file: required string`);
      }
    });
  }
  for (const k of ['logo', 'palette', 'strings', 'wraps', 'themes'] as const) {
    if (m[k] !== undefined && (typeof m[k] !== 'object' || m[k] === null || Array.isArray(m[k]))) {
      problems.push(`${k}: must be an object`);
    }
  }
  const themes = m.themes as Record<string, unknown> | undefined;
  if (themes && typeof themes === 'object' && !Array.isArray(themes)) {
    for (const [id, v] of Object.entries(themes)) {
      const entry = v as Record<string, unknown> | null;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        problems.push(`themes.${id}: must be an object`);
        continue;
      }
      if (entry.palette !== undefined
        && (typeof entry.palette !== 'object' || entry.palette === null || Array.isArray(entry.palette))) {
        problems.push(`themes.${id}.palette: must be an object`);
      }
    }
  }
  const strings = m.strings as Record<string, unknown> | undefined;
  if (strings && typeof strings === 'object' && !Array.isArray(strings)) {
    for (const [k, v] of Object.entries(strings)) {
      if (typeof v !== 'string') problems.push(`strings.${k}: must be a string`);
    }
  }
  const wraps = m.wraps as Record<string, unknown> | undefined;
  if (wraps && typeof wraps === 'object' && !Array.isArray(wraps)) {
    for (const [medium, v] of Object.entries(wraps)) {
      if (typeof v === 'string') continue;
      if (!Array.isArray(v)) { problems.push(`wraps.${medium}: must be a string or an array of prints`); continue; }
      v.forEach((w, i) => {
        const spec = w as Record<string, unknown> | null;
        const at = `wraps.${medium}[${i}]`;
        if (!spec || typeof spec !== 'object') { problems.push(`${at}: must be an object`); return; }
        if (typeof spec.id !== 'string' || !spec.id.trim()) problems.push(`${at}.id: required string`);
        if (typeof spec.file !== 'string' || !spec.file.trim()) problems.push(`${at}.file: required string`);
        if (spec.label !== undefined && typeof spec.label !== 'string') problems.push(`${at}.label: must be a string`);
        if (spec.layout !== undefined && !['base', 'plain', 'ticket'].includes(spec.layout as string)) {
          problems.push(`${at}.layout: must be one of base | plain | ticket`);
        }
      });
    }
  }
  return problems;
}

// ─── Boot load ───────────────────────────────────────────────────────────────

/** Sanitize a declared family into the BBPack-prefixed runtime family name. */
function runtimeFamilyFor(declared: string): string {
  return 'BBPack' + (declared.replace(/[^A-Za-z0-9]/g, '') || 'Face');
}

/** Preload one emblem image; resolves either way (a miss must never hang boot). */
function preloadImage(url: string): Promise<void> {
  if (typeof Image === 'undefined') return Promise.resolve();
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => { packImages.set(url, img); resolve(); };
    img.onerror = () => { packImages.set(url, null); resolve(); };
    img.src = url;
  });
}

/**
 * Adopt a manifest: register its fonts, preload its emblem art. Shared by both
 * tiers — a synthesized drop manifest is a manifest like any other.
 */
function adopt(manifest: BrandPackManifest, dir: string, from: BrandPackSource): Promise<BrandPackManifest> {
  pack = manifest;
  packDir = dir;
  source = from;
  status = 'loaded';
  // Fonts first: registerRuntimeFace kicks each fetch and re-arms
  // bundledFontsReady(), which the boot funnel awaits right after us.
  for (const face of manifest.fonts ?? []) {
    const src = brandAssetUrl(face.file);
    if (!src) continue;
    const family = runtimeFamilyFor(face.family);
    registerRuntimeFace(family, src, face.descriptors);
    packFamilies.set(face.family, family);
  }
  // Emblem art is awaited here (not registered) because the painters that
  // draw it are synchronous and run once.
  const imgSrc = manifest.logo?.imageSrc;
  const imgUrl = imgSrc ? brandAssetUrl(imgSrc) : null;
  return imgUrl ? preloadImage(imgUrl).then(() => manifest) : Promise.resolve(manifest);
}

/**
 * The simple-drop probe: public/user-assets/brand/. Runs only when no pack id
 * is set. Never rejects — a store with no drop folder pays one 404.
 */
function loadBrandDrop(): Promise<BrandPackManifest | null> {
  status = 'loading';
  return detectBrandDrop((p) => assetUrl(`user-assets/${p}`))
    .then((found) => {
      if (!found) { status = 'none'; return null; }
      const problems = validateBrandManifest(found.manifest);
      if (problems.length) {
        console.warn(`[brand-drop] ${BRAND_DROP_DIR}/ produced an invalid manifest — ignoring:\n  ` + problems.join('\n  '));
        status = 'failed';
        return null;
      }
      return adopt(found.manifest, BRAND_DROP_DIR, 'drop');
    })
    .catch((e) => {
      console.warn('[brand-drop] could not read user-assets/brand/ — using the built-in brand:', e);
      status = 'failed';
      return null;
    });
}

/**
 * Resolve the active identity: the explicit pack `bb_brand_pack` names, else
 * the simple drop in user-assets/brand/. Registers its fonts and preloads its
 * emblem art. Idempotent (one resolution per page load) and never rejects:
 *   - nothing installed                   → null, silently (the normal case)
 *   - unreadable/invalid manifest         → null, one console.warn
 * The returned promise settling is the boot funnels' signal that the pack's
 * fonts have JOINED bundledFontsReady() — await that next, not this alone.
 */
export function loadBrandPack(): Promise<BrandPackManifest | null> {
  if (loadPromise) return loadPromise;
  if (typeof fetch === 'undefined') {
    status = 'none';
    loadPromise = Promise.resolve(null);
    return loadPromise;
  }
  const id = activeBrandPackId();
  if (!id) {
    loadPromise = loadBrandDrop();
    return loadPromise;
  }
  status = 'loading';
  const url = assetUrl(`user-assets/brands/${id}/brand.json`);
  loadPromise = fetch(url)
    .then((res) => (res.ok ? res.text() : null))
    .then((text) => {
      // A dev/preview server with an SPA fallback answers a MISSING manifest
      // with index.html and a 200, so "not ok" is not the only miss — an HTML
      // body means the file isn't there either, and that is the silent case,
      // not a broken-JSON complaint.
      if (text === null || /^\s*</.test(text)) {
        // Not installed. Identical to "no pack" — the committed look stands.
        status = 'none';
        return null;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        console.warn(`[brand-pack] ${id}/brand.json is not valid JSON — ignoring pack:`, e);
        status = 'failed';
        return null;
      }
      const problems = validateBrandManifest(parsed);
      if (problems.length) {
        console.warn(`[brand-pack] ${id}/brand.json is invalid — ignoring pack:\n  ` + problems.join('\n  '));
        status = 'failed';
        return null;
      }
      const manifest = parsed as BrandPackManifest;
      if (manifest.id !== id) {
        console.warn(`[brand-pack] ${id}/brand.json declares id "${manifest.id}" — using the directory name.`);
        manifest.id = id;
      }
      return adopt(manifest, `brands/${id}`, 'pack');
    })
    .catch((e) => {
      // Network/permission failure — same fallback as "not installed", but say
      // so: a pack the user asked for and did not get is worth one line.
      console.warn(`[brand-pack] could not load ${id}/brand.json — using the built-in brand:`, e);
      status = 'failed';
      return null;
    });
  return loadPromise;
}
