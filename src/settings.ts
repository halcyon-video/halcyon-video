// ─── Schema-driven settings registry ───────────────────────────────────────
//
// The single source of truth for every user-facing configuration knob and how
// it applies. Before this, the settings UI was hand-wired DOM in main.ts where
// every toggle called `location.reload()`, so you couldn't change two options
// without restarting and each change nuked the whole scene.
//
// A setting declares its localStorage key, how it's edited (toggle/cycle/text/
// secret), which group it belongs to in the drawer, and — crucially — its
// `applyMode`:
//   - 'live'          applies instantly via apply(value, scene); no rebuild.
//   - 'rebuild-scene' batches into a single StoreScene rebuild on drawer close
//                     (no page reload, no Jellyfin refetch, no poster
//                     re-download — see rebuildStoreScene in main.ts).
//   - 'reload'        batches into a single full page reload (credentials).
//
// Modules elsewhere may keep reading localStorage directly for now; this
// registry is the source of truth for the *UI* and the *apply behavior*, not a
// mandate to migrate every read.

import { isDemoMode } from './demo-mode';
import { enableFpsMeter, initFpsMeter, FPS_METER_KEY } from './fps-meter';
import { setRemotePlayEnabled } from './remote-play';
import { THEMES, resolveThemeId, WALL_PAINT_OPTIONS } from './themes';
import { COVER_VARIANTS, USER_WRAP_SPECS, getUserWrap, setUserWrap } from './video-case';
import type { CaseMedium } from './video-case';
import { DEFAULT_LOGO_SPECS, getActiveLogoSpec } from './logo-spec';
import {
  activeBrandPackId, brandPackFontFamilies, brandPackSource, brandPackStatus, getBrandPack,
} from './brand-pack';
import { brandDropReport } from './brand-drop';
import type { LogoShape, LogoSpec } from './logo-spec';
import { drawLogo, getLogoFontString } from './logo-renderer';
import { loadMediaReleasePin, saveMediaReleasePin } from './media-release-date';
import type { StoreScene } from './three-scene';

export type SettingKind = 'toggle' | 'cycle' | 'text' | 'secret';
export type ApplyMode = 'live' | 'rebuild-scene' | 'reload';
export type SettingGroup = 'Connection' | 'Store Look' | 'Store Brand' | 'Playback' | 'Performance' | 'Video Games';

export interface SettingChoice {
  id: string;
  label: string;
}

export interface SettingDef<T = unknown> {
  /** localStorage key. */
  key: string;
  label: string;
  kind: SettingKind;
  /** Which drawer section this appears under. */
  group: SettingGroup;
  /** Choices for a 'cycle' setting, in cycle order. */
  values?: SettingChoice[];
  default: T;
  applyMode: ApplyMode;
  /** For 'live' settings: apply the new value to the running scene in place. */
  apply?: (value: T, scene: StoreScene) => void;
  /**
   * One-line helper text shown under the row. A function form is re-resolved
   * every time the drawer (re)builds a row — for rows whose advice depends on
   * live state (e.g. Store Theme while era-follow is driving it). Read it
   * through resolveHint(), never directly.
   */
  hint?: string | (() => string);
  /**
   * Decorates the row's displayed value at render time (currentValueLabel) —
   * e.g. Store Theme shows "… (AUTO)" while the Media Release Date pin is
   * driving the era. Receives the plain label, returns what to show.
   */
  valueLabel?: (label: string) => string;
  /**
   * Runs after a drawer commit persists a new value (cycle/toggle rows).
   * A returned string is logged to the boot console — the hook for side
   * effects a change must announce (e.g. changing the theme detaches
   * era-follow so the pick can actually stick).
   */
  onChange?: (value: unknown) => string | void;
  /**
   * Service/developer knob: registered so the registry documents the key and
   * live-apply still works, but never rendered on the couch-facing drawer
   * pages. All hidden rows appear together on the SERVICE MODE page, entered
   * via the counter CRT's MANAGER OVERRIDE row (review §4.3).
   */
  hidden?: boolean;
  /**
   * Couch sub-page this row lives on. Rows sharing a subpage collapse into a
   * single "<name> ›" row on their group's page (one focus stop), which opens
   * a page listing just them — e.g. the 13 Video Games platform toggles.
   */
  subpage?: string;
  /**
   * Extra gate beyond `hidden`, re-evaluated every time the drawer renders
   * (e.g. per-platform Video Games toggles and the Romm connection fields
   * only make sense once `bb_games_enabled` is on). Omit for "always visible
   * (unless `hidden`)".
   */
  visibleWhen?: () => boolean;
}

const registry = new Map<string, SettingDef>();
const order: string[] = [];

export function registerSetting(def: SettingDef): void {
  if (!registry.has(def.key)) order.push(def.key);
  registry.set(def.key, def as SettingDef);
}

export function getSettingDef(key: string): SettingDef | undefined {
  return registry.get(key);
}

/** All registered settings, in registration order. */
export function allSettings(): SettingDef[] {
  return order.map((k) => registry.get(k)!).filter(Boolean);
}

/**
 * Visible (non-hidden, not conditionally hidden) settings on a group's MAIN
 * page, registration order preserved. Rows that live on a sub-page are
 * excluded — they're reached through their single "<name> ›" row instead.
 */
export function settingsInGroup(group: SettingGroup): SettingDef[] {
  return allSettings().filter((d) => d.group === group && !d.hidden && !d.subpage && (!d.visibleWhen || d.visibleWhen()));
}

/** Visible settings on one of a group's sub-pages, registration order preserved. */
export function settingsInSubpage(group: SettingGroup, subpage: string): SettingDef[] {
  return allSettings().filter((d) => d.group === group && !d.hidden && d.subpage === subpage && (!d.visibleWhen || d.visibleWhen()));
}

/** Sub-page names in a group that currently have at least one visible row. */
export function subpagesInGroup(group: SettingGroup): string[] {
  const names: string[] = [];
  for (const d of allSettings()) {
    if (d.group !== group || !d.subpage || d.hidden) continue;
    if (d.visibleWhen && !d.visibleWhen()) continue;
    if (!names.includes(d.subpage)) names.push(d.subpage);
  }
  return names;
}

/**
 * The SERVICE MODE roster: every `hidden:true` registration, in order. The
 * service page deliberately ignores both `hidden` and `visibleWhen` — staff
 * see every knob, gated or not.
 */
export function serviceSettings(): SettingDef[] {
  return allSettings().filter((d) => d.hidden);
}

/** Groups that currently have at least one visible setting, in a fixed order. */
export function visibleGroups(): SettingGroup[] {
  const wanted: SettingGroup[] = ['Store Look', 'Store Brand', 'Playback', 'Video Games', 'Performance', 'Connection'];
  // Store Brand has no registry rows — its page is the custom logo-editor
  // panel (buildStoreBrandPanel below), so it's always visible. The public
  // demo has no servers to connect to, so its Connection group is hidden.
  return wanted.filter((g) =>
    !(isDemoMode && g === 'Connection') && (g === 'Store Brand' || settingsInGroup(g).length > 0 || subpagesInGroup(g).length > 0));
}

/**
 * Read the effective value of a setting: the persisted localStorage value if
 * present, otherwise the declared default. Toggles are stored as '1'/'0'.
 */
export function getSetting<T = unknown>(key: string): T {
  const def = registry.get(key);
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      if (def?.kind === 'toggle') return (raw === '1') as unknown as T;
      return raw as unknown as T;
    }
  }
  if (typeof import.meta.env !== 'undefined') {
    const envKey = `VITE_${key.toUpperCase()}`;
    const envVal = (import.meta.env as Record<string, string | undefined>)[envKey];
    if (envVal !== undefined && envVal !== '') {
      if (def?.kind === 'toggle') return (envVal === '1' || envVal === 'true') as unknown as T;
      return envVal as unknown as T;
    }
  }
  return (def ? (def.default as unknown as T) : (undefined as unknown as T));
}

/** Persist a setting value. Toggles serialize to '1'/'0'. */
export function setSetting<T = unknown>(key: string, value: T): void {
  if (typeof localStorage === 'undefined') return;
  const def = registry.get(key);
  if (def?.kind === 'toggle') {
    localStorage.setItem(key, value ? '1' : '0');
  } else {
    localStorage.setItem(key, String(value));
  }
}

/** The next value id for a 'cycle' setting, wrapping around. */
export function nextCycleValue(key: string): string {
  const def = registry.get(key);
  if (!def?.values || def.values.length === 0) return String(getSetting(key));
  const cur = String(getSetting(key));
  const idx = def.values.findIndex((v) => v.id === cur);
  return def.values[(idx + 1) % def.values.length].id;
}

/** Human-readable current value, for display on a drawer row. */
export function currentValueLabel(key: string): string {
  const def = registry.get(key);
  if (!def) return '';
  const decorate = (label: string) => (def.valueLabel ? def.valueLabel(label) : label);
  if (def.kind === 'toggle') return decorate(getSetting<boolean>(key) ? 'On' : 'Off');
  if (def.kind === 'cycle') {
    const cur = String(getSetting(key));
    return decorate(def.values?.find((v) => v.id === cur)?.label ?? cur);
  }
  const val = getSetting<string>(key);
  if (def.kind === 'secret') return decorate(val ? '••••••••' : '(not set)');
  return decorate(val || '(not set)');
}

/** A def's hint for THIS render — resolves the dynamic (function) form. */
export function resolveHint(def: SettingDef): string | undefined {
  return typeof def.hint === 'function' ? def.hint() : def.hint;
}

