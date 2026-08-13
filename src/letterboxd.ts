// Letterboxd watch history — the films you logged somewhere that isn't your
// own server (a cinema, a streaming service, the years before the Jellyfin box
// existed).
//
// Why it's worth having: the staff-picks engine (staff-picks.ts) ranks
// recommendations by how many of your WATCHED films voted for them, and its
// join key is already the TMDB id, chosen because it is provider-neutral. A
// Letterboxd feed emits <tmdb:movieId> per entry, so the two line up with no
// translation layer — the same engine, told about a much larger slice of what
// you actually watch.
//
// Owner ruling 2026-08-13: this affects RECOMMENDATIONS SILENTLY. It does not
// put a case on a shelf. Films logged here that you don't own must not appear
// in the store as REQUEST cases, and the watchlist is not imported at all —
// what it buys is better staff picks among the stock you already have.
//
// Imports nothing, so it runs under `node --test` type-stripping
// (tests/letterboxd.test.ts) — same rule as seerr-config.ts and staff-picks.ts.
// Fetching a feed is a separate concern: it needs the CORS dev-proxy or the
// Tauri HTTP bridge the way jellyseerr.ts and romm.ts do, and lives with them,
// not here.

/** One logged viewing. Shaped by what the feed actually carries — verified
 *  against a real feed on 2026-08-13, not from the docs. */
export interface LetterboxdWatch {
  /** The join key into everything else. Entries without one are unusable and
   *  are dropped rather than guessed at from title+year. */
  tmdbId: number;
  title: string;
  year?: number;
  /** ISO YYYY-MM-DD, from <letterboxd:watchedDate> — the date you say you saw
   *  it, which is NOT pubDate (when you logged it). Orders anchors by recency. */
  watchedDate?: string;
  /** Letterboxd's own 0.5-5.0 scale, in half-star steps. ABSENT on plenty of
   *  entries: logging a film and rating it are separate acts, and 16 of 50 in
   *  the sample feed carried no rating. Never default it to a middle value —
   *  "unrated" and "average" are different claims. */
  rating?: number;
  /** <letterboxd:memberLike> — the heart, independent of the star rating. */
  liked: boolean;
  rewatch: boolean;
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

/** Feed text is XML-escaped and film titles genuinely contain & and ' — see
 *  "Joel &amp; Ethan Coen" — so decoding is required, not cosmetic. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTITIES[name] ?? m);
}

function tagText(item: string, tag: string): string | undefined {
  // Namespaced tags carry a ':' — escape it for the class, not for the regex.
  const m = item.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!m) return undefined;
  const raw = m[1].replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1').trim();
  return raw ? decodeEntities(raw) : undefined;
}

/**
 * Parse a Letterboxd RSS feed (`letterboxd.com/<user>/rss/`) into watches.
 *
 * The feed is NOT a list of films. Roughly half of a typical one is the
 * member's LISTS ("Ranked: Wes Anderson", "Oscars 2027 watchlist") — same
 * <item> shape, no film fields — and treating every item as a viewing invents
 * dozens of anchors out of list titles, which would quietly poison every
 * recommendation downstream. So an item qualifies only by carrying both a film
 * title and a TMDB id; that also keeps review entries, which are viewings too.
 *
 * Public, no API key, no auth. (Letterboxd's real API has been invite-only for
 * years — request access at api@letterboxd.com — so this feed and the CSV
 * export are the only paths that don't need a partnership.)
 *
 * Feed limit: recent activity only, ~50 entries. It is the trickle, not the
 * backlog; the account's CSV export is the backlog and parses separately.
 */
export function parseLetterboxdRss(xml: string): LetterboxdWatch[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const out: LetterboxdWatch[] = [];
  for (const item of items) {
    const title = tagText(item, 'letterboxd:filmTitle');
    const tmdbRaw = tagText(item, 'tmdb:movieId');
    if (!title || !tmdbRaw) continue; // a list, or a TV entry with no movieId
    const tmdbId = Number(tmdbRaw);
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) continue;

    const yearRaw = tagText(item, 'letterboxd:filmYear');
    const year = yearRaw ? Number(yearRaw) : undefined;
    const ratingRaw = tagText(item, 'letterboxd:memberRating');
    const rating = ratingRaw !== undefined ? Number(ratingRaw) : undefined;

    out.push({
      tmdbId,
      title,
      year: Number.isFinite(year) && year ? year : undefined,
      watchedDate: tagText(item, 'letterboxd:watchedDate'),
      rating: rating !== undefined && Number.isFinite(rating) ? rating : undefined,
      liked: tagText(item, 'letterboxd:memberLike') === 'Yes',
      rewatch: tagText(item, 'letterboxd:rewatch') === 'Yes',
    });
  }
  return dedupeByTmdbId(out);
}

/**
 * One entry per film, keeping the most recent viewing and counting the rest.
 *
 * A rewatched film appears once per viewing in the feed. Left alone it would
 * weigh N times as heavily as anything seen once — the engine ranks by how
 * many DISTINCT films voted for a recommendation, so duplicates are a thumb on
 * the scale rather than a stronger signal.
 */
function dedupeByTmdbId(watches: LetterboxdWatch[]): LetterboxdWatch[] {
  const byId = new Map<number, LetterboxdWatch>();
  for (const w of watches) {
    const prev = byId.get(w.tmdbId);
    if (!prev) { byId.set(w.tmdbId, w); continue; }
    const newer = (w.watchedDate ?? '') > (prev.watchedDate ?? '');
    // Keep the newer viewing's date, but never lose a rating to an unrated
    // rewatch — you rated the film, not the screening.
    byId.set(w.tmdbId, {
      ...(newer ? w : prev),
      rating: (newer ? w.rating : prev.rating) ?? prev.rating ?? w.rating,
      liked: prev.liked || w.liked,
      rewatch: true,
    });
  }
  return [...byId.values()];
}

/**
 * The subset worth handing the recommendation engine, best first.
 *
 * Ranked by how strong a taste signal each viewing is, not just by recency: a
 * film you rated 4.5 and liked says more about what to shelve than one you
 * logged without comment. Unrated entries are NOT treated as bad — they sort
 * below rated ones but stay eligible, since most people rate only some of what
 * they watch (16 of 50 in the sample feed).
 *
 * `cap` matches staff-picks.ts's own MAX_ANCHORS thinking: each anchor costs a
 * TMDB recommendations round-trip, so this is a budget, not a preference.
 */
export function pickLetterboxdAnchors(
  watches: LetterboxdWatch[],
  cap = 40
): LetterboxdWatch[] {
  const score = (w: LetterboxdWatch): number => {
    // Unrated sits at the midpoint rather than the bottom: absence of a rating
    // is absence of evidence.
    const stars = w.rating ?? 3;
    return stars + (w.liked ? 1 : 0);
  };
  return [...watches]
    .sort((a, b) => {
      const s = score(b) - score(a);
      if (s !== 0) return s;
      const da = a.watchedDate ?? '';
      const db = b.watchedDate ?? '';
      if (db !== da) return db > da ? 1 : -1;
      return a.title.localeCompare(b.title);
    })
    .slice(0, cap);
}
