// Issue #42 — Media Release Date: pin the store's catalog to a rolling point
// in time, independent of store era.
//
// The pin is a content-time axis: everything that premiered after the rolling
// cutoff is absent from the store entirely — not shelved, not searchable, not
// suggested, doesn't play — same as if it hadn't been made yet. Store ERA
// (bb_theme: decor/signage/fixtures) stays a separate axis; the optional
// matchEra flag couples them one way (pin drives era) for people who want the
// whole store to live in the pinned year.
//
// Same persistence shape as rental-clock.ts: the decision is computed ONCE at
// the moment it's made ({ mediaReleaseDate, pinnedAt }) and every boot only
// compares against it — the effective cutoff is mediaReleaseDate plus however
// many whole local days have passed since pinnedAt, so the store's "today"
// marches forward one real day per real day, permanently offset from actual
// today. Never re-derived from a different base on reboot.
//
// This module is deliberately dependency-free (no three.js, no DOM beyond a
// guarded localStorage) so the rules unit-test straight under `node --test`
// (npm run test:releasedate).

export const MEDIA_RELEASE_DATE_KEY = 'bb_media_release_date';

export interface MediaReleasePin {
  /** The pinned catalog date, as a local calendar date 'YYYY-MM-DD'. */
  mediaReleaseDate: string;
  /**
   * ISO instant the pin was set (computed once, at the terminal). Absent on a
   * hand-written bare-date pin (harness/tooling): the cutoff then simply IS
   * mediaReleaseDate every boot — a static pin that never advances.
   */
  pinnedAt?: string;
  /**
   * When true, the store's ERA follows the pin: each boot re-derives the
   * period theme from the effective cutoff (see eraThemeIdForDate), so the
   * decor crosses 1993/2000/2010 the day the rolling date does. Off = the
   * two axes stay fully decoupled (a bb-2010 store can carry 1996 stock).
   */
  matchEra?: boolean;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Sanity range for typed/persisted pin years — outside it, treat as corrupt. */
export const PIN_YEAR_MIN = 1900;
export const PIN_YEAR_MAX = 2100;

/**
 * Parse 'YYYY-MM-DD' into a LOCAL-midnight Date, or null if it isn't a real
 * calendar date (1996-02-31 round-trips wrong through the Date constructor,
 * which is the validation).
 */
export function parseDateOnly(s: string | undefined | null): Date | null {
  if (!s) return null;
  const m = DATE_ONLY.exec(s.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < PIN_YEAR_MIN || y > PIN_YEAR_MAX) return null;
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

/** Format a Date as the local calendar date 'YYYY-MM-DD'. */
export function toDateOnly(d: Date): string {
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Parse + validate a raw `bb_media_release_date` string. Accepts the full
 * record JSON the terminal writes, or a bare 'YYYY-MM-DD' (a static pin —
 * handy for tooling and hand edits). Anything malformed returns null so a bad
 * write can never wedge boot into an empty store.
 */
export function parseMediaReleasePin(raw: string | null | undefined): MediaReleasePin | null {
  if (!raw) return null;
  const s = raw.trim();
  if (parseDateOnly(s)) return { mediaReleaseDate: s };
  try {
    const obj = JSON.parse(s) as Partial<MediaReleasePin> | string;
    if (typeof obj === 'string') return parseDateOnly(obj) ? { mediaReleaseDate: obj } : null;
    if (!obj || typeof obj !== 'object') return null;
    if (!parseDateOnly(obj.mediaReleaseDate)) return null;
    const pin: MediaReleasePin = { mediaReleaseDate: obj.mediaReleaseDate! };
    if (typeof obj.pinnedAt === 'string' && Number.isFinite(Date.parse(obj.pinnedAt))) {
      pin.pinnedAt = obj.pinnedAt;
    }
    if (obj.matchEra === true) pin.matchEra = true;
    return pin;
  } catch {
    return null;
  }
}

/** Whole local calendar days from `from`'s date to `to`'s date (clamped >= 0). */
function calendarDaysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  // Local-midnight difference; rounding absorbs the odd DST hour.
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

/**
 * The effective cutoff for a boot happening at `now`: the pinned date advanced
 * by the whole local days elapsed since pinnedAt, as an INCLUSIVE end-of-day
 * instant (a title premiering ON the cutoff date exists). Calendar-component
 * math, so DST transitions never shear the offset.
 */
export function effectiveCutoff(pin: MediaReleasePin, now: Date): Date {
  const base = parseDateOnly(pin.mediaReleaseDate) ?? now;
  const pinnedAt = pin.pinnedAt ? new Date(pin.pinnedAt) : null;
  const days = pinnedAt && Number.isFinite(pinnedAt.getTime()) ? calendarDaysBetween(pinnedAt, now) : 0;
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days, 23, 59, 59, 999);
}

/**
 * Whether a title had premiered by `cutoff`. Exact premiereDate wins; a title
 * carrying only a year is treated as released on Jan 1 of that year (year <=
 * cutoff year keeps it). A title with NO date data at all always stays — the
 * pin must never vanish undated stock.
 */
export function titleReleasedBy(
  title: { premiereDate?: string; year?: number },
  cutoff: Date,
): boolean {
  if (title.premiereDate) {
    const t = Date.parse(title.premiereDate);
    if (Number.isFinite(t)) return t <= cutoff.getTime();
  }
  if (typeof title.year === 'number' && Number.isFinite(title.year) && title.year > 0) {
    return title.year <= cutoff.getFullYear();
  }
  return true;
}

/** Filter a movie list to titles released by `cutoff` (fresh array, input untouched). */
export function filterMoviesByCutoff<T extends { premiereDate?: string; year?: number }>(
  movies: T[],
  cutoff: Date,
): T[] {
  return movies.filter((m) => titleReleasedBy(m, cutoff));
}

/**
 * Filter every library's movie list against `cutoff`. Returns COPIES ({...lib}
 * with a fresh movies array) and drops libraries the cutoff empties entirely —
 * a 1996 store must not build an aisle for its all-2020s library. The fetched
 * input is never mutated, which is what makes clearing the pin a rebuild
 * rather than a re-sync (same contract as games-only's storeCatalog).
 */
export function filterLibrariesByCutoff<L extends { movies: { premiereDate?: string; year?: number }[] }>(
  libraries: L[],
  cutoff: Date,
): L[] {
  return libraries
    .map((lib) => ({ ...lib, movies: filterMoviesByCutoff(lib.movies, cutoff) }))
    .filter((lib) => lib.movies.length > 0);
}

/**
 * The era theme the pin implies: among year-suffixed theme ids ('bb-1993',
 * 'bb-2010', ...), the latest whose year <= the cutoff's year — a store pinned
 * to 1996 dresses as bb-1993 until its rolling date reaches 2000. A cutoff
 * before the earliest era wears that earliest era. Ids without a -YYYY suffix
 * (custom packs) are ignored; null when none qualify.
 */
export function eraThemeIdForDate(cutoff: Date, themeIds: string[]): string | null {
  const year = cutoff.getFullYear();
  let best: { id: string; year: number } | null = null;
  let earliest: { id: string; year: number } | null = null;
  for (const id of themeIds) {
    const m = /-(\d{4})$/.exec(id);
    if (!m) continue;
    const y = Number(m[1]);
    if (!earliest || y < earliest.year) earliest = { id, year: y };
    if (y <= year && (!best || y > best.year)) best = { id, year: y };
  }
  return (best ?? earliest)?.id ?? null;
}

// ── Permanent Jellyseerr suggestion bounds (static, admin-set) ──────────────
//
// Independent of the rolling pin: a fixed release-date window on everything
// Jellyseerr-suggested (discovery shelves, staff-pick seeds, collection-gap
// cases). 'YYYY' or 'YYYY-MM-DD'; the bare year reads inclusively (from 1980 =
// from 1980-01-01, until 1999 = until 1999-12-31). Composes with the rolling
// pin — whichever upper bound is tighter wins — so a store can be pinned to
// 1999 AND permanently refuse pre-1980 suggestions at the same time.

export const SUGGEST_FROM_KEY = 'jellyseerr_suggest_from';
export const SUGGEST_UNTIL_KEY = 'jellyseerr_suggest_until';

/** Parse a bound value: 'YYYY' or 'YYYY-MM-DD'. `edge` resolves a bare year. */
export function parseBound(raw: string | null | undefined, edge: 'start' | 'end'): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^\d{4}$/.test(s)) {
    const y = Number(s);
    if (y < PIN_YEAR_MIN || y > PIN_YEAR_MAX) return null;
    return edge === 'start' ? new Date(y, 0, 1) : new Date(y, 11, 31, 23, 59, 59, 999);
  }
  const d = parseDateOnly(s);
  if (!d) return null;
  return edge === 'end' ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999) : d;
}

