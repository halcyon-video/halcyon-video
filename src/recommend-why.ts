// Why a recommendation is a recommendation.
//
// TMDB will happily tell you "people who liked Heat also liked these forty
// films". What it can't tell you is which of those forty is worth a card on
// the shelf edge, or what to write on the card. That's this module.
//
// The insight is that the "why" doesn't have to be GENERATED, it has to be
// TRUE and SPECIFIC. Every reason here is a join against the library you
// actually own: the same director as something on your shelf, an actor in
// several of your films, a collection you're one short of. A line that names
// a film you own ("Because you have HEAT") reads as insight; a line of
// generated prose about atmospheric intensity reads as filler. So there is no
// model here, local or otherwise — just a cascade that picks the strongest
// true fact available.
//
// Pure functions over plain data, no THREE import, so it runs under
// `node --test` with type stripping. Unit tests: npm run test:why
import type { Movie } from './jellyfin';

/** Reason rungs, strongest first — see explainRecommendation's cascade. */
export type WhyKind = 'collection' | 'director' | 'actor' | 'alsoLiked' | 'studio' | 'genre';

export interface Why {
  kind: WhyKind;
  /** One line for the shelf-talker card. Sentence case; the card renders it. */
  text: string;
  /** Title of the film you own that the reason hangs off, when there is one. */
  anchorTitle?: string;
}

/**
 * Inverted index over the titles you own. Built once per library sync and
 * reused for every recommendation, since the joins below are all lookups by
 * person/studio/collection name.
 *
 * Keys are casefolded; display strings come back off the Movie so the card
 * shows "Michael Mann", not "michael mann".
 */
export interface LibraryIndex {
  byDirector: Map<string, Movie[]>;
  byActor: Map<string, Movie[]>;
  byStudio: Map<string, Movie[]>;
  byCollection: Map<string, Movie[]>;
  genreCounts: Map<string, number>;
  /** Casefolded titles you own — stops a recommendation of what's on the shelf. */
  ownedTitles: Set<string>;
  total: number;
}

const norm = (s: string): string => s.trim().toLowerCase();

/** Jellyfin's placeholder when an item has no Director credit. */
const UNKNOWN_DIRECTOR = 'unknown director';

function push(map: Map<string, Movie[]>, key: string, movie: Movie): void {
  const k = norm(key);
  if (!k) return;
  const list = map.get(k);
  if (list) list.push(movie);
  else map.set(k, [movie]);
}

export function buildLibraryIndex(movies: Movie[]): LibraryIndex {
  const index: LibraryIndex = {
    byDirector: new Map(),
    byActor: new Map(),
    byStudio: new Map(),
    byCollection: new Map(),
    genreCounts: new Map(),
    ownedTitles: new Set(),
    total: 0,
  };

  for (const m of movies) {
    // Only things actually on the shelf count as evidence of taste. A
    // coming-soon or gap title is a title you DON'T have, so letting it into
    // the index would let a recommendation justify itself with another
    // recommendation.
    if (m.comingSoon || m.discovery || m.collectionGap || m.game) continue;

    index.total++;
    index.ownedTitles.add(norm(m.title));
    if (m.director && norm(m.director) !== UNKNOWN_DIRECTOR) push(index.byDirector, m.director, m);
    for (const actor of m.actors || []) push(index.byActor, actor, m);
    for (const studio of m.studios || []) push(index.byStudio, studio, m);
    if (m.collectionName) push(index.byCollection, m.collectionName, m);
    for (const genre of m.genres || []) {
      const g = norm(genre);
      if (g) index.genreCounts.set(g, (index.genreCounts.get(g) || 0) + 1);
    }
  }

  return index;
}

