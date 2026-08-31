// Boot + keybinding glue for shared-place links (issue #137). A separate
// module rather than living in main.ts (at its line budget) or
// shared-place.ts (which stays DOM/dependency-free, see its header) — same
// shape as store-welcome.ts's deps-injected trigger. Calls store-camera.ts's
// functions directly with the scene, the same way store-overview.ts and
// store-subnav.ts do, rather than adding StoreScene stub methods that would
// grow three-scene.ts past its own budget for a feature that doesn't touch
// scene-internal state.
//
// One entry point, `initSharedPlace`, called every time main.ts's
// initializeStoreScene() reveals a scene (first boot AND every later
// rebuild — theme change, 2D/3D swap, provider reconnect all funnel through
// that one callback). It self-guards both halves to run only once each per
// page load: applying the `?title=`/`?walk=` URL again on a later rebuild
// would yank the visitor back to the link's place after they'd since walked
// off it, and re-installing the F9 listener on every rebuild would stack
// duplicate handlers.
import type { StoreScene } from './three-scene';
import { applySharedPlaceFromUrl, captureSharedPlace } from './store-camera';
import { buildShareUrl } from './shared-place';

let bootApplied = false;
let keybindingInstalled = false;

type ShowToast = (text: string, ms?: number) => void;

/**
 * `setupPending`: skip the boot-apply over an empty opening-day store —
 * nothing to land on, and it would fight the setup terminal for the camera.
 * `getScene`/`isBlocked`/`showToast`: F9 keybinding deps, wired once.
 */
export function initSharedPlace(
  scene: StoreScene,
  setupPending: boolean,
  getScene: () => StoreScene | null,
  isBlocked: () => boolean,
  showToast: ShowToast,
): void {
  if (!bootApplied && !setupPending) {
    bootApplied = true;
    applySharedPlaceFromUrl(scene);
  }
  if (!keybindingInstalled) {
    keybindingInstalled = true;
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'F9' || isBlocked()) return;
      const s = getScene();
      if (!s) return;
      e.preventDefault();
      void copyShareLink(s, showToast);
    });
  }
}

// The diegetic sibling of the F8 feedback pin (#137): copies a URL that
// reopens the store right where the visitor is standing, or on the case
// they're inspecting, instead of the cold entrance every other link drops
// them at. Pure clipboard write — no dev-server endpoint, so it works on the
// hosted static build the feedback pin can't save from.
async function copyShareLink(scene: StoreScene, showToast: ShowToast): Promise<void> {
  const url = buildShareUrl(captureSharedPlace(scene));
  try {
    await navigator.clipboard.writeText(url);
    showToast("Copied a link to right where you're standing — share away!");
  } catch (err) {
    console.warn('[SharedPlace] clipboard write failed:', err);
    showToast('Could not copy the link — clipboard access needs a secure (https) page.');
  }
}
