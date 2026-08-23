// The EMBLEM EDITOR — build the store's logo out of layered primitive shapes.
//
// A sub-page of the Store Brand drawer page, in the spirit of the emblem
// editors mid-2000s shooters shipped: stack rectangles, ovals, wedges, stars,
// rings and type; give each one a colour, a place and an angle; and the pile
// flattens into the store's brand. It is deliberately NOT a canvas you drag
// things around on — the store is driven from a couch with five buttons, so
// every property is a drawer row that Left/Right adjusts, and the preview at
// the top shows what the pile currently is.
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
// texture, so that lands on the drawer-close rebuild, the same way a theme
// change does.
import {
  cloneEmblemDoc, defaultEmblemLayer, emblemDocActive, emptyEmblemDoc,
  EMBLEM_KIND_SPECS, EMBLEM_KINDS, EMBLEM_STARTERS, moveEmblemLayer, newLayerId,
} from './emblem-doc';
import type { EmblemDoc, EmblemInk, EmblemLayer, EmblemLayerKind, EmblemRole } from './emblem-doc';
import {
  applyEmblemToSpec, emblemArtCanvas, emblemColorsFromSpec, emblemPngBlob,
  emblemSilhouette, loadEmblemDoc, saveEmblemDoc,
} from './emblem-render';
import { getActiveLogoSpec } from './logo-spec';
import { drawLogo } from './logo-renderer';
import { refreshBrand } from './brand-live';
import { applyThemeCssVars, getActiveTheme } from './themes';
import { SettingsRowKit, setRowEnabled, setRowLabel } from './settings-rows';
import type { RangeSpec, RowKitHooks } from './settings-rows';
import { brandFontChoices } from './settings';

/**
 * Row-key namespace. It nests under the Store Brand prefix on purpose: main.ts
 * already routes that prefix back through activateBrandRow, so the editor
 * joins the drawer's remote navigation without a second routing branch.
 */
export const EMBLEM_ROW_PREFIX = '__brand__:emblem/';

export interface EmblemPanelHooks extends RowKitHooks {
  /** The emblem changed in a way the 3D sign geometry must be rebuilt for. */
  onDirty?: () => void;
}

const PREVIEW_W = 960;
const PREVIEW_H = 420;
// Where the checkerboard "what you built" pane ends and the "on the store's
// sign" pane begins. Two panes, because the two questions a person actually
// has here are "is the empty space empty?" and "what will the sign look like?".
const PREVIEW_SPLIT = 0.55;
const CHECKER = 16;

const ROLE_OPTIONS = [
  { id: 'solid', label: 'Solid part' },
  { id: 'hole', label: 'Cut-out hole' },
  { id: 'ink', label: 'Printed on it' },
];

const INK_OPTIONS = [
  { id: 'body', label: 'Brand Body' },
  { id: 'text', label: 'Brand Text' },
  { id: 'border', label: 'Brand Trim' },
  { id: 'custom', label: 'Custom…' },
];

