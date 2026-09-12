// Drawer-row plumbing for CUSTOM settings panels.
//
// Most of the settings drawer is generated from the registry (src/settings.ts):
// one row per SettingDef, main.ts walks them. A few pages aren't rows of
// settings at all — the Store Brand editor, the emblem composer — and those
// build their own DOM. They still have to look and behave exactly like the
// generated rows, because from the couch it is ONE menu: same markup, same dot
// leader, same footer hint, same Left/Right-adjusts / Enter-activates contract
// on a remote with no pointer.
//
// This is that contract, once. It started as a stack of closures inside
// buildStoreBrandPanel; the emblem editor needed all of it, and a second copy
// of "how a settings row works" is the kind of duplication that drifts until
// two pages of the same drawer disagree about what Left does.
//
// HOW A PANEL USES IT:
//   const kit = new SettingsRowKit({ container, prefix, hooks, preview, commit });
//   kit.select('shape', 'Emblem Shape', 'The badge behind the wordmark.', OPTS, get, set);
//   ...
//   kit.syncAll();   // after mutating the model behind the controls' backs
//
// Row activation from main.ts's remote nav arrives at activatePanelRow(), which
// routes to whichever panel is currently built — the drawer regenerates its DOM
// on every page change, so exactly one is live at a time.

const HALCYON_BLUE = '#2544ae';
const HALCYON_CREAM = '#f5f5f7';

export interface RowKitHooks {
  /** Add a row to the drawer's flat nav list; returns its selection index. */
  registerRow?: (key: string) => number;
  /** Move the drawer selection to a registered row (pointerenter parity). */
  selectRow?: (index: number) => void;
}

export interface RowKitOpts {
  /** The page's .settings-group element, after main.ts's Back row. */
  container: HTMLElement;
  /** Row-key namespace, e.g. BRAND_ROW_PREFIX. */
  prefix: string;
  hooks?: RowKitHooks;
  /** Repaint the preview WITHOUT persisting — scrubbing a slider, typing. */
  preview: () => void;
  /** Persist and repaint — a committed change. */
  commit: () => void;
}

export interface RowOption { id: string; label: string; fontFamily?: string }

export interface RangeSpec { min: number; max: number; step: number; navStep: number }

// The panel whose rows main.ts is currently driving. Set by the constructor:
// building a panel is what makes it current, and the previous page's DOM is
// already gone by then.
let currentKit: SettingsRowKit | null = null;

/** main.ts's activateSetting() hands custom-panel row keys back through here. */
export function activatePanelRow(key: string, dir: number): void {
  currentKit?.dispatch(key, dir);
}

export class SettingsRowKit {
  private readonly opts: RowKitOpts;
  /**
   * Where the NEXT row gets appended. Starts at opts.container and moves with
   * into(); a single-column panel never touches it.
   */
  private target: HTMLElement;
  private readonly activate = new Map<string, (dir: number) => void>();
  private readonly okOnly = new Set<string>();
  private readonly syncFns: (() => void)[] = [];

  constructor(opts: RowKitOpts) {
    this.opts = opts;
    this.target = opts.container;
    currentKit = this;
  }

  /**
   * Aim the kit at another element, so ONE kit can fill several columns.
   *
   * The drawer's panels are a single column and never call this. The emblem
   * studio is a wide surface whose rows land in three different panels, and it
   * still wants one kit: the kit's registration ORDER is the remote's focus
   * ring, and two kits would mean two dispatch maps and only one of them
   * current (see currentKit above).
   */
  into(el: HTMLElement): void {
    this.target = el;
  }

  /** Re-read every control from the model — after a preset or an undo. */
  syncAll(): void {
    for (const fn of this.syncFns) fn();
  }

  /** -1/+1 are arrows; 0 is OK. Pointer actions call their handler directly. */
  dispatch(key: string, dir: number): void {
    const row = document.getElementById(`setting-row-${key}`);
    if (row?.classList.contains('settings-row-inert')) return;
    if (this.okOnly.has(key) && dir !== 0) return;
    this.activate.get(key)?.(dir || 1);
  }

