# Deployment foundation — no live publication

Issue #356 implementation increment. This establishes a verifiable fixture
artifact and local rollback rehearsal, not a deployed Cloudflare site. The
existing 3D GitHub Pages workflow and links are unchanged. No domain, hosting
project, credential, paid plan, scheduled refresh or master release was created.

## Cloud fixture preview (activated 2026-10-11)

The owner chose a free Cloudflare Pages preview address before any domain
decision (2026-10-11), created the Cloudflare account and added
`CLOUDFLARE_API_TOKEN` (Pages Edit) and `CLOUDFLARE_ACCOUNT_ID` as secrets of
the `showcase-production` GitHub environment. `policy.json` now records
`cloudPreviewEnabled: true`, the `halcyon-showcase` Pages project, and
`previewProtection: public-noindex`: the preview is publicly reachable, every
response carries `X-Robots-Tag: noindex, nofollow`, and it is not access control.
The account ID itself stays in the environment (`environment-secret`).

`.github/workflows/showcase-preview.yml` runs only for devbjackson's pushes to
`dev` in this repository. It repeats the full showcase check and browser tests,
packages the fixture bundle, then `deployment:cloud-preview-gate` refuses unless
the policy allows `cloud-preview` for that exact commit, the bundle still matches
its seal, and its snapshot is the committed fixture. Only then does the pinned
Wrangler from `deployment/wrangler/package-lock.json` upload that one `site/`
directory with `--branch dev`, which Cloudflare treats as a preview deployment.
The project's production branch is `master`, and no step deploys to it. Secrets
appear only in the upload step. The job summary records the real deployment ID
and preview address.

