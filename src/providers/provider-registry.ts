// Which media-server backends this build knows how to talk to (GH #32).
//
// Same shape as fixture-registry.ts: backends register a factory under a kind,
// and the boot flow creates one by name. Adding a backend is one new module
// plus one line here — the store's own code never names a server product.
//
// Only `import type` above the fold, so this module still runs under
// `node --test` type-stripping (tests/provider-registry.test.ts); the
// implementations it stores drag in Tauri and DOM globals a test process can't
// load, which is exactly why the registry keeps FACTORIES rather than
// instances. Nothing is constructed until someone asks for it by name.
import type { MediaSourceProvider } from './media-source-provider.ts';

export type ProviderFactory = () => MediaSourceProvider;

const registry = new Map<string, ProviderFactory>();

/** The kind assumed when an install has no `provider_kind` on disk — every
 *  install that predates the boundary is a Jellyfin one, so this is what keeps
 *  the migration a no-op for them. */
export const DEFAULT_PROVIDER_KIND = 'jellyfin';

export function registerProvider(kind: string, factory: ProviderFactory): void {
  registry.set(kind, factory);
}

/** Every registered kind, for the setup screen's server picker and tooling. */
export function listProviderKinds(): string[] {
  return [...registry.keys()].sort();
}

export function hasProvider(kind: string): boolean {
  return registry.has(kind);
}

/**
 * Build the provider for `kind`. Throws on an unknown kind rather than falling
 * back to Jellyfin: a stored `provider_kind` this build doesn't carry means the
 * user downgraded, or a backend was dropped, and silently stocking the store
 * from the wrong server would read as data loss. Callers that want the
 * forgiving behaviour ask for DEFAULT_PROVIDER_KIND explicitly.
 */
export function createProvider(kind: string): MediaSourceProvider {
  const factory = registry.get(kind);
  if (!factory) {
    const known = listProviderKinds().join(', ') || 'none registered';
    throw new Error(`Unknown media-source provider: ${kind} (known: ${known})`);
  }
  return factory();
}

/** Test seam — the registry is module-global, so a test that registers a fake
 *  would otherwise leak into the next one. Not called by app code. */
export function resetProviderRegistry(): void {
  registry.clear();
}
