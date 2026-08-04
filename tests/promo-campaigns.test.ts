// Promo floor-stand campaigns: what a four-sided stand sells, and the rules
// that keep it from looking like the per-face-collection scheme it replaced —
// every face fully stocked, and the family stand never sharing a fixture with
// the horror one.
//
//   npm run test:promo
//
// Runs under plain `node --test` with type stripping — no test framework.
// promo-campaigns.ts is pure selection logic with no THREE/DOM imports
// precisely so this works.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Movie, JellyfinLibrary } from '../src/jellyfin.ts';
import {
  buildPromoCampaign,
  layoutFace,
  ratingBand,
  MIN_DISTINCT_PER_FACE,
  PROMO_FACE_COUNT,
} from '../src/promo-campaigns.ts';

const ROWS = 3, COLS = 3, PER_FACE = ROWS * COLS;

function mk(title: string, extra: Partial<Movie> = {}): Movie {
  return {
    id: title,
    title,
    year: 2000,
    duration: '1h 30m',
    rating: 'PG-13',
    overview: '',
    director: '',
    actors: [],
    genres: [],
    localPath: '',
    ...extra,
  } as Movie;
}

function lib(name: string, movies: Movie[]): JellyfinLibrary {
  return { id: name, name, movies, genres: [] };
}

/** n titles, all watched, in a named library. */
function watched(libName: string, n: number, extra: Partial<Movie> = {}): Movie[] {
  return Array.from({ length: n }, (_, i) =>
    mk(`${libName} ${i}`, {
      played: true,
      playCount: 1,
      lastPlayedDate: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
      libraryName: libName,
      ...extra,
    }));
}

// ─── layoutFace ─────────────────────────────────────────────────────────────

test('a full pool fills every slot with a distinct title', () => {
  const pool = Array.from({ length: PER_FACE }, (_, i) => mk(`T${i}`));
  const face = layoutFace(pool, ROWS, COLS);
  assert.equal(face.length, PER_FACE);
  assert.equal(new Set(face.map((m) => m.id)).size, PER_FACE);
});

test('a short pool still fills every slot — no bare shelf', () => {
  const face = layoutFace([mk('A'), mk('B'), mk('C')], ROWS, COLS);
  assert.equal(face.length, PER_FACE);
  assert.ok(face.every(Boolean));
});

test('repeats stack DOWN A COLUMN, the way a floor promo was stacked', () => {
  const face = layoutFace([mk('A'), mk('B'), mk('C')], ROWS, COLS);
  // Row-major, so column c is indices c, c+COLS, c+2*COLS.
  for (let c = 0; c < COLS; c++) {
    const column = [face[c], face[c + COLS], face[c + 2 * COLS]].map((m) => m.id);
    assert.equal(new Set(column).size, 1, `column ${c} should be one repeated title, got ${column}`);
  }
});

test('an oversized pool is truncated, not wrapped', () => {
  const pool = Array.from({ length: PER_FACE * 3 }, (_, i) => mk(`T${i}`));
  const face = layoutFace(pool, ROWS, COLS);
  assert.equal(face.length, PER_FACE);
  assert.deepEqual(face.map((m) => m.title), pool.slice(0, PER_FACE).map((m) => m.title));
});

// ─── rating bands ───────────────────────────────────────────────────────────

test('PG-13 and TV-14 are TEEN, not family — the Hocus Pocus line', () => {
  assert.equal(ratingBand(mk('x', { rating: 'PG' })), 'family');
  assert.equal(ratingBand(mk('x', { rating: 'G' })), 'family');
  assert.equal(ratingBand(mk('x', { rating: 'PG-13' })), 'teen');
  assert.equal(ratingBand(mk('x', { rating: 'TV-14' })), 'teen');
  assert.equal(ratingBand(mk('x', { rating: 'R' })), 'adult');
  assert.equal(ratingBand(mk('x', { rating: 'NR' })), 'unknown');
  assert.equal(ratingBand(mk('x', { rating: '' })), 'unknown');
  assert.equal(ratingBand(mk('x', { rating: 'Rated R' })), 'adult');
});

