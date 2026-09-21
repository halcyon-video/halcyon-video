// One session-wide latch. Every wake path consults it; window focus alone
// cannot revoke a game's claim on system resources.
let active = false;
const listeners = new Set<(active: boolean) => void>();
export function isExternalGameActive(): boolean { return active; }
export function setExternalGameActive(value: boolean): void {
  if (active === value) return;
  active = value;
  for (const listener of listeners) listener(active);
}
export function onExternalGameChange(listener: (active: boolean) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export async function withExternalGame<T>(launch: () => Promise<T>): Promise<T> {
  if (active) throw new Error('A Steam game is already starting or running.');
  setExternalGameActive(true);
  try { return await launch(); }
  finally { setExternalGameActive(false); }
}

export function waitForExternalGame(): Promise<void> {
  if (!active) return Promise.resolve();
  return new Promise(resolve => {
    const remove = onExternalGameChange(value => { if (!value) { remove(); resolve(); } });
  });
}
