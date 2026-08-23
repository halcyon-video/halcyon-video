// THE EMBLEM STUDIO — build the store's logo out of layered primitive shapes.
//
// In the spirit of the emblem editors mid-2000s shooters shipped: stack
// rectangles, ovals, wedges, stars, rings and type; give each one a colour, a
// place and an angle; and the pile flattens into the store's brand.
//
// It used to be a SUB-PAGE OF THE SETTINGS DRAWER — one narrow CRT column of
// rows, eight at a time, so shaping a logo meant paging up and down hunting for
// the control you wanted (#111). It is now its own wide surface: the design
// canvas on the left, the layer stack next to it, the selected layer's WHOLE
// property set beside that, and the emblem-wide settings and actions last. At
// 1080p none of it pages.
//
// TWO INPUT PATHS, NEITHER OF THEM SECOND-CLASS.
//   - MOUSE: click a layer in the stack or a shape on the canvas to select it,
//     drag it to move, pull a handle to scale, turn the stem to rotate; every
//     slider, swatch and dropdown is a real control (src/emblem-canvas.ts).
//   - REMOTE: ▲▼ walk the focus ring, ◄► adjust the focused control, OK
//     activates, Back closes. Every mouse gesture above has a labelled row
//     (src/emblem-controls.ts) — the store still boots on a television.
// This module owns the surface, the session and the focus ring the two share.
//
// WHAT MAKES IT A BRAND RATHER THAN A PICTURE. Two things:
//   - Layers take their colour from the brand's own ink slots (body / text /
//     trim) by default, so switching theme or recolouring the brand moves the
//     emblem with it.
//   - The composition's OUTLINE is the store's physical brand geometry. Flatten
//     an oval and the extruded storefront sign is an oval; punch a hole and the
//     sign has a window. That happens because the flattened outline becomes
//     LogoSpec.pathD (src/emblem-render.ts), and every brand surface already
//     knows how to cut itself to one.
//
// The document is the only thing saved (localStorage `bb_emblem`); everything
// on screen is derived from it. Edits repaint the store's 2D brand surfaces
// live through refreshBrand(); the SHAPE of the sign is geometry rather than a
// texture, so that lands on the close rebuild, the same way a theme change does.
import {
  cloneEmblemDoc, emptyEmblemDoc, EMBLEM_KIND_SPECS, moveEmblemLayer,
} from './emblem-doc';
import type { EmblemDoc, EmblemLayer } from './emblem-doc';
import {
  applyEmblemToSpec, emblemColorsFromSpec, loadEmblemDoc, saveEmblemDoc,
} from './emblem-render';
import { getActiveLogoSpec } from './logo-spec';
import { drawLogo } from './logo-renderer';
import { refreshBrand } from './brand-live';
import { brandString } from './brand-pack';
import { applyThemeCssVars, getActiveTheme } from './themes';
import { SettingsRowKit } from './settings-rows';
import { createEmblemCanvas } from './emblem-canvas';
import type { EmblemCanvasHandle } from './emblem-canvas';
import { buildEmblemControls } from './emblem-controls';
import type { EmblemControls } from './emblem-controls';
import type { EmblemSession } from './emblem-session';

/**
 * Row-key namespace. It nests under the Store Brand prefix for continuity with
 * the drawer page this grew out of; the studio dispatches its own rows, so the
 * prefix is now just a namespace rather than a routing decision.
 */
export const EMBLEM_ROW_PREFIX = '__brand__:emblem/';

/** The stack list and the Done button aren't kit rows — they register by hand. */
const STACK_KEY = `${EMBLEM_ROW_PREFIX}layers`;
const DONE_KEY = `${EMBLEM_ROW_PREFIX}done`;

/** The Store Brand page's door into the studio (see buildEmblemEditorRow). */
export const EMBLEM_OPEN_ROW_KEY = '__brand__:emblem';

export interface EmblemStudioHooks {
  /** The emblem changed in a way the 3D sign geometry must be rebuilt for. */
  onDirty?: () => void;
  /** The studio closed — the caller puts back whatever it opened over. */
  onClose?: () => void;
}

/**
 * The Store Brand page's "Emblem Editor" row — the one door into the studio.
 *
 * Built HERE rather than in settings.ts, and as an ordinary kit action row
 * rather than by hand, because the studio is no longer a drawer sub-page: there
 * is no sub-page key for main.ts to route, so the row has to carry the open
 * itself. Doing it through the kit is also what gives it the click handler and
 * the remote dispatch for free — the hand-built version it replaced had a
 * pointerenter listener and nothing else, so a mouse could highlight it and not
 * open it.
 */
