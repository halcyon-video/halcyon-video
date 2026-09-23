import type { StoreScene } from './three-scene';

type TouchCheckoutScene = Pick<StoreScene, 'mode' | 'canHoldToCheckout' | 'getSelectedMovie'
  | 'setCarryMode' | 'takeSelectedTape' | 'enterCheckout'>;

/** Returns false when the normal selection ladder owns this action. */
export function mobileCheckoutAction(scene: TouchCheckoutScene, terminal: boolean): boolean {
  if (terminal) return false;
  if (scene.mode !== 'inspect' && scene.canHoldToCheckout()) {
    scene.enterCheckout(); return true;
  }
  const movie = scene.mode === 'inspect' ? scene.getSelectedMovie() : null;
  // Streaming must choose a provider; series must choose an episode, and
  // unavailable titles must keep the request/availability ladder.
  if (!movie || movie.streaming || movie.isSeries || movie.comingSoon || movie.discovery || movie.collectionGap) return false;
  scene.setCarryMode(true);
  // A full stack or duplicate must not check out some other carried title.
  if (scene.takeSelectedTape()) scene.enterCheckout();
  return true;
}
