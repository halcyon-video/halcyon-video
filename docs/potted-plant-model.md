# Tall ficus construction model

The mom-and-pop store's tall ficus (`potted-plant` fixture, `variant: 'tall-ficus'`)
now loads a Blender-authored construction kit — a thick-walled lathed planter,
a tapered multi-stem trunk, two curved branch profiles and two creased leaf
blades — and stamps it into a branching tree with credible attachment,
per-instance growth variety, and a fraction of the previous draw calls. The
other three plant variants (`floor-palm`, `snake-plant`, `pothos`) are
unchanged procedural geometry, out of scope for this model (separate work
orders).

Blender source: `tools/models/potted-plant.py`. Rebuild with
`blender -b -t 2 --python tools/models/potted-plant.py`. Runtime kit:
`public/models/ficus-components.glb` (~41 KB, 980 triangles, no textures),
installed by `src/ficus-model.ts` and stamped by
`src/fixtures/potted-plant.ts`'s `buildTallFicus`.

## Placement contract

Store units are feet; runtime Y is up. Blender authors local (x, y, z) with
Z as the growth/height axis throughout — the pot's height, the soil dome's
rise, the trunk/branch tube's length, and each leaf's length all run along
Blender Z — so after the kit's `export_yup` (Blender Z-up → glTF/Three
Y-up), every part's local +Y is "grows outward," letting the runtime treat
Trunk, BranchA/B and LeafA/B identically when composing placements. Bow/fold
perpendicular offsets live on Blender X/Y (→ Three X/Z).

The pot preserves the original fixture's footprint contract exactly: outer
top radius 0.64 ft, pot height 1.40 ft, `PottedPlant.buildTallFicus` still
returns `(0.64 + 0.05) * 2` as the collision footprint diameter, matching
`momAndPopPlantPlacements`'s existing `plant-shelves-left`/`plant-shelves-right`
anchors (x=8.6/13.4, z=1.65, yaw ±0.6) unchanged. `SOIL_SEAT_Y` (pot height
minus 0.24 ft) and `TRUNK_BASE_Y` (pot height minus 0.02 ft) in
`src/ficus-model.ts` mirror the Python profile's `SOIL_SEAT_Y`/trunk
placement exactly — change one, change the other.

## Construction

- **Pot** — a single lathed (`bmesh.ops.spin`) revolve of a profile that goes
  up the outside, over a rolled rim bead, back down the inside to a recessed
  interior floor (the soil seat), and closes at a footed base — a genuine
  0.045–0.075 ft wall thickness throughout, not a single-skin cylinder with a
  separately bolted-on rim collar.
- **Saucer** — a shallow lathed dish under the pot.
- **Soil** — a shallow lathed dome sized to the pot's interior radius at the
  soil-seat height, sitting on that recessed shelf rather than floating at
  the rim plane.
- **Trunk** — one S-curved, tapered (0.075→0.038 ft radius) multi-segment
  tube swept along an authored centreline (`tube()` in the Python script);
  the runtime instances it three times at different azimuths, base offsets
  and scales for the stem cluster.
- **BranchA / BranchB** — two unit-length (local Z 0..1), differently-bowed
  tapered limb templates. The runtime scales Z to a per-branch target length,
  applies a tilt (rotateZ, since the template's bow lives in local X) and an
  azimuth (rotateY), alternating A/B across the canopy so it doesn't read as
  one shape stamped seven times.
- **LeafA / LeafB** — explicit 3-verts-per-row creased blades: the centre rib
  is pulled below the edges as a real V-fold (not a flat card), with a droop
  curve and a mild lateral wave. UVs are hand-assigned (0/0.5/1 across each
  row) to match the runtime's canvas-painted `ficusLeafTex()` venation map,
  unchanged from the prior procedural version.

Every part is smooth-shaded before export — flat per-face normals on an
8–20-sided approximation of a curved pot wall, limb or leaf fold read as
faceted glass and threw harsh specular chips at grazing angles; smooth
shading (with the leaf material eased to `roughness: 0.78`) keeps the sheen
without the blown-out highlights. Every closed part (Pot, Saucer, Soil,
Trunk, BranchA, BranchB) is manifold-checked (`assert not bad` in
`finish_and_check`) and asserted to have positive volume (outward normals)
before export; the two leaf blades are genuine open two-sided shells
(`open_surface`) and are exempt from the manifold check, matching the
`av-decks.py` convention for flat authored surfaces.

## Loading, assembly and ownership

`buildTallFicus` builds the original procedural geometry first, into its own
child `THREE.Group` (the fallback), for an immediate, fully-formed plant and
an unchanged synchronous footprint/collider. `installFicus` (in
`src/ficus-model.ts`) then loads the kit — once per page load, cached forever
at module scope like this file's sibling canvas leaf textures — and on
success builds one plant's transformed pieces (three trunk copies, seven
alternating branch copies with their own leaf clusters sampled off each
branch's own authored curve, plus a crown cluster at the canopy core), merges
each material role into one `BufferGeometry` via `mergeGeometries`, and adds
four meshes (pot+saucer, soil, bark, leaf) to the fixture's group. The
fallback's pot mesh stays in the scene, hidden (`fallback.visible = false`)
rather than removed, so it keeps serving as the registered collision proxy.
A missing or failed GLB load leaves the fallback as the permanent plant — the
same "keep the built-in geometry" contract `shelf-model.ts` uses. A fixture
disposed while the kit load is still in flight is guarded by a `disposed`
flag and an `installFicus(...).cancel()` call, so a late-arriving load never
touches a torn-down group.

Per-instance randomness (branch azimuth/length/tilt jitter, leaf
template/scale/rotation, trunk base offsets) is seeded from the fixture's
placement id via a small string hash + mulberry32 PRNG, so a given store
layout reproduces the same tree shape across rebuilds rather than reshuffling
on every load.

## Resource cost

Per placed ficus, merged: pot+saucer 640 triangles (1 draw call), soil 96
triangles (1), bark (3 trunk + 7 branch copies) ~592 triangles (1), leaf
(7×14 branch-cluster + 18 crown = 116 blades × 32 triangles) ~3,712 triangles
(1) — **~5,040 triangles in 4 draw calls**, versus the prior procedural
version's ~2,884 triangles spread across **~96 separate meshes/draw calls**
(one `THREE.Mesh` per stem, branch, and leaf card). The store places two tall
ficus trees (mom-and-pop only), so the net effect is roughly -184 draw calls
and +4,300 triangles store-wide — the right trade given draw-call overhead
dominates over a few thousand triangles. The hidden fallback geometry for
each instance remains allocated (never disposed, matching the collision-proxy
contract above) but contributes no render cost while hidden.

## Verification

`tests/potted-plant-model.test.ts` parses the shipped GLB with the runtime's
own `GLTFLoader`: asserts all eight named parts are present with finite,
correctly-sized position/normal/UV attributes, no embedded images, a
triangle/byte budget, the pot's rim shows a genuine multi-radius (thick)
wall rather than a hairline shell, the soil sits on a recessed seat below
the rim, and the trunk/branch templates taper meaningfully from base to tip.
`npm run build` and the full `npm test` suite (473 tests) pass. In-app
verification: `node tools/asset-shot.mjs --kind fixture --name potted-plant
--options '{"variant":"tall-ficus"}'` for the isolated fixture, and
`node tools/shot.mjs --set bb_store_format=mom-and-pop --walk 8.6,6,0` for
the in-store front/side/rear views flanking the centre shelf run.
