// Jellyfin as a MediaSourceProvider (GH #32).
//
// This is a DELEGATING wrapper, on purpose: every method forwards to the
// functions jellyfin.ts already exports, so the boundary lands with no change
// to a single network call. Moving that logic in here bodily is Phase 4 of
// tickets/adapter-boundary-design-2026-08-08.md, and it stays cheap only if
// the interface is proven against the real client first — which is what this
// file does.
//
// The reference implementation for anyone adding a backend: read this next to
// media-source-provider.ts to see what each method is expected to return.
import {
  authenticateUser,
  validateToken,
  fetchPublicUsers,
  fetchJellyfinLibrariesAndMovies,
  fetchLibraryList,
  fetchSeriesEpisodes,
  fetchFirstEpisodeOfSeries,
  reportPlaybackStart,
  reportPlaybackProgress,
  reportPlaybackStopped,
  stopActiveEncoding,
  buildItemImageUrl,
  buildUserAvatarUrl,
  buildStaticStreamUrl,
  buildHlsStreamUrl,
  isDirectPlaySafe,
  getLastHlsPlaySessionId,
  normalizeUrl,
  fetchUserConfigPrefs,
  saveUserConfigPrefs,
} from '../jellyfin';
import type {
  AccountSummary,
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
  UserConfigSnapshot,
} from './media-source-provider';

/**
 * What a stock Jellyfin server can do, as this client actually uses it.
 *
 * `skipMarkers` is false because intro/credit detection needs the unofficial
 * Intro Skipper plugin, which most installs don't carry — a per-server probe
 * could raise it, but guessing optimistic here would put a dead "Skip Intro"
 * button on most people's screens. `scrubPreviews` is false because the store
 * consumes no trickplay data yet, not because the server can't generate it:
 * the flag describes what the pairing supports end to end, since that is what
 * a caller branches on.
 */
export const JELLYFIN_CAPABILITIES: ProviderCapabilities = {
  multiUserPicker: true,      // Users/Public — the fanned membership cards
  directServerLogin: true,    // username+password straight to the server
  collections: true,          // BoxSets -> the collection endcap
  smartCollections: false,    // no Jellyfin equivalent
  multiVersion: true,         // MediaSources + collapseDuplicateVersions()
  namedEditions: false,       // labels are inferred from resolution/codec
  skipMarkers: false,         // plugin-only; see note above
  scrubPreviews: false,       // server has trickplay, this client reads none
  transcoding: true,          // HLS via buildHlsStreamUrl
  watchState: true,           // UserData.Played -> staff-picks anchors
  resumePosition: true,       // UserData.PlaybackPositionTicks
  userConfigStorage: true,    // DisplayPreferences CustomPrefs (GH #123)
};

// Metadata entries, not settings — hoisted off on load so they never reach
// localStorage, and written on every save.
const SAVED_AT_PREF = 'halcyon_saved_at';

/**
 * The marker that says THIS CLIENT has written here, and the reason it exists.
 *
 * A DisplayPreferences record is never empty on a stock Jellyfin: verified on
 * 10.11.11, a GET for a client that has never saved anything still returns
 * server-injected defaults (chromecastVersion, skipForwardLength,
 * dashboardTheme, …) in CustomPrefs. So "CustomPrefs has entries" does NOT mean
 * "this user has a saved store", and treating it that way is actively
 * dangerous: store-config-sync reconciles against the snapshot, so a first boot
 * on a well-configured machine would read those defaults, find none of its own
 * settings among them, and conclude the user had cleared every one — deleting a
 * working store's configuration on the strength of a record we never wrote.
 *
 * Hence an explicit marker rather than a count. Absent means "no Halcyon config
 * here", which is a first run, which leaves local settings alone.
 */
const CONFIG_MARKER_PREF = 'halcyon_config_v';
const CONFIG_FORMAT_VERSION = '1';

export class JellyfinProvider implements MediaSourceProvider {
  readonly id = 'jellyfin';
  readonly displayName = 'Jellyfin';
  readonly capabilities = JELLYFIN_CAPABILITIES;

  normalizeServerAddress(input: string): string {
    return normalizeUrl(input);
  }

  async authenticate(server: string, creds: ProviderCredentials): Promise<ProviderSession> {
    const { accessToken, userId, userName } = await authenticateUser(
      server,
      creds.username ?? '',
      creds.password
    );
    return { accessToken, userId, userName };
  }

  async validateSession(server: string, session: ProviderSession): Promise<boolean> {
    return validateToken(server, session.accessToken);
  }

