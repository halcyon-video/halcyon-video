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

export interface RowOption { id: string; label: string }

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

  dispatch(key: string, dir: number): void {
    this.activate.get(key)?.(dir);
  }

  private register(id: string, row: HTMLElement, activate: (dir: number) => void): void {
    const key = this.opts.prefix + id;
    row.id = `setting-row-${key}`;
    this.activate.set(key, activate);
    const index = this.opts.hooks?.registerRow ? this.opts.hooks.registerRow(key) : -1;
    row.addEventListener('pointerenter', () => {
      if (index >= 0) this.opts.hooks?.selectRow?.(index);
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
    id: string, label: string, hint: string, valueText: string,
    onActivate: () => void, onBack?: () => void,
  ): HTMLElement {
    const value = document.createElement('span');
    value.className = 'settings-row-value';
    value.textContent = valueText;
    const activate = (dir: number) => {
      if (dir < 0 && onBack) onBack();
      else onActivate();
    };
    const row = this.rowShell(id, label, hint, activate, 'button');
    row.appendChild(value);
    row.addEventListener('click', () => activate(1));
    return row;
  }

  /** Dropdown row. Left/Right step the option list; a real <select> for mice. */
  select(
    id: string, label: string, hint: string,
    options: RowOption[] | (() => RowOption[]),
    get: () => string, set: (v: string) => void,
  ): HTMLElement {
    const element = document.createElement('select');
    element.className = 'settings-row-select';
    element.id = `setting-input-${this.opts.prefix}${id}`;
    const syncOptions = () => {
      element.innerHTML = '';
      const opts = (typeof options === 'function' ? options() : options).slice();
      // Keep an off-menu current value (e.g. a theme's own serif font stack)
      // selectable rather than silently misreporting it as the first option.
      if (!opts.some((o) => o.id === get())) opts.unshift({ id: get(), label: 'Theme Font' });
      for (const o of opts) {
        const opt = document.createElement('option');
        opt.value = o.id;
        opt.textContent = o.label;
        element.appendChild(opt);
      }
      element.value = get();
    };
    syncOptions();
    element.addEventListener('change', () => {
      set(element.value);
      this.opts.commit();
    });
    element.addEventListener('click', (e) => e.stopPropagation());
    const activate = (dir: number) => {
      const idx = Math.max(0, Array.from(element.options).findIndex((o) => o.value === get()));
      const next = (idx + dir + element.options.length) % element.options.length;
      element.value = element.options[next].value;
      set(element.value);
      this.opts.commit();
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

  /** Colour row: hex readout plus the native picker. */
  color(id: string, label: string, hint: string, get: () => string, set: (v: string) => void): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'brand-color-wrap';
    const hex = document.createElement('span');
    hex.className = 'brand-color-hex';
    const input = document.createElement('input');
    input.type = 'color';
    input.id = `setting-input-${this.opts.prefix}${id}`;
    const sync = () => {
      input.value = toHexColor(get());
      hex.textContent = input.value;
    };
    sync();
    // Live preview while scrubbing the picker; persist on close (change).
    input.addEventListener('input', () => {
      set(input.value);
      hex.textContent = input.value;
      this.opts.preview();
    });
    input.addEventListener('change', () => {
      set(input.value);
      this.opts.commit();
    });
    input.addEventListener('click', (e) => e.stopPropagation());
    wrap.appendChild(hex);
    wrap.appendChild(input);
    // Enter/Right opens the native picker, like activating a text row focuses
    // its input.
    const activate = () => input.click();
    const row = this.rowShell(id, label, hint, activate);
    row.appendChild(wrap);
    row.addEventListener('click', (e) => {
      if (e.target !== input) activate();
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
  for (const el of row.querySelectorAll('input, select, button')) {
    (el as HTMLInputElement).disabled = !enabled;
  }
}

let scratchCtx: CanvasRenderingContext2D | null = null;

/** Normalize any CSS colour to #rrggbb for <input type=color>. */
export function toHexColor(c: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c.toLowerCase();
  scratchCtx ??= document.createElement('canvas').getContext('2d');
  if (!scratchCtx) return '#000000';
  scratchCtx.fillStyle = '#000000';
  scratchCtx.fillStyle = c;
  const v = String(scratchCtx.fillStyle);
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : '#000000';
}
