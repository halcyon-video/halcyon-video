// Renting a game from the EmulationStation folder (issue #408). The ROM is a
// file the visitor already picked, so it plays in the browser with EmulatorJS
// (the same player Romm uses); when it cannot, the full-screen rental card says
// why in plain words instead of leaving a silent dead end.
import type { Movie } from './jellyfin';
import { esRomFile } from './es-library';
import { esCoreFor } from './es-gamelist';
import { openDemoPlaybackOverlay, type OverlayContent } from './demo-playback';

const note = (heading: string, subtitle: string, body: string): OverlayContent => ({ heading, subtitle, body });

/** The page the card shows: the emulator in its own same-origin frame, fed the ROM File. */
function playerHtml(core: string): string {
  // public/es-player.html is a bundled file (no inline script, so the Tauri CSP
  // allows it). Same origin means the picked File is handed over as a global
  // rather than a URL. A failed script load (offline) tells the parent so the
  // card can explain itself.
  const src = `${import.meta.env.BASE_URL}es-player.html?core=${encodeURIComponent(core)}`;
  return `<iframe id="es-player-frame" title="Game" allow="autoplay; gamepad; fullscreen" style="width:100%;height:100%;border:0;background:#000" src="${src}"></iframe>`;
}

/**
 * Open the rental card for an EmulationStation game. 'playing' when the
 * emulator was started, 'note' when the card explains why it could not be.
 */
export async function rentEsGame(movie: Movie, startHidden: boolean, fromCouch: boolean): Promise<'playing' | 'note'> {
  const show = (content: OverlayContent): 'note' => { openDemoPlaybackOverlay(movie.title, startHidden, 'game', fromCouch, content); return 'note'; };
  const rom = esRomFile(movie);
  if (!rom) {
    return show(note('ROM NOT IN YOUR FOLDER', 'THE BOX IS HERE BUT THE GAME ISN\'T',
      `Halcyon found "${movie.title}" in your EmulationStation list but no ROM file for it in the folder you chose. Choose the folder that holds your ROMs as well, in Settings under Video Games.`));
  }
  const core = esCoreFor(rom.system);
  if (!core) {
    return show(note('NO BROWSER PLAYER FOR THIS SYSTEM', (movie.platform || rom.system).toUpperCase(),
      `Halcyon's built-in player does not cover ${movie.platform || rom.system} yet. Play "${movie.title}" from your EmulationStation front end.`));
  }
  let file: File;
  try { file = await rom.file(); } catch {
    return show(note('COULD NOT READ THE ROM', 'THE FILE WOULD NOT OPEN', `"${movie.title}" could not be read from your folder. Choose the folder again in Settings under Video Games.`));
  }
  if (file.size === 0) {
    return show(note('THIS ROM FILE IS EMPTY', 'NOTHING TO PLAY', `The file for "${movie.title}" has no data in it, so there is nothing to run.`));
  }
  const w = window as any;
  w.__halcyonEsRom = file;
  const failed = (e: MessageEvent) => {
    if (e.data !== 'es-player-failed') return;
    const card = document.getElementById('demo-playback-overlay');
    if (card) card.insertAdjacentHTML('beforeend', '<p role="status" style="position:absolute;left:0;right:0;top:40%;color:#ffa903;font:16px \'Courier New\',monospace;text-align:center;padding:0 24px">The game player could not load. It needs an internet connection the first time.</p>');
  };
  window.addEventListener('message', failed);
  openDemoPlaybackOverlay(movie.title, startHidden, 'game', fromCouch, {
    html: playerHtml(core),
    onClose: () => { window.removeEventListener('message', failed); delete w.__halcyonEsRom; },
  });
  return 'playing';
}
