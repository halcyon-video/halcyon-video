# Folding sale table and bent-wire rack

Original Blender construction for #167 and #168. The existing fixture supplies
the six-by-two-and-a-half-foot table envelope, 30-inch top, three tiers on each
long side and eleven columns per tier. No third-party geometry, reference pixels,
printed marks or new texture downloads are included. The archived retail view
was inspected privately to distinguish the black drape and wire cradles from a
solid stepped cabinet. Concealed folding legs and joinery are original design
choices, not measured historical hardware.

`tools/models/sale-table.py` reproduces `sale-table.blend`, two GLBs and measured
resource receipts. Run Blender with an absolute script path and
`--python-exit-code 1`. Units are feet, authored as `(x,-store_z,height)` and
exported Y-up. The source retains separate named physical parts and UVs; its
initial viewport separates the rack from the table for editing.

The table includes a fitted eased laminate top, underside rails, bent folding
leg frames, pivot brackets, diagonal locking braces and nonmarking feet. Its
static cloth follows the top and skirt as a continuous thick surface. Folds
widen toward a turned hem roughly an inch above the floor. The full cloth stays
inside the existing 6.20 by 2.70-foot navigation footprint.

The rack uses rounded continuous rims and retaining fences, supporting cross
wires, stepped end frames and feet. A shared central top rail avoids doubled
coplanar geometry. Two named stems and spring clips preserve the live offer
board. Runtime adjusts their height to the existing medium's case height; the
paper geometry, material, colorway and readable reverse face are unchanged.

| Export | Triangles | Bytes | Export meshes | Installed draws |
|---|---:|---:|---:|---:|
| sale-table.glb | 11,240 | 350,068 | 4 | 4 |
| sale-table-rack.glb | 8,540 | 415,208 | 5 | 1 |

Runtime batches the rack after positioning its named supports. Source solids
pass manifold and face-area checks. The imported cloth uses the existing dark
matte finish without the fallback's baked vertex shading. Other named roles are
`TableTop`, `TableFrame`, `TableFeet` and `RackWire`. These are geometry costs,
not physical-phone performance measurements.

`PvDrapeTable` retains all 66 slot keys, movie identities, transforms, capacity,
stock refresh, era gate, placement selection, collision proxy and footprint.
The two imported families use the established deferred model loader and GPU
preparation. Failed loads retain their respective complete fallbacks; cancelled
or detached arrivals release their resources. Repeated disposal is safe, and
the retained fallback rack now releases its instance buffer as well as its
geometry and material. There is no cloth simulation or added per-frame work.

`tests/sale-table-model.test.ts` loads the actual exports and checks floor and
tabletop contact, hem clearance, footprint limits, six support heights, two
adjustable print supports, UVs/normals and resource budgets.
`tools/verify-sale-table.mjs` verifies VHS and DVD slots, unchanged footprints,
five installed draw calls, successful/failed/late/detached loads and exactly-once
resource disposal. Its installed phase uses the existing `saletableproof`
checkpoint, which visits both browsing faces, then captures before/after, rear
and side phone views. `--installed-only` redoes photographs without repeating
the already-proved lifecycle checks. The normal build and full suite are the
landing gate. Public evidence is in `scratch/publicity-kits/remaining-models/`.