  private register(id: string, row: HTMLElement, activate: (dir: number) => void): void {
    const key = this.opts.prefix + id;
    row.id = `setting-row-${key}`;
    this.activate.set(key, activate);
    const index = this.opts.hooks?.registerRow ? this.opts.hooks.registerRow(key) : -1;
    row.addEventListener('pointermove', () => {
      if (index >= 0 && !row.classList.contains('selected')) this.opts.hooks?.selectRow?.(index);
    });
  }

  /**
   * The bare row: label, hint and a dot leader, with whatever control the
   * caller appends. The hint span is CSS-hidden — the CRT footer bar reads it
   * for the selected row.
   */
  rowShell(
    id: string, label: string, hint: string,
    activate: (dir: number) => void, tag: 'div' | 'button' = 'div',
  ): HTMLElement {
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
    const leader = document.createElement('span');
    leader.className = 'settings-row-leader';
    leader.setAttribute('aria-hidden', 'true');
    row.appendChild(leader);
    this.register(id, row, activate);
    this.target.appendChild(row);
    return row;
  }

  /**
   * A row that shows a value. Read-only by default (a diagnostic); give it an
   * `activate` and it becomes a STEPPER — a value the remote's Left/Right walk
   * through without a dropdown, which is what a "3 / 7 — Star" layer picker
   * wants to be.
   */
  readout(
    id: string, label: string, hint: string, get: () => string,
    activate?: (dir: number) => void,
  ): HTMLElement {
    const value = document.createElement('span');
    value.className = 'settings-row-value';
    const sync = () => { value.textContent = get(); };
    sync();
    const step = (dir: number) => {
      if (!activate) return;
      activate(dir);
      sync();
    };
    const row = this.rowShell(id, label, hint, step);
    row.appendChild(value);
    if (activate) row.addEventListener('click', () => step(1));
    this.syncFns.push(sync);
    return row;
  }

  /**
   * An action row: Enter/Right runs it, and (when `onBack` is given) Left runs
   * that instead — the drawer's idiom for "do it" / "undo it" on one line.
   */
  action(
    id: string, label: string, hint: string, valueText: string | (() => string),
    onActivate: () => void, onBack?: () => void,
  ): HTMLElement {
    const value = document.createElement('span');
    value.className = 'settings-row-value';
    const sync = () => { value.textContent = typeof valueText === 'function' ? valueText() : valueText; };
    sync();
    this.syncFns.push(sync);
    const activate = (dir: number) => {
      if (dir < 0) onBack?.();
      else onActivate();
    };
    const row = this.rowShell(id, label, hint, activate, 'button');
    row.appendChild(value);
    row.addEventListener('click', () => activate(1));
    return row;
  }

  /** A deliberate action: arrows never run it; OK or a click does. */
  confirmAction(
    id: string, label: string, hint: string, onActivate: () => void,
  ): HTMLElement {
    const row = this.action(id, label, hint, 'OK', onActivate);
    this.okOnly.add(this.opts.prefix + id);
    return row;
  }

