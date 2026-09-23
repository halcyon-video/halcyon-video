import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { snapshotSchema, titleKey, titlePath } from './schema.ts';
const input = process.env.SHOWCASE_SNAPSHOT || 'fixtures/catalog.json';
const bytes = readFileSync(input);
export const snapshot = snapshotSchema.parse(JSON.parse(bytes.toString()));
// Public upstream artifacts remain gated until #354 records source permission.
if (snapshot.source !== 'fixture') throw new Error('Live data requires the source permission gate in #354.');
export const snapshotHash = createHash('sha256').update(bytes).digest('hex');
export const pageSize = 24;
export const dataRoot = `/data/${snapshot.snapshotVersion}-${snapshotHash.slice(0, 12)}`;
const envelope = { schemaVersion: snapshot.schemaVersion, snapshotVersion: snapshot.snapshotVersion, snapshotHash, region: snapshot.region, checkedAt: snapshot.checkedAt };
export const pages = Array.from({ length: Math.ceil(snapshot.titles.length / pageSize) }, (_, index) => ({ ...envelope, page: index + 1, titles: snapshot.titles.slice(index * pageSize, (index + 1) * pageSize) }));
export const search = { ...envelope, titles: snapshot.titles.map(title => ({ key: titleKey(title), title: title.title, mediaType: title.mediaType, year: title.year, genres: title.genres, path: titlePath(title) })) };
export const manifest = { ...envelope, source: snapshot.source, generatedAt: snapshot.generatedAt, selection: snapshot.selection, coverage: snapshot.coverage, count: snapshot.titles.length, pages: pages.map(page => `${dataRoot}/page-${page.page}.json`), search: `${dataRoot}/search.json` };
