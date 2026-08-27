// The store's floor-plan brain: decides what goes where. Sorts each library
// into the store wall categories (padded to whole signboard sections), hatches
// the floor with shelf runs for the active arrangement, pours every library's
// units into those runs, and owns the layout-space -> world-space transforms
// that the structure geometry, movie-box baking, and camera framing all read.
// Swap or subclass this to lay the store out completely differently — nothing
// in here touches THREE scene objects except the Vector3 rotation helper.
import type * as THREE from 'three';
import type { Movie, JellyfinLibrary } from './jellyfin.ts';
import {
  LIBRARY_X_SPACING, FIELD_Z_FRONT, CENTER_WALKWAY, AISLE_ANGLE, HERRINGBONE_AISLE_ANGLE, BOX_SPACING,
  MAX_SHELF_COLS, UNIT_CAPACITY, MAX_RUN_UNITS, RUN_BREAK_GAP, UNIT_SECTIONS,
  SECTION_CAPACITY, TINY_LIBRARY_MOVIES, MIN_CATEGORY_TITLES,
  STORE_CATEGORY_ORDER, shelfTitleCompare, sectionFillCopies, columnFillCount,
  collectionCategoryCandidates, shelfCategoryCandidatesOf,
  type LibraryLayout, type ArrangementId, type ShelvingUnit,
  type OverflowPolicy, DEFAULT_OVERFLOW_POLICY, isOverflowTitle,
  UNIT_DEPTH,
  baselineStorefrontWidth, baselineStoreDepth,
  STORE_CENTER_X, FRONT_GLASS_Z,
  // .ts extension (plus the `type` imports above/below): keeps this module
  // resolvable under plain `node --test` with type stripping, same as
  // store-layout.ts's own imports (see tests/store-plan.test.ts) — Node's
  // ESM loader needs an explicit extension for relative specifiers and can't
  // parse a real (non-type-only) import it would have to resolve at runtime
  // through a bare specifier like the un-stripped original.
} from './store-layout.ts';
import { activeStoreFormat } from './store-format.ts';
import type { Footprint } from './layout-validator.ts';

// The active store-format preset: what shape of store this is, as data. Every
// geometry rule the planner used to hardcode as a literal (wall margin, run
// length growth, width cap, how the floor is divided into fields) reads from
// here, so a new format is an entry in store-format.ts rather than another
// branch in this file. See that module's header.
const FORMAT = activeStoreFormat();

/**
 * One line-front run end that opens onto walkway — an endcap host site.
 * See StorePlan.openLineFrontEnds().
 */
export interface OpenRunEnd {
  unit: ShelvingUnit;
  /** Local Z of the unit's entrance-facing end face (endcap abutment plane). */
  frontLocalZ: number;
  /** Section label at THIS end of the run; null on un-categorized libraries. */
  genreLabel: string | null;
  /** World X of the end face — which shelving field (store centreline x=11). */
  worldX: number;
}

export class StorePlan {
  // Active floor arrangement. Decides each unit's yaw/browseSign (see runFields).
  // FORMAT wins over the user's pick when it declares one: a cramped store is
  // straight-only by construction (a tilted run sheds unusable floor at both
  // ends, and this format has no floor to shed), so bb_arrangement simply does
  // not apply there — see StoreFormatSpec.forcedArrangement.
  public arrangement: ArrangementId = FORMAT.forcedArrangement
    ?? (((typeof localStorage !== 'undefined' && localStorage.getItem('bb_arrangement')) as ArrangementId) || 'herringbone');

  // Where special-interest / documentary titles that don't warrant a headline
  // shelf category are surfaced (see OverflowPolicy). Default: on the display
  // stands. Persisted like `arrangement` so a reload keeps the same store.
  public overflowPolicy: OverflowPolicy =
    ((typeof localStorage !== 'undefined' && localStorage.getItem('bb_overflow')) as OverflowPolicy) || DEFAULT_OVERFLOW_POLICY;

  public shelvingUnits: ShelvingUnit[] = [];
  // Z of the back wall: a clear margin behind the deepest planned island.
  public backWallZ = -35.0;
  // Pivot Z for the diagonal aisle rotation (centre of the aisle cluster).
  public aislePivotZ = 0;

  private libraries: JellyfinLibrary[];
  private libraryLayouts: LibraryLayout[] = [];
  private libraryLayoutsBuilt = false;

  // Longest continuous shelf run (in units) for THIS store, derived alongside
  // the store width in computeDimensions(): bigger stores earn longer runs
  // (5-6 units) so the hatched rows fit the wider floor instead of wasting
  // depth on cross-aisle breaks. MAX_RUN_UNITS stays the small-store base.
  private maxRunUnits = MAX_RUN_UNITS;
  private cachedStoreWidth: number | null = null;

  // A plain field + assignment rather than a TypeScript constructor
  // parameter property: Node's `--experimental-strip-types` (the
  // node --test runner tests/*.test.ts use, no build step) can't parse that
  // shorthand (ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX), so it was the one thing
  // blocking this otherwise-pure module from plain-Node unit testing (see
  // tests/store-plan.test.ts, tests/clerk-nav.test.ts for the same pattern).
  // Behavior is identical.
  constructor(libraries: JellyfinLibrary[]) {
    this.libraries = libraries;
  }

  // Lay every freestanding unit out as part of a shared, floor-wide run: long
  // lines of units whose short ends touch, tilted to the active arrangement and
  // clipped to the room so corner runs are short and central runs long. Each unit
  // keeps its libraryIdx / unitIdxInLibrary so a library reads as a contiguous
  // segment of the runs, and the camera/box baking just follow each unit's stored
  // transform. This is the single source of truth for placement AND orientation.
  plan() {
    this.buildLibraryLayouts();
    this.planRuns();

    // Back wall sits a clear margin behind the deepest island so there is always
    // ~8ft of walking space between the last shelf and the wall. The FLOOR is
    // the window-spec baseline depth (store-layout.ts baselineStoreDepth):
    // depth = 2 × (corner margin + six 4-ft side panes) = 52.5 ft, so the side
    // window ribbons end exactly half way down the smallest store. Stock
    // overflow still deepens the store past this (the ribbon then re-quantizes
    // to whole panes as close to half-depth as it can — see three-scene.ts).
    let minZ = FRONT_GLASS_Z - baselineStoreDepth();
    const backClear = FORMAT.backAisleClearance;
    this.shelvingUnits.forEach(u => {
      const halfLen = ((u.cols - 1) * BOX_SPACING + 1.0) / 2;
      const backLocalZ = this.aisleZCenter(u) - halfLen;
      const cornerZ = this.unitToWorld(u, u.xCenter, backLocalZ).z;
      if (cornerZ - backClear < minZ) {
        minZ = cornerZ - backClear;
      }
    });
    this.backWallZ = minZ;

    // Pivot the diagonal aisle rotation about the centre of the aisle cluster so the
    // angled islands stay inside the room rather than swinging into the walls.
    this.aislePivotZ = (this.scaleZ(FIELD_Z_FRONT) + this.backWallZ) / 2;
  }