/** Build the emblem editor into `container` (after main.ts's Back row). */
export function buildEmblemEditorPanel(container: HTMLElement, hooks: EmblemPanelHooks = {}): void {
  // Cloned: loadEmblemDoc memoizes and hands every caller the same object, and
  // this one gets mutated on every keystroke.
  const saved = loadEmblemDoc();
  let working: EmblemDoc = saved ? cloneEmblemDoc(saved) : emptyEmblemDoc();
  let selected = Math.max(0, working.layers.length - 1);
  // The last composition something threw away — Clear Emblem, or a Start From
  // that replaced it — so Left on the Clear row can put it back for as long as
  // the page is open. Losing a logo you spent an hour on to one press of OK,
  // with no way back, is not a thing this store should do.
  let replaced: EmblemDoc | null = null;
  let lastSaved = JSON.stringify(loadEmblemDoc());

  const layer = (): EmblemLayer | null => working.layers[selected] ?? null;
  const kindSpec = () => EMBLEM_KIND_SPECS[layer()?.kind ?? 'rect'];

  /** The honest one-liner: what the store is actually wearing right now. */
  const statusText = (): string => {
    const n = working.layers.length;
    if (!n) return 'Empty';
    if (!working.enabled) return `${n} layers — not in use`;
    if (!emblemDocActive(working)) return `${n} layers — no solid part`;
    const sil = emblemSilhouette(working);
    return sil ? `${n} layers — ${sil.aspect.toFixed(2)}:1 outline` : `${n} layers`;
  };

  // ── Preview ───────────────────────────────────────────────────────────────
  const previewRow = document.createElement('div');
  previewRow.className = 'settings-row settings-brand-preview';
  const canvas = document.createElement('canvas');
  canvas.width = PREVIEW_W;
  canvas.height = PREVIEW_H;
  canvas.className = 'brand-preview-canvas';
  previewRow.appendChild(canvas);
  container.appendChild(previewRow);

  /**
   * Pane 1 — the design canvas on a transparency checkerboard, with the
   * selected layer ringed. This is the pane that answers "does empty space
   * stay empty", which is the whole point of flattening with real alpha.
   */
  const drawCanvasPane = (ctx: CanvasRenderingContext2D, px: number, py: number, pw: number, ph: number) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();
    ctx.fillStyle = '#0c0f14';
    ctx.fillRect(px, py, pw, ph);

    // The design box, contain-fitted with a margin.
    const pad = 22;
    const availW = pw - pad * 2;
    const availH = ph - pad * 2;
    const aspect = Math.max(0.05, working.aspect);
    const wide = availW / availH > aspect;
    const dw = wide ? availH * aspect : availW;
    const dh = wide ? availH : availW / aspect;
    const dx = px + (pw - dw) / 2;
    const dy = py + (ph - dh) / 2;

    // Checkerboard: the universal "this is transparent" cue.
    for (let y = 0; y < dh; y += CHECKER) {
      for (let x = 0; x < dw; x += CHECKER) {
        ctx.fillStyle = ((x / CHECKER + y / CHECKER) & 1) ? '#2a3038' : '#20252c';
        ctx.fillRect(dx + x, dy + y, Math.min(CHECKER, dw - x), Math.min(CHECKER, dh - y));
      }
    }

    const sil = emblemSilhouette(working);
    if (sil) {
      const art = emblemArtCanvas(
        working, emblemColorsFromSpec(getActiveLogoSpec()),
        Math.round(sil.bbox.w * dw), Math.round(sil.bbox.h * dh),
      );
      if (art) ctx.drawImage(art, dx + sil.bbox.x * dw, dy + sil.bbox.y * dh, sil.bbox.w * dw, sil.bbox.h * dh);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Add a shape to begin', dx + dw / 2, dy + dh / 2);
    }

    // Canvas edge, then the selected layer's box.
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeRect(dx + 0.5, dy + 0.5, dw - 1, dh - 1);
    const sel = layer();
    if (sel) {
      ctx.save();
      ctx.translate(dx + sel.cx * dw, dy + sel.cy * dh);
      ctx.rotate((sel.rot * Math.PI) / 180);
      ctx.strokeStyle = getActiveLogoSpec().textColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.strokeRect(-(sel.w * dw) / 2, -(sel.h * dh) / 2, sel.w * dw, sel.h * dh);
      ctx.restore();
    }
    ctx.restore();
  };

  /** The active brand with the WORKING doc folded in, outline fields and all. */
  const previewSpec = () => applyEmblemToSpec({ ...getActiveLogoSpec(), emblem: working });

  /**
   * Pane 2 — the emblem the way a brand surface paints it, through the REAL
   * painter (drawLogo on a spec with this doc folded in). Not a mock-up: this
   * is the same call the storefront board makes.
   */
  const drawSignPane = (ctx: CanvasRenderingContext2D, px: number, py: number, pw: number, ph: number) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();
    const grad = ctx.createLinearGradient(px, py, px, py + ph);
    grad.addColorStop(0, '#1a2029');
    grad.addColorStop(1, '#0c0f14');
    ctx.fillStyle = grad;
    ctx.fillRect(px, py, pw, ph);
    drawLogo(ctx, previewSpec(), { x: px + pw * 0.04, y: py + ph * 0.06, w: pw * 0.92, h: ph * 0.88 });
    ctx.restore();
  };

  // Coalesced to one repaint per frame. A redraw re-flattens the composition
  // (a 640-pixel mask trace) and re-renders the art, which is cheap but not
  // free — and a slider drag fires input events faster than that. This is NOT
  // a render loop: nothing is scheduled unless an edit asked for a repaint.
  let redrawPending = 0;
  const requestRedraw = () => {
    if (redrawPending) return;
    redrawPending = requestAnimationFrame(() => {
      redrawPending = 0;
      redraw();
    });
  };

  const redraw = () => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H);
    const splitX = Math.round(PREVIEW_W * PREVIEW_SPLIT);
    drawCanvasPane(ctx, 0, 0, splitX, PREVIEW_H);
    drawSignPane(ctx, splitX, 0, PREVIEW_W - splitX, PREVIEW_H);
    syncStatus();
  };

  // ── Persist ───────────────────────────────────────────────────────────────
  const commit = () => {
    requestRedraw();
    const next = JSON.stringify(working);
    if (next === lastSaved) return;
    // An emblem with no layers is not an emblem: clear the key rather than
    // leave an empty document behind for the brand chain to resolve.
    saveEmblemDoc(working.layers.length ? working : null);
    lastSaved = next;
    // --bb-knockout and friends derive from the emblem's ink, so the DOM chrome
    // has to be re-published alongside the 3D surfaces.
    applyThemeCssVars(getActiveTheme());
    refreshBrand();
    // The SIGN's silhouette is geometry, not a texture — an extruded storefront
    // emblem is rebuilt, not repainted. Same drawer-close rebuild the theme row
    // asks for.
    hooks.onDirty?.();
  };

  const kit = new SettingsRowKit({
    container,
    prefix: EMBLEM_ROW_PREFIX,
    hooks,
    preview: requestRedraw,
    commit,
  });

  /** A structural change (add/delete/reorder/preset): re-read every control. */
  const restructure = () => {
    selected = Math.min(Math.max(0, selected), Math.max(0, working.layers.length - 1));
    kit.syncAll();
    syncEnablement();
    commit();
  };

  // ── Starters ──────────────────────────────────────────────────────────────
  // Stepping this row replaces the whole composition, so it stashes what it
  // replaced — Clear Emblem's Left is the one undo on this page and it covers
  // both ways of losing your work.
  kit.strip(
    'starters', 'Start From',
    'A few layers to take apart. REPLACES what you have (Clear Emblem’s Left undoes it). Left/Right cycles.',
    EMBLEM_STARTERS.map((s) => s.label),
    (i) => {
      if (working.layers.length) replaced = cloneEmblemDoc(working);
      working = EMBLEM_STARTERS[i].doc();
      selected = Math.max(0, working.layers.length - 1);
      restructure();
    },
  );

  // ── Add ───────────────────────────────────────────────────────────────────
  // Deliberately TWO rows rather than one palette of buttons. The drawer hands
  // a row the same direction for Right and for OK, so a palette that added on
  // every step would drop four unwanted layers on the way to picking the fifth.
  // Choosing and committing are separate presses instead.
  let pendingKind: EmblemLayerKind = 'rect';
  kit.select(
    'newkind', 'New Shape', 'What the Add Shape row below will drop on the pile.',
    EMBLEM_KINDS.map((k) => ({ id: k, label: EMBLEM_KIND_SPECS[k].label })),
    () => pendingKind,
    (v) => { pendingKind = v as EmblemLayerKind; },
  );
  kit.action(
    'add', 'Add Shape',
    'Drops a new layer of the chosen shape on top of the pile and selects it.',
    'Enter',
    () => {
      const fresh = defaultEmblemLayer(pendingKind);
      // A first shape fills the canvas; anything after it lands smaller and
      // centred, so it reads as an addition rather than as covering the pile.
      const first = working.layers.length === 0;
      if (fresh.kind !== 'text') {
        fresh.w = first ? 1 : 0.4;
        fresh.h = first ? 1 : 0.4;
      }
      working.layers.push(fresh);
      selected = working.layers.length - 1;
      restructure();
    },
  );

  // ── Layer selection and stack order ───────────────────────────────────────
  kit.readout(
    'layer', 'Layer',
    'Which layer the rows below edit. Left/Right steps through the pile, bottom to top.',
    () => (working.layers.length
      ? `${selected + 1} / ${working.layers.length} — ${EMBLEM_KIND_SPECS[working.layers[selected].kind].label}`
      : '(empty)'),
    (dir) => {
      if (!working.layers.length) return;
      selected = (selected + dir + working.layers.length) % working.layers.length;
      kit.syncAll();
      syncEnablement();
      requestRedraw();
    },
  );

  kit.action(
    'order', 'Move In Stack',
    'Right brings the selected layer forward, Left sends it back. Later layers print over earlier ones.',
    '‹ back · fwd ›',
    () => { selected = moveEmblemLayer(working, selected, 1); restructure(); },
    () => { selected = moveEmblemLayer(working, selected, -1); restructure(); },
  );

  kit.action(
    'dup', 'Duplicate / Delete',
    'Enter copies the selected layer, Left deletes it.',
    'Enter · ‹ delete',
    () => {
      const sel = layer();
      if (!sel) return;
      working.layers.splice(selected + 1, 0, {
        ...sel, id: newLayerId(), cx: sel.cx + 0.04, cy: sel.cy + 0.04,
      });
      selected += 1;
      restructure();
    },
    () => {
      if (!working.layers.length) return;
      working.layers.splice(selected, 1);
      selected = Math.max(0, selected - 1);
      restructure();
    },
  );

  // ── The selected layer ────────────────────────────────────────────────────
  const shapeRow = kit.select(
    'kind', 'Shape', 'What the selected layer is.',
    EMBLEM_KINDS.map((k) => ({ id: k, label: EMBLEM_KIND_SPECS[k].label })),
    () => layer()?.kind ?? 'rect',
    (v) => {
      const sel = layer();
      if (!sel) return;
      sel.kind = v as EmblemLayerKind;
      // The two detail knobs mean something different per kind, so a change of
      // kind resets them rather than reinterpreting a star's point count as a
      // wedge's sweep angle.
      const spec = EMBLEM_KIND_SPECS[sel.kind];
      sel.detail = spec.defaults.detail;
      sel.detail2 = spec.defaults.detail2;
      if (sel.kind === 'text' && !sel.text) {
        sel.text = 'VIDEO';
        sel.fontFamily ??= 'Archivo Black';
      }
      kit.syncAll();
      syncEnablement();
    },
  );

  const roleRow = kit.select(
    'role', 'Outline Role',
    'Solid parts and holes shape the SIGN itself; "printed on it" only paints.',
    ROLE_OPTIONS,
    () => layer()?.role ?? 'solid',
    (v) => { const sel = layer(); if (sel) sel.role = v as EmblemRole; },
  );

  const inkRow = kit.select(
    'ink', 'Ink',
    'Brand inks follow the store’s colours when the brand changes; Custom pins one.',
    INK_OPTIONS,
    () => layer()?.ink ?? 'body',
    (v) => {
      const sel = layer();
      if (sel) sel.ink = v as EmblemInk;
      syncEnablement();
    },
  );

  const colorRow = kit.color(
    'color', 'Custom Colour', 'Used when Ink is set to Custom.',
    () => layer()?.color ?? '#ffffff',
    (v) => { const sel = layer(); if (sel) sel.color = v; },
  );

  const textRow = kit.text(
    'text', 'Text', 'The words on a text layer.',
    () => layer()?.text ?? '',
    (v) => { const sel = layer(); if (sel) sel.text = v; },
  );

  const fontRow = kit.select(
    'font', 'Font', 'Typeface for a text layer.',
    () => brandFontChoices().map((f) => ({ id: f, label: f })),
    () => layer()?.fontFamily ?? 'Archivo Black',
    (v) => { const sel = layer(); if (sel) sel.fontFamily = v; },
  );

  const pct = (v: number) => `${Math.round(v * 100)}%`;
  // Positions run past the canvas edge on purpose: a shape that hangs off and
  // gets cropped by the design box is a legitimate move, not a mistake.
  const POS: RangeSpec = { min: -0.5, max: 1.5, step: 0.005, navStep: 0.02 };
  const SIZE: RangeSpec = { min: 0.02, max: 2, step: 0.005, navStep: 0.02 };

  kit.slider('x', 'Across', 'Left/right position of the layer’s centre.',
    POS, pct, () => layer()?.cx ?? 0.5, (v) => { const s = layer(); if (s) s.cx = v; });
  kit.slider('y', 'Down', 'Up/down position of the layer’s centre.',
    POS, pct, () => layer()?.cy ?? 0.5, (v) => { const s = layer(); if (s) s.cy = v; });
  const widthRow = kit.slider('w', 'Width', 'Layer width, as a share of the canvas.',
    SIZE, pct, () => layer()?.w ?? 0.5, (v) => { const s = layer(); if (s) s.w = v; });
  const heightRow = kit.slider('h', 'Height', 'Layer height, as a share of the canvas.',
    SIZE, pct, () => layer()?.h ?? 0.5, (v) => { const s = layer(); if (s) s.h = v; });
  kit.slider('rot', 'Rotation', 'Turn the layer about its own centre.',
    { min: -180, max: 180, step: 1, navStep: 5 }, (v) => `${Math.round(v)}°`,
    () => layer()?.rot ?? 0, (v) => { const s = layer(); if (s) s.rot = v; });
  kit.slider('alpha', 'Opacity', 'How much of what is underneath shows through.',
    { min: 0, max: 1, step: 0.02, navStep: 0.1 }, pct,
    () => layer()?.alpha ?? 1, (v) => { const s = layer(); if (s) s.alpha = v; });

  // The two kind-specific knobs. Label, range and meaning all follow the
  // selected layer — see EMBLEM_KIND_SPECS, which is the single place a new
  // primitive declares them, so adding one needs no UI code at all.
  const detailRange = (which: 1 | 2): RangeSpec => {
    const d = which === 1 ? kindSpec().detail : kindSpec().detail2;
    return d
      ? { min: d.min, max: d.max, step: d.step, navStep: d.navStep }
      : { min: 0, max: 1, step: 0.01, navStep: 0.1 };
  };
  const detailFormat = (which: 1 | 2) => (v: number) => {
    const d = which === 1 ? kindSpec().detail : kindSpec().detail2;
    if (!d) return '—';
    const rounded = d.step >= 1 ? Math.round(v) : Math.round(v * 100) / 100;
    return `${rounded}${d.unit ?? ''}`;
  };
  const detailRow = kit.slider('detail', 'Detail', 'Extra control for the selected shape.',
    () => detailRange(1), detailFormat(1),
    () => layer()?.detail ?? 0, (v) => { const s = layer(); if (s) s.detail = v; });
  const detail2Row = kit.slider('detail2', 'Detail 2', 'Second control for the selected shape.',
    () => detailRange(2), detailFormat(2),
    () => layer()?.detail2 ?? 0, (v) => { const s = layer(); if (s) s.detail2 = v; });

  // ── The emblem as a whole ─────────────────────────────────────────────────
  kit.slider('aspect', 'Canvas Shape', 'Width against height of the design canvas.',
    { min: 0.4, max: 4, step: 0.05, navStep: 0.1 }, (v) => `${v.toFixed(2)} : 1`,
    () => working.aspect, (v) => { working.aspect = v; });
  kit.slider('tilt', 'Lean', 'Rake the whole emblem, the classic video-store lean.',
    { min: -20, max: 20, step: 0.5, navStep: 1 }, (v) => `${(Math.round(v * 10) / 10)}°`,
    () => working.tilt, (v) => { working.tilt = v; });
  kit.toggle('wordmark', 'Store Name On It',
    'Print the store name over the emblem, fitted to the largest rectangle that sits inside your shape. Turn it off if your own text layers carry the name.',
    () => working.wordmark, (v) => { working.wordmark = v; });
  kit.toggle('enabled', 'Use This Emblem',
    'Off keeps everything you built but puts the store back on its normal brand.',
    () => working.enabled, (v) => { working.enabled = v; });

  const statusRow = kit.readout(
    'status', 'Emblem Status',
    'What the store is actually wearing, and the shape it cuts its signs to.',
    () => statusText(),
  );
  const statusValue = statusRow.querySelector('.settings-row-value');
  const syncStatus = () => {
    if (statusValue) statusValue.textContent = statusText();
  };

  // The previous export's object URL, revoked when the next one replaces it —
  // revoking immediately after the click can pull the file out from under the
  // download, and never revoking leaks the blob for the session.
  let lastExportUrl: string | null = null;
  const exportRow = kit.action(
    'export', 'Export PNG',
    'Save the flattened emblem as a transparent PNG — the same art the store wears.',
    'Enter to save',
    () => {
      const value = exportRow.querySelector('.settings-row-value');
      void emblemPngBlob(working, emblemColorsFromSpec(getActiveLogoSpec()), 1024).then((blob) => {
        if (!blob) {
          if (value) value.textContent = 'Nothing to export';
          return;
        }
        if (lastExportUrl) URL.revokeObjectURL(lastExportUrl);
        lastExportUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = lastExportUrl;
        a.download = 'emblem.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        if (value) value.textContent = `Saved emblem.png (${Math.round(blob.size / 1024)} KB)`;
      });
    },
  );

  kit.action(
    'clear', 'Clear Emblem',
    'Throws the whole composition away and puts the store back on its normal brand. Left puts back whatever was last replaced or cleared, while this page is open.',
    'Enter · ‹ undo',
    () => {
      if (!working.layers.length) return;
      replaced = cloneEmblemDoc(working);
      working = emptyEmblemDoc();
      selected = 0;
      restructure();
    },
    () => {
      if (!replaced) return;
      working = replaced;
      replaced = null;
      selected = Math.max(0, working.layers.length - 1);
      restructure();
    },
  );

  /**
   * Rows that only mean something for certain layers go INERT rather than
   * disappearing — a row that vanishes takes its slot in the drawer's flat nav
   * list with it, and the page is measured and paginated once per build.
   */
  function syncEnablement(): void {
    const sel = layer();
    const isText = sel?.kind === 'text';
    for (const row of [shapeRow, roleRow, inkRow, widthRow, heightRow]) setRowEnabled(row, !!sel);
    setRowEnabled(colorRow, !!sel && sel.ink === 'custom');
    setRowEnabled(textRow, isText);
    setRowEnabled(fontRow, isText);
    // A text layer's box is a type size and a wrap ceiling, not a rectangle.
    setRowLabel(widthRow, isText ? 'Max Width' : 'Width');
    setRowLabel(heightRow, isText ? 'Text Size' : 'Height');
    const d1 = kindSpec().detail;
    const d2 = kindSpec().detail2;
    setRowLabel(detailRow, d1?.label ?? 'Detail');
    setRowLabel(detail2Row, d2?.label ?? 'Detail 2');
    setRowEnabled(detailRow, !!sel && !!d1);
    setRowEnabled(detail2Row, !!sel && !!d2);
  }

  syncEnablement();
  redraw();
  // A face picked for a text layer may still be decoding on a cold drawer;
  // repaint once when the app's fonts settle (one-shot, no polling).
  document.fonts?.ready?.then(() => redraw()).catch(() => {});
}