// ─── Option thumbnails (W3) ──────────────────────────────────────────────────
//
// Pre-grabbed PNG snapshots of every visually-distinct option value, generated
// by tools/gen_setting_thumbs.mjs into public/setting-thumbs/<key>--<value>.png
// and committed. Rows for the keys below show a small preview beside the value
// that swaps as the value cycles. Anything without a PNG on disk (free-text,
// the user's own uploaded wrap, a value added before its thumb was regenerated)
// falls back gracefully: the <img> hides itself on load error.

const THUMBED_SETTINGS = new Set([
  'bb_theme',
  'bb_medium',
  'bb_case_art',
  'bb_cover_vhs',
  'bb_cover_dvd',
  'bb_arrangement',
  'bb_outside',
  'bb_ceiling',
  'bb_corner',
  'bb_walldecor',
  'bb_marquee_bulbs',
  'bb_storefront',
  'bb_render_mode',
  'bb_quality',
]);

/** Thumb PNG url for a (key, value id) pair, or null if the key isn't thumbed. */
export function settingThumbSrc(key: string, valueId: string): string | null {
  if (!THUMBED_SETTINGS.has(key)) return null;
  // Same base-URL resolution as assetUrl (inlined to keep this module's
  // imports scene-free): works at '/' and under a subpath deploy.
  return `${import.meta.env.BASE_URL}setting-thumbs/${encodeURIComponent(key)}--${encodeURIComponent(valueId)}.png`;
}

/** The value id a thumb filename uses for the CURRENT value (toggles → on/off). */
function currentThumbValueId(key: string): string {
  const def = registry.get(key);
  if (def?.kind === 'toggle') return getSetting<boolean>(key) ? 'on' : 'off';
  return String(getSetting(key));
}

/**
 * Build the preview <img> for a drawer row, already pointed at the current
 * value's thumb — or null when the setting has no thumbs at all (callers skip
 * the element entirely). Lazy-loaded so opening the drawer doesn't fetch
 * dozens of images; a missing PNG hides itself via the error handler.
 */
export function createSettingThumb(key: string): HTMLImageElement | null {
  const src = settingThumbSrc(key, currentThumbValueId(key));
  if (!src) return null;
  const img = document.createElement('img');
  img.className = 'settings-row-thumb';
  img.id = `setting-thumb-${key}`;
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.draggable = false;
  img.addEventListener('error', () => img.classList.add('thumb-missing'));
  img.src = src;
  return img;
}

/** Re-point a row's thumb at the (possibly new) current value. */
export function refreshSettingThumb(key: string): void {
  const img = document.getElementById(`setting-thumb-${key}`) as HTMLImageElement | null;
  if (!img) return;
  const src = settingThumbSrc(key, currentThumbValueId(key));
  if (!src) return;
  const abs = new URL(src, location.href).href;
  if (img.src !== abs) {
    img.classList.remove('thumb-missing'); // retry: the new value may have a PNG
    img.src = src;
  }
}

// ─── Core registrations ─────────────────────────────────────────────────────
//
// Every existing localStorage key the app already used, now declared in one
// place. Call registerCoreSettings() once at boot before building the drawer.

let coreRegistered = false;

/**
 * (Re-)register the per-medium rental-cover rows from the CURRENT contents of
 * COVER_VARIANTS. Split out of registerCoreSettings because the variant lists
 * are dynamic now: uploading/removing a user wrap (W3, see the Custom Wrap
 * block in buildStoreBrandPanel) adds/drops the 'user' entry mid-session, and
 * the row's cycle values must follow without a reboot.
 */
export function registerCoverVariantSettings(): void {
  for (const medium of ['vhs', 'dvd'] as const) {
    const variants = COVER_VARIANTS[medium];
    if (variants.length < 2) continue;
    registerSetting({
      key: `bb_cover_${medium}`,
      label: `${medium.toUpperCase()} Rental Cover`,
      kind: 'cycle',
      group: 'Store Look',
      values: variants.map((v) => ({ id: v.id, label: v.label })),
      default: variants[0].id,
      // Same caching rationale as Rental Case Art below: the panel art lives
      // on shared + per-title materials a no-reload rebuild preserves.
      applyMode: 'reload',
      hint:
        medium === 'vhs'
          ? 'Which 1988 wrap the VHS rental clamshell wears. “Ticket back” prints are all-ticket wraps with no synopsis window or spine fields, so they carry no movie metadata.'
          : 'Which wrap the DVD-era rental case wears.',
    });
  }
}

/**
 * One line describing the brand pack's actual state — what the SERVICE MODE
 * row reports and what the Store Brand page's status row is built from.
 * "Asked for a pack and did not get one" is the case worth naming: a misspelt
 * directory renders exactly like no pack at all.
 */
function brandPackDiagnostic(): string {
  const id = activeBrandPackId();
  if (!id) {
    return brandPackSource() === 'drop'
      ? `Blank — and a logo is dropped in user-assets/brand/, which is dressing the store. ${brandDropDiagnostic()}`
      : 'Directory under user-assets/brands/ to dress the store from. Blank = the drop folder user-assets/brand/, else the built-in brand.';
  }
  const status = brandPackStatus();
  if (status === 'loaded') {
    const pack = getBrandPack();
    const parts = Object.keys(pack ?? {}).filter((k) => k !== 'version' && k !== 'id');
    return `${id}: loaded${parts.length ? ` — ${parts.join(', ')}` : ''}.`;
  }
  if (status === 'failed') return `${id}: FAILED to load — see the console. Using the built-in brand.`;
  return `${id}: not installed (no brands/${id}/brand.json). Using the built-in brand.`;
}

/**
 * One line describing the SIMPLE DROP — user-assets/brand/. This is the tier
 * with no setting to look at, so the diagnostic is the only way to answer "did
 * it see my file, and what did it make of it?": which file, where the name came
 * from, whether the silhouette came through, what colours it sampled.
 */
function brandDropDiagnostic(): string {
  const drop = brandDropReport();
  if (!drop) {
    return activeBrandPackId()
      ? 'Not consulted: a Brand Pack is named, and an explicit pack wins over the drop folder.'
      : 'Empty. Drop logo.svg or logo.png into public/user-assets/brand/ and reload — no setting needed.';
  }
  if (brandPackSource() !== 'drop') {
    return `${drop.file} found, but a Brand Pack is named and wins over it.`;
  }
  const shape = drop.silhouette === 'outline' ? 'outline traced from the vector'
    : drop.silhouette === 'alpha-contour' ? 'silhouette traced from the image alpha'
    : 'no silhouette — signs use a plain board';
  const inks = [drop.bodyColor && `body ${drop.bodyColor}`, drop.textColor && `letters ${drop.textColor}`]
    .filter(Boolean).join(', ');
  const bits = [
    `${drop.file} (${shape}${drop.artLayers ? `, ${drop.artLayers} art layer${drop.artLayers === 1 ? '' : 's'}` : ''})`,
    drop.nameFrom === 'default' ? 'name: store default' : `name "${drop.name}" from ${drop.nameFrom}`,
    inks || 'no colours sampled',
  ];
  return bits.join(' · ') + (drop.notes.length ? ` — ${drop.notes.join('; ')}` : '');
}

