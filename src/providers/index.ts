// Backend registration — the one file that names every server product this
// build can talk to (GH #32). Importing this module is what makes the kinds
// available; `createProvider('jellyfin')` throws until it has run.
//
// Adding a backend: implement MediaSourceProvider in a sibling file, add one
// registerProvider line here, done. Nothing in the store's own code changes.
import { registerProvider } from './provider-registry';
import { JellyfinProvider } from './jellyfin-provider';

let registered = false;

/** Idempotent: the boot flow and the harness can both call this. */
export function registerBuiltInProviders(): void {
  if (registered) return;
  registered = true;
  registerProvider('jellyfin', () => new JellyfinProvider());
  // registerProvider('emby',   () => new EmbyProvider());   -- next, and cheap:
  //   this client already speaks Emby's wire format (/emby/ paths, the
  //   X-Emby-Authorization header) because Jellyfin is a fork of it.
  // registerProvider('plex',   () => new PlexProvider());   -- contributor's
  //   file; needs the plex.tv PIN flow, so directServerLogin goes false and
  //   the login UI has to branch.
}

export { JellyfinProvider, JELLYFIN_CAPABILITIES } from './jellyfin-provider';
export {
  registerProvider,
  createProvider,
  listProviderKinds,
  hasProvider,
  DEFAULT_PROVIDER_KIND,
} from './provider-registry';
export type * from './media-source-provider';
