import { z } from 'zod';
import { services } from './services.ts';
const text = z.string().trim().min(1).max(4000);
const positiveId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const timestamp = z.iso.datetime();
const serviceId = z.string().refine(value => services.some(service => service.id === value), 'Unsupported service');
const httpsUrl = z.url().refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password;
}, 'Expected credential-free HTTPS URL');
const link = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('tmdb-watch-page'), url: httpsUrl }),
  z.strictObject({ kind: z.literal('verified-provider'), url: httpsUrl, verifiedAt: timestamp, evidence: text }),
]);
const offer = z.strictObject({
  region: z.literal('US'), serviceId, providerId: positiveId,
  type: z.enum(['subscription', 'rent', 'buy']), checkedAt: timestamp,
  provenance: z.enum(['tmdb-justwatch', 'fixture']), link,
});
export const titleSchema = z.strictObject({
  mediaType: z.enum(['movie', 'tv']), tmdbId: positiveId, title: text,
  synopsis: text, year: z.number().int().min(1800).max(2200).nullable(),
  genres: z.array(text).max(30), adult: z.literal(false),
  posterPath: z.string().regex(/^\/[A-Za-z0-9_-]+\.(jpg|png|webp)$/).nullable(),
  runtimeMinutes: z.number().int().positive().nullable(),
  seasonCount: z.number().int().positive().nullable(),
  episodeCount: z.number().int().positive().nullable(),
  rating: z.strictObject({ value: z.number().min(0).max(10), votes: z.number().int().nonnegative(), source: z.literal('tmdb') }).nullable(),
  offers: z.array(offer).max(100),
});
export type CatalogTitle = z.infer<typeof titleSchema>;
export const titleKey = (title: Pick<CatalogTitle, 'mediaType' | 'tmdbId'>) => `${title.mediaType}:${title.tmdbId}`;
export const titlePath = (title: Pick<CatalogTitle, 'mediaType' | 'tmdbId'>) => `/title/${title.mediaType}/${title.tmdbId}/`;
export const snapshotSchema = z.strictObject({
  schemaVersion: z.literal(1), snapshotVersion: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  region: z.literal('US'), generatedAt: timestamp, checkedAt: timestamp,
  source: z.enum(['fixture', 'tmdb']), selection: z.literal('curated'),
  perProviderMediaLimit: z.literal(120),
  coverage: z.array(z.strictObject({ serviceId, mediaType: z.enum(['movie', 'tv']), providerIds: z.array(positiveId), limitation: text.nullable() })).length(16),
  titles: z.array(titleSchema).min(1).max(1920),
}).superRefine((snapshot, ctx) => {
  const problem = (message: string) => ctx.addIssue({ code: 'custom', message });
  const keys = new Set<string>();
  const generated = Date.parse(snapshot.generatedAt);
  if (Date.parse(snapshot.checkedAt) > generated) problem('Snapshot check is later than generation');
  const coverageKeys = new Set(snapshot.coverage.map(row => `${row.serviceId}:${row.mediaType}`));
  if (coverageKeys.size !== 16) problem('Coverage must include each service and media type exactly once');
  for (const row of snapshot.coverage) {
    if (!row.providerIds.length && !row.limitation) problem('Missing provider requires an explicit coverage limitation');
  }
  for (const title of snapshot.titles) {
    const key = titleKey(title);
    if (keys.has(key)) problem(`Duplicate title ${key}`);
    keys.add(key);
    for (const offer of title.offers) {
      if (offer.provenance !== (snapshot.source === 'fixture' ? 'fixture' : 'tmdb-justwatch')) problem('Offer provenance does not match snapshot source');
      const coverage = snapshot.coverage.find(row => row.serviceId === offer.serviceId && row.mediaType === title.mediaType);
      if (!coverage?.providerIds.includes(offer.providerId)) problem('Offer provider absent from media-specific coverage');
      if (Date.parse(offer.checkedAt) > generated || Date.parse(offer.checkedAt) < Date.parse(snapshot.checkedAt)) problem('Offer check is outside snapshot check window');
      if (offer.link.kind === 'tmdb-watch-page') {
        const url = new URL(offer.link.url);
        if (url.hostname !== 'www.themoviedb.org' || url.port || url.pathname !== `/${title.mediaType}/${title.tmdbId}/watch` || url.searchParams.get('locale') !== 'US') problem('Watch-page link must match title identity and region');
      } else if (Date.parse(offer.link.verifiedAt) > generated) problem('Provider verification is later than generation');
    }
  }
});
export type Snapshot = z.infer<typeof snapshotSchema>;
// Inclusive boundaries; failed refreshes never supply a new checkedAt.
export function freshness(checkedAt: string, now = Date.now()): 'fresh' | 'stale' | 'expired' {
  const age = now - Date.parse(checkedAt);
  if (!Number.isFinite(age) || age < 0 || age >= 7 * 86400000) return 'expired';
  return age >= 48 * 3600000 ? 'stale' : 'fresh';
}
