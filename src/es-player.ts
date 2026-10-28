// Renting a game from the EmulationStation folder (issue #408). The ROM is a
// file the visitor already picked, so it plays in the browser with EmulatorJS
// (the same player Romm uses); when it cannot, the full-screen rental card says
// why in plain words instead of leaving a silent dead end.
import type { Movie } from './jellyfin';
import { esRomFile } from './es-library';
import { esCoreFor } from './es-gamelist';
import { openDemoPlaybackOverlay, type OverlayContent } from './demo-playback';

const EJS_DATA = 'https://cdn.emulatorjs.org/stable/data/';

const note = (heading: string, subtitle: string, body: string): OverlayContent => ({ heading, subtitle, body });

/** The page the card shows: the emulator in its own frame, fed the ROM File. */
function playerHtml(core: string): string {
  // The iframe shares this page's origin, so the picked File is handed over as
  // a global rather than a URL (EmulatorJS takes a File and keeps its name,
  // which is how it knows the ROM's type). A failed script load (offline, or a
  // strict CSP) tells the parent so the card can explain itself.
  const doc = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000;overflow:hidden">`
    + `<div id="game" style="width:100%;height:100vh"></div><script>`
    + `var f=parent.__halcyonEsRom;EJS_player='#game';EJS_core='${core}';EJS_pathtodata='${EJS_DATA}';`
    + `EJS_gameUrl=new File([f],f.name);EJS_startOnLoaded=true;EJS_color='#ffa903';<\/script>`
    + `<script src="${EJS_DATA}loader.js" onerror="parent.postMessage('es-player-failed','*')"><\/script>`;
  return `<iframe id="es-player-frame" title="Game" allow="autoplay; gamepad; fullscreen" style="width:100%;height:100%;border:0;background:#000" srcdoc="${doc.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></iframe>`;
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