export function buildEmblemEditorRow(
  kit: SettingsRowKit,
  hooks: { onDirty?: () => void; onRefreshPage?: () => void } = {},
): HTMLElement {
  const doc = getActiveLogoSpec().emblem;
  const active = doc && doc.enabled && doc.layers.length > 0;
  return kit.action(
    'emblem', 'Emblem Editor',
    'Build a logo out of layered shapes, ovals, stars and type, on its own wide surface. The shape you make becomes the shape of the store’s signs.',
    active ? `${doc!.layers.length} layers ›` : 'Open ›',
    () => openEmblemStudio({ onDirty: hooks.onDirty, onClose: hooks.onRefreshPage }),
  );
}

const SIGN_PREVIEW_W = 900;
const SIGN_PREVIEW_H = 260;

/**
 * The studio's surface, built on first open rather than parked in index.html
 * with the other overlays.
 *
 * Two reasons it lives here. The screenshot harness (harness.html) has no app
 * DOM at all, so an editor whose markup is only in index.html is an editor no
 * harness state can shoot — and this one has a lot of layout worth shooting.
 * And unlike the drawer, nothing outside this module ever fills these panels,
 * so index.html would be carrying a shell only one file uses.
 *
 * Built once and kept: closing hides it, the way every other CRT surface here
 * behaves, and the `:not(.visible) *` pointer-events guard in styles.css is
 * what makes a hidden one cost nothing.
 */
const STUDIO_MARKUP = `
  <div class="emblem-studio crt-page">
    <header class="crt-titlebar">
      <h2 class="settings-title">Emblem Editor</h2>
      <span class="crt-titlebar-right" id="emblem-studio-brand"></span>
    </header>
    <div class="emblem-studio-body">
      <div class="emblem-studio-grid">
        <section class="emblem-col emblem-col-stage">
          <div class="emblem-panel-title">Design — drag to move, handles to size, stem to rotate</div>
          <div class="emblem-stage" id="emblem-studio-stage"></div>
          <div class="emblem-panel-title">On the store's sign</div>
          <canvas class="emblem-sign-canvas" id="emblem-studio-sign"></canvas>
        </section>
        <section class="emblem-col emblem-col-layers">
          <div class="emblem-panel-title">Layers — top first</div>
          <div class="settings-row emblem-stack-row">
            <span class="settings-row-hint">Which layer the properties edit. Left/Right steps the pile; or click an entry, or click the shape itself.</span>
            <div class="emblem-stack" id="emblem-studio-stack"></div>
          </div>
          <div class="emblem-rows" id="emblem-studio-layer-ops"></div>
        </section>
        <section class="emblem-col emblem-col-props">
          <div class="emblem-panel-title">Selected shape</div>
          <div class="emblem-rows" id="emblem-studio-props"></div>
        </section>
        <section class="emblem-col emblem-col-meta">
          <div class="emblem-panel-title">The emblem</div>
          <div class="emblem-rows" id="emblem-studio-doc"></div>
          <div class="emblem-panel-title">Whole composition</div>
          <div class="emblem-rows" id="emblem-studio-actions"></div>
        </section>
      </div>
      <p class="crt-status emblem-studio-status" id="emblem-studio-status"></p>
    </div>
    <footer class="crt-footer">
      <span class="crt-footer-hint" id="emblem-studio-hint"></span>
      <span class="crt-footer-page">&#9650;&#9660; Focus &nbsp;&#8226;&nbsp; &#9668;&#9658; Adjust &nbsp;&#8226;&nbsp; Back closes</span>
    </footer>
  </div>`;

/** The overlay element, created on first use. */
function studioOverlay(): HTMLElement {
  let overlay = document.getElementById('emblem-studio-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'emblem-studio-overlay';
    overlay.innerHTML = STUDIO_MARKUP;
    document.body.appendChild(overlay);
    // Never a hardcoded house name: an installed brand pack renames every CRT
    // title bar in the app, and this one is not the exception.
    const brand = overlay.querySelector('#emblem-studio-brand');
    if (brand) brand.textContent = brandString('app-titlebar-brand', 'HALCYON VIDEO');
  }
  return overlay;
}