  /** Dropdown row. Left/Right step the option list; a real <select> for mice. */
  select(
    id: string, label: string, hint: string,
    options: RowOption[] | (() => RowOption[]),
    get: () => string, set: (v: string) => void, persist = true,
  ): HTMLElement {
    const element = document.createElement('select');
    element.className = 'settings-row-select';
    element.id = `setting-input-${this.opts.prefix}${id}`;
    element.setAttribute('aria-label', label);
    const syncOptions = () => {
      element.innerHTML = '';
      const opts = (typeof options === 'function' ? options() : options).slice();
      // Keep an off-menu current value (e.g. a theme's own serif font stack or custom shape)
      // selectable rather than silently misreporting it as the first option.
      if (!opts.some((o) => o.id === get())) {
        const fallbackLabel = id.includes('font') ? 'Theme Font' : id.includes('shape') ? 'Custom Shape' : 'Custom';
        opts.unshift({ id: get(), label: fallbackLabel });
      }
      for (const o of opts) {
        const opt = document.createElement('option');
        opt.value = o.id;
        opt.textContent = o.label;
        if (o.fontFamily) opt.style.fontFamily = o.fontFamily;
        element.appendChild(opt);
      }
      element.value = get();
      element.style.fontFamily = opts.find((o) => o.id === get())?.fontFamily ?? '';
    };
    syncOptions();
    element.addEventListener('change', () => {
      set(element.value);
      syncOptions();
      if (persist) this.opts.commit();
    });
    element.addEventListener('click', (e) => e.stopPropagation());
    const activate = (dir: number) => {
      const idx = Math.max(0, Array.from(element.options).findIndex((o) => o.value === get()));
      const next = (idx + dir + element.options.length) % element.options.length;
      element.value = element.options[next].value;
      set(element.value);
      syncOptions();
      if (persist) this.opts.commit();
    };
    const row = this.rowShell(id, label, hint, activate);
    row.appendChild(element);
    row.addEventListener('click', (e) => {
      if (e.target !== element) activate(1);
    });
    this.syncFns.push(syncOptions);
    return row;
  }

  /** Toggle row (native look: yellow On/Off value, the whole row flips). */
  toggle(id: string, label: string, hint: string, get: () => boolean, set: (v: boolean) => void): HTMLElement {
    const value = document.createElement('span');
    value.className = 'settings-row-value';
    const sync = () => { value.textContent = get() ? 'On' : 'Off'; };
    sync();
    const activate = () => {
      set(!get());
      sync();
      this.opts.commit();
    };
    const row = this.rowShell(id, label, hint, activate, 'button');
    row.appendChild(value);
    row.addEventListener('click', activate);
    this.syncFns.push(sync);
    return row;
  }

  /** Colour row: hex readout plus the 100-shade palette grid picker. */
  color(id: string, label: string, hint: string, get: () => string, set: (v: string) => void): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'brand-color-wrap';
    const hex = document.createElement('span');
    hex.className = 'brand-color-hex';
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'brand-color-swatch-btn';
    swatch.setAttribute('aria-label', `${label}: choose colour`);
    swatch.id = `setting-input-${this.opts.prefix}${id}`;

    const sync = () => {
      const current = toHexColor(get());
      swatch.style.backgroundColor = current;
      const found = COLOR_GRID_100.find((c) => c.id.toLowerCase() === current.toLowerCase());
      hex.textContent = found ? found.label : current.toUpperCase();
    };
    sync();

    const openPicker = () => {
      const initial = toHexColor(get());
      openColorGridPicker({
        title: label,
        initialColor: initial,
        onPreview: (colorHex) => {
          set(colorHex);
          sync();
          this.opts.preview();
        },
        onSelect: (colorHex) => {
          set(colorHex);
          sync();
          this.opts.commit();
        },
        onCancel: () => {
          set(initial);
          sync();
          this.opts.preview();
        },
      });
    };

    swatch.addEventListener('click', (e) => {
      e.stopPropagation();
      openPicker();
    });

    wrap.appendChild(hex);
    wrap.appendChild(swatch);

    const activate = () => {
      openPicker();
    };

