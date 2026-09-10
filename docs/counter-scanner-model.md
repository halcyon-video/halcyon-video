# Optional later handheld scanner

The bb-2010 counter can load a decorative scanner from the active brand pack's
`fixtures/late-era-fixtures-2012/scanner/model.glb`, then from the same path
under `public/user-assets`. The owner-reference asset, editable Blender source,
authoring script, measurements and provenance remain in that local collection.
No scanner is added to earlier themes. A missing asset retains the empty desk.

The model uses feet, Y up, with its contact plane at Y=0 and grip along +Z.
Placement uses the existing counter-top anchor and yaw beside the left terminal;
the cable ends at a flush worktop grommet. It is decorative and introduces no
interaction or navigation anchor. Installed geometry/materials follow signage
cleanup; late asynchronous arrivals and owned textures are disposed explicitly.

Delivered local mesh: 2,860 triangles, nine mesh primitives, four material roles,
zero textures, 118,280 bytes. Every primitive carries UVs and normals; authored
solids pass manifold-edge checks. Housing, grip, trigger, lens, two contact rests,
strain relief, continuous coiled cord and grommet have separate named parts.
Dimensions and obscured details are estimates, documented in local NOTES.md.

Verification uses the existing tools/shot.mjs in-store camera workflow, including
missing-model and earlier-era cases. Evidence is retained locally under
scratch/publicity-kits/issue-187 and in the dispatched conversation outbox.
