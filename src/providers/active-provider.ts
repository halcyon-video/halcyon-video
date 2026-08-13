// The backend THIS install talks to (GH #32) — one resolved provider, shared
// by every flow that needs one (boot, the setup terminal, and whatever comes
// next). Kept apart from provider-registry.ts because the registry is about
// what this BUILD can speak, and this is about what this INSTALL is pointed
// at; conflating them is how a second backend ends up half-selected.
import { createProvider, DEFAULT_PROVIDER_KIND } from './provider-registry';
import { registerBuiltInProviders } from './index';
import type { MediaSourceProvider, ProviderSession } from './media-source-provider';

/** Where the chosen backend is remembered. Absent on every install that
 *  predates the boundary, which is why reads fall back to Jellyfin rather than
 *  prompting — an existing store must boot into its own library with nobody
 *  touching a setting. */
export const PROVIDER_KIND_KEY = 'provider_kind';

let cached: MediaSourceProvider | null = null;

export function activeProviderKind(): string {
  try {
    return localStorage.getItem(PROVIDER_KIND_KEY) || DEFAULT_PROVIDER_KIND;
  } catch {
    // Private-mode/locked storage: a store that can't read a preference should
    // still open, on the backend every existing install uses.
    return DEFAULT_PROVIDER_KIND;
  }
}

/** Resolved once: the kind can't change without a reconnect, and constructing
 *  a provider is cheap but not free. */
export function activeProvider(): MediaSourceProvider {
  if (!cached) {
    registerBuiltInProviders();
    cached = createProvider(activeProviderKind());
  }
  return cached;
}

/** Drop the cached instance — for a backend switch, and for tests. */
export function resetActiveProvider(): void {
  cached = null;
}

/**
 * Wrap the loose token/userId strings localStorage still holds as the session
 * a provider expects. A symptom of storage that predates sessions: it goes
 * away when the keys become provider_token/provider_userid (Phase 3 of
 * tickets/adapter-boundary-design-2026-08-08.md), not by loosening the
 * interface to take the pair.
 */
export function sessionOf(accessToken: string, userId: string, userName = ''): ProviderSession {
  return { accessToken, userId, userName };
}