  // Nominal X centre of a library column before run planning (fallback only).
  columnXCenter(col: number, N: number): number {
    if (N <= 1) {
      return STORE_CENTER_X;
    }
    const rel = col - (N - 1) / 2;
    const side = rel < 0 ? -1 : 1;
    return STORE_CENTER_X + rel * LIBRARY_X_SPACING + side * (CENTER_WALKWAY / 2);
  }

  // X centre a library reads as: where its first island actually sits after the run
  // planner places it (libraries are contiguous segments of the shared runs, so they
  // no longer line up with a fixed column). Falls back to the nominal column.
  getLibraryXCenter(libraryIdx: number): number {
    const first = this.shelvingUnits.find(
      (u) => u.libraryIdx === libraryIdx && u.unitIdxInLibrary === 0
    );
    if (first) return first.xCenter;
    return this.columnXCenter(libraryIdx, this.libraries.length);
  }

  getStoreWidth(): number {
    if (this.cachedStoreWidth === null) this.computeDimensions();
    return this.cachedStoreWidth!;
  }

  // Total shelving-unit demand across every library — the exact per-library
  // formula planRuns() uses to build its pour queue (padded layout length, one
  // unit minimum), so the width estimate and the pour agree on the load.
  private totalPlannedUnits(): number {
    this.buildLibraryLayouts();
    let total = 0;
    for (let i = 0; i < this.libraries.length; i++) {
      total += Math.max(1, Math.ceil(this.layoutFor(i).entries.length / UNIT_CAPACITY));
    }
    return total;
  }

  // Pick the store width AND the max continuous-run length from the library
  // demand, so a growing collection widens the store (as if expanding a corner
  // outward) instead of only deepening it. The old fixed formula
  // (max(46, N*15+12)) is kept as the FLOOR so small/default stores are
  // byte-identical; from there the width steps up until the ESTIMATED world
  // depth stays in proportion (~0.9x) to it. Only an estimate is needed:
  // fillField() still self-deepens exactly as before, so any imprecision here
  // just nudges the aspect ratio, never breaks fit. Called lazily from
  // getStoreWidth() (three-scene reads the width before plan() runs) and
  // cached; buildLibraryLayouts() is deterministic, so plan() reuses the same
  // layouts instead of redoing the work.
  private computeDimensions() {
    const totalUnits = this.totalPlannedUnits();

    // Longer continuous runs for bigger stores. On the corporate box: ~20+
    // units -> 5, ~32+ -> 6, with MAX_RUN_UNITS (4) the small-store floor and 6
    // the ceiling. All three numbers are format data now, because a format's
    // run length is a statement about its floor: a mom-and-pop starts at 6 and
    // climbs to 10, since long unbroken runs down a narrow room are the whole
    // idea there, not a concession to a big store.
    this.maxRunUnits = Math.min(
      FORMAT.maxRunUnitsCap,
      Math.max(MAX_RUN_UNITS, MAX_RUN_UNITS + Math.floor(totalUnits / FORMAT.runGrowthPerUnits)),
    );

    // Estimate the world-space store depth a candidate width W implies, using
    // the same geometry fillField() hatches with (see runFields/fillField):
    // two side fields of width fieldW share the unit load; runs repeat at
    // pitch p; each unit occupies L along its run plus its amortized share of
    // the cross-aisle break gap.
    const margin = FORMAT.wallMargin; // runFields' wall margin
    const L = (MAX_SHELF_COLS - 1) * BOX_SPACING + 1.0; // unit length along the run
    // Run-to-run pitch (~8.43ft on the corporate box). A format that FORCES an
    // arrangement is estimated against that arrangement's own tilt — an
    // untilted mom-and-pop run steps a full runSpacing sideways, not
    // runSpacing·cos(35°), and estimating it at the diagonal's pitch would
    // under-count its depth by a fifth.
    const p = LIBRARY_X_SPACING * Math.cos(FORMAT.forcedArrangement === 'straight' ? 0 : AISLE_ANGLE);
    const lEff = L + RUN_BREAK_GAP / this.maxRunUnits;
    // Tilted fields never pack their whole area: runs clipped by the field
    // corners shed unusable stubs, and the one-library-boundary-per-run rule
    // leaves tail slack. ~0.85 matches what fillField actually achieves.
    const packEfficiency = 0.85;
    const estWorldDepth = (w: number): number => {
      // TOTAL hatchable width across every field — one field on a single-field
      // format, two flanking the central walkway otherwise. (Algebraically
      // identical to the old per-side `(w - 2m - walkway)/2` divided into
      // `2 * fieldW`, so the corporate estimate is unchanged to the digit.)
      const fieldW = w - 2 * margin - CENTER_WALKWAY;
      if (fieldW <= 0) return Infinity;
      const dLayout = (totalUnits * p * lEff) / (fieldW * packEfficiency); // layout-space field depth
      const backWallZ = this.scaleZ(FIELD_Z_FRONT - dLayout) - FORMAT.backAisleClearance; // see plan()
      return FRONT_GLASS_Z - backWallZ; // front glass sits at z=15
    };

    // Grow width from the window-spec baseline until depth ~tracks width,
    // hard-capped at 110ft — past that the store just gets deeper again.
    // The floor is baselineStorefrontWidth() (store-layout.ts): exactly
    // SIXTEEN 4-ft front panes (eight per wing) + the vestibule + the two 2.25 ft
    // corner margins — the small store is sized by its windows, not by an
    // arbitrary facade width (this replaced the old 90-ft reference floor).
    // Growth only ever ADDS whole panes: defaultWindowBays() floors the pane
    // count per wing and leaves the leftover as solid corner wall.
    const WIDTH_CAP = FORMAT.widthCap;
    let w = baselineStorefrontWidth();
    while (w < WIDTH_CAP && estWorldDepth(w) > FORMAT.depthToWidthRatio * w) w += 2.0;
    this.cachedStoreWidth = Math.min(w, WIDTH_CAP);
  }