export function registerCoreSettings(): void {
  if (coreRegistered) return;
  coreRegistered = true;

  // Store Look ---------------------------------------------------------------
  // While the Media Release Date pin's MATCH STORE ERA is on (#42), this row
  // is being DRIVEN: the scene-build funnel re-derives bb_theme from the pin
  // every rebuild. Auto-brightness rules apply — the row wears "(AUTO)" and
  // says who's driving BEFORE you touch it, and touching it takes control
  // back (onChange detaches the follow) instead of losing a silent fight
  // with the funnel one rebuild later.
  const eraFollowOn = (): boolean => !!loadMediaReleasePin()?.matchEra;
  registerSetting({
    key: 'bb_theme',
    label: 'Store Theme',
    kind: 'cycle',
    group: 'Store Look',
    values: Object.values(THEMES).map((t) => ({ id: t.id, label: t.name })),
    default: 'bb-1990',
    applyMode: 'rebuild-scene',
    // Footer bar clips hints at 62 chars — the follow-mode line is written
    // to fit whole, so the "detaches" half is never truncated away.
    hint: () => eraFollowOn()
      ? 'Following the Media Release Date pin. A change detaches it.'
      : 'Era + brand styling for the whole store.',
    valueLabel: (label) => (eraFollowOn() ? `${label} (AUTO)` : label),
    onChange: () => {
      const pin = loadMediaReleasePin();
      if (!pin?.matchEra) return;
      saveMediaReleasePin({ ...pin, matchEra: false });
      return 'Store era detached from the Media Release Date pin — era follow is off.';
    },
  });

  // Store Brand -------------------------------------------------------------
  // The group's couch page is the logo editor (buildStoreBrandPanel), which
  // renders INSTEAD of this group's registry rows — so this registration shows
  // up on the SERVICE MODE page, which is the right home for it anyway: it
  // takes a typed directory name and it changes the whole store's identity.
  // The editor page carries a read-only status row mirroring it.
  registerSetting({
    key: 'bb_brand_pack',
    label: 'Brand Pack',
    kind: 'text',
    group: 'Store Brand',
    default: '',
    // The manifest, its fonts and its emblem art are read ONCE before the
    // store builds (src/brand-pack.ts) — a rebuild would repaint textures
    // around a pack that was never loaded.
    applyMode: 'reload',
    // Live getter, not a fixed string: this row's hint IS the service-mode
    // diagnostic (the drawer's footer bar prints the selected row's hint), and
    // a pack that failed to load is otherwise indistinguishable from no pack.
    get hint() { return brandPackDiagnostic(); },
    hidden: true,
  });

  registerSetting({
    key: 'bb_93_signage',
    label: '1993 Footage Signage',
    kind: 'cycle',
    group: 'Store Look',
    values: [
      { id: 'off', label: 'Classic' },
      { id: 'on', label: '1993 Footage' },
    ],
    default: 'off',
    applyMode: 'rebuild-scene',
    // The 1993 era theme now turns this pack on by itself; this toggle survives
    // as a legacy override that layers the 93 dressing onto any other era.
    hint: '1993 fascia bands + ribbon ceiling layered onto any era.',
    hidden: true, // service knob: legacy override, superseded by the 1993 theme
  });

  registerSetting({
    key: 'bb_medium',
    label: 'Media Format',
    kind: 'cycle',
    group: 'Store Look',
    values: [
      { id: 'dvd', label: 'DVD' },
      { id: 'vhs', label: 'VHS' },
    ],
    default: 'dvd',
    applyMode: 'rebuild-scene',
    hint: 'Case shape used for every title on the shelves.',
  });

  registerSetting({
    key: 'bb_case_art',
    label: 'Rental Case Art',
    kind: 'cycle',
    group: 'Store Look',
    values: [
      { id: 'auto', label: 'Auto' },
      { id: 'vhs', label: 'VHS Box' },
      { id: 'dvd', label: 'DVD Box' },
    ],
    default: 'auto',
    // 'reload' (not rebuild-scene): the rental front/back/spine art is
    // cached on shared + per-title materials that a no-reload scene rebuild
    // deliberately preserves (see clearVideoCaseCache's 'rebuild' mode in
    // video-case.ts), so only a full reinit picks up a forced art change.
    applyMode: 'reload',
    hint: 'Force the VHS/DVD rental box design. Auto follows format.',
    hidden: true, // service knob: dev override, Auto already follows Media Format
  });

  // Swappable rental-cover scans (COVER_VARIANTS in video-case.ts), one
  // setting per design family so a forced Rental Case Art keeps its own pick.
  // A row only appears once its medium has more than one scan to choose from
  // (DVD ships with one today — drop a second scan into COVER_VARIANTS.dvd
  // and its row lights up here with no further wiring).
  registerCoverVariantSettings();

  registerSetting({
    key: 'bb_arrangement',
    label: 'Shelf Arrangement',
    kind: 'cycle',
    group: 'Store Look',
    values: [
      { id: 'herringbone', label: 'Herringbone' },
      { id: 'straight', label: 'Straight' },
      { id: 'diagonal', label: 'Diagonal' },
    ],
    default: 'herringbone',
    applyMode: 'rebuild-scene',
    hint: 'How the aisles are oriented on the floor.',
  });

  // bb_outside once offered a 'streetview' mode (removed 2026-08 with its
  // photo pano); resolve a stale saved value so the cycle row lands on a
  // real option instead of an off-menu id.
  if (typeof localStorage !== 'undefined' && localStorage.getItem('bb_outside') === 'streetview') {
    localStorage.setItem('bb_outside', 'day');
  }
  registerSetting({
    key: 'bb_outside',
    label: 'Environment',
    kind: 'cycle',
    group: 'Store Look',
    values: [
      { id: 'day', label: 'Daytime' },
      { id: 'night', label: 'Nighttime' },
      { id: 'sunset', label: 'Sunset' },
    ],
    default: 'day',
    applyMode: 'live',
    apply: (value, scene) => scene.setOutsideMode(value as 'day' | 'night' | 'sunset'),
    hint: 'Time of day seen through the storefront windows.',
  });

  registerSetting({
    key: 'bb_ceiling',
    label: 'Ceiling Height',
    kind: 'cycle',
    group: 'Store Look',
    values: [
      { id: 'standard', label: 'Standard' },
      { id: 'high', label: 'High' },
    ],
    default: 'standard',
    applyMode: 'rebuild-scene',
    hint: 'Standard drop ceiling or a raised high-ceiling shell.',
    subpage: 'Building & Storefront',
  });

  registerSetting({
    key: 'bb_corner',
    label: 'Corner Step',
    kind: 'cycle',
    group: 'Store Look',
    values: [
      { id: 'standard', label: 'Standard' },
      { id: 'wide', label: 'Wide' },
      { id: 'shallow', label: 'Shallow' },
      { id: 'none', label: 'None' },
    ],
    default: 'standard',
    applyMode: 'rebuild-scene',
    hint: 'Stepped back-right corner for New Releases. None = flat.',
    subpage: 'Building & Storefront',
  });

  registerSetting({
    key: 'bb_walldecor',
    label: 'Wall Displays',
    kind: 'toggle',
    group: 'Store Look',
    default: false,
    applyMode: 'rebuild-scene',
    hint: 'Featured-actor portraits + film-strip ribbon, right wall. High ceiling only.',
    subpage: 'Building & Storefront',
  });

  registerSetting({
    key: 'bb_wall_color',
    label: 'Wall Paint',
    kind: 'cycle',
    group: 'Store Look',
    values: [
      { id: 'auto', label: 'Theme Default' },
      ...Object.entries(WALL_PAINT_OPTIONS).map(([id, v]) => ({ id, label: v.label })),
    ],
    default: 'auto',
    applyMode: 'rebuild-scene',
    hint: 'Wall paint tint. Theme Default follows the era.',
    subpage: 'Building & Storefront',
  });

  registerSetting({
    key: 'bb_marquee_bulbs',
    label: 'Marquee Bulbs',
    kind: 'toggle',
    group: 'Store Look',
    default: true,
    applyMode: 'rebuild-scene',
    hint: 'Bulb rows on cornice + window posters. Off at Low quality.',
    subpage: 'Building & Storefront',
  });

  registerSetting({
    key: 'bb_marquee_anim',
    label: 'Marquee Animation',
    kind: 'cycle',
    group: 'Store Look',
    values: [
      { id: 'off', label: 'Unlit' },
      { id: 'steady', label: 'Steady' },
      { id: 'chase', label: 'Chase' },
    ],
    default: 'steady',
    applyMode: 'live',
    apply: (value, scene) => scene.setMarqueeAnimMode(value as 'off' | 'steady' | 'chase'),
    hint: 'Chase never wakes the idle renderer by itself.',
    hidden: true, // service knob: render-scheduling behavior, not decor
  });

  registerSetting({
    key: 'bb_storefront',
    label: 'Storefront',
    kind: 'cycle',
    group: 'Store Look',
    values: [
      { id: 'standard', label: 'Standard' },
      { id: 'sliding-gray', label: 'Sliding Doors / Gray' },
      { id: 'rounded-counter', label: 'Rounded Counter' },
      { id: 'usquare-counter', label: 'Half-Square Counter' },
    ],
    default: 'standard',
    applyMode: 'rebuild-scene',
    hint: 'Doors, storefront window framing, and counter style.',
    subpage: 'Building & Storefront',
  });

  // T21: entrance-overview browsing start. Live apply so toggling it off
  // returns the classic first-aisle start with no reload (and no rebuild).
  registerSetting({
    key: 'bb_overview_start',
    label: 'Start at entrance overview',
    kind: 'toggle',
    group: 'Store Look',
    default: true,
    applyMode: 'live',
    apply: (value, scene) => scene.setOverviewStart(!!value),
    hint: 'Start inside the doors on the jump index. Off = cam view.',
    hidden: true, // service knob: navigation-flow experiment (T21)
  });

  // The tip jar on the counter (src/fixtures/tip-jar.ts). ON by default and
  // deliberately easy to find here: the same build runs on a family TV, and
  // whether that living room carries a donation ask is the owner's call, not
  // ours. Off = the fixture builds nothing at all, so the counter is
  // byte-identical to a build that never had one.
  registerSetting({
    key: 'bb_tip_jar',
    label: 'Tip jar on the counter',
    kind: 'toggle',
    group: 'Store Look',
    default: true,
    applyMode: 'rebuild-scene',
    hint: 'A card and a cup by the register, linking the project’s Ko-fi.',
  });

  // T22: carried tapes + front-counter checkout. Default OFF until T23 ships
  // rental mode — when off, the instant play-from-the-shelf flow is untouched.
  registerSetting({
    key: 'bb_carry_mode',
    label: 'Carry & checkout',
    kind: 'toggle',
    group: 'Store Look',
    default: false,
    applyMode: 'live',
    apply: (value, scene) => scene.setCarryMode(!!value),
    hint: 'Carry a tape (OK), check out at the counter to play it.',
  });

  // T23: rental mode ("hardcore mode") — limited tapes per night and a real
  // lockout in the back room after checkout. Forces carry & checkout ON.
  registerSetting({
    key: 'bb_rental_mode',
    label: 'Rental mode',
    kind: 'toggle',
    group: 'Store Look',
    default: false,
    applyMode: 'live',
    apply: (value, scene) => scene.setRentalMode(!!value),
    hint: 'Halcyon house rules: real due-backs, living room, lockout.',
  });

  // Dev timer: ships available but OFF (ticket). Read at checkout time, so a
  // live toggle needs no scene hook.
  registerSetting({
    key: 'bb_rental_dev',
    label: 'Rental dev timer (5 min)',
    kind: 'toggle',
    group: 'Store Look',
    default: false,
    applyMode: 'live',
    hint: '5-minute lockout for testing. Applies to the NEXT checkout.',
    hidden: true, // service knob: dev timer for exercising the rental loop
    visibleWhen: () => getSetting<boolean>('bb_rental_mode'),
  });

  // Playback -------------------------------------------------------------------
  // Both are read at launchVideoPlayback time (main.ts), so 'live' with no
  // scene hook — they only shape the NEXT playback's initial track selection.
  registerSetting({
    key: 'bb_audio_lang',
    label: 'Preferred Audio Language',
    kind: 'text',
    group: 'Playback',
    default: '',
    applyMode: 'live',
    hint: 'Track picked at start, e.g. "eng". Blank = file default.',
  });

  registerSetting({
    key: 'bb_local_mpv',
    label: 'Play Files Off Disk (mpv)',
    kind: 'toggle',
    group: 'Playback',
    default: true,
    applyMode: 'live',
    hint: 'Play local files in mpv: real HDR + original surround.',
  });

  registerSetting({
    key: 'bb_subtitles_default',
    label: 'Closed Captions On By Default',
    kind: 'toggle',
    group: 'Playback',
    default: false,
    applyMode: 'live',
    hint: 'Start every movie with subtitles showing.',
  });

  // Tone mapping (research-driven, see three-scene initThree): AgX is the
  // filmic default; Khronos PBR Neutral reproduces authored colors exactly
  // below its highlight knee — box art and brand colors read truer, at the
  // cost of the filmic highlight rolloff.
  registerSetting({
    key: 'bb_tonemap',
    label: 'Color Response',
    kind: 'cycle',
    group: 'Store Look',
    values: [
      { id: 'neutral', label: 'True Color (PBR Neutral)' },
      { id: 'agx', label: 'Filmic (AgX)' },
    ],
    default: 'neutral',
    applyMode: 'rebuild-scene',
    hint: 'True Color keeps art as printed; Filmic softens highlights.',
    hidden: true, // service knob: tone-mapping engine choice
  });

  // Color warmth (store-grade.ts): a display-space white-balance lean toward
  // tungsten in the final photo-grade pass. Value ids are the NUMERIC warmth
  // (also the bb_grade_warmth sweep knob — `--set bb_grade_warmth=0.42` in the
  // harness still works and simply shows its raw number here). Default is a
  // modest warm lean: real rental floors ran warm-white fluorescents and the
  // era's cameras rendered them warmer still.
  registerSetting({
    key: 'bb_grade_warmth',
    label: 'Color Warmth',
    kind: 'cycle',
    group: 'Store Look',
    values: [
      { id: '0', label: 'Neutral' },
      { id: '0.18', label: 'Subtle' },
      { id: '0.35', label: 'Warm' },
      { id: '0.7', label: 'Cozy' },
    ],
    default: '0.35',
    applyMode: 'live',
    apply: (value, scene) => scene.setGradeWarmth(parseFloat(String(value))),
    hint: 'Warm leans tungsten, like 90s film. Neutral is pure white.',
    hidden: true, // service knob: grade-pass sweep parameter
  });

  // Optional nostalgia film LUT (store-grade.ts): a procedural 33³ 3D-LUT in
  // the same always-compiled grade pass — toggling is a uniform write, cost is
  // one trilinear texture fetch per pixel (measured ~free; branch-skipped
  // when off).
  registerSetting({
    key: 'bb_grade_lut',
    label: 'Film Look (LUT)',
    kind: 'toggle',
    group: 'Store Look',
    default: false,
    applyMode: 'live',
    apply: (value, scene) => scene.setGradeLut(!!value),
    hint: 'Film-look grade: floated blacks, amber midtones. Free.',
    hidden: true, // service knob: film-emulation LUT experiment
  });

  // Performance --------------------------------------------------------------
  registerSetting({
    key: 'bb_render_mode',
    label: 'Render Mode',
    kind: 'cycle',
    group: 'Performance',
    values: [
      { id: '3d', label: '3D Store' },
      { id: 'flat', label: '2.5D Shelf' }
    ],
    default: '3d',
    // In-process swap (no page reload / Jellyfin re-fetch): on drawer close this
    // flows through rebuildStoreScene(), which tears down the outgoing mode and
    // rebuilds the incoming one from the loaded catalog — same path the diegetic
    // manager-terminal / flat-menu switches use (switchRenderMode in main.ts).
    applyMode: 'rebuild-scene',
    hint: 'Full 3D store, or a flat shelf UI for low-power clients.',
    // Also switchable diegetically (power menu, counter CRT, flat menu); this
    // row exists so the mode is FINDABLE where users look for it (UX pass
    // 2026-08: performance controls must live on the couch tree).
  });

  registerSetting({
    key: 'bb_quality',
    label: 'Render Quality',
    kind: 'cycle',
    group: 'Performance',
    values: [
      { id: 'high', label: 'High' },
      { id: 'medium', label: 'Medium' },
      { id: 'low', label: 'Low' },
    ],
    default: 'high',
    applyMode: 'rebuild-scene',
    hint: 'Reflections and post-processing detail. Auto-picked per GPU.',
  });

  registerSetting({
    key: 'bb_ao',
    label: 'Ambient Occlusion Engine',
    kind: 'cycle',
    group: 'Performance',
    values: [
      { id: 'n8ao', label: 'N8AO (half-res)' },
      { id: 'gtao', label: 'GTAO (legacy)' },
    ],
    default: 'n8ao',
    applyMode: 'rebuild-scene',
    hint: 'N8AO: cheaper half-res AO. GTAO is the older fallback.',
  });

  registerSetting({
    key: 'bb_fps_cap',
    label: 'FPS Cap',
    kind: 'cycle',
    group: 'Performance',
    values: [
      { id: 'auto', label: 'Auto' },
      { id: '0', label: 'Uncapped' },
      { id: '30', label: '30' },
    ],
    default: 'auto',
    // fpsCapOverride is read once in initThree() (three-scene.ts), like the
    // other bb_* boot flags this group cycles — needs the same scene rebuild
    // every other Performance row here takes.
    applyMode: 'rebuild-scene',
    hint: 'ACTIVE render rate. Auto: uncapped on GPUs that earned the supersample grant (and any explicit quality override), else paced to ~60fps at an even display-refresh divisor.',
  });

  // On-screen frame-rate readout. Live toggle: the meter is a pure DOM overlay
  // that passively observes composited frames through the always-on hitch
  // tracer (see src/fps-meter.ts), so switching it on/off neither rebuilds the
  // scene nor wakes the render-on-demand loop.
  registerSetting({
    key: FPS_METER_KEY,
    label: 'FPS Counter',
    kind: 'toggle',
    group: 'Performance',
    default: false,
    applyMode: 'live',
    apply: (value) => enableFpsMeter(!!value),
    hint: 'Corner readout: FPS, frame time, 1% low. IDLE when parked.',
  });

  // (Removed) 'bb_security_cam' — the security-camera angle is now the ONLY
  // library-select view; the legacy first-person section navigation is gone.

  // Candy delivery (T19) -------------------------------------------------------
  // Lives under Playback (it's a checkout-time behavior; a one-row "Delivery"
  // group wasn't worth a couch focus stop — review §4.3). Off by default and
  // otherwise zero-cost: when off, checkout is byte-for-byte identical to
  // before this ticket (see main.ts's maybeRunCandyCheckout()).
  // The ZIP used to build the deep link is a separate raw localStorage field
  // ('candy_delivery_zip', edited inline on the checkout screen itself) rather
  // than a registry entry -- there's no generic free-text row in this drawer
  // yet (only credentials get that treatment), and a delivery ZIP isn't a
  // credential, so it isn't worth building one just for this.
  registerSetting({
    key: 'candy_delivery_enabled',
    label: 'Candy Delivery',
    kind: 'toggle',
    group: 'Playback',
    default: false,
    applyMode: 'live',
    hint: 'Adds a "Snacks?" checkout step. Order opens in DoorDash.',
  });

  // Connection -----------------------------------------------------------------
  // Editable from the drawer's Connection group (text/secret rows, rendered as
  // real <input>s — see makeTextRow in main.ts) as well as the boot login
  // overlay; both write the same localStorage keys, so an edit in either place
  // is picked up by the other. jellyfin_password is registered so the row
  // exists, but is never persisted (see commitTextSetting's special case).
  const cred = (key: string, label: string, kind: SettingKind, opts?: Partial<SettingDef>): void =>
    registerSetting({ key, label, kind, group: 'Connection', default: '', applyMode: 'reload', ...opts });
  // The url/username keys keep their historical `jellyfin_` spelling whichever
  // server is connected (see media-backend.ts's note on why renaming them would
  // sign every existing install out), but the LABELS are server-neutral now
  // that a store can be supplied by either — they're read by a user who may
  // never have run Jellyfin. Static rather than derived from the active
  // backend: settings register before a backend is necessarily resolvable.
  cred('jellyfin_url', 'Media Server URL', 'text', {
    hint: 'Jellyfin or Plex — the store identifies whichever answers.',
  });
  cred('jellyfin_username', 'Media Server Username', 'text');
  cred('jellyfin_password', 'Media Server Password', 'secret', {
    hint: 'Blank keeps session. A password re-authenticates. Plex: paste a token here.',
  });

  cred('jellyseerr_url', 'Jellyseerr URL', 'text');
  cred('jellyseerr_apikey', 'Jellyseerr API Key', 'secret');

  // Permanent release-date bounds on everything Jellyseerr SUGGESTS (discovery
  // shelves, staff-pick seeds, un-ordered collection gaps) — a static window
  // that does NOT move with the clock, unlike the terminal's rolling Media
  // Release Date pin. The two compose: tighter bound wins (#42).
  const seerrOn = (): boolean => !!getSetting<string>('jellyseerr_url');
  cred('jellyseerr_suggest_from', 'Suggestions From', 'text', {
    visibleWhen: seerrOn,
    hint: 'YYYY or YYYY-MM-DD. Never suggest titles released earlier.',
  });
  cred('jellyseerr_suggest_until', 'Suggestions Until', 'text', {
    visibleWhen: seerrOn,
    hint: 'YYYY or YYYY-MM-DD. Never suggest titles released later. The Media Release Date pin still applies if tighter.',
  });

  // Remote Play: stream this running store, peer-to-peer, to any browser on
  // the network (see src/remote-play.ts). Live toggle — starts/stops hosting
  // without a rebuild.
  registerSetting({
    key: 'bb_remote_play',
    label: 'Remote Play Stream',
    kind: 'toggle',
    group: 'Connection',
    default: false,
    applyMode: 'live',
    apply: (value) => setRemotePlayEnabled(!!value),
    hint: 'Streams the store to any browser at /remote.html. Connecting queries a public STUN server.',
    hidden: true, // service knob: dev/preview-server streaming feature
  });

  // Romm connection fields only make sense once the Video Games section itself
  // is switched on (see bb_games_enabled below).
  const gamesOn = (): boolean => getSetting<boolean>('bb_games_enabled');
  cred('romm_url', 'Romm URL', 'text', { visibleWhen: gamesOn });
  cred('romm_apikey', 'Romm API Key', 'secret', { visibleWhen: gamesOn });

  // Video Games -----------------------------------------------------------------
  // Off by default: an unconfigured store issues zero Romm requests and shows
  // no game section (see loadGameMovies in main.ts). This master toggle is
  // registered first so it's always the top (and, when off, only) row in the
  // group; every setting below it is gated on gamesOn().
  registerSetting({
    key: 'bb_games_enabled',
    label: 'Enable video game section',
    kind: 'toggle',
    group: 'Video Games',
    default: false,
    applyMode: 'reload',
    hint: 'Adds a Video Games shelf stocked from Romm (or demo).',
  });

  // The native launch path (romm.ts launchGame -> Tauri's launch_game) has
  // always read this key, but nothing ever registered it — so the only way to
  // set it was to write localStorage by hand, and the feature read as missing
  // to anyone who looked for it. The Rust side splits on whitespace and spawns
  // an argv ARRAY (no shell) with the program checked against a fixed emulator
  // allowlist, so a typo here fails closed rather than running something.
  // Desktop only: a browser build has no __TAURI_INTERNALS__ and falls through
  // to Romm's EmulatorJS player regardless of what is typed.
  registerSetting({
    key: 'romm_launch_cmd',
    label: 'Emulator Command',
    kind: 'text',
    group: 'Video Games',
    default: '',
    applyMode: 'live',
    hint: 'Desktop app only. e.g. "retroarch -L /path/to/core.so {path}" — {path} becomes the rom file. Blank uses Romm\'s in-browser player.',
    visibleWhen: () => getSetting<boolean>('bb_games_enabled'),
  });

  // GAMES ONLY: the games stop being a department and become the store (see
  // games-only.ts). Every Romm platform gets its own aisles, signed with the
  // platform name, and the movies step out entirely — so this also overrides
  // the platform toggles below, which exist to ration a 192-case department
  // budget that no longer applies.
  registerSetting({
    key: 'bb_games_only',
    label: 'Video games only',
    kind: 'toggle',
    group: 'Video Games',
    default: false,
    applyMode: 'rebuild-scene',
    hint: 'The whole store becomes the game store — every game in your Romm library, no movies.',
    visibleWhen: gamesOn,
  });

  // Video Games Platforms -----------------------------------------------------
  // All 13 toggles live on one "Platforms" sub-page — a single focus stop on
  // the Video Games page instead of 13 couch-facing rows (review §4.3).
  // Ignored entirely while GAMES ONLY is on (see above), so they hide there —
  // a toggle that visibly does nothing reads as a bug.
  const perPlatformPicking = (): boolean =>
    gamesOn() && !getSetting<boolean>('bb_games_only');
  const registerPlatformSetting = (key: string, label: string, defVal: boolean) => {
    registerSetting({
      key: `bb_platform_${key}`,
      label,
      kind: 'toggle',
      group: 'Video Games',
      subpage: 'Platforms',
      default: defVal,
      applyMode: 'rebuild-scene',
      hint: `Show ${label} section on the Video Games shelf.`,
      visibleWhen: perPlatformPicking,
    });
  };

  registerPlatformSetting('snes', 'Super Nintendo', true);
  registerPlatformSetting('sfam', 'Super Famicom', false);
  registerPlatformSetting('nes', 'Nintendo NES', false);
  registerPlatformSetting('n64', 'Nintendo 64', true);
  registerPlatformSetting('3ds', 'Nintendo 3DS', false);
  registerPlatformSetting('genesis', 'Sega Genesis', true);
  registerPlatformSetting('psx', 'PlayStation', true);
  registerPlatformSetting('ps2', 'PlayStation 2', false);
  registerPlatformSetting('gamecube', 'Nintendo GameCube', false);
  registerPlatformSetting('dreamcast', 'Sega Dreamcast', false);
  registerPlatformSetting('saturn', 'Sega Saturn', false);
  registerPlatformSetting('psp', 'PlayStation Portable', false);
  registerPlatformSetting('dsi', 'Nintendo DSi', false);
  registerPlatformSetting('switch', 'Nintendo Switch', false);
  registerPlatformSetting('wiiu', 'Wii U', false);
  registerPlatformSetting('xbox', 'Xbox', false);
  registerPlatformSetting('gba', 'Game Boy Advance', false);
  registerPlatformSetting('gbc', 'Game Boy Color', false);
  registerPlatformSetting('gb', 'Game Boy', false);
  registerPlatformSetting('arcade', 'Arcade', false);
  registerPlatformSetting('atari', 'Atari', false);

  // The FPS overlay is the one setting with no scene dependency at all — it's a
  // DOM box fed by the always-on hitch tracer. Honour it here, at the single
  // point every shell shares (main(), the screenshot harness / public demo,
  // remote-play instances), so `?fps=1` and a saved bb_fps_meter work even in
  // the shells that never run main.ts's overlay wiring. Idempotent and free
  // when the setting is off.
  initFpsMeter();
}

