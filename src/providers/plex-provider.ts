// Plex as a MediaSourceProvider (GH #32).
//
// Same delegating shape as jellyfin-provider.ts: the HTTP and the mapping live
// in ../plex.ts, and this file is only the interface. Read the two side by side
// to see what each backend has to supply — the differences that survive to this
// layer are the honest ones (auth flow, direct-play decision, transcode
// teardown), and they are all visible in ONE screen rather than smeared through
// the store.
//
// The one shape that does NOT match Jellyfin: authenticate() takes an already-
// obtained account token, because Plex's login is a browser round trip through
// plex.tv that a provider method cannot perform on its own. The UI drives
// createPlexPin/pollPlexPin (../plex.ts) and hands the result here. That is
// what capabilities.directServerLogin: false is telling the caller.
import {
  buildPlexDirectStreamUrl,
  buildPlexHlsStreamUrl,
  buildPlexImageUrl,
  fetchPlexItemPlaybackInfo,
  fetchPlexLibrariesAndMovies,
  fetchPlexLibraryList,
  fetchPlexFirstEpisodeOfSeries,
  fetchPlexSeriesEpisodes,
  fetchPlexServers,
  normalizePlexUrl,
  reportPlexPlaybackProgress,
  reportPlexPlaybackStart,
  reportPlexPlaybackStopped,
  stopPlexTranscode,
  validatePlexToken,
} from '../plex';
import { isDirectPlaySafe } from '../playback-capability';
import type {
  ArtworkRef,
  Episode,
  Library,
  LibrarySummary,
  MediaPlaybackInfo,
  MediaSourceProvider,
  PlaybackProgress,
  PlaybackRequestOptions,
  PlaybackSource,
  ProviderCapabilities,
  ProviderCredentials,
  ProviderSession,
} from './media-source-provider';

/**
 * What a Plex server can do, as this client actually uses it.
 *
 * `multiUserPicker` is false and that is the interesting one: Plex home users
 * are not a list the SERVER will hand out — they hang off the linked plex.tv
 * account and need a switch-user token exchange per profile. So the fanned
 * membership-card picker has nothing to render from, and the login UI branches
 * to the PIN screen instead. Raising this flag without building that exchange
 * would put an empty card rack on screen.
 *
 * `skipMarkers` and `scrubPreviews` are false because nothing in the store
 * consumes them yet, not because Plex can't produce them — the flag describes
 * what the PAIRING supports end to end, same rule as the Jellyfin side.
 */
export const PLEX_CAPABILITIES: ProviderCapabilities = {
  multiUserPicker: false,     // home users need a plex.tv token exchange
  directServerLogin: false,   // plex.tv PIN, not username+password
  collections: true,          // /library/sections/<k>/collections
  smartCollections: true,     // rule-built collections arrive in the same list
  multiVersion: true,         // Media[] with 2+ entries
  namedEditions: true,        // curator-entered editionTitle
  skipMarkers: false,         // server has them, this client reads none
  scrubPreviews: false,       // BIF exists, this client reads none
  transcoding: true,          // /video/:/transcode/universal
  watchState: true,           // viewCount / lastViewedAt
  resumePosition: true,       // viewOffset
};

export class PlexProvider implements MediaSourceProvider {
  readonly id = 'plex';
  readonly displayName = 'Plex';
  readonly capabilities = PLEX_CAPABILITIES;

  normalizeServerAddress(input: string): string {
    return normalizePlexUrl(input);
  }

  /**
   * `creds.accountToken` is the plex.tv token the PIN flow produced. The server
   * address given here is trusted only as far as discovery: the account's own
   * resource list is what supplies the per-server token, because an account
   * token is NOT accepted by a server for library reads.
   *
   * When the address matches none of the account's servers we still return a
   * session carrying the account token — an unclaimed server on the LAN answers
   * to it, and refusing outright would lock out exactly the person testing a
   * fresh install.
   *
   * READ THIS BEFORE TREATING `session.userId` AS A CREDENTIAL. Plex has no
   * user id in Jellyfin's sense, and the field below is a SERVER
   * machineIdentifier standing in for one. It is empty far more often than it
   * looks: whenever the plex.tv resource lookup above fails (a LAN-only or
   * firewalled NAS, CORS, a plex.tv blip — all swallowed on purpose) or the
   * address the user typed isn't byte-equal to one of the account's advertised
   * connection URIs, `match` is undefined and this resolves to `''`. Nothing in
   * the Plex backend reads it back: every call in this file authenticates with
   * `session.accessToken` alone. So a caller that gates on a truthy userId is
   * not checking whether it is signed in, it is checking whether plex.tv
   * happened to answer — which is how series drill-down came to be dead on
   * Synology installs (GH #66). Gate on the token.
   */
  async authenticate(server: string, creds: ProviderCredentials): Promise<ProviderSession> {
    const accountToken = creds.accountToken;
    if (!accountToken) {
      throw new Error('Plex needs an account token from the sign-in code, not a password.');
    }
    const target = normalizePlexUrl(server);
    let servers: Awaited<ReturnType<typeof fetchPlexServers>> = [];
    try {
      servers = await fetchPlexServers(accountToken);
    } catch {
      // Offline plex.tv shouldn't block a LAN server that already works.
    }
    const match = servers.find((s) =>
      s.connections.some((c) => normalizePlexUrl(c) === target)
    );
    return {
      accessToken: match?.accessToken || accountToken,
      userId: match?.machineIdentifier || '',
      userName: match?.name || 'Plex',
      raw: { accountToken, machineIdentifier: match?.machineIdentifier },
    };
  }

