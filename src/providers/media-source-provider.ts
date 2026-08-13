// The media-server boundary: every type the store needs to describe a catalog,
// and the one interface a server backend implements to fill it (GH #32).
//
// Deliberately has NO imports — not even a type import — so it runs under
// `node --test` type-stripping (tests/provider-registry.test.ts), same reason
// as seerr-config.ts. Every implementation drags in Tauri and DOM globals a
// test process can't load; the shapes they agree on must not.
//
// Naming: the store's own vocabulary is `Title`/`Library`, with `Movie` and
// `JellyfinLibrary` kept as aliases because ~50 files import those names from
// jellyfin.ts today. jellyfin.ts re-exports all of this, so no call site moves
// on this pass — the aliases are what makes the relocation a no-op rather than
// a 50-file rename, and they can be retired one importer at a time later.

/** One shelvable item: a film, a series container, or a game carton. */
export interface Title {
  id: string;
  title: string;
  year: number;
  duration: string;
  rating: string;
  overview: string;
  director: string;
  actors: string[]; // top-billed cast, at most 5 names
  genres: string[];
  localPath: string;
  posterUrl?: string;
  backdropUrl?: string;
  dateCreated?: string;
  isSeries?: boolean;
  is4k?: boolean;
  communityRating?: number; // 0-10 (e.g. 9.0 = 4.5 stars out of 5)
  criticRating?: number;    // 0-100 Rotten Tomatoes score
  libraryName?: string;
  studios?: string[];
  // Synthesized (see jellyseerr.ts) for a title that's been requested on the
  // request server but hasn't finished downloading yet: it gets a display case
  // with poster art on the New Releases wall but no rental backstock, and
  // selecting it should show "Coming Soon" rather than allow playback.
  comingSoon?: boolean;
  // TMDB id (see jellyseerr.ts's fetchDiscoverMovies) -- required to call
  // requestMovie() for a discovery title. Provider-neutral by construction:
  // TMDB is a third-party metadata service, not a media server, which is why
  // the staff-picks engine can join on it across backends.
  tmdbId?: number;
  // Synthesized (see jellyseerr.ts's fetchDiscoverMovies) for a request-server
  // trending/popular suggestion that is NOT in the library: it gets an empty
  // display case shelved inline with the regular stock (REQUEST corner
  // sticker, no rental backstock), and selecting it lets the user REQUEST it
  // instead of play it.
  discovery?: boolean;
  // True when a `discovery` or `collectionGap` title has already been
  // requested (through this app this session, or because the request server's
  // own records say so -- see StoreScene's merge of comingSoon into
  // discoveryMovies, and fetchCollectionGaps keeping requested gaps). These
  // cases stamp the gold COMING SOON corner label instead of the blue
  // REQUEST one; endcap candidates wear the green REQUESTED tag.
  discoveryRequested?: boolean;
  // T18: synthesized (see romm.ts's fetchGames) for a video-game title from a
  // Romm server. It gets a display case (cover art) in the VIDEO GAMES section,
  // is grouped under `platform` (e.g. "SNES"), and selecting it "rents" -> the
  // Tauri build launches the configured emulator on `launchPath`; the browser
  // build shows a "take it to the counter" toast.
  game?: boolean;
  platform?: string;
  launchPath?: string;
  // Flat scan art for the case's OTHER faces (back panel / spine / disc
  // label), resolved by romm.ts's gameArtUrls(). Absent for a title whose
  // library never scraped that media — the faces then keep their generated
  // fallbacks. Typed loosely here so this module stays import-free.
  gameArt?: { back?: string; spine?: string; label?: string };
  // Discs in this title's retail case (romm.ts discCountFrom: distinct
  // "(Disc N)" tags across the rom + its siblings). Only set when >= 2 —
  // it thickens a jewel-case platform's box to the multi-disc fat case.
  discCount?: number;
  // Audio/subtitle streams of the primary media source (already fetched with
  // the catalog) — drives the in-app player's track picker. Absent for series
  // containers, games, and discovery titles.
  mediaStreams?: MediaStreamInfo[];
  // Container + video/audio codecs of the primary media source (same fetch as
  // mediaStreams above) — lets launchVideoPlayback decide direct-play vs. HLS
  // transcode BEFORE opening the player (see isDirectPlaySafe). Absent for
  // series containers, games, and discovery titles; series episodes are probed
  // on demand instead (see fetchItemPlaybackInfo) since the episode list never
  // fetches media sources.
  mediaPlaybackInfo?: MediaPlaybackInfo;
  // Width/height ratio of the poster image. Lets flat mode size a case to the
  // art before the lazy poster loads (issue #108) instead of reflowing the row
  // on every image load. Absent for games, discovery titles, and servers that
  // haven't probed the image yet.
  primaryImageAspectRatio?: number;
  // Alternate quality versions of the same film. Built two ways: an item whose
  // versions were merged server-side carries several media sources (one
  // version each), and duplicate items of the same film (a 4K rip and a 1080p
  // rip ingested separately) are collapsed to ONE shelf box by
  // collapseDuplicateVersions(). Present ONLY when there are 2+ choices,
  // ordered best-quality-first; pressing Play on such a title opens the
  // version picker (main.ts) instead of streaming blind.
  versions?: TitleVersion[];
  // Name of the collection this title belongs to, e.g. "Harry Potter
  // Collection". List queries don't carry membership on the item itself, so
  // this is tagged in a separate pass after library sync (see
  // applyCollectionMembership). Members of one collection file together on the
  // shelf in premiere order (see shelfTitleCompare in store-layout).
  collectionName?: string;
  // ISO premiere date — breaks the chronological tie between same-collection
  // titles released the same year (production year alone can't order them).
  premiereDate?: string;
  // Synthesized (see jellyseerr.ts's fetchCollectionGaps) for an entry of a
  // collection the user PARTLY owns — you have 5 of the 8 Harry Potters, so
  // the other 3 stand in their correct chronological shelf position wearing a
  // corner sticker, with no rental backstock behind them. Selecting one
  // requests it through the request server rather than playing it.
  //
  // A media server can't source these on its own: its collection is built from
  // the files you have, so it has no idea the collection is incomplete. The
  // full member list comes from TMDB via the request server.
  collectionGap?: boolean;
  // Per-user watch state (the catalog queries hit a per-user endpoint, so this
  // is THIS user's history). Watched titles are the anchors the staff-picks
  // engine aggregates TMDB "people who liked this also liked" results over
  // (see staff-picks.ts) — the one place a backend's watch state feeds a
  // store fixture, and so the first thing a metadata-less backend loses.
  played?: boolean;
  playCount?: number;
  lastPlayedDate?: string; // ISO — orders anchors by recency
  // Ticks into the item the server says THIS user left off at. Jellyfin only
  // ever returns a non-zero PlaybackPositionTicks while the item is still
  // inside its own resume window (fully watched or never started both come
  // back unset) — so "present -> resume there" is the same rule every other
  // client follows, with no separate "start over" affordance needed.
  resumePositionTicks?: number;
  // Exact runtime in ticks, alongside the rounded `duration` display string
  // above. Lets a natural end-of-file be told apart from a user quit without a
  // per-path duration probe (see playback-flow.ts).
  runTimeTicks?: number;
  // Set by the staff-picks engine on an OWNED title that the aggregated
  // watch-history recommendations surfaced: its case wears the STAFF PICK
  // sticker (video-case.ts) and it's eligible for the genre endcaps.
  staffPick?: boolean;
  // Top-billed cast as person references (id + portrait URL), captured
  // alongside `actors` (name-only) so wall décor (wall-decor.ts) can tally the
  // library's most-featured actors and pull real portraits without a second
  // round-trip. Same top-5 cap as `actors`; `imageUrl` is only set when the
  // person has a portrait on the server (many crew/cast entries don't).
  // Undefined on synthesized titles (discovery/collectionGap/game) and the
  // synthetic demo/harness catalog, which has no person image data at all.
  castPeople?: { id: string; name: string; imageUrl?: string }[];
}

