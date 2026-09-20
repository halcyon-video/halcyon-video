import { setSetting } from './settings';
import { SettingsRowKit, type RowKitHooks } from './settings-rows';
import { connectSteam, disconnectSteam, refreshSteam, steamStatus, hasSteamNative } from './providers/steam-provider';
export function buildSteamControls(container: HTMLElement, hooks: RowKitHooks & { dirty: () => void }): void {
  if (!hasSteamNative()) return;
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.style.cssText = 'font-size:15px;padding:8px 12px;white-space:normal';
  status.textContent = steamStatus();
  const kit = new SettingsRowKit({ container, prefix: '__brand__:steam-', hooks, preview() {}, commit() {} });
  let displayedStatus = steamStatus();
  const statusRow = kit.readout('status', 'Steam status', displayedStatus, () => displayedStatus);
  const display = (text: string) => {
    displayedStatus = text; status.textContent = text; statusRow.dataset.hint = text;
    kit.syncAll();
    document.getElementById('settings-drawer-overlay')?.dispatchEvent(new Event('input'));
  };
  let busy = false;
  const perform = async (work: () => Promise<void>, refresh = false) => {
    if (busy) return;
    busy = true;
    display('Working with Steam…');
    const progress = window.setInterval(() => { if (status.isConnected) display(steamStatus()); }, 500);
    try {
      await work();
      if (refresh) hooks.dirty();
      display(steamStatus());
    } catch (error) { display(typeof error === 'string' ? error : 'Steam could not complete this request. Please try again.'); }
    finally { clearInterval(progress); busy = false; }
  };
  kit.confirmAction('connect', 'Connect Steam', 'Sign in directly with Steam. Halcyon never asks for your password or an API key.', () => void perform(connectSteam));
  kit.confirmAction('refresh', 'Refresh Steam library', 'Reads your current account and selected review tier. Large libraries may take a few minutes.', () => void perform(async () => { await refreshSteam(); setSetting('bb_games_enabled', true); }, true));
  kit.confirmAction('disconnect', 'Disconnect Steam', 'Clear this Steam sign-in and remove its games from Halcyon.', () => void perform(disconnectSteam, true));
  container.append(status);
}
