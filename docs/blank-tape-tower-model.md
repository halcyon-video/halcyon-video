# Wire blank-tape tower — reference and dependency investigation (#201)

Status: blocked on reference and the #200 shared placement contract, inspected
2026-09-11. **Issue #201 remains unresolved.** No model or store placement is
delivered by this investigation.

## Evidence

Read the live [work order #201](https://github.com/halcyon-video/halcyon-video/issues/201),
[podium dependency #200](https://github.com/halcyon-video/halcyon-video/issues/200)
and [delivery contract #151](https://github.com/halcyon-video/halcyon-video/issues/151),
including comments. #200 is open with no comments or delivered attachment
contract. Its paper catalog podium is absent from this checkout, as is the
blank-tape tower. Neither fixture has a registry entry, fallback, consumer,
stock interaction or reserved placement to preserve.

Searched local filenames under `/home/devin`, and project/reference text under
the worker workspace, Downloads and Pictures for `videolog-podium` and
`blank-tape tower`. The matches were work orders and dispatch records, not
original studies or photographs. Inspected the saved archive repository tree
from the #244 investigation: 429 entries, `truncated: false`, no podium,
videolog, blank-tape or reference-study path. This does not establish absence
from the owner's private archive. Web searches for the lead and catalog/podium
tower did not recover the original study. Search results for other tape
displays are not evidence of this object's construction.

No original tower image
was obtained or inspected, and no period-fidelity claim is made. Requested
the original study/stills location and #200's placement contract from the
owner during the task.

## Contract to establish before modeling and integration

The existing project convention is feet, authored as Blender
`(x, -store_z, height)` and exported Y-up to store `(x, height, store_z)`.
Use a floor datum for this freestanding assembly if the reference confirms
that construction. Dimensions, orientation, number of stock levels and
columns, wire gauge, bracing and foot layout remain unmeasured.

Confirm the shared podium/tower datum, yaw, each complete footprint, their
separation, approach clearance and era/format admission with #200. Determine
whether there are shared fittings or simply two separate freestanding
objects. Existing explicitly open front corners and navigation lanes in
`src/store-fixtures-config.ts` are constraints, not unassigned host anchors.
Do not commission a duplicate podium or silently select a new floor location.

Once the reference and contract are available, construct continuous wire
uprights, repeated pockets with real bottom supports, fitted rear bracing
and stable feet. Every carton bottom must contact its support; retaining
wires and carton depth must leave stock physically seated. Model folded
paperboard cartons with thickness, flap seams and eased folds. Keep carton
origins and pocket support datums reusable and record uncertain dimensions.

Retain separate named physical parts in the editable Blender source. Suggested
material roles are `TowerCoatedWire`, `TowerHardware`, `TowerFootRubber`,
`CartonPaperboard` and `CartonPrint`; these are proposals, not delivered assets.
Provide UVs, calibrated reflectance/roughness, fine grain and normal relief,
with albedo no lower than 0.08 under the commissioning mandate. Generic public
geometry belongs in `tools/models/` and `public/models/`; owner-reference
derivatives and branded imagery stay in ignored user-assets under #151.

## Runtime and acceptance work remaining

Follow `installDisplayModel` and `assetUrl` conventions: retain procedural
fallback until successful load, refresh render/shadows, cancel installation
on removal, and release imported geometry/materials. Its current cleanup
does not dispose embedded textures, so explicitly account for texture
ownership when integrating textured assets. Preserve shared theme material
ownership and whatever navigation/interaction contract is established with
#200. No runtime changes are made here.

Deliver the reproducible script, editable `.blend`, optimized GLB, measured
bounds, UV/material/provenance notes, triangle/vertex/primitive counts,
texture dimensions/memory and file bytes. Inspect matching before/after
in-store views at the confirmed anchor, plus side, rear, base and pocket
support details. Verify clearance beside the actual podium, failed-load
fallback, disposal during loading, rebuild and admitted layout variants.
Run `npm test && npm run build` after implementation. Passing baseline checks
for this documentation does not satisfy these outstanding model criteria.
