# Children’s-section entrance arch — reference and host investigation (#206)

Status: blocked on original reference and a reserved family-area host,
2026-09-11. **Issue #206 is not complete.** No arch mesh, Blender source,
runtime registration, or placement is delivered by this investigation.

## Reference findings

Read the live [work order](https://github.com/halcyon-video/halcyon-video/issues/206)
and [shared delivery contract](https://github.com/halcyon-video/halcyon-video/issues/151).
The work order requires confirming the portal’s shape and mounting from the
original 1993 walkthrough reference. Its comments supplied no additional source.

The related [chair issue #281](https://github.com/halcyon-video/halcyon-video/issues/281)
names `chain-kids-clubhouse-corner.jpg` and describes a red-carpet opening,
flanking family shelving, a TV, and two chairs. That is a written reference
lead; the photograph was not located or independently inspected here.

Local searches covered the checkout, the nearby project and input copies,
task reference directories, Downloads, and Pictures.
Only unrelated candy stills were found locally. The archive repository’s
`master` recursive tree returned `truncated: false` and no matching reference
paths. This does not establish that the owner’s private archive is absent.

The audit identifies 1993 video leads `HFNfVDQdMxs` and `rUhRHo44CIA`.
Web retrieval failed; local `yt-dlp` attempts returned API precondition errors
and no downloadable video format. No frame from these attempted downloads
was inspected. A web search did not establish the commissioned construction.
The original study/photo location has been requested.

Unresolved: opening silhouette, lintel thickness and return depth, upright
section, floor versus shelving attachments, rear bracing, edge treatment,
and dimensions. A generic semicircle would not confirm any of these details.

## Existing scene and integration constraints

`src/store-layout.ts` groups animation/family/kids/children genres as FAMILY.
That categorization does not reserve a children’s nook or establish an arch
mount. The assembled fixture list in `src/store-shell.ts` has no dedicated
family-area host. `src/store-fixtures-config.ts` explicitly retains open
front corners; placing a portal there would require a deliberate layout change.
The separate #281 report describes an unlanded chair host contract; no
`CHILDREN_NOOK` or chair implementation exists in this checkout’s baseline.

Absence behavior remains unchanged: all current stores omit the arch. A future
placement must require actual family stock and an explicitly reserved suitable
area, and omit the entire assembly when the store cannot accommodate it.
Store width or a FAMILY label alone is insufficient evidence of fit.

Use feet, floor origin at the opening centre, local X across the opening,
local +Z toward the approach. The existing Blender convention
`(x, -store_z, height)` exports to Three.js `(x, height, store_z)`.
Choose dimensions only after inspecting the reference and host. Record
minimum underside headroom across the full walkable opening, support/base
bounds, approach and turning space, and clearance to shelf browse cameras,
ceiling fittings, and any TV/chairs. These measurements are not yet available.

Navigation must represent the two bases/uprights separately. A single solid
bounding rectangle spanning the portal would incorrectly block its passage.
The current fixture API exposes one optional `getFootprint()` rectangle and
the build loop collects one per fixture; support multiple support footprints
deliberately at integration, or use separate validated support markers. Keep
the overhead lintel out of the floor obstacle set while checking its headroom.

Register the completed fixture through `src/fixture-registry.ts`, assemble
its admitted placements in `src/store-fixtures-config.ts`/`src/store-shell.ts`,
and preserve `installDisplayModel` fallback, detached-load rejection, disposal,
and render/shadow refresh behavior. Verify texture ownership explicitly: the
current helper releases geometries and materials, not embedded textures.
Keep this decorative assembly out of stock slots and interaction targets.

## Remaining delivery and verification

After recovering the reference, establish the host and author fitted uprights,
lintel joins, base attachments, and finished edges as editable Blender meshes.
Deliver the reproducible authoring script, `.blend`, optimized runtime export,
named physical parts/material roles, useful UVs, and provenance notes. Public
geometry must remain original and brand-free; faithful reference derivatives
and branded skins belong in ignored user-assets under the #151 contract.

Meet the commissioned surface requirements with calibrated paint roughness,
fine grain and normal/bump relief, physically plausible reflectance, and no
pitch-black albedo below 0.08. Preserve replaceable theme finishes and record
texture sizes, memory ownership, bounds, triangles, vertices, draw primitives,
and export bytes. No resource costs can be claimed for an unbuilt model.

Inspect matching before/after photographs at the actual family anchor plus
side/rear mounting details. Exercise small/absent-family stores, populated
hosts, navigation through the opening, adjoining browse cameras, failed loads,
removal during load, teardown, and rebuild. Run `npm test && npm run build`.
Baseline checks of this documentation change do not satisfy model acceptance;
there are no after photographs or geometry/lifecycle results yet.
