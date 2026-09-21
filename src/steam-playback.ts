import { invoke } from '@tauri-apps/api/core';
import { withExternalGame, isExternalGameActive, onExternalGameChange } from './external-game-state.ts';
import type { Movie } from './providers/media-source-provider';

export async function playSteamGame(movie: Movie, report: (message: string) => void): Promise<void> {
  const native = !!(window as any).__TAURI_INTERNALS__;
  report(`Starting ${movie.title} in Steam. Halcyon will sleep until the game closes.`);
  const notice = document.createElement('div');
  notice.setAttribute('role', 'status');
  notice.style.cssText = 'position:fixed;inset:0;z-index:9999;display:grid;place-content:center;background:#090c12;color:#eee;padding:24px;font:18px sans-serif;text-align:center';
  notice.textContent = 'Steam is starting your game. Halcyon is sleeping and will return when the game closes.';
  document.body.append(notice);
  try {
    await withExternalGame(async () => {
      if (native) return invoke<void>('steam_launch', { appId: movie.steamAppId });
      const token = localStorage.getItem('halcyon_steam_companion_pair');
      if (!token) throw 'Pair the Halcyon Steam Companion before launching a game.';
      const response = await fetch('http://127.0.0.1:1421/v1/launch', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ appId: movie.steamAppId }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw (typeof payload.error === 'string' ? payload.error : 'Steam companion could not launch the game.');
    });
    report('The Steam game has closed. Welcome back.');
  } catch (error) {
    const message = typeof error === 'string' ? error : 'Steam could not launch the game.';
    report(message);
    // Keep launch failures visible after the store wakes, rather than only in
    // the developer console. Text content never interprets provider markup.
    notice.textContent = message;
    const close = document.createElement('button');
    close.textContent = 'Return to store';
    close.style.cssText = 'font:inherit;margin-top:24px;padding:12px;cursor:pointer';
    close.onclick = () => notice.remove();
    notice.append(close);
    close.focus();
    return;
  }
  notice.remove();
}

// Late media-load callbacks cannot restart a video while the external game owns
// the machine, even if the original pause happened before its data arrived.
document.addEventListener('play', event => {
  if (isExternalGameActive() && event.target instanceof HTMLMediaElement) event.target.pause();
}, true);

const sleepStyle = document.createElement('style');
sleepStyle.textContent = 'html[data-external-game] *, html[data-external-game] *::before, html[data-external-game] *::after { animation-play-state: paused !important; transition: none !important; }';
document.head.append(sleepStyle);
onExternalGameChange(active => { document.documentElement.toggleAttribute('data-external-game', active); });
