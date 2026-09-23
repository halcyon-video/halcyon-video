# Halcyon mobile showcase

An isolated Astro static application. This first increment implements issue
[#353](https://github.com/halcyon-video/halcyon-video/issues/353): the architecture,
versioned catalog contract, adversarial fixtures, static routes and data outputs.
The interface is a development scaffold, not the finished mobile catalog in #355.

```sh
cd showcase
npm ci
npm run check
npm run dev
```

Requires Node 22.19 or newer (including the transitive HTTP dependency). Dependencies are pinned with a separate lockfile;
output is `showcase/dist/`. The root Vite build and existing 3D deployment are
unchanged. Commands make no upstream movie API requests and need no credentials.

All sample titles are fictional. They deliberately share the numeric ID `1`
across movie and TV to exercise collision handling; no watch links are activated.
The sample has no posters or licensed third-party content. All routes are noindex.

`SHOWCASE_ORIGIN=https://your-owned-host.example` configures canonicals only;
leave it unset until a real host is selected. This example implies no ownership.
`SHOWCASE_SNAPSHOT` selects a local fixture snapshot. Non-fixture data and
`SHOWCASE_DEPLOY_TARGET=production` deliberately fail until the source publication
and deployment gates are implemented in #354 and #356. Do not remove these gates
merely to obtain a successful deployment.

`/data/manifest.json` points to immutable, hash-qualified 24-title JSON pages and
a compact search index. There is no search-index request on initial page load.
The lazy search interaction, real poster rendering and phone acceptance belong to
#355. Schema and selection helpers live in `src/catalog/`; the service adapter
reuses the existing pure store definitions without importing its startup graph.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the contract, launch gates, source
references, deployment/rollback design and next implementation boundaries.
