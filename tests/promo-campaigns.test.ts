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
  topStudiosInLibrary,
  featuredStudioPicks,
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

test('a stand never falls back to a DIFFERENT index\'s studio (issue #26, "duplicate facings")', () => {
  // Only ONE curated studio clears the viability floor in this library.
  const libs = [lib('Movies', Array.from({ length: 20 }, (_, i) =>
    mk(`Ghibli ${i}`, { studios: ['Studio Ghibli'] })))];
  assert.equal(buildPromoCampaign(['studio-spotlight:0'], libs, ROWS, COLS)!.topper, 'STUDIO GHIBLI');
  // Asking for the next index must DECLINE, not repeat index 0's studio.
  // Two stands whose chains list studio-spotlight:1 with a studio-spotlight:0
  // fallback (as promo-stand-front-right's config used to) would otherwise
  // both land on Studio Ghibli — the same tower shown twice in the store,
  // which is what the issue reported. See the CALLER CONTRACT note on
  // studioSpotlight() in promo-campaigns.ts and the fixed chain in
  // store-fixtures-config.ts.
  assert.equal(buildPromoCampaign(['studio-spotlight:1'], libs, ROWS, COLS), null);
});

test('every face of a studio stand is 9/9 with no title repeated ACROSS faces', () => {
  // Exactly at the viability floor: PROMO_FACE_COUNT * MIN_DISTINCT_PER_FACE
  // distinct titles for the whole studio, none to spare — de-duplication
  // under the most pressure it can be.
  const total = PROMO_FACE_COUNT * MIN_DISTINCT_PER_FACE;
  const libs = [lib('Movies', Array.from({ length: total }, (_, i) =>
    mk(`Thin ${i}`, { studios: ['Studio Ghibli'] })))];
  const c = buildPromoCampaign(['studio-spotlight:0'], libs, ROWS, COLS)!;
  assert.ok(c, 'a pool at exactly the viability floor should still be viable');
  assert.equal(c.faces.length, PROMO_FACE_COUNT);
  const seenAcrossFaces = new Set<string>();
  c.faces.forEach((f) => {
    assert.equal(f.movies.length, PER_FACE, 'every face must be 9/9 — a short face is the bug this replaced');
    // WITHIN a face, a short pool legitimately repeats down a column
    // (layoutFace) — that's documented, intentional behavior. What must
    // never happen is the SAME title landing on two DIFFERENT faces.
    new Set(f.movies.map((m) => m.id)).forEach((id) => {
      assert.ok(!seenAcrossFaces.has(id), `title ${id} appeared on more than one face`);
      seenAcrossFaces.add(id);
    });
  });
  assert.equal(seenAcrossFaces.size, total, 'all distinct titles used exactly once, across the 4 faces');
});

// ─── user-configurable studio picks (issue #26) ─────────────────────────────
// The old hardcoded PROMO_STUDIOS pick meant nothing to a library it had no
// curated entry for. featuredStudioPicks() reads the user's own choice
// (settings row "Featured Studios", localStorage key bb_studio_picks) off a
// menu built by topStudiosInLibrary — see promo-campaigns.ts for why handing
// that ranking to a human, rather than auto-selecting off it, is what keeps
// this from walking into the exact "distributor wins" trap PROMO_STUDIOS was
// created to avoid.

function withStudioPicks(picks: string, fn: () => void) {
  const g = globalThis as { localStorage?: unknown };
  const had = 'localStorage' in g;
  const prev = g.localStorage;
  g.localStorage = { getItem: (k: string) => (k === 'bb_studio_picks' ? picks : null) };
  try { fn(); } finally {
    if (had) g.localStorage = prev; else delete g.localStorage;
  }
}

test('with no saved picks, the curated list still guards against the distributor trap', () => {
  const libs = [lib('Movies', [
    ...Array.from({ length: 80 }, (_, i) => mk(`WB ${i}`, { studios: ['Warner Bros. Pictures'] })),
    ...Array.from({ length: 15 }, (_, i) => mk(`Ghibli ${i}`, { studios: ['Studio Ghibli'] })),
  ])];
  assert.equal(featuredStudioPicks().length, 0);
  const c = buildPromoCampaign(['studio-spotlight:0'], libs, ROWS, COLS)!;
  assert.equal(c.topper, 'STUDIO GHIBLI', 'Warner Bros has 5x the titles but is not curated');
});

test('saved picks override the curated list outright, ranked by title count', () => {
  const libs = [lib('Movies', [
    ...Array.from({ length: 15 }, (_, i) => mk(`A24 ${i}`, { studios: ['A24'] })),
    ...Array.from({ length: 20 }, (_, i) => mk(`BH ${i}`, { studios: ['Blumhouse Productions'] })),
  ])];
  withStudioPicks('A24, Blumhouse Productions', () => {
    assert.deepEqual(featuredStudioPicks(), ['A24', 'Blumhouse Productions']);
    const a = buildPromoCampaign(['studio-spotlight:0'], libs, ROWS, COLS)!;
    const b = buildPromoCampaign(['studio-spotlight:1'], libs, ROWS, COLS)!;
    assert.equal(a.topper, 'BLUMHOUSE PRODUCTIONS'); // 20 titles, biggest pool first
    assert.equal(b.topper, 'A24');
  });
});

test('a picked studio absent from the curated list still works — it is real user data, not a regex', () => {
  const libs = [lib('Movies', Array.from({ length: 15 }, (_, i) =>
    mk(`Indie ${i}`, { studios: ['Neon'] })))];
  withStudioPicks('Neon', () => {
    const c = buildPromoCampaign(['studio-spotlight:0'], libs, ROWS, COLS)!;
    assert.equal(c.topper, 'NEON');
  });
});

