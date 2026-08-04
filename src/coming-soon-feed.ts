// COMING SOON feed — the one answer to "what is actually coming to this store,
// and when?", shaped for a changeable-letter board's two columns.
//
// This is a DATA module, not a sign module: it never draws anything. The
// counter letterboard (fixtures/coming-soon-letterboard.ts) is its first
// consumer and the 2009 felt menuboard is meant to be its second, so the shape
// it returns is deliberately board-agnostic — an ordered list of
// `{ title, date }` facts plus a formatter that turns them into the
// `{ date, title }` rows every board in this family is parameterised on
// (letterboard NOTES.md §6: "`rows` is the live surface … fed by the media
// server").
//
// ── Where the truth comes from ─────────────────────────────────────────────
// The store ALREADY models "coming soon" and this reuses that model rather
// than inventing a second one. A case wears the gold COMING SOON corner label
// (video-case.ts stampCollectionGapSticker) exactly when it is a not-in-store
// title — a Jellyseerr collection gap, an inline discovery suggestion, or a
// pending Jellyseerr request — that has been ORDERED, i.e. either the
// in-memory Movie carries `discoveryRequested` or its tmdbId is in the
// persisted `jellyseerr_requested_ids` set. That predicate is tier (a) here,
// so the board and the shelf can never disagree about what is on order.
//
// Tier (b) is anything the catalog itself dates into the future: a Movie whose
// `premiereDate` has not happened yet (owned, gap or discovery alike). Those
// are genuinely unreleased, so listing them under COMING SOON is true.
//
// There is NO tier for "recently added". Recently-added titles are already on
// the shelf; putting them under a COMING SOON header would be a lie the data
// does not support, so the board would rather stay as the asset shipped it
// (see the fixture's fallback) than claim something false.
//
// `import type` on purpose: this module is pure selection/layout logic with no
// runtime dependency on anything, which is what lets
// tests/coming-soon-feed.test.ts run it under bare `node --test` type
// stripping (same rule promo-campaigns.ts and store-layout.ts follow). The
// persisted requested-id set is passed IN rather than read here.
import type { JellyfinLibrary, Movie } from './jellyfin';

/** Why a title is on the board — kept so a consumer can label honestly. */
export type ComingSoonSource = 'ordered' | 'unreleased';

export interface ComingSoonTitle {
  title: string;
  /**
   * Street date, when the data carries one that has NOT passed. Null for an
   * ordered title whose release is already behind us (you can order a 1994
   * film): it is genuinely coming to this store, but no date in the model
   * says when, and a real board leaves that column empty rather than guess.
   */
  date: Date | null;
  source: ComingSoonSource;
  /** Dedupe identity — tmdbId when there is one, normalized title otherwise. */
  key: string;
}

/** One changeable-letter row: date column + title column, either may be ''. */
export interface ComingSoonRow {
  date: string;
  title: string;
}

export interface ComingSoonFeedOptions {
  /**
   * tmdbIds this app has ordered through Jellyseerr — jellyseerr.ts's
   * persisted `jellyseerr_requested_ids`. Passed in (not read here) so this
   * module stays free of runtime imports; the caller owns the storage.
   */
  requestedIds?: Set<number>;
  /**
   * Pools outside `libraries` that carry the same flags — the staff-picks
   * endcap order candidates (FixtureContext.staffPickMovies) never get shelved
   * into a library, so they'd otherwise be invisible to the board.
   */
  extra?: Movie[];
  /** How far ahead a release date may sit and still be dated. Default 365d. */
  horizonDays?: number;
  /** "Now" — injectable so a checkpoint/screenshot can pin the calendar. */
  now?: Date;
}

// Month labels a letter kit can actually set in the 6-tab date column. The
// board right-aligns the date and the column has room for ~7 characters
// (NOTES.md §3: grid origin 0.090 W, date column right edge 0.228 W, tab
// advance 0.0230 W), so the month label may not exceed four — which is why the
// 1990 reference reads "JUNE 13" / "JULY 11" and the longer months abbreviate.
const MONTH_LABELS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUNE',
  'JULY', 'AUG', 'SEPT', 'OCT', 'NOV', 'DEC',
];

const DAY_MS = 86400000;

function parseReleaseDate(iso: string | undefined): Date | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t);
}

function normalizeKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Same-day test in local time — the board groups by calendar day, not epoch. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Every title genuinely coming to this store, soonest first, undated ones
 * last. Pure: no fetching, no I/O — it reads the catalog the scene already
 * holds plus the persisted requested-id set, so it costs one pass over the
 * libraries and is safe to call on any data change.
 */
