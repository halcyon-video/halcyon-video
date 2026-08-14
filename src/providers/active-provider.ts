// The backend THIS install talks to (GH #32) — one resolved provider, shared
// by every flow that needs one (boot, the setup terminal, and whatever comes
// next). Kept apart from provider-registry.ts because the registry is about
// what this BUILD can speak, and this is about what this INSTALL is pointed
// at; conflating them is how a second backend ends up half-selected.
import { createProvider, activeProviderKind, PROVIDER_KIND_KEY } from './provider-registry';
import { registerBuiltInProviders } from './index';
import type { MediaSourceProvider, ProviderSession } from './media-source-provider';

// Which kind an install uses now lives in provider-registry.ts, so that reading
// it doesn't drag in the implementations: playback-routing.ts needs the kind on
// a synchronous path, and a test needs it without loading Tauri. Re-exported
// because this is where callers already look for it.
export { PROVIDER_KIND_KEY, activeProviderKind };

let cached: MediaSourceProvider | null = null;

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