// ─── recently-played ────────────────────────────────────────────────────────

test('PREVIOUSLY VIEWED stocks a face per library but SIGNS them all the same', () => {
  const libs = [
    lib('Movies', watched('Movies', 12)),
    lib('Animated Movies', watched('Animated Movies', 12)),
    lib('Anime', watched('Anime', 12)),
    lib('Documentaries', watched('Documentaries', 12)),
  ];
  const c = buildPromoCampaign(['recently-played'], libs, ROWS, COLS)!;
  assert.equal(c.topper, 'PREVIOUSLY VIEWED');
  // Every sign says PREVIOUSLY VIEWED — the term the real stores used. A face
  // of nothing but animation reads as the animated shelf without a label.
  assert.deepEqual(new Set(c.faces.map((f) => f.label)), new Set(['PREVIOUSLY VIEWED']));
  // ...but each face is still ONE library's stock, tracked for diagnostics.
  assert.deepEqual(
    c.faces.map((f) => f.source).sort(),
    ['ANIME', 'ANIMATED MOVIES', 'DOCUMENTARIES', 'MOVIES'].sort(),
  );
  c.faces.forEach((f) => {
    assert.equal(f.movies.length, PER_FACE);
    const libsOnFace = new Set(f.movies.map((m) => m.libraryName));
    assert.equal(libsOnFace.size, 1, 'a face should not mix libraries');
  });
});

test('a single-library store still fills all four faces, with different slices', () => {
  const libs = [lib('Movies', watched('Movies', PER_FACE * PROMO_FACE_COUNT))];
  const c = buildPromoCampaign(['recently-played'], libs, ROWS, COLS)!;
  assert.equal(c.faces.length, PROMO_FACE_COUNT);
  const ids = c.faces.flatMap((f) => f.movies.map((m) => m.id));
  assert.equal(new Set(ids).size, PER_FACE * PROMO_FACE_COUNT, 'faces should not repeat each other');
});

test('most recently watched comes first', () => {
  const libs = [lib('Movies', watched('Movies', 40))];
  const c = buildPromoCampaign(['recently-played'], libs, ROWS, COLS)!;
  assert.equal(c.faces[0].movies[0].title, 'Movies 39');
});

test('unwatched titles never reach a PREVIOUSLY VIEWED stand', () => {
  const libs = [lib('Movies', [
    ...watched('Movies', 40),
    ...Array.from({ length: 40 }, (_, i) => mk(`Unwatched ${i}`, { libraryName: 'Movies' })),
  ])];
  const c = buildPromoCampaign(['recently-played'], libs, ROWS, COLS)!;
  const titles = c.faces.flatMap((f) => f.movies.map((m) => m.title));
  assert.ok(!titles.some((t) => t.startsWith('Unwatched')));
});

test('too little watch history is NOT viable — the stand falls through', () => {
  const libs = [lib('Movies', watched('Movies', MIN_DISTINCT_PER_FACE * PROMO_FACE_COUNT - 1))];
  assert.equal(buildPromoCampaign(['recently-played'], libs, ROWS, COLS), null);
});

test('titles with no rental copy are excluded', () => {
  const libs = [lib('Movies', [
    ...watched('Movies', 40, { collectionGap: true }),
  ])];
  assert.equal(buildPromoCampaign(['recently-played'], libs, ROWS, COLS), null);
});

// ─── studio spotlight ───────────────────────────────────────────────────────