interface StudioState {
  hooks: EmblemStudioHooks;
  overlay: HTMLElement;
  session: EmblemSession;
  kit: SettingsRowKit;
  controls: EmblemControls;
  design: EmblemCanvasHandle;
  signCanvas: HTMLCanvasElement;
  stackEl: HTMLElement;
  stackRow: HTMLElement;
  statusEl: HTMLElement | null;
  hintEl: HTMLElement | null;
  rowKeys: string[];
  index: number;
  lastSaved: string;
  resizeObserver: ResizeObserver | null;
  redrawPending: number;
}

let studio: StudioState | null = null;

export function isEmblemStudioOpen(): boolean {
  return studio !== null;
}

// ─── Opening ─────────────────────────────────────────────────────────────────

/**
 * Open the studio over whatever is on screen. The caller owns the key routing
 * (main.ts's input ladder) and gets `onClose` when Back or Done lands.
 */
export function openEmblemStudio(hooks: EmblemStudioHooks = {}): void {
  if (studio) return;
  const overlay = studioOverlay();

  // Cloned: loadEmblemDoc memoizes and hands every caller the same object, and
  // this one gets mutated on every keystroke and every pointer sample.
  const saved = loadEmblemDoc();
  const working: EmblemDoc = saved ? cloneEmblemDoc(saved) : emptyEmblemDoc();

  const stageEl = requireEl('emblem-studio-stage');
  const stackEl = requireEl('emblem-studio-stack');
  // By CLASS, not by id: buildStackRow renames this element to its row key so
  // the focus ring can find it like any other row, which means a lookup by the
  // markup's id works exactly once and every REOPEN bails out silently.
  const stackRow = overlay.querySelector<HTMLElement>('.emblem-stack-row');
  const layerOpsEl = requireEl('emblem-studio-layer-ops');
  const propsEl = requireEl('emblem-studio-props');
  const docEl = requireEl('emblem-studio-doc');
  const actionsEl = requireEl('emblem-studio-actions');
  const signCanvas = document.getElementById('emblem-studio-sign') as HTMLCanvasElement | null;
  if (!stageEl || !stackEl || !stackRow || !layerOpsEl || !propsEl || !docEl || !actionsEl || !signCanvas) return;

  // Fresh DOM on every open: the studio is built, not refreshed, so nothing
  // from a previous session's document can survive in a control.
  for (const el of [stackEl, layerOpsEl, propsEl, docEl, actionsEl]) el.innerHTML = '';
  stageEl.querySelector('.emblem-design-canvas')?.remove();

  const session: EmblemSession = {
    doc: working,
    selected: Math.max(0, working.layers.length - 1),
    layer(): EmblemLayer | null { return this.doc.layers[this.selected] ?? null; },
    select(index: number) {
      const s = studio;
      if (!s) return;
      s.session.selected = Math.min(Math.max(0, index), Math.max(0, s.session.doc.layers.length - 1));
      s.kit.syncAll();
      s.controls.syncEnablement();
      renderStack();
      requestRedraw();
    },
    preview() { requestRedraw(); },
    commit() { commit(); },
    restructure() {
      const s = studio;
      if (!s) return;
      s.session.selected = Math.min(
        Math.max(0, s.session.selected), Math.max(0, s.session.doc.layers.length - 1),
      );
      s.kit.syncAll();
      s.controls.syncEnablement();
      renderStack();
      commit();
    },
  };

  const rowKeys: string[] = [];
  const kit = new SettingsRowKit({
    container: layerOpsEl,
    prefix: EMBLEM_ROW_PREFIX,
    hooks: {
      registerRow: (key) => { rowKeys.push(key); return rowKeys.length - 1; },
      selectRow: (idx) => setStudioSelection(idx),
    },
    preview: () => requestRedraw(),
    commit: () => commit(),
  });

  const design = createEmblemCanvas(session, stageEl);

  studio = {
    hooks,
    overlay,
    session,
    kit,
    // Filled in immediately below — the controls need the studio to exist first,
    // because their callbacks reach back through it.
    controls: null as unknown as EmblemControls,
    design,
    signCanvas,
    stackEl,
    stackRow,
    statusEl: document.getElementById('emblem-studio-status'),
    hintEl: document.getElementById('emblem-studio-hint'),
    rowKeys,
    index: 0,
    lastSaved: JSON.stringify(loadEmblemDoc()),
    resizeObserver: null,
    redrawPending: 0,
  };

  // THE FOCUS RING IS BUILD ORDER, and build order is the surface's reading
  // order: the stack, then what you do to the stack, then the selected layer's
  // properties, then the emblem as a whole, then the actions. Registering out
  // of order would make ▼ jump around a screen where everything is visible.
  buildStackRow();
  studio.controls = buildEmblemControls(
    kit, session,
    { layerOps: layerOpsEl, props: propsEl, doc: docEl, actions: actionsEl },
    () => renderStack(),
  );
  buildDoneRow(actionsEl);

  studio.controls.syncEnablement();
  renderStack();
  redraw();

  overlay.classList.add('visible');
  overlay.addEventListener('keydown', onStudioKeydown, true);
  // The design canvas has no size until the overlay is laid out, and a canvas
  // measured at zero draws nothing. Redraw once the browser has done the layout,
  // and on every later resize.
  requestAnimationFrame(() => redraw());
  if (typeof ResizeObserver !== 'undefined') {
    studio.resizeObserver = new ResizeObserver(() => {
      // A resize mid-drag would move the geometry under the pointer.
      if (!studio?.design.isDragging()) requestRedraw();
    });
    studio.resizeObserver.observe(stageEl);
  }
  // A face picked for a text layer may still be decoding on a cold open;
  // repaint once when the app's fonts settle (one-shot, no polling).
  document.fonts?.ready?.then(() => requestRedraw()).catch(() => {});

  // Land on the stack, never on Start From: Right on that row replaces the whole
  // composition, and an editor that opens with its destructive control armed is
  // an editor people lose work in.
  setStudioSelection(0);

  // Verification hook, in the house style of window.__gameDept / __promoStands:
  // the document under edit, the focus ring, and where a pointer has to aim to
  // grab the selected layer's handles (tools/verify_emblem_studio.mjs).
  (window as unknown as Record<string, unknown>).__emblemStudio = {
    doc: () => studio?.session.doc ?? null,
    selected: () => studio?.session.selected ?? -1,
    rows: () => studio?.rowKeys.slice() ?? [],
    focused: () => studio?.rowKeys[studio.index] ?? null,
    probe: () => studio?.design.probe() ?? null,
  };
}

