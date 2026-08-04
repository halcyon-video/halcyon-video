// The harness's URL-param -> localStorage seeding, split out of harness.ts so
// it can run EARLIER than harness.ts does.
//
// Why it has to: harness.ts builds its StoreScene straight down the module
// body, so harness-boot.ts awaits the async pre-boot work (fonts, brand pack)
// BEFORE importing it. Anything those awaits read out of localStorage must
// therefore already be written — and `?set=bb_brand_pack=<id>` is exactly
// that: read by loadBrandPack(), written by this file. With the seeding still
// inside harness.ts the pack was looked up before the shot tool's --set had
// landed, and every pack screenshot silently came out as the built-in brand.
//
// Pure localStorage writes, no imports: whatever pulls this in must not drag
// the scene graph into the boot shim's chunk. Idempotent — harness.ts calls it
// again for the non-shim path, and re-writing the same values is free.

const SETTING_SHORTCUTS: [string, string][] = [
  ['arrangement', 'bb_arrangement'],
  ['medium', 'bb_medium'],
  ['cover', 'bb_cover_vhs'],      // rental cover-scan variant (COVER_VARIANTS)
  ['coverDvd', 'bb_cover_dvd'],
  ['outside', 'bb_outside'],
  ['corner', 'bb_corner'],
  ['storefront', 'bb_storefront'],
  ['ceiling', 'bb_ceiling'],
  ['theme', 'bb_theme'],
  ['logo', 'bb_logo'],            // partial LogoSpec JSON (see src/logo-spec.ts)
  ['overview', 'bb_overview_start'], // T21: '0' boots at the security-cam section view
  ['rental', 'bb_rental_mode'],      // T23: '1' boots with rental mode on
  ['rentalDev', 'bb_rental_dev'],    // T23: '1' = 5-minute dev lockout timer
  // Explicit overrides applied AFTER the `fast` block below, so e.g.
  // `?fast=1&quality=high&ssao=1` gets fast mode's small synthetic library
  // (cheap to load) with real quality=high/AO settings on top — lets the
  // shot tool exercise the SSAO pass without paying for --full's ~3000
  // poster textures (see tools/shot.mjs's --quality/--ssao passthrough).
  ['quality', 'bb_quality'],
  ['ssao', 'bb_ssao'],
];

/**
 * Apply every pre-boot settings param in the harness URL to localStorage:
 * `?flat`, `?fast` (quality/AO), the named shortcuts above, and the generic
 * `?set=<key>=<value>` escape hatch (repeatable — tools/shot.mjs --set, also
 * used by tools/gen_setting_thumbs.mjs). Order matters and is preserved: fast
 * mode's defaults first, explicit overrides on top.
 *
 * Does NOT cover the params with side effects beyond localStorage (fast
 * mode's upload turbo, the synthetic wrap upload, the fake rental record) —
 * those stay in harness.ts, where the modules they need are already loaded.
 */
export function applyHarnessSettingParams(params: URLSearchParams): void {
  if (params.get('flat')) {
    localStorage.setItem('bb_render_mode', 'flat');
  }
  if (params.get('fast')) {
    localStorage.setItem('bb_quality', 'low');
    localStorage.setItem('bb_ssao', '0');
  }
  for (const [param, key] of SETTING_SHORTCUTS) {
    const v = params.get(param);
    if (v) localStorage.setItem(key, v);
  }
  for (const kv of params.getAll('set')) {
    const eq = kv.indexOf('=');
    if (eq > 0) localStorage.setItem(kv.slice(0, eq), kv.slice(eq + 1));
  }
}
