# Copier/fax #190 — reference gate outstanding

Status: **blocked on reference; issue not resolved** (2026-09-11).
No copier geometry, runtime integration, or period-fidelity claim is delivered.

## Evidence audit

Read issue #190 and the shared delivery contract in
[#151](https://github.com/halcyon-video/halcyon-video/issues/151).
The issue requires a sufficiently complete reference **before** authoring the
shell, scanner lid, document feeder, trays, panel, and cable route.

The `late-era-fixtures-2012` checkout study and its original photograph were
not found in this worktree, the main project checkout, the worker input tree,
or the searched local reference/input locations. The main checkout's
`public/user-assets` contains only its README. Existing telephone, scanner,
and cash-housing modules refer to optional assets in that archive; their path
strings are not evidence of a copier's shape or dimensions.


Additional public research retrieved and visually inspected these photographs
by RetailRyan, taken December 16, 2012 in Hampton, Virginia:

- [8279724108](https://www.flickr.com/photos/ryanrules/8279724108): sales floor.
- [8279724248](https://www.flickr.com/photos/ryanrules/8279724248): checkout
  context, with equipment too distant/occluded to identify the requested copier.
- [8278664363](https://www.flickr.com/photos/ryanrules/8278664363): wide store view.

These are research leads, **not confirmed originals of the named study**.
They do not establish a sufficiently complete copier reference. Downloaded
research photographs remain in ignored `scratch/reference/`; no source pixels
or derivative assets are committed.

## Integration findings for resumption

Halcyon scene units are feet. `counterFrame()` in `src/counter-anchors.ts`
provides the checkout frame; it does not itself identify a support surface.
`counterOfficeKitAnchor()` in `src/store-fixtures-config.ts` and its installation
in `src/entrance/index.ts` provide a relevant lifecycle/placement example.

The shield's rear band is a candidate staff-side support, with top Y=3.54 ft,
depth 1.5 ft, and a clear straight span documented as X=6.2..15.8 for the
standard store. The existing office kit occupies approximately X=11.33..14.80,
Z=7.19..8.40; a rear information board occupies adjoining space. U-square and
independent desk formats have no equivalent rear support. A large copier must
not be shrunk to fit this ledge or placed over existing equipment. Its actual
footprint, feet, operating face, cable clearance, and support must be assessed
after reference acquisition. No new anchor has been asserted to be valid.

## Required input and remaining delivery

Obtain the original checkout photograph/study (local path or accessible URL)
and enough supplemental views or a manufacturer/model identification to resolve
the machine's depth, feeder/trays, rear connections, and support. Dimensions
and confidence remain unknown. Confirm whether the reference describes one
multifunction unit or separate copier and fax devices.

Then author the editable Blender source and reproducible script, physical PBR
surfaces with UVs and grain/normal relief, optimized GLB, material/attachment
roles and provenance. Integrate with era/format gates, fallback and asynchronous
teardown, verify support/clearance, inspect before/after in-store and side/rear
views, measure resources, and rerun tests/build. None of these model-delivery
checks is claimed complete by this audit.
