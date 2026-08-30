// Plex Media Server as a catalog source (GH #32).
//
// Sibling of jellyfin.ts: all Plex HTTP and all Plex→domain mapping lives here,
// and providers/plex-provider.ts is the thin MediaSourceProvider over it. The
// store's own code never imports this file.
//
// Everything below was written against a real PMS (1.43.3) rather than from
// Plex's documentation, which is unofficial and in places wrong. The shapes
// that surprised us are called out where they matter — see fetchPlexLibraries
// AndMovies (one round trip per library, but only with includeGuids), and
// reportPlexPlaybackProgress (/:/timeline is not the endpoint you want).
//
// TRANSPORT: plain fetch, in both shells. Jellyfin needs the Rust bridge
// because a browser can't set its Authorization header cross-origin, but PMS
// answers CORS preflight for `x-plex-token` and echoes the requesting origin,
// and plex.tv sends `access-control-allow-origin: *`. Verified on the wire, so
// this backend needs no Rust command and behaves the same in the browser build
// as in the desktop one.
import type {
  Episode,
  Library,
  LibrarySummary,
  MediaPlaybackInfo,
  MediaStreamInfo,
  Movie,
  MovieVersion,
} from './providers/media-source-provider.ts';

/** Plex reports every duration in MILLISECONDS; the store speaks ticks. */
const TICKS_PER_MS = 10_000;

const PLEX_TV = 'https://plex.tv';

// ─── Client identity ─────────────────────────────────────────────────────────
//
// X-Plex-Client-Identifier is Plex's device id, and it carries the same hazard
// the Jellyfin DeviceId did (see the note above jellyfinDeviceId): Plex keys a
// device row — and the authorization attached to it — on this string, so a
// constant baked into the app would make every install one device, and linking
// a second one would disturb the first. It is also the value the plex.tv PIN is
// minted against: poll a PIN with a different identifier than you created it
// with and plex.tv answers 400, which is a genuinely confusing failure if the
// id is not stable. Generated once, persisted, per install.
const CLIENT_ID_KEY = 'plex_client_id';

/** Fallback for a DOM-less caller (unit tests, tooling) — never persisted. */
const FALLBACK_CLIENT_ID = 'halcyon-video-client';

export function plexClientIdentifier(): string {
  if (typeof localStorage === 'undefined') return FALLBACK_CLIENT_ID;
  try {
    const saved = localStorage.getItem(CLIENT_ID_KEY);
    if (saved) return saved;
    const rand = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const id = `halcyon-${rand}`;
    localStorage.setItem(CLIENT_ID_KEY, id);
    return id;
  } catch {
    return FALLBACK_CLIENT_ID;
  }
}

/**
 * Forget this install's plex.tv device identity — part of a full "forget this
 * server and start over" reset (#124), never an ordinary log-out/reconnect:
 * plex.tv keys a device's authorization to this id, so minting a fresh one on
 * every disconnect would make plex.tv see a brand-new device every session.
 */
export function forgetPlexClientIdentity(): void {
  try {
    localStorage.removeItem(CLIENT_ID_KEY);
  } catch {
    /* nothing persisted to forget */
  }
}

/** The X-Plex-* identity every request carries, token folded in when present. */
export function plexHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/json',
    'X-Plex-Product': 'Halcyon Video',
    'X-Plex-Version': '0.1.0',
    'X-Plex-Client-Identifier': plexClientIdentifier(),
    'X-Plex-Platform': 'Web',
    'X-Plex-Device': 'HTPC',
    'X-Plex-Device-Name': 'Halcyon Video',
  };
  if (token) h['X-Plex-Token'] = token;
  return h;
}

// ─── Addresses, and whether THIS page can reach them (GH #125) ───────────────
//
// An address that a browser will never fetch is the failure this section
// exists for. On the hosted build the page is HTTPS, so every plain-HTTP
// request is refused as mixed content BEFORE it leaves the tab: no status
// code, no network error the app can read as one, just a promise that settles
// into a generic failure — or, on the boot path, nothing at all until the 45s
// stall watchdog calls it a timeout. That is the reported symptom ("times out
// whatever I set it to", including localhost), and none of it is Plex's fault
// or the address's. The rule is cheap to apply up front, so apply it up front
// and say the reason in words.

/** The page's own scheme. A DOM-less caller (unit tests, tooling) is treated
 *  as insecure — it has no mixed-content rule to break. */
export function isSecurePage(): boolean {
  try {
    return typeof location !== 'undefined' && location.protocol === 'https:';
  } catch {
    return false;
  }
}

/** host + port out of an address that may or may not carry a scheme. */
function hostPortOf(address: string): { host: string; port: string } {
  const rest = String(address || '').trim().replace(/^https?:\/\//i, '').split('/')[0];
  const v6 = /^\[([^\]]+)\](?::(\d+))?$/.exec(rest); // [::1]:32400
  if (v6) return { host: v6[1].toLowerCase(), port: v6[2] || '' };
  const [host, port] = rest.split(':');
  return { host: (host || '').toLowerCase(), port: port || '' };
}

/** How an address reads on screen: the part the person typed, no scheme. */
function hostLabel(address: string): string {
  const { host, port } = hostPortOf(address);
  if (!host) return address;
  return port ? `${host}:${port}` : host;
}

function isIpLiteral(host: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(':');
}

/**
 * Loopback = the browser's OWN machine, and the two things that follow pull in
 * opposite directions — which is why it needs its own predicate rather than
 * being folded into the mixed-content test.
 *
 * Browsers class a loopback origin as potentially trustworthy, so
 * `http://localhost:32400` is NOT blocked from an HTTPS page. But it can only
 * ever reach a Plex running on the very machine the browser is on, which for a
 * hosted store is the viewer's laptop and almost never where their server is.
 * So it must not be reported as blocked, and it must not be reported as an
 * ordinary unreachable address either.
 */
export function isLoopbackHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  return h === 'localhost' || h.endsWith('.localhost') || h === '::1' || /^127\./.test(h);
}