function studioLib(): JellyfinLibrary[] {
  return [lib('Movies', [
    ...Array.from({ length: 20 }, (_, i) => mk(`Ghibli ${i}`, { studios: ['Studio Ghibli'] })),
    ...Array.from({ length: 15 }, (_, i) => mk(`Pixar ${i}`, { studios: ['Pixar'] })),
    // A distributor, deliberately the biggest pool in the library.
    ...Array.from({ length: 80 }, (_, i) => mk(`WB ${i}`, { studios: ['Warner Bros. Pictures'] })),
  ])];
}

test('a distributor never wins a studio spotlight, however much it stocks', () => {
  const c = buildPromoCampaign(['studio-spotlight:0'], studioLib(), ROWS, COLS)!;
  assert.equal(c.topper, 'STUDIO GHIBLI');
});

test('one subject shouts from all four sides', () => {
  const c = buildPromoCampaign(['studio-spotlight:0'], studioLib(), ROWS, COLS)!;
  assert.deepEqual(new Set(c.faces.map((f) => f.label)), new Set(['STUDIO GHIBLI']));
  c.faces.forEach((f) => assert.equal(f.movies.length, PER_FACE));
});

test('pick index selects a different studio, so two stands never collide', () => {
  const a = buildPromoCampaign(['studio-spotlight:0'], studioLib(), ROWS, COLS)!;
  const b = buildPromoCampaign(['studio-spotlight:1'], studioLib(), ROWS, COLS)!;
  assert.notEqual(a.topper, b.topper);
});

test('a studio too thin for a whole stand is not viable', () => {
  const libs = [lib('Movies', Array.from({ length: 8 }, (_, i) =>
    mk(`Ghibli ${i}`, { studios: ['Studio Ghibli'] })))];
  assert.equal(buildPromoCampaign(['studio-spotlight:0'], libs, ROWS, COLS), null);
});

// ─── seasonal + the rating split ────────────────────────────────────────────

function halloweenLibs(): JellyfinLibrary[] {
  return [lib('Movies', [
    ...Array.from({ length: 20 }, (_, i) =>
      mk(`Family Spooky ${i}`, { rating: 'PG', overview: 'A friendly witch and a haunted house.' })),
    ...Array.from({ length: 20 }, (_, i) =>
      mk(`Slasher ${i}`, { rating: 'R', genres: ['Horror'] })),
    ...Array.from({ length: 20 }, (_, i) =>
      mk(`Teen Chiller ${i}`, { rating: 'PG-13', genres: ['Horror'] })),
  ])];
}

// promoToday() reads localStorage; node has none, so stub the minimum surface.
function withMonth(iso: string, fn: () => void) {
  const g = globalThis as { localStorage?: unknown };
  const had = 'localStorage' in g;
  const prev = g.localStorage;
  g.localStorage = { getItem: (k: string) => (k === 'bb_promo_date' ? iso : null) };
  try { fn(); } finally {
    if (had) g.localStorage = prev; else delete g.localStorage;
  }
}

test('the family stand carries NO adult or teen ratings', () => {
  withMonth('2026-10-15', () => {
    const c = buildPromoCampaign(['seasonal:family'], halloweenLibs(), ROWS, COLS)!;
    assert.equal(c.topper, 'FAMILY FRIGHTS');
    const bands = new Set(c.faces.flatMap((f) => f.movies.map(ratingBand)));
    assert.deepEqual(bands, new Set(['family']));
  });
});

test('the horror stand carries no family ratings, and does take teen', () => {
  withMonth('2026-10-15', () => {
    const c = buildPromoCampaign(['seasonal:adult'], halloweenLibs(), ROWS, COLS)!;
    assert.equal(c.topper, 'HALLOWEEN HORROR');
    const bands = new Set(c.faces.flatMap((f) => f.movies.map(ratingBand)));
    assert.ok(!bands.has('family'));
    assert.ok(bands.has('adult'));
  });
});

