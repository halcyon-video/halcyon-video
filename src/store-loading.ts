// Progress represents completed startup stages, never elapsed-time guesses.
let completed = 0;
export function resetStoreLoading(): void {
  completed = 0; updateStoreLoading(0);
  const label = document.getElementById('store-loading-label');
  if (label) { label.textContent = 'LOADING'; label.removeAttribute('role'); }
}
export function showStoreLoadingFailure(): void {
  const label = document.getElementById('store-loading-label');
  if (label) {
    label.textContent = 'Unable to start graphics. Close and reopen Halcyon to try again.';
    label.setAttribute('role', 'alert');
  }
}
export function updateStoreLoading(value: number): void {
  if (typeof document === 'undefined') return;
  completed = Math.max(completed, Math.min(100, value));
  document.getElementById('store-loading-progress')?.setAttribute('aria-valuenow', String(completed));
  const fill = document.getElementById('store-loading-fill');
  if (fill) fill.style.width = `${completed}%`;
}
export async function paintStoreLoading(value: number): Promise<void> {
  updateStoreLoading(value);
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
