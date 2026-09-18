// Server-only Jellyfin identity bridge for operator-managed movie requests.
// The browser supplies a session token, never a server address or Seerr user id.
// Seerr's configured Jellyfin validates it; Seerr still enforces the linked
// user's request permissions, quotas and approval policy via X-Api-User.
export class SeerrIdentityError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const guid = value => typeof value === 'string' && /^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(value)
  ? value.replaceAll('-', '').toLowerCase() : null;

async function privateJson(fetchImpl, url, headers, signal) {
  const response = await fetchImpl(url, { headers, redirect: 'manual', signal });
  if (!response.ok || response.status >= 300) {
    await response.body?.cancel();
    throw new SeerrIdentityError(response.status === 401 || response.status === 403 ? 401 : 502,
      'Unable to verify your request account. Sign in to Jellyfin again and retry.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body || []) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new SeerrIdentityError(502, 'Request account response is too large.');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}

export async function seerrUserHeaders(service, token, fetchImpl, signal) {
  if (typeof token !== 'string' || !token || token.length > 4096 || /[^\x21-\x7e]/.test(token)) {
    throw new SeerrIdentityError(401, 'Sign in to Jellyfin before requesting a movie.');
  }
  const seerrHeaders = { accept: 'application/json', 'x-api-key': service.apiKey };
  const getSeerr = path => privateJson(fetchImpl, service.url + path, seerrHeaders, signal);
  const settings = await getSeerr('/api/v1/settings/jellyfin');
  const serverId = guid(settings.serverId);
  if (!serverId || typeof settings.ip !== 'string' || !settings.ip
      || /[\s/@?#\\]/.test(settings.ip) || !Number.isInteger(+settings.port)
      || settings.port < 1 || settings.port > 65535) {
    throw new SeerrIdentityError(403, 'The request service must be connected to your Jellyfin server.');
  }
  const basePath = settings.urlBase || '';
  if (typeof basePath !== 'string' || (basePath && !basePath.startsWith('/'))
      || /[%?#\\]/.test(basePath) || basePath.split('/').includes('..')) {
    throw new SeerrIdentityError(502, 'Invalid request service connection.');
  }
  const host = settings.ip.includes(':') && !settings.ip.startsWith('[') ? `[${settings.ip}]` : settings.ip;
  const jellyfin = new URL(`${settings.useSsl ? 'https' : 'http'}://${host}:${settings.port}${basePath.replace(/\/+$/, '')}/Users/Me`);
  const me = await privateJson(fetchImpl, jellyfin.href,
    { accept: 'application/json', 'x-emby-token': token }, signal);
  const userId = guid(me.Id);
  if (!userId || guid(me.ServerId) !== serverId || me.Policy?.IsDisabled) {
    throw new SeerrIdentityError(403, 'Your Jellyfin account does not match the request service.');
  }
  // Pagination also supports Jellyseerr versions without /user/jellyfin/:id.
  // Do not match display names, email addresses, or a browser-provided id.
  for (let skip = 0; skip < 10000; skip += 100) {
    const page = await getSeerr(`/api/v1/user?take=100&skip=${skip}`);
    if (!Array.isArray(page.results)) throw new SeerrIdentityError(502, 'Unable to look up your request account.');
    const user = page.results.find(user => guid(user.jellyfinUserId) === userId);
    if (user) {
      if (!Number.isSafeInteger(user.id) || user.id <= 0) break;
      return { 'x-api-key': service.apiKey, 'x-api-user': String(user.id) };
    }
    if (page.results.length < 100) break;
  }
  throw new SeerrIdentityError(403, 'Sign in to Jellyseerr with your Jellyfin account once, or ask the host to import it, then retry.');
}
