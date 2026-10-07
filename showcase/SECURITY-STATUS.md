# Showcase dependency status

The separate showcase remains a fixture-only, unpublished build. Its low-severity
audit gate and production activation guards remain in force.

Compatible dependency resolutions now use sharp 0.35.5 (including its platform
and libvips packages), smol-toml 1.9.0 and source-map-js 1.2.2. This addresses the
three additional advisories found while investigating the cache audit failure.
Astro and the direct dependency versions remain unchanged.

## Cache dependency remains blocked

The locked http-cache-semantics 4.2.0 remains flagged by
[the cache advisory](https://github.com/advisories/GHSA-ch52-4w7c-c8xp).
Version 4.3.0 is available and falls outside the advisory's reported affected
range, but an independently executed reproduction still returned `true` from
`satisfiesWithoutRevalidation` for a shared response with a private Set-Cookie,
`maxAge() === 0`, and a subsequent `max-stale=999999` request. Merely updating
to that version would clear the audit without resolving this behavior.

The 4.3.0 trial was rejected. The 4.2.0 lock entry is retained so the audit
continues to expose the unresolved dependency. No audit threshold, dependency
override, advisory suppression or publication gate has been weakened.

The cache advisory is not a claim that this static fixture site exposes a shared
authenticated response cache. Astro's remote-image build path uses the package;
the exact application reachability and a verified upstream repair remain separate
requirements. Issues #374 and #378 stay open. A future repair must demonstrate the
security behavior as well as the audit, type, fixture, build, browser and readiness
requirements before claiming that these issues are fixed.
