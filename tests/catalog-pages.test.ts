import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogPage, findCatalogTitle, CATALOG_PAGE_SIZE } from '../src/catalog-pages.ts';

for (const count of [30_001, 100_000]) test(`${count} titles stay reachable with bounded page allocation`, async () => {
  const movies = Array.from({ length: count }, (_, i) => ({ id: String(i), title: `Movie ${i}` }));
  const libraries = [{ name: 'A', movies: movies.slice(0, 337) }, { name: 'B', movies: movies.slice(337) }];
  let visited = 0;
  const pages = Math.ceil(count / CATALOG_PAGE_SIZE);
  for (let p = 0; p < pages; p++) {
    const page = catalogPage(libraries, p);
    const resident = page.libraries.flatMap(l => l.movies);
    assert.ok(resident.length <= CATALOG_PAGE_SIZE);
    for (const movie of resident) assert.equal(movie, movies[visited++]);
  }
  assert.equal(visited, count);
  assert.equal(libraries[0].movies.length, 337);
  const match = (await findCatalogTitle(libraries, `Movie ${count - 1}`))!;
  assert.equal(match.movie, movies[count - 1]);
  assert.ok(catalogPage(libraries, match.page).libraries.some(l => l.movies.includes(match.movie)));
});

test('empty, small and stale page requests are safe', async () => {
  assert.equal(catalogPage([], 10).page, 0);
  const libraries = [{ movies: [1, 2] }];
  assert.equal(catalogPage(libraries, -1).libraries, libraries);
  assert.equal(catalogPage(libraries, Infinity).page, 0);
  assert.throws(() => catalogPage(libraries, 0, 0), RangeError);
  assert.equal(await findCatalogTitle([], ''), null);
});

test('search ranks exact matches ahead of earlier substrings without duplicating an index', async () => {
  const libraries = [{ movies: [{ id: 'a', title: 'The Alien Story' }, { id: 'b', title: 'Alien' }] }];
  assert.equal((await findCatalogTitle(libraries, 'alien'))?.movie.id, 'b');
  assert.equal((await findCatalogTitle(libraries, 'a'))?.movie.id, 'a');
  assert.equal(await findCatalogTitle(libraries, 'missing'), null);
});

test('catalog search yields to input between bounded scans', async () => {
  const libraries = [{ movies: Array.from({ length: 1024 }, (_, i) => ({ id: String(i), title: String(i) })) }];
  let yielded = false;
  const search = findCatalogTitle(libraries, '1023');
  setTimeout(() => { yielded = true; }, 0);
  const match = await search;
  assert.equal(yielded, true);
  assert.equal(match?.movie.id, '1023');
});