  async listSelectableAccounts(server: string): Promise<AccountSummary[]> {
    const users = await fetchPublicUsers(server);
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      hasPassword: u.hasPassword,
      avatarUrl: buildUserAvatarUrl(server, u.id, u.primaryImageTag),
    }));
  }

  async listLibraries(server: string, session: ProviderSession): Promise<LibrarySummary[]> {
    return fetchLibraryList(server, session.accessToken, session.userId);
  }

  async fetchLibraries(
    server: string,
    session: ProviderSession,
    onProgress?: (stage: string) => void,
    opts?: { excludeLibraryIds?: ReadonlySet<string> }
  ): Promise<Library[]> {
    return fetchJellyfinLibrariesAndMovies(
      server,
      session.accessToken,
      session.userId,
      onProgress,
      opts
    );
  }

  async fetchSeriesEpisodes(
    server: string,
    session: ProviderSession,
    seriesId: string
  ): Promise<Episode[]> {
    return fetchSeriesEpisodes(server, session.accessToken, session.userId, seriesId);
  }

  async fetchFirstEpisodeOfSeries(
    server: string,
    session: ProviderSession,
    seriesId: string
  ): Promise<{ id: string; path: string } | null> {
    return fetchFirstEpisodeOfSeries(server, session.accessToken, session.userId, seriesId);
  }

  buildArtworkUrl(server: string, session: ProviderSession, ref: ArtworkRef): string | null {
    if (ref.kind === 'avatar') {
      return buildUserAvatarUrl(server, ref.itemId, ref.tag);
    }
    return buildItemImageUrl(server, session.accessToken, ref.itemId, ref.kind, ref.maxWidth);
  }

  /**
   * Direct play hands back the raw file URL; the transcode path is the HLS
   * ladder. The DECISION between them stays with the caller (it depends on the
   * webview's decoder, not on the server) — pass `kind` to say which you want,
   * defaulting to direct, exactly as launchVideoPlayback does today.
   */
  async resolvePlaybackSource(
    server: string,
    session: ProviderSession,
    itemId: string,
    opts?: PlaybackRequestOptions & { kind?: 'direct' | 'transcode' }
  ): Promise<PlaybackSource> {
    if (opts?.kind === 'transcode') {
      const url = buildHlsStreamUrl(server, session.accessToken, itemId, {
        audioStreamIndex: opts.audioStreamIndex,
        subtitleStreamIndex: opts.subtitleStreamIndex,
        maxBitrate: opts.maxBitrate,
        maxWidth: opts.maxWidth,
        startPositionTicks: opts.startPositionTicks,
        mediaSourceId: opts.mediaSourceId,
      });
      return { kind: 'transcode', url, sessionId: getLastHlsPlaySessionId() };
    }
    return {
      kind: 'direct',
      url: buildStaticStreamUrl(server, session.accessToken, itemId, opts?.mediaSourceId),
    };
  }

  isDirectPlaySafe(info: MediaPlaybackInfo | undefined | null): boolean {
    return isDirectPlaySafe(info);
  }

  async reportPlaybackStart(
    server: string,
    session: ProviderSession,
    itemId: string
  ): Promise<void> {
    return reportPlaybackStart(server, session.accessToken, itemId);
  }

  async reportPlaybackProgress(
    server: string,
    session: ProviderSession,
    itemId: string,
    progress: PlaybackProgress
  ): Promise<void> {
    return reportPlaybackProgress(
      server,
      session.accessToken,
      itemId,
      progress.positionTicks,
      progress.isPaused
    );
  }

  async reportPlaybackStopped(
    server: string,
    session: ProviderSession,
    itemId: string,
    positionTicks: number
  ): Promise<void> {
    return reportPlaybackStopped(server, session.accessToken, itemId, positionTicks);
  }

  // ── Per-user store configuration (GH #123) ────────────────────────────────
  //
  // The snapshot is one CustomPrefs ENTRY PER SETTING rather than a single
  // JSON blob under one key. It costs nothing here and buys two things: each
  // value stays far inside the server's per-value size limit however many
  // settings the app grows, and the record is legible in Jellyfin's own
  // database — a person who wants to know what this client stored about them,
  // or wants to clear one setting, can see it item by item.

  async loadUserConfig(
    server: string,
    session: ProviderSession
  ): Promise<UserConfigSnapshot | null> {
    const stored = await fetchUserConfigPrefs(server, session.accessToken, session.userId);
    if (!stored || !stored[CONFIG_MARKER_PREF]) return null;
    const {
      [SAVED_AT_PREF]: savedAt,
      [CONFIG_MARKER_PREF]: _version,
      ...values
    } = stored;
    return { values, savedAt };
  }

  async saveUserConfig(
    server: string,
    session: ProviderSession,
    snapshot: UserConfigSnapshot
  ): Promise<void> {
    const values: Record<string, string> = { ...snapshot.values };
    // Stamped into the record itself so the stored preferences say when, and by
    // implication from where, the store was last configured. Costs one entry
    // and makes an otherwise opaque row in someone's Jellyfin database
    // self-explanatory; hoisted back off on load so it never reaches storage
    // as a setting.
    if (snapshot.savedAt) values[SAVED_AT_PREF] = snapshot.savedAt;
    values[CONFIG_MARKER_PREF] = CONFIG_FORMAT_VERSION;
    return saveUserConfigPrefs(server, session.accessToken, session.userId, values);
  }

  async cancelActiveTranscode(
    sessionId: string,
    log?: (msg: string) => void,
    conn?: { server: string; session: ProviderSession }
  ): Promise<void> {
    return stopActiveEncoding(
      sessionId,
      log,
      conn ? { url: conn.server, token: conn.session.accessToken } : null
    );
  }
}
