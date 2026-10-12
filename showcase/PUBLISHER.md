# Guarded catalog publisher

Issue #354 implementation increment, 2026-09-29. This is an offline-tested data
pipeline, not a live launch, production deployment, or a replacement for the 3D
store entrance. The fixture-only site loader and production-build block remain.

## Run without credentials

With Node 22.19 or newer, from `showcase/`:

```sh
npm ci
npm run check
node --experimental-strip-types tools/publish-fixture.ts
```

The last command reads `fixtures/catalog.json` and writes ignored
`input/published-fixture/`. Optional positional arguments choose a fixture input
and output directory. It never reads a credential, constructs an upstream client,
or reaches a home server. Non-fixture input exits unsuccessfully. Outputs contain
only original synthetic data and may be rebuilt freely.

The output's `current.json` is a pointer, not a hosting entry point. It identifies
one immutable `data/<version>-<hash-prefix>/` directory containing `snapshot.json`,
`manifest.json`, compact `search.json`, and 24-title pages. Read the current
artifact with `readCurrent()`; it checks the full snapshot hash and every derived
file before returning. `rollbackSnapshot()` explicitly selects a retained version
and verifies the whole artifact, without changing its successful check time.

The mobile-consumer increment adds artifact format 2: `artifactVersion: 2` in
the envelope, a `-a2` immutable-directory suffix, and service/poster fields in the
compact index. Old format-1 artifacts remain readable and rollbackable without
changing their bytes. New publication always emits format 2 and enforces the
250 KiB gzip search budget. Snapshot input schema version 1 is unchanged.

## Implemented safeguards

- The reusable artifact builder now drives both the existing Astro build and the
  publisher. Manifest, page and search envelopes share one snapshot and full hash.
- Promotion validates schema, nonempty subscription movie/TV groups, provider
  coverage, source/region consistency, future/regressing check times, and losses
  over 30 percent globally and per previously stocked service/media group. Exactly
  30 percent is accepted. Rent/buy offers never inflate subscription counts.
- Failed validation or writing retains the prior pointer and every prior data
  file. Writers use an exclusive directory lock. A stale lock after an interrupted
  job requires inspection, not automatic deletion or an unchanged blind retry.
  The only promotion point is a same-filesystem atomic pointer rename.
- Existing immutable directories are verified, never overwritten. Failures may
  leave an unreferenced complete candidate for diagnosis; they cannot mark it
  current. Retention cleanup is intentionally not automatic pending source terms.
- Provider deep links are blocked, including inputs claiming unapproved evidence.
  Only source-supplied TMDB watch pages matching type, ID and US locale can publish;
  supplied title slugs are preserved. Links are not fabricated from service search
  templates. The consumer must label these as external watch-option checks.
- The direct-source collector resolves regional movie and TV provider lists
  separately, preserves all shared-definition alias matches, selects at most 120
  discovery seeds per service/media group, then validates per-title US offers.
  Subscription, rent and buy remain distinct. Adult records are excluded. Nullable
  TV runtime/director metadata never excludes a series. Coverage limitations say
  when a bounded sample has no verified titles; they do not claim full inventories.
- Its injected transport allows only fixed TMDB HTTPS endpoints, credentials in
  Authorization headers, no redirects, four concurrent requests, 5,000 total
  attempts, three attempts for 429/5xx with at most ten seconds backoff, and fifteen
  second request deadlines. Bodies are limited to one MiB. An in-memory cache
  retains at most 128 successful responses for at most one hour; cached responses
  retain their actual check time. Expired data is never returned after failure.
- Existing inclusive 48-hour stale/seven-day expired semantics remain unchanged.
  Failed refreshes cannot advance checkedAt. Browser elapsed-time updates and
  affirmative-wording suppression are still consumer work in #355.

Tests inject transport failures, rate limits, over-budget requests, wrong regions,
adult records, withdrawals, forged links, nullable TV data, identity collisions,
variant IDs, malformed bodies, staging failures, artifact corruption and racing
writers. They prove rollback and byte-identical last-good preservation locally;
they do not claim a deployed live rollback or physical-phone acceptance.

## Source decision: live publication remains NO-GO

On 2026-09-29, the existing project permission decision remains unresolved.
No project-specific approval or credential was available to this implementation.
No live API call, public-data refresh, API purchase or license acceptance was made.

