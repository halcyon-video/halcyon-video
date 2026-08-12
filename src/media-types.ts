// The store's DOMAIN MODEL — what a rental case knows about itself, with no
// media server in it.
//
// These types used to live in jellyfin.ts, which made every one of the ~60
// modules that only wanted `Movie` import the Jellyfin client (and, through
// it, @tauri-apps/api) to get it. They moved here when the media layer was
// split behind MediaBackend (see media-backend.ts) so a second server —
// plex.ts — could fill the same shapes without either backend importing the
// other. jellyfin.ts re-exports every name below, so the old
// `import { Movie } from './jellyfin'` spellings keep working.
//
// Two Jellyfin-isms deliberately survive the move, because they are the
// store's internal units and rewriting 60 modules to change them would buy
// nothing: durations/positions are in TICKS (1 tick = 100 ns, so ms * 10_000
// — plex.ts converts on the way in), and per-title stream/version handles are
// opaque STRINGS whose meaning belongs to whichever backend minted them.

export interface Movie {
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
  // Synthesized (see jellyseerr.ts) for a title that's been requested on
  // Jellyseerr but hasn't finished downloading yet: it gets a display case
  // with poster art on the New Releases wall but no rental backstock, and
  // selecting it should show "Coming Soon" rather than allow playback.
  comingSoon?: boolean;
  // TMDB id (see jellyseerr.ts's fetchDiscoverMovies) -- required to call
  // requestMovie() for a discovery title.
  tmdbId?: number;
  // Synthesized (see jellyseerr.ts's fetchDiscoverMovies) for a Jellyseerr
  // trending/popular suggestion that is NOT in the library: it gets an empty
  // display case shelved inline with the regular stock (REQUEST corner
  // sticker, no rental backstock), and selecting it lets the user REQUEST it
  // through Jellyseerr instead of play it.
  discovery?: boolean;
  // True when a `discovery` or `collectionGap` title has already been
  // requested (through this app this session, or because Jellyseerr's own
  // records say so -- see StoreScene's merge of comingSoon into
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
  // fallbacks. Typed loosely here so this module stays free of a romm.ts
  // import.
  gameArt?: { back?: string; spine?: string; label?: string };
  // Discs in this title's retail case (romm.ts discCountFrom: distinct
  // "(Disc N)" tags across the rom + its siblings). Only set when >= 2 —
  // it thickens a jewel-case platform's box to the multi-disc fat case.
  discCount?: number;
  // Audio/subtitle streams of the primary media source — drives the in-app
  // player's track picker. Absent for series containers, games, and discovery
  // titles.
  //
  // Jellyfin ships these with the catalog (Fields=MediaSources); Plex does
  // NOT return them from a section listing, so plex.ts fills them from a
  // second, comma-batched /library/metadata pass over the same items.
  mediaStreams?: MediaStreamInfo[];
  // Container + video/audio codecs of the primary media source — lets
  // launchVideoPlayback decide direct-play vs. HLS transcode BEFORE opening
  // the player (see isDirectPlaySafe). Absent for series containers, games,
  // and discovery titles; series episodes are probed on demand instead (see
  // MediaBackend.fetchItemPlaybackInfo) since the episode list never fetches
  // media sources.
  mediaPlaybackInfo?: MediaPlaybackInfo;
  // Width/height ratio of the poster image. Lets flat mode size a case to the
  // art before the lazy poster loads (issue #108) instead of reflowing the row
  // on every image load. Absent for games, discovery titles, and servers that
  // haven't probed the image yet (Plex reports no such ratio — its posters are
  // uniformly 2:3, which is flat mode's own default).
  primaryImageAspectRatio?: number;
  // Alternate quality versions of the same film. Built two ways: an item whose
  // versions were merged server-side carries several sources (one version
  // each — Jellyfin MediaSources, Plex Media[]), and duplicate items of the
  // same film (a 4K rip and a 1080p rip ingested separately) are collapsed to
  // ONE shelf box by collapseDuplicateVersions(). Present ONLY when there are
  // 2+ choices, ordered best-quality-first; pressing Play on such a title
  // opens the version picker (main.ts) instead of streaming blind.
  versions?: MovieVersion[];
  // Name of the collection this movie belongs to, e.g. "Harry Potter
  // Collection". Members of one collection file together on the shelf in
  // premiere order (see shelfTitleCompare in store-layout).
  //
  // Jellyfin list queries don't carry membership on the item, so jellyfin.ts
  // tags this in a separate pass after library sync; Plex returns a
  // `Collection` tag on the item itself and needs no such pass.
  collectionName?: string;
  // ISO premiere date — breaks the chronological tie between same-collection
  // titles released the same year (a production year alone can't order them).
  premiereDate?: string;
  // Synthesized (see jellyseerr.ts's fetchCollectionGaps) for an entry of a
  // collection the user PARTLY owns — you have 5 of the 8 Harry Potters, so
  // the other 3 stand in their correct chronological shelf position wearing a
  // corner sticker, with no rental backstock behind them. Selecting one
  // requests it through Jellyseerr rather than playing it.
  //
  // No media server can source these on its own: its collection is built from
  // the files you have, so it has no idea the collection is incomplete. The
  // full member list comes from TMDB via Jellyseerr, keyed on the collection's
  // TMDB id.
  collectionGap?: boolean;
  // Per-user watch state. Both backends query as a specific user (Jellyfin's
  // /Users/{id}/Items; a Plex Home user's own token), so this is THIS user's
  // history. Watched titles are the anchors the staff-picks engine aggregates
  // TMDB "people who liked this also liked" results over (see staff-picks.ts).
  played?: boolean;
  playCount?: number;
  lastPlayedDate?: string; // ISO — orders anchors by recency
  // Ticks into the item the server says THIS user left off at. Servers only
  // report a non-zero resume position while the item is still inside their own
  // resume window (fully watched or never started both come back unset) — so
  // "present -> resume there" is the same rule every other client of either
  // server follows, with no separate "start over" affordance needed.
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
  // server has a portrait (many crew/cast entries don't). Undefined on
  // synthesized titles (discovery/collectionGap/game) and the synthetic
  // demo/harness catalog, which has no person image data at all.
  castPeople?: { id: string; name: string; imageUrl?: string }[];
}

