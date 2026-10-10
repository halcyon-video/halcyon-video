import { z } from 'zod';

// The live-source gate. A committed, owner-authored record is the only thing
// that can admit TMDB publication; no environment variable, CLI flag or input
// field can stand in for it. An unresolved record (the default) keeps every
// live path closed before any credential is read.
export const TMDB_NOTICE = 'This application uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.';
const text = z.string().trim().min(1).max(2000);
const timestamp = z.iso.datetime();
const httpsUrl = z.url().refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password;
}, 'Expected credential-free HTTPS URL');
const unresolved = z.strictObject({
  schemaVersion: z.literal(1), source: z.literal('tmdb'), status: z.literal('unresolved'),
  reviewedAt: timestamp, note: text,
});
const approved = z.strictObject({
  schemaVersion: z.literal(1), source: z.literal('tmdb'), status: z.literal('approved'),
  decidedBy: z.literal('devbjackson'), decidedAt: timestamp, reviewBy: timestamp,
  reference: httpsUrl, agreement: text, permittedPurpose: text,
  publicRedistribution: z.literal(true), imagePresentation: text,
  cacheRetentionDays: z.number().int().min(1).max(30),
  monthlyCostUsd: z.number().min(0).max(1000),
  attribution: z.strictObject({ tmdbNotice: z.literal(TMDB_NOTICE), tmdbLogo: z.literal(true), justWatch: z.literal(true) }),
});
export const sourceDecisionSchema = z.discriminatedUnion('status', [unresolved, approved]);
export type ApprovedDecision = z.infer<typeof approved>;

/** Throws unless the record is a valid, current owner approval. Expired
 * reviews close the gate again rather than silently carrying an old decision. */
export function requireLiveApproval(value: unknown, now = Date.now()): ApprovedDecision {
  const parsed = sourceDecisionSchema.safeParse(value);
  if (!parsed.success || parsed.data.status !== 'approved') throw new Error('Live source publication requires project-specific permission');
  const decision = parsed.data;
  const decided = Date.parse(decision.decidedAt), review = Date.parse(decision.reviewBy);
  if (decided > now || review <= decided) throw new Error('Source decision dates are inconsistent');
  if (review <= now) throw new Error('Source decision review date has passed; live publication is closed until re-approved');
  return decision;
}
