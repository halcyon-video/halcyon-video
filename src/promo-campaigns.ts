// `import type` on purpose: this module is pure selection logic with no runtime
// dependency on jellyfin.ts, and keeping the import erasable is what lets
// tests/promo-campaigns.test.ts run it under bare `node --test` type stripping
// (same rule store-layout.ts follows).
import type { Movie, JellyfinLibrary } from './jellyfin';

// ─── Promo campaigns: what a four-sided floor stand actually SELLS ───────────
//
// A floor stand runs ONE campaign. A campaign is a content selector + a sign +
// (where it matters) a rating band. Its four faces may subdivide the campaign —
// PREVIOUSLY VIEWED gives a face to each library — but they never carry
// unrelated subjects, because a real four-sided tower shouted one thing from
// every side; that is the entire point of being four-sided.
//
// This replaces the old "each face is a different Jellyfin BoxSet" content
// rule. Collections were the wrong thing to put here twice over: most BoxSets
// are two titles, which left seven of a face's nine slots bare under a
// full-size sign, and video stores never grouped the floor by taxonomy at all.
// Collections stay handled where they already were — members file adjacent on
// the shelf (shelfTitleCompare in store-layout, and store-plan keeps a saga
// from being split across category sections).
//
// Everything below selects from data the Jellyfin sync already carries:
// `played`/`lastPlayedDate`, `studios`, `rating` (OfficialRating), `genres`,
// `overview`. Nothing here fetches.

export interface PromoFace {
  /** Sign text for this face. A single-subject campaign repeats it on all 4. */
  label: string;
  /**
   * Where this face's stock came from (a library name, a studio) — diagnostics
   * only, never printed. PREVIOUSLY VIEWED faces are stocked per library but
   * all four say PREVIOUSLY VIEWED, so this is the only way to tell the harness
   * dump which library a face is showing.
   */
  source: string;
  /** Exactly rows*cols entries, in getSlots() order (rowFromTop*cols + col). */
  movies: Movie[];
}

export interface PromoCampaign {
  id: string;
  /** Name for the whole stand — the HUD aisle label reads this. */
  topper: string;
  faces: PromoFace[]; // exactly PROMO_FACE_COUNT
}

export const PROMO_FACE_COUNT = 4;

/** A face needs at least one distinct title per column, or it reads as a
 *  half-stocked shelf instead of a promotion — the exact failure the old
 *  per-face-collection rule produced. Campaigns that can't clear this on all
 *  four faces are not viable and the stand falls through to the next one. */
export const MIN_DISTINCT_PER_FACE = 3;

/** The store's own term, and the one the sign prints. Not "recently watched",
 *  not the library name — this is what the real chain called the rack. */
export const PREVIOUSLY_VIEWED = 'PREVIOUSLY VIEWED';

// ─── Rating bands ───────────────────────────────────────────────────────────
// Halloween is two campaigns, not one: a family stand and a horror stand never
// share a fixture. Jason does not stand beside Hocus Pocus.

export type RatingBand = 'family' | 'teen' | 'adult' | 'unknown';

/** All-ages only. PG-13/TV-14 are deliberately NOT here: the line the family
 *  stand has to draw is the one between Hocus Pocus (PG) and a slasher, and a
 *  PG-13 horror picture sits on the wrong side of it. */
const FAMILY_RATINGS = new Set([
  'G', 'PG', 'TV-Y', 'TV-Y7', 'TV-Y7-FV', 'TV-G', 'TV-PG',
  'U', 'UA', 'E', 'EC', 'APPROVED', 'GP', 'M/PG',
]);
const TEEN_RATINGS = new Set(['PG-13', 'PG13', 'TV-14', '12', '12A', '15']);
const ADULT_RATINGS = new Set([
  'R', 'NC-17', 'NC17', 'X', 'XXX', 'TV-MA', 'MA', 'AO', '18', 'R18', 'MA-17',
]);

/** 'unknown' is a real answer, not a default to be papered over — Jellyfin
 *  stamps "NR" on anything the server has no OfficialRating for. */
export function ratingBand(m: Movie): RatingBand {
  const r = (m.rating || '').trim().toUpperCase().replace(/^RATED\s+/, '');
  if (!r) return 'unknown';
  if (FAMILY_RATINGS.has(r)) return 'family';
  if (TEEN_RATINGS.has(r)) return 'teen';
  if (ADULT_RATINGS.has(r)) return 'adult';
  return 'unknown';
}