export interface MediaStreamInfo {
  /** Backend stream handle — pass back as the audio/subtitle selection.
   *  Jellyfin: the MediaStream index. Plex: the Stream `id` (NOT its ffmpeg
   *  `index`, which is what /library/parts wants selections keyed on). */
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

/** One playable quality/edition of a film — see Movie.versions. */
export interface MovieVersion {
  /** Item to stream (and report playback against). */
  itemId: string;
  /** Set when this version is one source of a server-side-merged item, so the
   *  server streams THAT file and not the default. Jellyfin: MediaSourceId.
   *  Plex: the index into Media[], passed as mediaIndex. */
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

/** Container + video/audio codecs needed by isDirectPlaySafe. All strings are
 *  lower-cased so callers can compare against fixed allowlists. */
export interface MediaPlaybackInfo {
  container?: string;
  videoCodec?: string;
  audioCodecs: string[];
  /** Video frame dimensions of the default source — feed the tech-specs
   *  table's resolution + aspect-ratio derivation. */
  width?: number;
  height?: number;
  /** Display aspect ratio string (e.g. "16:9", "2.40:1"), when the server
   *  reports one. */
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
  /** This user's server-side resume position — see Movie.resumePositionTicks
   *  for the same "present -> resume there" rule. */
  resumePositionTicks?: number;
  thumbUrl?: string;
  seasonId?: string;
  /** Primary (poster, 2:3) image of the Season item this episode belongs to. */
  seasonPrimaryUrl?: string;
}

/** One library ("view" / "section") of the server, with its stock. */
export interface MediaLibrary {
  id: string;
  name: string;
  movies: Movie[];
  genres: string[];
  /**
   * Synthesized by games-only.ts: this "library" is one Romm platform, not a
   * media-server one. Its titles carry no wall categories, so the shelf
   * planner keeps it un-sectioned and every signboard reads the platform name
   * (see StorePlan.buildLibraryLayouts).
   */
  games?: boolean;
}

/** Historical spelling of MediaLibrary, kept so the ~15 modules that import it
 *  under the old name compile unchanged. Prefer MediaLibrary in new code. */
export type JellyfinLibrary = MediaLibrary;

/** Name-only library row for the setup terminal's carried-libraries screen. */
export interface LibrarySummary {
  id: string;
  name: string;
}

/** A user the sign-in screen can fan out as a membership card. */
export interface PublicUser {
  id: string;
  name: string;
  hasPassword: boolean;
  primaryImageTag?: string;
  /** Ready-to-use avatar URL, when the backend hands one over directly rather
   *  than making the caller build it from an image tag (Plex Home users carry
   *  an absolute plex.tv avatar; Jellyfin leaves this unset and the caller
   *  goes through MediaBackend.buildUserAvatarUrl). */
  avatarUrl?: string;
  /** Opaque per-user handle the backend needs to complete a card sign-in
   *  (Plex: the Home user's uuid, for the token switch). Unused by Jellyfin. */
  switchId?: string;
}

/** Track/quality overrides for MediaBackend.buildHlsStreamUrl (the player's
 *  track picker). Backend-neutral: every field is expressed in the store's own
 *  units, and each backend translates on the way out. */
export interface HlsStreamOptions {
  /** MediaStreamInfo.index of the audio track to transcode. */
  audioStreamIndex?: number;
  /** MediaStreamInfo.index of the subtitle track to BURN IN. Burn-in is the
   *  one delivery method guaranteed to render on a transcode path (pixels are
   *  baked in, container-agnostic) and it forces the server to re-encode video
   *  even where it could otherwise stream-copy. */
  subtitleStreamIndex?: number;
  /** Video bitrate ceiling in bits/s. */
  maxBitrate?: number;
  /** Optional resolution ceiling to pair with a lower bitrate. */
  maxWidth?: number;
  /** Absolute item position (ticks) to start the transcode at, so a seek
   *  lands on an already-offset stream instead of encoding from 0:00 and
   *  jumping client-side (which is what makes seeking a transcode slow). */
  startPositionTicks?: number;
  /** Lower-cased source video codec (MediaPlaybackInfo.videoCodec). HEVC
   *  pass-through + fMP4 segments are only requested when the source is
   *  actually HEVC — everything else stays on the battle-tested TS path. */
  sourceVideoCodec?: string;
  /** Specific source of a merged multi-version item to stream
   *  (MovieVersion.mediaSourceId). Defaults to the item's own default
   *  source. */
  mediaSourceId?: string;
}

/** An authenticated session against whichever server the store is pointed at. */
export interface MediaSession {
  accessToken: string;
  userId: string;
  userName: string;
}