export interface SuggestionWindow {
  /** Suggestions must have premiered ON/AFTER this instant (null = no floor). */
  min: Date | null;
  /** Suggestions must have premiered ON/BEFORE this instant (null = no ceiling). */
  max: Date | null;
}

/**
 * The window Jellyseerr-sourced suggestions must premiere inside: the static
 * bounds, with the rolling pin's effective cutoff folded into the ceiling
 * (tighter wins). Pass the values read from storage/settings so the pure math
 * stays node-testable.
 */
export function suggestionWindow(
  pin: MediaReleasePin | null,
  from: string | null | undefined,
  until: string | null | undefined,
  now: Date,
): SuggestionWindow {
  const min = parseBound(from, 'start');
  let max = parseBound(until, 'end');
  if (pin) {
    const cutoff = effectiveCutoff(pin, now);
    if (!max || cutoff.getTime() < max.getTime()) max = cutoff;
  }
  return { min, max };
}

/** Whether a suggestion premieres inside the window (undated: only a floor rejects it). */
export function titleInWindow(
  title: { premiereDate?: string; year?: number },
  win: SuggestionWindow,
): boolean {
  if (win.max && !titleReleasedBy(title, win.max)) return false;
  if (win.min) {
    if (title.premiereDate) {
      const t = Date.parse(title.premiereDate);
      if (Number.isFinite(t)) return t >= win.min.getTime();
    }
    if (typeof title.year === 'number' && Number.isFinite(title.year) && title.year > 0) {
      // Year-only: the whole year must not sit entirely before the floor.
      return title.year >= win.min.getFullYear();
    }
    // Undated suggestions can't prove they clear the floor — drop them
    // (unlike owned stock, a suggestion is safe to lose).
    return false;
  }
  return true;
}

