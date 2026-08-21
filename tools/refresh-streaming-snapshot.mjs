#!/usr/bin/env node
// Refreshes src/data/streaming-snapshot.json -- the bundled, always-available
// floor of the streaming-service source ladder (GH #86 follow-up, owner
// mandate 2026-08-21: "a user should be able to click into a working version
// that immediately loads"). A direct TMDB key or a configured Jellyseerr both
// still win when present (see streaming-catalog.ts's resolveStreamingSource);
// this snapshot is what a fresh install or the hosted demo build the
// streaming aisles from with NEITHER configured.
//
// This is how the owner (or anyone packaging their own copy of the app)
// refreshes the lineup: point it at a real Jellyseerr install and it writes
// fresh committed data.
//
//   JELLYSEERR_URL=http://localhost:5055 JELLYSEERR_API_KEY=xxxxx \
//     node tools/refresh-streaming-snapshot.mjs
//
// Pulls Jellyseerr's proxied TMDB endpoints -- the watch-provider list, then
// one /discover page per matched default service -- and keeps only
// tmdbId/title/year/posterPath per title: text and a poster PATH STRING,
// never an image or a service logo (committed fallbacks stay brand-free;
// posters resolve at render time from image.tmdb.org, which needs no key --
// verified with a plain `curl`, no auth header, against a real poster path).
// The API key is read from the environment only -- never printed, logged, or
// written to the output file.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH = path.join(root, 'src/data/streaming-snapshot.json');
const WATCH_REGION = 'US';
const TITLES_PER_SERVICE = 24;

const jellyseerrUrl = (process.env.JELLYSEERR_URL || '').replace(/\/+$/, '');
const apiKey = process.env.JELLYSEERR_API_KEY || '';

if (!jellyseerrUrl || !apiKey) {
  console.error(
    'Usage: JELLYSEERR_URL=http://host:5055 JELLYSEERR_API_KEY=xxxxx node tools/refresh-streaming-snapshot.mjs\n' +
    'Both JELLYSEERR_URL and JELLYSEERR_API_KEY must be set in the environment (neither is ever printed by this tool).'
  );
  process.exit(1);
}

// ── Import the real service-definition table ────────────────────────────────
// Same esbuild-bundle-import pattern as tools/list-slots.mjs -- no duplicated
// service list here, so a service the app adds/renames is picked up for free.
async function bundleImport(entrySource) {
  const { build } = await import('esbuild');
  const result = await build({
    stdin: { contents: entrySource, resolveDir: root, loader: 'ts', sourcefile: 'refresh-streaming-snapshot-entry.ts' },
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    write: false,
    logLevel: 'silent',
  });
  const code = result.outputFiles.find((f) => f.path.endsWith('.js')) ?? result.outputFiles[0];
  return import('data:text/javascript;base64,' + Buffer.from(code.text).toString('base64'));
}

const { DEFAULT_STREAMING_SERVICES, matchProviderId } = await bundleImport(`
  export { DEFAULT_STREAMING_SERVICES, matchProviderId } from './src/streaming-catalog';
`);

async function jellyseerrGet(reqPath) {
  const res = await fetch(`${jellyseerrUrl}${reqPath}`, {
    headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${reqPath}`);
  return res.json();
}

console.log(`Fetching watch-provider list from ${jellyseerrUrl} (region ${WATCH_REGION})...`);
const providersRaw = await jellyseerrGet(`/api/v1/watchproviders/movies?watchRegion=${WATCH_REGION}`);
const providers = Array.isArray(providersRaw) ? providersRaw : [];

const services = [];
for (const def of DEFAULT_STREAMING_SERVICES) {
  const providerId = matchProviderId(def, providers);
  if (providerId === null) {
    console.warn(`  [skip] ${def.name}: no provider match in region ${WATCH_REGION}`);
    continue;
  }
  console.log(`  Fetching ${def.name} (provider ${providerId})...`);
  const data = await jellyseerrGet(
    `/api/v1/discover/movies?watchProviders=${providerId}&watchRegion=${WATCH_REGION}&page=1`
  );
  const results = Array.isArray(data?.results) ? data.results : [];
  const seen = new Set();
  const titles = [];
  for (const item of results) {
    if (titles.length >= TITLES_PER_SERVICE) break;
    const tmdbId = item?.id;
    const title = item?.title || item?.name;
    if (typeof tmdbId !== 'number' || !title || seen.has(tmdbId)) continue;
    seen.add(tmdbId);
    const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() : undefined;
    titles.push({
      tmdbId,
      title,
      year: Number.isFinite(year) ? year : new Date().getFullYear(),
      ...(item.posterPath ? { posterPath: item.posterPath } : {}),
    });
  }
  console.log(`    ${titles.length} title(s).`);
  services.push({ id: def.id, name: def.name, titles });
}

const snapshot = {
  generatedAt: new Date().toISOString(),
  watchRegion: WATCH_REGION,
  services,
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(snapshot, null, 2) + '\n');

const totalTitles = services.reduce((n, s) => n + s.titles.length, 0);
console.log(`\nWrote ${path.relative(root, OUT_PATH)}: ${services.length} service(s), ${totalTitles} title(s) total.`);
