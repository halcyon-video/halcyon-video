// Status tracking, diagnostics, and fallback configuration for ceiling-hung CRT TVs.
// Pure data & helpers: safe for node tests and settings inspection without loading Three/HLS.

export type AmbientTvSource = 'stream' | 'loop' | 'dead';
export type AmbientTvFallbackPreference = 'loop' | 'dark' | 'testcard';

export interface AmbientTvStatus {
  /** Current source feeding the screens: media server stream, bundled loop, or off. */
  source: AmbientTvSource;
  /** Whether the current source is healthy / decoding without fault. */
  ok: boolean;
  /** Title of the movie or clip currently playing, or null when dark. */
  title: string | null;
  /** Last stream failure reason (e.g. timeout, HLS fatal error, 404), if any. */
  lastFailureReason: string | null;
  /** Server provider kind (e.g. 'jellyfin', 'plex') when known. */
  backend?: string | null;
}

let activeTvStatus: AmbientTvStatus = {
  source: 'dead',
  ok: false,
  title: null,
  lastFailureReason: null,
  backend: null,
};

/** Live CRT stream status, inspectable by settings and diagnostics. */
export function getAmbientTvStatus(): AmbientTvStatus {
  return { ...activeTvStatus };
}

/** Update the live CRT stream status and mirror to window globals for diagnostics. */
export function updateAmbientTvStatus(patch: Partial<AmbientTvStatus>): AmbientTvStatus {
  activeTvStatus = { ...activeTvStatus, ...patch };
  if (typeof window !== 'undefined') {
    (window as any).__tvStatus = { ...activeTvStatus };
    (window as any).__tvStream = {
      ok: activeTvStatus.ok,
      source: activeTvStatus.source,
      title: activeTvStatus.title,
      reason: activeTvStatus.lastFailureReason,
      lastFailureReason: activeTvStatus.lastFailureReason,
      backend: activeTvStatus.backend,
    };
    try {
      window.dispatchEvent(new CustomEvent('halcyon:tv-status', { detail: { ...activeTvStatus } }));
    } catch {
      // In testing environments window might lack CustomEvent dispatch
    }
  }
  return { ...activeTvStatus };
}

/** Reset the live CRT stream status to initial dark state (e.g. during test teardown). */
export function resetAmbientTvStatus(): void {
  activeTvStatus = {
    source: 'dead',
    ok: false,
    title: null,
    lastFailureReason: null,
    backend: null,
  };
}

/**
 * Format the live CRT stream status for display in settings and terminal reports.
 * E.g. "Active: Streaming <Movie Title>", "Fallback: Big Buck Bunny (reason: transcode watchdog timeout after 20s)", or "Off".
 */
export function formatAmbientTvStatus(status: AmbientTvStatus = getAmbientTvStatus()): string {
  if (status.source === 'stream') {
    return status.title ? `Active: Streaming ${status.title}` : 'Active: Streaming';
  }
  if (status.source === 'loop') {
    if (status.lastFailureReason) {
      return `Fallback: Big Buck Bunny (reason: ${status.lastFailureReason})`;
    }
    return 'Fallback: Big Buck Bunny';
  }
  // status.source === 'dead'
  if (status.title === 'SMPTE Test Card') {
    return status.lastFailureReason
      ? `Test Card (reason: ${status.lastFailureReason})`
      : 'Test Card: SMPTE Bars';
  }
  if (status.lastFailureReason) {
    return `Off (reason: ${status.lastFailureReason})`;
  }
  return 'Off';
}

/**
 * Reads user fallback mode preference:
 * - 'loop': play bundled CC-BY promo clip (Big Buck Bunny)
 * - 'dark': turn tubes dark/off
 * - 'testcard': display SMPTE color test card
 *
 * Honors legacy bb_tv_demo_loop=0 and bb_tv_testcard=1 for backward compatibility.
 */
export function getTvFallbackPreference(): AmbientTvFallbackPreference {
  try {
    if (typeof localStorage === 'undefined') return 'loop';
    const pref = localStorage.getItem('bb_tv_fallback');
    if (pref === 'dark' || pref === 'testcard' || pref === 'loop') return pref as AmbientTvFallbackPreference;
    if (localStorage.getItem('bb_tv_demo_loop') === '0') return 'dark';
    if (localStorage.getItem('bb_tv_testcard') === '1') return 'testcard';
  } catch {
    // no storage
  }
  return 'loop';
}
