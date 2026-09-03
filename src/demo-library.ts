// Synthetic placeholder catalog shared by the visual-verification harness
// (harness.html) and the public demo build (src/demo-mode.ts), so the 3D
// store can be stocked and exercised without a Jellyfin/Romm server.
import { Episode, JellyfinLibrary, Movie } from './jellyfin';
import { assetUrl } from './asset-url';
import { getDismissedTitleIds } from './jellyseerr';
import { fetchGamesFromSnapshot } from './games-snapshot.ts';

const GENRES = ['Drama', 'Comedy', 'Horror', 'Sci-Fi', 'Action', 'Family', 'Foreign', 'Documentary', 'Anime'];

// Poster art for the synthetic library: 42 genuinely-free one-sheets —
// public-domain film posters (pre-1930 or documented US copyright lapse) plus
// the Blender Foundation open-movie posters (CC-BY) — every file's source and
// license is recorded in public/demo-posters/ATTRIBUTION.md. Rotating through
// a big varied pool makes the synthetic shelves read like a stocked store.
// The demo titles the art decorates are synthetic and unrelated to the
// depicted films. `demoPoster(i)` picks one deterministically by slot index so
// a given synthetic title is stable across boots. Hand-ordered so neighboring
// slots contrast (era/palette). Real in-app fallbacks still use
// latest_movie_poster.png.
const DEMO_POSTERS = [
  'demo-posters/metropolis.jpg',
  'demo-posters/night-living-dead.jpg',
  'demo-posters/big-buck-bunny.jpg',
  'demo-posters/his-girl-friday.jpg',
  'demo-posters/caligari.jpg',
  'demo-posters/plan-9.jpg',
  'demo-posters/gold-rush.jpg',
  'demo-posters/white-zombie.jpg',
  'demo-posters/sintel.jpg',
  'demo-posters/meet-john-doe.jpg',
  'demo-posters/lost-world.jpg',
  'demo-posters/doa.jpg',
  'demo-posters/gullivers-travels.jpg',
  'demo-posters/potemkin.jpg',
  'demo-posters/the-terror.jpg',
  'demo-posters/tears-of-steel.jpg',
  'demo-posters/safety-last.jpg',
  'demo-posters/charade.jpg',
  'demo-posters/hunchback.jpg',
  'demo-posters/hitch-hiker.jpg',
  'demo-posters/cosmos-laundromat.jpg',
  'demo-posters/wings.jpg',
  'demo-posters/detour.jpg',
  'demo-posters/phantom-opera.jpg',
  'demo-posters/my-man-godfrey.jpg',
  'demo-posters/brain-wouldnt-die.jpg',
  'demo-posters/the-general.jpg',
  'demo-posters/beat-the-devil.jpg',
  'demo-posters/elephants-dream.jpg',
  'demo-posters/star-is-born-1937.jpg',
  'demo-posters/carnival-of-souls.jpg',
  'demo-posters/the-kid.jpg',
  'demo-posters/cyrano.jpg',
  'demo-posters/sunrise.jpg',
  'demo-posters/teenagers-outer-space.jpg',
  'demo-posters/front-page.jpg',
  'demo-posters/coffee-run.jpg',
  'demo-posters/steamboat-bill.jpg',
  'demo-posters/the-stranger.jpg',
  'demo-posters/great-train-robbery.jpg',
  'demo-posters/college.jpg',
  'demo-posters/son-of-sheik.jpg',
];
export const demoPoster = (i: number) =>
  assetUrl(DEMO_POSTERS[((i % DEMO_POSTERS.length) + DEMO_POSTERS.length) % DEMO_POSTERS.length]);

export interface DemoLibraryOptions {
  /**
   * Suppress the every-12th-slot synthetic series. A library containing ANY
   * series is laid out un-sectioned (see StorePlan.buildLibraryLayouts), so
   * this is the only way the harness can exercise the categorized shelves
   * (signboard sections, overview category cursors) that real movie-only
   * Jellyfin libraries get.
   */
  noSeries?: boolean;
}

