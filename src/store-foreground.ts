import { isExternalGameActive, onExternalGameChange } from './external-game-state.ts';

// Observe focus before asynchronous boot starts. A window can be launched or
// reloaded on another desktop without ever receiving a subsequent blur event.
const remoteInstance = typeof location !== 'undefined'
  && !!new URLSearchParams(location.search).get('remoteId');
let focused = typeof document === 'undefined' || document.hasFocus();
const listeners = new Set<(foreground: boolean) => void>();

export function localInputAllowed(): boolean {
  return focused && (typeof document === 'undefined' || !document.hidden)
    && !isExternalGameActive();
}

/** Private Remote Play instances render for their viewer without OS focus. */
export function isStoreForeground(): boolean {
  return !isExternalGameActive() && (remoteInstance || localInputAllowed());
}

let lastForeground = isStoreForeground();
function publish(): void {
  const foreground = isStoreForeground();
  if (foreground === lastForeground) return;
  lastForeground = foreground;
  for (const listener of listeners) listener(foreground);
}

export function setWindowForeground(value: boolean): void {
  focused = value;
  publish();
}

export function onStoreForegroundChange(listener: (foreground: boolean) => void): () => void {
  listeners.add(listener);
  listener(isStoreForeground());
  return () => { listeners.delete(listener); };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('blur', () => setWindowForeground(false));
  // A real focus event remains authoritative on kiosks where hasFocus() can
  // lag. Do not veto it with a per-gamepad-poll hasFocus() check.
  window.addEventListener('focus', () => setWindowForeground(true));
  document.addEventListener('visibilitychange', () => {
    setWindowForeground(!document.hidden && document.hasFocus());
  });
  const directInput = (event: Event) => {
    // Controller polling and synthetic keys must never reclaim OS focus.
    if (event.isTrusted && !document.hidden) setWindowForeground(true);
  };
  window.addEventListener('keydown', directInput, true);
  window.addEventListener('pointerdown', directInput, true);
  // A stream resolving after blur must not start a film or ambient video.
  document.addEventListener('play', event => {
    if (!isStoreForeground() && event.target instanceof HTMLMediaElement) event.target.pause();
  }, true);
  onStoreForegroundChange(foreground => {
    if (!foreground) document.querySelectorAll<HTMLMediaElement>('video, audio').forEach(media => media.pause());
  });
}
onExternalGameChange(publish);

/** Include late-created audio graphs in foreground ownership, not only those
 * present when the main scene's blur handler happened to run. */
export function createStoreAudioContext(): AudioContext {
  const context = new AudioContext();
  const park = () => {
    if (!isStoreForeground() && context.state === 'running') void context.suspend().catch(() => {});
  };
  const remove = onStoreForegroundChange(park);
  const changed = () => {
    if (context.state === 'closed') {
      remove();
      context.removeEventListener('statechange', changed);
    } else park();
  };
  context.addEventListener('statechange', changed);
  return context;
}