  async validateSession(server: string, session: ProviderSession): Promise<boolean> {
    return validatePlexToken(server, session.accessToken);
  }

  // listSelectableAccounts is deliberately absent — capabilities.multiUserPicker
  // is false, and the contract is that a caller checks the flag rather than
  // probing for the method.

  async listLibraries(server: string, session: ProviderSession): Promise<LibrarySummary[]> {
    return fetchPlexLibraryList(server, session.accessToken);
  }

  async fetchLibraries(
    server: string,
    session: ProviderSession,
    onProgress?: (stage: string) => void,
    opts?: { excludeLibraryIds?: ReadonlySet<string> }
  ): Promise<Library[]> {
    return fetchPlexLibrariesAndMovies(server, session.accessToken, onProgress, opts);
  }

  async fetchSeriesEpisodes(
    server: string,
    session: ProviderSession,
    seriesId: string
  ): Promise<Episode[]> {
    return fetchPlexSeriesEpisodes(server, session.accessToken, seriesId);
  }

  async fetchFirstEpisodeOfSeries(
    server: string,
    session: ProviderSession,
    seriesId: string
  ): Promise<{ id: string; path: string } | null> {
    return fetchPlexFirstEpisodeOfSeries(server, session.accessToken, seriesId);
  }

  /**
   * Plex artwork is addressed by PATH, not by item id — thumb/art come off the
   * metadata item itself. ArtworkRef carries an id, so the ref's `tag` is used
   * to pass the path through (the catalog already resolved poster/backdrop URLs
   * at sync time; this exists for callers holding a raw path).
   */
  buildArtworkUrl(server: string, session: ProviderSession, ref: ArtworkRef): string | null {
    const path = ref.tag ?? null;
    if (!path) return null;
    return buildPlexImageUrl(server, session.accessToken, path, ref.maxWidth) ?? null;
  }

  /**
   * Direct play needs the file's Part key, which the caller doesn't hold — so a
   * direct request probes for it and DEGRADES TO TRANSCODE if the probe fails,
   * rather than returning a URL that would 404 at the player.
   */
  async resolvePlaybackSource(
    server: string,
    session: ProviderSession,
    itemId: string,
    opts?: PlaybackRequestOptions & { kind?: 'direct' | 'transcode' }
  ): Promise<PlaybackSource> {
    if (opts?.kind !== 'transcode') {
      const probe = await fetchPlexItemPlaybackInfo(server, session.accessToken, itemId);
      if (probe.partKey) {
        return {
          kind: 'direct',
          url: buildPlexDirectStreamUrl(server, session.accessToken, probe.partKey),
          container: probe.info?.container,
          videoCodec: probe.info?.videoCodec,
          audioCodecs: probe.info?.audioCodecs,
        };
      }
    }
    const { url, sessionId } = buildPlexHlsStreamUrl(server, session.accessToken, itemId, {
      maxBitrate: opts?.maxBitrate,
      startPositionTicks: opts?.startPositionTicks,
      mediaSourceId: opts?.mediaSourceId,
    });
    return { kind: 'transcode', url, sessionId };
  }

  isDirectPlaySafe(info: MediaPlaybackInfo | undefined | null): boolean {
    return isDirectPlaySafe(info);
  }

  async reportPlaybackStart(): Promise<void> {
    return reportPlexPlaybackStart();
  }

  async reportPlaybackProgress(
    server: string,
    session: ProviderSession,
    itemId: string,
    progress: PlaybackProgress
  ): Promise<void> {
    return reportPlexPlaybackProgress(server, session.accessToken, itemId, progress.positionTicks);
  }

  async reportPlaybackStopped(
    server: string,
    session: ProviderSession,
    itemId: string,
    positionTicks: number
  ): Promise<void> {
    return reportPlexPlaybackStopped(server, session.accessToken, itemId, positionTicks);
  }

  /**
   * The interface passes only a session id, but Plex's stop endpoint is on the
   * SERVER — so the address and token are recovered from the session this
   * provider last authenticated. Held here rather than widening the interface
   * for one backend; see the note in media-source-provider.ts on cancelActive
   * Transcode being capability-gated.
   */
  async cancelActiveTranscode(sessionId: string, log?: (msg: string) => void): Promise<void> {
    if (!this.lastServer || !this.lastToken) return;
    return stopPlexTranscode(this.lastServer, this.lastToken, sessionId, log);
  }

  private lastServer = '';
  private lastToken = '';

  /** Called by the boot flow after a successful connect so transcode teardown
   *  has an address to aim at. */
  rememberConnection(server: string, session: ProviderSession): void {
    this.lastServer = normalizePlexUrl(server);
    this.lastToken = session.accessToken;
  }
}
