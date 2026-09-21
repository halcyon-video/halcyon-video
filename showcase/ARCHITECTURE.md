# ADR 001: Static public mobile catalog

Accepted implementation direction for #353, 2026-09-21. The US beta target is
September 25, with September 26–27 reserved for fixes. This is a development
contract, not a production launch or source-license approval.

## Boundaries and dependencies

Use Astro static HTML in `showcase/`, an independent npm package, lockfile and
`dist/`. No server adapter, database, Functions, request-time API proxy, account,
visitor credential, media-server dependency or browser WebGL graph. The root
Vite/Three.js application retains its build and existing GitHub Pages deployment.

A build-time adapter imports only `DEFAULT_STREAMING_SERVICES` from the existing
pure `src/streaming-catalog.ts`. It removes search URL templates and retains every
matching provider alias. It never calls the movie-only deduplicator. Build-time
Node tests prove this module can run without DOM or Tauri. Future browser search
consumes generated JSON; it must not import this adapter or the Zod schema.

Delivery order:

| Issue | Responsibility | Depends on |
| --- | --- | --- |
| [353](https://github.com/halcyon-video/halcyon-video/issues/353) | This contract and executable foundation | None |
| [354](https://github.com/halcyon-video/halcyon-video/issues/354) | Direct upstream publisher and source permission | Contract |
| [355](https://github.com/halcyon-video/halcyon-video/issues/355) | Finished browse/search/title UX and accessibility/performance evidence | Contract and approved data |
| [356](https://github.com/halcyon-video/halcyon-video/issues/356) | Domain, credentials, CI, deployment and rollback | Begin access now; data/UI before launch |
| [357](https://github.com/halcyon-video/halcyon-video/issues/357) | Optional store handoff and self-host journey | Contract and UI |
| [358](https://github.com/halcyon-video/halcyon-video/issues/358) | Phone acceptance, discovery and launch evidence | All above |

The completed [3D phone epic #294](https://github.com/halcyon-video/halcyon-video/issues/294)
is not reopened. [Checkout #293](https://github.com/halcyon-video/halcyon-video/issues/293)
continues to govern the immersive store's service choice and counter ritual.
This catalog is a separate entry point, not a fix for WebGL performance.

## Route contract

| Route | Static behavior |
| --- | --- |
| `/` | Immediate curated shelves, without setup or a mode picker |
| `/browse/`, `/browse/2/` | Bounded 24-title pages and ordinary navigation without JS |
| `/title/movie/:id/`, `/title/tv/:id/` | Separate prerendered pages for each identity |
| `/about/` | Coverage, attribution, freshness and privacy explanation |
| `/self-host/` | Optional library integrations and maintained installation guide |
| `/store/` | Explicit entry into existing 3D deployment; no prefetch or automatic navigation |
| `/404.html` | Real not-found response on Pages, not an SPA fallback |

`SHOWCASE_ORIGIN` is a validated optional HTTPS origin. Canonicals are omitted
when absent; no owned domain is assumed. Preview HTML, robots and HTTP headers
all say noindex. #356 owns production canonical redirects and indexing enablement.

## Catalog version 1

Executable schema: `src/catalog/schema.ts`. Complete synthetic JSON example:
`fixtures/catalog.json`. Identity is the pair `(mediaType, tmdbId)`; string key
`movie:1` differs from `tv:1`. Route IDs are positive safe integers.

The envelope includes `schemaVersion: 1`, immutable `snapshotVersion`, `region:
"US"`, `source`, `generatedAt`, `checkedAt`, `selection: "curated"`,
`perProviderMediaLimit: 120`, coverage rows and titles. `checkedAt` is the oldest
successful availability check included, not the time a failed refresh was attempted.
Generation time cannot precede checks. Input snapshots are bounded to 1,920 titles
(8 services × 2 media types × 120 before cross-service deduplication).

Every title has media type, TMDB ID, title, synopsis, nullable year/poster/runtime,
genres, `adult: false`, nullable factual rating with vote count and source, and
nullable season/episode counts. TV does not require a director or film runtime.
Each offer stores its own US region, internal service slug, upstream provider ID,
subscription/rent/buy type, successful check time, source and link. The beta
selects subscription titles; transactional offers must never be called subscriptions.
An empty offer array represents withdrawn or unavailable stock honestly.

Link union examples:

```json
{"kind":"tmdb-watch-page","url":"https://www.themoviedb.org/movie/1/watch?locale=US"}
```

```json
{"kind":"verified-provider","url":"https://provider.example/title/123","verifiedAt":"2026-09-21T12:00:00Z","evidence":"authorized source record reference"}
```

The second example is a shape illustration, not a real provider link. Provider
links require authorized-source evidence and a check time; they are not inferred
from search URL patterns. #354 must additionally enforce the authorized provider
host allowlist and validate evidence. The TMDB fallback must match the exact
media type, ID and region, and be labeled “Check watch options on TMDB”, never
“Play now”.

Coverage has exactly one row per service/media type, all resolved provider IDs,
and an explicit limitation when missing. Target services are Netflix, Prime,
Disney+, Hulu, Max, Apple TV+, Paramount+ and Peacock, as defined by the shared
adapter; current source coverage is unknown. Do not fabricate minimum counts.
Series-level availability does not guarantee every season.

## One snapshot, all artifacts

Validate first, then derive HTML, title pages, 24-title JSON pages and compact
search entries from that one in-memory snapshot. Hash the exact input bytes
with SHA-256. `/data/manifest.json` records schema/snapshot versions, hash,
region, last check, coverage, counts and artifact URLs. Every JSON page/search
index repeats the identity envelope. Data paths include version plus hash;
they cannot collide when a version name is accidentally reused with new bytes.

The search index contains only key, title, media type, year, genres and route.
#355 loads it on search intent, checks the envelope against the current manifest,
and preserves URL filters, Back and scroll state. No eager index download,
no all-catalog DOM mount. Movie and TV pages are readable with JavaScript off.
Real snapshots, secrets, caches and third-party posters are not committed;
`input/` and environment files are ignored. Only original synthetic fixtures ship.

#354 publishes immutable snapshots as retained CI artifacts, not source history.
Daily/manual collection uses direct documented upstream APIs and CI-only secrets,
bounded concurrency and request budget, cached successful responses, and capped
retry/backoff for 429/5xx. Validate provider coverage, both media groups, matching
versions and unexpected count drops over 30% before promotion. An incomplete
refresh stops promotion and preserves the last good artifact. A failed job
alerts the repository maintainer, never advances `checkedAt`, and never silently
replaces a missing provider with invented stock.

At 48 hours show stale status. At seven days suppress affirmative availability
and offer only an explicitly labeled external recheck. `freshness()` has tested
inclusive thresholds. #355 must recompute elapsed age in the browser on load and
visibility change; static HTML uses date-qualified, non-affirmative wording so a
failed rebuild cannot leave a timeless availability promise for no-JS visitors.

## Source and hosting decisions

Initial source candidate: documented TMDB movie/TV discovery plus per-title watch
providers, conditional on a project-specific permission decision. TMDB's FAQ
limits its free offering to noncommercial use with attribution; this does not
establish permission for Halcyon's promotional catalog, public caching or image
redistribution. Public launch is NO-GO until the maintainer records the permitted
use, storage/retention/image conditions and any separately approved license cost.
Do not scrape undocumented JustWatch APIs. Movie and TV watch-provider docs
require JustWatch attribution and describe the supplied TMDB watch-page fallback,
not complete direct provider playback URLs. #354 implements both required TMDB
and JustWatch attribution and approved image presentation before live data.

Hosting choice: Cloudflare Pages Direct Upload, built in GitHub Actions with
pinned actions/Node/Wrangler versions, uploading only `showcase/dist`. No runtime
compute/storage services are required. Keep existing 3D GitHub Pages available.
Cloudflare currently documents 20,000 files per Free site and 25 MiB per asset;
the implementation must measure its real file count, transfer size and CI usage.
Published build limits do not substitute for measuring this Direct Upload flow.
Target hosting cost is $0 on available free allowances; maximum authorized hosting
spend remains $5/month. Domain registration/renewal and data licensing are separate,
unapproved costs, not hidden inside that ceiling.

## Deployment and rollback contract for #356

1. Untrusted PRs run checks without secrets or deployment. Trusted dev produces
   noindex previews. Production source comes only from the owner's approved
   master release, never an unreleased dev ref.
2. Daily data refresh checks out the last approved immutable source SHA, validates
   the new snapshot, and builds/tests the complete site in a staging directory.
3. Gate schema, coverage/count anomalies, links, build, Playwright/axe and budgets;
   on any failure keep production untouched and retain a failure receipt.
4. Serialize production promotion. Direct Upload deploys HTML and same-version
   data as one complete artifact. Record source SHA, snapshot hash/check time,
   build/test evidence and deployment ID together; do not print credentials.
5. Revalidate HTML and manifest; give hash-qualified assets long immutable caches.
   Set up custom domains through Pages, HTTPS, canonical host redirects and real
   404s. Domain selection is not inferred from an example hostname.
6. Maintainer devbjackson owns rollback: choose the prior known-good production
   deployment and restore the whole source/data artifact, smoke-test title routes
   and manifest identity, then pause failing refresh promotion. Cloudflare permits
   prior production deployments as rollback targets, not previews. Demonstrate
   an actual rollback before launch and preserve artifacts within source terms.

No production workflow is activated by this foundation. Both production-target
builds and non-fixture inputs fail explicitly until their gates are implemented.

## Monday go/no-go and named owners

As of 2026-09-21: GO for fixture-based development; NO-GO for live public launch.
These are unresolved access/decision gates, not a claim that accounts do not exist.

| Gate | Accountable owner | Evidence required | Current status |
| --- | --- | --- | --- |
| Architecture and fixtures | Lezard, implementation; devbjackson, product owner | Committed contract, tests and build | This increment |
| Domain/DNS and Cloudflare project | devbjackson | Selected owned domain, account access, DNS control; exact initial/renewal price if buying | Not supplied |
| Source-use rights and attribution | devbjackson | Source permission for this project, caching/images/retention and promotion | Not established |
| Data license/API costs | devbjackson | Written cost and explicit approval if nonzero; CI-only credential | Unknown, no purchase made |
| Hosting/CI budget | devbjackson; #356 implementer measures | Measured artifact/build use within $5/month; separately disclose domain/data cost | Not measured at production scale |
| Production and rollback approval | devbjackson | Approved master SHA, verified deployment and rollback receipt | Pending later increments |

The existing issue bodies remain the acceptance authority. This foundation does
not claim those later issues are complete, authorize a purchase, or initiate a
master release. Accounts, lists, payments, recommendations, all regions and
exhaustive catalog search remain out of scope.

## Verification contract

Executable fixtures cover movie/TV collisions, multiple offer types/variants,
missing and duplicate coverage, withdrawn offers, unsupported regions, nullable TV
metadata, unsafe/mismatched links, stale/expired/future checks and version rejection.
Static artifact checks must confirm identical snapshot identity in manifest,
pages and search, independently generated title routes, no browser 3D code and no
initial search fetch. Browser QA uses Playwright/Puppeteer; accessibility uses axe;
performance uses Lighthouse CI. Use these existing tools rather than custom
browser or visual-comparison frameworks.

#355 acceptance: cold JavaScript ≤100 KiB gzip, initial viewport resources ≤500 KiB,
lazy search ≤250 KiB gzip, three mobile Lighthouse runs ≥90, lab LCP ≤2.5s,
CLS ≤0.1, TBT ≤200ms. Physical iPhone Safari and Android Chrome must each complete
five minutes of browsing with device/browser/network recorded; emulation is not
physical-phone evidence. Field p75 LCP/INP/CLS need sufficient samples and cannot
be claimed before launch. #358 owns rollout evidence and first-week metrics.

## Primary references, checked 2026-09-21

- [Astro installation and runtime requirements](https://docs.astro.build/en/install-and-setup/)
- [TMDB licensing/attribution FAQ](https://developer.themoviedb.org/docs/faq)
- [TMDB movie watch providers](https://developer.themoviedb.org/reference/movie-watch-providers)
- [TMDB TV watch providers](https://developer.themoviedb.org/reference/tv-series-watch-providers)
- [Cloudflare CI Direct Upload](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)
- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)
- [Cloudflare rollback behavior](https://developers.cloudflare.com/pages/configuration/rollbacks/)