    const row = this.rowShell(id, label, hint, activate);
    row.appendChild(wrap);
    row.addEventListener('click', (e) => {
      if (e.target !== swatch) openPicker();
    });
    this.syncFns.push(sync);
    return row;
  }

  /** Text row — commits on change/blur, mirroring the Connection rows. */
  text(
    id: string, label: string, hint: string,
    get: () => string, set: (v: string) => void,
    datalistId?: string,
  ): HTMLElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('aria-label', label);
    input.className = 'settings-row-input';
    input.id = `setting-input-${this.opts.prefix}${id}`;
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
    // Keystrokes repaint the preview only; the model is persisted on commit.
    input.addEventListener('input', () => {
      set(input.value);
      this.opts.preview();
    });
    input.addEventListener('change', () => {
      committed = input.value.trim();
      input.value = committed;
      set(committed);
      this.opts.commit();
    });
    const activate = () => input.focus();
    const row = this.rowShell(id, label, hint, activate);
    row.classList.add('settings-text-row');
    input.addEventListener('keydown', (e) => {
      // Same edit-mode exits as the Connection inputs: Enter commits (via
      // change), Escape reverts; both return focus to the row for remote nav.
      if (e.key === 'Escape') {
        input.value = committed;
        set(committed);
        this.opts.preview();
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
    this.syncFns.push(sync);
    return row;
  }

  /**
   * Slider row. `navStep` is the jump per remote Left/Right press — a range
   * input's own step is usually far too fine to drive from a couch.
   *
   * The range may be a FUNCTION, for a row whose meaning follows something
   * else on the page (the emblem editor's two kind-specific knobs are a star's
   * point count on one layer and a wedge's sweep on the next). It is re-read
   * on every sync and every keypress, so the row retargets without the panel
   * being torn down and rebuilt under the user's selection.
   */
  slider(
    id: string, label: string, hint: string,
    range: RangeSpec | (() => RangeSpec),
    format: (v: number) => string,
    get: () => number, set: (v: number) => void,
  ): HTMLElement {
    const rangeOf = (): RangeSpec => (typeof range === 'function' ? range() : range);
    const wrap = document.createElement('span');
    wrap.className = 'brand-range-wrap';
    const input = document.createElement('input');
    input.type = 'range';
    input.setAttribute('aria-label', label);
    input.id = `setting-input-${this.opts.prefix}${id}`;
    const readout = document.createElement('span');
    readout.className = 'brand-range-value';
    const sync = () => {
      const r = rangeOf();
      input.min = String(r.min);
      input.max = String(r.max);
      input.step = String(r.step);
      input.value = String(get());
      readout.textContent = format(get());
    };
    sync();
    input.addEventListener('input', () => {
      set(parseFloat(input.value));
      readout.textContent = format(get());
      this.opts.preview();
    });
    input.addEventListener('change', () => this.opts.commit());
    input.addEventListener('click', (e) => e.stopPropagation());
    const activate = (dir: number) => {
      const r = rangeOf();
      set(Math.min(r.max, Math.max(r.min, get() + dir * r.navStep)));
      sync();
      this.opts.commit();
    };
    wrap.appendChild(input);
    wrap.appendChild(readout);
    const row = this.rowShell(id, label, hint, activate);
    row.appendChild(wrap);
    this.syncFns.push(sync);
    return row;
  }

  /** A row of buttons (the preset strip): Left/Right cycles, click picks. */
  strip(
    id: string, label: string, hint: string,
    labels: string[], apply: (index: number) => void,
  ): { setActive: (index: number) => void } {
    const row = document.createElement('div');
    row.className = 'settings-row settings-brand-row brand-preset-row';
    row.tabIndex = -1;
    const main = document.createElement('span');
    main.className = 'settings-row-main';
    main.innerHTML = `
      <span class="settings-row-label">${label}</span>
      ${hint ? `<span class="settings-row-hint">${hint}</span>` : ''}
    `;
    row.appendChild(main);
    const strip = document.createElement('span');
    strip.className = 'brand-preset-strip';
    const buttons: HTMLButtonElement[] = [];
    let applied = -1;
    const setActive = (index: number) => {
      applied = index;
      buttons.forEach((b, i) => b.classList.toggle('active', i === index));
    };
    labels.forEach((text, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'brand-preset-btn';
      btn.textContent = text;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        apply(i);
        setActive(i);
      });
      buttons.push(btn);
      strip.appendChild(btn);
    });
    row.appendChild(strip);
    this.register(id, row, (dir) => {
      const next = ((applied < 0 ? (dir > 0 ? -1 : 0) : applied) + dir + labels.length) % labels.length;
      apply(next);
      setActive(next);
    });
    this.target.appendChild(row);
    return { setActive };
  }
}

