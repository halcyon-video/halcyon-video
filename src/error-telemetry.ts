/**
 * Error telemetry client module.
 *
 * Forwards frontend crashes, unhandled rejections, and service misconfiguration
 * warnings to the server's /__log endpoint so they are immediately visible in
 * `docker logs` and server console output.
 */

export interface ClientLogPayload {
  level?: 'error' | 'warn' | 'info';
  message: string;
  source?: string;
  details?: Record<string, unknown> | string;
}

const seenRecent = new Map<string, number>();
const DEDUP_WINDOW_MS = 5000;

export function reportError(
  message: string,
  details?: Record<string, unknown> | string,
  level: 'error' | 'warn' | 'info' = 'error',
  source = 'app'
): void {
  const key = `${level}:${source}:${message}`;
  const now = Date.now();
  const last = seenRecent.get(key);
  if (last && now - last < DEDUP_WINDOW_MS) return;
  seenRecent.set(key, now);

  if (seenRecent.size > 100) {
    for (const [k, t] of seenRecent) {
      if (now - t > DEDUP_WINDOW_MS) seenRecent.delete(k);
    }
  }

  const payload: ClientLogPayload = {
    level,
    message,
    source,
    details,
  };

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon('/__log', blob);
      return;
    }
  } catch {
    // Fall back to fetch
  }

  if (typeof fetch === 'function') {
    fetch('/__log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Dev/preview server might not be running or endpoint missing; swallow.
    });
  }
}
