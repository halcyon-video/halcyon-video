# Optional store and installation handoff

Issue #357 safe fixture increment, not a release or source-permission decision.
The catalog remains independently usable; neither upgrade path, installation,
account, server nor API key is required for browsing. Existing hosted 3D entry
remains `https://halcyon-video.github.io/halcyon-video/`. No public deployment,
domain change, provider activation or master release is part of this work.

## Version 1 contract

The shared, dependency-free `src/catalog-handoff.ts` owns the contract:

```
?catalog=v1.movie.813.US
?catalog=v1.tv.123.US.netflix,prime
```

Fields are version, media type, positive safe-integer TMDB ID, US region, and
optional Halcyon service IDs. Service IDs are the existing eight stable internal
slugs, not upstream numeric provider IDs. They are bounded, unique, allowlisted
context only: they do not select a subscription, change preferences, stock a
store, verify availability or bypass checkout. The v1 receiver does not apply
them. Any future interpretation requires its own review and tests.

The complete query is bounded to 256 characters and the value to 192. Repeated
parameters, extra fields, another version, malformed IDs, unsupported regions and
unknown/duplicate providers fail closed. No redirect, return URL, credential,
server URL, title text, raw search or personal-library ID is accepted. A catalog
handoff takes precedence over the legacy title/walk sharing path, including an
invalid handoff; it cannot silently fall through to a different selection.

Fixture IDs can collide with real movie IDs. Title pages carry identity only to
the local bridge/self-host page; every fixture 3D entry strips that identity and
opens the hosted overview. Shared bridge links preserve only validated identity,
never arbitrary query data. A reopened absent title receives the catalog's real
not-found page, rather than a guessed substitute.

## 3D receiver and return

At the existing scene-ready boundary, the optional receiver runs once. Movies
match exact TMDB identity in visible/selectable stock, never a title substring.
Series, absent/ambiguous IDs, malformed links and failed selection explain the
fallback and call the existing overview entry point. On the current mobile-store
path this intentionally means its walk-around starting view; desktop uses
overview mode. The adapter does not change rendering/navigation conventions or
force a title selection on either fallback. Selection is verified again against the selected
movie after the existing jump operation. Checkout, streaming URL resolution and
provider sign-in remain unchanged. Local setup remains in charge of an empty
opening-day store; a link never enables services or fights the setup terminal.

No owned catalog origin is configured yet. `VITE_SHOWCASE_ORIGIN` is a future,
reviewed build-time HTTPS origin, never a query value or inferred referrer. When
present, the receiver constructs the canonical title/browse route itself. When
absent or invalid, the notice explains that return configuration is missing and
directs visitors to browser Back. It does not fabricate an owned hostname.
The receiver first shipped in release `v0.23.0` and is live in the hosted store
deployed from `v0.25.0` (Pages deploy 2026-10-07; the served bundle contains the
`catalog` parser and its 256-character bound). The bridge still words this
conservatively and never claims the hosted app has selected the title.

The bridge loads no store iframe, canvas, video, model or texture. Its 72,474-byte
960×540 WebP still was captured using the existing shot tool from an asset-free
camp: only the tracked user-assets README was present. The test catalog uses the
existing public-domain/CC-BY sample poster pool, with visible attribution linking
to its maintained source/license record. It illustrates the store layout, not
real availability. Capture used High tier on AMD GPU; the optional supersample
settle timed out, so no supersampled-quality or performance claim is made.
Entry requires
an explicit click. History and a same-origin canonical title link provide return
paths. Copy failure leaves the URL selected for manual copying. Local preview
links work only on devices able to reach that preview; they are not public links.

## First success and installation evidence

The self-host page compares the flat catalog, zero-setup hosted 3D experience and
optional Plex/Jellyfin/Emby-connected installation. It links to the maintained
README quick start and releases, not an invented installer or paid plan. The
first-success checklist covers platform launchers/Docker, choosing services,
the valid empty-store start, optional existing media servers, browsing, and the
difference between provider link-out and actual playback. There is no LAN scan,
connection form, credential collection or pairing backend in the public site.

The current published release, re-checked 2026-10-10, is `v0.25.0`
(2026-10-07), still with no release assets attached. The README is the current
installation guide; links do not promise a prebuilt desktop download. This wave
does not claim a fresh-reader install of that release or physical-phone tests.

## Action signals and denominators

There is no analytics SDK, collector, cookie, identifier, storage, beacon or
network submission. A separately reviewed on-page observer could listen to
`halcyon:cta` with exactly `{version:1, event, surface}`. Surfaces are bounded to
title, store, self-host, about and browse; no URL, search, media ID, credential or
personal-library field is emitted.

| Signal | Meaning | Possible denominator, if collection is approved later |
| --- | --- | --- |
| `page_view` | This document's script initialized | Document views, not unique visitors |
| `watch_options_opened` | First disclosure opening per document | Title document views |
| `outbound_click` | Activation of a watch-options link | Watch disclosure openings |
| `store_entry` | Explicit bridge entry click | Store bridge document views |
| `installation_guide_visit` | Guide or releases link click | Self-host document views |

Counts are not collected by this implementation. Repeated clicks and document
reloads are not unique people. An outbound click does not prove navigation,
subscription, playback or completion; a guide click does not prove installation.
Fixture watch links remain disabled, so no real provider conversion is claimed.

## Remaining release gates

Project-specific catalog/image permissions and deployment decisions from
#354–#356 are still unresolved (the owner chose a pages.dev preview address first on 2026-10-11). The receiver is released (see above). An explicitly
configured canonical catalog origin (blocked on #356), physical-phone
flat-to-3D-to-return acceptance, and a fresh-reader installation of a named
release are still required before #357 can be complete. The public site has not
been published by this increment. Existing root rendering work is independent.