/** Deliberately asymmetric. A family stand takes ONLY positively family-rated
 *  titles: guessing wrong there is precisely the slasher-next-to-Hocus-Pocus
 *  failure. The adult stand takes teen AND unrated titles — a PG-13 chiller or
 *  an unrated slasher on the horror stand is a harmless error, and excluding
 *  "NR" outright would starve the campaign on any server that doesn't populate
 *  OfficialRating at all. */
function inBand(m: Movie, band: 'family' | 'adult'): boolean {
  const b = ratingBand(m);
  return band === 'family' ? b === 'family' : b !== 'family';
}

// ─── Campaign calendar ──────────────────────────────────────────────────────

/** The date the seasonal calendar reads. `bb_promo_date` (YYYY-MM-DD) forces
 *  it, so an October stand can be shot in July — see the `promo` harness
 *  state. */
export function promoToday(): Date {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('bb_promo_date') : null;
    if (raw) {
      const d = new Date(raw.length <= 10 ? `${raw}T12:00:00` : raw);
      if (!isNaN(d.getTime())) return d;
    }
  } catch { /* no localStorage (headless/SSR) — fall through to the real date */ }
  return new Date();
}

interface Season {
  id: string;
  months: number[]; // 1-12
  /**
   * Whether this season is TWO campaigns (a family stand and an adult one) or
   * one. Halloween splits — that's the whole reason the bands exist. Summer
   * doesn't: a summer tentpole promotion is a single sign,
   * and running it in
   * both bands put the identical sign on two stands facing each other. An
   * unsplit season runs all ratings on the family stand only, and the adult
   * stand falls through its chain to something else.
   */
  split: boolean;
  labels: Record<'family' | 'adult', string>;
  /** Matched case-insensitively against Movie.genres. */
  genres: string[];
  /** Matched against title + overview — a season is rarely a genre. Hocus
   *  Pocus is Comedy/Fantasy; only the word "witch" finds it. */
  keywords: RegExp;
}

