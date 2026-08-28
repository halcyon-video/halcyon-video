// Server-wide connection defaults (GH #129).
//
// An operator hosting Halcyon for other people wants their visitors to arrive
// in a store that is already wired up to the house Romm / Jellyseerr, WITHOUT
// handing each of them the API key. Two tiers exist, and which one is running
// changes what a visitor can see:
//
//   TIER 1 — build-time env (`VITE_ROMM_URL` / `VITE_ROMM_APIKEY`, …).
//     Seeded into each visitor's localStorage on first boot (boot-flow.ts).
//     The key is INSIDE THE BUNDLE: every visitor can read it from devtools.
//     Fine for a household, wrong for a public instance. Nothing here.
//
//   TIER 2 — server-side env (`HALCYON_ROMM_URL` / `HALCYON_ROMM_APIKEY`, …),
//     deliberately NOT `VITE_`-prefixed, so vite never inlines them into the
//     bundle. This module is that tier. The browser is told the service's
//     ADDRESS (it has to be, to name a proxy target and to build art URLs) and
//     nothing else; the credential is attached host-side by /dev-proxy
//     (vite.config.ts) on its way out. It appears in no bundle, no
//     localStorage, and no request the browser can inspect.
//
// The file is deliberately IMPORT-FREE and touches no browser global at module
// scope, because it is loaded from three places that share nothing else: the
// browser bundle, `vite.config.ts` (node, where the secrets live), and
// `node --test` (tests/operator-defaults.test.ts).

export type OperatorServiceId = 'romm' | 'jellyseerr';

/** What the BROWSER is allowed to know about an operator-configured service. */
export interface OperatorService {
  /** Base URL of the operator's server, no trailing slash. */
  url: string;
  /**
   * True when the credential lives on the server and /dev-proxy attaches it.
   * The client then holds no key at all and must send none — see romm.ts /
   * jellyseerr.ts, which omit their auth header entirely in this mode.
   */
  managed: boolean;
}

export type OperatorDefaults = Partial<Record<OperatorServiceId, OperatorService>>;

/** Where the client asks what this server provides. Served by vite.config.ts. */
export const OPERATOR_CONFIG_PATH = '/__halcyon/config';

// ─── Server side: reading the operator's env ─────────────────────────────────

/** A service the SERVER knows about, credential included. Never leaves node. */
export interface OperatorSecret {
  url: string;
  apiKey: string;
}

export type OperatorEnvConfig = Partial<Record<OperatorServiceId, OperatorSecret>>;

// Accepted env prefixes per service, in preference order. The seerr aliases
// mirror seerr-config.ts's stored-key aliases: one client serves Jellyseerr and
// Overseerr alike (GH #50), so an Overseerr operator shouldn't have to set a
// variable named after the other fork.
const ENV_PREFIXES: Record<OperatorServiceId, string[]> = {
  romm: ['HALCYON_ROMM'],
  jellyseerr: ['HALCYON_JELLYSEERR', 'HALCYON_SEERR', 'HALCYON_OVERSEERR'],
};

/**
 * Pick the operator-configured services out of a process environment.
 *
 * Both halves are required, exactly as getRommConfig()/getJellyseerrConfig()
 * require both halves client-side: a URL with no key would send unauthenticated
 * requests that fail one by one, which reads to the operator as a broken server
 * rather than as an unfinished config.
 */
