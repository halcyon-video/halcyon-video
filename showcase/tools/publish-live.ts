import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { requireLiveApproval } from '../src/catalog/publisher/decision.ts';
import { createTmdbClient } from '../src/catalog/publisher/http.ts';
import { collectCatalog } from '../src/catalog/publisher/collect.ts';
import { publishSnapshot } from '../src/catalog/publisher/storage.ts';

// Scheduled/manual live refresh. The committed source decision is checked
// BEFORE any credential is read; while it is unresolved this exits 75
// (blocked, not failed) and touches nothing. Failures never move current.json.
const BLOCKED = 75;
const [destination = 'input/published-live', decisionPath = 'deployment/source-decision.json', ...rest] = process.argv.slice(2);
let token = '';
const scrub = (message: string) => (token ? message.split(token).join('[credential]') : message).slice(0, 200);
try {
  if (rest.length) throw new Error('Expected output directory and decision path only');
  let decision: unknown;
  try {
    decision = JSON.parse(await readFile(resolve(decisionPath), 'utf8'));
    requireLiveApproval(decision);
  } catch (error) {
    console.error(`Live catalog publication blocked: ${scrub((error as Error).message)}`);
    process.exit(BLOCKED);
  }
  token = process.env.TMDB_READ_ACCESS_TOKEN ?? '';
  if (!token) throw new Error('TMDB_READ_ACCESS_TOKEN is not configured for this job');
  const client = createTmdbClient({ token, fetch: globalThis.fetch });
  const version = `tmdb-us-${new Date().toISOString().slice(0, 16).replace(/[^0-9]/g, '')}`;
  const candidate = await collectCatalog(client.request, version);
  const pointer = await publishSnapshot(destination, candidate, { decision });
  const count = (type: string) => candidate.titles.filter(title => title.mediaType === type).length;
  console.log(JSON.stringify({
    ok: true, source: 'tmdb', ...pointer, checkedAt: candidate.checkedAt,
    movies: count('movie'), series: count('tv'), requests: client.statistics().attempts,
    limitations: candidate.coverage.filter(row => row.limitation).map(row => `${row.serviceId}/${row.mediaType}: ${row.limitation}`),
  }));
} catch (error) {
  console.error(`Catalog publication failed; the previous validated artifact was retained. ${scrub((error as Error).message)}`);
  process.exitCode = 1;
}