/** Retitle a built row — for a control whose meaning follows the selection. */
export function setRowLabel(row: HTMLElement, label: string): void {
  const el = row.querySelector('.settings-row-label');
  if (el) el.textContent = label;
}

/**
 * Grey a row out and make its control inert, WITHOUT removing it from the
 * page. A row that vanishes takes its slot in the drawer's flat nav list with
 * it, and main.ts measures pagination once per build — so the honest way to
 * say "not applicable to what you have selected" is to leave the row where it
 * is and say so.
 */
export function setRowEnabled(row: HTMLElement, enabled: boolean): void {
  row.classList.toggle('settings-row-inert', !enabled);
  row.setAttribute('aria-disabled', String(!enabled));
  if (row instanceof HTMLButtonElement) row.disabled = !enabled;
  for (const el of row.querySelectorAll('input, select, button')) {
    (el as HTMLInputElement).disabled = !enabled;
  }
}

export interface PaletteColor {
  id: string;
  label: string;
}

export const COLOR_GRID_100: PaletteColor[] = [
  // Row 1: Neutrals & Monochromes
  { id: '#ffffff', label: 'Pure White' },
  { id: HALCYON_CREAM, label: 'House White' },
  { id: '#f2e8c9', label: 'Parchment' },
  { id: '#d6b77a', label: 'Sand' },
  { id: '#9e9a8e', label: 'Warm Gray' },
  { id: '#727889', label: 'Slate' },
  { id: '#4a4e5a', label: 'Cool Charcoal' },
  { id: '#302e35', label: 'Charcoal' },
  { id: '#1a1e24', label: 'Midnight Slate' },
  { id: '#000000', label: 'Pure Black' },

  // Row 2: Reds & Crimson
  { id: '#4a151e', label: 'Dark Maroon' },
  { id: '#782f40', label: 'Burgundy' },
  { id: '#8c1d28', label: 'Brick Red' },
  { id: '#a61c2e', label: 'Crimson' },
  { id: '#c92a2a', label: 'Cardinal Red' },
  { id: '#e63946', label: 'Cherry Red' },
  { id: '#ff4d4d', label: 'Bright Red' },
  { id: '#f25f5c', label: 'Coral' },
  { id: '#d16b78', label: 'Dusty Rose' },
  { id: '#fce2e6', label: 'Soft Rose' },

  // Row 3: Oranges & Terracotta
  { id: '#4e200c', label: 'Dark Espresso' },
  { id: '#733211', label: 'Rust' },
  { id: '#b65e3c', label: 'Terracotta' },
  { id: '#c85a17', label: 'Burnt Orange' },
  { id: '#d96b27', label: 'Vintage Orange' },
  { id: '#e85d04', label: 'Tangerine' },
  { id: '#f48c06', label: 'Bright Orange' },
  { id: '#faa307', label: 'Amber' },
  { id: '#ffb703', label: 'Golden Honey' },
  { id: '#ffe3c4', label: 'Peach Cream' },

  // Row 4: Golds & Yellows (includes Classic Rental Yellow & Hollywood Gold)
  { id: '#57410d', label: 'Bronze' },
  { id: '#7d5e13', label: 'Dark Gold' },
  { id: '#a47e1b', label: 'Antique Gold' },
  { id: '#e5a823', label: 'Hollywood Gold' },
  { id: '#e0a91b', label: 'Marigold' },
  { id: '#f6d42a', label: 'Classic Yellow' },
  { id: '#ffd24a', label: 'CRT Gold' },
  { id: '#ffea00', label: 'Lemon Yellow' },
  { id: '#fff176', label: 'Canary' },
  { id: '#fff9c4', label: 'Pale Butter' },

  // Row 5: Lime & Chartreuse
  { id: '#2b3609', label: 'Deep Olive' },
  { id: '#475b0f', label: 'Olive' },
  { id: '#607c14', label: 'Moss Green' },
  { id: '#7c9d18', label: 'Army Olive' },
  { id: '#97c01b', label: 'Chartreuse' },
  { id: '#aacc00', label: 'Lime' },
  { id: '#b5e000', label: 'Bright Lime' },
  { id: '#ccff00', label: 'Electric Lime' },
  { id: '#dcf7a1', label: 'Celery' },
  { id: '#f0fce1', label: 'Honeydew' },

  // Row 6: Forest & Pure Greens
  { id: '#0d2818', label: 'Deep Pine' },
  { id: '#1b4332', label: 'Forest Green' },
  { id: '#234c40', label: 'Evergreen' },
  { id: '#2d6a4f', label: 'Hunter Green' },
  { id: '#40916c', label: 'Emerald' },
  { id: '#52b788', label: 'Jade' },
  { id: '#74c69d', label: 'Mint' },
  { id: '#95d5b2', label: 'Seafoam' },
  { id: '#b7e4c7', label: 'Pale Sage' },
  { id: '#d8f3dc', label: 'Soft Mint' },

  // Row 7: Teals & Cyans (includes Hollywood Teal)
  { id: '#0b252c', label: 'Abyss Teal' },
  { id: '#006666', label: 'Hollywood Teal' },
  { id: '#133e48', label: 'Dark Teal' },
  { id: '#1c5866', label: 'Deep Petrol' },
  { id: '#2a7485', label: 'Sea Glass' },
  { id: '#3890a5', label: 'Ocean Teal' },
  { id: '#48a9c5', label: 'Retro Cyan' },
  { id: '#5bc0eb', label: 'Sky Cyan' },
  { id: '#00e5ff', label: 'Electric Cyan' },
  { id: '#80deea', label: 'Ice Blue' },

  // Row 8: Blues & Navy (includes Classic Video Blue)
  { id: '#001489', label: 'Classic Video Blue' },
  { id: '#0b132b', label: 'Midnight Navy' },
  { id: '#17263e', label: 'Midnight' },
  { id: '#1c3166', label: 'Deep Royal' },
  { id: HALCYON_BLUE, label: 'House Blue' },
  { id: '#3a59d1', label: 'Cobalt' },
  { id: '#4361ee', label: 'Royal Blue' },
  { id: '#5c7cfa', label: 'Periwinkle' },
  { id: '#748ffc', label: 'Cornflower' },
  { id: '#a5d8ff', label: 'Powder Blue' },

  // Row 9: Violets & Purples (includes Hollywood Purple)
  { id: '#1a0c2e', label: 'Dark Night' },
  { id: '#2e1065', label: 'Deep Indigo' },
  { id: '#3d1a56', label: 'Imperial Purple' },
  { id: '#4a154b', label: 'Hollywood Purple' },
  { id: '#561d6e', label: 'Royal Purple' },
  { id: '#7209b7', label: 'Vibrant Violet' },
  { id: '#8f2dda', label: 'Electric Purple' },
  { id: '#a370f7', label: 'Bright Lilac' },
  { id: '#b892ff', label: 'Soft Violet' },
  { id: '#d0bfff', label: 'Lavender' },

  // Row 10: Magentas & Pinks (includes Hollywood Wine & Hollywood Magenta)
  { id: '#3b092b', label: 'Dark Wine' },
  { id: '#660033', label: 'Hollywood Wine' },
  { id: '#800040', label: 'Hollywood Magenta' },
  { id: '#7a1159', label: 'Plum' },
  { id: '#9b1771', label: 'Magenta' },
  { id: '#b5179e', label: 'Vivid Fuchsia' },
  { id: '#d91b8a', label: 'Hot Pink' },
  { id: '#f72585', label: 'Neon Rose' },
  { id: '#ff4d80', label: 'Bubblegum' },
  { id: '#ff85a1', label: 'Carnation Pink' },
];