export interface MediaStreamInfo {
  /** Server stream index — pass as AudioStreamIndex/SubtitleStreamIndex. */
  index: number;
  type: 'Audio' | 'Subtitle';
  language?: string;
  displayTitle?: string;
  codec?: string;
  isDefault?: boolean;
  /** Audio channel count (2 = stereo, 6 = 5.1, 8 = 7.1) — used to print the
   *  channel layout in the back-cover tech-specs table. Audio streams only. */
  channels?: number;
}

/** One playable quality/edition of a film — see Title.versions. */
export interface TitleVersion {
  /** Item to stream (and report playback against). */
  itemId: string;
  /** Set when this version is one media source of a server-side-merged item;
   *  passed so the server streams THAT file, not the default. */
  mediaSourceId?: string;
  /** Picker row text, e.g. "4K · HDR · HEVC · 54 GB". */
  label: string;
  is4k: boolean;
  /** Video frame size, for best-first ordering. */
  width?: number;
  height?: number;
  /** File path of this version, for the external-player fallback. */
  localPath?: string;
  mediaStreams?: MediaStreamInfo[];
  mediaPlaybackInfo?: MediaPlaybackInfo;
}

export interface MediaPlaybackInfo {
  container?: string;
  videoCodec?: string;
  audioCodecs: string[];
  /** Video frame dimensions of the default source — feed the tech-specs
   *  table's resolution + aspect-ratio derivation. */
  width?: number;
  height?: number;
  /** Display aspect ratio string straight from the server (e.g. "16:9",
   *  "2.40:1"), when it reports one. */
  aspectRatio?: string;
  /** HDR class ("SDR", "HDR10", "DOVI", …) — lets the table flag HDR. */
  videoRange?: string;
}

