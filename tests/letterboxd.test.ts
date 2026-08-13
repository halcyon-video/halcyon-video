// Letterboxd feed parsing. The fixture below is trimmed from a REAL feed
// pulled 2026-08-13, not written from the docs — the shape that matters most
// (half the items being lists, not films) is not something the documentation
// tells you, and a parser built on the docs invents anchors out of list names.
//
//   node --experimental-strip-types --test tests/letterboxd.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLetterboxdRss, pickLetterboxdAnchors } from '../src/letterboxd.ts';

const FEED = `<?xml version='1.0' encoding='utf-8'?>
<rss version="2.0" xmlns:letterboxd="https://letterboxd.com" xmlns:tmdb="https://themoviedb.org">
<channel>
<item> <title>The Odyssey, 2026 - ★★★★</title> <guid isPermaLink="false">letterboxd-watch-1447297802</guid> <letterboxd:watchedDate>2026-08-12</letterboxd:watchedDate> <letterboxd:rewatch>No</letterboxd:rewatch> <letterboxd:filmTitle>The Odyssey</letterboxd:filmTitle> <letterboxd:filmYear>2026</letterboxd:filmYear> <letterboxd:memberRating>4.0</letterboxd:memberRating> <letterboxd:memberLike>Yes</letterboxd:memberLike> <tmdb:movieId>1368337</tmdb:movieId> </item>
<item> <title>Ranked: Joel &amp; Ethan Coen</title> <guid isPermaLink="false">letterboxd-list-204244</guid> <link>https://letterboxd.com/dave/list/ranked-joel-ethan-coen/</link> </item>
<item> <title>Burn After Reading, 2008</title> <guid isPermaLink="false">letterboxd-watch-9</guid> <letterboxd:watchedDate>2026-07-01</letterboxd:watchedDate> <letterboxd:rewatch>No</letterboxd:rewatch> <letterboxd:filmTitle>Burn After Reading</letterboxd:filmTitle> <letterboxd:filmYear>2008</letterboxd:filmYear> <letterboxd:memberLike>No</letterboxd:memberLike> <tmdb:movieId>4944</tmdb:movieId> </item>
<item> <title>Fanny &amp; Alexander, 1982 - ★★★★★</title> <guid isPermaLink="false">letterboxd-review-3</guid> <letterboxd:watchedDate>2026-06-02</letterboxd:watchedDate> <letterboxd:rewatch>Yes</letterboxd:rewatch> <letterboxd:filmTitle>Fanny &amp; Alexander</letterboxd:filmTitle> <letterboxd:filmYear>1982</letterboxd:filmYear> <letterboxd:memberRating>5.0</letterboxd:memberRating> <letterboxd:memberLike>Yes</letterboxd:memberLike> <tmdb:movieId>12102</tmdb:movieId> </item>
</channel></rss>`;

test('list entries are not films — the failure that would poison every rec', () => {
  const watches = parseLetterboxdRss(FEED);
  // Four <item>s, one of which is "Ranked: Joel & Ethan Coen" — a LIST. About
  // half a real feed is lists, so counting items as viewings would invent
  // dozens of anchors from list names.
  assert.equal(watches.length, 3);
  assert.ok(!watches.some((w) => w.title.startsWith('Ranked:')));
});

test('a review entry counts as a viewing', () => {
  // guid says letterboxd-review-, not -watch-: you still watched it, so the
  // discriminator is "has a film title and a TMDB id", not the guid prefix.
  const watches = parseLetterboxdRss(FEED);
  assert.ok(watches.some((w) => w.tmdbId === 12102));
});

test('the TMDB id is carried through as the join key', () => {
  const odyssey = parseLetterboxdRss(FEED).find((w) => w.title === 'The Odyssey');
  assert.equal(odyssey?.tmdbId, 1368337);
  assert.equal(odyssey?.year, 2026);
  assert.equal(odyssey?.watchedDate, '2026-08-12');
  assert.equal(odyssey?.rating, 4.0);
  assert.equal(odyssey?.liked, true);
});

test('an unrated viewing stays unrated rather than defaulting', () => {
  // 16 of 50 entries in the sample feed had no rating. "Unrated" and "average"
  // are different claims and must not be collapsed.
  const burn = parseLetterboxdRss(FEED).find((w) => w.tmdbId === 4944);
  assert.equal(burn?.rating, undefined);
  assert.equal(burn?.liked, false);
});

test('XML entities in titles are decoded', () => {
  const watches = parseLetterboxdRss(FEED);
  assert.ok(watches.some((w) => w.title === 'Fanny & Alexander'));
});

test('an item without a TMDB id is dropped, not guessed from title+year', () => {
  const noId = `<rss><channel><item> <letterboxd:filmTitle>Some Film</letterboxd:filmTitle> <letterboxd:filmYear>1999</letterboxd:filmYear> </item></channel></rss>`;
  assert.deepEqual(parseLetterboxdRss(noId), []);
});

test('empty and junk input yield no watches rather than throwing', () => {
  assert.deepEqual(parseLetterboxdRss(''), []);
  assert.deepEqual(parseLetterboxdRss('<rss><channel></channel></rss>'), []);
});

test('a rewatched film collapses to one anchor, keeping its rating', () => {
  // Left alone, a film watched three times votes three times — the engine
  // ranks by how many DISTINCT films voted, so duplicates are a thumb on the
  // scale. The later unrated rewatch must not erase the earlier rating.
  const feed = `<rss><channel>
<item> <letterboxd:filmTitle>Heat</letterboxd:filmTitle> <letterboxd:watchedDate>2026-01-01</letterboxd:watchedDate> <letterboxd:memberRating>4.5</letterboxd:memberRating> <letterboxd:memberLike>Yes</letterboxd:memberLike> <tmdb:movieId>949</tmdb:movieId> </item>
<item> <letterboxd:filmTitle>Heat</letterboxd:filmTitle> <letterboxd:watchedDate>2026-05-05</letterboxd:watchedDate> <letterboxd:memberLike>No</letterboxd:memberLike> <tmdb:movieId>949</tmdb:movieId> </item>
</channel></rss>`;
  const watches = parseLetterboxdRss(feed);
  assert.equal(watches.length, 1);
  assert.equal(watches[0].watchedDate, '2026-05-05', 'keeps the most recent viewing');
  assert.equal(watches[0].rating, 4.5, 'a rating survives an unrated rewatch');
  assert.equal(watches[0].liked, true, 'a like survives too');
  assert.equal(watches[0].rewatch, true);
});

test('anchors rank by taste strength, and unrated stays eligible', () => {
  const watches = parseLetterboxdRss(FEED);
  const anchors = pickLetterboxdAnchors(watches);
  // Fanny & Alexander: 5.0 + liked. The Odyssey: 4.0 + liked. Burn After
  // Reading: unrated, not liked — last, but still present.
  assert.deepEqual(anchors.map((a) => a.tmdbId), [12102, 1368337, 4944]);
});

test('the cap is a round-trip budget, and is honored', () => {
  const watches = parseLetterboxdRss(FEED);
  assert.equal(pickLetterboxdAnchors(watches, 2).length, 2);
  assert.equal(pickLetterboxdAnchors([], 10).length, 0);
});