/**
 * The LAN address a plex.direct hostname stands for.
 *
 * Plex issues one wildcard cert per server and encodes the target in the
 * hostname's first label with dashes for dots, so
 * `192-168-1-50.<hash>.plex.direct` IS 192.168.1.50 — reached over TLS with a
 * certificate that validates, which a bare `https://192.168.1.50` never could.
 * Resolving the alias is what lets a typed LAN IP be recognised as the same
 * endpoint as the HTTPS connection plex.tv advertises for it, so a hosted page
 * can fall through to the address that actually works.
 */
export function plexDirectTarget(host: string): string | null {
  if (!/\.plex\.direct$/i.test(host)) return null;
  const ipv4 = (host.split('.')[0] || '').replace(/-/g, '.');
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ipv4) ? ipv4 : null;
}

/** host:port with the plex.direct alias resolved and Plex's default port
 *  filled in — the identity two addresses are compared on. */
function plexEndpointKey(address: string): string {
  const { host, port } = hostPortOf(address);
  if (!host) return '';
  return `${plexDirectTarget(host) || host}:${port || '32400'}`;
}

/** Do two addresses name the same server? Scheme is ignored on purpose:
 *  http://192.168.1.50:32400 and https://192-168-1-50.<hash>.plex.direct:32400
 *  are one box reached two ways, which byte-comparing the strings misses. */
export function samePlexEndpoint(a: string, b: string): boolean {
  const ka = plexEndpointKey(a);
  return !!ka && ka === plexEndpointKey(b);
}

/** True when the browser will refuse this address outright: the page is HTTPS
 *  and the address is plain HTTP to somewhere that isn't the local machine.
 *  Nothing else about the address matters — no request is ever sent. */