  // The hatching fields for the active arrangement. Each field is a slab of floor
  // (xLo..xHi) whose runs all share one tilt + browse side. 'straight' and
  // 'diagonal' are a single field across the whole width; 'herringbone' splits at
  // the centreline so the two halves tilt toward each other into the classic "A".
  // FIELD ORDER IS POUR ORDER: planRuns() fills libraries into these fields
  // front-to-back of this array, so the RIGHT field comes first — library 0
  // (the main Movies library) stocks the right side of the store.
  private runFields(): { xLo: number; xHi: number; yaw: number; browseSign: number }[] {
    const storeWidth = this.getStoreWidth();
    // Keep shelves this far off the side walls: 7.5 ft on the corporate box
    // (increased from 6.0), 2.6 in a mom-and-pop — just enough to walk the end
    // of a run and turn into the next aisle.
    const margin = FORMAT.wallMargin;
    const lo = STORE_CENTER_X - storeWidth / 2 + margin;
    const hi = STORE_CENTER_X + storeWidth / 2 - margin;
    // A SINGLE-FIELD format hatches the whole floor as one slab with no central
    // walkway carved out of it, so the first run lands ON the store centreline
    // (fillField hatches outward from each field's own centre, and this field's
    // centre IS STORE_CENTER_X) — "one long shelf run down the middle", with
    // further runs appearing either side of it as the library grows. The tilt
    // still follows the arrangement, which such a format normally forces.
    if (FORMAT.singleField) {
      const yaw = this.arrangement === 'herringbone' ? Math.abs(HERRINGBONE_AISLE_ANGLE)
        : this.arrangement === 'diagonal' ? Math.abs(AISLE_ANGLE)
        : 0;
      return [{ xLo: lo, xHi: hi, yaw, browseSign: 1 }];
    }
    switch (this.arrangement) {
      case 'straight':
        return [
          { xLo: STORE_CENTER_X + CENTER_WALKWAY / 2, xHi: hi, yaw: 0, browseSign: 1 },
          { xLo: lo, xHi: STORE_CENTER_X - CENTER_WALKWAY / 2, yaw: 0, browseSign: 1 },
        ];
      case 'diagonal':
        return [
          { xLo: STORE_CENTER_X + CENTER_WALKWAY / 2, xHi: hi, yaw: Math.abs(AISLE_ANGLE), browseSign: 1 },
          { xLo: lo, xHi: STORE_CENTER_X - CENTER_WALKWAY / 2, yaw: Math.abs(AISLE_ANGLE), browseSign: 1 },
        ];
      case 'herringbone':
      default:
        return [
          { xLo: STORE_CENTER_X + CENTER_WALKWAY / 2, xHi: hi, yaw: Math.abs(HERRINGBONE_AISLE_ANGLE), browseSign: -1 },
          { xLo: lo, xHi: STORE_CENTER_X - CENTER_WALKWAY / 2, yaw: -Math.abs(HERRINGBONE_AISLE_ANGLE), browseSign: 1 },
        ];
    }
  }

