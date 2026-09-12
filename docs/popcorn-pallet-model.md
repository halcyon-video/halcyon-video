# Popcorn pallet — reference investigation (#202)

Status: reference blocked, 2026-09-11. **Issue #202 remains unresolved.**
No Blender model, runtime export, registration or placement is delivered by
this investigation.

## Evidence inspected

Read the live work order [#202](https://github.com/halcyon-video/halcyon-video/issues/202)
and shared [#151 delivery contract](https://github.com/halcyon-video/halcyon-video/issues/151),
the fixture registry/configuration, display-model loader, checkout-counter
model workflow, and the sibling `docs/popcorn-wire-rack-model.md` investigation.
The issue has no comments supplying a reference or placement.

The local candy reference audit identifies 1993 Part II as `rUhRHo44CIA`.
Visually inspected the locally recovered `rUhRHo44CIA/f0063.jpg` (tape time
00:18:26:14). It shows checkout candy racks, people and counter equipment;
it does not establish the commissioned popcorn stack, its base, or footprint.
No source image was copied into the repository.

Searched local checkout/project/task filenames and Downloads/Pictures for
popcorn, pallet, and the video ID. Inspected the saved archive repository tree
in the #244 outbox; it does not expose the private stills or popcorn study.
Web searches for the specific video and popcorn pallet did not recover a
usable original reference. A fresh yt-dlp retrieval of
`https://www.youtube.com/watch?v=rUhRHo44CIA` failed with HTTP 400/precondition
errors and no downloadable video format. The failure log is retained in the
private #202 outbox. This does not prove the source is absent from the owner's
archive. Requested a local path to the study or original footage.

## Resume contract

Inspect the original popcorn view before choosing its silhouette, carton
arrangement, base and relationship to #203's hanging-bag rack. Distinguish
visible construction from uncertain dimensions and hidden support assumptions.
The existing scene uses feet: Blender `(x, -store_z, height)` exports to
Three.js `(x, height, store_z)`. A floor-centred origin with local +Z approach
face is a proposed convention, not an established promotion anchor.

No popcorn fixture, stock interaction or reserved host exists in the current
registry/configuration. Establish the combined #202/#203 envelope and approach
clearance before adding either object. Existing checkout bays hold the release
cart and sale table; front corners explicitly remain open, and the central
corridor already hosts spaced displays and navigation cameras. Do not infer a
free placement from a blank patch in a single view. Gate floor displays out of
compact formats, and establish the supported era from the reference.

Author separate editable pallet/base parts and reusable corrugated cartons,
with actual wall thickness, fitted flaps, seams and supported stacking variation.
Keep graphics original and generic in public assets; owner-derived geometry
and branded graphics belong in ignored user-assets. Deliver source `.blend`,
script, optimized GLB, UVs, named material roles and dimensions/provenance notes.
Use fibre/wood grain, normal relief and calibrated roughness, with albedo at
least 0.08 under the commissioning mandate.

Use the established `installDisplayModel`/`assetUrl` conventions for fallback
replacement, render/shadow refresh and cancellation on removal. Its current
release path disposes geometry/materials but not embedded textures: explicitly
resolve texture ownership before shipping a textured asset. Retain navigation
and any future interaction ownership rather than creating phantom stock slots.

Acceptance still requires measured bounds, triangles, vertices, draw primitives,
materials, texture dimensions/memory and file sizes; inspected matching
before/after in-store views plus side/rear/base support details; failure-load,
removal-during-load and rebuild checks; admitted layout variants; and
`npm test && npm run build`. Baseline checks on this documentation change do
not satisfy model or integration acceptance.
