// Explicit Emby transport, shared by the provider and synchronous playback callbacks.
import { createMediaBrowserClient } from '../media-browser-client.ts';
export const embyClient = createMediaBrowserClient('emby');