const SEASONS: Season[] = [
  {
    id: 'halloween',
    months: [10],
    split: true,
    labels: { family: 'FAMILY FRIGHTS', adult: 'HALLOWEEN HORROR' },
    genres: ['horror'],
    keywords: /\b(halloween|witch|witches|ghost|ghosts|ghoul|haunt|haunted|haunting|monster|monsters|vampire|werewolf|zombie|spooky|pumpkin|graveyard|cemetery|coffin|frankenstein|dracula|mummy|goblin|skeleton|demon|possessed|possession|occult|séance|seance)/i,
  },
  {
    id: 'holiday',
    months: [12],
    split: true,
    labels: { family: 'HOLIDAY FAVORITES', adult: 'NAUGHTY LIST' },
    genres: [],
    keywords: /\b(christmas|santa|holiday|yuletide|noel|reindeer|elf|elves|scrooge|nutcracker|snowman|hanukkah|jingle|sleigh|north pole|mistletoe|new year's eve)/i,
  },
  {
    id: 'sweetheart',
    months: [2],
    split: true,
    labels: { family: 'SWEETHEART SPECIALS', adult: 'DATE NIGHT' },
    genres: ['romance'],
    keywords: /\b(valentine|love story|sweetheart|wedding|honeymoon)/i,
  },
  {
    id: 'summer',
    months: [6, 7, 8],
    split: false,
    labels: { family: 'SUMMER SMASH HITS', adult: 'SUMMER SMASH HITS' },
    genres: ['action', 'adventure', 'science fiction', 'sci-fi'],
    keywords: /\b(summer|beach|surf|vacation|road trip)/i,
  },
];

/**
 * Is the calendar currently inside season `id` ('halloween' | 'holiday' |
 * 'sweetheart' | 'summer')?
 *
 * The campaign chain reads the calendar for what a stand SELLS; this is the
 * same question asked about what the store WEARS. Seasonal DECOR anywhere in
 * the app gates through here so there is one calendar and one test override
 * (`bb_promo_date`) rather than each fixture rolling its own month check —
 * feedback pin 020, "holiday stuff should only appear in the month they
 * match", filed against a Christmas-tree standee standing in August.
 */
export function inSeason(id: string): boolean {
  const month = promoToday().getMonth() + 1;
  return SEASONS.some((s) => s.id === id && s.months.includes(month));
}

function matchesSeason(m: Movie, s: Season): boolean {
  const genres = (m.genres || []).map((g) => g.toLowerCase());
  if (s.genres.some((g) => genres.includes(g))) return true;
  return s.keywords.test(`${m.title} ${m.overview || ''}`);
}

// ─── Promo-worthy studios ───────────────────────────────────────────────────
// Curated on purpose. Jellyfin's Studios field mixes production companies with
// distributors, so "the studio with the most titles" would hand every library
// a WARNER BROS. tower, which means nothing as a promotion. These are the
// names a store would actually have built an endcap around.

interface PromoStudio { display: string; match: RegExp; }

const PROMO_STUDIOS: PromoStudio[] = [
  { display: 'STUDIO GHIBLI', match: /ghibli/i },
  { display: 'PIXAR', match: /pixar/i },
  { display: 'WALT DISNEY ANIMATION', match: /walt disney (feature )?animation/i },
  { display: 'DREAMWORKS ANIMATION', match: /dreamworks animation/i },
  { display: 'AARDMAN', match: /aardman/i },
  { display: 'LAIKA', match: /^laika\b/i },
  { display: 'CARTOON SALOON', match: /cartoon saloon/i },
  { display: 'AMBLIN', match: /amblin/i },
  { display: 'LUCASFILM', match: /lucasfilm/i },
  { display: 'MARVEL STUDIOS', match: /marvel studios/i },
  { display: 'A24', match: /^a24$/i },
  { display: 'BLUMHOUSE', match: /blumhouse/i },
  { display: 'HAMMER FILM', match: /hammer film/i },
  { display: 'TOHO', match: /^toho\b/i },
  { display: 'THE CRITERION COLLECTION', match: /criterion/i },
  // Fictional houses: these exist so the bundled demo library (which ships
  // no real studio marks) can still light the studio stand. Exact-match so
  // they can never shadow a real library's metadata.
  { display: 'GREENGLASS ANIMATION', match: /^greenglass animation$/i },
  { display: 'STARBARROW ANIMATION', match: /^starbarrow animation$/i },
  { display: 'WANDERLARK PICTURES', match: /^wanderlark pictures$/i },
  { display: 'HOLLOWLIGHT FILMS', match: /^hollowlight films$/i },
];

// ─── Shared selection helpers ───────────────────────────────────────────────

/** Same exclusion the clerk's reasoning uses (recommend-why): a case with no
 *  rental copy behind it can't stock a promotion. */
function isStockTitle(m: Movie): boolean {
  return !(m.comingSoon || m.discovery || m.collectionGap || m.game);
}

function dedupedMovies(libs: JellyfinLibrary[]): Movie[] {
  const seen = new Set<string>();
  const out: Movie[] = [];
  libs.forEach((lib) => lib.movies.forEach((m) => {
    if (!isStockTitle(m) || seen.has(m.id)) return;
    seen.add(m.id);
    out.push(m);
  }));
  return out;
}

/** Most recently watched first. A title with watch state but no date sorts
 *  behind every dated one rather than jumping the queue as an epoch-zero. */
function byRecency(a: Movie, b: Movie): number {
  const da = a.lastPlayedDate ? Date.parse(a.lastPlayedDate) : -Infinity;
  const db = b.lastPlayedDate ? Date.parse(b.lastPlayedDate) : -Infinity;
  if (da !== db) return db - da;
  const pa = a.playCount ?? 0, pb = b.playCount ?? 0;
  if (pa !== pb) return pb - pa;
  return a.title.localeCompare(b.title);
}

/** Best first, so that when a pool overflows the stand the tail we drop is the
 *  weakest of it rather than an alphabetical accident. */
function byPromoOrder(a: Movie, b: Movie): number {
  const ra = a.communityRating ?? -1, rb = b.communityRating ?? -1;
  if (ra !== rb) return rb - ra;
  if (a.year !== b.year) return a.year - b.year;
  return a.title.localeCompare(b.title);
}

/**
 * Lay one face out as rows*cols slots in getSlots() order.
 *
 * With enough distinct titles every slot is unique. When the pool is short the
 * shortfall repeats DOWN A COLUMN, so the face reads as stacked copies of a
 * promo title — which is what a floor promotion looked like — instead of the
 * same title scattered at random or, worse, bare slots.
 */
export function layoutFace(distinct: Movie[], rows: number, cols: number): Movie[] {
  const out: Movie[] = [];
  if (distinct.length === 0) return out;
  if (distinct.length >= rows * cols) {
    for (let i = 0; i < rows * cols; i++) out.push(distinct[i]);
    return out;
  }
  const perCol: Movie[][] = Array.from({ length: cols }, () => []);
  distinct.forEach((m, i) => perCol[i % cols].push(m));
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Guard the pool-smaller-than-cols case: MIN_DISTINCT_PER_FACE keeps a
      // built face off it, but layoutFace is exported and shouldn't trap.
      const colTitles = perCol[col].length ? perCol[col] : distinct;
      out.push(colTitles[row % colTitles.length]);
    }
  }
  return out;
}