The [TMDB FAQ](https://developer.themoviedb.org/docs/faq) distinguishes attributed
noncommercial use from commercial arrangements. Its generic guidance is not a
project-specific approval for Halcyon's promotional catalog. The indexed
[API terms](https://www.themoviedb.org/api-terms-of-use) impose additional use and
cache conditions; their indexed copy is not a substitute for the owner's current
agreement. Before any live activation, the owner must record permitted purpose,
public redistribution, image presentation, caching and retention conditions,
attribution obligations, costs, and a dated source/license reference.

The documented [movie](https://developer.themoviedb.org/reference/movie-watch-providers)
and [TV watch-provider](https://developer.themoviedb.org/reference/tv-series-watch-providers)
endpoints require JustWatch attribution and supply a TMDB watch-page fallback,
not a complete set of provider playback deep links. No undocumented JustWatch API
is used. A future approved live consumer must display both required attributions,
the approved TMDB logo, and the notice in its About/Credits area:

> This application uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.

The fixture preview does not display a misleading live-source badge or fetch
third-party logos/posters. Approved image/logo presentation and final attribution
review remain prerequisites, not completed visual work.

## Live gate and scheduled job (2026-10-10 increment)

Live publication now has exactly one key: the committed, owner-authored record
`deployment/source-decision.json`. It ships as `"status": "unresolved"`, so
every live path stays closed. `src/catalog/publisher/decision.ts` validates it;
an approval must carry all of:

- `decidedBy: "devbjackson"`, `decidedAt`, and a `reviewBy` date. After the
  review date the gate closes again until the record is renewed.
- `reference` (HTTPS link to the agreement or terms page relied on), `agreement`,
  `permittedPurpose`, `imagePresentation`, `cacheRetentionDays` (1 to 30) and
  `monthlyCostUsd`.
- `publicRedistribution: true` and an `attribution` block that has the exact TMDB
  notice above, `tmdbLogo: true` and `justWatch: true`.

An unknown field, another approver, an altered notice or an expired review keeps
the gate closed. No environment variable, CLI flag or snapshot field can stand in
for the record. `publishSnapshot()` accepts a `tmdb` snapshot only when it is
given a valid approval, including for a first publication.

`tools/publish-live.ts [outDir] [decisionPath]` checks the record before it reads
`TMDB_READ_ACCESS_TOKEN`. While the record is unresolved it exits 75 (blocked)
and writes nothing. When approved, it runs the bounded collector through the
pinned TMDB client and promotes the result through the same validation and
atomic pointer. It prints the pointer, movie and series counts, request count and
coverage limitations. Error output is truncated and the credential is scrubbed
from it.

`.github/workflows/catalog-publish.yml` runs daily at 10:23 UTC and can also be
started manually. Its gate job uses only `jq` on the record and never sees a
secret. The publish job runs only when the record is approved, on `master` in the
upstream repository. It restores the last good publication from the Actions
cache, runs the live CLI with the `TMDB_READ_ACCESS_TOKEN` repository secret, and
saves the cache only on success. A failed run therefore leaves the previous
publication in place for the next run's drop gates. GitHub's failed-run email for
scheduled workflows is the maintainer alert. The workflow has read-only
permissions, no artifact upload, and no deployment step. Hosting the promoted
artifact belongs to #356.

## Remaining work before #354 can close

1. Owner: decide on project-specific TMDB use, sign any required agreement, then
   fill in and commit the approval record. Nothing in this repository can make
   that decision, and no cost or account action has been taken.
2. Owner: add the `TMDB_READ_ACCESS_TOKEN` repository secret (an application
   read-access token, never a `VITE_` variable).
3. After the first approved run on `master`: record the measured coverage, the
   sampled movie and TV offers for every provider (or the stated limitation), API
   usage and artifact size. Then force one failure, for example by revoking the
   secret for one manual run, and confirm that the cached last good publication
   survives. Fixture tests cannot stand in for this evidence.
4. Automatic pruning of retained versions according to `cacheRetentionDays` is
   not implemented. While the record is unresolved no live data exists to prune.
5. Connect approved data to finished consumer attribution and freshness behavior
   (#355) and the separately authorized deployment flow (#356). Production still
   requires the owner's explicit release approval.
