import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { installCompressedModelLoads } from './compressed-models.ts';

/** Phone and hosted entry hold the reveal for the checkout counter model
 * (startup-reveal.ts), but every decorative fixture starts its own model
 * download while the room is built. On a phone connection those two dozen
 * requests share the bandwidth with the counter, so the one model the reveal
 * waits on arrived last and held the splash for its whole grace (issue #399).
 *
 * While a hold is open, GLTFLoader.load calls queue instead of fetching, then
 * start in their original order once the held download settles or the cap
 * expires. Parsing bytes that were already fetched (GLTFLoader.parse, which is
 * how the counter itself loads) is never held, and nothing is dropped. */
let hold: Promise<void> | null = null;
let installed = false;

function install(): void {
  if (installed) return;
  installed = true;
  installCompressedModelLoads();
  const load = GLTFLoader.prototype.load;
  GLTFLoader.prototype.load = function (this: GLTFLoader, ...args: Parameters<GLTFLoader['load']>) {
    const pending = hold;
    if (!pending) return load.apply(this, args);
    void pending.then(() => load.apply(this, args));
  };
}

/** Hold model downloads until `until` settles (either way) or `capMs` passes. */
export function holdModelDownloads(until: Promise<unknown>, capMs = 4000): void {
  install();
  const gate: Promise<void> = new Promise<void>(resolve => {
    const timer = setTimeout(resolve, capMs);
    const open = () => { clearTimeout(timer); resolve(); };
    until.then(open, open);
  }).then(() => { if (hold === gate) hold = null; });
  hold = gate;
}

/** True while model downloads are being held (diagnostics and tests). */
export function modelDownloadsHeld(): boolean {
  return hold !== null;
}