/** Most-recently-released first, so a reason cites the film you likeliest remember. */
function freshest(movies: Movie[]): Movie | undefined {
  if (movies.length === 0) return undefined;
  return movies.reduce((best, m) => ((m.year || 0) > (best.year || 0) ? m : best));
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/**
 * The strongest true thing that can be said about why `candidate` is on the
 * shelf-talker, or null if nothing connects it to the library at all (in which
 * case it doesn't deserve a card).
 *
 * `anchor` is the title the player is looking at — the film whose "customers
 * also rented" list produced this candidate. It's optional because the same
 * cascade drives context-free suggestions.
 *
 * Order is deliberate: a shared director is a better reason than the
 * collaborative-filtering signal that surfaced the candidate in the first
 * place, even though both are true. Specific beats statistical.
 */
export function explainRecommendation(
  candidate: Movie,
  index: LibraryIndex,
  anchor?: Movie
): Why | null {
  // 1. Completing a set you've started. Nothing beats this — the shelf itself
  //    already shows the hole.
  if (candidate.collectionName) {
    const owned = index.byCollection.get(norm(candidate.collectionName));
    if (owned && owned.length > 0) {
      const shortName = candidate.collectionName.replace(/\s+Collection$/i, '');
      return {
        kind: 'collection',
        text: `You have ${owned.length} of the ${shortName} ${plural(owned.length, 'film', 'films')}.`,
        anchorTitle: freshest(owned)?.title,
      };
    }
  }

  // 2. Same director as something on your shelf.
  if (candidate.director && norm(candidate.director) !== UNKNOWN_DIRECTOR) {
    const owned = index.byDirector.get(norm(candidate.director));
    if (owned && owned.length > 0) {
      const cite = freshest(owned)!;
      return {
        kind: 'director',
        text: `${candidate.director} also directed ${cite.title}, on your shelf.`,
        anchorTitle: cite.title,
      };
    }
  }

  // 3. A face you keep renting. One shared actor is a coincidence; two or
  //    more is a pattern worth pointing at.
  let bestActor: { name: string; owned: Movie[] } | null = null;
  for (const actor of candidate.actors || []) {
    const owned = index.byActor.get(norm(actor));
    if (owned && (!bestActor || owned.length > bestActor.owned.length)) {
      bestActor = { name: actor, owned };
    }
  }
  if (bestActor && bestActor.owned.length >= 2) {
    return {
      kind: 'actor',
      text: `${bestActor.name} is in ${bestActor.owned.length} films you own.`,
      anchorTitle: freshest(bestActor.owned)?.title,
    };
  }

  // 4. The collaborative signal that surfaced it. True but generic, so it
  //    ranks below anything that names a person.
  if (anchor) {
    return {
      kind: 'alsoLiked',
      text: `People who rented ${anchor.title} rented this too.`,
      anchorTitle: anchor.title,
    };
  }

  // 5. A studio you've bought into repeatedly (Ghibli, A24, Pixar).
  let bestStudio: { name: string; owned: Movie[] } | null = null;
  for (const studio of candidate.studios || []) {
    const owned = index.byStudio.get(norm(studio));
    if (owned && (!bestStudio || owned.length > bestStudio.owned.length)) {
      bestStudio = { name: studio, owned };
    }
  }
  if (bestStudio && bestStudio.owned.length >= 3) {
    return {
      kind: 'studio',
      text: `${bestStudio.name} made ${bestStudio.owned.length} of your films.`,
    };
  }

  // 6. Last resort: the shelf you spend your time in front of. Only worth
  //    saying when the count is high enough to sound like a habit.
  let bestGenre: { name: string; count: number } | null = null;
  for (const genre of candidate.genres || []) {
    const count = index.genreCounts.get(norm(genre)) || 0;
    if (count > 0 && (!bestGenre || count > bestGenre.count)) {
      bestGenre = { name: genre, count };
    }
  }
  if (bestGenre && bestGenre.count >= 5) {
    return {
      kind: 'genre',
      text: `You've got ${bestGenre.count} ${bestGenre.name} films already.`,
    };
  }

  // Nothing connects it to the library — better to show no card than a card
  // that says nothing.
  return null;
}

/** How much each rung is worth when ranking candidates against each other. */
const KIND_WEIGHT: Record<WhyKind, number> = {
  collection: 100,
  director: 60,
  actor: 40,
  alsoLiked: 20,
  studio: 15,
  genre: 5,
};

export interface Recommendation {
  movie: Movie;
  why: Why;
  score: number;
}

/**
 * Rank candidates and take the top `limit`, preferring a spread of reason
 * KINDS: three cards that all say "people who rented X rented this too" is a
 * worse shelf than one director card, one actor card and one also-liked, even
 * when the flat scores disagree. So a kind already used is penalised rather
 * than banned — it can still win if the alternatives are much weaker.
 *
 * Candidates you already own are dropped: TMDB's list doesn't know your shelf
 * by title, only by the ownership flags Jellyseerr stamps on it, and those go
 * stale between syncs.
 */
export function pickRecommendations(
  candidates: Movie[],
  index: LibraryIndex,
  anchor?: Movie,
  limit = 3
): Recommendation[] {
  const scored: Recommendation[] = [];
  for (const candidate of candidates) {
    if (index.ownedTitles.has(norm(candidate.title))) continue;
    if (anchor && candidate.tmdbId && candidate.tmdbId === anchor.tmdbId) continue;
    const why = explainRecommendation(candidate, index, anchor);
    if (!why) continue;
    // Audience rating breaks ties within a rung — a well-liked film by a
    // director you own beats an obscure one, but never outranks a whole rung.
    const rating = typeof candidate.communityRating === 'number' ? candidate.communityRating : 5;
    scored.push({ movie: candidate, why, score: KIND_WEIGHT[why.kind] + rating });
  }

  scored.sort((a, b) => b.score - a.score);

  const picked: Recommendation[] = [];
  const usedKinds = new Map<WhyKind, number>();
  const DIVERSITY_PENALTY = 25;
  while (picked.length < limit && scored.length > 0) {
    let bestIdx = 0;
    let bestAdjusted = -Infinity;
    for (let i = 0; i < scored.length; i++) {
      const seen = usedKinds.get(scored[i].why.kind) || 0;
      const adjusted = scored[i].score - seen * DIVERSITY_PENALTY;
      if (adjusted > bestAdjusted) {
        bestAdjusted = adjusted;
        bestIdx = i;
      }
    }
    const [chosen] = scored.splice(bestIdx, 1);
    usedKinds.set(chosen.why.kind, (usedKinds.get(chosen.why.kind) || 0) + 1);
    picked.push(chosen);
  }

  return picked;
}