// Deterministic per-library TMDB-id blocks for ordinary synthetic titles, so
// the staff-picks engine (watch-history recommendations) has real join keys
// without a Jellyseerr server. Kept clear of the discovery block (500000+) and
// the collection-gap block (900000+).
const DEMO_TMDB_BASE: Record<string, number> = {
  'Movies': 100000,
  'Animated Movies': 200000,
  'Anime': 300000,
};
const demoTmdbId = (libName: string, i: number) => (DEMO_TMDB_BASE[libName] ?? 400000) + i;

// ── Plausible demo copy ──────────────────────────────────────────────────────
// The synthetic catalog is what public-demo visitors actually read when they
// flip a case, so the box-back copy has to read like a rental sleeve, not a
// test rig. Everything stays deterministic by slot and the TITLES stay
// synthetic ("Movies Title 3" — harness checkpoints key on them); only the
// prose and people are dressed. The director/actor pools keep the exact
// modulo shapes the discovery stock mirrors, so recommend-why's overlap
// cascade ("X also directed ..., on your shelf") still earns its reasons.
const DEMO_DIRECTORS = [
  'Rita Vasquez', 'Howard Bell', 'Sofia Andrade', 'Gene Parker',
  'Nadia Osei', 'Frank Delgado', 'June Nakamura',
];
const DEMO_ACTORS = [
  'Marla Quinn', 'Desmond Cole', 'Ivy Talmadge', 'Ray Okafor', 'Bea Winslow',
  'Chet Harmon', 'Lupe Ferrer', 'Ollie Grange', 'Tessa Marsh', 'Vic Antonelli',
  'Prue Callahan', 'Emil Vance', 'Dot Kaminski', 'Silas Roan', 'Greta Lund',
  'Art Pemberton', 'Noor Haddad', 'Cy Buckland', 'Fern Aldous', 'Theo Marsh',
  'Wanda Sloane', 'Gus Trevino', 'Lita Moreau', 'Bram Holt', 'Effie Stark',
];
export const demoDirector = (i: number) => DEMO_DIRECTORS[i % DEMO_DIRECTORS.length];
export const demoActors = (i: number, n = 5) =>
  Array.from({ length: n }, (_, a) => DEMO_ACTORS[(i + a * 3) % DEMO_ACTORS.length]);

// Two sleeve blurbs per genre, cycled by slot — genre-appropriate so the copy
// never argues with the shelf section it's filed under.
const GENRE_BLURBS: Record<string, string[]> = {
  'Drama': [
    'A drifter comes home to a town that would rather forget him, and one long summer forces the question everyone has been avoiding.',
    'Two sisters inherit a failing roadside diner and a box of letters that rewrites everything they knew about their mother.',
  ],
  'Comedy': [
    'A wedding, a borrowed car, and the world’s least qualified best man. Nothing goes to plan, least of all the speech.',
    'When a small-town mayor accidentally hires two rival catering families for the centennial, the potato salad becomes political.',
  ],
  'Horror': [
    'The house at the end of Larch Street has been empty for thirty years. The new tenants are about to learn why the rent is so low.',
    'A night-shift radio host takes one last call after sign-off. The voice on the line knows things it should not.',
  ],
  'Sci-Fi': [
    'A deep-relay engineer intercepts a signal that left Earth forty years ago — in her own voice.',
    'The colony ship woke its crew two centuries early. Something else on board has been awake the whole time.',
  ],
  'Action': [
    'One retired courier. One last package. Every crew in the city wants what’s in the case, and none of them know he kept the keys.',
    'A mountain rescue turns into a manhunt when the man they pulled from the ice opens his eyes and starts running.',
  ],
  'Family': [
    'A stray dog, a paper route, and the best summer a kid ever had. Bring the whole family — and maybe a tissue.',
    'When Grandpa’s old carnival comes out of storage, three cousins have one week to make it shine again.',
  ],
  'Foreign': [
    'A quiet portrait of a harbor town between seasons — the year the fishing boats stayed in and the letters stopped coming.',
    'Two strangers share a night train across the border and trade the one story each of them never tells.',
  ],
  'Documentary': [
    'Four decades of one neighborhood’s corner store, told by the people who grew up in its aisles.',
    'The unlikely history of a mountain radio station that refused to sign off, in the voices of everyone who kept it on the air.',
  ],
  'Anime': [
    'A courier girl and her grumpy mechanical bird carry the last letter across a sky full of pirates.',
    'After the academy falls, a first-year swordsman and his rival must share one blade — and one destiny.',
  ],
};
const demoOverview = (i: number, genre: string): string => {
  const pool = GENRE_BLURBS[genre] ?? GENRE_BLURBS['Drama'];
  return pool[Math.floor(i / GENRES.length) % pool.length];
};

