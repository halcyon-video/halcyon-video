// THE EMBLEM STUDIO'S CONTROLS — every property a shape has, on screen at once.
//
// This is the REMOTE half of the editor, and it is deliberately the complete
// half: everything the mouse can do on the design canvas next door
// (src/emblem-canvas.ts) is also a labelled row here, because the store still
// boots on a television and a person on a couch must be able to build the whole
// logo with five buttons.
//
// Rows are SettingsRowKit rows — the same markup, dot leader, footer hint and
// Left-adjusts/Enter-activates contract as the settings drawer — so the studio
// is a new SHAPE for the controls, not a new language for them. The kit is
// aimed at a different column between groups with kit.into(); its registration
// order is the order the remote's focus ring walks, which is why the groups are
// built in the order a person works: pick a layer, change the layer, then the
// emblem as a whole.
//
// NOTHING HERE IS HIDDEN BY KIND. A row that doesn't apply to the selected
// shape (Text on a star, Waist on a rectangle) goes INERT and stays where it
// is. On the old drawer page that was a pagination constraint; here it is the
// point — "what can this shape do" should be answerable by looking, and a
// vocabulary that rearranges itself as you select things is not.
import {
  cloneEmblemDoc, defaultEmblemLayer, emblemDocActive, emptyEmblemDoc,
  EMBLEM_KIND_SPECS, EMBLEM_KINDS, EMBLEM_STARTERS, moveEmblemLayer, newLayerId,
} from './emblem-doc';
import type { EmblemInk, EmblemLayerKind, EmblemRole } from './emblem-doc';
import {
  emblemColorsFromSpec, emblemPngBlob, emblemSilhouette,
} from './emblem-render';
import { getActiveLogoSpec } from './logo-spec';
import { SettingsRowKit, setRowEnabled, setRowLabel } from './settings-rows';
import type { RangeSpec } from './settings-rows';
import { brandFontChoices } from './brand-fonts';
import type { EmblemSession } from './emblem-session';

/** Where each group of rows lands. Three panels, one kit, one focus ring. */
export interface EmblemControlTargets {
  /** Under the layer stack: what to add, and what to do with the selection. */
  layerOps: HTMLElement;
  /** Everything the selected layer carries. */
  props: HTMLElement;
  /** The composition as a whole: canvas shape, lean, wordmark, on/off. */
  doc: HTMLElement;
  /** Start From, Export, Clear. */
  actions: HTMLElement;
}

export interface EmblemControls {
  /** Re-read every control from the document. */
  syncAll(): void;
  /** Re-apply per-kind labels and inert states to the property rows. */
  syncEnablement(): void;
  /** The honest one-liner for the studio's status bar. */
  statusText(): string;
}

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

// Positions run past the canvas edge on purpose: a shape that hangs off and
// gets cropped by the design box is a legitimate move, not a mistake. The
// design canvas's drag clamps are these same numbers — see emblem-canvas.ts.
const POS: RangeSpec = { min: -0.5, max: 1.5, step: 0.005, navStep: 0.02 };
const SIZE: RangeSpec = { min: 0.02, max: 2, step: 0.005, navStep: 0.02 };

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Build every control row for `session` into `targets`.
 *
 * `onLayersChanged` fires when the STACK changed shape (add, delete, reorder,
 * replace) so the studio can rebuild its layer list; ordinary property edits
 * don't call it — they only move values the list doesn't show.
 */