function requireEl(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

export function closeEmblemStudio(): void {
  const s = studio;
  if (!s) return;
  if (s.redrawPending) cancelAnimationFrame(s.redrawPending);
  s.resizeObserver?.disconnect();
  s.design.dispose();
  s.overlay.removeEventListener('keydown', onStudioKeydown, true);
  delete (window as unknown as Record<string, unknown>).__emblemStudio;
  s.overlay.classList.remove('visible');
  studio = null;
  s.hooks.onClose?.();
}

// ─── Persist and repaint ─────────────────────────────────────────────────────

// Coalesced to one repaint per frame. A redraw re-flattens the composition (a
// 640-pixel mask trace) and re-renders the art, which is cheap but not free —
// and a slider drag or a pointer drag fires faster than that. This is NOT a
// render loop: nothing is scheduled unless an edit asked for a repaint.
function requestRedraw(): void {
  const s = studio;
  if (!s || s.redrawPending) return;
  s.redrawPending = requestAnimationFrame(() => {
    if (studio) studio.redrawPending = 0;
    redraw();
  });
}

function redraw(): void {
  const s = studio;
  if (!s) return;
  s.design.redraw();
  drawSignPreview(s);
  if (s.statusEl) s.statusEl.textContent = s.controls.statusText();
}

/** The active brand with the WORKING doc folded in, outline fields and all. */
function previewSpec(s: StudioState) {
  return applyEmblemToSpec({ ...getActiveLogoSpec(), emblem: s.session.doc });
}

/**
 * The emblem the way a brand surface paints it, through the REAL painter
 * (drawLogo on a spec with this document folded in). Not a mock-up: this is the
 * same call the storefront board makes, which is what makes it worth the space.
 */
function drawSignPreview(s: StudioState): void {
  const canvas = s.signCanvas;
  if (canvas.width !== SIGN_PREVIEW_W) canvas.width = SIGN_PREVIEW_W;
  if (canvas.height !== SIGN_PREVIEW_H) canvas.height = SIGN_PREVIEW_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, SIGN_PREVIEW_W, SIGN_PREVIEW_H);
  const grad = ctx.createLinearGradient(0, 0, 0, SIGN_PREVIEW_H);
  grad.addColorStop(0, '#1a2029');
  grad.addColorStop(1, '#0c0f14');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIGN_PREVIEW_W, SIGN_PREVIEW_H);
  drawLogo(ctx, previewSpec(s), {
    x: SIGN_PREVIEW_W * 0.04, y: SIGN_PREVIEW_H * 0.07,
    w: SIGN_PREVIEW_W * 0.92, h: SIGN_PREVIEW_H * 0.86,
  });
}

