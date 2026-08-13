// Which request server the store talks to, and whether one is configured at
// all. Kept as its own module with NO imports — not even a type import — so it
// runs under `node --test` type-stripping (tests/seerr-config.test.ts); the
// client that uses it (jellyseerr.ts) drags in Tauri and DOM globals that a
// test process can't load.
//
// The integration speaks the *Overseerr* API — `X-Api-Key`, `/api/v1/request`,
// `/api/v1/discover/*`, `/api/v1/movie/{tmdbId}` — which Jellyseerr inherited
// wholesale as a fork, so one client serves both (GH #50). The stored key
// stays `jellyseerr_*`, because that is what every existing install already
// has on disk; `seerr_*` and `overseerr_*` are accepted as aliases so an
// Overseerr user isn't asked to fill in a box named after the other fork.
//
// Worth knowing which way round this goes: Overseerr is Plex-only and
// Jellyseerr is the fork that added Jellyfin/Emby, so pointing this at a real
// Overseerr is only useful alongside a Plex library (GH #32) or in a
// dual-stack household. The wire protocol is identical either way, which is
// why the plumbing can land ahead of any library support.

export interface SeerrConfig {
  url: string;
  apiKey: string;
}

/** Preference order: canonical stored key first, then the aliases. */
export const SEERR_URL_KEYS = ['jellyseerr_url', 'seerr_url', 'overseerr_url'] as const;
export const SEERR_KEY_KEYS = ['jellyseerr_apikey', 'seerr_apikey', 'overseerr_apikey'] as const;

/**
 * Resolve a request-server config from any key store (localStorage, the vite
 * env map, a plain object in tests). Returns null when either half is missing —
 * that null is the switch deciding whether the Coming Soon wall and the
 * "ASK FOR RECOMMENDATIONS!" clasps get built at all, so a config that
 * half-resolves must read as "not configured" rather than as a broken server.
 */
export function resolveSeerrConfig(read: (key: string) => string | null | undefined): SeerrConfig | null {
  const first = (keys: readonly string[]): string => {
    for (const k of keys) {
      const v = (read(k) || '').trim();
      if (v) return v;
    }
    return '';
  };
  const url = first(SEERR_URL_KEYS);
  let apiKey = first(SEERR_KEY_KEYS);
  if (!url || !apiKey) return null;
  // Jellyseerr API keys are base64 with their '=' padding included, but
  // double-click-selecting the key in a browser stops at the '=' signs, so
  // pasted keys routinely arrive two characters short and every request 403s.
  // Padding is derivable from length, so restore it rather than reject.
  if (/^[A-Za-z0-9+/]+$/.test(apiKey) && apiKey.length % 4 >= 2) {
    apiKey += '='.repeat(4 - (apiKey.length % 4));
  }
  return { url: url.replace(/\/$/, ''), apiKey };
}
