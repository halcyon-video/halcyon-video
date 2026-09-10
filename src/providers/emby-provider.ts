// Emby uses its own explicit wire protocol while sharing MediaBrowser catalog DTO conversion.
import { JellyfinProvider, JELLYFIN_CAPABILITIES } from './jellyfin-provider.ts';
import { embyClient } from './emby-client.ts';

export const EMBY_CAPABILITIES = { ...JELLYFIN_CAPABILITIES, userConfigStorage: true };

export class EmbyProvider extends JellyfinProvider {
  readonly id = 'emby';
  readonly displayName = 'Emby';
  readonly capabilities = EMBY_CAPABILITIES;
  constructor() { super(embyClient); }
}