// ─── Store Brand panel (LogoSpec editor) ─────────────────────────────────────
//
// The "Store Brand" drawer page is not schema rows: it's a custom panel (live
// logo preview, preset strip, color pickers, sliders) built here so the drawer
// generator in main.ts stays generic. Rows still join the drawer's
// single-column remote navigation: main.ts registers each row key via the
// hooks below and delegates Left/Right/Enter back through activateBrandRow().
//
// Persistence: only the DIFF from the active theme's default LogoSpec is
// stored (localStorage 'bb_logo', deep-merged back by getActiveLogoSpec), so a
// saved brand follows theme switches for every field the user didn't touch.
// Changes apply the way the theme control does: onDirty() flags one scene
// rebuild that runs when the drawer closes — nothing reloads per keystroke.
// The preview canvas redraws only from control events, never rAF.

export const BRAND_ROW_PREFIX = '__brand__:';

export interface BrandPanelHooks {
  /** The persisted bb_logo actually changed — flag the drawer-close rebuild. */
  onDirty?: () => void;
  /**
   * A change that only a full page reload picks up (the W3 custom-wrap
   * uploads: box-panel art lives on shared + per-title material caches that a
   * no-reload rebuild deliberately preserves — same rationale as the
   * bb_cover_* rows' applyMode: 'reload').
   */
  onNeedsReload?: () => void;
  /** Add a row to the drawer's flat nav list; returns its selection index. */
  registerRow?: (key: string) => number;
  /** Move the drawer selection to a registered row (pointerenter parity). */
  selectRow?: (index: number) => void;
}