  // Sort each library's titles into the classic wall categories,
  // padding every category to whole signboard sections so the section labels
  // line up with the stock. Tiny libraries stay as one un-sectioned run so they
  // flex onto shared shelves instead of getting mostly-empty category sections.
  private buildLibraryLayouts() {
    // Deterministic and (re)computed lazily: getStoreWidth() may need the
    // layouts before plan() runs, so guard against redoing the work.
    if (this.libraryLayoutsBuilt) return;
    this.libraryLayoutsBuilt = true;
    this.libraryLayouts = this.libraries.map((lib) => {
      // Dedupe by id first: a recursive Jellyfin query can return the same item
      // through multiple folder paths. Duplicate ids used to collapse in the
      // movie->slot lookup during rebuildMovieBoxes, leaving the extra slots
      // permanently hidden — titles silently missing from the shelves.
      const seenIds = new Set<string>();
      const movies = lib.movies
        .filter((m) => (seenIds.has(m.id) ? false : (seenIds.add(m.id), true)))
        .sort(shelfTitleCompare);
      const hasTvShows = movies.some((m) => m.isSeries);
      const fitsOnThreeUnits = movies.length <= 3 * UNIT_CAPACITY;
      // A games-only platform library (games-only.ts) or a streaming-service
      // library (streaming-catalog.ts, GH #86) never sections: their titles
      // carry no genres worth splitting a ~24-title aisle over, so every one
      // of them would file under GENERAL. Left uncategorized, each signboard
      // falls back to the library name — the platform, or the service
      // (shelving.ts) — which is the wayfinding each of those wants.
      if (lib.games || lib.streaming || hasTvShows || fitsOnThreeUnits || movies.length < TINY_LIBRARY_MOVIES) {
        // An un-sectioned run still lands row-major through sideEntrySlot, so a
        // title count that isn't a whole number of shelf columns leaves the
        // bottom tiers of the trailing columns as bare board. Top it up with
        // face-out copies of the run's own titles (never new ones).
        const colFill = sectionFillCopies(movies, columnFillCount(movies.length));
        return {
          entries: [...movies, ...colFill] as (Movie | null)[],
          sectionLabels: new Map<string, string>(),
          categorized: false,
        };
      }

      // Collection members adopt their collection's majority category (see
      // collectionCategoryMap) so a saga isn't split across category sections.
      const collectionCands = collectionCategoryCandidates(movies);
      const candidatesOf = new Map<Movie, string[]>();
      movies.forEach((m) => candidatesOf.set(m, shelfCategoryCandidatesOf(m, collectionCands)));

      // Which categories earn their own signboard section. Two things disqualify
      // one: too few titles to fill a section (MIN_CATEGORY_TITLES), or the
      // overflow policy (T08) — SPECIAL INTEREST (documentaries, sport, history…)
      // only earns a shelf section under 'dedicated-unit'; under 'display-stands'
      // (default) and 'general' those titles fold away and the display stands
      // surface them instead (see isOverflowTitle / the four-sided provider).
      //
      // A title files under its FIRST candidate that's still viable, so a film
      // tagged "History, Drama" prefers SPECIAL INTEREST but lands in the
      // existing DRAMA section once that fold happens — rather than in GENERAL,
      // which is meant for titles no section wants. Dissolving a category
      // redistributes its titles, which can push a borderline category over the
      // line, so iterate to a fixed point. The viable set only ever shrinks
      // (a dropped category draws no new titles), so this terminates.
      const banned = new Set<string>();
      if (this.overflowPolicy !== 'dedicated-unit') banned.add('SPECIAL INTEREST');
      const fileUnder = (m: Movie, viable: Set<string>): string =>
        candidatesOf.get(m)!.find((c) => viable.has(c)) ?? 'GENERAL';

      // Raw-genre categories (GH #117): candidates outside the classic wall
      // list. They enter the viability cascade like any named category — earn
      // MIN_CATEGORY_TITLES or fold into GENERAL — and section before GENERAL
      // in the shelf order below, alphabetical among themselves.
      const novelCats = new Set<string>();
      candidatesOf.forEach((cands) => cands.forEach((c) => {
        if (!STORE_CATEGORY_ORDER.includes(c)) novelCats.add(c);
      }));
      let viable = new Set([
        ...STORE_CATEGORY_ORDER.filter((c) => c !== 'GENERAL' && !banned.has(c)),
        ...novelCats,
      ]);
      for (;;) {
        const counts = new Map<string, number>();
        movies.forEach((m) => {
          const c = fileUnder(m, viable);
          if (c !== 'GENERAL') counts.set(c, (counts.get(c) ?? 0) + 1);
        });
        const next = new Set(
          [...counts].filter(([, n]) => n >= MIN_CATEGORY_TITLES).map(([c]) => c),
        );
        if (next.size === viable.size) break;
        viable = next;
      }

      const byCat = new Map<string, Movie[]>();
      movies.forEach((m) => {
        const c = fileUnder(m, viable);
        if (!byCat.has(c)) byCat.set(c, []);
        byCat.get(c)!.push(m);
      });
      if (!byCat.get('GENERAL')?.length) byCat.delete('GENERAL');

      const entries: (Movie | null)[] = [];
      const catRanges: { cat: string; start: number; end: number }[] = [];
      const sectionOrder = [...STORE_CATEGORY_ORDER];
      sectionOrder.splice(sectionOrder.indexOf('GENERAL'), 0, ...[...novelCats].sort());
      sectionOrder.forEach((cat) => {
        const list = byCat.get(cat);
        if (!list || list.length === 0) return;
        list.sort(shelfTitleCompare);
        const start = entries.length;
        // Stock the section tail with face-out COPIES of this category's own
        // titles rather than the bare `null`s it used to hold. A signboard
        // section is a fixed 6 x AISLE_SHELF_HEIGHTS.length grid, so a category
        // that doesn't happen to land on that multiple used to leave whole
        // shelf tiers as empty board — and the measured tier count (2026-07-30)
        // made that gap half again as wide. Real stores faced multiples of a
        // hot title instead, which is also what the store already does BEHIND
        // each box (extraCopiesCount) and along the New Releases wall rows.
        // Never a NEW title: sectionFillCopies only ever repeats `list`.
        // (Distinct Jellyfin entries of the same film — a 4K and an HD version
        // — are still collapsed to ONE box at sync time, see jellyfin.ts
        // collapseDuplicateVersions; these copies are deliberate stock depth,
        // not a duplicate catalog entry.)
        const padCount = (SECTION_CAPACITY - (list.length % SECTION_CAPACITY)) % SECTION_CAPACITY;
        entries.push(...list, ...sectionFillCopies(list, padCount));
        catRanges.push({ cat, start, end: entries.length });
      });

      // Label every SECTION_CAPACITY-case signboard section with its category, keyed by
      // GLOBAL section index (entry idx / SECTION_CAPACITY). Which physical
      // unit face a section lands on isn't known until units are placed;
      // consumers translate (unit, side) -> entry block via blockIndexOf()
      // and read sections UNIT_SECTIONS*block .. UNIT_SECTIONS*block+UNIT_SECTIONS-1.
      const sectionLabels = new Map<string, string>();
      for (const { cat, start, end } of catRanges) {
        for (let idx = start; idx < end; idx += SECTION_CAPACITY) {
          sectionLabels.set(String(Math.floor(idx / SECTION_CAPACITY)), cat);
        }
      }

      return { entries, sectionLabels, categorized: true };
    });
    this.logCollectionGapPlacements();
  }

  /**
   * Where every not-in-stock case ended up — missing collection entries AND
   * inline discovery suggestions. A handful of request cases scattered
   * through a few thousand shelved titles is genuinely hard to find on foot,
   * which makes "the feature is broken" and "you haven't walked past one yet"
   * look identical from inside the store. Naming them turns a hunt into a
   * walk to a known aisle.
   */
  private logCollectionGapPlacements() {
    const placements: string[] = [];
    this.libraryLayouts.forEach((layout, libIdx) => {
      const libName = this.libraries[libIdx]?.name ?? `library ${libIdx}`;
      layout.entries.forEach((m, idx) => {
        if (!m?.collectionGap && !m?.discovery) return;
        const section = layout.sectionLabels.get(String(Math.floor(idx / SECTION_CAPACITY)));
        const origin = m.collectionGap ? (m.collectionName ?? 'no collection') : 'trending suggestion';
        placements.push(`"${m.title}" (${libName}${section ? ` / ${section}` : ''}, ${origin})`);
      });
    });
    if (placements.length === 0) {
      console.log('[StorePlan] No not-in-stock cases were placed on any shelf.');
      return;
    }
    console.log(`[StorePlan] ${placements.length} not-in-stock case(s) shelved: ${placements.join('; ')}`);
  }

  layoutFor(libIdx: number): LibraryLayout {
    return this.libraryLayouts[libIdx] ?? { entries: [], sectionLabels: new Map(), categorized: false };
  }

  // The overflow titles (special interest / documentaries) across every library,
  // deduped by id, for a display stand's content-provider to face-out. This is the
  // 'display-stands' policy's surfacing path; under 'dedicated-unit' they instead
  // live on their own labeled shelf section and this simply returns the same set.
  // T09 hook: Jellyseerr suggestions could later be appended here as bonus filler.
  getOverflowMovies(): Movie[] {
    const seen = new Set<string>();
    const out: Movie[] = [];
    this.libraries.forEach((lib) => {
      lib.movies.forEach((m) => {
        if (isOverflowTitle(m) && !seen.has(m.id)) {
          seen.add(m.id);
          out.push(m);
        }
      });
    });
    return out;
  }