export interface Episode {
  id: string;
  seriesId: string;
  seriesName: string;
  seasonNumber: number;
  episodeNumber: number;
  name: string;
  overview: string;
  path: string;
  runTimeTicks?: number;
  /** This user's resume position — see Title.resumePositionTicks for the same
   *  "present -> resume there" rule. */
  resumePositionTicks?: number;
  thumbUrl?: string;
  seasonId?: string;
  /** Primary (poster, 2:3) image of the Season item this episode belongs to. */
  seasonPrimaryUrl?: string;
}

export interface Library {
  id: string;
  name: string;
  movies: Title[];
  genres: string[];
  /**
   * Synthesized by games-only.ts: this "library" is one Romm platform, not a
   * media-server one. Its titles carry no wall categories, so the shelf
   * planner keeps it un-sectioned and every signboard reads the platform name
   * (see StorePlan.buildLibraryLayouts).
   */
  games?: boolean;
}

/** Back-compat aliases — see the naming note at the top of this file. */
export type Movie = Title;
export type MovieVersion = TitleVersion;
export type JellyfinLibrary = Library;

/**
 * What a backend can actually do. Every flag is `true`, `false`, or probed at
 * connect time — never guessed optimistic. A flag set to `true` that the
 * server can't do fails loudly in the UI, which is worse than the feature
 * simply not appearing.
 */
export interface ProviderCapabilities {
  /** Selectable account list with no per-account password challenge
   *  (Jellyfin/Emby "public users"; Plex home users under one linked plex.tv
   *  account, fetched a completely different way). Gates the fanned
   *  membership-card picker — with this false, that picker has nothing to
   *  render and the UI must fall through to another flow. */
  multiUserPicker: boolean;
  /** Direct username+password POST to the media server itself, vs. an
   *  account-linking redirect through a third-party identity service (Plex:
   *  plex.tv PIN/OAuth). This is a different UI flow, not just a different
   *  request shape. */
  directServerLogin: boolean;
  /** Native collection membership introspectable without a companion metadata
   *  service (Jellyfin BoxSet; Plex collection). Gates the collection endcap. */
  collections: boolean;
  /** Rule-based, self-populating collections (Plex smart collections). No
   *  Jellyfin/Emby equivalent — mapping is an open owner ruling. */
  smartCollections: boolean;
  /** Item can carry 2+ playable sources the SERVER already recognizes as
   *  "same title, different quality/cut". Gates the version picker. */
  multiVersion: boolean;
  /** Curator-entered edition/cut label (Plex editionTitle) vs. a label this
   *  app infers from filename/resolution (today's Jellyfin behavior). */
  namedEditions: boolean;
  /** Server-side intro/credits/commercial skip markers (Plex native;
   *  Jellyfin only via the unofficial Intro Skipper plugin — false unless
   *  probed per-server). */
  skipMarkers: boolean;
  /** Scrubbing preview thumbnails in ANY wire format (BIF, trickplay tiles) —
   *  an adapter normalizes format; this only says one exists. Nothing in the
   *  store consumes these yet. */
  scrubPreviews: boolean;
  /** Server-side transcode/remux, for the fallback when direct play is
   *  unsafe. A backend without this is direct-play-only. */
  transcoding: boolean;
  /** Per-user watch state (played / play count / last played). The staff-picks
   *  engine's anchors come from here, so a backend with this false builds no
   *  staff-pick stickers and no genre endcaps. */
  watchState: boolean;
  /** Server reports a resume position, so playback can start where the user
   *  left off rather than at 0:00. */
  resumePosition: boolean;
}