function commit(): void {
  const s = studio;
  if (!s) return;
  requestRedraw();
  const next = JSON.stringify(s.session.doc);
  if (next === s.lastSaved) return;
  // An emblem with no layers is not an emblem: clear the key rather than leave
  // an empty document behind for the brand chain to resolve.
  saveEmblemDoc(s.session.doc.layers.length ? s.session.doc : null);
  s.lastSaved = next;
  // --bb-knockout and friends derive from the emblem's ink, so the DOM chrome
  // has to be re-published alongside the 3D surfaces.
  applyThemeCssVars(getActiveTheme());
  refreshBrand();
  // The SIGN's silhouette is geometry, not a texture — an extruded storefront
  // emblem is rebuilt, not repainted. Same close-time rebuild the theme row asks
  // for.
  s.hooks.onDirty?.();
}

// ─── The layer stack ─────────────────────────────────────────────────────────

/**
 * The stack is ONE focus stop, not one per layer. ◄► step it (which is the
 * remote's layer picker), and every entry is separately clickable for a mouse —
 * so both paths reach every layer without the ring growing with the document.
 */
function buildStackRow(): void {
  const s = studio;
  if (!s) return;
  s.stackRow.id = `setting-row-${STACK_KEY}`;
  s.stackRow.tabIndex = -1;
  s.rowKeys.push(STACK_KEY);
  const index = s.rowKeys.length - 1;
  s.stackRow.addEventListener('pointerenter', () => setStudioSelection(index));
}

/** Step the selection through the stack — the stack row's ◄► behaviour. */
function stepStack(dir: number): void {
  const s = studio;
  if (!s || !s.session.doc.layers.length) return;
  const n = s.session.doc.layers.length;
  // The list reads TOP LAYER FIRST, so ▲-ish directions have to agree with it:
  // Right steps DOWN the printed list, which is DOWN the stack.
  s.session.select((s.session.selected - dir + n) % n);
}

function renderStack(): void {
  const s = studio;
  if (!s) return;
  const { layers } = s.session.doc;
  s.stackEl.innerHTML = '';
  if (!layers.length) {
    const empty = document.createElement('p');
    empty.className = 'emblem-stack-empty';
    empty.textContent = 'No layers yet — Add Shape below, or pick a Start From.';
    s.stackEl.appendChild(empty);
    return;
  }
  const colors = emblemColorsFromSpec(getActiveLogoSpec());
  // Printed top-of-the-pile first, the way every layer stack a person has ever
  // used reads. The array itself is bottom-first (paint order), so this walks
  // it backwards rather than reversing it — the indices below are real ones.
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    const item = document.createElement('div');
    item.className = 'emblem-stack-item';
    if (i === s.session.selected) item.classList.add('active');

    const swatch = document.createElement('span');
    swatch.className = 'emblem-stack-swatch';
    swatch.style.background = layer.ink === 'custom' ? layer.color
      : layer.ink === 'text' ? colors.text
        : layer.ink === 'border' ? colors.border : colors.body;
    if (layer.role === 'hole') swatch.classList.add('is-hole');
    item.appendChild(swatch);

    const name = document.createElement('span');
    name.className = 'emblem-stack-name';
    const label = EMBLEM_KIND_SPECS[layer.kind].label;
    name.textContent = layer.kind === 'text' && layer.text ? `${label} “${layer.text}”` : label;
    item.appendChild(name);

    const role = document.createElement('span');
    role.className = 'emblem-stack-role';
    role.textContent = layer.role === 'solid' ? 'SHAPE' : layer.role === 'hole' ? 'HOLE' : 'INK';
    item.appendChild(role);

    // Reorder and delete, for the pointer. The remote reaches all three through
    // the Move In Stack / Duplicate-Delete rows below the list.
    const ops = document.createElement('span');
    ops.className = 'emblem-stack-ops';
    ops.appendChild(stackOpButton('▲', 'Bring forward', i, 'up'));
    ops.appendChild(stackOpButton('▼', 'Send back', i, 'down'));
    ops.appendChild(stackOpButton('✕', 'Delete layer', i, 'delete'));
    item.appendChild(ops);

    item.addEventListener('click', () => {
      s.session.select(i);
      setStudioSelection(s.rowKeys.indexOf(STACK_KEY));
    });
    s.stackEl.appendChild(item);
  }
  // Keep the selected entry in view on a long stack — the list scrolls, the
  // studio does not page.
  s.stackEl.querySelector('.emblem-stack-item.active')?.scrollIntoView({ block: 'nearest' });
}

