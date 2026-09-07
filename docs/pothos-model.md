# Countertop pothos construction model

The mom-and-pop store's counter-desk pothos (`potted-plant` fixture,
`variant: 'pothos'`) loads a Blender-authored construction kit — a
thick-walled lathed desk planter, two cascading vine templates, a leaf
petiole and two creased cordate blades — and stamps it into a trailing plant
with real vines, real leaf attachment, per-instance growth variety, and a
ninth of the previous draw calls. Sibling of the tall-ficus kit documented in
`docs/potted-plant-model.md`; `floor-palm` and `snake-plant` remain
procedural geometry, out of scope here (separate work orders).

Blender source: `tools/models/pothos.py`. Rebuild with
`blender -b -t 2 --python tools/models/pothos.py`. Runtime kit:
`public/models/pothos-components.glb` (~37 KB, 862 triangles, no textures),
installed by `src/pothos-model.ts` and stamped by
`src/fixtures/potted-plant.ts`'s `buildPothos`.

## Placement contract

Store units are feet; runtime Y is up. Blender authors local (x, y, z) with
Z as the growth axis throughout — the pot's height, the soil dome's rise,
each vine and petiole tube's length, and each blade's length all run along
Blender Z — so after the kit's `export_yup` (Blender Z-up → glTF/Three Y-up)
every part's local +Y is "grows outward". Bow and fold offsets live on
Blender X and Y (→ Three X and Z).

The pot preserves the fixture's existing contract exactly: outer top radius
0.32 ft, pot height 0.48 ft, and `PottedPlant.buildPothos` still returns
`(0.32 + 0.03) * 2` as the pot diameter. The species is unchanged (golden
pothos, `pothosLeafTex()`), and so is the placement: the single
`counter-desk-plant` anchor in `src/store-fixtures-config.ts`
(`surfaceY: 2.82` on the checkout desk, mom-and-pop format only, gated on
`activeStoreFormat().plants`). Because that placement passes `surfaceY`, the
fixture reports **no footprint and registers no collider** — as before —
so the plant stays optional scenery in every shop layout: a format with
`plants: false` simply never places it, and nothing else in the store plan
depends on it.

`POT_H`, `RIM_R` and `SOIL_TOP` in `src/pothos-model.ts` mirror the Python
profile's `POT_H`, `R_TOP_OUT` and soil-seat height exactly — change one,
change the other.

## Construction

- **Pot** — one lathed (`bmesh.ops.spin`) revolve of a profile that climbs
  the outside, rolls over a rim bead, comes back down the inside to a
  recessed interior floor (the soil seat), and closes at a footed base ring:
  a genuine 0.030 ft (0.36 in) wall section throughout, not a single-skin
  cylinder with a separately bolted-on rim collar.
- **Saucer** — a shallow lathed drip tray under the pot.
- **Soil** — a shallow lathed mound sized to the pot's interior radius at the
  soil-seat height, sitting on that recessed shelf a watering gap below the
  rim rather than floating at the rim plane.
- **VineA / VineB** — two unit-span (local Z 0..1) tapered cascade
  templates swept along authored centrelines, bowing 1.05 and 1.35 units in
  local +X respectively. The runtime swings local +Z out over the rim, so
  that authored bow IS the hang; `span` and `drop` scale separately, which is
  what lets a vine reach across a counter without the drop scaling with it.
- **Petiole** — the short leaf stalk. Every blade in the plant hangs off one
  of these instead of floating at a vine node; at counter viewing distance
  the stalk is what makes the attachment read at all.
- **LeafA / LeafB** — explicit five-columns-per-row (edge / shoulder / midrib
  / shoulder / edge) cordate blades. The base row's outer columns are pulled
  BEHIND the attachment point: that backward pull is the basal sinus, the
  notch that makes a leaf read as a pothos rather than a generic spearhead.
  The midrib is lifted above the shoulders as a real V-crease, with a droop
  curve and a mild lateral wave so the blade holds up from a three-quarter
  angle. UVs are hand-assigned (u across the row with the midrib at 0.5, v
  base-to-tip) to match `pothosLeafTex()`.

`pothosLeafTex()` was repainted to suit those UVs: the golden-pothos
variegation is now irregular splashes stretched ALONG the local vein bearing,
over painted lateral veins and a midrib, instead of round blobs scattered at
random angles — which read as spots on a sick plant rather than as gold
marbling. The procedural fallback shares the same texture and benefits too.