// Synthetic watch history: every 5th slot (offset 2) is a title "you've
// watched", with a deterministic recency spread. Chosen not to collide with
// the SAGA slots (3/40/58/76) so the collection-gap flow stays untouched, and
// spanning all 9 genres as i cycles so several genres earn recommendations.
const demoWatchState = (i: number): Pick<Movie, 'played' | 'playCount' | 'lastPlayedDate'> =>
  i % 5 === 2
    ? {
        played: true,
        playCount: 1 + (i % 3),
        lastPlayedDate: new Date(2026, 0, 1 + (i % 180)).toISOString(),
      }
    : {};

// Promo-campaign fodder for the four-sided floor stands (see
// promo-campaigns.ts). The stands select on `studios`, on the content RATING
// band, and on seasonal subject matter — none of which a uniformly PG-13,
// studio-less synthetic library has, so the studio and seasonal campaigns would
// have nothing to pick and every stand would fall through to PREVIOUSLY VIEWED.
//
// Deterministic by slot, and expressed ONLY through `studios`/`rating`/
// `genres`/`overview` — never the title, which every harness checkpoint keys
// on ("Movies Title 3" must stay "Movies Title 3").
// Fictional studios (matched by their own PROMO_STUDIOS entries) so the
// public demo lights the studio stand without showing any real mark.
const DEMO_PROMO_STUDIOS = ['Greenglass Animation', 'Starbarrow Animation', 'Wanderlark Pictures', 'Hollowlight Films'];

const demoPromoTraits = (i: number): Partial<Movie> => {
  const traits: Partial<Movie> = {};
  // 3 in every 7 titles carry a promo-worthy studio, cycling 4 of them: in a
  // 200-title library that's ~21 each, comfortably over the 12 a stand needs.
  // Deliberately mod 7, not mod 3 — mod 3 is exactly the `is4k` set, so every
  // studio stand came out an all-4K shelf of the same few demo posters.
  if (i % 7 < 3) traits.studios = [DEMO_PROMO_STUDIOS[Math.floor(i / 7) % DEMO_PROMO_STUDIOS.length]];
  // A rating spread, and seasonal subject matter in BOTH bands — the whole
  // point of the split is that the family stand and the horror stand are
  // separately verifiable.
  switch (i % 9) {
    case 2:
    case 6:
      traits.rating = 'R'; // general adult stock, ordinary genres
      break;
    case 4:
      traits.rating = 'PG';
      traits.overview = 'A friendly witch and a haunted house full of very polite monsters. The whole family is invited — the ghosts insist.';
      break;
    case 7:
      traits.rating = 'R';
      traits.genres = ['Horror'];
      traits.overview = 'A haunted cabin, a graveyard, and something with a machete. Six went up the mountain; the phone lines came down first.';
      break;
  }
  // December stock, in both bands too — without it the holiday campaigns have
  // nothing to select and the stands silently fall through to a studio, which
  // looks identical to the calendar being broken.
  if (i % 11 === 3) {
    traits.rating = 'G';
    traits.overview = 'Santa, a reindeer, and one very earnest snowman save Christmas — with help from the loudest kid on Maple Street.';
  } else if (i % 11 === 8) {
    traits.rating = 'R';
    traits.overview = 'A Christmas party, a stolen sleigh, and nobody on the nice list. The office holiday bash goes spectacularly wrong.';
  }
  return traits;
};

