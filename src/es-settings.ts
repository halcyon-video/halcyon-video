import { setSetting } from './settings';
import { SettingsRowKit, type RowKitHooks } from './settings-rows';
import { chooseEsFolder, esConfigured, esStatus, forgetEsFolder } from './es-library';

// Video Games page controls for the EmulationStation library source (#407).
// Sits beside the Steam controls: both are optional extra shelves, neither is
// required, and Romm stays the server-based option above them.
export function buildEsControls(container: HTMLElement, hooks: RowKitHooks & { dirty: () => void }): void {
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.style.cssText = 'font-size:15px;padding:8px 12px;white-space:normal';
  status.textContent = esStatus();
  // The status line leads (it names the folder and says how many games came from it), so
  // the two action rows are the only rows this source adds to the page.
  container.append(status);
  const kit = new SettingsRowKit({ container, prefix: '__brand__:es-', hooks, preview() {}, commit() {} });
  const display = (text: string) => {
    status.textContent = text;
    kit.syncAll();
    document.getElementById('settings-drawer-overlay')?.dispatchEvent(new Event('input'));
  };
  let busy = false;
  const perform = async (work: () => Promise<void>) => {
    if (busy) return;
    busy = true;
    try { await work(); hooks.dirty(); }
    catch { display('That folder could not be read. Please try again.'); return; }
    finally { busy = false; }
    display(esStatus());
  };
  kit.confirmAction('choose', 'Choose EmulationStation folder', 'Pick the folder holding your gamelist.xml files (ES-DE, Batocera, RetroPie). It is read in your browser and never uploaded.',
    () => void perform(async () => { await chooseEsFolder(); if (esConfigured()) setSetting('bb_games_enabled', true); }));
  kit.confirmAction('forget', 'Forget game folder', 'Stop using this folder and take its games off the shelves.', () => void perform(forgetEsFolder));
}
