// Local-only Steam companion for Halcyon's browser launcher. Account cookies
// stay in WebKit's dedicated Steam profile; the page receives only its owned
// game catalogue and never a token or cookie.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const STORE = 'https://store.steampowered.com';
const API = 'https://api.steampowered.com';
const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};
const localAddress = value => {
  const address = String(value || '').split('%')[0];
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
};
export const browserSteamRequestAllowed = req => localAddress(req.socket?.remoteAddress);
export const browserSteamOriginAllowed = req => {
  if (!browserSteamRequestAllowed(req)) return false;
  const origin = req.headers?.origin;
  if (!origin) return true;
  try { return ['localhost', '127.0.0.1'].includes(new URL(origin).hostname); } catch { return false; }
};

export function parseCookieJar(text, now = Date.now() / 1000) {
  return String(text).split(/\r?\n/).map(line => line.startsWith('#HttpOnly_') ? line.slice(10) : line).filter(line => line && !line.startsWith('#')).flatMap(line => {
    const fields = line.split('\t');
    if (fields.length < 7 || !['store.steampowered.com', '.steampowered.com'].includes(fields[0])) return [];
    const expires = Number(fields[4]);
    if (expires && expires < now) return [];
    return [{ name: fields[5], value: fields.slice(6).join('\t') }];
  });
}

function cookieCandidates() {
  const configured = process.env.HALCYON_STEAM_COOKIE_JAR;
  const data = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local/share');
  return [configured,
    path.join(data, 'com.halcyonvideo.app/steam-browser/cookies'),
    path.join(os.homedir(), '.local/share/halcyon-steam-preview/data/com.halcyonvideo.app/steam-browser/cookies'),
  ].filter(Boolean);
}
function steamCookies() {
  for (const file of cookieCandidates()) {
    try {
      const cookies = parseCookieJar(fs.readFileSync(file, 'utf8'));
      if (cookies.some(cookie => cookie.name === 'steamLoginSecure')) return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    } catch {}
  }
  throw new Error('Sign in once through Halcyon Steam Preview, then return here and refresh.');
}
const safeFetchText = async (url, init = {}) => {
  let response;
  try { response = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(25_000) }); }
  catch { throw new Error('Steam could not be reached. Please try again.'); }
  if (response.status >= 300 && response.status < 400) throw new Error('Steam sign-in expired. Sign in again.');
  if (!response.ok) throw new Error(`Steam returned HTTP ${response.status}. Sign in again or retry later.`);
  return response.text();
};
function attributeJson(html, name) {
  const marker = `${name}=`;
  const at = html.indexOf(marker);
  if (at < 0) throw new Error('Steam sign-in expired or its page changed. Sign in again.');
  const tail = html.slice(at + marker.length);
  const quote = tail[0];
  if (quote !== "'" && quote !== '"') throw new Error('Steam returned an unfamiliar sign-in page.');
  const encoded = tail.slice(1).split(quote)[0] || '';
  const decoded = encoded.replaceAll('&quot;', '"').replaceAll('&#34;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
  try { return JSON.parse(decoded); } catch { throw new Error('Steam returned an unfamiliar sign-in response.'); }
}
async function readSession(cookie) {
  const html = await safeFetchText(`${STORE}/explore/`, { headers: { Cookie: cookie, 'User-Agent': 'HalcyonVideo/SteamLibrary' } });
  const user = attributeJson(html, 'data-userinfo');
  const config = attributeJson(html, 'data-store_user_config');
  if (user.logged_in !== true) throw new Error('Sign in once through Halcyon Steam Preview, then return here and refresh.');
  const steamId = typeof user.steamid === 'string' && /^\d{17}$/.test(user.steamid) ? user.steamid : null;
  const token = typeof config.webapi_token === 'string' && config.webapi_token ? config.webapi_token : null;
  if (!steamId || !token) throw new Error('Steam sign-in expired. Sign in again.');
  return { steamId, token };
}
async function readLibrary(cookie) {
  const { steamId, token } = await readSession(cookie);
  const query = new URLSearchParams({ access_token: token, steamid: steamId, include_appinfo: 'true', include_played_free_games: 'true', include_free_sub: 'true', language: 'english' });
  const text = await safeFetchText(`${API}/IPlayerService/GetOwnedGames/v1/?${query}`, { headers: { 'User-Agent': 'HalcyonVideo/SteamLibrary' } });
  let body; try { body = JSON.parse(text); } catch { throw new Error('Steam returned an invalid library.'); }
  const count = body?.response?.game_count;
  const games = body?.response?.games ?? (count === 0 ? [] : null);
  if (!Number.isInteger(count) || !Array.isArray(games) || games.length !== count) throw new Error('Steam returned an incomplete library. Please retry.');
  return { steamId, games };
}
function openSteamHelper() {
  const helper = process.env.HALCYON_STEAM_HELPER || path.join(os.homedir(), '.local/share/halcyon-steam-preview/launch');
  if (!fs.existsSync(helper)) throw new Error('Install Halcyon Steam Preview once to connect Steam in browser mode.');
  const child = spawn(helper, [], { detached: true, stdio: 'ignore' });
  child.unref();
}
async function readReviews(appIds) {
  if (!Array.isArray(appIds) || appIds.length > 100 || appIds.some(id => !Number.isInteger(id) || id <= 0)) throw new Error('Request up to 100 valid Steam games at a time.');
  const result = {};
  for (const id of appIds) {
    const query = new URLSearchParams({ json: '1', language: 'all', purchase_type: 'all', num_per_page: '0', filter: 'all' });
    const text = await safeFetchText(`${STORE}/appreviews/${id}?${query}`, { headers: { 'User-Agent': 'HalcyonVideo/SteamLibrary' } });
    let body; try { body = JSON.parse(text); } catch { throw new Error('Steam returned invalid review data.'); }
    const summary = body?.query_summary;
    if (body?.success !== 1 || !Number.isInteger(summary?.review_score) || summary.review_score > 9) throw new Error('Steam review data is temporarily unavailable.');
    result[id] = { score: summary.review_score, total: summary.total_reviews || 0, positive: summary.total_positive || 0 };
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  return result;
}
function gameRunning(appId) {
  let entries = []; try { entries = fs.readdirSync('/proc', { withFileTypes: true }); } catch { return false; }
  const exact = new Set([`SteamAppId=${appId}`, `SteamGameId=${appId}`]);
  return entries.some(entry => {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) return false;
    try { return fs.readFileSync(`/proc/${entry.name}/environ`).toString().split('\0').some(value => exact.has(value)); } catch { return false; }
  });
}
async function launchAndWait(appId) {
  const child = spawn('steam', [`steam://rungameid/${appId}`], { stdio: 'ignore' });
  child.on('error', () => {});
  const started = Date.now(); let seen = false; let missing = 0;
  while (true) {
    const running = gameRunning(appId);
    if (running) { seen = true; missing = 0; }
    else if (seen && ++missing >= 3) return;
    else if (!seen && Date.now() - started >= 120_000) throw new Error('Steam has not started the game yet. Finish any installation or prompts in Steam, then try again.');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}
async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 64 * 1024) throw new Error('Request too large.'); chunks.push(chunk); }
  try { return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; } catch { throw new Error('Invalid request.'); }
}

