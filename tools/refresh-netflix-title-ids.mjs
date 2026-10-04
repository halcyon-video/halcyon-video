#!/usr/bin/env node
// Resolve movie identities through Wikidata's CC0 TMDB/Netflix identifiers.
// Run while packaging the catalog; visitors make no lookup and need no API key.
// Ambiguous identities are omitted so checkout can use the exact TMDB watch page.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'src/data/netflix-title-ids.json');

export function collectNetflixTitleIds(bindings, allowedIds) {
  const allowed = new Set(allowedIds.map(String));
  const groups = new Map();
  for (const binding of bindings) {
    const tmdb = binding?.tmdb?.value;
    const netflix = binding?.netflix?.value;
    const item = /^https?:\/\/www\.wikidata\.org\/entity\/(Q[1-9]\d*)$/.exec(binding?.item?.value || '');
    if (!allowed.has(tmdb) || !/^[1-9]\d{5,7}$/.test(netflix || '') || !item) continue;
    const group = groups.get(tmdb) || { netflix: new Set(), items: new Set() };
    group.netflix.add(netflix);
    group.items.add(item[1]);
    groups.set(tmdb, group);
  }
  const movies = {}, wikidata = {};
  for (const tmdb of [...groups.keys()].sort((a, b) => Number(a) - Number(b))) {
    const group = groups.get(tmdb);
    if (group.netflix.size !== 1 || group.items.size !== 1) continue;
    movies[tmdb] = [...group.netflix][0];
    wikidata[tmdb] = [...group.items][0];
  }
  return { movies, wikidata };
}

export async function refreshNetflixTitleIds(tmdbIds, bindings) {
  const ids = [...new Set(tmdbIds)].filter(id => Number.isSafeInteger(id) && id > 0);
  if (!ids.length) throw Error('No Netflix movie identities to resolve');
  if (!bindings) {
    const query = 'PREFIX wdt: <http://www.wikidata.org/prop/direct/>\n' +
      'SELECT ?item ?tmdb ?netflix WHERE { VALUES ?tmdb { ' +
      ids.map(id => '"' + id + '"').join(' ') + ' } ?item wdt:P4947 ?tmdb; wdt:P1874 ?netflix. }';
    const url = 'https://query.wikidata.org/sparql?' + new URLSearchParams({ query, format: 'json' });
    const response = await fetch(url, {
      headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'HalcyonVideo (Netflix movie identifiers)' },
      signal: AbortSignal.timeout(55000),
    });
    if (!response.ok) throw Error('Wikidata HTTP ' + response.status);
    bindings = (await response.json())?.results?.bindings;
  }
  if (!Array.isArray(bindings)) throw Error('Invalid Wikidata identifier response');
  const data = collectNetflixTitleIds(bindings, ids);
  if (!Object.keys(data.movies).length) throw Error('No unambiguous identifiers; previous map preserved');
  fs.writeFileSync(output, JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: { name: 'Wikidata', url: 'https://www.wikidata.org', license: 'CC0',
      tmdbProperty: 'P4947', netflixProperty: 'P1874' },
    ...data,
  }, null, 2) + '\n');
  return Object.keys(data.movies).length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'src/data/streaming-snapshot.json'), 'utf8'));
  const ids = snapshot.services.find(service => service.id === 'netflix')?.titles.map(title => title.tmdbId) || [];
  const input = process.argv.indexOf('--bindings');
  const bindings = input >= 0 ? JSON.parse(fs.readFileSync(process.argv[input + 1], 'utf8')).results.bindings : undefined;
  const count = await refreshNetflixTitleIds(ids, bindings);
  console.log('Resolved exact Netflix title links for ' + count + ' of ' + ids.length + ' movies.');
}
