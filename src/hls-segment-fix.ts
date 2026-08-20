// A workaround for a REAL JELLYFIN SERVER BUG, shared by every hls.js pipeline
// in the app.
//
// Jellyfin rejects any SEGMENT request whose query carries StartTimeTicks
// ("StartTimeTicks is not allowed", ArgumentException in
// DynamicHlsController.GetDynamicSegment). When a stream is built at a
// resume/seek position, the media playlist's segment URIs (and the fMP4
// EXT-X-MAP init URI) inherit the playlist request's query verbatim — so every
// fetch hls.js makes gets rejected and playback dies in a silent retry loop
// ("buffering forever"). StartTimeTicks is a playlist-level parameter (it tells
// the server where to start the transcode job); segments are addressed purely
// by index, so dropping it from segment fetches is always safe. Playlist
// (.m3u8) requests keep it.
//
// This lives in its own module because it is a property of the SERVER, not of
// any one player: the full-screen VideoPlayer resumes films at a saved position
// and the ceiling TVs (ambient-tvs.ts) drop in at a random offset, and both
// build their stream through the provider's `startPositionTicks`. The ambient
// TVs shipped without it for one evening and every Jellyfin movie stream 400'd
// on its first segment (#67) — a second copy of a server-bug workaround is how
// the second one rots, so there is exactly one.
//
// Harmless on any other backend: it only touches a URL that both matches
// Jellyfin's own segment route and actually carries the parameter.

// Matches /hls1/<name>/<segmentIndex>.<container> — including the fMP4 init
// segment, which Jellyfin addresses as index -1.
const HLS_SEGMENT_PATH = /\/hls1\/[^/]+\/-?\d+\.[a-z0-9]+$/i;

let segmentFixLoader: unknown = null;

/**
 * The hls.js `loader` config value: the default loader, subclassed to strip
 * StartTimeTicks off segment requests. Built once and memoized — hls.js only
 * ever reads the class off the config, so every pipeline can share it.
 */
export function getSegmentFixLoader(HlsClass: typeof import('hls.js').default): unknown {
  if (segmentFixLoader) return segmentFixLoader;
  const Base = HlsClass.DefaultConfig.loader as new (...args: any[]) => any;
  segmentFixLoader = class extends Base {
    load(context: any, config: any, callbacks: any) {
      if (typeof context?.url === 'string') {
        try {
          const u = new URL(context.url);
          if (HLS_SEGMENT_PATH.test(u.pathname) && u.searchParams.has('StartTimeTicks')) {
            u.searchParams.delete('StartTimeTicks');
            context.url = u.toString();
          }
        } catch {
          // Not an absolute URL — leave it untouched.
        }
      }
      super.load(context, config, callbacks);
    }
  };
  return segmentFixLoader;
}