export function steamBrowserBridgePlugin() {
  const owned = new Set(); let launching = false;
  const middleware = async (req, res, next) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (!url.pathname.startsWith('/__halcyon/steam/')) return next();
    if (!browserSteamOriginAllowed(req)) return json(res, 403, { error: 'Steam controls are available only on the Halcyon computer.' });
    try {
      if (req.method === 'GET' && url.pathname.endsWith('/capability')) return json(res, 200, { available: cookieCandidates().some(file => { try { return parseCookieJar(fs.readFileSync(file, 'utf8')).some(c => c.name === 'steamLoginSecure'); } catch { return false; } }) });
      if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
      if (url.pathname.endsWith('/connect')) {
        try { await readSession(steamCookies()); return json(res, 200, { ok: true }); }
        catch { openSteamHelper(); throw new Error('Halcyon Steam Preview opened. Connect Steam there once, then return here and refresh.'); }
      }
      if (url.pathname.endsWith('/library')) {
        const library = await readLibrary(steamCookies()); owned.clear(); for (const game of library.games) owned.add(game.appid); return json(res, 200, library);
      }
      if (url.pathname.endsWith('/reviews')) return json(res, 200, await readReviews((await body(req)).appIds));
      if (url.pathname.endsWith('/launch')) {
        const appId = (await body(req)).appId;
        if (!owned.has(appId)) throw new Error('Refresh your Steam library before launching this game.');
        if (launching) throw new Error('A Steam game is already starting or running.');
        launching = true; try { await launchAndWait(appId); } finally { launching = false; }
        return json(res, 200, { ok: true });
      }
      return json(res, 404, { error: 'Unknown Steam action.' });
    } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'Steam could not complete this request.' }); }
  };
  return { name: 'steam-browser-bridge', configureServer(server) { server.middlewares.use(middleware); }, configurePreviewServer(server) { server.middlewares.use(middleware); } };
}