export function isMixedContentBlocked(url: string): boolean {
  if (!isSecurePage()) return false;
  if (!/^http:\/\//i.test(url)) return false;
  return !isLoopbackHost(hostPortOf(url).host);
}

/**
 * `opts.secureDefault` forces the scheme a BARE address gets; left off, it
 * follows the page (see the section note above). Everything else is the old
 * behaviour: trim, drop a trailing slash, leave an explicit scheme alone.
 */
export function normalizePlexUrl(url: string, opts?: { secureDefault?: boolean }): string {
  let cleaned = (url || '').trim().replace(/\/+$/, '');
  if (!cleaned) return '';
  // A SCHEME WITH NOTHING AFTER IT IS NOT AN ADDRESS — it is a blank field.
  // The setup terminal seeds its address row with the literal 'http://', and
  // that used to survive normalising as `http://http:/`: non-empty, so the
  // Plex path's "no address given, ask the account for its servers" branch
  // never fired, and the connect went out against nonsense. Blank in, blank
  // out, and the caller's own emptiness check then does the right thing.
  if (/^https?:$/i.test(cleaned)) return '';
  if (!/^https?:\/\//i.test(cleaned)) {
    // This used to be an unconditional `http://`, which on the hosted build
    // manufactured an address the browser refuses to send (#125). Take the
    // page's own scheme instead — except for loopback, which is exempt from
    // the mixed-content rule and which Plex answers over plain HTTP.
    const { host } = hostPortOf(cleaned);
    const secure = opts?.secureDefault ?? (isSecurePage() && !isLoopbackHost(host));
    cleaned = `${secure ? 'https' : 'http'}://${cleaned}`;
  }
  return cleaned;
}

// ─── Connect-time reachability probe (GH #125) ───────────────────────────────

/** How long one probe waits. Short on purpose: the point of #125 is that a
 *  wrong address says so at once rather than dying in the boot watchdog three
 *  quarters of a minute later, and a server on the LAN answers /identity in
 *  milliseconds or not at all. */
export const PLEX_PROBE_TIMEOUT_MS = 8000;

/** Ceiling on a whole connect sweep. A server can advertise half a dozen
 *  connections, and probing each for the full timeout would rebuild the 45s
 *  stall this issue is about out of parts that individually behave. Blocked
 *  candidates cost nothing, so this only ever bounds real network waits. */
export const PLEX_CONNECT_BUDGET_MS = 20_000;

/** Per-request cap for everything the SYNC stage does — library lists,
 *  collections, token checks (GH #128). Connect-time probing already had its
 *  own budget (PLEX_PROBE_TIMEOUT_MS); every request downstream of a
 *  successful connect had none at all, so a single hung request rode the 45s
 *  boot stall watchdog with no attribution. Deliberately under that 45s —
 *  close enough that a real, large-but-working library list still fits, far
 *  enough that the request which actually stalled fails, by name, before the
 *  blunt catch-all ever gets to. */
export const PLEX_SYNC_TIMEOUT_MS = 40_000;

export type PlexProbeCode =
  | 'blank'
  | 'mixed-content'
  | 'timeout'
  | 'unreachable'
  | 'refused'
  | 'http-error'
  | 'not-plex';

export interface PlexProbe {
  ok: boolean;
  /** The normalized address that was tried. */
  url: string;
  code?: PlexProbeCode;
  /** Plain words, written to be shown to the person unedited. */
  message?: string;
  machineIdentifier?: string;
  version?: string;
}

// Ordered cause, then action, then why — because the 40-column CRT can only
// seat about five rows of it and clips the tail, so whatever a person most
// needs has to come first. The DOM login form shows the whole thing.
function mixedContentMessage(url: string): string {
  return (
    `This page is served over HTTPS, so your browser blocks plain http:// ` +
    `requests to ${hostLabel(url)}. ` +
    `Sign in with your Plex account and pick the server from the list. ` +
    `Plex's own secure plex.direct address for that server works from a hosted ` +
    `page; a plain LAN address cannot.`
  );
}

function unreachableMessage(url: string, timedOut: boolean, timeoutMs: number): string {
  const head = timedOut
    ? `${hostLabel(url)} did not answer within ${Math.round(timeoutMs / 1000)} seconds.`
    : `Could not reach ${hostLabel(url)}.`;
  const { host } = hostPortOf(url);
  if (isLoopbackHost(host)) {
    return `${head} A loopback address only reaches Plex running on this same ` +
      `computer, not one on another machine. Type the server's own address, or ` +
      `sign in with your Plex account and pick it from the list.`;
  }
  if (/^https:\/\//i.test(url) && isIpLiteral(host)) {
    return `${head} An https:// address written as a bare IP fails Plex's ` +
      `certificate check — use the plex.direct address from your account instead.`;
  }
  return `${head} Check the address, that Plex is running, and that this device can ` +
    `see it on the network.`;
}

/**
 * Ask an address whether it is a reachable Plex server, and say why not.
 *
 * `/identity` is the right question: every PMS serves it, it is the same call
 * validatePlexToken already makes (so its CORS behaviour is proven on the
 * wire), and its machineIdentifier is what distinguishes a real server from a
 * captive portal or a reverse proxy answering 200 with HTML.
 *
 * Never throws — a probe is a measurement, and the caller wants every result
 * so it can compare candidates and report the best explanation.
 */
export async function probePlexServer(
  server: string,
  token?: string,
  opts?: { timeoutMs?: number }
): Promise<PlexProbe> {
  const url = normalizePlexUrl(server);
  if (!url) {
    return { ok: false, url: '', code: 'blank', message: 'No Plex server address to try.' };
  }
  if (isMixedContentBlocked(url)) {
    return { ok: false, url, code: 'mixed-content', message: mixedContentMessage(url) };
  }
  const timeoutMs = opts?.timeoutMs ?? PLEX_PROBE_TIMEOUT_MS;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/identity`, {
      headers: plexHeaders(token),
      signal: controller?.signal,
    });
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false, url, code: 'refused',
        message: `${hostLabel(url)} answered but refused this sign-in. Link your Plex account again.`,
      };
    }
    if (!res.ok) {
      return {
        ok: false, url, code: 'http-error',
        message: `${hostLabel(url)} answered HTTP ${res.status}. That address is reachable but it is not serving Plex.`,
      };
    }
    let machineIdentifier: string | undefined;
    let version: string | undefined;
    try {
      const container = JSON.parse(await res.text())?.MediaContainer;
      machineIdentifier = container?.machineIdentifier;
      version = container?.version;
    } catch {
      /* not JSON — handled as not-Plex below */
    }
    if (!machineIdentifier) {
      return {
        ok: false, url, code: 'not-plex',
        message: `Something answered at ${hostLabel(url)}, but it is not a Plex server.`,
      };
    }
    return { ok: true, url, machineIdentifier, version };
  } catch (e: any) {
    const timedOut = e?.name === 'AbortError';
    return {
      ok: false, url,
      code: timedOut ? 'timeout' : 'unreachable',
      message: unreachableMessage(url, timedOut, timeoutMs),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Every address worth trying for a connect, best first.
 *
 * The typed one leads — it is the only one the person can act on, so it must
 * be the one the failure message talks about — then the account's advertised
 * connections for the same server (already ranked, blocked ones last), then
 * the https:// twin of a typed plain-HTTP address. That last one is a long
 * shot on a bare LAN IP (Plex's cert won't validate for it) and exactly right
 * for a server behind a reverse proxy with a real certificate, and it costs
 * one fast failure to find out.
 */
export function plexConnectCandidates(typed: string, connections: readonly string[] = []): string[] {
  const out: string[] = [];
  const add = (raw: string) => {
    const url = normalizePlexUrl(raw);
    if (url && !out.includes(url)) out.push(url);
  };
  const target = normalizePlexUrl(typed);
  add(target);
  for (const c of connections) add(c);
  if (/^http:\/\//i.test(target) && !isLoopbackHost(hostPortOf(target).host)) {
    add(target.replace(/^http:/i, 'https:'));
  }
  return out;
}

/**
 * One plain-words explanation for a connect that reached nothing, built from
 * every address tried. The FIRST attempt leads — it is the one the person
 * typed or picked, and so the only one they can act on — and the rest is a
 * count, because listing four plex.direct hostnames on a 40-column CRT helps
 * nobody.
 */
export function describePlexConnectFailure(attempts: PlexProbe[]): string {
  if (!attempts.length) {
    return 'No Plex server address to connect to. Type one, or sign in and pick a server.';
  }
  const first = attempts[0];
  const others = attempts.length - 1;
  const tail = others > 0
    ? ` Also tried ${others} other address${others === 1 ? '' : 'es'} for that server, with no answer.`
    : '';
  return `${first.message || `Could not reach ${hostLabel(first.url)}.`}${tail}`;
}

function toArray<T>(val: T | T[] | undefined | null): T[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

/**
 * `label` names what's being fetched ("the Movies library", "collections")
 * in plain words for the timeout message — the caller knows that, a bare URL
 * doesn't, and "No response from Plex for 45s" with nothing else is exactly
 * the diagnosis-free stall this exists to replace (GH #128).
 */
async function plexJson<T = any>(
  url: string,
  token?: string,
  init?: { method?: string; timeoutMs?: number; label?: string }
): Promise<T> {
  const timeoutMs = init?.timeoutMs ?? PLEX_SYNC_TIMEOUT_MS;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: init?.method ?? 'GET',
      headers: plexHeaders(token),
      signal: controller?.signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error(
        `${init?.label ?? hostLabel(url)} did not answer within ${Math.round(timeoutMs / 1000)}s. ` +
        `The server may be busy, asleep, or reachable only through a slow connection.`
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const target = init?.label ?? hostLabel(url);
    if (res.status === 401 || res.status === 403) {
      throw new Error(`${target} refused sign-in (HTTP ${res.status}). Link your Plex account again.`);
    }
    throw new Error(`Plex HTTP error ${res.status} for ${init?.label ? `${init.label} (${redactToken(url)})` : redactToken(url)}`);
  }
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${init?.label ?? hostLabel(url)} returned an invalid response, not Plex JSON.`);
  }
}

function redactToken(url: string): string {
  return url.replace(/X-Plex-Token=[^&]*/gi, 'X-Plex-Token=***');
}

// ─── Account linking (the plex.tv PIN flow) ──────────────────────────────────
//
// Plex has no direct-to-server login for third-party clients: you mint a PIN on
// plex.tv, the person authorizes it in a browser (or on their phone, via the QR
// the mint returns), and polling the PIN then yields an ACCOUNT token. That
// token is not a server token — it is what you use to DISCOVER the person's
// servers, each of which hands back its own accessToken. Two steps where
// Jellyfin has one, and the reason capabilities.directServerLogin is false.

export interface PlexPin {
  id: number;
  code: string;
  /** Where to send the person. Opening this is the whole "login screen". */
  authUrl: string;
  /** plex.tv-hosted QR of authUrl — the right affordance on a TV. */
  qrUrl: string;
  expiresAt: string;
}

