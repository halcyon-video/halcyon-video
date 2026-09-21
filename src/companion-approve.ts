import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

const requestId = new URLSearchParams(location.search).get('request') || '';
const origin = document.getElementById('origin')!;
const error = document.getElementById('error')!;
const allow = document.getElementById('allow') as HTMLButtonElement;
const deny = document.getElementById('deny') as HTMLButtonElement;
const current = getCurrentWindow();
let decided = false;

async function reject(): Promise<void> {
  if (decided) return;
  decided = true;
  try { await invoke('steam_companion_deny', { requestId }); } finally { await current.destroy(); }
}

async function initialize(): Promise<void> {
  try {
    origin.textContent = await invoke<string>('steam_companion_pending', { requestId });
    allow.disabled = false;
  } catch {
    origin.textContent = 'This pairing request is invalid or expired.';
  }
}

allow.onclick = async () => {
  if (decided) return;
  decided = true; allow.disabled = true; deny.disabled = true;
  try { await invoke('steam_companion_approve', { requestId }); }
  catch { decided = false; deny.disabled = false; error.textContent = 'The request could not be approved.'; }
};
deny.onclick = () => { void reject(); };
void current.onCloseRequested(event => { if (!decided) { event.preventDefault(); void reject(); } });
void initialize();