export function buildEmblemControls(
  kit: SettingsRowKit,
  session: EmblemSession,
  targets: EmblemControlTargets,
  onLayersChanged: () => void,
): EmblemControls {
  const layer = () => session.layer();
  const kindSpec = () => EMBLEM_KIND_SPECS[layer()?.kind ?? 'rect'];

  // The last composition something threw away — Clear Emblem, or a Start From
  // that replaced it — so Left on the Clear row can put it back for as long as
  // the studio is open. Losing a logo you spent an hour on to one press of OK,
  // with no way back, is not a thing this store should do.
  let replaced: ReturnType<typeof cloneEmblemDoc> | null = null;

  /** A structural change: rebuild the stack list, re-read every control, save. */
  const restructure = () => {
    onLayersChanged();
    session.restructure();
  };

  const statusText = (): string => {
    const n = session.doc.layers.length;
    if (!n) return 'Empty — add a shape to begin.';
    const plural = n === 1 ? 'layer' : 'layers';
    if (!session.doc.enabled) return `${n} ${plural} — not in use (Use This Emblem is Off).`;
    if (!emblemDocActive(session.doc)) return `${n} ${plural} — no solid part, so nothing to cut a sign from.`;
    const sil = emblemSilhouette(session.doc);
    return sil
      ? `${n} ${plural} — the store's signs are cut to a ${sil.aspect.toFixed(2)}:1 outline.`
      : `${n} ${plural}.`;
  };

  // ── Layer ops (under the stack list) ───────────────────────────────────────
  // Deliberately TWO rows rather than one palette of buttons. A row hands the
  // same direction to Right and to OK, so a palette that added on every step
  // would drop four unwanted layers on the way to picking the fifth. Choosing
  // and committing are separate presses instead.
  kit.into(targets.layerOps);

  let pendingKind: EmblemLayerKind = 'rect';
  kit.select(
    'newkind', 'New Shape', 'What the Add Shape row below will drop on the pile.',
    EMBLEM_KINDS.map((k) => ({ id: k, label: EMBLEM_KIND_SPECS[k].label })),
    () => pendingKind,
    (v) => { pendingKind = v as EmblemLayerKind; },
  );

  const addLayer = () => {
    const fresh = defaultEmblemLayer(pendingKind);
    // A first shape fills the canvas; anything after it lands smaller and
    // centred, so it reads as an addition rather than as covering the pile.
    const first = session.doc.layers.length === 0;
    if (fresh.kind !== 'text') {
      fresh.w = first ? 1 : 0.4;
      fresh.h = first ? 1 : 0.4;
    }
    session.doc.layers.push(fresh);
    session.selected = session.doc.layers.length - 1;
    restructure();
  };
  kit.action(
    'add', 'Add Shape',
    'Drops a new layer of the chosen shape on top of the pile and selects it.',
    'Enter', addLayer,
  );

  kit.action(
    'order', 'Move In Stack',
    'Right brings the selected layer forward, Left sends it back. Later layers print over earlier ones.',
    '‹ back · fwd ›',
    () => { session.selected = moveEmblemLayer(session.doc, session.selected, 1); restructure(); },
    () => { session.selected = moveEmblemLayer(session.doc, session.selected, -1); restructure(); },
  );

  const duplicateLayer = () => {
    const sel = layer();
    if (!sel) return;
    session.doc.layers.splice(session.selected + 1, 0, {
      ...sel, id: newLayerId(), cx: sel.cx + 0.04, cy: sel.cy + 0.04,
    });
    session.selected += 1;
    restructure();
  };
  const deleteLayer = () => {
    if (!session.doc.layers.length) return;
    session.doc.layers.splice(session.selected, 1);
    session.selected = Math.max(0, session.selected - 1);
    restructure();
  };
  kit.action(
    'dup', 'Duplicate / Delete', 'Enter copies the selected layer, Left deletes it.',
    'Enter · ‹ delete', duplicateLayer, deleteLayer,
  );

  // ── The selected layer ─────────────────────────────────────────────────────
  kit.into(targets.props);

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
      onLayersChanged();
    },
  );

  const roleRow = kit.select(
    'role', 'Outline Role',
    'Solid parts and holes shape the SIGN itself; "printed on it" only paints.',
    ROLE_OPTIONS,
    () => layer()?.role ?? 'solid',
    (v) => {
      const sel = layer();
      if (sel) sel.role = v as EmblemRole;
      onLayersChanged();
    },
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
      onLayersChanged();
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

  kit.slider('x', 'Across', 'Left/right position of the layer’s centre. Or drag the shape on the canvas.',
    POS, pct, () => layer()?.cx ?? 0.5, (v) => { const s = layer(); if (s) s.cx = v; });
  kit.slider('y', 'Down', 'Up/down position of the layer’s centre. Or drag the shape on the canvas.',
    POS, pct, () => layer()?.cy ?? 0.5, (v) => { const s = layer(); if (s) s.cy = v; });
  const widthRow = kit.slider('w', 'Width', 'Layer width, as a share of the canvas. Or pull a side handle.',
    SIZE, pct, () => layer()?.w ?? 0.5, (v) => { const s = layer(); if (s) s.w = v; });
  const heightRow = kit.slider('h', 'Height', 'Layer height, as a share of the canvas. Or pull a corner handle.',
    SIZE, pct, () => layer()?.h ?? 0.5, (v) => { const s = layer(); if (s) s.h = v; });
  kit.slider('rot', 'Rotation', 'Turn the layer about its own centre. Or turn the stem above it.',
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

  // ── The emblem as a whole ──────────────────────────────────────────────────
  kit.into(targets.doc);

  kit.slider('aspect', 'Canvas Shape', 'Width against height of the design canvas.',
    { min: 0.4, max: 4, step: 0.05, navStep: 0.1 }, (v) => `${v.toFixed(2)} : 1`,
    () => session.doc.aspect, (v) => { session.doc.aspect = v; });
  kit.slider('tilt', 'Lean', 'Rake the whole emblem, the classic video-store lean.',
    { min: -20, max: 20, step: 0.5, navStep: 1 }, (v) => `${(Math.round(v * 10) / 10)}°`,
    () => session.doc.tilt, (v) => { session.doc.tilt = v; });
  kit.toggle('wordmark', 'Store Name On It',
    'Print the store name over the emblem, fitted to the largest rectangle that sits inside your shape. Turn it off if your own text layers carry the name.',
    () => session.doc.wordmark, (v) => { session.doc.wordmark = v; });
  kit.toggle('enabled', 'Use This Emblem',
    'Off keeps everything you built but puts the store back on its normal brand.',
    () => session.doc.enabled, (v) => { session.doc.enabled = v; });

  // ── Whole-composition actions ──────────────────────────────────────────────
  kit.into(targets.actions);

  // Stepping this row replaces the whole composition, so it stashes what it
  // replaced — Clear Emblem's Left is the one undo on this page and it covers
  // both ways of losing your work.
  kit.strip(
    'starters', 'Start From',
    'A few layers to take apart. REPLACES what you have (Clear Emblem’s Left undoes it). Left/Right cycles.',
    EMBLEM_STARTERS.map((s) => s.label),
    (i) => {
      if (session.doc.layers.length) replaced = cloneEmblemDoc(session.doc);
      session.doc = EMBLEM_STARTERS[i].doc();
      session.selected = Math.max(0, session.doc.layers.length - 1);
      restructure();
    },
  );

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
      void emblemPngBlob(session.doc, emblemColorsFromSpec(getActiveLogoSpec()), 1024).then((blob) => {
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
      if (!session.doc.layers.length) return;
      replaced = cloneEmblemDoc(session.doc);
      session.doc = emptyEmblemDoc();
      session.selected = 0;
      restructure();
    },
    () => {
      if (!replaced) return;
      session.doc = replaced;
      replaced = null;
      session.selected = Math.max(0, session.doc.layers.length - 1);
      restructure();
    },
  );

  /**
   * Retitle and grey the rows whose meaning follows the selected kind. Rows go
   * inert rather than disappearing — see the module header.
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

  return { syncAll: () => kit.syncAll(), syncEnablement, statusText };
}