export const COLOUR_SWATCHES = COLOR_GRID_100;

export interface ColorGridPickerOpts {
  title: string;
  initialColor: string;
  onPreview: (hex: string) => void;
  onSelect: (hex: string) => void;
  onCancel: () => void;
}

/**
 * Open a 100-shade retro color picker grid modal.
 * Supports arrow navigation, hover previews with a prominent large preview square,
 * Select/Enter confirmation, and Cancel/Back/Esc reversion.
 */
export function openColorGridPicker(opts: ColorGridPickerOpts): () => void {
  document.getElementById('color-grid-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'color-grid-overlay';
  overlay.className = 'color-grid-overlay';

  const modal = document.createElement('div');
  modal.className = 'color-grid-modal';

  const header = document.createElement('div');
  header.className = 'color-grid-header';
  const titleSpan = document.createElement('span');
  titleSpan.className = 'color-grid-title';
  titleSpan.textContent = `${opts.title.toUpperCase()} — SELECT COLOUR`;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'color-grid-close-btn';
  closeBtn.innerHTML = '&times;';
  closeBtn.setAttribute('aria-label', 'Close');
  header.appendChild(titleSpan);
  header.appendChild(closeBtn);
  modal.appendChild(header);

  const body = document.createElement('div');
  body.className = 'color-grid-body';

  const swatchesContainer = document.createElement('div');
  swatchesContainer.className = 'color-grid-swatches';
  swatchesContainer.setAttribute('role', 'grid');

  const previewPanel = document.createElement('div');
  previewPanel.className = 'color-grid-preview-panel';

  const previewLabel = document.createElement('span');
  previewLabel.className = 'color-grid-preview-label';
  previewLabel.textContent = 'Preview';

  const largeSquare = document.createElement('div');
  largeSquare.className = 'color-grid-large-square';

  const previewName = document.createElement('div');
  previewName.className = 'color-grid-preview-name';

  const previewHex = document.createElement('div');
  previewHex.className = 'color-grid-preview-hex';

  const comparisonRow = document.createElement('div');
  comparisonRow.className = 'color-grid-comparison-row';
  comparisonRow.innerHTML = `
    <div class="color-grid-comp-item">
      <span class="color-grid-comp-label">ORIGINAL</span>
      <div class="color-grid-comp-swatch" style="background-color: ${toHexColor(opts.initialColor)};"></div>
    </div>
    <div class="color-grid-comp-arrow">&rarr;</div>
    <div class="color-grid-comp-item">
      <span class="color-grid-comp-label">NEW</span>
      <div class="color-grid-comp-swatch color-grid-comp-new" style="background-color: ${toHexColor(opts.initialColor)};"></div>
    </div>
  `;

  previewPanel.appendChild(previewLabel);
  previewPanel.appendChild(largeSquare);
  previewPanel.appendChild(previewName);
  previewPanel.appendChild(previewHex);
  previewPanel.appendChild(comparisonRow);

  body.appendChild(swatchesContainer);
  body.appendChild(previewPanel);
  modal.appendChild(body);

  const footer = document.createElement('div');
  footer.className = 'color-grid-footer';

  const hints = document.createElement('span');
  hints.className = 'color-grid-hints';
  hints.textContent = '◄▲▼► Navigate · OK/Click Select · Esc/Back Cancel';

  const actions = document.createElement('div');
  actions.className = 'color-grid-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'color-grid-btn color-grid-btn-cancel';
  cancelBtn.textContent = 'CANCEL';

  const selectBtn = document.createElement('button');
  selectBtn.type = 'button';
  selectBtn.className = 'color-grid-btn color-grid-btn-select';
  selectBtn.textContent = 'SELECT';

  actions.appendChild(cancelBtn);
  actions.appendChild(selectBtn);
  footer.appendChild(hints);
  footer.appendChild(actions);
  modal.appendChild(footer);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const normalizedInitial = toHexColor(opts.initialColor).toLowerCase();
  let selectedIndex = COLOR_GRID_100.findIndex((c) => c.id.toLowerCase() === normalizedInitial);
  if (selectedIndex < 0) selectedIndex = 0;

  const buttons: HTMLButtonElement[] = [];

  const updatePreview = (idx: number, triggerCallback = true) => {
    selectedIndex = idx;
    const color = COLOR_GRID_100[idx];
    buttons.forEach((btn, i) => {
      btn.classList.toggle('focused', i === idx);
    });
    largeSquare.style.backgroundColor = color.id;
    previewName.textContent = color.label;
    previewHex.textContent = color.id.toUpperCase();
    const newComp = comparisonRow.querySelector('.color-grid-comp-new') as HTMLElement | null;
    if (newComp) newComp.style.backgroundColor = color.id;

    if (triggerCallback) {
      opts.onPreview(color.id);
    }
  };

  COLOR_GRID_100.forEach((color, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'color-grid-cell';
    btn.style.backgroundColor = color.id;
    btn.title = `${color.label} (${color.id})`;
    btn.setAttribute('aria-label', color.label);
    if (color.id.toLowerCase() === normalizedInitial) {
      btn.classList.add('selected-committed');
    }

    btn.addEventListener('pointerenter', () => {
      updatePreview(i, true);
    });

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmSelection(i);
    });

    buttons.push(btn);
    swatchesContainer.appendChild(btn);
  });

  updatePreview(selectedIndex, false);

  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', handleKeyDown, true);
    overlay.remove();
  };

  const cancelSelection = () => {
    cleanup();
    opts.onCancel();
  };

  const confirmSelection = (idx = selectedIndex) => {
    const color = COLOR_GRID_100[idx];
    cleanup();
    opts.onSelect(color.id);
  };

  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    cancelSelection();
  });
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    cancelSelection();
  });
  selectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    confirmSelection();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      cancelSelection();
    }
  });

  const handleKeyDown = (e: KeyboardEvent) => {
    if (closed) return;
    const COLS = 10;
    const ROWS = 10;
    let handled = true;

    if (e.key === 'ArrowLeft') {
      const row = Math.floor(selectedIndex / COLS);
      const col = selectedIndex % COLS;
      const nextCol = (col - 1 + COLS) % COLS;
      updatePreview(row * COLS + nextCol);
    } else if (e.key === 'ArrowRight') {
      const row = Math.floor(selectedIndex / COLS);
      const col = selectedIndex % COLS;
      const nextCol = (col + 1) % COLS;
      updatePreview(row * COLS + nextCol);
    } else if (e.key === 'ArrowUp') {
      const row = Math.floor(selectedIndex / COLS);
      const col = selectedIndex % COLS;
      const nextRow = (row - 1 + ROWS) % ROWS;
      updatePreview(nextRow * COLS + col);
    } else if (e.key === 'ArrowDown') {
      const row = Math.floor(selectedIndex / COLS);
      const col = selectedIndex % COLS;
      const nextRow = (row + 1) % ROWS;
      updatePreview(nextRow * COLS + col);
    } else if (e.key === 'Enter' || e.key === ' ') {
      confirmSelection();
    } else if (e.key === 'Escape' || e.key === 'Backspace') {
      cancelSelection();
    } else {
      handled = false;
    }

    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  window.addEventListener('keydown', handleKeyDown, true);

  return cleanup;
}

let scratchCtx: CanvasRenderingContext2D | null = null;

/** Normalize any CSS colour to #rrggbb. */
export function toHexColor(c: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c.toLowerCase();
  scratchCtx ??= document.createElement('canvas').getContext('2d');
  if (!scratchCtx) return '#000000';
  scratchCtx.fillStyle = '#000000';
  scratchCtx.fillStyle = c;
  const v = String(scratchCtx.fillStyle);
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : '#000000';
}