test('picks match the raw Studios field case-insensitively', () => {
  const libs = [lib('Movies', Array.from({ length: 15 }, (_, i) =>
    mk(`Indie ${i}`, { studios: ['neon'] })))];
  withStudioPicks('NEON', () => {
    const c = buildPromoCampaign(['studio-spotlight:0'], libs, ROWS, COLS)!;
    assert.equal(c.topper, 'NEON');
  });
});

test('a picked studio too thin for a whole stand is not viable, and does not fall back to a sibling pick', () => {
  const libs = [lib('Movies', [
    ...Array.from({ length: 8 }, (_, i) => mk(`Thin ${i}`, { studios: ['Small House'] })),
    ...Array.from({ length: 15 }, (_, i) => mk(`Big ${i}`, { studios: ['Big House'] })),
  ])];
  withStudioPicks('Small House, Big House', () => {
    // Big House (15) outranks Small House, but Small House (8) never clears
    // PROMO_FACE_COUNT * MIN_DISTINCT_PER_FACE and drops out of the scored
    // list entirely, so pick 1 must be null — not a second wrap of Big House.
    assert.equal(buildPromoCampaign(['studio-spotlight:0'], libs, ROWS, COLS)!.topper, 'BIG HOUSE');
    assert.equal(buildPromoCampaign(['studio-spotlight:1'], libs, ROWS, COLS), null);
  });
});

// ─── topStudiosInLibrary (the settings-row candidate menu) ─────────────────

test('top studios rank by distinct title count, most-represented first', () => {
  const libs = [lib('Movies', [
    ...Array.from({ length: 5 }, (_, i) => mk(`Small ${i}`, { studios: ['Small House'] })),
    ...Array.from({ length: 20 }, (_, i) => mk(`Big ${i}`, { studios: ['Big House'] })),
  ])];
  const top = topStudiosInLibrary(libs);
  assert.deepEqual(top.map((t) => t.name), ['Big House', 'Small House']);
  assert.equal(top[0].count, 20);
});

test('a movie shared across libraries counts once toward its studio', () => {
  const libs = [
    lib('Movies', [mk('Shared', { id: 'shared-1', studios: ['One Studio'] })]),
    lib('4K Movies', [mk('Shared (4K)', { id: 'shared-1', studios: ['One Studio'] })]),
  ];
  const top = topStudiosInLibrary(libs);
  assert.equal(top.find((t) => t.name === 'One Studio')?.count, 1);
});

test('studio names group case-insensitively, keeping one display casing', () => {
  const libs = [lib('Movies', [
    mk('A', { studios: ['A24'] }),
    mk('B', { studios: ['a24'] }),
    mk('C', { studios: ['A24'] }),
  ])];
  const top = topStudiosInLibrary(libs);
  assert.equal(top.length, 1);
  assert.equal(top[0].count, 3);
});

test('titles with no rental copy do not inflate a studio\'s count', () => {
  const libs = [lib('Movies', [mk('A', { studios: ['Ghost House'], collectionGap: true })])];
  assert.equal(topStudiosInLibrary(libs).length, 0);
});

test('the candidate menu is capped at `limit`', () => {
  const libs = [lib('Movies', Array.from({ length: 25 }, (_, i) =>
    mk(`T${i}`, { studios: [`Studio ${i}`] })))];
  assert.equal(topStudiosInLibrary(libs, 20).length, 20);
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

// ─── medium purity (owner feedback pin 054) ─────────────────────────────────

test('each promo face is single-medium (all movies or all TV shows)', () => {
  withMonth('2026-07-15', () => {
    const libs = [lib('Mixed', [
      ...Array.from({ length: 15 }, (_, i) => mk(`Summer Movie ${i}`, { genres: ['Action'], isSeries: false })),
      ...Array.from({ length: 3 }, (_, i) => mk(`Summer Show ${i}`, { genres: ['Action'], isSeries: true })),
    ])];
    const c = buildPromoCampaign(['seasonal:family'], libs, ROWS, COLS)!;
    assert.ok(c, 'campaign should be viable');
    assert.equal(c.faces.length, PROMO_FACE_COUNT);
    c.faces.forEach((f, idx) => {
      assert.equal(f.movies.length, PER_FACE, `face ${idx} must have ${PER_FACE} items`);
      const hasMovie = f.movies.some((m) => !m.isSeries);
      const hasShow = f.movies.some((m) => m.isSeries);
      assert.ok(!(hasMovie && hasShow), `face ${idx} must not mix movies and shows`);
    });
  });
});

test('if a medium cannot reach minimum distinct titles, campaign falls back rather than mixing', () => {
  withMonth('2026-07-15', () => {
    // 8 movies and 2 shows total: movies can fill at most 2 faces (8 < 3*3=9), shows can fill 0 faces (2 < 3).
    // Total pure faces possible is 2 < 4, so campaign must decline (return null) rather than mixing.
    const libs = [lib('Mixed', [
      ...Array.from({ length: 8 }, (_, i) => mk(`Summer Movie ${i}`, { genres: ['Action'], isSeries: false })),
      ...Array.from({ length: 2 }, (_, i) => mk(`Summer Show ${i}`, { genres: ['Action'], isSeries: true })),
    ])];
    const c = buildPromoCampaign(['seasonal:family'], libs, ROWS, COLS);
    assert.equal(c, null, 'campaign should return null rather than mixing mediums to fill a face');
  });
});