// ── Synthetic franchise collections, for the COLLECTION ENDCAPS ─────────────
// The endcap at an aisle end (fixtures/collection-endcap.ts) needs a Jellyfin
// BoxSet with >= 4 owned titles; the three-member "Harness Saga" above is the
// collection-GAP fixture and deliberately stays below that bar. So the demo
// catalog also ships three INVENTED franchises — brand-free by construction,
// which is the whole point: the header card is typeset from the collection
// name, so a committed fallback must not carry anyone's trademark.
//
// Each belongs to ONE library, named per-collection. Real collections belong to
// one aisle, and spreading the same name across all three synthetic libraries
// would merge them into cross-library box sets that no real Jellyfin ever
// produces. Three land in Movies and one in Animated Movies on purpose: the
// selector caps how many of a single library's aisle ends collections may take
// (collectionEndcapReservation + the per-library cap), so a second library is
// what proves the cross-library path in a store deep enough to show it.
//
// Each carries ONE genre for the whole set: a franchise is a franchise, and
// the shelf files a collection under its members' majority category
// (store-layout.ts collectionCategoryOf) — six members with six different
// genres would file the set by coin toss. Slots avoid the SAGA slots
// (3/40/58/76), the series slots (i % 12 === 5) and the low slots the harness
// checkpoints name ("Movies Title 0/1/3"), and stay under 48 so they all exist
// in the default --lib 200 harness store. Within one collection the slots also
// take DISTINCT residues mod the poster-pool size: demoPoster() cycles the
// pool by slot index, so an arithmetic run sharing a factor with the pool
// length would face out the same poster twice down the endcap and read as a
// rendering bug.
const DEMO_COLLECTIONS: {
  library: string;
  name: string;
  genre: string;
  slots: number[];
  titles: string[];
  years: number[];
}[] = [
  {
    library: 'Movies',
    name: 'Spy Saga Collection',
    genre: 'Action',
    slots: [6, 13, 20, 27, 34, 47],
    titles: [
      'Spy Saga: Cold Circuit', 'Spy Saga: Paper Moon', 'Spy Saga: The Vienna File',
      'Spy Saga: Long Fuse', 'Spy Saga: Dead Drop', 'Spy Saga: Last Courier',
    ],
    years: [1987, 1989, 1991, 1994, 1997, 1999],
  },
  {
    library: 'Movies',
    name: 'Starbound Collection',
    genre: 'Sci-Fi',
    slots: [7, 14, 21, 28, 35, 42],
    titles: [
      'Starbound', 'Starbound II: Deep Field', 'Starbound III: The Long Dark',
      'Starbound IV: Homecoming', 'Starbound: Origins', 'Starbound: Terminus',
    ],
    years: [1984, 1986, 1990, 1993, 1996, 2001],
  },
  {
    library: 'Movies',
    name: 'Night Precinct Collection',
    genre: 'Horror',
    slots: [9, 16, 23, 30, 37, 44],
    titles: [
      'Night Precinct', 'Night Precinct 2: Lockdown', 'Night Precinct 3: The Basement',
      'Night Precinct 4: Bad Shift', 'Night Precinct 5: Graveyard', 'Night Precinct: Reopened',
    ],
    years: [1981, 1983, 1985, 1988, 1992, 2000],
  },
  {
    library: 'Animated Movies',
    name: 'Sky Pirates Collection',
    genre: 'Family',
    slots: [12, 19, 26, 33, 46],
    titles: [
      'Sky Pirates', 'Sky Pirates: The Cloud Sea', 'Sky Pirates: Lantern Isle',
      'Sky Pirates: The Long Way Home', 'Sky Pirates: Windfall',
    ],
    years: [1986, 1988, 1991, 1995, 1998],
  },
];