Still closed: production, the canonical host, real catalog data (#354) and the
daily refresh. `networkPublishingEnabled` stays false.

## Current decisions and boundaries

`deployment/policy.json` records the unresolved canonical host, Cloudflare
account/project, project-specific source/image permission and approved master
SHA. Its placeholders are not evidence that an account/domain is absent; only
the existing 3D GitHub Pages address is confirmed by repository configuration.
No private account inventory was performed. Do not put tokens or confidential
permission documents in this public file.

The policy accepts only a local fixture-preview operation. All cloud-preview,
production and data-refresh targets fail closed, even if credentials happen to
exist in the environment. Changing an environment flag cannot activate them.
The hosting ceiling remains $5/month; domain and data-license costs are separate
owner decisions. No hosting spend was incurred by this increment.

Wrangler is the existing platform deployment tool, not a replacement invented
here. `deployment/toolchain.json` records build versions and a planned exact
Wrangler version. Wrangler is not installed or invoked by this wave; compatibility
and permission must be reviewed again before activation.

## Checked artifact, not an authorization token

From a clean, committed checkout with Node 22.19.0:

```sh
cd showcase
npm ci
npm run check
npx playwright install chromium
npm run test:browser
npm run package:preview -- <full-current-commit-sha>
```

The build records source commit and cleanliness at both start and finish in
`build-provenance.json`, plus actual Node/Astro versions. A dirty checkout or
source archive without Git can still build for development, but cannot produce a
verified deployable artifact. Packaging refuses a shortened/mismatched commit,
dirty checkout, stale build stamp, changed tool version or different fixture.

`input/deployment/bundles/<sha256>/` contains only `site/` and an immutable
`receipt.json`. The receipt identifies the full source SHA, full snapshot hash,
check time, artifact format, build tools, file count, total bytes and SHA-256 of
every file. Its content hash names the directory. This is integrity/provenance
evidence, not a cryptographic origin attestation or permission to deploy.

The guard reconstructs and validates one snapshot from the catalog pages, compares
manifest/search/pages, checks every prerendered title and page, and requires the
same snapshot marker in every HTML document. Output has an explicit reviewed
route/data inventory; only fingerprinted browser assets may supplement it.
Symlinks, hidden/private paths, user-assets, source maps, Functions/worker entry
points, unexpected JSON and sensitive markers are refused. Existing immutable
bundles are verified and reused, never overwritten. A build changing during
copying fails rather than sealing a mixed artifact.

JavaScript/search gzip budgets remain enforced. Additional packaging ceilings
are 20,000 files, 25 MiB per file and a conservative 100 MiB total. These do not
authorize a larger catalog or spend. The first two limits match the documented
[Pages limits](https://developers.cloudflare.com/pages/platform/limits/); actual
account allowances and Direct Upload usage still need confirmation. Cloudflare
also documents 500 monthly Free builds and one concurrent build, but those
figures are not measurements of this project's CI/Direct Upload consumption.

## CI isolation

`Verify showcase artifacts` is separate from the existing Pages deployment.
Actions are pinned by full SHA, Node/dependencies are pinned, and repository
permissions are read-only. Checkout does not persist credentials. Pull requests
run checks without hosting/provider secrets and cannot enter the trusted artifact
upload step. No `pull_request_target`, scheduler, deployment job, Wrangler action,
Cloudflare secret or write-token permission is present.

After install/audit, build/schema/budget checks and Playwright/axe pass, the CLI
packages the exact checked commit. Only successful owner-authored pushes/manual
runs in the maintained repository retain the verified fixture bundle for 14 days.
The step summary shows source, snapshot, bundle identity and measured volume and
says explicitly that nothing was published. A failed prerequisite prevents the
upload; there is no production state for this workflow to alter. GitHub job status
is the current failure signal, not a separately configured alert integration.

This follows [GitHub's secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use).
Artifact hashes and a successful process do not grant release authority.

## Local promotion and rollback rehearsal

The test-only/local server binds an OS-selected port on `127.0.0.1`, never a
public interface. It serves only verified bundles with noindex, correct deep
routes and a genuine 404. HTML and the current manifest revalidate; fingerprinted
assets have long immutable caching. Old fingerprinted assets remain available to
pages opened before a switch; every served byte is checked against its seal.

Local promotion and rollback serialize on one lock. They verify the candidate,
write an immutable prepared receipt, then atomically rename the current pointer.
The pointer is the commit authority: an orphan prepared receipt after a failed
check does not claim that a deployment succeeded. Reading current state verifies
the receipt, bundle, source and snapshot. Corrupt or failed candidates leave the
prior pointer untouched. Retained versions are not automatically deleted.
An explicit rollback can recover corrupted current asset bytes when the existing
pointer/receipt metadata and the selected known-good target still verify; normal
promotion cannot silently repair or overwrite that failure. Corrupt pointer or
receipt metadata requires operator inspection.

The local receipts use `provider: simulation` and `local-` deployment IDs. They
are not fabricated Cloudflare IDs. Tests demonstrate promotion, refusal, whole
rollback, concurrent-writer exclusion, corruption detection, old-data availability,
cache/noindex isolation and loopback-only serving. This proves local filesystem
behavior, not CDN propagation, DNS, TLS or a real provider rollback.

## Owner-operated activation and rollback runbook

1. Record the owner-selected existing hostname and account/project, source/image
   permission and retention terms, approved source release SHA, and actual costs.
   Never treat an example hostname or a remembered account summary as ownership.
2. Once explicitly authorized, create/configure the Pages Direct Upload project
   and scoped credentials. [Cloudflare's CI guide](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)
   describes an account-scoped Pages Edit token. Pin the intended project too;
   do not misdescribe an account token as native project-only authority. Secrets
   belong in protected CI environments, never browser variables or artifacts.
3. Decide preview access protection separately. [Preview deployments](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
   and noindex are not authentication. Keep the later public production domain
   reachable logged out; test the intended separation rather than assuming it.
4. Add the reviewed transport only after the gates are cleared. It must upload
   exactly the verified `site/` directory, serialize production changes across
   source and data jobs, and record the real provider deployment ID after success.
   Require the exact owner-approved master SHA for production and daily refresh;
   a data job must never fall back to current dev. Upstream/check failure keeps
   the last good deployment and original check time.
5. Configure the host through the [Pages custom-domain flow](https://developers.cloudflare.com/pages/configuration/custom-domains/),
   then test HTTPS, canonical redirects, deep links, real 404s, headers and the
   untouched 3D links. Run real-data/poster budgets and physical-phone acceptance
   before claiming #355/#356 complete. No field performance is claimed here.
6. For real rollback, the owner selects a prior successful production deployment
   and verifies its source/snapshot receipt. [Cloudflare rollback](https://developers.cloudflare.com/pages/configuration/rollbacks/)
   restores a complete production deployment; preview deployments are not valid
   rollback targets. Restore the whole verified version, smoke-test routes and
   manifest identity, then pause the faulty refresh path and retain its failure
   receipt. A real provider rollback and failure notification remain unperformed.

The next owner decision is the project-specific source/image permission and the
owned canonical host/account to use. This code does not make either decision or
activate publishing on the owner's behalf. Issue #356 remains open.