// Row-activation delegates for the CURRENT panel build (the drawer regenerates
// its DOM on every page change, which rebuilds this map).
const brandRowActivate = new Map<string, (dir: number) => void>();

/** main.ts's activateSetting() hands BRAND_ROW_PREFIX keys back through here. */
export function activateBrandRow(key: string, dir: number): void {
  brandRowActivate.get(key)?.(dir);
}

const BRAND_SHAPES: { id: LogoShape; label: string }[] = [
  { id: 'rect', label: 'Rectangle' },
  { id: 'rounded-rect', label: 'Rounded Rect' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'half-circle', label: 'Half Circle' },
  { id: 'shield', label: 'Shield' },
  { id: 'none', label: 'None (text only)' },
];

// Display names for the picker. Archivo Black, Outfit and Anton are BUNDLED
// and mapped onto their shipped files when the emblem is painted to canvas
// (logo-renderer's BUNDLED_BRAND_FAMILY). The Google-Fonts @import in
// styles.css that used to be their only source was a network fetch, i.e.
// absent on an offline kiosk boot; it is gone as of 2026-08-06 and every face
// now ships in src/assets.
//
// Bebas Neue is the one still not canvas-safe. It is bundled now, so the DOM
// chrome gets it from disk, but it has no BB-prefixed FontFace registration in
// bundled-fonts.ts and no BUNDLED_BRAND_FAMILY entry — so an emblem that names
// it still paints in whatever the system sans is, silently. Registering it is
// a few lines and the file is already here; it needs a look at the rendered
// emblem before it lands, so it is deliberately NOT bundled into the
// remove-the-@import change.
const BRAND_FONTS = ['Archivo Black', 'Bebas Neue', 'Outfit', 'Anton'];