  // Switch overflow routing (persisted; caller decides how to rebuild).
  setOverflowPolicy(policy: OverflowPolicy) {
    this.overflowPolicy = policy;
    if (typeof localStorage !== 'undefined') localStorage.setItem('bb_overflow', policy);
    // The policy changes each library's padded layout, which the cached width/
    // maxRunUnits were derived from — recompute both on next use.
    this.libraryLayoutsBuilt = false;
    this.cachedStoreWidth = null;
  }

  // Build shelvingUnits by pouring every library's units, in library order,
  // into the hatched runs of each field. Libraries stay contiguous, so each one
  // reads as an unbroken segment of the shared runs. This is the ONLY place unit
  // placement AND orientation is decided.
  private planRuns() {
    const N = this.libraries.length;
    const queue: { lib: number; u: number }[] = [];
    for (let i = 0; i < N; i++) {
      // Padded layout length (not raw movie count): category padding claims
      // whole sections, so the units must be sized for the padded shelf order.
      const numUnits = Math.max(1, Math.ceil(this.layoutFor(i).entries.length / UNIT_CAPACITY));
      for (let u = 0; u < numUnits; u++) queue.push({ lib: i, u });
    }

    this.shelvingUnits = [];
    const fields = this.runFields();
    const totalWidth = fields.reduce((s, f) => s + (f.xHi - f.xLo), 0);
    let lineId = 0;
    let taken = 0;
    fields.forEach((field, fi) => {
      const share = (field.xHi - field.xLo) / totalWidth;
      let want = fi === fields.length - 1 ? queue.length - taken : Math.round(queue.length * share);
      if (fi < fields.length - 1 && want > 0 && taken + want < queue.length) {
        const splitIdx = taken + want;
        const splitLib = queue[splitIdx].lib;
        const prevLib = queue[splitIdx - 1].lib;
        if (splitLib === prevLib) {
          let libStart = splitIdx;
          while (libStart > taken && queue[libStart - 1].lib === splitLib) {
            libStart--;
          }
          let libEnd = splitIdx;
          while (libEnd < queue.length && queue[libEnd].lib === splitLib) {
            libEnd++;
          }
          let bestIdx = splitIdx;
          let minDiff = Infinity;
          if (libStart > taken) {
            const diff = Math.abs(libStart - splitIdx);
            if (diff < minDiff) {
              minDiff = diff;
              bestIdx = libStart;
            }
          }
          if (libEnd < queue.length) {
            const diff = Math.abs(libEnd - splitIdx);
            if (diff < minDiff) {
              minDiff = diff;
              bestIdx = libEnd;
            }
          }
          want = bestIdx - taken;
        }
      }
      const slice = queue.slice(taken, taken + want);
      taken += want;
      lineId = this.fillField(field, slice, lineId);
    });

    // Post-process shelvingUnits so each library's units are numbered in the
    // order a customer WALKS the floor. Within a line the visually-LEFT unit
    // comes first as seen from its browse side (posInLine ascending on normal
    // runs, descending on mirrored runs) — the browse snake then covers the
    // line's front faces left→right and its back faces on the return leg,
    // parking back at the unit it entered on. Lines start from the
    // depth-then-walkway-nearness reading order and are then POLISHED by a
    // small 2-opt/relocate pass that minimises the worst browse hop between
    // consecutive lines (hops measured entry-anchor to exit-anchor on the
    // real world-space geometry).
    //
    // Why the polish: ordering rows purely by front-edge depth reads fine for
    // a field of uniform full-width rows — which is what the RIGHT field
    // (library 0) usually is — but herringbone/diagonal fields always shed
    // short leftover corner runs, and depth-sorting those inserts a row
    // physically ~30ft across the field mid-sequence: browsing "jumps a
    // couple shelves across", which is what the LEFT field's smaller
    // libraries kept hitting. The optimizer has no side-specific cases, so
    // both fields read continuously, and it provably never makes the worst
    // hop longer than the plain reading order it starts from.
    const newShelvingUnits: ShelvingUnit[] = [];
    for (let libIdx = 0; libIdx < N; libIdx++) {
      const libUnits = this.shelvingUnits.filter(u => u.libraryIdx === libIdx);
      if (libUnits.length === 0) continue;

      // Group into lines by rowGroupId (not lineId): fillField() may have
      // poured one physical straight row as several lineId CHUNKS purely to
      // cap run length at maxRunUnits, and consecutive chunks sit only a
      // RUN_BREAK_GAP apart — a customer walking the row reads them as one
      // continuous run. Grouping by the shared rowGroupId keeps every chunk
      // of that row together through the reordering pass below, so the walk
      // order below can never insert an unrelated line between two chunks
      // that are physically flush (the "genre stops mid-row, resumes on a
      // different row" bug: a chunk's own continuation used to be treated as
      // an independent line the 2-opt could freely place anywhere else).
      // Order each line's units screen-left first, chunk order (lineId) then
      // posInLine within a chunk — lineId increases monotonically along a
      // row's own chunks, so this is the row's true physical order. On
      // mirrored runs (browseSign < 0) the browse side is viewed from the
      // other aisle, so the line's BACK/far end is the screen-left one.
      const lineMap = new Map<number, ShelvingUnit[]>();
      libUnits.forEach(u => {
        let arr = lineMap.get(u.rowGroupId);
        if (!arr) lineMap.set(u.rowGroupId, (arr = []));
        arr.push(u);
      });
      lineMap.forEach(arr =>
        arr.sort((a, b) => {
          if (a.browseSign < 0) {
            return a.lineId !== b.lineId ? b.lineId - a.lineId : b.posInLine - a.posInLine;
          }
          return a.lineId !== b.lineId ? a.lineId - b.lineId : a.posInLine - b.posInLine;
        }));

      // Base reading order: rows nearest the door first; same-depth ties go
      // to the row nearest the central walkway (browseSign-relative so it
      // mirrors correctly on both fields).
      const lines = Array.from(lineMap.values());
      const frontZ = (arr: ShelvingUnit[]) => Math.max(...arr.map(u => u.zPos));
      const nearX = (arr: ShelvingUnit[]) => Math.max(...arr.map(u => u.browseSign * u.xCenter));
      lines.sort((a, b) => {
        const za = frontZ(a), zb = frontZ(b);
        if (Math.abs(za - zb) > 0.01) return zb - za;
        return nearX(b) - nearX(a);
      });

      // Walk anchors: the browse camera enters a line at its start unit's
      // browse face and exits at that same unit's BACK face (the snake's
      // return leg ends where it began, one aisle over). ~4.9ft is the
      // browse-camera standoff; only relative distances matter here.
      const STANDOFF = 4.9;
      const anchorsOf = (arr: ShelvingUnit[]) => {
        const u = arr[0];
        const zc = this.aisleColZ(u, Math.floor(u.cols / 2), 'front');
        return {
          entry: this.unitToWorld(u, u.xCenter + u.browseSign * STANDOFF, zc),
          exit: this.unitToWorld(u, u.xCenter - u.browseSign * STANDOFF, zc),
        };
      };
      const anchors = lines.map(anchorsOf);
      const seed = { x: STORE_CENTER_X, z: this.scaleZ(FIELD_Z_FRONT) };
      const dist = (p: { x: number; z: number }, q: { x: number; z: number }) =>
        Math.hypot(p.x - q.x, p.z - q.z);
      // Cost = worst hop (dominant term) then total walk length; the
      // entrance→first-line leg counts toward the total only, keeping the
      // library's unit 0 near the door without treating that leg as a hop.
      const orderCost = (ord: number[]): number => {
        let mx = 0;
        let tot = dist(seed, anchors[ord[0]].entry);
        for (let i = 0; i + 1 < ord.length; i++) {
          const d = dist(anchors[ord[i]].exit, anchors[ord[i + 1]].entry);
          if (d > mx) mx = d;
          tot += d;
        }
        return mx * 1000 + tot;
      };
      let order = lines.map((_, i) => i);
      let best = orderCost(order);
      let improved = true;
      let guard = 0;
      while (improved && guard++ < 60) {
        improved = false;
        for (let i = 0; i < order.length; i++) {
          for (let j = i + 1; j < order.length; j++) {
            // 2-opt: reverse the segment [i..j].
            const rev = order.slice(0, i).concat(order.slice(i, j + 1).reverse(), order.slice(j + 1));
            const cr = orderCost(rev);
            if (cr < best - 1e-6) { order = rev; best = cr; improved = true; continue; }
            // or-opt: relocate line i to position j.
            const move = order.slice();
            const [x] = move.splice(i, 1);
            move.splice(j, 0, x);
            const cm = orderCost(move);
            if (cm < best - 1e-6) { order = move; best = cm; improved = true; }
          }
        }
      }

      let nextIdx = 0;
      order.forEach(li => {
        lines[li].forEach(u => {
          u.unitIdxInLibrary = nextIdx++;
          newShelvingUnits.push(u);
        });
      });
    }
    const otherUnits = this.shelvingUnits.filter(u => u.libraryIdx < 0 || u.libraryIdx >= N);
    newShelvingUnits.push(...otherUnits);
    this.shelvingUnits = newShelvingUnits;
  }

