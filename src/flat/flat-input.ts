// Flat catalog surfaces share their keyboard navigation with controller input.
// The application supplies modal ownership without importing the 3D scene here.
let blocked: () => boolean = () => false;

export function configureFlatInput(isBlocked: () => boolean): void {
  blocked = isBlocked;
}

export function flatInputTarget(): HTMLElement | null {
  const handoff = document.querySelector<HTMLDialogElement>('#streaming-handoff[open]');
  if (handoff) return handoff;
  const root = document.getElementById('canvas-container');
  if (!root?.classList.contains('flat-store-root') || blocked()) return null;
  const surface = root.querySelector<HTMLElement>('.flat-detail-overlay')
    || root.querySelector<HTMLElement>('.flat-search-overlay') || root;
  const active = document.activeElement;
  return active instanceof HTMLElement && surface.contains(active) ? active : surface;
}

export function dispatchFlatInput(key: string): boolean {
  const target = flatInputTarget();
  if (!target) return false;
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  return true;
}