/**
 * The picker's families: the built-ins plus whatever the installed brand pack
 * declared. A pack face is as safe to name as a bundled one — brand-pack.ts
 * registered it through the same registrar and boot waited on it.
 */
function brandFontChoices(): string[] {
  return [...BRAND_FONTS, ...brandPackFontFamilies()];
}

const BRAND_SUB_QUICKS = ['VIDEO', 'VIDEOS', 'ENTERTAINMENT'];

// Fictional-brand presets: each fills the WHOLE form (every editable field), so
// applying one is a complete identity, not a partial tweak. 'Theme default'
// (spec: null) clears the override entirely. These are invented stores — the
// committed tree ships no recreation of a real chain (that is what a brand pack
// in public/user-assets/brands/ is for).
const BRAND_PRESETS: { label: string; spec: Partial<LogoSpec> | null }[] = [
  { label: 'Theme Default', spec: null },
  {
    label: 'Megahit Video',
    spec: {
      shape: 'rect', tornEdge: true, bodyColor: '#7a1f1f', textColor: '#ffffff',
      borderColor: '#d9a441', innerBorder: true, mainText: 'MEGAHIT', subText: 'VIDEO',
      bandText: '', taglineText: '', fontFamily: 'Archivo Black', fontStyle: 'normal',
      textTilt: 6, textOverflow: false, storefront: { mode: 'emblem', extrudeDepth: 0 },
    },
  },
  {
    label: 'Reel Time',
    spec: {
      shape: 'half-circle', tornEdge: false, bodyColor: '#1e4d2b', textColor: '#f5eeda',
      borderColor: '#f5eeda', innerBorder: true, mainText: 'REEL TIME', subText: 'ENTERTAINMENT',
      bandText: '', taglineText: '', fontFamily: 'Bebas Neue', fontStyle: 'normal',
      textTilt: 0, textOverflow: false, storefront: { mode: 'emblem', extrudeDepth: 0 },
    },
  },
];

// Flat (non-nested) LogoSpec fields the editor can change, for diffing.
const BRAND_DIFF_KEYS = [
  'shape', 'tornEdge', 'bodyColor', 'textColor', 'borderColor', 'innerBorder',
  'mainText', 'subText', 'bandText', 'taglineText', 'fontFamily', 'fontStyle',
  'textTilt', 'textOverflow',
] as const;

function cloneLogoSpec(spec: LogoSpec): LogoSpec {
  return { ...spec, storefront: { ...spec.storefront } };
}

function mergeLogoPartial(base: LogoSpec, partial: Partial<LogoSpec>): LogoSpec {
  return { ...base, ...partial, version: 1, storefront: { ...base.storefront, ...(partial.storefront ?? {}) } };
}

/** Only what differs from the theme default — what bb_logo stores. */
function logoSpecDiff(spec: LogoSpec, base: LogoSpec): Partial<LogoSpec> | null {
  const diff: Record<string, unknown> = {};
  for (const k of BRAND_DIFF_KEYS) {
    if (spec[k] !== base[k]) diff[k] = spec[k];
  }
  const sf: Record<string, unknown> = {};
  if (spec.storefront.mode !== base.storefront.mode) sf.mode = spec.storefront.mode;
  if (spec.storefront.extrudeDepth !== base.storefront.extrudeDepth) sf.extrudeDepth = spec.storefront.extrudeDepth;
  if (Object.keys(sf).length > 0) diff.storefront = sf;
  return Object.keys(diff).length > 0 ? (diff as Partial<LogoSpec>) : null;
}

let brandScratchCtx: CanvasRenderingContext2D | null = null;
/** Normalize any CSS color to #rrggbb for <input type=color>. */
function toHexColor(c: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c.toLowerCase();
  brandScratchCtx ??= document.createElement('canvas').getContext('2d');
  if (!brandScratchCtx) return '#000000';
  brandScratchCtx.fillStyle = '#000000';
  brandScratchCtx.fillStyle = c;
  const v = String(brandScratchCtx.fillStyle);
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : '#000000';
}

/**
 * Build the Store Brand editor into `container` (the page's .settings-group
 * element, after main.ts's Back row). Markup mirrors the drawer's native rows
 * (.settings-row / -label / -hint / -input) so the page reads as one menu.
 */
