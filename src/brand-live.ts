// Live brand refresh — "change a colour, see it now".
//
// Every brand-inked surface in the store is a canvas painted ONCE at build time
// (signs, the section plaque, the checkout bag's print, the tip-jar card) or a
// material tinted once from the spec (the extruded storefront letters). That is
// the right call for a store that idles for days: nothing repaints per frame.
//
// The cost was that editing the brand changed nothing on screen. The Store Brand
// editor wrote `bb_logo`, flagged `settingsPendingRebuild`, and the store only
// caught up on drawer-close via rebuildStoreScene() — a boot overlay, a texture
// upload drain and a full scene re-init. You could not see a colour while you
// were choosing it, which is the one moment it matters.
//
// So each of those surfaces registers how to re-apply itself here, and the
// editor calls refreshBrand() on every commit. A repaint is a handful of canvas
// draws plus one GPU upload of an already-allocated texture — cheap enough to
// run on each keystroke of a colour field, and nowhere near a scene rebuild.
//
// PERFORMANCE CONTRACT (the prime directive still holds):
//   - Nothing here runs per frame. Subscribers fire only from refreshBrand().
//   - No allocation at registration beyond one closure per surface.
//   - Repaints reuse the existing canvas and texture object; `needsUpdate`
//     re-uploads in place rather than creating a new GPU resource.
//
// LIFETIME: subscribers hold canvases and materials belonging to the CURRENT
// scene. StoreScene.destroy() calls resetBrandLive() so a rebuilt store does not
// leave the old scene's surfaces subscribed — repainting a disposed canvas is
// wasted work at best and a leak at worst.
import type * as THREE from 'three';

type Refresh = () => void;

const subscribers = new Set<Refresh>();

// The store renders on demand, so a repaint that nobody asks to present is
// invisible until the next input. StoreScene installs its requestRender here.
let renderHook: (() => void) | null = null;

/**
 * Register a closure that re-applies the active brand to one surface.
 * Returns an unsubscribe function; most callers ignore it and rely on
 * resetBrandLive() at scene teardown.
 */
export function onBrandChange(fn: Refresh): () => void {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

/**
 * The common case: a canvas texture whose `paint` reads the active brand.
 * Re-runs `paint` on a brand change and re-uploads the texture in place.
 *
 * Call it AFTER the first paint — this does not paint for you, so a caller that
 * forgets its initial draw fails loudly (an empty sign) rather than subtly.
 */
export function registerBrandRepaint(tex: THREE.Texture, paint: Refresh): () => void {
  return onBrandChange(() => {
    // A texture disposed with its scene has nothing to re-upload into. Cheap
    // guard so a stray subscriber can't throw mid-refresh and strand the rest.
    if (!tex.image) return;
    paint();
    tex.needsUpdate = true;
  });
}

/** StoreScene installs its requestRender so a refresh actually presents. */
export function setBrandRenderHook(fn: (() => void) | null): void {
  renderHook = fn;
}

/**
 * Re-apply the active brand to every registered surface, then ask for a frame.
 * Called by the Store Brand editor on each commit.
 */
export function refreshBrand(): void {
  // Iterate a copy: a subscriber that unsubscribes itself mid-refresh (a
  // fixture torn down by the same edit) must not invalidate the iteration.
  for (const fn of [...subscribers]) {
    try {
      fn();
    } catch (e) {
      // One bad surface must not stop the other fifty from updating.
      console.error('[brand-live] refresh failed for one surface:', e);
    }
  }
  renderHook?.();
}

/** How many surfaces are live — used by the harness checkpoint. */
export function brandSubscriberCount(): number {
  return subscribers.size;
}

/** Drop every subscriber. Called from StoreScene.destroy(). */
export function resetBrandLive(): void {
  subscribers.clear();
  renderHook = null;
}
