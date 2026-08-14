// Backend registration — the one file that names every server product this
// build can talk to (GH #32). Importing this module is what makes the kinds
// available; `createProvider('jellyfin')` throws until it has run.
//
// Adding a backend: implement MediaSourceProvider in a sibling file, add one
// registerProvider line here, done. Nothing in the store's own code changes.
import { registerProvider } from './provider-registry';
import { JellyfinProvider } from './jellyfin-provider';
import { PlexProvider } from './plex-provider';

let registered = false;

/** Idempotent: the boot flow and the harness can both call this. */
export function registerBuiltInProviders(): void {
  if (registered) return;
  registered = true;
  registerProvider('jellyfin', () => new JellyfinProvider());
  registerProvider('plex', () => new PlexProvider());
  // registerProvider('emby',   () => new EmbyProvider());   -- next, and no
  //   longer free: since GH #53 moved this client to Jellyfin-native auth, an
  //   Emby provider must supply its own header shape and route prefix. Small,
  //   and mostly transport — everything above it is shared.
}

export { JellyfinProvider, JELLYFIN_CAPABILITIES } from './jellyfin-provider';
export { PlexProvider, PLEX_CAPABILITIES } from './plex-provider';
export {
  registerProvider,
  createProvider,
  listProviderKinds,
  hasProvider,
  DEFAULT_PROVIDER_KIND,
} from './provider-registry';
export type * from './media-source-provider';