interface FaceSource { label: string; pool: Movie[]; }

/**
 * Carve `count` faces off the sources, always drawing from whichever source
 * has the most titles left. Four libraries give one face each; a single-library
 * store gives all four faces to that library, each a different slice. Returns
 * null the moment a face can't be filled — a campaign is all four faces or it
 * isn't viable.
 */
function carveFaces(
  sources: FaceSource[],
  count: number,
  rows: number,
  cols: number,
  label: string,
): PromoFace[] | null {
  const perFace = rows * cols;
  const cursors = sources.map((s) => ({ source: s.label, pool: s.pool, at: 0 }));
  const faces: PromoFace[] = [];
  for (let f = 0; f < count; f++) {
    let best: typeof cursors[number] | null = null;
    let bestLeft = 0;
    for (const c of cursors) {
      const left = c.pool.length - c.at;
      if (left < MIN_DISTINCT_PER_FACE) continue;
      if (!best || left > bestLeft) { best = c; bestLeft = left; }
    }
    if (!best) return null;
    const take = best.pool.slice(best.at, best.at + perFace);
    best.at += take.length;
    faces.push({ label, source: best.source, movies: layoutFace(take, rows, cols) });
  }
  return faces;
}

/**
 * Spread ONE subject's pool across all four faces round-robin, so each face
 * gets a cross-section of the campaign rather than the first quarter of it.
 * Used by the single-subject campaigns (a studio, a season).
 */
function spreadFaces(label: string, pool: Movie[], count: number, rows: number, cols: number): PromoFace[] | null {
  const movies = pool.filter((m) => !m.isSeries);
  const shows = pool.filter((m) => m.isSeries);

  const M = movies.length;
  const S = shows.length;

  let bestPair: { m: number; s: number; error: number } | null = null;

  for (let m = 0; m <= count; m++) {
    const s = count - m;
    const mValid = m === 0 || M >= m * MIN_DISTINCT_PER_FACE;
    const sValid = s === 0 || S >= s * MIN_DISTINCT_PER_FACE;
    if (mValid && sValid) {
      const idealM = (M + S) > 0 ? count * (M / (M + S)) : count / 2;
      const error = Math.abs(m - idealM);
      if (!bestPair || error < bestPair.error) {
        bestPair = { m, s, error };
      }
    }
  }

  if (!bestPair) return null;

  const movieBuckets: Movie[][] = Array.from({ length: bestPair.m }, () => []);
  if (bestPair.m > 0) {
    movies.forEach((item, i) => movieBuckets[i % bestPair.m].push(item));
  }

  const showBuckets: Movie[][] = Array.from({ length: bestPair.s }, () => []);
  if (bestPair.s > 0) {
    shows.forEach((item, i) => showBuckets[i % bestPair.s].push(item));
  }

  const allBuckets = [...movieBuckets, ...showBuckets];
  if (allBuckets.length !== count) return null;

  return allBuckets.map((b) => ({ label, source: label, movies: layoutFace(b, rows, cols) }));
}

// ─── Campaigns ──────────────────────────────────────────────────────────────

/**
 * PREVIOUSLY VIEWED — one face per library, most recently watched first. The
 * store fixture and the Jellyfin data mean the same thing here: a
 * previously-viewed tape is one that's been rented and watched.
 *
 * Every face says PREVIOUSLY VIEWED, not the library name. That IS the
 * merchandising — it's the term the real stores used, and a face of nothing but
 * animation tells you it's the animated shelf without a sign saying so. The
 * library survives on PromoFace.source for diagnostics.
 */
