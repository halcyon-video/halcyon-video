# Retractable floor banner stand — planning only (#282)

**Status: ON HOLD — Australian-only reference.** Do not author a model,
export assets, register a fixture, or add a placement while this hold applies.
This document records the permitted planning work; it does not complete the
model delivery or lift the regional restriction.

## Evidence and release condition

[Issue #282](https://github.com/halcyon-video/halcyon-video/issues/282) identifies
[Flickr photo 8682289861](https://www.flickr.com/photo.gne?id=8682289861) as the
Australian reference. Its audit describes a tall yellow banner with a rounded
metallic floor cassette and extended support foot, behind/left of a draped sale
table and ahead of family shelving. These observations are inherited from the
issue; the original photograph was not independently inspected for this plan.
Printed characters are excluded from the hardware scope.

Before implementation, record an explicit owner decision revisiting the AU
restriction, or suitable non-AU evidence confirming the intended style under
the issue's acceptance condition. A generic commercial banner reference alone
does not establish that this fixture belongs in the intended store. The live
issue and its comments were checked during this pass; no explicit regional
release was found. Dispatch of the ticket does not by itself settle that gate.

## Dimensions and construction to resolve after release

| Property | Provisional envelope | Confidence |
| --- | --- | --- |
| Width | 2.5–3 feet | Low; not measured |
| Deployed height | 6–7 feet | Low; not measured |
| Cassette depth | 3–5 inches (0.25–0.417 feet) | Low; excludes stabilizer |
| Deployed foot span and rear pole projection | Unknown | Needs reference |
| Collapsed envelope, wall thickness and joints | Unknown | Needs reference |

Inspect clear original front, side, rear/support and collapsed-detail evidence
before fixing dimensions. Resolve foot count and swivel/folding mechanism,
pole socket and pole joints, cassette end-cap seams, banner exit slot, and
upper gripping-rail attachment. Do not treat hidden construction as measured.
The snap-frame stand (#235), cardboard standee (#243), and shelf-top support
(#238) are different hardware families, not substitute models.

## Proposed authoring contract (inactive)

Follow [#151](https://github.com/halcyon-video/halcyon-video/issues/151) and the
[checkout-counter workflow](checkout-counter-model.md). Proposed source paths
are `tools/models/retractable-banner-stand.py` and
`tools/models/retractable-banner-stand.blend`, with runtime export at
`public/models/retractable-banner-stand.glb`. None is created by this plan.

Use feet and document export scale. Proposed origin is the floor beneath the
cassette centre; Blender `(x, -store_z, height)` maps to store coordinates.
Publish named pole-socket, upper-rail and artwork attachment anchors, and
record their actual transforms after authoring. Keep the cassette, end caps,
stabilizer feet, rear pole, upper gripping rail and thin tensioned banner
editable and named. Model physical thickness and joins with intentional mesh
topology and useful UVs; instance repeated compatible parts.

Proposed material roles are aluminum housing/rail, end-cap plastic, foot pads,
support metal, and replaceable banner artwork. Public artwork must use the
active brand palette/LogoSpec and bundled typefaces. Keep source-derived skins
and private references in the ignored user-assets library. Record measured
bounds, triangles, material primitives/draw calls and texture costs on delivery;
there are no measured geometry costs yet.

## Proposed integration and verification (inactive)

The checkout contains no retractable-banner fixture registration or model
identified by this name. Future integration belongs in
`src/fixtures/retractable-banner-stand.ts`, `src/fixture-registry.ts`, and
`src/store-fixtures-config.ts`. Do not add a disabled registration or placement
as a shortcut around the hold.

After release, confirm an optional store/era placement independently of the
photograph's relative location. The existing draped table has its own runtime
placement and browse-camera clearance requirements; the reference does not
provide safe world coordinates. Include deployed feet and rear supports in
the navigation footprint. Check aisle access, adjoining shelving and table
clearances, browse-camera approaches and headroom across supported layouts.

Preserve procedural fallback on missing/failed loads, shared resource ownership,
late-load teardown, disposal, render-on-demand/shadow refresh and existing
interactions. Verify both loaded and fallback states and fixture removal.
Capture front, side, rear/support, collapsed-detail and installed eye-level
views from a tree without private user-assets. Deliver the editable source,
reproducible script and optimized GLB, with dimensions, anchors, provenance and
costs documented. Run `npm test && npm run build` after integration. Passing
checks on this planning-only change does not validate a model or placement.
