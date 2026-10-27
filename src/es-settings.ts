import { setSetting } from './settings';
import { SettingsRowKit, type RowKitHooks } from './settings-rows';
import { chooseEsFolder, esConfigured, esFolderName, esStatus, forgetEsFolder } from './es-library';

// Video Games page controls for the EmulationStation library source (#407).
// Sits beside the Steam controls: both are optional extra shelves, neither is
// required, and Romm stays the server-based option above them.
export function buildEsControls(container: HTMLElement, hooks: RowKitHooks & { dirty: () => void }): void {
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.style.cssText = 'font-size:15px;padding:8px 12px;white-space:normal';
  status.textContent = esStatus();
  const kit = new SettingsRowKit({ container, prefix: '__brand__:es-', hooks, preview() {}, commit() {} });
  let shown = esStatus();
  const statusRow = kit.readout('status', 'Game folder', esConfigured() ? esFolderName() : 'None chosen', () => (esConfigured() ? esFolderName() : 'None chosen'));
  const display = (text: string) => {
    shown = text; status.textContent = text; statusRow.dataset.hint = text;
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
  container.append(status);
  void shown;
}