function recentlyPlayed(libs: JellyfinLibrary[], rows: number, cols: number): PromoCampaign | null {
  const sources: FaceSource[] = [];
  const seen = new Set<string>();
  libs.forEach((lib) => {
    const playedMovies: Movie[] = [];
    const playedShows: Movie[] = [];
    lib.movies
      .filter((m) => {
        if (!isStockTitle(m) || seen.has(m.id)) return false;
        if (!(m.played || (m.playCount ?? 0) > 0)) return false;
        seen.add(m.id);
        return true;
      })
      .sort(byRecency)
      .forEach((m) => {
        if (m.isSeries) playedShows.push(m);
        else playedMovies.push(m);
      });
    if (playedMovies.length >= MIN_DISTINCT_PER_FACE) {
      sources.push({ label: (lib.name || 'PREVIOUSLY VIEWED').toUpperCase(), pool: playedMovies });
    }
    if (playedShows.length >= MIN_DISTINCT_PER_FACE) {
      sources.push({ label: (lib.name || 'PREVIOUSLY VIEWED').toUpperCase(), pool: playedShows });
    }
  });
  if (!sources.length) return null;
  const faces = carveFaces(sources, PROMO_FACE_COUNT, rows, cols, PREVIOUSLY_VIEWED);
  return faces ? { id: 'recently-played', topper: PREVIOUSLY_VIEWED, faces } : null;
}

/** One studio across all four sides. `pick` is the Nth-best studio by title
 *  count, which is how two stands select different studios without sharing
 *  any state — same trick the old displayIndex used. */
function studioSpotlight(libs: JellyfinLibrary[], rows: number, cols: number, pick: number): PromoCampaign | null {
  const all = dedupedMovies(libs);
  const scored = PROMO_STUDIOS
    .map((s) => ({ s, pool: all.filter((m) => (m.studios || []).some((name) => s.match.test(name))) }))
    .filter((x) => x.pool.length >= PROMO_FACE_COUNT * MIN_DISTINCT_PER_FACE)
    .sort((a, b) => b.pool.length - a.pool.length || a.s.display.localeCompare(b.s.display));
  const chosen = scored[pick];
  if (!chosen) return null;
  const faces = spreadFaces(chosen.s.display, chosen.pool.slice().sort(byPromoOrder), PROMO_FACE_COUNT, rows, cols);
  return faces ? { id: `studio-spotlight:${pick}`, topper: chosen.s.display, faces } : null;
}

/** The current month's seasonal promotion, in one rating band. */
function seasonal(libs: JellyfinLibrary[], rows: number, cols: number, band: 'family' | 'adult'): PromoCampaign | null {
  const month = promoToday().getMonth() + 1;
  const season = SEASONS.find((s) => s.months.includes(month));
  if (!season) return null;
  // An unsplit season is ONE promotion: it runs unfiltered on the family stand
  // and declines the adult one, which then falls through to a studio. Running
  // it in both bands put the same sign on two stands in the same sightline.
  if (!season.split && band === 'adult') return null;
  const pool = dedupedMovies(libs)
    .filter((m) => (season.split ? inBand(m, band) : true) && matchesSeason(m, season))
    .sort(byPromoOrder);
  const faces = spreadFaces(season.labels[band], pool, PROMO_FACE_COUNT, rows, cols);
  return faces ? { id: `seasonal:${season.id}:${band}`, topper: season.labels[band], faces } : null;
}

/**
 * Resolve a stand's campaign chain: the first viable campaign wins. Returns
 * null when none is — a stand with nothing honest to sell builds no meshes at
 * all rather than standing there half-stocked, which is also what keeps a
 * small library from sprouting three promo towers.
 *
 * Chain entries are `kind` or `kind:arg`:
 *   recently-played
 *   studio-spotlight:<n>     n = Nth-best studio (default 0)
 *   seasonal:<family|adult>
 */
export function buildPromoCampaign(
  chain: string[],
  libs: JellyfinLibrary[],
  rows: number,
  cols: number,
): PromoCampaign | null {
  for (const spec of chain) {
    const [kind, arg] = spec.split(':');
    let campaign: PromoCampaign | null = null;
    if (kind === 'recently-played') campaign = recentlyPlayed(libs, rows, cols);
    else if (kind === 'studio-spotlight') campaign = studioSpotlight(libs, rows, cols, Number(arg) || 0);
    else if (kind === 'seasonal') campaign = seasonal(libs, rows, cols, arg === 'adult' ? 'adult' : 'family');
    if (campaign) return campaign;
  }
  return null;
}
