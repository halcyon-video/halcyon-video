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

Be clear about what that does and does not show. The advisory lists no patched
version and 4.3.0 is merely outside its stated range. A reproduction against both
4.2.0 and 4.3.0 (shared cache, `private` response with Set-Cookie, then a request
with `max-stale=999999`) still returns `true` from `satisfiesWithoutRevalidation`,
so the library behaviour is unchanged upstream. Remove the override and re-check
when a release is published that is documented to fix it.

## Actual reachable exposure: none found

The advisory needs a shared cache that answers different users' requests through
`satisfiesWithoutRevalidation`. Here:

- Astro's only use is `assets/build/remote.js`, which calls `storable()` and
  `timeToLive()` to set an expiry on a remote image fetched during a build. It
  never calls `satisfiesWithoutRevalidation`, and there is no request from an
  end user to it.
- The showcase source uses no `astro:assets`, `getImage`, `<Image>` or `<Picture>`
  and configures no remote image domains, so that build path is not exercised.
  The one image is a plain `<img>`.
- The output is a static bundle; the deployed 3D store does not include this
  package.

`tests/cache-dependency.test.ts` fails if Astro starts calling the vulnerable
method or the showcase starts using Astro image processing, so this reasoning
cannot silently go stale.