// `strong=true` mints a 25-character code, and that code CANNOT be typed at
// plex.tv/link — the box there takes four characters. It is meant for the
// app.plex.tv/auth# redirect, where the code rides in the URL and nobody reads
// it. Every surface this app puts a code on is the opposite case: the setup
// terminal is a CRT with no browser to hand off to, so the code exists to be
// read off the screen and typed somewhere else. So mint the plain PIN, which is
// the four-character one Plex's own TV apps use.
export async function createPlexPin(): Promise<PlexPin> {
  const res = await fetch(`${PLEX_TV}/api/v2/pins`, {
    method: 'POST',
    headers: plexHeaders(),
  });
  if (!res.ok) throw new Error(`Plex PIN request failed (HTTP ${res.status})`);
  const pin = JSON.parse(await res.text());
  return {
    id: pin.id,
    code: pin.code,
    // The same address plex.tv's own QR for this PIN encodes: the link page
    // with the code already filled in. Opening it and typing the code by hand
    // land in the identical place, so the screen can only ever say one thing.
    authUrl: `https://www.plex.tv/link/?pin=${encodeURIComponent(pin.code)}`,
    qrUrl: pin.qr ?? `${PLEX_TV}/api/v2/pins/qr/${pin.code}`,
    expiresAt: pin.expiresAt,
  };
}

/**
 * One poll. Returns the account token once the person has authorized, null
 * while they haven't. THROWS if the PIN is gone (expired or already consumed),
 * because "keep waiting" and "start over" are different things for the caller.
 */
export async function pollPlexPin(pinId: number): Promise<string | null> {
  const res = await fetch(`${PLEX_TV}/api/v2/pins/${pinId}`, {
    headers: plexHeaders(),
  });
  if (res.status === 404) throw new Error('This sign-in code expired — start again.');
  if (!res.ok) throw new Error(`Plex PIN poll failed (HTTP ${res.status})`);
  const pin = JSON.parse(await res.text());
  return pin.authToken || null;
}

export interface PlexAccount {
  id: string;
  username: string;
  thumb?: string;
}

export async function fetchPlexAccount(accountToken: string): Promise<PlexAccount> {
  const me = await plexJson<any>(`${PLEX_TV}/api/v2/user`, accountToken);
  return {
    id: String(me.id ?? me.uuid ?? ''),
    username: me.username || me.title || me.email || 'Plex user',
    thumb: me.thumb || undefined,
  };
}

export interface PlexServer {
  name: string;
  machineIdentifier: string;
  /** Server-specific token — NOT the account token. */
  accessToken: string;
  productVersion?: string;
  /** Reachable base URLs, local ones first (a LAN address beats plex.direct). */
  connections: string[];
  /** The subset of `connections` that route through Plex Relay — a proxy
   *  through Plex's own servers, ranked last by connectionRank because it can
   *  answer /identity in milliseconds while being far too slow to carry a
   *  real library sync (GH #128). Kept as its own list, not a bool on
   *  PlexServer, because relay-ness is per-connection: the same server can
   *  advertise both a fast LAN address and a relay fallback. */
  relayConnections: string[];
  owned: boolean;
}

/** A plex.direct hostname resolves to the same box a plain LAN IP would, but
 *  fails outright on DNS-rebind-protecting resolvers (Pi-hole, pfSense, and
 *  common router defaults) — issue #120's reported symptom. */
function isPlexDirectUri(uri: string): boolean {
  return /\.plex\.direct(?::|\/|$)/i.test(uri);
}

/** plain-IP local, then plex.direct local, then remote non-relay, then relay —
 *  making the doc comment on PlexServer.connections (below) true.
 *
 *  ...UNLESS the page cannot use the connection at all. #120 put a plain LAN
 *  IP ahead of plex.direct because a DNS-rebind-protecting resolver breaks the
 *  latter, which is right in the desktop shell and on a LAN-hosted install —
 *  and exactly backwards on the hosted HTTPS build, where the plain-HTTP LAN
 *  address is refused by the browser before it is sent (#125). So blocked
 *  connections keep their relative order and sink below every usable one,
 *  rather than the preference being flipped for everybody. */
function connectionRank(c: any): number {
  const uri = String(c.uri || '');
  const base = c.relay ? 3 : !c.local ? 2 : isPlexDirectUri(uri) ? 1 : 0;
  return isMixedContentBlocked(uri) ? base + 10 : base;
}

/**
 * The person's servers, from the account token. `resources` returns every
 * device on the account (players and servers alike), so this filters to
 * `provides` containing "server" and orders each server's connections local
 * first — the store is a LAN appliance, and a relay connection would route
 * a 4K remux through Plex's relay for no reason.
 */
export async function fetchPlexServers(accountToken: string): Promise<PlexServer[]> {
  const list = await plexJson<any[]>(
    `${PLEX_TV}/api/v2/resources?includeHttps=1&includeRelay=1`,
    accountToken
  );
  return toArray(list)
    .filter((r) => typeof r?.provides === 'string' && r.provides.split(',').includes('server'))
    .map((r) => {
      const conns = toArray(r.connections);
      const ordered = [...conns].sort((a, b) => connectionRank(a) - connectionRank(b));
      return {
        name: r.name || 'Plex Media Server',
        machineIdentifier: r.clientIdentifier,
        accessToken: r.accessToken,
        productVersion: r.productVersion,
        connections: ordered.map((c) => String(c.uri || '')).filter(Boolean),
        relayConnections: ordered.filter((c) => !!c.relay).map((c) => String(c.uri || '')).filter(Boolean),
        owned: !!r.owned,
      };
    });
}

/** True = token still good against THIS server. Throws on a network blip
 *  (including a timeout — GH #128, this had none before) so a caller that
 *  wants "still reachable, still authorized" told apart from "no answer"
 *  can look at the message; every existing caller already treats a throw
 *  as "couldn't tell, don't act on it" either way. */
