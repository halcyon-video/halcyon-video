# Blank aisle pylon and low riser #170 — reference outstanding

Status: **blocked on reference; issue remains unresolved** (2026-09-11).
This audit delivers no Blender model, runtime mesh, or store placement.

## Evidence audit

Read [#170](https://github.com/halcyon-video/halcyon-video/issues/170), its
comments/timeline, and the [#151 delivery contract](https://github.com/halcyon-video/halcyon-video/issues/151).
The confirmed brief is a **blank tapered laminate pylon**, a low cream-topped
riser, and a joined base. The retired poster-kiosk name is not permission to
add a poster, frame, screen, or merchandise face.

Neither the retired poster-kiosk study nor the corrected aisle-pylon-riser
study was recovered from the worktree, main checkout, worker task directories,
or searched Pictures/Downloads locations. Searches included filename variants
and study text. The main checkout's `public/user-assets` has only its README.
The available archived repository tree at commit
`636cd6ff15db47dbe72159f9fbd91678fa7f25a7` contains no matching study path.
Local Git history searches for pylon/poster-kiosk subjects found no match.
Exact-name public web searches did not recover the original reference either.
This records the searched evidence, not an assertion that the owner's archive
does not contain the study.

No original photograph was inspected; no period-fidelity claim is made.

## Integration findings

`src/fixture-registry.ts` has no aisle-pylon or poster-kiosk registration;
`src/store-fixtures-config.ts` has no placement for this family. Consequently
there is no existing pylon fallback, collider, stock anchor, or interaction to
replace. An unrelated games promotional pylon is printed signage, not this
fixture. No runtime code was changed during this audit.

The shared model pipeline uses feet, with Blender `(x, -store_z, height)`
exported to Three.js `(x, height, store_z)`. For resumption, establish a floor
origin, yaw/front convention, pylon and riser bounds, contact/join geometry,
and base footprint from the study before authoring. Dimensions, taper direction,
depth, hidden construction, and exact consumer anchor remain unconfirmed.

`src/fixtures/catalog-podium.ts` is a relevant static fixture lifecycle example;
its corporate/bb-1990 gate and checkout position are specific to that object,
not evidence of this pylon's anchor. `src/fixtures/display-model.ts` provides
base-path resolution, asynchronous cancellation/detachment handling, owned
geometry/material/texture disposal, replaceable finish roles, fallback hiding,
and render/shadow refresh. Reuse those conventions when integrating. Determine
the complete base collision footprint and circulation clearance before adding
a default placement; the layout validator supports explicit clearance.

## Required input and remaining delivery

Supply a local path or accessible URL to the original reference and corrected
study, including any recorded dimensions and intended aisle placement. A request
for that input was made during this audit. Useful supplemental side/rear/base
views are needed to distinguish observed construction from estimated details.

Then author named editable physical parts, fitted joins and eased edges, UVs,
interchangeable laminate/top/base material roles, fine surface grain and normal
relief, and calibrated roughness with the commissioned albedo floor. Save the
reproducible authoring script, `.blend`, and optimized GLB. Under #151, original
generic assets use the public model pipeline; owner-reference derivatives stay
in ignored local user-assets with their provenance.

Completion still requires actual store integration, inspected before/after
in-store and side/rear/base photographs, measured bounds/triangles/materials/
textures/file size, exported UV/topology checks, lifecycle/placement verification,
and passing tests/build. Baseline tests cannot substitute for those deliverables.