export function buildStoreBrandPanel(container: HTMLElement, hooks: BrandPanelHooks = {}): void {
  brandRowActivate.clear();

  const themeId = resolveThemeId(getSetting<string>('bb_theme'));
  const baseSpec = DEFAULT_LOGO_SPECS[themeId] ?? DEFAULT_LOGO_SPECS['bb-1990'];
  let working = cloneLogoSpec(getActiveLogoSpec());
  let lastSaved = typeof localStorage !== 'undefined' ? localStorage.getItem('bb_logo') : null;
  const syncFns: (() => void)[] = [];
  const presetButtons: HTMLButtonElement[] = [];

  // ── Live preview (event-driven redraws only — no rAF, no polling) ─────────
  const previewRow = document.createElement('div');
  previewRow.className = 'settings-row settings-brand-preview';
  const previewCanvas = document.createElement('canvas');
  previewCanvas.width = 960;
  previewCanvas.height = 460;
  previewCanvas.className = 'brand-preview-canvas';
  previewRow.appendChild(previewCanvas);
  container.appendChild(previewRow);

  // Redraw again once a newly-selected font family finishes loading (a
  // one-shot promise per font string — event-driven, not a poll).
  const loadedFonts = new Set<string>();
  const ensurePreviewFont = () => {
    const fontStr = getLogoFontString(working, 90);
    if (loadedFonts.has(fontStr) || typeof document.fonts?.load !== 'function') return;
    loadedFonts.add(fontStr);
    document.fonts.load(fontStr, working.mainText || 'ABC').then(() => redrawPreview()).catch(() => {});
  };

  const redrawPreview = () => {
    const ctx = previewCanvas.getContext('2d');
    if (!ctx) return;
    const W = previewCanvas.width;
    const H = previewCanvas.height;
    // Dark fascia backdrop so gold/white lettering reads like it does in-store.
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#1a2029');
    grad.addColorStop(1, '#0c0f14');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    drawLogo(ctx, working, { x: W * 0.05, y: H * 0.05, w: W * 0.9, h: H * 0.9 });
    ensurePreviewFont();
  };

  // ── Shared row plumbing ────────────────────────────────────────────────────
  const setPresetHighlight = (idx: number) => {
    presetButtons.forEach((b, i) => b.classList.toggle('active', i === idx));
  };

  /** Persist the diff; only an actual change dirties the drawer session. */
  const commit = () => {
    const diff = logoSpecDiff(working, baseSpec);
    const next = diff ? JSON.stringify(diff) : null;
    redrawPreview();
    if (next === lastSaved) return;
    if (typeof localStorage !== 'undefined') {
      if (next) localStorage.setItem('bb_logo', next);
      else localStorage.removeItem('bb_logo');
    }
    lastSaved = next;
    hooks.onDirty?.();
  };

  /** Commit from an individual control: no preset claims the result anymore. */
  const commitEdit = () => {
    setPresetHighlight(-1);
    commit();
  };

  const registerRow = (id: string, row: HTMLElement, activate: (dir: number) => void) => {
    const key = BRAND_ROW_PREFIX + id;
    row.id = `setting-row-${key}`;
    brandRowActivate.set(key, activate);
    const index = hooks.registerRow ? hooks.registerRow(key) : -1;
    row.addEventListener('pointerenter', () => {
      if (index >= 0) hooks.selectRow?.(index);
    });
  };

  const makeRowShell = (id: string, label: string, hint: string, activate: (dir: number) => void, tag: 'div' | 'button' = 'div') => {
    const row = document.createElement(tag);
    row.className = 'settings-row settings-brand-row';
    if (tag === 'button') (row as HTMLButtonElement).type = 'button';
    else row.tabIndex = -1; // focusable by setSettingsSelection, not in tab order
    const main = document.createElement('span');
    main.className = 'settings-row-main';
    main.innerHTML = `
      <span class="settings-row-label">${label}</span>
      ${hint ? `<span class="settings-row-hint">${hint}</span>` : ''}
    `;
    row.appendChild(main);
    // Dot leader between the label and whatever control the caller appends —
    // keeps the Store Brand rows on the same rental-receipt line as the rest
    // of the drawer (the hint span above is CSS-hidden; the CRT footer bar
    // reads it for the selected row).
    const leader = document.createElement('span');
    leader.className = 'settings-row-leader';
    leader.setAttribute('aria-hidden', 'true');
    row.appendChild(leader);
    registerRow(id, row, activate);
    container.appendChild(row);
    return row;
  };

  // ── Dropped logo (read-only) ───────────────────────────────────────────────
  // The simple-drop tier has NO setting by design — you put a file in a folder
  // and reload. Which makes this row the only place the store can answer "did
  // it see my logo, and what did it make of it?". A drop that produced no
  // silhouette, or sampled one ink instead of two, looks from the couch exactly
  // like a drop that never happened.
  {
    const drop = brandDropReport();
    const active = brandPackSource() === 'drop';
    const value = document.createElement('span');
    value.className = 'settings-row-value';
    value.textContent = !drop
      ? 'Empty'
      : active ? `${drop.file} — active`
      : `${drop.file} — overridden`;
    const row = makeRowShell(
      'drop', 'Dropped Logo', brandDropDiagnostic(),
      () => { /* read-only: this tier is a folder, not a knob */ },
    );
    row.appendChild(value);
  }

  // ── Brand pack status (read-only) ──────────────────────────────────────────
  // Diagnostic, not a control: the id is typed on the SERVICE MODE page
  // (bb_brand_pack) because it names a directory. What belongs HERE is the
  // answer to "is the pack I installed actually dressing this store?", which
  // is otherwise invisible — a misspelt id looks exactly like no pack at all.
  {
    const id = activeBrandPackId();
    const pack = getBrandPack();
    const status = brandPackStatus();
    const value = document.createElement('span');
    value.className = 'settings-row-value';
    value.textContent = !id
      ? 'None'
      : status === 'loaded' ? `${pack?.displayName ?? pack?.name ?? id} (${id})`
      : status === 'failed' ? `${id} — FAILED`
      : `${id} — not installed`;
    const row = makeRowShell(
      'pack', 'Brand Pack', brandPackDiagnostic(),
      () => { /* read-only: the id is typed on the SERVICE MODE page */ },
    );
    row.appendChild(value);
  }

  // ── Preset strip ───────────────────────────────────────────────────────────
  {
    const row = document.createElement('div');
    row.className = 'settings-row settings-brand-row brand-preset-row';
    row.tabIndex = -1;
    const main = document.createElement('span');
    main.className = 'settings-row-main';
    main.innerHTML = `
      <span class="settings-row-label">Presets</span>
      <span class="settings-row-hint">Theme Default clears your edits. Left/Right cycles.</span>
    `;
    row.appendChild(main);
    const strip = document.createElement('span');
    strip.className = 'brand-preset-strip';
    let applied = -1;
    const applyPreset = (i: number) => {
      applied = i;
      const preset = BRAND_PRESETS[i];
      working = preset.spec ? mergeLogoPartial(baseSpec, preset.spec) : cloneLogoSpec(baseSpec);
      syncFns.forEach((fn) => fn());
      commit();
      setPresetHighlight(i);
    };
    BRAND_PRESETS.forEach((preset, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'brand-preset-btn';
      btn.textContent = preset.label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        applyPreset(i);
      });
      presetButtons.push(btn);
      strip.appendChild(btn);
    });
    row.appendChild(strip);
    registerRow('presets', row, (dir) => {
      applyPreset(((applied < 0 ? (dir > 0 ? -1 : 0) : applied) + dir + BRAND_PRESETS.length) % BRAND_PRESETS.length);
    });
    container.appendChild(row);
  }

  // ── Dropdown rows ──────────────────────────────────────────────────────────
  const makeSelectRow = (
    id: string, label: string, hint: string,
    options: { id: string; label: string }[],
    get: () => string, set: (v: string) => void,
  ) => {
    const select = document.createElement('select');
    select.className = 'settings-row-select';
    select.id = `setting-input-${BRAND_ROW_PREFIX}${id}`;
    const syncOptions = () => {
      select.innerHTML = '';
      const opts = options.slice();
      // Keep an off-menu current value (e.g. the HV theme's serif font stack)
      // selectable rather than silently misreporting it as the first option.
      if (!opts.some((o) => o.id === get())) opts.unshift({ id: get(), label: 'Theme Font' });
      for (const o of opts) {
        const opt = document.createElement('option');
        opt.value = o.id;
        opt.textContent = o.label;
        select.appendChild(opt);
      }
      select.value = get();
    };
    syncOptions();
    select.addEventListener('change', () => {
      set(select.value);
      commitEdit();
    });
    select.addEventListener('click', (e) => e.stopPropagation());
    const activate = (dir: number) => {
      const idx = Math.max(0, Array.from(select.options).findIndex((o) => o.value === get()));
      const next = (idx + dir + select.options.length) % select.options.length;
      select.value = select.options[next].value;
      set(select.value);
      commitEdit();
    };
    const row = makeRowShell(id, label, hint, activate);
    row.appendChild(select);
    row.addEventListener('click', (e) => {
      if (e.target !== select) activate(1);
    });
    syncFns.push(syncOptions);
    return row;
  };

  // ── Toggle rows (native look: yellow On/Off value, whole row flips) ───────
  const makeToggleRow = (id: string, label: string, hint: string, get: () => boolean, set: (v: boolean) => void) => {
    const value = document.createElement('span');
    value.className = 'settings-row-value';
    const sync = () => { value.textContent = get() ? 'On' : 'Off'; };
    sync();
    const activate = () => {
      set(!get());
      sync();
      commitEdit();
    };
    const row = makeRowShell(id, label, hint, activate, 'button');
    row.appendChild(value);
    row.addEventListener('click', activate);
    syncFns.push(sync);
  };

  // ── Color rows ─────────────────────────────────────────────────────────────
  const makeColorRow = (id: string, label: string, hint: string, get: () => string, set: (v: string) => void) => {
    const wrap = document.createElement('span');
    wrap.className = 'brand-color-wrap';
    const hex = document.createElement('span');
    hex.className = 'brand-color-hex';
    const input = document.createElement('input');
    input.type = 'color';
    input.id = `setting-input-${BRAND_ROW_PREFIX}${id}`;
    const sync = () => {
      input.value = toHexColor(get());
      hex.textContent = input.value;
    };
    sync();
    // Live preview while scrubbing the picker; persist on close (change).
    input.addEventListener('input', () => {
      set(input.value);
      hex.textContent = input.value;
      redrawPreview();
    });
    input.addEventListener('change', () => {
      set(input.value);
      commitEdit();
    });
    input.addEventListener('click', (e) => e.stopPropagation());
    wrap.appendChild(hex);
    wrap.appendChild(input);
    // Enter/Right opens the native picker, like activating a text row focuses
    // its input.
    const activate = (_dir?: number) => input.click();
    const row = makeRowShell(id, label, hint, activate);
    row.appendChild(wrap);
    row.addEventListener('click', (e) => {
      if (e.target !== input) activate();
    });
    syncFns.push(sync);
  };

  // ── Text rows (commit on change/blur — mirrors the Connection rows) ───────
  const makeBrandTextRow = (
    id: string, label: string, hint: string,
    get: () => string, set: (v: string) => void,
    datalistId?: string,
  ) => {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'settings-row-input';
    input.id = `setting-input-${BRAND_ROW_PREFIX}${id}`;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = '(none)';
    if (datalistId) input.setAttribute('list', datalistId);
    let committed = get();
    const sync = () => {
      committed = get();
      input.value = committed;
    };
    sync();
    // Keystrokes repaint the preview only; the spec is persisted on commit.
    input.addEventListener('input', () => {
      set(input.value);
      redrawPreview();
    });
    input.addEventListener('change', () => {
      committed = input.value.trim();
      input.value = committed;
      set(committed);
      commitEdit();
    });
    const activate = () => input.focus();
    const row = makeRowShell(id, label, hint, activate);
    row.classList.add('settings-text-row');
    input.addEventListener('keydown', (e) => {
      // Same edit-mode exits as the Connection inputs: Enter commits (via
      // change), Escape reverts; both return focus to the row for remote nav.
      if (e.key === 'Escape') {
        input.value = committed;
        set(committed);
        redrawPreview();
      }
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        input.blur();
        row.focus();
      }
    });
    row.appendChild(input);
    row.addEventListener('click', (e) => {
      if (e.target !== input) input.focus();
    });
    syncFns.push(sync);
  };

  // ── Slider rows ────────────────────────────────────────────────────────────
  const makeSliderRow = (
    id: string, label: string, hint: string,
    min: number, max: number, step: number, navStep: number,
    format: (v: number) => string,
    get: () => number, set: (v: number) => void,
  ) => {
    const wrap = document.createElement('span');
    wrap.className = 'brand-range-wrap';
    const input = document.createElement('input');
    input.type = 'range';
    input.id = `setting-input-${BRAND_ROW_PREFIX}${id}`;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    const readout = document.createElement('span');
    readout.className = 'brand-range-value';
    const sync = () => {
      input.value = String(get());
      readout.textContent = format(get());
    };
    sync();
    input.addEventListener('input', () => {
      set(parseFloat(input.value));
      readout.textContent = format(get());
      redrawPreview();
    });
    input.addEventListener('change', () => commitEdit());
    input.addEventListener('click', (e) => e.stopPropagation());
    const activate = (dir: number) => {
      set(Math.min(max, Math.max(min, get() + dir * navStep)));
      sync();
      commitEdit();
    };
    wrap.appendChild(input);
    wrap.appendChild(readout);
    const row = makeRowShell(id, label, hint, activate);
    row.appendChild(wrap);
    syncFns.push(sync);
  };

  // ── The form ───────────────────────────────────────────────────────────────
  makeSelectRow('shape', 'Emblem Shape', 'The badge behind the wordmark.',
    BRAND_SHAPES, () => working.shape, (v) => { working.shape = v as LogoShape; });

  makeToggleRow('torn', 'Torn Edge', 'Rip the emblem’s right edge, ticket-stub style.',
    () => working.tornEdge, (v) => { working.tornEdge = v; });

  makeColorRow('body', 'Body Color', 'Emblem fill.',
    () => working.bodyColor, (v) => { working.bodyColor = v; });
  makeColorRow('text', 'Text Color', 'Wordmark lettering.',
    () => working.textColor, (v) => { working.textColor = v; });
  makeColorRow('border', 'Border Color', 'Inner pinstripe and 3D sign sides.',
    () => working.borderColor, (v) => { working.borderColor = v; });

  makeBrandTextRow('main', 'Main Text', 'The big wordmark.',
    () => working.mainText, (v) => { working.mainText = v; });

  // Sub text quick-picks (datalist) — the classic "…VIDEO" suffixes.
  const datalistId = 'brand-sub-quicks';
  document.getElementById(datalistId)?.remove();
  const datalist = document.createElement('datalist');
  datalist.id = datalistId;
  for (const q of BRAND_SUB_QUICKS) {
    const opt = document.createElement('option');
    opt.value = q;
    datalist.appendChild(opt);
  }
  container.appendChild(datalist);
  makeBrandTextRow('sub', 'Sub Text', 'Small line under the wordmark — VIDEO, VIDEOS, ENTERTAINMENT…',
    () => working.subText, (v) => { working.subText = v; }, datalistId);

  makeBrandTextRow('band', 'Band Text', 'Rotated side band, e.g. OPEN ALL NIGHT.',
    () => working.bandText, (v) => { working.bandText = v; });
  makeBrandTextRow('tagline', 'Tagline', 'Banner under the emblem.',
    () => working.taglineText, (v) => { working.taglineText = v; });

  makeSelectRow('font', 'Font', 'Wordmark typeface.',
    brandFontChoices().map((f) => ({ id: f, label: f })),
    () => working.fontFamily, (v) => { working.fontFamily = v; });

  makeSliderRow('tilt', 'Text Tilt', 'Classic video-store lean ≈ 4–10°.',
    0, 20, 0.5, 1, (v) => `${(Math.round(v * 10) / 10).toString()}°`,
    () => working.textTilt, (v) => { working.textTilt = v; });

  makeToggleRow('overflow', 'Text Overflow', 'Let the wordmark spill past the emblem edges.',
    () => working.textOverflow, (v) => { working.textOverflow = v; });

  makeSelectRow('sfmode', 'Storefront Sign', 'Emblem board, or channel letters straight on the fascia.',
    [{ id: 'emblem', label: 'Emblem' }, { id: 'letters', label: 'Letters' }],
    () => working.storefront.mode, (v) => { working.storefront.mode = v as 'emblem' | 'letters'; });

  makeSliderRow('sfdepth', 'Sign Extrusion', '3D depth of the storefront sign. 0 = flat.',
    0, 1.5, 0.05, 0.1, (v) => `${v.toFixed(2)} ft`,
    () => working.storefront.extrudeDepth, (v) => { working.storefront.extrudeDepth = v; });

  // ── Custom Wrap (W3): drop-in full box-wrap image, one per medium ─────────
  // For original cases procedural art can't recreate (e.g. a real 2003 DVD
  // cover's film-reel artwork): the user supplies ONE flat wrap image that is
  // cover-fit-normalized to the medium's exact scan canvas, stored as a data
  // URL (bb_wrap_user_<medium>), and rendered by the 'user' cover variant in
  // video-case.ts as final print — no metadata is typed over it.
  {
    const title = document.createElement('div');
    title.className = 'settings-group-title brand-wrap-title';
    title.textContent = 'Custom Wrap';
    container.appendChild(title);

    const spec = document.createElement('p');
    spec.className = 'brand-wrap-spec';
    spec.textContent = 'One image: BACK | SPINE | FRONT, 1024×762 (VHS) / 1024×683 (DVD). Stored in this browser — keep uploads under ~2 MB (they are downscaled to the target canvas before storing).';
    container.appendChild(spec);

    for (const medium of ['vhs', 'dvd'] as CaseMedium[]) makeWrapUploadRow(medium);
  }

  function makeWrapUploadRow(medium: CaseMedium): void {
    const ws = USER_WRAP_SPECS[medium];
    const coverKey = `bb_cover_${medium}`;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/png,image/jpeg';
    fileInput.className = 'brand-wrap-file';
    fileInput.tabIndex = -1;

    const status = document.createElement('span');
    status.className = 'settings-row-value brand-wrap-status';

    const uploadBtn = document.createElement('button');
    uploadBtn.type = 'button';
    uploadBtn.className = 'brand-preset-btn';
    uploadBtn.textContent = 'Upload…';

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'brand-preset-btn brand-wrap-clear';
    clearBtn.textContent = 'Remove';

    const sync = () => {
      const stored = getUserWrap(medium);
      if (stored) {
        const kb = Math.max(1, Math.round(stored.length / 1024));
        const inUse = String(getSetting(coverKey)) === 'user';
        status.textContent = `≈${kb} KB${inUse ? ' · in use' : ''}`;
        clearBtn.style.display = '';
      } else {
        status.textContent = '(none)';
        clearBtn.style.display = 'none';
      }
    };
    sync();
    syncFns.push(sync);

    /** Normalize + persist: cover-fit onto the exact scan canvas, then store
     *  the smallest encoding that fits the ~2 MB practical cap. */
    const applyFile = (file: File) => {
      const objUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objUrl);
        const canvas = document.createElement('canvas');
        canvas.width = ws.w;
        canvas.height = ws.h;
        const ctx = canvas.getContext('2d');
        if (!ctx || !img.naturalWidth) {
          status.textContent = 'Could not read image';
          return;
        }
        // Cover-fit: fill the whole wrap canvas, cropping overflow evenly.
        const scale = Math.max(ws.w / img.naturalWidth, ws.h / img.naturalHeight);
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        ctx.drawImage(img, (ws.w - dw) / 2, (ws.h - dh) / 2, dw, dh);
        const CAP = 2 * 1024 * 1024; // ~2 MB practical localStorage budget
        let best = canvas.toDataURL('image/png');
        for (const q of [0.92, 0.85, 0.75]) {
          const jpeg = canvas.toDataURL('image/jpeg', q);
          if (jpeg.length < best.length) best = jpeg;
          if (best.length <= CAP) break;
        }
        try {
          setUserWrap(medium, best);
        } catch {
          status.textContent = 'Too large to store';
          return;
        }
        // Uploading selects the wrap: the medium's cover pick flips to 'user'
        // and the Store Look row's cycle values now include it.
        setSetting(coverKey, 'user');
        registerCoverVariantSettings();
        sync();
        hooks.onNeedsReload?.();
      };
      img.onerror = () => {
        URL.revokeObjectURL(objUrl);
        status.textContent = 'Could not read image';
      };
      img.src = objUrl;
    };

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      fileInput.value = ''; // re-selecting the same file must re-fire change
      if (file) applyFile(file);
    });

    const clear = () => {
      if (!getUserWrap(medium)) return;
      setUserWrap(medium, null);
      // A pick pointing at the removed upload falls back to the default scan.
      if (String(getSetting(coverKey)) === 'user') {
        setSetting(coverKey, COVER_VARIANTS[medium][0].id);
      }
      registerCoverVariantSettings();
      sync();
      hooks.onNeedsReload?.();
    };

    uploadBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
    clearBtn.addEventListener('click', (e) => { e.stopPropagation(); clear(); });

    // Remote nav: Enter/Right opens the file picker, Left removes the upload.
    const activate = (dir: number) => {
      if (dir < 0) clear();
      else fileInput.click();
    };
    const row = makeRowShell(
      `wrap-${medium}`,
      `${medium.toUpperCase()} Wrap Image`,
      `Your own print on every ${medium.toUpperCase()} rental case — normalized to ${ws.w}×${ws.h}, fold lines at x=${ws.folds[0]} and x=${ws.folds[1]}. PNG or JPEG. Enter uploads; Left removes.`,
      activate,
    );
    const controls = document.createElement('span');
    controls.className = 'brand-wrap-controls';
    controls.appendChild(status);
    controls.appendChild(uploadBtn);
    controls.appendChild(clearBtn);
    controls.appendChild(fileInput);
    row.appendChild(controls);
  }

  // First paint (and a repaint when the app's fonts finish loading, so a
  // freshly-booted drawer doesn't show fallback glyphs — one-shot, no poll).
  redrawPreview();
  document.fonts?.ready?.then(() => redrawPreview()).catch(() => {});
}