export async function validatePlexToken(
  server: string,
  token: string,
  opts?: { timeoutMs?: number }
): Promise<boolean> {
  const url = `${normalizePlexUrl(server)}/identity`;
  const timeoutMs = opts?.timeoutMs ?? PLEX_SYNC_TIMEOUT_MS;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { headers: plexHeaders(token), signal: controller?.signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error(
        `${hostLabel(url)} did not answer the sign-in check within ${Math.round(timeoutMs / 1000)}s.`
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 || res.status === 403) return false;
  if (!res.ok) throw new Error(`Plex reachability check failed (HTTP ${res.status})`);
  return true;
}

// ─── Artwork ─────────────────────────────────────────────────────────────────

/**
 * The ONE place a Plex image URL is built (same rule as buildItemImageUrl on
 * the Jellyfin side). `path` is the server-relative value off a metadata item
 * — thumb, art, parentThumb — or an already-absolute plex.tv URL, which cast
 * portraits are: Role[].thumb points at metadata-static.plex.tv and needs no
 * token, so it is passed through untouched.
 */
export function buildPlexImageUrl(
  server: string,
  token: string,
  path: string | undefined | null,
  maxWidth?: number
): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  const base = normalizePlexUrl(server);
  if (!maxWidth) {
    return `${base}${path}?X-Plex-Token=${encodeURIComponent(token)}`;
  }
  // Plex's own image resizer. width/height are a bounding box; upscale=0 keeps
  // it from inventing pixels on art smaller than the box.
  const params = new URLSearchParams({
    url: path,
    width: String(maxWidth),
    height: String(Math.round(maxWidth * 1.5)),
    minSize: '1',
    upscale: '0',
    'X-Plex-Token': token,
  });
  return `${base}/photo/:/transcode?${params.toString()}`;
}

// ─── Catalog ─────────────────────────────────────────────────────────────────

function tmdbIdFrom(guids: any[] | undefined): number | undefined {
  for (const g of toArray(guids)) {
    const m = /^tmdb:\/\/(\d+)$/.exec(String(g?.id ?? ''));
    if (m) return Number(m[1]);
  }
  return undefined;
}

/**
 * Plex exposes ratings twice: flat `rating`/`audienceRating` fields, and — on
 * the per-item metadata call only, NOT on the list query — a typed `Rating[]`
 * carrying every source it scraped. The back-of-box has exactly two slots, and
 * the Jellyfin side fills them with a 0-10 community score and a 0-100 Rotten
 * Tomatoes critic score, so map to that: critic × 10, audience as-is.
 *
 * The flat fields WIN over the array. They are what the server nominates as
 * this item's primary critic/audience score, whereas `Rating[]` is source-
 * ordered — its first `audience` entry is typically IMDb, so reading the array
 * first silently swaps the score under a title the moment a second source is
 * scraped. The array is the fallback for an item that carries only it.
 */
function ratingsFrom(item: any): { communityRating?: number; criticRating?: number } {
  const arr: any[] = toArray(item.Rating);
  const critic = typeof item.rating === 'number'
    ? item.rating
    : arr.find((r) => r?.type === 'critic')?.value;
  const audience = typeof item.audienceRating === 'number'
    ? item.audienceRating
    : arr.find((r) => r?.type === 'audience')?.value;
  return {
    communityRating: typeof audience === 'number' ? audience : undefined,
    criticRating: typeof critic === 'number' ? Math.round(critic * 10) : undefined,
  };
}

function streamsFromPart(part: any): MediaStreamInfo[] | undefined {
  const streams: any[] = toArray(part?.Stream);
  if (!streams.length) return undefined;
  const out = streams
    .filter((s) => s && (s.streamType === 2 || s.streamType === 3))
    .map((s) => ({
      index: typeof s.index === 'number' ? s.index : Number(s.id),
      type: (s.streamType === 2 ? 'Audio' : 'Subtitle') as 'Audio' | 'Subtitle',
      language: s.language || s.languageTag || undefined,
      displayTitle: s.extendedDisplayTitle || s.displayTitle || undefined,
      codec: typeof s.codec === 'string' ? s.codec.toLowerCase() : undefined,
      isDefault: !!s.default,
      channels: typeof s.channels === 'number' ? s.channels : undefined,
    }));
  return out.length ? out : undefined;
}

function playbackInfoFromMedia(media: any): MediaPlaybackInfo | undefined {
  if (!media) return undefined;
  const audio = [media.audioCodec].filter(Boolean).map((c: string) => c.toLowerCase());
  return {
    container: typeof media.container === 'string' ? media.container.toLowerCase() : undefined,
    videoCodec: typeof media.videoCodec === 'string' ? media.videoCodec.toLowerCase() : undefined,
    audioCodecs: audio,
    width: typeof media.width === 'number' ? media.width : undefined,
    height: typeof media.height === 'number' ? media.height : undefined,
    aspectRatio: media.aspectRatio ? String(media.aspectRatio) : undefined,
    // Plex flags HDR on the video STREAM (colorTrc/DOVI profile), which the
    // list query doesn't carry — left unset rather than guessed SDR, since the
    // tech-specs table prints this verbatim.
    videoRange: undefined,
  };
}

function qualityLabel(media: any): string {
  const w = media?.width ?? 0;
  const res = String(media?.videoResolution ?? '').toLowerCase();
  const tag = w >= 3840 || res === '4k' ? '4K'
    : w >= 1920 ? '1080p'
    : w >= 1280 ? '720p'
    : res ? res.toUpperCase() : 'SD';
  const codec = typeof media?.videoCodec === 'string' ? media.videoCodec.toUpperCase() : undefined;
  return [tag, codec].filter(Boolean).join(' · ') || 'Original';
}

function versionsFrom(item: any): MovieVersion[] | undefined {
  const medias: any[] = toArray(item.Media);
  if (medias.length < 2) return undefined;
  return medias
    .map((m) => {
      const part = toArray(m?.Part)[0];
      const w = m?.width ?? 0;
      return {
        itemId: String(item.ratingKey),
        mediaSourceId: String(m?.id ?? ''),
        // A curator-entered edition name beats an inferred quality string —
        // this is what capabilities.namedEditions is about, and Jellyfin has
        // no equivalent field.
        label: item.editionTitle ? `${item.editionTitle} · ${qualityLabel(m)}` : qualityLabel(m),
        is4k: w >= 3840 || String(m?.videoResolution).toLowerCase() === '4k',
        width: typeof m?.width === 'number' ? m.width : undefined,
        height: typeof m?.height === 'number' ? m.height : undefined,
        localPath: part?.file || undefined,
        mediaStreams: streamsFromPart(part),
        mediaPlaybackInfo: playbackInfoFromMedia(m),
      };
    })
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
}

