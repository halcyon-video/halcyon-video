// Weighted completed startup work, never an elapsed-time animation.
type LoadingUI = { update(value: number, detail?: string): void; reset(): void; fail(): void };
function ui(): LoadingUI | undefined { return typeof window === 'undefined' ? undefined : (window as unknown as { halcyonLoading?: LoadingUI }).halcyonLoading; }
export function resetStoreLoading(): void { ui()?.reset(); }
export function showStoreLoadingFailure(): void { ui()?.fail(); }
export function updateStoreLoading(value: number, detail?: string): void { ui()?.update(value, detail); }
export async function paintStoreLoading(value: number, detail?: string): Promise<void> {
  updateStoreLoading(value, detail);
  if (typeof document !== 'undefined' && document.hidden) { await new Promise(r => setTimeout(r, 16)); return; }
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
