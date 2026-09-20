// Carry eligibility stays independent of rendering so every input path can test it.
export interface CarryReturnState {
  carryMode: boolean;
  checkoutRunning: boolean;
  isWalkAroundMode: boolean;
  mode: string;
  carried?: { count: number } | null;
}
export function canHoldToReturn(scene: CarryReturnState): boolean {
  return scene.carryMode
    && !scene.checkoutRunning
    && !scene.isWalkAroundMode
    && scene.mode !== 'backroom'
    && (scene.carried?.count ?? 0) > 0;
}