/** One Plex metadata item → one shelvable Title. */
function toMovie(server: string, token: string, item: any, libraryName: string): Movie {
  const medias = toArray(item.Media);
  const media = medias[0];
  const parts = toArray(media?.Part);
  const part = parts[0];
  const durationMs = Number(item.duration ?? media?.duration ?? 0);
  const durationMin = Math.round(durationMs / 1000 / 60);
  const isSeries = item.type === 'show';
  const width = media?.width ?? 0;
  const roles: any[] = toArray(item.Role);
  const directors: any[] = toArray(item.Director);
  const genres: any[] = toArray(item.Genre);
  const { communityRating, criticRating } = ratingsFrom(item);

  return {
    id: String(item.ratingKey ?? ''),
    title: item.title || 'Untitled',
    year: typeof item.year === 'number' ? item.year : 2000,
    premiereDate: item.originallyAvailableAt || undefined,
    duration: isSeries ? 'Series' : durationMin > 0 ? `${durationMin}m` : 'N/A',
    rating: item.contentRating || 'NR',
    overview: item.summary || 'No description available.',
    director: directors[0]?.tag || 'Unknown Director',
    actors: roles.slice(0, 5).map((r) => r?.tag).filter(Boolean),
    // castPeople is deliberately absent: the LIST query's Role entries carry a
    // tag and nothing else — portraits live on the per-item metadata call, and
    // paying one round trip per title to decorate a wall is not a trade worth
    // making on a 5000-title library. Wall décor falls back to its no-portrait
    // path, exactly as it does for the demo catalog.
    genres: genres.map((g: any) => g?.tag).filter(Boolean),
    localPath: part?.file || '',
    posterUrl: buildPlexImageUrl(server, token, item.thumb, 400),
    backdropUrl: buildPlexImageUrl(server, token, item.art, 1280),
    dateCreated: item.addedAt ? new Date(item.addedAt * 1000).toISOString() : undefined,
    isSeries,
    is4k: width >= 3840 || String(media?.videoResolution).toLowerCase() === '4k',
    communityRating,
    criticRating,
    libraryName,
    studios: item.studio ? [item.studio] : [],
    tmdbId: tmdbIdFrom(item.Guid),
    mediaStreams: streamsFromPart(part),
    mediaPlaybackInfo: playbackInfoFromMedia(media),
    primaryImageAspectRatio: undefined,
    versions: versionsFrom(item),
    played: typeof item.viewCount === 'number' && item.viewCount > 0,
    playCount: typeof item.viewCount === 'number' ? item.viewCount : undefined,
    lastPlayedDate: item.lastViewedAt
      ? new Date(item.lastViewedAt * 1000).toISOString()
      : undefined,
    resumePositionTicks: item.viewOffset ? item.viewOffset * TICKS_PER_MS : undefined,
    runTimeTicks: durationMs ? durationMs * TICKS_PER_MS : undefined,
  };
}

/**
 * Tag collection membership onto the titles already fetched (capabilities.
 * collections). One call per collection, and collections are few — the shape
 * that would be expensive is the other direction, asking each title what it
 * belongs to.
 *
 * Smart collections come back in the same list with `smart: "1"`. They are
 * included: from the shelf's point of view a rule-built collection is still a
 * named set of titles, and the endcap only ever reads the name and members.
 */
async function applyPlexCollections(
  server: string,
  token: string,
  sectionKey: string,
  byId: Map<string, Movie>,
  timeoutMs?: number,
  onProgress?: (stage: string) => void
): Promise<void> {
  const base = normalizePlexUrl(server);
  let collections: any[] = [];
  try {
    const res = await plexJson<any>(`${base}/library/sections/${sectionKey}/collections`, token, {
      label: `Collections for section ${sectionKey}`,
      timeoutMs,
    });
    collections = toArray(res?.MediaContainer?.Metadata);
  } catch {
    return; // a server without the endpoint simply has no collection endcaps
  }
  for (const col of collections) {
    if (!col?.ratingKey) continue;
    try {
      const res = await plexJson<any>(
        `${base}/library/metadata/${col.ratingKey}/children`,
        token,
        { label: `Collection "${col.title ?? col.ratingKey}"`, timeoutMs: timeoutMs ?? 10_000 }
      );
      for (const child of toArray(res?.MediaContainer?.Metadata)) {
        if (child?.ratingKey) {
          const movie = byId.get(String(child.ratingKey));
          if (movie && col.title) movie.collectionName = col.title;
        }
      }
      onProgress?.('page');
    } catch {
      // one unreadable collection must not lose the whole library
    }
  }
}

/**
 * Every library on the server, stocked.
 *
 * ONE round trip per library — but only because of `includeGuids=1`. Without
 * it the list response omits the Guid array, and with it the TMDB id arrives
 * with the catalog instead of costing a call per title. That matters more here
 * than it looks: tmdbId is the staff-picks engine's join key, so without this
 * parameter a Plex store would silently build no staff picks and no genre
 * endcaps.
 *
 * What the list query does NOT carry, verified on the wire: Part[].Stream (the
 * audio/subtitle track list) and Role[].thumb (cast portraits). Streams are
 * fetched on demand by fetchPlexItemPlaybackInfo when the player opens, the
 * same shape the Jellyfin side uses for episodes.
 */
/**
 * Section names only — what the setup terminal's "which libraries does this
 * store carry?" rows are drawn from, before any catalog is pulled.
 *
 * Deliberately mirrors fetchPlexLibrariesAndMovies below: same `key` as the id
 * (which is what excludeLibraryIds is matched against) and the same movie/show
 * filter. A photo or music section offered here would be a toggle that governs
 * nothing, since that section never becomes a shelf.
 */
export async function fetchPlexLibraryList(
  server: string,
  token: string,
  opts?: { timeoutMs?: number }
): Promise<LibrarySummary[]> {
  const base = normalizePlexUrl(server);
  const secRes = await plexJson<any>(`${base}/library/sections`, token, {
    label: 'The library list',
    timeoutMs: opts?.timeoutMs,
  });
  const sections: any[] = toArray(secRes?.MediaContainer?.Directory);
  return sections
    .filter((s) => s?.type === 'movie' || s?.type === 'show')
    .map((s) => ({ id: String(s.key), name: String(s.title ?? s.key) }));
}

