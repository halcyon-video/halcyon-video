// The Plex half of the login screen (GH #32).
//
// Jellyfin's login is one form submit. Plex's is a conversation with a third
// party: mint a PIN on plex.tv, wait for the person to authorize it somewhere
// else, then ask the account which servers it owns. That is a different UI
// shape, not a different request shape, which is what capabilities.
// directServerLogin: false is telling the caller — so it lives in its own
// module and boot-flow.ts only asks it two questions: "which backend is
// selected" and "do you have an account token yet".
import {
  createPlexPin,
  fetchPlexServers,
  pollPlexPin,
  type PlexServer,
} from './plex';
import { PROVIDER_KIND_KEY } from './providers/active-provider';

/** Where the plex.tv account token is remembered between boots. */
export const PLEX_ACCOUNT_TOKEN_KEY = 'plex_account_token';

const POLL_INTERVAL_MS = 2000;
/** plex.tv gives a plain (four-character) PIN 15 minutes; don't outlive it. */
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

type El<T extends HTMLElement = HTMLElement> = T | null;
const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as El<T>;

let accountToken: string | null = null;
let discovered: PlexServer[] = [];
let polling = false;

export function selectedBackendKind(): string {
  return byId<HTMLSelectElement>('login-backend')?.value || 'jellyfin';
}

/** The token the PIN flow obtained this session, or one from a previous boot. */
export function plexAccountToken(): string | null {
  if (accountToken) return accountToken;
  try {
    return localStorage.getItem(PLEX_ACCOUNT_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Swap the form between "type credentials at the server" and "authorize on
 * plex.tv". Also writes provider_kind, because the choice has to survive the
 * reload that follows a successful connect — activeProvider() reads it on the
 * very next boot, before any of this code runs again.
 */
export function applyBackendSelection(kind: string): void {
  const isPlex = kind === 'plex';
  const creds = byId('login-direct-creds');
  const plex = byId('login-plex-signin');
  const title = byId('login-backend-title');
  const url = byId<HTMLInputElement>('login-url');
  const user = byId<HTMLInputElement>('login-user');

  if (creds) creds.style.display = isPlex ? 'none' : '';
  if (plex) plex.style.display = isPlex ? '' : 'none';
  if (title) title.innerText = isPlex ? 'Plex Server' : 'Jellyfin Server';
  // `required` on a hidden input blocks form submission with a validation
  // bubble pointing at something nobody can see.
  if (user) user.required = false;
  if (url && !url.value.trim()) {
    url.placeholder = isPlex ? 'http://192.168.1.50:32400' : 'http://192.168.1.50:8096';
  }
  try {
    localStorage.setItem(PROVIDER_KIND_KEY, kind);
  } catch {
    // A store that can't persist the choice still connects this session.
  }
}

/** Fill the server dropdown from the account, and adopt the first address. */
function showServers(servers: PlexServer[], log?: (m: string) => void): void {
  discovered = servers;
  const group = byId('plex-server-group');
  const select = byId<HTMLSelectElement>('plex-server');
  const url = byId<HTMLInputElement>('login-url');
  if (!select || !group) return;

  select.innerHTML = '';
  for (const s of servers) {
    for (const conn of s.connections) {
      const opt = document.createElement('option');
      opt.value = conn;
      opt.text = servers.length > 1 || s.connections.length > 1 ? `${s.name} — ${conn}` : s.name;
      select.appendChild(opt);
    }
  }
  group.style.display = servers.length ? '' : 'none';
  if (url && select.options.length) url.value = select.options[0].value;
  select.addEventListener('change', () => {
    if (url) url.value = select.value;
  });
  log?.(`[System] Plex account has ${servers.length} server(s).`);
}

async function loadServers(token: string, log?: (m: string) => void): Promise<void> {
  const status = byId('plex-pin-status');
  try {
    const servers = await fetchPlexServers(token);
    if (!servers.length) {
      if (status) {
        status.innerText =
          'Signed in, but this account has no servers. Enter the address yourself.';
      }
      return;
    }
    showServers(servers, log);
    if (status) status.innerText = 'Signed in. Pick a server, then Connect & Sync.';
  } catch (e: any) {
    // Discovery is a convenience — a LAN address typed by hand still works.
    if (status) status.innerText = `Signed in, but couldn't list servers: ${e?.message ?? e}`;
  }
}

/**
 * Mint a PIN, show it, and poll until the person authorizes it. Everything the
 * viewer needs is on screen at once — the code for a keyboard, the QR for a
 * phone — because this screen is usually being read from a couch.
 */
export async function beginPlexSignIn(log?: (m: string) => void): Promise<void> {
  if (polling) return;
  const panel = byId('plex-pin-panel');
  const codeEl = byId('plex-pin-code');
  const qrEl = byId<HTMLImageElement>('plex-pin-qr');
  const status = byId('plex-pin-status');
  const button = byId<HTMLButtonElement>('btn-plex-pin');

  try {
    if (button) button.disabled = true;
    const pin = await createPlexPin();
    if (panel) panel.style.display = '';
    if (codeEl) codeEl.innerText = pin.code;
    if (qrEl) qrEl.src = pin.qrUrl;
    if (status) status.innerText = 'Waiting for you to authorize…';
    log?.(`[System] Plex sign-in code: ${pin.code}`);

    // Opening the tab is a convenience; the code and QR are the real path, and
    // a kiosk with no browser to hand off to still completes the flow.
    try {
      window.open(pin.authUrl, '_blank', 'noopener');
    } catch {
      /* popup blocked — the code on screen is still valid */
    }

    polling = true;
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      let token: string | null = null;
      try {
        token = await pollPlexPin(pin.id);
      } catch (e: any) {
        if (status) status.innerText = e?.message ?? 'Sign-in failed — try again.';
        break;
      }
      if (token) {
        accountToken = token;
        try {
          localStorage.setItem(PLEX_ACCOUNT_TOKEN_KEY, token);
        } catch {
          /* session-only sign-in is still a sign-in */
        }
        if (status) status.innerText = 'Signed in. Finding your servers…';
        log?.('[System] Plex account linked.');
        await loadServers(token, log);
        return;
      }
    }
    if (status && !accountToken) status.innerText = 'That code expired — get a new one.';
  } catch (e: any) {
    if (status) status.innerText = e?.message ?? 'Could not reach plex.tv.';
    log?.(`[System] Plex sign-in error: ${e?.message ?? e}`);
  } finally {
    polling = false;
    if (button) button.disabled = false;
  }
}

/** Wire the backend picker and the sign-in button. Idempotent. */
export function setupPlexSignInHandlers(log?: (m: string) => void): void {
  const select = byId<HTMLSelectElement>('login-backend');
  const button = byId('btn-plex-pin');
  if (select) {
    // Reflect a previously chosen backend so a reconnect doesn't silently
    // revert an install to Jellyfin.
    try {
      const saved = localStorage.getItem(PROVIDER_KIND_KEY);
      if (saved && [...select.options].some((o) => o.value === saved)) select.value = saved;
    } catch {
      /* fall through to the default selection */
    }
    applyBackendSelection(select.value);
    select.addEventListener('change', () => applyBackendSelection(select.value));
  }
  button?.addEventListener('click', () => void beginPlexSignIn(log));

  // A remembered token means the servers can be listed without a new code.
  const existing = plexAccountToken();
  if (existing && selectedBackendKind() === 'plex') void loadServers(existing, log);
}

/** For tests and the setup terminal — the servers discovery last found. */
export function discoveredPlexServers(): PlexServer[] {
  return discovered;
}
