// The emblem studio's editing session — the handle its three halves share.
//
// The studio (src/emblem-editor.ts) owns the working document and the undo
// stash; the control rows (src/emblem-controls.ts) and the interactive design
// canvas (src/emblem-canvas.ts) both read and mutate it. This interface is the
// contract between them, and it lives in its own module so neither of those two
// has to import the other to know what it is being handed.
//
// TWO RULES FOR ANYONE HOLDING ONE:
//
//   1. NEVER CACHE `doc`. It is replaced wholesale by Start From and by Clear /
//      undo, so a control that captured the object at build time would go on
//      editing a document nothing else can see. Read `session.doc` every time.
//   2. PICK THE RIGHT WRITE. `preview()` repaints and nothing else — that is a
//      slider mid-scrub or a shape mid-drag. `commit()` persists and republishes
//      the brand, so it is what a finished gesture calls. `restructure()` is for
//      a change that alters WHICH controls apply (add, delete, reorder, replace):
//      it re-reads every control from the document first, then commits.
import type { EmblemDoc, EmblemLayer } from './emblem-doc';

export interface EmblemSession {
  /** The working document. Mutated in place, and sometimes REPLACED — see above. */
  doc: EmblemDoc;
  /** Index into `doc.layers` of the layer the property controls are editing. */
  selected: number;
  /** The selected layer, or null on an empty document. */
  layer(): EmblemLayer | null;
  /** Move the selection; re-reads the controls and repaints. Clamped, not wrapped. */
  select(index: number): void;
  /** Repaint the previews without persisting. */
  preview(): void;
  /** Persist, repaint, and republish the store's brand. */
  commit(): void;
  /** Add / delete / reorder / replace: re-read every control, then commit. */
  restructure(): void;
}