export async function fetchPlexLibrariesAndMovies(
  server: string,
  token: string,
  onProgress?: (stage: string) => void,
  // `timeoutMs` overrides PLEX_SYNC_TIMEOUT_MS per request — a real knob (not
  // just a test seam): a server known to be slow-but-reachable can be given
  // more rope without touching the default everyone else gets.
  opts?: { excludeLibraryIds?: ReadonlySet<string>; timeoutMs?: number }
): Promise<Library[]> {
  const base = normalizePlexUrl(server);
  onProgress?.('Reading libraries');
  const secRes = await plexJson<any>(`${base}/library/sections`, token, {
    label: 'The library list',
    timeoutMs: opts?.timeoutMs,
  });
  const sections: any[] = toArray(secRes?.MediaContainer?.Directory);

  const libraries: Library[] = [];
  for (const section of sections) {
    if (!section?.key) continue;
    const key = String(section.key);
    if (opts?.excludeLibraryIds?.has(key)) continue;
    // Photo and music sections have no shelf representation.
    if (section.type !== 'movie' && section.type !== 'show') continue;

    const sectionTitle = section.title || `Library ${key}`;
    onProgress?.(`Stocking ${sectionTitle}`);
    const listRes = await plexJson<any>(
      `${base}/library/sections/${key}/all?includeGuids=1`,
      token,
      { label: `The "${sectionTitle}" library`, timeoutMs: opts?.timeoutMs }
    );
    onProgress?.('page');
    const items: any[] = toArray(listRes?.MediaContainer?.Metadata);
    const movies = items.map((it) => toMovie(server, token, it, sectionTitle));

    const byId = new Map(movies.map((m) => [m.id, m]));
    await applyPlexCollections(server, token, key, byId, opts?.timeoutMs, onProgress);

    const genres = [...new Set(movies.flatMap((m) => m.genres))].sort();
    libraries.push({ id: key, name: sectionTitle, movies, genres });
  }
  return libraries;
}

// ─── Series ──────────────────────────────────────────────────────────────────

function toEpisode(server: string, token: string, e: any): Episode {
  const durationMs = Number(e.duration ?? 0);
  const parts = toArray(toArray(e.Media)[0]?.Part);
  return {
    id: String(e.ratingKey),
    seriesId: String(e.grandparentRatingKey ?? ''),
    seriesName: e.grandparentTitle || '',
    seasonNumber: Number(e.parentIndex ?? 0),
    episodeNumber: Number(e.index ?? 0),
    name: e.title || '',
    overview: e.summary || '',
    path: parts[0]?.file || '',
    runTimeTicks: durationMs ? durationMs * TICKS_PER_MS : undefined,
    resumePositionTicks: e.viewOffset ? e.viewOffset * TICKS_PER_MS : undefined,
    thumbUrl: buildPlexImageUrl(server, token, e.thumb, 400),
    seasonId: e.parentRatingKey ? String(e.parentRatingKey) : undefined,
    seasonPrimaryUrl: buildPlexImageUrl(server, token, e.parentThumb, 400),
  };
}

/** Every episode of a series, flattened across seasons, in broadcast order. */
export async function fetchPlexSeriesEpisodes(
  server: string,
  token: string,
  seriesId: string
): Promise<Episode[]> {
  const base = normalizePlexUrl(server);
  const res = await plexJson<any>(`${base}/library/metadata/${seriesId}/allLeaves`, token, {
    label: `Episodes for series ${seriesId}`,
  });
  const eps: any[] = toArray(res?.MediaContainer?.Metadata);
  return eps
    .map((e) => toEpisode(server, token, e))
    .sort((a, b) =>
      a.seasonNumber !== b.seasonNumber
        ? a.seasonNumber - b.seasonNumber
        : a.episodeNumber - b.episodeNumber
    );
}

export async function fetchPlexFirstEpisodeOfSeries(
  server: string,
  token: string,
  seriesId: string
): Promise<{ id: string; path: string } | null> {
  const eps = await fetchPlexSeriesEpisodes(server, token, seriesId);
  const first = eps[0];
  return first ? { id: first.id, path: first.path } : null;
}

// ─── Playback ────────────────────────────────────────────────────────────────

/** The untouched file. `partKey` is Part[].key, e.g. /library/parts/1/…/file.mp4 */
export function buildPlexDirectStreamUrl(
  server: string,
  token: string,
  partKey: string
): string {
  return `${normalizePlexUrl(server)}${partKey}?X-Plex-Token=${encodeURIComponent(token)}`;
}

export interface PlexHlsOpts {
  maxBitrate?: number;
  startPositionTicks?: number;
  mediaSourceId?: string;
  sessionId?: string;
}

/** Shared by buildPlexHlsStreamUrl and preflightPlexTranscodeDecision so the
 *  two requests can never drift apart — see the pre-flight's doc comment. */
function plexTranscodeParams(token: string, itemId: string, sessionId: string, opts?: PlexHlsOpts): URLSearchParams {
  const params = new URLSearchParams({
    path: `/library/metadata/${itemId}`,
    mediaIndex: '0',
    partIndex: '0',
    protocol: 'hls',
    directPlay: '0',
    directStream: '1',
    fastSeek: '1',
    session: sessionId,
    'X-Plex-Token': token,
    'X-Plex-Client-Identifier': plexClientIdentifier(),
    'X-Plex-Product': 'Halcyon Video',
    'X-Plex-Version': '0.1.0',
    'X-Plex-Platform': 'Web',
  });
  if (opts?.maxBitrate) params.set('maxVideoBitrate', String(Math.round(opts.maxBitrate / 1000)));
  if (opts?.startPositionTicks) {
    params.set('offset', String(Math.round(opts.startPositionTicks / TICKS_PER_MS / 1000)));
  }
  return params;
}

/**
 * The HLS ladder. Plex's transcoder is addressed by the item's metadata PATH
 * rather than by id, and wants a caller-invented `session` — that session id is
 * also the handle used to tear the encode down again, which is why it is
 * returned to the caller rather than kept here.
 *
 * Pure string-building, no network call — safe to call for a URL that may
 * never actually be read (playback-routing.ts's directStreamUrl keeps a
 * defensive Plex fallback that's unreachable while playbackIsDirectSafe()
 * always returns false for Plex). Real consumers of the returned URL must
 * precede it with preflightPlexTranscodeDecision — see that function and
 * issue #76.
 */