// ─── Harness drawer preview (W3, tools/shot.mjs --state settings) ────────────
//
// harness.html has no app DOM, so the screenshot harness builds the drawer
// shell itself and renders a group's rows through here — the same markup
// main.ts's generateSettingsDrawer produces (label/hint/value + option thumb),
// minus interactivity, so `--state settings --title "Store Look"` shows the
// real thumbnail rows. `--title Service` renders the SERVICE MODE roster
// (every hidden row) the same way. `"<group>/<subpage>"` renders a sub-page.
// Returns how many rows carry a thumb (checkpoint gate).
export function buildSettingsGroupPreview(container: HTMLElement, group: SettingGroup | 'Service' | `${SettingGroup}/${string}`): number {
  let thumbed = 0;
  const defs = group === 'Service'
    ? serviceSettings()
    : group.includes('/')
      ? settingsInSubpage(group.split('/')[0] as SettingGroup, group.split('/')[1])
      : settingsInGroup(group as SettingGroup);
  for (const def of defs) {
    if (def.kind === 'text' || def.kind === 'secret') continue;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'settings-row';
    row.id = `setting-row-${def.key}`;
    const rowHint = resolveHint(def);
    if (rowHint) row.dataset.hint = rowHint; // one-line footer-bar hint (CRT chrome)
    row.innerHTML = `
      <span class="settings-row-main">
        <span class="settings-row-label">${def.label}</span>
      </span>
      <span class="settings-row-leader" aria-hidden="true"></span>
      <span class="settings-row-value" id="setting-value-${def.key}">${currentValueLabel(def.key)}</span>
    `;
    const thumb = createSettingThumb(def.key);
    if (thumb) {
      thumb.loading = 'eager'; // screenshots must not race lazy loading
      row.insertBefore(thumb, row.querySelector('.settings-row-value'));
      thumbed++;
    }
    container.appendChild(row);
  }
  return thumbed;
}