export function readOperatorEnv(env: Record<string, string | undefined>): OperatorEnvConfig {
  const out: OperatorEnvConfig = {};
  for (const id of Object.keys(ENV_PREFIXES) as OperatorServiceId[]) {
    for (const prefix of ENV_PREFIXES[id]) {
      const url = (env[`${prefix}_URL`] || '').trim();
      const apiKey = (env[`${prefix}_APIKEY`] || env[`${prefix}_API_KEY`] || '').trim();
      if (!url || !apiKey) continue;
      if (!/^https?:\/\//i.test(url)) continue; // a bare host can't be a proxy target
      out[id] = { url: url.replace(/\/+$/, ''), apiKey };
      break;
    }
  }
  return out;
}

/** The same config with every credential stripped — this is what the browser gets. */
export function publicOperatorDefaults(cfg: OperatorEnvConfig): OperatorDefaults {
  const out: OperatorDefaults = {};
  for (const id of Object.keys(cfg) as OperatorServiceId[]) {
    const svc = cfg[id];
    if (svc) out[id] = { url: svc.url, managed: true };
  }
  return out;
}

/**
 * Is `target` a request to this service's own server?
 *
 * Compared as origin + path prefix at a SEGMENT boundary, never as a raw string
 * prefix: `https://romm.example.com.evil.test/` and `https://host/romm-public`
 * both begin with a legitimate base and neither is the operator's server. This
 * is the whole gate deciding whether the operator's credential gets attached,
 * so anything it can't parse is a no.
 */
export function targetBelongsTo(target: string, baseUrl: string): boolean {
  let t: URL, b: URL;
  try {
    t = new URL(target);
    b = new URL(baseUrl);
  } catch {
    return false;
  }
  if (t.protocol !== b.protocol || t.host !== b.host) return false;
  const basePath = b.pathname.replace(/\/+$/, '');
  if (!basePath) return true;
  return t.pathname === basePath || t.pathname.startsWith(`${basePath}/`);
}

/** Which operator service, if any, owns this proxy target. */
export function operatorServiceForTarget(
  cfg: OperatorEnvConfig,
  target: string
): OperatorServiceId | null {
  for (const id of Object.keys(cfg) as OperatorServiceId[]) {
    const svc = cfg[id];
    if (svc && targetBelongsTo(target, svc.url)) return id;
  }
  return null;
}

// What a VISITOR may spend the operator's credential on. The address of the
// operator's server is necessarily public (the browser names it as the proxy
// target), so without this the proxy would be an authenticated open door onto
// their Romm/Jellyseerr for anyone who loaded the page — delete a rom, read the
// user list, approve requests. These are the endpoints the store itself calls,
// and nothing else; a store feature that needs a new endpoint adds it here
// deliberately.
const OPERATOR_ALLOWED: Record<OperatorServiceId, { GET: RegExp; POST?: RegExp }> = {
  // Reads of the game catalog and its artwork. Not /api/users, /api/config, …
  romm: { GET: /^\/(?:api\/(?:platforms|roms|collections|stats)(?:\/|$|\?)|assets\/)/ },
  jellyseerr: {
    GET: /^\/api\/v1\/(?:auth\/me(?:\?|$)|request(?:\/|\?|$)|movie\/|collection\/|discover\/|watchproviders\/)/,
    // "Order it for me" — the clerk's whole reason for existing on a hosted
    // store. Creating a request is the one thing a visitor may WRITE, and it
    // is the COLLECTION endpoint exactly: /api/v1/request/<id>/approve is a
    // POST too, and letting a visitor approve their own order (or anyone
    // else's) on the operator's server is not the same favour at all.
    POST: /^\/api\/v1\/request(?:\?|$)/,
  },
};

/**
 * May this request ride the operator's credential? `target` is the full URL;
 * only its path + query are matched, so a query string can't smuggle a path.
 */
export function operatorRequestAllowed(
  service: OperatorServiceId,
  method: string,
  target: string
): boolean {
  let pathAndQuery: string;
  try {
    const u = new URL(target);
    pathAndQuery = `${u.pathname}${u.search}`;
  } catch {
    return false;
  }
  const rules = OPERATOR_ALLOWED[service];
  const verb = String(method || 'GET').toUpperCase();
  if (verb === 'GET' || verb === 'HEAD') return rules.GET.test(pathAndQuery);
  if (verb === 'POST' && rules.POST) return rules.POST.test(pathAndQuery);
  return false;
}

/**
 * The credential headers to attach host-side. Romm speaks HTTP Basic when the
 * key is a `user:password` pair and Bearer otherwise (romm.ts authHeader);
 * Jellyseerr/Overseerr speak X-Api-Key.
 */
export function operatorAuthHeaders(
  service: OperatorServiceId,
  secret: OperatorSecret
): Record<string, string> {
  if (service === 'romm') {
    return {
      authorization: secret.apiKey.includes(':')
        ? `Basic ${base64(secret.apiKey)}`
        : `Bearer ${secret.apiKey}`,
    };
  }
  return { 'x-api-key': secret.apiKey };
}

// btoa in the browser, Buffer under node — this module is loaded by both and
// imports nothing, so it cannot just reach for either one.
function base64(s: string): string {
  const g = globalThis as any;
  if (typeof g.btoa === 'function') return g.btoa(s);
  return g.Buffer.from(s, 'utf8').toString('base64');
}

// ─── Client side: what this server told us ───────────────────────────────────

let loaded: OperatorDefaults = {};

/** Test/harness seam, and how loadOperatorDefaults() publishes its result. */
export function setOperatorDefaults(defaults: OperatorDefaults | null | undefined): void {
  loaded = defaults && typeof defaults === 'object' ? defaults : {};
}

/** The operator's default for one service, or null when they configured none. */
export function operatorDefault(id: OperatorServiceId): OperatorService | null {
  const svc = loaded[id];
  return svc && svc.url ? svc : null;
}

/** Does this instance carry operator-provided connection defaults at all? */
export function hasOperatorDefaults(): boolean {
  return !!(loaded.romm || loaded.jellyseerr);
}

/**
 * Ask the server what it provides, once, at boot.
 *
 * Silent and harmless everywhere it doesn't apply: the Tauri shell has no vite
 * server, a static host (GitHub Pages, the hosted demo) answers the path with
 * its index.html, and an operator who configured nothing gets `{}`. Any of
 * those leaves the store exactly as it was — this must never be able to fail a
 * boot, so every outcome that isn't a well-formed JSON body is "no defaults".
 */
export async function loadOperatorDefaults(): Promise<OperatorDefaults> {
  if (typeof fetch !== 'function') return {};
  // The desktop shell talks to its servers through Rust, not through a vite
  // middleware, so there is no server here to hold a key on the operator's
  // behalf — and no hosting to do it for.
  if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined) return {};
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 4000) : null;
  try {
    const res = await fetch(OPERATOR_CONFIG_PATH, {
      headers: { Accept: 'application/json' },
      signal: controller?.signal,
    });
    if (!res.ok) return {};
    if (!(res.headers.get('content-type') || '').includes('json')) return {}; // static host's index.html
    const body = await res.json();
    const defaults: OperatorDefaults = {};
    for (const id of ['romm', 'jellyseerr'] as OperatorServiceId[]) {
      const svc = body?.[id];
      if (svc && typeof svc.url === 'string' && svc.url) {
        defaults[id] = { url: svc.url.replace(/\/+$/, ''), managed: svc.managed !== false };
      }
    }
    setOperatorDefaults(defaults);
    return defaults;
  } catch {
    return {};
  } finally {
    if (timer) clearTimeout(timer);
  }
}
