import { pingJellyseerr, type JellyseerrPingResult } from './jellyseerr';
import { reportError } from './error-telemetry';

export interface SeerrStatusState {
  testing: boolean;
  lastChecked?: number;
  ok?: boolean;
  reason?: string;
  email?: string;
}

let currentState: SeerrStatusState = {
  testing: false,
};

const listeners = new Set<(state: SeerrStatusState) => void>();

export function getSeerrValidationStatus(): SeerrStatusState {
  return currentState;
}

export function onSeerrStatusChange(fn: (state: SeerrStatusState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function updateState(next: Partial<SeerrStatusState>): void {
  currentState = { ...currentState, ...next };
  for (const fn of listeners) {
    try {
      fn(currentState);
    } catch {
      // Listener error ignored
    }
  }
}

export async function verifySeerrCredentialsLive(
  creds?: { url: string; apiKey?: string } | null,
  source = 'settings'
): Promise<JellyseerrPingResult> {
  updateState({ testing: true });
  const result = await pingJellyseerr(creds);
  updateState({
    testing: false,
    lastChecked: Date.now(),
    ok: result.ok,
    reason: result.reason,
    email: result.email,
  });

  if (!result.ok && result.reason && result.reason !== 'not configured') {
    reportError(
      `[Jellyseerr Misconfigured] ${result.reason}`,
      creds?.url ? { url: creds.url } : undefined,
      'warn',
      source
    );
  }

  return result;
}