  // Clip the infinite line (ax,az)+t*(dx,dz) to the rectangle [xLo,xHi]x[zLo,zHi].
  // Returns the parameter range [tlo,thi] of the segment inside it, or null.
  private clipLine(
    ax: number, az: number, dx: number, dz: number,
    xLo: number, xHi: number, zLo: number, zHi: number
  ): { tlo: number; thi: number } | null {
    let tlo = -Infinity, thi = Infinity;
    const slab = (a: number, d: number, lo: number, hi: number): boolean => {
      if (Math.abs(d) < 1e-9) return a >= lo && a <= hi;
      let t1 = (lo - a) / d, t2 = (hi - a) / d;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tlo = Math.max(tlo, t1);
      thi = Math.min(thi, t2);
      return true;
    };
    if (!slab(ax, dx, xLo, xHi)) return null;
    if (!slab(az, dz, zLo, zHi)) return null;
    if (thi <= tlo) return null;
    return { tlo, thi };
  }

  // Hatch one field with parallel runs and pour `slice` units into them, front-most
  // run first. Returns the next free lineId. Sets each unit's centre on its run so
  // consecutive units join short-end to short-end.
  private fillField(
    field: { xLo: number; xHi: number; yaw: number; browseSign: number },
    slice: { lib: number; u: number }[],
    lineId: number
  ): number {
    if (slice.length === 0) return lineId;
    const L = (MAX_SHELF_COLS - 1) * BOX_SPACING + 1.0; // unit length along the run
    const yaw = field.yaw;
    const dx = -Math.sin(yaw), dz = -Math.cos(yaw); // front -> back along the run
    const nx = Math.cos(yaw), nz = -Math.sin(yaw);  // unit normal (run-to-run step)
    const p = LIBRARY_X_SPACING * Math.cos(yaw);    // pitch keeps the custom X-spacing
    const Zf = FIELD_Z_FRONT;                       // front edge of the island field
    const cx = (field.xLo + field.xHi) / 2;

    const runsFor = (Zb: number) => {
      const runs: { fx: number; fz: number; cap: number }[] = [];
      const coverage = (field.xHi - field.xLo) + (Zf - Zb);
      const kMax = Math.ceil(coverage / p) + 2;
      for (let k = -kMax; k <= kMax; k++) {
        const ax = cx + k * p * nx;
        const az = Zf + k * p * nz;
        const seg = this.clipLine(ax, az, dx, dz, field.xLo, field.xHi, Zb, Zf);
        if (!seg) continue;
        // Capacity accounts for the cross-aisle gap inserted after every
        // maxRunUnits units, so a single hatched line holds several short runs.
        const segLen = seg.thi - seg.tlo;
        let cap = 0;
        while ((cap + 1) * L + Math.floor(cap / this.maxRunUnits) * RUN_BREAK_GAP <= segLen) cap++;
        if (cap <= 0) continue;
        // Front end = inside-most point with the largest Z (smallest t, since dz<0
        // for any tilt; for a straight run tlo already lands on the Z=Zf edge).
        runs.push({ fx: ax + seg.tlo * dx, fz: az + seg.tlo * dz, cap });
      }
      // Pour order. Normally: deepest-fronted run first, then left to right.
      // On a SINGLE-FIELD format every straight run shares one front Z, so that
      // tie-break alone would stock the leftmost run first and leave the middle
      // of an almost-empty store bare. Order those from the centreline outward
      // instead, so the smallest store puts its one run down the middle and
      // each new run appears alternately either side of it.
      if (FORMAT.singleField) {
        runs.sort((a, b) =>
          (b.fz - a.fz)
          || (Math.abs(a.fx - cx) - Math.abs(b.fx - cx))
          || (a.fx - b.fx));
      } else {
        runs.sort((a, b) => (b.fz - a.fz) || (a.fx - b.fx));
      }
      return runs;
    };

    const canFitAll = (currentRuns: { fx: number; fz: number; cap: number }[]) => {
      let tempQi = 0;
      for (const run of currentRuns) {
        if (tempQi >= slice.length) break;
        let take = 0;
        let lastLib = -1;
        let uniqueLibs = 0;
        while (tempQi + take < slice.length && take < run.cap) {
          const itemLib = slice[tempQi + take].lib;
          if (itemLib !== lastLib) {
            if (uniqueLibs >= 2) {
              break;
            }
            lastLib = itemLib;
            uniqueLibs++;
          }
          take++;
        }
        tempQi += take;
      }
      return tempQi >= slice.length;
    };

    // Deepen the field until the hatched runs can hold the whole slice.
    let Zb = Zf - Math.max(12, slice.length * 2);
    let runs = runsFor(Zb);
    let guard = 0;
    while (!canFitAll(runs) && guard++ < 400) {
      Zb -= L;
      runs = runsFor(Zb);
    }

    let qi = 0;
    for (const run of runs) {
      if (qi >= slice.length) break;
      // Every chunk poured from THIS run is one physical straight row split
      // only by the maxRunUnits/RUN_BREAK_GAP bookkeeping below — tag them
      // all with the run's starting lineId so the walk-order pass can later
      // recognise the split and treat them as one line (see rowGroupId on
      // ShelvingUnit).
      const rowGroupId = lineId;
      let take = 0;
      let lastLib = -1;
      let uniqueLibs = 0;
      while (qi + take < slice.length && take < run.cap) {
        const itemLib = slice[qi + take].lib;
        if (itemLib !== lastLib) {
          if (uniqueLibs >= 2) {
            break;
          }
          lastLib = itemLib;
          uniqueLibs++;
        }
        take++;
      }
      const fzScaled = this.scaleZ(run.fz);
      const chunks = Math.ceil(take / this.maxRunUnits);
      for (let m = 0; m < take; m++) {
        const item = slice[qi++];
        // A cross-aisle gap is inserted before each new chunk so no continuous run
        // exceeds maxRunUnits units; each chunk is its own lineId with its own caps.
        const along = (m + 0.5) * L + Math.floor(m / this.maxRunUnits) * RUN_BREAK_GAP;
        const cxUnit = run.fx + along * dx;
        const czUnit = fzScaled + along * dz;
        const chunk = Math.floor(m / this.maxRunUnits);
        const idxInChunk = m % this.maxRunUnits;
        const chunkSize = Math.min(this.maxRunUnits, take - chunk * this.maxRunUnits);
        this.shelvingUnits.push({
          libraryIdx: item.lib,
          unitIdxInLibrary: item.u,
          cols: MAX_SHELF_COLS,
          lineId: lineId + chunk,
          posInLine: idxInChunk,
          isLineFront: idxInChunk === 0,
          isLineBack: idxInChunk === chunkSize - 1,
          rowGroupId,
          anchorX: run.fx,
          xCenter: cxUnit,
          // zPos is stored so aisleZCenter() recovers the run-centre Z exactly.
          zPos: czUnit - FIELD_Z_FRONT + L / 2,
          yaw,
          browseSign: field.browseSign,
        });
      }
      lineId += chunks;
    }
    return lineId;
  }