function demoCollectionMember(i: number, libName: string): Movie | null {
  for (const coll of DEMO_COLLECTIONS) {
    if (coll.library !== libName) continue;
    const k = coll.slots.indexOf(i);
    if (k < 0) continue;
    const year = coll.years[k];
    return {
      id: `${libName}-${i}`,
      title: coll.titles[k],
      year,
      premiereDate: `${year}-06-15T00:00:00.0000000Z`,
      collectionName: coll.name,
      duration: '1h 45m',
      rating: 'PG-13',
      overview: `Part ${k + 1} of the ${coll.name.replace(/\s+Collection$/, '')} saga. ${demoOverview(i, coll.genre)}`,
      director: demoDirector(i),
      actors: demoActors(i),
      genres: [coll.genre],
      localPath: '',
      dateCreated: new Date(2000, 0, i % 365).toISOString(),
      is4k: false,
      posterUrl: demoPoster(i),
      backdropUrl: demoPoster(i),
      libraryName: libName,
      tmdbId: demoTmdbId(libName, i),
      ...demoWatchState(i),
    };
  }
  return null;
}

function makeMovie(i: number, libName: string, noSeries: boolean): Movie {
  const is4k = i % 3 === 0;
  // Every 12th title is a TV series so the season-boxset rendering (chunky
  // case, episode-list / play-season side panels) is verifiable without a
  // Jellyfin server. Series shelve into the TELEVISION category.
  const isSeries = !noSeries && i % 12 === 5;
  if (isSeries) {
    return {
      id: `${libName}-${i}`,
      title: `${libName} Series ${i}`,
      year: 1990 + (i % 30),
      duration: 'N/A',
      rating: 'TV-14',
      overview: 'The complete series, both seasons on one shelf. Sixteen episodes of appointment television, back when that meant being home by eight.',
      director: demoDirector(i),
      actors: demoActors(i),
      genres: [GENRES[i % GENRES.length]],
      localPath: '',
      dateCreated: new Date(2000, 0, i % 365).toISOString(),
      is4k: false,
      posterUrl: demoPoster(i),
      backdropUrl: demoPoster(i),
      libraryName: libName,
      isSeries: true,
    };
  }
  // Three alphabetically-scattered slots form one synthetic collection so the
  // grouped shelf order is verifiable without a Jellyfin server: they must
  // stand TOGETHER (filed under "<Lib> Harness Saga") in premiere order —
  // Return (1995) → Begins (1997) → Strikes Back (1999) — which differs from
  // their alphabetical order. "Harness Begins" is deliberately the genre
  // minority (Horror vs Action) to exercise the majority-category rule.
  // "Harness Gap" is the fourth member: the one the store DOESN'T have (see
  // jellyseerr.ts's fetchCollectionGaps). Its 1996 premiere forces it between
  // Return (1995) and Begins (1997), so a screenshot of the saga proves both
  // that a gap files chronologically rather than being appended, and that it
  // renders with a corner sticker and no backstock copies. Without a
  // Jellyseerr server the real pipeline yields nothing, so the harness
  // synthesizes it directly.
  const SAGA = [
    { slot: 3, title: 'Return of the Harness', year: 1995, genre: 'Action' },
    { slot: 40, title: 'Harness Begins', year: 1997, genre: 'Horror' },
    { slot: 76, title: 'The Harness Strikes Back', year: 1999, genre: 'Action' },
    { slot: 58, title: 'The Harness Gap', year: 1996, genre: 'Action', gap: true },
  ];
  // Franchise collections (the collection-endcap fodder) claim their slots
  // before the ordinary generator does.
  const collMember = demoCollectionMember(i, libName);
  if (collMember) return collMember;
  const saga = SAGA.find((s) => s.slot === i);
  if (saga) {
    return {
      id: `${libName}-${i}`,
      title: `${saga.title} (${libName})`,
      year: saga.year,
      premiereDate: `${saga.year}-06-15T00:00:00.0000000Z`,
      collectionName: `${libName} Harness Saga Collection`,
      duration: saga.gap ? 'N/A' : '1h 45m',
      rating: saga.gap ? 'NR' : 'PG-13',
      overview: saga.gap
        ? 'The one chapter of the saga this store doesn’t stock yet — ask at the counter and we’ll order it in.'
        : `A chapter of the Harness saga. ${demoOverview(i, saga.genre)}`,
      director: demoDirector(i),
      actors: demoActors(i),
      genres: [saga.genre],
      localPath: '',
      dateCreated: new Date(2000, 0, i % 365).toISOString(),
      is4k: false,
      posterUrl: demoPoster(i),
      backdropUrl: demoPoster(i),
      libraryName: libName,
      // A high rating on purpose: proves the gap suppresses backstock copies
      // by flag, not by failing the ratings threshold.
      ...(saga.gap
        ? { collectionGap: true, tmdbId: 900000 + i, communityRating: 9.4 }
        : { tmdbId: demoTmdbId(libName, i), ...demoWatchState(i) }),
    };
  }
  // Every other 4K title also carries a 1080p version, so the play-time
  // version picker (main.ts) is exercisable in demo mode / the harness
  // without a Jellyfin server.
  const versions = is4k && i % 6 === 0
    ? [
        { itemId: `${libName}-${i}`, label: '4K · HDR · HEVC · 54.4 GB', is4k: true, width: 3840, height: 2160 },
        { itemId: `${libName}-${i}`, mediaSourceId: `${libName}-${i}-1080p`, label: '1080p · H264 · 8.1 GB', is4k: false, width: 1920, height: 1080 },
      ]
    : undefined;
  return {
    id: `${libName}-${i}`,
    title: `${libName} Title ${i}${is4k ? ' (4K)' : ''}`,
    year: 1990 + (i % 30),
    duration: '1h 45m',
    rating: 'PG-13',
    overview: demoOverview(i, GENRES[i % GENRES.length]),
    director: demoDirector(i),
    actors: demoActors(i),
    genres: [GENRES[i % GENRES.length]],
    localPath: '',
    dateCreated: new Date(2000, 0, i % 365).toISOString(),
    is4k,
    posterUrl: demoPoster(i),
    backdropUrl: demoPoster(i),
    libraryName: libName,
    versions,
    tmdbId: demoTmdbId(libName, i),
    ...demoWatchState(i),
    ...demoPromoTraits(i),
  };
}

