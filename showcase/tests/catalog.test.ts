import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freshness, snapshotSchema, titleKey, titlePath } from '../src/catalog/schema.ts';
import { matchingProviderIds, services } from '../src/catalog/services.ts';
const fixture = () => JSON.parse(readFileSync(new URL('../fixtures/catalog.json', import.meta.url), 'utf8'));
test('movie and TV sharing a numeric ID remain separate titles and routes', () => {
  const snapshot = snapshotSchema.parse(fixture());
  assert.equal(new Set(snapshot.titles.map(titleKey)).size, 2);
  assert.deepEqual(snapshot.titles.map(titlePath), ['/title/movie/1/', '/title/tv/1/']);
  snapshot.titles.push(snapshot.titles[0]);
  assert.equal(snapshotSchema.safeParse(snapshot).success, false);
});
test('TV without director or runtime remains valid', () => {
  const title = snapshotSchema.parse(fixture()).titles[1];
  assert.equal(title.runtimeMinutes, null);
  assert.equal(title.seasonCount, 2);
});
test('all matching subscription variants survive the adapter', () => {
  assert.equal(services.length, 8);
  assert.deepEqual(matchingProviderIds('paramount', [{id: 1, name:'Paramount Plus Essential'}, {id:2, name:'Paramount Plus Premium'}, {id:3, name:'Unrelated'}]), [1,2]);
  assert.deepEqual(matchingProviderIds('missing', [{id:1, name:'Netflix'}]), []);
  assert.ok(services.every(service => !('urlTemplate' in service)));
});
test('multiple offers retain provider, media type and monetization distinctions', () => {
  const value = fixture();
  value.coverage[0].providerIds.push(9);
  const offer = structuredClone(value.titles[0].offers[0]);
  offer.providerId = 9; offer.type = 'rent';
  value.titles[0].offers.push(offer);
  assert.deepEqual(snapshotSchema.parse(value).titles[0].offers.map(o => o.type), ['subscription', 'rent']);
});
test('missing providers require coverage limitations and cannot have invented offers', () => {
  const value = fixture();
  value.coverage[2].limitation = null;
  assert.equal(snapshotSchema.safeParse(value).success, false);
  const other = fixture(); other.titles[0].offers[0].providerId = 999;
  assert.equal(snapshotSchema.safeParse(other).success, false);
});
test('coverage is exhaustive by service and media type, not a duplicate row count', () => {
  const value = fixture(); value.coverage[1] = value.coverage[0];
  assert.equal(snapshotSchema.safeParse(value).success, false);
});
test('unsupported regions and cross-region offers are refused', () => {
  const value = fixture(); value.region = 'GB';
  assert.equal(snapshotSchema.safeParse(value).success, false);
  const other = fixture(); other.titles[0].offers[0].region = 'GB';
  assert.equal(snapshotSchema.safeParse(other).success, false);
});
test('freshness changes at 48 hours and seven days, and future/invalid checks fail closed', () => {
  const date = '2026-09-21T00:00:00Z'; const time = Date.parse(date);
  assert.equal(freshness(date, time + 48*3600000 - 1), 'fresh');
  assert.equal(freshness(date, time + 48*3600000), 'stale');
  assert.equal(freshness(date, time + 7*86400000 - 1), 'stale');
  assert.equal(freshness(date, time + 7*86400000), 'expired');
  assert.equal(freshness(date, time - 1), 'expired');
  assert.equal(freshness('invalid', time), 'expired');
});
test('withdrawn offers may be represented without fabricating a replacement', () => {
  const value = fixture(); value.titles[1].offers = [];
  assert.deepEqual(snapshotSchema.parse(value).titles[1].offers, []);
});
test('links cannot cross movie/TV identity or masquerade as provider deep links', () => {
  for (const url of ['javascript:alert(1)', 'https://user:password@example.org/', 'https://www.themoviedb.org/tv/1/watch?locale=US', 'https://www.themoviedb.org/movie/1/watch?locale=GB']) {
    const value = fixture(); value.titles[0].offers[0].link.url = url;
    assert.equal(snapshotSchema.safeParse(value).success, false, url);
  }
  const value = fixture(); value.titles[0].offers[0].link = {kind:'verified-provider', url:'https://example.org/movie/1'};
  assert.equal(snapshotSchema.safeParse(value).success, false);
});
test('unknown schemas, adult content and unbounded snapshot names are refused', () => {
  for (const mutate of [(v: any) => v.schemaVersion = 2, (v: any) => v.titles[0].adult = true, (v: any) => v.snapshotVersion = '../elsewhere']) {
    const value = fixture(); mutate(value); assert.equal(snapshotSchema.safeParse(value).success, false);
  }
});
test('offer timestamps preserve the oldest successful check, not just generation time', () => {
  const value = fixture(); value.titles[0].offers[0].checkedAt = '2026-09-20T12:00:00Z';
  assert.equal(snapshotSchema.safeParse(value).success, false);
  value.checkedAt = '2026-09-20T12:00:00Z';
  assert.equal(snapshotSchema.safeParse(value).success, true);
});
