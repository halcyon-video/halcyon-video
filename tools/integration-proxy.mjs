// Server-only integration boundary. All destinations come from operator config;
// browser CORS and Host checks are not authentication or proxy authorization.
import { operatorServiceForTarget, operatorRequestAllowed, operatorAuthHeaders, targetBelongsTo } from '../src/operator-defaults.ts';

import { SeerrIdentityError, seerrUserHeaders } from './seerr-user-auth.mjs';

const MAX_BODY = 64 * 1024;
const MAX_RESPONSE = 8 * 1024 * 1024;
const CATALOG_KEYS = new Set(('id title name originalTitle overview posterPath backdropPath releaseDate firstAirDate runtime voteAverage voteCount genreIds genres mediaType mediaInfo status status4k tmdbId credits cast crew job character productionCompanies collection parts results page totalPages totalResults pageInfo pages pageSize media total items limit offset slug romCount rom_count platform platform_id platforms summary rating fs_name fs_name_no_ext file_name first_release_date release_date metadatum igdb_metadata ss_metadata sibling_roms path_cover_l path_cover_large path_cover_s url_cover box2d_side_path box2d_side_url box2d_back_path box2d_back_url physical_path physical_url').split(' '));

// Explicit public catalog fields, recursively: new upstream account/settings
// fields never become public by default. Request actors and internal URLs vanish.
export function publicCatalog(value, depth = 0) {
  if (depth > 20) return null;
  if (Array.isArray(value)) return value.map(v => publicCatalog(v, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => CATALOG_KEYS.has(key))
    .map(([key, v]) => [key, publicCatalog(v, depth + 1)]));
  return value;
}
function json(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}
function sameSite(req) {
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
async function readBounded(stream, max) {
  const chunks = [];
  let length = 0;
  for await (const chunk of stream) {
    length += chunk.length;
    if (length > max) throw new Error('size limit');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
export function createIntegrationProxy(config, { fetchImpl = fetch, env = process.env } = {}) {
  const extra = (env.HALCYON_PROXY_ALLOWED_URLS || '').split(',').map(x => x.trim()).filter(Boolean);
  let active = 0;
  return async (req, res, next) => {
    if ((req.url || '').split('?')[0] !== '/dev-proxy') return next();
    if (!sameSite(req)) return json(res, 403, { error: 'Cross-site request denied' });
    const target = String(req.headers['x-proxy-target'] || '');
    let u;
    try {
      u = new URL(target);
      if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.hash || /[%\\]/.test(u.pathname)) throw 0;
    } catch { return json(res, 400, { error: 'Invalid proxy target' }); }
    const service = operatorServiceForTarget(config, target);
    const base = service ? config[service].url : extra.find(url => targetBelongsTo(target, url));
    if (!base) return json(res, 403, { error: 'Destination is not configured by this server operator' });
    const method = String(req.method || 'GET').toUpperCase();
    const ownAuth = !!(req.headers['x-api-key'] || req.headers.authorization);
    const kind = service || (u.pathname.includes('/api/v1/') ? 'jellyseerr' : 'romm');
    const relativePath = u.pathname.slice(new URL(base).pathname.replace(/\/+$/, '').length);
    const movieRequest = kind === 'jellyseerr' && method === 'POST' && relativePath === '/api/v1/request' && !u.search;
    const ownRequest = ownAuth && movieRequest;
    const userRequest = !ownAuth && service === 'jellyseerr' && movieRequest && !!req.headers['x-halcyon-jellyfin-token'];
    const writeRequest = ownRequest || userRequest;
    if ((!service && !ownAuth) || (!writeRequest && !operatorRequestAllowed(kind, method, target, base))) {
      return json(res, 403, { error: 'This operation requires your own service credentials; shared credentials are read-only' });
    }
    if (active >= 16) return json(res, 503, { error: 'Integration busy; retry later' });
    active++;
    try {
      if (Number(req.headers['content-length']) > MAX_BODY) return json(res, 413, { error: 'Payload too large' });
      let body;
      try { body = await readBounded(req, MAX_BODY); }
      catch { return json(res, 413, { error: 'Payload too large' }); }
      if (writeRequest) {
        let data;
        try { data = JSON.parse(body.toString()); } catch { return json(res, 400, { error: 'Invalid request' }); }
        if (data?.mediaType !== 'movie' || !Number.isSafeInteger(data.mediaId) || data.mediaId <= 0) return json(res, 400, { error: 'Invalid movie request' });
        body = Buffer.from(JSON.stringify({ mediaType: 'movie', mediaId: data.mediaId }));
      } else if (body.length) return json(res, 400, { error: 'Read requests cannot carry a body' });
      const signal = AbortSignal.timeout(20000);
      const headers = { accept: 'application/json', 'content-type': 'application/json' };
      if (userRequest) {
        Object.assign(headers, await seerrUserHeaders(config.jellyseerr, req.headers['x-halcyon-jellyfin-token'], fetchImpl, signal));
      } else if (ownAuth) {
        for (const key of ['x-api-key', 'authorization']) if (req.headers[key]) headers[key] = String(req.headers[key]);
      } else Object.assign(headers, operatorAuthHeaders(service, config[service]));
      // Never follow redirects with secrets (including X-Api-Key), even within
      // one origin: each permitted route has to pass the policy itself.
      const r = await fetchImpl(target, { method, headers, body: writeRequest ? body : undefined,
        redirect: 'manual', signal });
      if (r.status >= 300 && r.status < 400) {
        await r.body?.cancel();
        return json(res, 502, { error: 'Integration redirects are disabled' });
      }
      if (!r.ok || writeRequest || method === 'HEAD' || relativePath === '/api/v1/auth/me') {
        await r.body?.cancel();
        return json(res, r.status, r.ok ? { ok: true } : { error: 'Integration request failed', status: r.status });
      }
      if (Number(r.headers.get('content-length')) > MAX_RESPONSE) {
        await r.body?.cancel();
        return json(res, 502, { error: 'Integration response too large' });
      }
      const bytes = await readBounded(r.body || [], MAX_RESPONSE);
      const contentType = (r.headers.get('content-type') || '').split(';')[0];
      if (kind === 'romm' && relativePath.startsWith('/assets/') && ['image/png', 'image/jpeg', 'image/webp'].includes(contentType)) {
        res.statusCode = r.status;
        res.setHeader('Content-Type', contentType);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return res.end(bytes);
      }
      if (!contentType.includes('json')) return json(res, 502, { error: 'Invalid integration response' });
      return json(res, r.status, publicCatalog(JSON.parse(bytes.toString())));
    } catch (error) {
      if (error instanceof SeerrIdentityError) return json(res, error.status, {
        error: error.message, ...(error.code ? { code: error.code, upstreamStatus: error.upstreamStatus } : {}),
      });
      // Upstream URLs, bodies and exception messages can contain credentials.
      return json(res, 502, { error: 'Integration unavailable' });
    } finally { active--; }
  };
}
export function integrationProxyPlugin(config) {
  const handler = createIntegrationProxy(config);
  return { name: 'integration-proxy', configureServer(s) { s.middlewares.use(handler); },
    configurePreviewServer(s) { s.middlewares.use(handler); } };
}

// Playback control, feedback files and seeded Remote Play were unintentionally
// exposed by public reverse proxies. Default to direct loopback access only.
export function createLocalEndpointGuard(env = process.env) {
  return (req, res, next) => {
    const pathname = (req.url || '').split('?')[0];
    if (!/^\/__(?:play|feedback|remote)/.test(pathname)) return next();
    if (!sameSite(req)) return json(res, 403, { error: 'Cross-site request denied' });
    if (env.HALCYON_TRUSTED_NETWORK_CONTROLS === '1') return next();
    const peer = req.socket?.remoteAddress;
    let host;
    try { host = new URL(`http://${req.headers.host}`).hostname; } catch { host = ''; }
    const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
    const forwarded = Object.keys(req.headers).some(h => h === 'forwarded' || h.startsWith('x-forwarded-'));
    if (loopback.includes(peer) && ['localhost', '127.0.0.1', '[::1]'].includes(host) && !forwarded) return next();
    return json(res, 403, { error: 'Local controls require direct loopback access' });
  };
}
export function localEndpointGuardPlugin() {
  const handler = createLocalEndpointGuard();
  return { name: 'local-control-boundary', configureServer(s) { s.middlewares.use(handler); },
    configurePreviewServer(s) { s.middlewares.use(handler); } };
}