export interface ProviderCredentials {
  username?: string;
  password?: string;
  /** Plex-style: an already-obtained account token, not a password. */
  accountToken?: string;
}

export interface ProviderSession {
  accessToken: string;
  userId: string;
  userName: string;
  /** Provider-specific extras neither renamed nor interpreted by core code
   *  (e.g. Plex's machineIdentifier) — an escape hatch, not a dumping ground. */
  raw?: Record<string, unknown>;
}

/** One selectable account on the login screen — a membership card's face. */
export interface AccountSummary {
  id: string;
  name: string;
  hasPassword: boolean;
  avatarUrl?: string | null;
}

export interface ArtworkRef {
  itemId: string;
  kind: 'poster' | 'backdrop' | 'person' | 'avatar';
  /** Server-side image version tag, when the backend uses one for cache-
   *  busting. Note the store's own texture caches key on item id, never on the
   *  built URL, so a tag change does not invalidate cached art. */
  tag?: string;
  maxWidth?: number;
}

export interface PlaybackRequestOptions {
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
  maxBitrate?: number;
  maxWidth?: number;
  startPositionTicks?: number;
  mediaSourceId?: string;
}

export interface PlaybackSource {
  /** `direct` = the server hands back the file untouched (or a path the local
   *  player opens itself); `transcode` = a server-side re-encode/remux. */
  kind: 'direct' | 'transcode';
  url: string;
  /** Set on a transcode so the session can be torn down when playback ends —
   *  an abandoned encode pins server CPU until it times out. */
  sessionId?: string;
  container?: string;
  videoCodec?: string;
  audioCodecs?: string[];
}

/** Progress ping — the shape every backend's scrobble/timeline call takes. */
export interface PlaybackProgress {
  positionTicks: number;
  isPaused: boolean;
}

/**
 * One media-server backend. The store never names a server product: it holds a
 * provider, a server address and a session, and asks for Titles and Libraries.
 *
 * Optional methods are gated by the matching capability flag — a caller must
 * check the flag rather than probing for the method, so that "server can't do
 * this" and "adapter hasn't implemented it yet" stay distinguishable.
 */
export interface MediaSourceProvider {
  readonly id: string;            // 'jellyfin' | 'emby' | 'plex' | 'demo'
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;

  /** Accept what a person would actually type ("192.168.1.9:8096") and return
   *  something fetchable. */
  normalizeServerAddress(input: string): string;
  authenticate(server: string, creds: ProviderCredentials): Promise<ProviderSession>;
  /** True = session still good, false = stale credentials. Must THROW on a
   *  transient network failure rather than returning false: the caller tears
   *  down the session on false, and a blip is not a logout. */
  validateSession(server: string, session: ProviderSession): Promise<boolean>;
  /** capability: multiUserPicker */
  listSelectableAccounts?(server: string): Promise<AccountSummary[]>;

  fetchLibraries(
    server: string,
    session: ProviderSession,
    onProgress?: (stage: string) => void,
    /** Library ids this store does NOT carry (#41): skipped at sync, not
     *  fetched-and-hidden — a backend must not pay for shelves nobody sees. */
    opts?: { excludeLibraryIds?: ReadonlySet<string> }
  ): Promise<Library[]>;
  fetchSeriesEpisodes(server: string, session: ProviderSession, seriesId: string): Promise<Episode[]>;
  fetchFirstEpisodeOfSeries(
    server: string,
    session: ProviderSession,
    seriesId: string
  ): Promise<{ id: string; path: string } | null>;

  buildArtworkUrl(server: string, session: ProviderSession, ref: ArtworkRef): string | null;

  resolvePlaybackSource(
    server: string,
    session: ProviderSession,
    itemId: string,
    opts?: PlaybackRequestOptions
  ): Promise<PlaybackSource>;
  isDirectPlaySafe(info: MediaPlaybackInfo | undefined | null): boolean;

  reportPlaybackStart(server: string, session: ProviderSession, itemId: string): Promise<void>;
  reportPlaybackProgress(
    server: string,
    session: ProviderSession,
    itemId: string,
    progress: PlaybackProgress
  ): Promise<void>;
  reportPlaybackStopped(
    server: string,
    session: ProviderSession,
    itemId: string,
    positionTicks: number
  ): Promise<void>;
  /** capability: transcoding — tear down an abandoned server-side encode. */
  cancelActiveTranscode?(sessionId: string, log?: (msg: string) => void): Promise<void>;
}
