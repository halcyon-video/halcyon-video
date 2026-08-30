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
  preflightPlexTranscodeDecision,
  buildPlexImageUrl,
  fetchPlexItemPlaybackInfo,
  fetchPlexLibrariesAndMovies,
  fetchPlexLibraryList,
  fetchPlexFirstEpisodeOfSeries,
  fetchPlexSeriesEpisodes,
  fetchPlexServers,
  normalizePlexUrl,
  isMixedContentBlocked,
  plexConnectCandidates,
  probePlexServer,
  describePlexConnectFailure,
  samePlexEndpoint,
  PLEX_CONNECT_BUDGET_MS,
  PLEX_PROBE_TIMEOUT_MS,
  reportPlexPlaybackProgress,
  reportPlexPlaybackStart,
  reportPlexPlaybackStopped,
  stopPlexTranscode,
  validatePlexToken,
  type PlexProbe,
} from '../plex.ts';
import { isDirectPlaySafe } from '../playback-capability.ts';
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
  // GH #123, v1 non-goal: Plex exposes no per-user key/value surface a
  // third-party client may write. Its own client prefs live behind endpoints
  // reserved for Plex's apps, and the alternatives (a playlist used as a
  // storage bucket, a fake library section) would put our settings somewhere
  // the person can see, can't recognize, and would reasonably delete. A Plex
  // store therefore stays configured per-machine, which is what it did before
  // this capability existed — not a regression, just not an improvement yet.
  userConfigStorage: false,
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
   * When the address matches none of the account's servers we still TRY it with
   * the account token — an unclaimed server on the LAN answers to it, and
   * refusing outright would lock out exactly the person testing a fresh
   * install. What no longer happens is returning a session for an address
   * nothing answered at (#125): every candidate is probed, and a connect that
   * reached nothing throws with the reason rather than succeeding quietly.
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
    // Match on the ENDPOINT, not the string. plex.tv advertises one server at
    // several URLs and the person types whichever one they know; byte-equality
    // therefore missed the common case — a typed LAN IP against the account's
    // https://192-168-1-50.<hash>.plex.direct twin — and fell through to the
    // "unclaimed server" branch, discarding the per-server token for no reason.
    const match = servers.find((s) => s.connections.some((c) => samePlexEndpoint(c, target)));
    const token = match?.accessToken || accountToken;

    // The fallbacks are what let a hosted HTTPS page connect a LAN server at
    // all: the typed http:// address can never be sent from there, but the
    // plex.direct connection plex.tv advertises for the same box can.
    const candidates = plexConnectCandidates(target, match?.connections);

    // PROBE BEFORE DECLARING SUCCESS (#125). This used to return a session
    // without ever contacting the address, so "Connect & Sync" reported a
    // connection to a server that was never reached and the real failure
    // surfaced minutes later as a library-sync stall with nothing useful in it.
    //
    // The sweep is budgeted as a whole, not just per probe: a server with six
    // advertised connections that all hang would otherwise add up to a longer
    // wait than the boot watchdog this issue is about.
    const deadline = Date.now() + PLEX_CONNECT_BUDGET_MS;
    const attempts: PlexProbe[] = [];
    let reached: PlexProbe | undefined;
    for (const url of candidates) {
      const left = deadline - Date.now();
      // A blocked address is decided without a request, so it is always worth
      // asking about even with the budget spent — its message is the useful one.
      if (left <= 0 && !isMixedContentBlocked(url)) break;
      // Per-probe cap AND what's left of the sweep, whichever is shorter.
      const probe = await probePlexServer(url, token, {
        timeoutMs: Math.max(1, Math.min(PLEX_PROBE_TIMEOUT_MS, left)),
      });
      attempts.push(probe);
      if (probe.ok) { reached = probe; break; }
    }
    if (!reached) throw new Error(describePlexConnectFailure(attempts));

    // Reaching a relay address means every better candidate (LAN, plex.direct)
    // either wasn't advertised or didn't answer — connectionRank already sorts
    // relay last, so this can only be true when it was the best/only option
    // (GH #128). Surfaced on the session so the setup flow can warn: relay
    // answers /identity fast but is far too slow to carry a real library sync.
    const isRelay = !!match?.relayConnections?.some((u) => samePlexEndpoint(u, reached!.url));

    const session: ProviderSession = {
      accessToken: token,
      userId: match?.machineIdentifier || reached.machineIdentifier || '',
      userName: match?.name || 'Plex',
      // The address that ANSWERED, which is not always the one asked for — see
      // ProviderSession.serverAddress. A caller that persists `server` instead
      // saves an address it has just been told does not work.
      serverAddress: reached.url,
      raw: { accountToken, machineIdentifier: match?.machineIdentifier, isRelay, serverVersion: match?.productVersion || reached.version },
    };
    this.rememberConnection(reached.url, session);
    return session;
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
    // A catalog sync is the one call every connect path makes before the store
    // can be stocked — fresh sign-in, a saved session restored on boot, and the
    // setup terminal's re-sync all end up here even though only the first also
    // calls authenticate(). Remembering the connection on both entry points
    // means neither can be the seam that gets bypassed.
    this.rememberConnection(server, session);
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
    // Belt-and-suspenders alongside authenticate()/fetchLibraries(): this is
    // the exact call that can mint a transcode session id, so the connection
    // used to cancel one later is always the connection that just started it
    // — never a stale one from whatever ran first at boot.
    this.rememberConnection(server, session);
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
    const sessionId = `halcyon-${Date.now().toString(36)}`;
    const plexOpts = {
      maxBitrate: opts?.maxBitrate,
      startPositionTicks: opts?.startPositionTicks,
      mediaSourceId: opts?.mediaSourceId,
      sessionId,
    };
    // Awaited: this call is only ever made off a user-gesture chain (scene
    // build / ambient-tvs.ts), unlike the full-screen player's mid-playback
    // track switch — see preflightPlexTranscodeDecision (#76). A rejection
    // here propagates to ambient-tvs.ts's own try/catch around this call.
    await preflightPlexTranscodeDecision(server, session.accessToken, itemId, sessionId, plexOpts);
    const { url } = buildPlexHlsStreamUrl(server, session.accessToken, itemId, plexOpts);
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
   * Plex's stop endpoint is on the SERVER, so this needs an address and token.
   * `conn` carries them now (GH #84 widened the interface — a multi-server
   * store has no single "the" server to fall back on). The remembered
   * connection below stays as the fallback for callers that can't name one,
   * which is what every call site did before that widening.
   */
  async cancelActiveTranscode(
    sessionId: string,
    log?: (msg: string) => void,
    conn?: { server: string; session: ProviderSession }
  ): Promise<void> {
    const server = conn?.server || this.lastServer;
    const token = conn?.session.accessToken || this.lastToken;
    if (!server || !token) return;
    return stopPlexTranscode(server, token, sessionId, log);
  }

  private lastServer = '';
  private lastToken = '';

  /**
   * GH #69: this used to be a public method the boot flow was supposed to call
   * once, separately, after a successful connect — and nothing ever did,
   * which is exactly the shape of a seam that gets bypassed. There are three
   * ways this app reaches a connected Plex session (a fresh sign-in through
   * authenticate(), a saved token/server restored on boot straight into
   * fetchLibraries(), and the setup terminal's own re-sync, also through
   * fetchLibraries()), so telling the provider about the connection from the
   * OUTSIDE meant getting all three call sites right forever. Instead the
   * provider now notices its own connection as a side effect of the calls it
   * already has to serve — authenticate(), fetchLibraries(), and
   * resolvePlaybackSource() each call this on entry — so a future connect
   * path only has to call an existing MediaSourceProvider method to stay
   * covered, not remember a fourth thing to wire up.
   */
  private rememberConnection(server: string, session: ProviderSession): void {
    this.lastServer = normalizePlexUrl(server);
    this.lastToken = session.accessToken;
  }
}