Every part is smooth-shaded before export — flat per-face normals on a
14–16-sided approximation of a curved pot wall or vine read as faceted glass
on a prop this small. Every closed part (Pot, Saucer, Soil, VineA, VineB,
Petiole) is manifold-checked and asserted to have positive volume (outward
normals) before export; the two blades are genuine open two-sided shells
(`open_surface`) and are exempt, matching the ficus/`av-decks.py` convention.

## Loading, assembly and ownership

`buildPothos` builds the original procedural geometry first, into its own
child `THREE.Group` (the fallback), for an immediate, fully-formed plant.
`installPothos` (in `src/pothos-model.ts`) then loads the kit — once per page
load, cached forever at module scope — and on success builds one plant's
transformed pieces (an 11-blade crown rising out of the soil, a 5-blade skirt
spilling over the rim, and five cascading vines carrying 3–5 leaf nodes each,
sampled off each vine's own authored curve), merges each material role into
one `BufferGeometry` via `mergeGeometries`, and adds four meshes (pot+saucer,
soil, stem, leaf) to the fixture's group. The fallback stays in the scene,
hidden (`fallback.visible = false`) rather than removed. A missing or failed
GLB load leaves the fallback as the permanent plant. A fixture disposed while
the load is in flight is guarded by the `disposed` flag and an
`installPothos(...).cancel()` call in `dispose()`, so a late-arriving load
never touches a torn-down group.

Blades are placed with `rotation.order = 'ZXY'` so their Y term is a ROLL
about the blade's own length axis, applied before the outward tilt. Without
it every blade stands on edge: the authored face normal is local +Z, the
outer yaw aims that tangentially, and a Z-only tilt never moves it. Rolled a
quarter turn back, the blade presents its face upward — which is what a leaf
does, and what makes the plant read as foliage instead of a fan of slivers.

Per-instance randomness (vine azimuth/span/drop/tilt, node count and
spacing, blade template/scale/roll) is seeded from the fixture's placement id
via a string hash + mulberry32 PRNG, so a given store layout reproduces the
same plant across rebuilds rather than reshuffling on every load.

## Resource cost

Per placed pothos, merged and measured off the built scene: pot+saucer 512
triangles (1 draw call), soil 84 (1), stem — 5 vines plus 36 petioles — 1,190
(1), leaf — 36 blades × 62 — 2,240 (1): **4,026 triangles in 4 draw calls**,
versus the prior procedural version's 342 triangles spread across **36
separate meshes/draw calls** (one `THREE.Mesh` per leaf card, plus pot, rim
and soil). The store places exactly one pothos (mom-and-pop only), so the net
effect is -32 draw calls and +3,684 triangles store-wide — the right trade
where draw-call overhead dominates, and the same trade the ficus kit made.
The hidden fallback geometry stays allocated but contributes no render cost
while hidden.

The built plant measures 1.51 × 1.72 ft across and 0.74 ft tall, and its
lowest vertex sits at y = +0.016 ft — entirely ABOVE its own base plane, so
nothing dives through the counter it stands on. (The procedural version
trailed leaf cards to 0.73 ft *below* the pot base, i.e. through the desk.)

## Verification

`tests/pothos-model.test.ts` parses the shipped GLB with the runtime's own
`GLTFLoader`: asserts all eight named parts are present with finite,
correctly-sized position/normal/UV attributes, no embedded images, a
triangle/byte budget, a genuine multi-radius (thick) pot wall at the rim, a
recessed soil seat, base-to-tip taper on both vines and the petiole, and —
for both blades — a real basal sinus (outer lobes behind the midrib base), a
shoulder-not-base widest point, and a midrib crease that peaks ON the midrib.
`npm run build` and the full `npm test` suite pass.

In-app verification: `node tools/asset-shot.mjs --kind fixture --name
potted-plant --options '{"variant":"pothos"}'` for the isolated fixture, and
for the in-store front / side / rear views on the checkout desk:

```sh
node tools/shot.mjs --set bb_store_format=mom-and-pop --quality high --settle 1 \
  --walk 7.9,13.3,36,-17,4.1 --out scratch/front.png \
  --also "walk:4.6,12.4,-44,-24,4.1:scratch/side.png" \
  --also "walk:6.9,8.0,164,-18,4.1:scratch/rear.png"
```
