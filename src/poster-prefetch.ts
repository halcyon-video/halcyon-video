// Cover-art byte prefetch: start the poster downloads BEFORE the store build.
//
// buildAllMovieBoxes() (store-stock.ts) only queues a cover for decode at the
// END of the StoreScene constructor, and that constructor is one uninterrupted
// stretch of main thread — 2.5s on a warm shader cache, 7s+ cold, measured on
// the hosted demo. Requests issued with fetch() BEFORE that stretch keep
// streaming in the background while it runs, so those are exactly the seconds
// the boot's texture wait was later spending on the network for nothing. This
// module issues the fetches up front and hands the bytes to fetchPosterBytes()
// (video-case.ts) when the decode queue reaches each title.
//
// An in-memory handoff on purpose, not a reliance on the HTTP cache: the hosts
// this runs against disagree about caching (vite preview answers
// `Cache-Control: no-cache`, GitHub Pages max-age=600, Jellyfin no store), and
// the demo's 2,000 titles share 42 poster files — before this, every title
// paid its own request (a revalidation round trip at best) for a file already
// in hand. Keyed by URL, so shared art is fetched once per boot.
//
// Bounded three ways so a LAN Jellyfin can't fill memory faster than the decode
// queue drains it: a URL cap, a byte budget, and a small concurrency. Anything
// past the caps just takes the normal on-demand path. Every take hands out a
// COPY (the decode worker detaches what it is given, and other titles may wear
// the same file), and clearPosterPrefetch() drops everything once the boot's
// texture wait resolves, so nothing outlives the boot it was fetched for.

const MAX_URLS = 640;
const BYTE_BUDGET = 48 * 1024 * 1024;
const CONCURRENCY = 8;

const pending = new Map<string, Promise<ArrayBuffer | null>>();
let bytesFetched = 0;
let budgetExhausted = false;
// Pumps still running, and who is waiting for the network to be theirs.
let activePumps = 0;
let idleWaiters: Array<() => void> = [];
// Posters the decode queue already took, kept until clearPosterPrefetch():
// titles that SHARE a poster file (the demo's 2,000 titles wear 42) each need
// a copy, and the worker handoff transfers (detaches) the buffer it is given.
const taken = new Map<string, ArrayBuffer>();

/** URLs that never need (or can't take) a plain prefetch. */
function prefetchable(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('data:') || url.startsWith('blob:')) return false; // local bytes already
  if (url.startsWith('/dev-proxy?')) return false; // header-addressed integration art (the worker's job)
  return true;
}

/**
 * Queue up to MAX_URLS unique poster URLs for background download. `urls` is
 * in shelf order (the caller's stocking order), so what lands first is what
 * the first aisles need. `resolveUrl` applies the same host rewrite the real
 * loader uses (video-case.ts rewriteLocalhost) — the map is keyed by the
 * ORIGINAL url, which is what fetchPosterBytes will ask for.
 */
export function prefetchPosterBytes(urls: Iterable<string>, resolveUrl: (url: string) => string): number {
  const queue: string[] = [];
  for (const url of urls) {
    if (queue.length >= MAX_URLS) break;
    if (!prefetchable(url) || pending.has(url) || taken.has(url)) continue;
    pending.set(url, Promise.resolve(null)); // placeholder so duplicates in `urls` dedupe
    queue.push(url);
  }
  if (queue.length === 0) return 0;

  // One pump set per host: a browser holds only six HTTP/1.1 connections to
  // a host, so a slow local queue must not park the slots a second host
  // (a CDN) could be using in parallel.
  const byHost = new Map<string, string[]>();
  for (const url of queue) {
    let host = '';
    try { host = new URL(resolveUrl(url), location.href).host; } catch { /* relative or odd: one bucket */ }
    const list = byHost.get(host) ?? [];
    list.push(url);
    byHost.set(host, list);
  }
  const start = (list: string[]) => {
    let next = 0;
    const pump = async (): Promise<void> => {
      activePumps++;
      try { await drain(); } finally { pumpDone(); }
    };
    const drain = async (): Promise<void> => {
      while (next < list.length) {
        const url = list[next++];
        if (budgetExhausted) { pending.delete(url); continue; }
        let resolveIt: (b: ArrayBuffer | null) => void = () => {};
        pending.set(url, new Promise<ArrayBuffer | null>((res) => { resolveIt = res; }));
        let bytes: ArrayBuffer | null = null;
        try {
          // 'high': these gate the reveal, unlike the environment textures the
          // store build starts alongside them.
          const res = await fetch(resolveUrl(url), { priority: 'high' } as RequestInit);
          if (res.ok) {
            bytes = await res.arrayBuffer();
            bytesFetched += bytes.byteLength;
            if (bytesFetched >= BYTE_BUDGET) budgetExhausted = true;
          }
        } catch {
          bytes = null; // the on-demand path retries with its own error handling
        }
        // A failed prefetch must not pin a null on the title: drop the entry so
        // fetchPosterBytes falls through to its normal fetch.
        if (bytes) resolveIt(bytes); else { pending.delete(url); resolveIt(null); }
      }
    };
    for (let i = 0; i < Math.min(CONCURRENCY, list.length); i++) void pump();
  };
  for (const list of byHost.values()) start(list);
  return queue.length;
}