function makeLibrary(name: string, count: number, noSeries: boolean): JellyfinLibrary {
  // Same "not interested" contract as the real pipeline (fetchCollectionGaps):
  // a dismissed gap never synthesizes again — lets the harness verify the
  // persisted side of the dismissal across a reload.
  const dismissed = getDismissedTitleIds();
  const movies: Movie[] = [];
  for (let i = 0; i < count; i++) {
    const m = makeMovie(i, name, noSeries);
    if (m.collectionGap && typeof m.tmdbId === 'number' && dismissed.has(m.tmdbId)) continue;
    movies.push(m);
  }
  return { id: name, name, movies, genres: GENRES };
}

// The New Releases wall's feature tiers are rating-driven (criticRating >= 90
// takes a whole 6-column section; criticRating >= 90 AND communityRating >=
// 8.0 takes TWO adjacent sections), and synthetic titles otherwise carry no
// ratings at all. Deterministically promote the three newest non-series
// titles (same date-desc-then-title-desc ordering the wall derivation uses)
// so both tiers are visible/testable without a Jellyfin server: two
// double-features and one single-section super-feature.
function seedWallFeatureRatings(libraries: JellyfinLibrary[]): void {
  const byNewest = libraries
    .flatMap((l) => l.movies)
    .filter((m) => !m.isSeries)
    .sort((a, b) => {
      const dateA = a.dateCreated ? new Date(a.dateCreated).getTime() : 0;
      const dateB = b.dateCreated ? new Date(b.dateCreated).getTime() : 0;
      if (dateA !== dateB) return dateB - dateA;
      return b.title.localeCompare(a.title);
    });
  const tiers = [
    { criticRating: 96, communityRating: 8.8 }, // double-feature
    { criticRating: 93, communityRating: 8.2 }, // double-feature
    { criticRating: 91, communityRating: 7.3 }, // single-section super-feature
  ];
  tiers.forEach((t, i) => { if (byNewest[i]) Object.assign(byNewest[i], t); });
  console.log('[demo-library] wall feature seeds:',
    tiers.map((t, i) => `${byNewest[i]?.title} (${t.criticRating}/${t.communityRating})`).join(' | '));
}