  // Switch the floor arrangement (persisted; caller decides how to rebuild).
  setArrangement(id: ArrangementId) {
    if (FORMAT.forcedArrangement) return; // this format lays out one way only
    this.arrangement = id;
    if (typeof localStorage !== 'undefined') localStorage.setItem('bb_arrangement', id);
  }

  // Depth (Z) of an aisle's centre, the point each island spins about. Islands run
  // front-to-back in layout space from Z=FIELD_Z_FRONT back over their length, so the centre is
  // half the run behind the front edge.
  aisleZCenter(unit: ShelvingUnit): number {
    const shelfLength = (unit.cols - 1) * BOX_SPACING + 1.0;
    return FIELD_Z_FRONT + unit.zPos - shelfLength / 2;
  }

  // Layout-space Z of a given column on an aisle shelf side. Column 0 must be
  // the screen-LEFT box of whichever face is being browsed, so the column
  // order is reflected whenever the viewer sees the run mirror-imaged: units
  // browsed from their -X face (browseSign < 0), and — because the back face
  // is viewed from the opposite aisle — the reverse of that on 'back' sides.
  // The reflection pivots on the unit's FULL physical width (unit.cols), so a
  // partially-filled mirrored face still packs flush to its screen-left end
  // and any unused columns trail off screen-right, exactly like a normal face.
  aisleColZ(unit: ShelvingUnit, col: number, side: 'front' | 'back' = 'front'): number {
    const mirrored = (unit.browseSign < 0) !== (side === 'back');
    const effCol = mirrored ? (unit.cols - 1 - col) : col;
    return FIELD_Z_FRONT + unit.zPos - 0.5 - effCol * BOX_SPACING;
  }

  // The order a customer WALKS a library — and therefore the order its
  // category-sorted entries flow onto shelf faces, one block of
  // UNIT_SIDE_CAPACITY entries per face: the first line's front faces
  // screen-left→right (ascending unit idx), around the deep end cap, that
  // line's back faces screen-left→right (the line REVERSED, since the back is
  // viewed from the opposite aisle), then the next line. The alphabet is
  // continuous around every gondola. Units are numbered in front reading
  // order by the post-sort in layoutStore, so line spans are contiguous
  // index runs. Grouped by rowGroupId (not lineId): fillField() can pour one
  // physical row as several lineId chunks (see rowGroupId), and planRuns()'s
  // walk-order pass keeps a row's chunks contiguous in this array, so
  // treating the whole rowGroupId run as one line here is what makes a
  // section's stock flow across the small RUN_BREAK_GAP instead of jumping to
  // whatever line the reorder happened to place next.
  entryBlockOrder(libIdx: number): { unit: number; side: 'front' | 'back' }[] {
    let order = this.blockOrderCache.get(libIdx);
    if (order) return order;
    order = [];
    const libUnits = this.shelvingUnits.filter(u => u.libraryIdx === libIdx);
    let s = 0;
    while (s < libUnits.length) {
      let e = s;
      while (e + 1 < libUnits.length && libUnits[e + 1].rowGroupId === libUnits[s].rowGroupId) e++;
      for (let u = s; u <= e; u++) order.push({ unit: u, side: 'front' });
      for (let u = e; u >= s; u--) order.push({ unit: u, side: 'back' });
      s = e + 1;
    }
    this.blockOrderCache.set(libIdx, order);
    return order;
  }
  private blockOrderCache = new Map<number, { unit: number; side: 'front' | 'back' }[]>();