function pumpDone(): void {
  activePumps--;
  if (activePumps <= 0) {
    activePumps = 0;
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const w of waiters) w();
  }
}

/**
 * Resolves once no cover prefetch is in flight (immediately when none ever
 * started). The heavy environment textures wait on this before they start:
 * on a home connection they and the covers were splitting one pipe at equal
 * priority, and only the covers gate the reveal.
 */
export function whenCoverPrefetchIdle(): Promise<void> {
  if (activePumps === 0) return Promise.resolve();
  return new Promise<void>((res) => { idleWaiters.push(res); });
}

// ─── Shared-decode cache ─────────────────────────────────────────────────────
// A catalog whose titles SHARE poster files (the demo: 2,300 titles, 42 files)
// was paying a full JPEG decode per title in the worker pool — the same 42
// images, ~2,300 times, most of the decode phase. When prefetchCoverBytes
// sees that ratio it turns this on, and WorkerPool.decode (video-case.ts)
// serves repeats from here as copies. Off for ordinary libraries (every URL
// unique — a cache would only cost memory), bounded, and cleared with the
// prefetch once the boot's texture wait resolves.
export interface SharedDecode {
  highResData: Uint8Array;
  lowResData: Uint8Array;
  leftmostColor: string;
  edgeBusy: boolean;
  bandEnergy: number;
}
const SHARED_DECODE_BUDGET = 32 * 1024 * 1024;
let sharedDecodeOn = false;
let sharedDecodeBytes = 0;
const sharedDecodes = new Map<string, SharedDecode>();

export function setSharedDecodeEnabled(on: boolean): void {
  sharedDecodeOn = on;
  if (!on) { sharedDecodes.clear(); sharedDecodeBytes = 0; }
}

export function sharedDecodeEnabled(): boolean {
  return sharedDecodeOn;
}

/** A copy of a cached decode (the caller stamps badges into what it gets). */
export function sharedDecodeGet(key: string): SharedDecode | null {
  if (!sharedDecodeOn) return null;
  const hit = sharedDecodes.get(key);
  if (!hit) return null;
  return { ...hit, highResData: hit.highResData.slice(), lowResData: hit.lowResData.slice() };
}

/** Remember a fresh decode (stored as its own copy; first-come, up to the budget). */
export function sharedDecodePut(key: string, value: SharedDecode): void {
  if (!sharedDecodeOn || sharedDecodes.has(key)) return;
  const size = value.highResData.byteLength + value.lowResData.byteLength;
  if (sharedDecodeBytes + size > SHARED_DECODE_BUDGET) return;
  sharedDecodeBytes += size;
  sharedDecodes.set(key, { ...value, highResData: value.highResData.slice(), lowResData: value.lowResData.slice() });
}

/**
 * Hand a prefetched (or in-flight) download to its consumer. Returns undefined
 * when this URL was never prefetched (or the prefetch failed); the caller then
 * fetches normally. Every take gets its OWN copy: the caller transfers the
 * buffer to a decode worker, and other titles may wear the same file.
 */
export function takePrefetchedPosterBytes(url: string): Promise<ArrayBuffer | null> | undefined {
  const done = taken.get(url);
  if (done) return Promise.resolve(done.slice(0));
  const p = pending.get(url);
  if (!p) return undefined;
  return p.then((bytes) => {
    if (!bytes) return null;
    // First consumer: park the original for the next title, hand out a copy.
    if (pending.get(url) === p) { pending.delete(url); taken.set(url, bytes); }
    return bytes.slice(0);
  });
}

/** Forget every prefetched download (call once the boot's texture wait resolves). */
export function clearPosterPrefetch(): void {
  pending.clear();
  taken.clear();
  bytesFetched = 0;
  budgetExhausted = false;
  setSharedDecodeEnabled(false);
}

/** Diagnostics: how many downloads are parked here (in flight or held). */
export function prefetchedPosterCount(): number {
  return pending.size + taken.size;
}