export function buildPlexHlsStreamUrl(
  server: string,
  token: string,
  itemId: string,
  opts?: PlexHlsOpts
): { url: string; sessionId: string } {
  const base = normalizePlexUrl(server);
  const sessionId = opts?.sessionId ?? `halcyon-${Date.now().toString(36)}`;
  const params = plexTranscodeParams(token, itemId, sessionId, opts);
  return { url: `${base}/video/:/transcode/universal/start.m3u8?${params}`, sessionId };
}

/**
 * PMS 1.43 (verified against 1.43.3) answers start.m3u8 with a bare 400 when
 * nothing has asked it to decide the transcode first — steady-state, every
 * time, not just on a cold boot. Asking `/decision` with the IDENTICAL
 * params (same path, same session id, `decision` in place of `start.m3u8`)
 * immediately before is what every official Plex client does, and it makes
 * PMS answer start.m3u8 with 200 every time instead. A non-200 here is the
 * real playback error a bare hls.js 400 would otherwise stand in for
 * (issue #76) — callers on a path that can await MUST call this before
 * using a URL from buildPlexHlsStreamUrl; callers that can't (the player's
 * mid-playback track/quality switch runs inside a user-gesture chain — see
 * playback-routing.ts) fire it without waiting, best-effort.
 */
export async function preflightPlexTranscodeDecision(
  server: string,
  token: string,
  itemId: string,
  sessionId: string,
  opts?: PlexHlsOpts
): Promise<void> {
  const base = normalizePlexUrl(server);
  const params = plexTranscodeParams(token, itemId, sessionId, opts);
  const res = await fetch(`${base}/video/:/transcode/universal/decision?${params}`, {
    headers: plexHeaders(token),
  });
  if (!res.ok) {
    throw new Error(`Plex transcode decision failed: HTTP ${res.status} ${res.statusText}`);
  }
}

/** Tear down an abandoned encode — it pins server CPU until it times out. */
export async function stopPlexTranscode(
  server: string,
  token: string,
  sessionId: string,
  log?: (msg: string) => void
): Promise<void> {
  try {
    const params = new URLSearchParams({ session: sessionId, 'X-Plex-Token': token });
    await fetch(`${normalizePlexUrl(server)}/video/:/transcode/universal/stop?${params}`, {
      headers: plexHeaders(token),
    });
  } catch (e: any) {
    console.warn('[Plex] Failed to stop transcode session:', e);
    log?.(`[Player] stopPlexTranscode failed: ${e?.message ?? e}`);
  }
}

/**
 * Progress reporting uses `/:/progress` and `/:/scrobble`, NOT `/:/timeline`.
 *
 * `/:/timeline` is the endpoint every Plex-API write-up names, and it is the
 * wrong one here: it belongs to a live play-queue session (it wants
 * playQueueItemID and the session state machine), and answers 400 to a client
 * that is simply reporting where the viewer got to — verified against 1.43.3,
 * with and without the documented parameter set. `/:/progress` sets viewOffset
 * and `/:/scrobble` sets viewCount, which is exactly the two pieces of state
 * the store reads back as `resumePositionTicks` and `played`.
 */
async function plexStateCall(server: string, token: string, path: string): Promise<void> {
  try {
    await fetch(`${normalizePlexUrl(server)}${path}`, { headers: plexHeaders(token) });
  } catch (e) {
    console.warn('[Plex] playback state report failed:', e);
  }
}

export async function reportPlexPlaybackStart(): Promise<void> {
  // No-op by design: Plex has no "started" write that isn't part of a timeline
  // session, and the store only ever reads back offset and count. Kept so the
  // provider surface stays the same shape as every other backend's.
}

export async function reportPlexPlaybackProgress(
  server: string,
  token: string,
  itemId: string,
  positionTicks: number
): Promise<void> {
  const ms = Math.round(positionTicks / TICKS_PER_MS);
  await plexStateCall(
    server,
    token,
    `/:/progress?key=${encodeURIComponent(itemId)}&identifier=com.plexapp.plugins.library` +
      `&time=${ms}&state=playing`
  );
}

export async function reportPlexPlaybackStopped(
  server: string,
  token: string,
  itemId: string,
  positionTicks: number,
  runTimeTicks?: number
): Promise<void> {
  const ms = Math.round(positionTicks / TICKS_PER_MS);
  // Past ~90% is a finish, not a pause — mark it watched and clear the resume
  // point, which is what every other Plex client does and what the store's
  // "played" sticker means.
  const finished = !!runTimeTicks && positionTicks >= runTimeTicks * 0.9;
  if (finished) {
    await plexStateCall(
      server,
      token,
      `/:/scrobble?key=${encodeURIComponent(itemId)}&identifier=com.plexapp.plugins.library`
    );
    return;
  }
  await plexStateCall(
    server,
    token,
    `/:/progress?key=${encodeURIComponent(itemId)}&identifier=com.plexapp.plugins.library` +
      `&time=${ms}&state=stopped`
  );
}

/**
 * On-demand codec/stream probe for an item the catalog didn't carry one for —
 * episodes, and any title whose track list the player needs. Same contract as
 * the Jellyfin side: undefined on any failure, which isDirectPlaySafe treats as
 * not-safe and so falls back to HLS rather than risking silent audio.
 */
export async function fetchPlexItemPlaybackInfo(
  server: string,
  token: string,
  itemId: string
): Promise<{ info?: MediaPlaybackInfo; streams?: MediaStreamInfo[]; partKey?: string }> {
  try {
    const res = await plexJson<any>(
      `${normalizePlexUrl(server)}/library/metadata/${itemId}`,
      token,
      { label: `Playback metadata for item ${itemId}` }
    );
    const item = toArray(res?.MediaContainer?.Metadata)[0];
    const media = toArray(item?.Media)[0];
    const part = toArray(media?.Part)[0];
    return {
      info: playbackInfoFromMedia(media),
      streams: streamsFromPart(part),
      partKey: part?.key,
    };
  } catch {
    return {};
  }
}
