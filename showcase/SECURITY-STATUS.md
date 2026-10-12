# Showcase dependency status

The separate showcase remains a fixture-only, unpublished build. Its low-severity
audit gate and production activation guards remain in force.

Compatible dependency resolutions now use sharp 0.35.5 (including its platform
and libvips packages), smol-toml 1.9.0 and source-map-js 1.2.2. This addresses the
three additional advisories found while investigating the cache audit failure.
Astro and the direct dependency versions remain unchanged.

## Cache dependency disposition (issue #374)

The package manager now resolves http-cache-semantics 4.3.0 through a
package.json override (Astro 7.3.3 asks for ^4.2.0, which 4.3.0 satisfies; Astro
7.3.8 asks for the same range, so upgrading Astro would not change this). The
unchanged `npm audit --audit-level=low` gate passes. No threshold, advisory
suppression or publication gate was changed.

Be clear about what that does and does not show. 4.3.0 is a release by the
package's existing maintainer, and the npm advisory database lists the advisory
as affecting versions up to and including 4.2.0 only. Comparing the two published
packages, the max-stale arithmetic is unchanged; 4.3.0 only tightens the Vary
check that runs before it (a `*` anywhere in the Vary list now always misses, and
inherited object property names no longer count as matching headers), and adds
a status field to the result. Reproduced against both versions with a shared
cache and a request carrying `max-stale`:

- a `public` response with `Vary: accept-language, *` is served stale by 4.2.0
  and is a miss in 4.3.0;
- a `private` response with Set-Cookie, requested by a different cookie with
  `max-stale=999999`, still returns `true` from `satisfiesWithoutRevalidation`
  in both versions (the library leaves that check to the caller via
  `storable()`).

So 4.3.0 is an improvement, but it is not shown to close every max-stale case.
Every Astro 7 release through 7.3.8 and 7.4.0-beta.1 asks for the same
`^4.2.0` range, so there is no newer Astro to move to. Remove the override and
re-check when a release is published that is documented to fix it, and keep the
caller-side reasoning below as the actual protection.

## Actual reachable exposure: none found

The advisory needs a shared cache that answers different users' requests through
`satisfiesWithoutRevalidation` or `evaluateRequest`. Here:

- Astro's only use is `assets/build/remote.js`, which calls `storable()` and
  `timeToLive()` to set an expiry on a remote image fetched during a build. It
  never calls `satisfiesWithoutRevalidation` or `evaluateRequest` (the two
  methods containing the max-stale branch), and there is no request from an
  end user to it.
- The showcase source uses no `astro:assets`, `getImage`, `<Image>` or `<Picture>`
  and configures no remote image domains, so that build path is not exercised.
  The one image is a plain `<img>`.
- The output is a static bundle; the deployed 3D store does not include this
  package.

`tests/cache-dependency.test.ts` fails if Astro starts calling the vulnerable
method or the showcase starts using Astro image processing, so this reasoning
cannot silently go stale.
