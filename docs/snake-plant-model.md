# Snake-plant construction model

The mom-and-pop store's `potted-plant` fixture with `variant: 'snake-plant'`
now loads an original Blender-authored Sansevieria kit. Its species, position,
scale, one-foot pot height and 0.96-foot collision diameter are unchanged. No
third-party model, texture, brand asset or reference-derived geometry is used.

## Source and runtime contract

- Reproducible source: `tools/models/snake-plant.py`.
- Editable source: `tools/models/snake-plant.blend`.
- Runtime kit: `public/models/snake-plant-components.glb`.
- Assembly and loading: `src/snake-plant-model.ts`.
- Fixture integration and fallback: `src/fixtures/potted-plant.ts`.

Run `blender -b -t 2 --python tools/models/snake-plant.py` to reproduce the
editable source and GLB. Store units are feet. Blender authors Z-up; glTF's
Y-up export maps that growth axis directly into Three.js.

The pot remains centred on the fixture origin with its base at Y = 0. The
loaded mesh supersedes only the fallback's visuals. Its hidden pot remains the
registered collider, so asynchronous replacement cannot alter navigation or
the layout footprint. The fixture is still optional and mom-and-pop-only.

## Construction

`Pot` is one closed lathed glazed-ceramic section with a footed sole, tapered
outer wall, rolled lip, genuine inner wall and recessed interior floor.
`Saucer` is a separate shallow drip tray. `Soil` is a closed mound seated at
0.82 feet, below the one-foot rim.

`BladeA`, `BladeB` and `BladeC` are five-column, twelve-row sword leaves. Each
has a broad lower shoulder tapering to a true point, a concave centre channel,
a different grown-in bow, lean and twist, and base-to-tip UVs that preserve the
existing variegated Sansevieria texture. The blades are intentionally open,
two-sided leaf surfaces; the pot, saucer and soil are manifold closed solids.

At runtime fifteen blades grow from three loose, jittered rings in the soil.
Inner leaves are taller and more upright; older outer leaves are shorter and
splay farther. Template choice, height, azimuth and lean are seeded by fixture
id, so the plant is varied without changing between rebuilds.

## Loading, ownership and cost

The GLB loads once and is cached at module scope. Failure leaves the original
fully formed procedural plant visible. A successful install merges three
material roles: pot and saucer, soil, and all leaves. Disposal cancels a late
load and releases the merged geometry and per-fixture materials while leaving
the shared source kit cached.

The shipped kit is 34,028 bytes and 1,004 triangles across six named parts,
with no embedded images. The assembled plant measures 0.99 by 0.99 feet across
and 3.43 feet high, rendering 2,156 triangles in three draw calls. It keeps the
old footprint while replacing fifteen flat repeated cards with three curved
blade families.

## Verification

`tests/remaining-plant-models.test.ts` parses the shipped GLB with the runtime's
own `GLTFLoader` and checks part names, byte and triangle budgets, finite
position/normal/UV attributes, a real thick pot wall, recessed soil and curved,
channelled blade geometry. Inspect the isolated asset from front, side and rear
with `tools/asset-shot.mjs`, then its live front-corner placement in a
mom-and-pop store with `tools/shot.mjs --quality high --settle 1`.