function stackOpButton(glyph: string, title: string, index: number, op: 'up' | 'down' | 'delete'): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'emblem-stack-op';
  btn.textContent = glyph;
  btn.title = title;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const s = studio;
    if (!s) return;
    const doc = s.session.doc;
    if (op === 'delete') {
      doc.layers.splice(index, 1);
      s.session.selected = Math.max(0, Math.min(s.session.selected, doc.layers.length - 1));
    } else {
      // Reordering a layer that isn't selected must not steal the selection —
      // the property column would silently start editing something else.
      const wasSelected = s.session.selected === index;
      const moved = moveEmblemLayer(doc, index, op === 'up' ? 1 : -1);
      if (wasSelected) s.session.selected = moved;
    }
    s.session.restructure();
  });
  return btn;
}

// ─── Done ────────────────────────────────────────────────────────────────────

function buildDoneRow(container: HTMLElement): void {
  const s = studio;
  if (!s) return;
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'settings-row settings-brand-row';
  row.id = `setting-row-${DONE_KEY}`;
  row.innerHTML = `
    <span class="settings-row-main">
      <span class="settings-row-label">Done</span>
      <span class="settings-row-hint">Close the editor. Everything here saves as you go.</span>
    </span>
    <span class="settings-row-leader" aria-hidden="true"></span>
    <span class="settings-row-value">Enter</span>
  `;
  s.rowKeys.push(DONE_KEY);
  const index = s.rowKeys.length - 1;
  row.addEventListener('pointerenter', () => setStudioSelection(index));
  row.addEventListener('click', () => closeEmblemStudio());
  container.appendChild(row);
}

// ─── The focus ring ──────────────────────────────────────────────────────────

function studioRowEl(key: string): HTMLElement | null {
  return document.getElementById(`setting-row-${key}`);
}

function setStudioSelection(index: number): void {
  const s = studio;
  if (!s || !s.rowKeys.length) return;
  s.index = ((index % s.rowKeys.length) + s.rowKeys.length) % s.rowKeys.length;
  s.rowKeys.forEach((key, i) => {
    const el = studioRowEl(key);
    if (!el) return;
    if (i === s.index) {
      el.classList.add('selected');
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: 'nearest' });
    } else {
      el.classList.remove('selected');
    }
  });
  if (s.hintEl) {
    const el = studioRowEl(s.rowKeys[s.index]);
    s.hintEl.textContent = el?.querySelector('.settings-row-hint')?.textContent?.trim() ?? '';
  }
}

/**
 * Escape hands the keyboard back from an embedded control to the focus ring.
 *
 * This surface is the one place the two input paths really do mix: you click a
 * slider or open a dropdown with a mouse, and from that moment the control owns
 * the keyboard (InputManager stands down for any focused field, by design —
 * see text-entry-focus.ts), so the arrows adjust it and Back cannot close the
 * studio. Moving the pointer to another row already frees it, but that is not a
 * way OUT that anyone would find. Escape is.
 *
 * Capture phase, and only for a control inside this overlay: the keypress that
 * discovers the problem is the one that fixes it, and it never reaches
 * InputManager as a second Back.
 */
function onStudioKeydown(e: KeyboardEvent): void {
  const s = studio;
  if (!s || (e.key !== 'Escape' && e.key !== 'Backspace')) return;
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body || !s.overlay.contains(el)) return;
  if (!/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
  e.preventDefault();
  e.stopPropagation();
  el.blur();
  setStudioSelection(s.index);
}

/** ▲▼ — walk the ring. */
export function emblemStudioMove(delta: number): void {
  if (!studio) return;
  setStudioSelection(studio.index + delta);
}

/** ◄ ► OK — adjust or run the focused control. `dir` is +1 or -1. */
export function emblemStudioActivate(dir: number): void {
  const s = studio;
  if (!s) return;
  const key = s.rowKeys[s.index];
  if (key === STACK_KEY) { stepStack(dir); return; }
  if (key === DONE_KEY) {
    if (dir > 0) closeEmblemStudio();
    return;
  }
  s.kit.dispatch(key, dir);
}

/** Back — the studio is one level, so Back always closes it. */
export function emblemStudioBack(): void {
  closeEmblemStudio();
}