/** The window's ceiling as 'YYYY-MM-DD' for a server-side lte param, or null. */
export function windowLteParam(win: SuggestionWindow): string | null {
  return win.max ? toDateOnly(win.max) : null;
}

/** The window's floor as 'YYYY-MM-DD' for a server-side gte param, or null. */
export function windowGteParam(win: SuggestionWindow): string | null {
  return win.min ? toDateOnly(win.min) : null;
}

/** Terminal/status label for a pin, e.g. "12-JUN-1996" (effective, not base). */
export function formatCutoffLabel(pin: MediaReleasePin, now: Date): string {
  const d = effectiveCutoff(pin, now);
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${d.getDate().toString().padStart(2, '0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

// ── localStorage plumbing (guarded so the pure math above stays node-testable) ──

export function loadMediaReleasePin(): MediaReleasePin | null {
  if (typeof localStorage === 'undefined') return null;
  return parseMediaReleasePin(localStorage.getItem(MEDIA_RELEASE_DATE_KEY));
}

export function saveMediaReleasePin(pin: MediaReleasePin): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(MEDIA_RELEASE_DATE_KEY, JSON.stringify(pin));
  } catch {
    // Storage full/unavailable — the pin still applies this session.
  }
}

export function clearMediaReleasePin(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(MEDIA_RELEASE_DATE_KEY);
}

/**
 * The effective cutoff for THIS boot, or null when unpinned — the one-call
 * form the funnel and scene code use.
 */
export function activeMediaCutoff(now: Date = new Date()): Date | null {
  const pin = loadMediaReleasePin();
  return pin ? effectiveCutoff(pin, now) : null;
}

/** The active suggestion window off storage (pin + permanent bounds). */
export function activeSuggestionWindow(now: Date = new Date()): SuggestionWindow {
  if (typeof localStorage === 'undefined') return { min: null, max: null };
  return suggestionWindow(
    loadMediaReleasePin(),
    localStorage.getItem(SUGGEST_FROM_KEY),
    localStorage.getItem(SUGGEST_UNTIL_KEY),
    now,
  );
}
