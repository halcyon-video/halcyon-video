// Backwards-compatible Jellyfin exports. Protocol selection is explicit in the provider.
import { createMediaBrowserClient } from "./media-browser-client.ts";
export type {
  Movie, MediaStreamInfo, MovieVersion, MediaPlaybackInfo, Episode,
  JellyfinLibrary, Title, TitleVersion, Library, LibrarySummary,
} from './providers/media-source-provider.ts';
export type { PublicUser, SubtitleDelivery, HlsStreamOptions } from "./media-browser-client.ts";
export { isDirectPlaySafe, isHevcPassThroughEnabled } from './playback-capability.ts';
export const jellyfinClient = createMediaBrowserClient("jellyfin");
export const {
  validateToken,
  normalizeUrl,
  authenticateUser,
  fetchPublicUsers,
  buildItemImageUrl,
  buildUserAvatarUrl,
  buildItemVersions,
  collapseDuplicateVersions,
  fetchMediaCatalog,
  collectionArt,
  collectionTmdbIds,
  collectionSyncStats,
  rememberKnownLibraries,
  knownServerLibraries,
  fetchLibraryList,
  fetchJellyfinLibrariesAndMovies,
  fetchFirstEpisodeOfSeries,
  fetchSeriesEpisodes,
  reportPlaybackStart,
  reportPlaybackStopped,
  reportPlaybackProgress,
  stopActiveEncoding,
  fetchItemPlaybackInfo,
  buildStaticStreamUrl,
  isTextSubtitleCodec,
  pickSubtitleDelivery,
  buildSubtitleTrackUrl,
  getLastHlsPlaySessionId,
  buildHlsStreamUrl,
  isStreamCopyUrl,
  fetchUserConfigPrefs,
  saveUserConfigPrefs
} = jellyfinClient;