/** The full synthetic store stock: Movies at `baseCount`, the other libraries scaled down. */
export function buildDemoLibraries(baseCount: number, opts: DemoLibraryOptions = {}): JellyfinLibrary[] {
  const noSeries = !!opts.noSeries;
  const libraries: JellyfinLibrary[] = [
    makeLibrary('Movies', baseCount, noSeries),
    makeLibrary('Animated Movies', Math.max(30, Math.round(baseCount * 0.69)), noSeries),
    makeLibrary('Anime', Math.max(30, Math.round(baseCount * 0.48)), noSeries),
  ];
  seedWallFeatureRatings(libraries);
  return libraries;
}

/**
 * Mocked-Jellyseerr trending/discovery stock: titles NOT in the synthetic
 * libraries, shelved inline as REQUEST-stickered cases and feeding the
 * clerk's "we don't have it yet, want me to order it?" suggestions.
 * Directors/actors deliberately draw from the same demoDirector/demoActors
 * pools as the library stock so recommend-why's cascade can earn specific
 * reasons ("Rita Vasquez also directed ..., on your shelf") instead of
 * falling through to the generic trending line.
 */
export function buildDemoDiscovery(count: number): Movie[] {
  const out: Movie[] = [];
  // A real trending/popular list mixes films already out with ones still
  // weeks away, and Jellyseerr hands both over with a full releaseDate (see
  // fetchDiscoverMovies). That date is what the counter COMING SOON board
  // sets its date column from (coming-soon-feed.ts), so the synthetic stock
  // carries the same mix instead of a bare year: every fourth title is still
  // unreleased, spread across the months ahead of whenever the harness runs.
  const STREET_SPREAD_DAYS = [9, 23, 24, 38, 66, 67, 95, 130, 161];
  const today = Date.now();
  for (let i = 0; i < count; i++) {
    const premiere = i % 4 === 1
      ? new Date(today + STREET_SPREAD_DAYS[(i >> 2) % STREET_SPREAD_DAYS.length] * 86400000)
      : new Date(Date.UTC(2020 + (i % 6), (i * 5) % 12, 1 + ((i * 7) % 27)));
    out.push({
      id: `discovery_${i}`,
      title: `Discovery Title ${i}`,
      year: premiere.getUTCFullYear(),
      premiereDate: premiere.toISOString(),
      duration: 'N/A',
      rating: 'NR',
      overview: 'Everyone’s asking about this one. We don’t have it on the shelf yet — say the word and we’ll order it in.',
      director: demoDirector(i),
      actors: demoActors(i, 3),
      genres: [GENRES[i % GENRES.length]],
      localPath: '',
      posterUrl: demoPoster(i + 3),
      communityRating: 6 + (i % 4),
      tmdbId: 500000 + i,
      discovery: true,
    });
  }
  return out;
}

// Mocked-Romm stock -- the VIDEO GAMES section without a Romm server.
// Stocks from the bundled snapshot with authentic titles and carton art (issue #147).
export function buildDemoGames(count: number = 60): Movie[] {
  return fetchGamesFromSnapshot(count);
}

/** Synthetic episodes for the series-boxset side panel (no Jellyfin server). */
export function makeSyntheticEpisodes(movie: Movie): Episode[] {
  const episodes: Episode[] = [];
  for (let s = 1; s <= 2; s++) {
    for (let e = 1; e <= 8; e++) {
      episodes.push({
        id: `${movie.id}_s${s}e${e}`,
        seriesId: movie.id,
        seriesName: movie.title,
        seasonNumber: s,
        episodeNumber: e,
        name: `Synthetic Episode ${e} of Season ${s}`,
        overview: 'A stranger’s letter opens an old case nobody in town wants reopened, and by the end of the hour the tidy version of the story has come apart in everyone’s hands.',
        path: '',
        runTimeTicks: 0,
        thumbUrl: demoPoster(s * 8 + e),
        seasonId: `${movie.id}_s${s}`,
        // Poster-aspect season primary (no Jellyfin; reuse a sample poster so
        // the season chip's 2:3 boxing is verifiable).
        seasonPrimaryUrl: demoPoster(s),
      });
    }
  }
  return episodes;
}