  // Inverse of entryBlockOrder: which entry block a given physical unit face
  // holds. Falls back to the unit index for synthetic units (back wall etc.)
  // that aren't part of the plan.
  blockIndexOf(libIdx: number, unitIdx: number, side: 'front' | 'back'): number {
    const order = this.entryBlockOrder(libIdx);
    for (let b = 0; b < order.length; b++) {
      if (order[b].unit === unitIdx && order[b].side === side) return b;
    }
    return unitIdx;
  }

  scaleZ(z: number): number {
    return FRONT_GLASS_Z + 0.75 * (z - FRONT_GLASS_Z);
  }

  // Map a point from a unit's un-rotated "layout space" into world space by spinning
  // it about that unit's OWN centre (xCenter, zCenter) by the unit's stored yaw.
  // Rotating each island in place (rather than about one shared store pivot) keeps
  // every arrangement's units where they were placed, just turned to face the way the
  // arrangement asks. Used both to bake movie-box resting transforms and to frame the
  // camera, so boxes and camera always track the structure.
  unitToWorld(unit: ShelvingUnit, localX: number, localZ: number): { x: number, z: number } {
    const refX = unit.xCenter;
    const refZ = this.aisleZCenter(unit);
    const dx = localX - refX;
    const dz = localZ - refZ;
    const c = Math.cos(unit.yaw);
    const s = Math.sin(unit.yaw);
    return {
      x: refX + dx * c + dz * s,
      z: refZ - dx * s + dz * c,
    };
  }

  // Ground-plan footprint of every shelving aisle, for src/layout-validator.ts.
  // Each unit's local Z-length is the exact formula fillField()/aisleZCenter()
  // use ((cols-1)*BOX_SPACING + 1.0), centred on the unit's own (xCenter,
  // aisleZCenter) and turned by its own yaw — the same transform unitToWorld()
  // applies to bake movie-box resting positions.
  getUnitFootprints(): Footprint[] {
    return this.shelvingUnits.map((u, i) => ({
      label: `shelving:unit-${i}`,
      kind: 'shelving',
      cx: u.xCenter,
      cz: this.aisleZCenter(u),
      w: UNIT_DEPTH,
      d: (u.cols - 1) * BOX_SPACING + 1.0,
      yaw: u.yaw,
    }));
  }

  /**
   * Every line-front run end whose entrance-facing face opens onto REAL
   * walkway — i.e. every spot in the plan that can host an endcap.
   *
   * Pure floor-plan knowledge (footprints, unit transforms, section labels),
   * so it lives here rather than in either endcap selector: staff-picks genre
   * endcaps (store-clerk-flow.ts) and collection endcaps
   * (fixtures/collection-endcap.ts) must agree exactly on what a hostable run
   * end is, or the second one to run would place furniture into a walkway the
   * first one had already rejected.
   */
  openLineFrontEnds(): OpenRunEnd[] {
    const unitFootprints = this.getUnitFootprints();
    const insideAnyUnit = (px: number, pz: number, margin: number): boolean => {
      for (const fp of unitFootprints) {
        const dx = px - fp.cx, dz = pz - fp.cz;
        const c = Math.cos(fp.yaw), s = Math.sin(fp.yaw);
        const lx = dx * c - dz * s;
        const lz = dx * s + dz * c;
        if (Math.abs(lx) < fp.w / 2 + margin && Math.abs(lz) < fp.d / 2 + margin) return true;
      }
      return false;
    };

    const ends: OpenRunEnd[] = [];
    for (const u of this.shelvingUnits) {
      if (!u.isLineFront || u.libraryIdx < 0) continue;
      const frontLocalZ = FIELD_Z_FRONT + u.zPos;
      // Open-floor probe: a line-front at a CHUNK boundary has the next run
      // ~3 ft in front (RUN_BREAK_GAP) — furniture there would choke the
      // cross-aisle. Only ends with genuinely open floor qualify.
      const probe = this.unitToWorld(u, u.xCenter, frontLocalZ + 4.0);
      if (insideAnyUnit(probe.x, probe.z, 0.4)) continue;

      // The genre at THIS end of the run: front face's entry block holds
      // sections 2b and 2b+1; which one sits at the entrance end follows the
      // same mirroring rule as the column order (see aisleColZ).
      const layout = this.layoutFor(u.libraryIdx);
      let genreLabel: string | null = null;
      if (layout.categorized) {
        const b = this.blockIndexOf(u.libraryIdx, u.unitIdxInLibrary, 'front');
        const mirrored = u.browseSign < 0;
        genreLabel =
          // One entry block = UNIT_SECTIONS signboard sections. On a mirrored
          // run the section at THIS end of the unit is the block's last, not
          // its first; both are tried so a partly-filled block still labels.
          layout.sectionLabels.get(String(UNIT_SECTIONS * b + (mirrored ? UNIT_SECTIONS - 1 : 0))) ??
          layout.sectionLabels.get(String(UNIT_SECTIONS * b + (mirrored ? 0 : UNIT_SECTIONS - 1))) ??
          null;
      }

      ends.push({
        unit: u,
        frontLocalZ,
        genreLabel,
        worldX: this.unitToWorld(u, u.xCenter, frontLocalZ).x,
      });
    }
    return ends;
  }

  // Rotate a Vector3's X/Z about a unit's own centre in place (Y untouched). Used for
  // camera position / look-at when framing an island for that unit's arrangement.
  applyUnitRotation(v: THREE.Vector3, unit: ShelvingUnit): THREE.Vector3 {
    const w = this.unitToWorld(unit, v.x, v.z);
    v.x = w.x;
    v.z = w.z;
    return v;
  }
}
