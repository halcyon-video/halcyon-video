// Backend registration. Imported once for its side effect, early enough that
// any later activeBackend() call finds a populated registry — main.ts and the
// tools that boot without it (remote play, the demo harness) each pull this in
// before touching the media layer.
//
// It exists as its own module so media-backend.ts can stay free of imports
// from the backends it defines the contract for: the call sites import the
// contract, the contract imports nothing, and only this file knows the full
// list.
import { registerBackend } from './media-backend.ts';
import { jellyfinBackend } from './jellyfin.ts';
import { plexBackend } from './plex.ts';

// Order matters for identifyServer, which probes in registration order and
// stops at the first match. Plex goes first because its probe is routed
// through the app's own /plex-proxy (a Plex server refuses browser requests
// from any non-loopback origin), so a miss costs a same-origin 404 and no
// console noise — whereas a missed Jellyfin probe is a cross-origin request
// the browser reports as a CORS error. This says nothing about which backend
// is the DEFAULT: an install with no stored server kind is still Jellyfin.
registerBackend(plexBackend);
registerBackend(jellyfinBackend);

export { jellyfinBackend, plexBackend };