export function collectComingSoon(
  libraries: JellyfinLibrary[],
  opts: ComingSoonFeedOptions = {}
): ComingSoonTitle[] {
  const now = opts.now ?? new Date();
  const horizonMs = now.getTime() + (opts.horizonDays ?? 365) * DAY_MS;
  const requested = opts.requestedIds;
  const byKey = new Map<string, ComingSoonTitle>();

  const consider = (m: Movie | undefined) => {
    if (!m || !m.title || m.game) return;
    // (a) ORDERED — the same predicate the gold COMING SOON corner label uses.
    const notInStore = !!(m.discovery || m.collectionGap || m.comingSoon);
    const ordered = notInStore && (
      !!m.discoveryRequested ||
      (typeof m.tmdbId === 'number' && !!requested?.has(m.tmdbId))
    );
    // (b) UNRELEASED — the catalog's own date says it isn't out yet.
    const release = parseReleaseDate(m.premiereDate);
    const upcoming = !!release && release.getTime() > now.getTime() && release.getTime() <= horizonMs;
    if (!ordered && !upcoming) return;

    const key = typeof m.tmdbId === 'number' ? `t${m.tmdbId}` : `n${normalizeKey(m.title)}`;
    const prev = byKey.get(key);
    if (prev) {
      // Same film reached us twice (a gap case and an endcap candidate, say):
      // keep the strongest claim — ordered beats unreleased, a date beats none.
      if (ordered) prev.source = 'ordered';
      if (!prev.date && upcoming) prev.date = release;
      return;
    }
    byKey.set(key, {
      title: m.title,
      date: upcoming ? release : null,
      source: ordered ? 'ordered' : 'unreleased',
      key,
    });
  };

  for (const lib of libraries) {
    for (const m of lib.movies) consider(m);
  }
  for (const m of opts.extra ?? []) consider(m);

  const out = [...byKey.values()];
  out.sort((a, b) => {
    const ad = a.date ? a.date.getTime() : Number.POSITIVE_INFINITY;
    const bd = b.date ? b.date.getTime() : Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    return a.title.localeCompare(b.title);
  });
  return out;
}

/**
 * Lay the feed out the way the 1990 board's manager did (NOTES.md §5): the
 * undated titles first, a blank spacer line, then the dated ones grouped by
 * street date — month + day at the head of each new month ("JUNE 13"), a bare
 * day inside it ("14"), and an empty date column for every extra title sharing
 * a date. A blank line separates month blocks. Rows top-anchor and the list is
 * capped at what the board physically holds; nothing overflows.
 */
export function comingSoonRows(items: ComingSoonTitle[], maxRows: number): ComingSoonRow[] {
  if (maxRows <= 0) return [];
  const dated = items.filter((t) => t.date);
  const undated = items.filter((t) => !t.date);

  // Budget: spacers cost rows too, so trim the LONGER list until the whole
  // layout fits. Trimming the longer one keeps both kinds represented on a
  // board that can't hold everything, instead of one starving the other.
  const monthBlocks = (list: ComingSoonTitle[]) => {
    let blocks = 0;
    let prev = '';
    for (const t of list) {
      const k = `${t.date!.getFullYear()}-${t.date!.getMonth()}`;
      if (k !== prev) blocks++;
      prev = k;
    }
    return blocks;
  };
  let nUndated = undated.length;
  let nDated = dated.length;
  const cost = () => {
    const blocks = monthBlocks(dated.slice(0, nDated));
    // one spacer between the undated block and the first dated block, plus one
    // between consecutive month blocks
    const spacers = (nUndated > 0 && nDated > 0 ? 1 : 0) + Math.max(0, blocks - 1);
    return nUndated + nDated + spacers;
  };
  while (cost() > maxRows && (nUndated > 0 || nDated > 0)) {
    if (nUndated >= nDated) nUndated--; else nDated--;
  }

  const rows: ComingSoonRow[] = [];
  for (const t of undated.slice(0, nUndated)) rows.push({ date: '', title: t.title });

  let prevMonth = '';
  let prevDay = '';
  for (const t of dated.slice(0, nDated)) {
    const d = t.date!;
    const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
    const newMonth = monthKey !== prevMonth;
    if (newMonth && rows.length > 0) rows.push({ date: '', title: '' });
    const dk = dayKey(d);
    let label = '';
    if (dk !== prevDay) {
      label = newMonth ? `${MONTH_LABELS[d.getMonth()]} ${d.getDate()}` : String(d.getDate());
    }
    rows.push({ date: label, title: t.title });
    prevMonth = monthKey;
    prevDay = dk;
  }

  // Belt and braces: never hand a board more rows than it holds, and never end
  // on a spacer (a trailing blank line reads as a missing letter, not a gap).
  while (rows.length > maxRows) rows.pop();
  while (rows.length > 0 && !rows[rows.length - 1].date && !rows[rows.length - 1].title) rows.pop();
  return rows;
}

/**
 * Fit one title to a letterboard row the way a manager with a fixed letter kit
 * would: caps only, no year parenthetical, subtitle dropped before anything is
 * cut, and a final cut on a word boundary rather than mid-word. `maxChars` is
 * the row's tab budget INCLUDING the renderer's condensed-letter squeeze, so
 * most titles come back untouched and only genuinely oversized ones lose text.
 */
export function fitLetterboardTitle(title: string, maxChars: number): string {
  let t = title.toUpperCase().replace(/\s+/g, ' ').trim();
  t = t.replace(/\s*\((?:19|20)\d{2}\)\s*$/, '').trim();
  if (t.length <= maxChars) return t;
  // Subtitle first: "THE FILM: SOMETHING ELSE" -> "THE FILM".
  const cut = t.search(/\s[-–—]\s|:\s/);
  if (cut > 0) {
    const head = t.slice(0, cut).trim();
    if (head.length <= maxChars && head.length >= 4) return head;
    t = head.length >= 4 ? head : t;
  }
  if (t.length <= maxChars) return t;
  const clipped = t.slice(0, maxChars);
  const lastSpace = clipped.lastIndexOf(' ');
  return (lastSpace >= Math.floor(maxChars * 0.6) ? clipped.slice(0, lastSpace) : clipped).trim();
}

/**
 * Cheap content signature of a rendered row set. A board regenerates its
 * texture only when this changes — the app idles for days, so a re-letter must
 * cost nothing until the data really moves.
 */
export function comingSoonRowsSignature(rows: ComingSoonRow[]): string {
  let sig = '';
  for (const r of rows) sig += `${r.date}${r.title}`;
  return sig;
}