test('an unrated title is kept OFF the family stand, not guessed onto it', () => {
  withMonth('2026-10-15', () => {
    const libs = [lib('Movies', [
      ...Array.from({ length: 20 }, (_, i) =>
        mk(`Family Spooky ${i}`, { rating: 'PG', overview: 'A friendly witch.' })),
      ...Array.from({ length: 20 }, (_, i) =>
        mk(`Unrated Spooky ${i}`, { rating: 'NR', overview: 'A haunted house.' })),
    ])];
    const c = buildPromoCampaign(['seasonal:family'], libs, ROWS, COLS)!;
    const titles = c.faces.flatMap((f) => f.movies.map((m) => m.title));
    assert.ok(!titles.some((t) => t.startsWith('Unrated')));
  });
});

test('an unsplit season declines the adult stand rather than duplicating its sign', () => {
  withMonth('2026-07-15', () => {
    const libs = [lib('Movies', Array.from({ length: 40 }, (_, i) =>
      mk(`Summer Hit ${i}`, { genres: ['Action'] })))];
    const family = buildPromoCampaign(['seasonal:family'], libs, ROWS, COLS)!;
    assert.equal(family.topper, 'SUMMER SMASH HITS');
    assert.equal(buildPromoCampaign(['seasonal:adult'], libs, ROWS, COLS), null);
  });
});

test('an unsplit season is NOT rating-filtered — it is one promotion', () => {
  withMonth('2026-07-15', () => {
    const libs = [lib('Movies', [
      ...Array.from({ length: 20 }, (_, i) => mk(`PG ${i}`, { rating: 'PG', genres: ['Action'] })),
      ...Array.from({ length: 20 }, (_, i) => mk(`R ${i}`, { rating: 'R', genres: ['Action'] })),
    ])];
    const c = buildPromoCampaign(['seasonal:family'], libs, ROWS, COLS)!;
    const bands = new Set(c.faces.flatMap((f) => f.movies.map(ratingBand)));
    assert.ok(bands.has('adult') && bands.has('family'));
  });
});

test('out of season, the seasonal campaign is simply not viable', () => {
  withMonth('2026-03-15', () => {
    assert.equal(buildPromoCampaign(['seasonal:family'], halloweenLibs(), ROWS, COLS), null);
  });
});

// ─── the chain ──────────────────────────────────────────────────────────────

test('the chain falls through to the first viable campaign', () => {
  withMonth('2026-03-15', () => {
    const libs = [lib('Movies', [
      ...watched('Movies', 40),
      ...Array.from({ length: 20 }, (_, i) => mk(`Ghibli ${i}`, { studios: ['Studio Ghibli'] })),
    ])];
    // Out of season, so seasonal declines and recently-played takes it.
    const c = buildPromoCampaign(['seasonal:family', 'recently-played', 'studio-spotlight:0'], libs, ROWS, COLS)!;
    assert.equal(c.topper, 'PREVIOUSLY VIEWED');
  });
});

test('a library too thin for anything builds no stand at all', () => {
  const libs = [lib('Movies', [mk('A'), mk('B')])];
  assert.equal(
    buildPromoCampaign(['recently-played', 'seasonal:family', 'studio-spotlight:0'], libs, ROWS, COLS),
    null,
  );
});

test('every viable campaign fills every slot of every face', () => {
  withMonth('2026-10-15', () => {
    const libs = [lib('Movies', [
      ...watched('Movies', 40),
      ...halloweenLibs()[0].movies,
      ...studioLib()[0].movies,
    ])];
    for (const chain of [['recently-played'], ['seasonal:family'], ['seasonal:adult'], ['studio-spotlight:0']]) {
      const c = buildPromoCampaign(chain, libs, ROWS, COLS);
      assert.ok(c, `${chain} should be viable`);
      assert.equal(c!.faces.length, PROMO_FACE_COUNT);
      c!.faces.forEach((f) => {
        assert.equal(f.movies.length, PER_FACE, `${chain} left a face short`);
        assert.ok(f.movies.every(Boolean), `${chain} left a hole`);
      });
    }
  });
});
