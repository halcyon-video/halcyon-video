# Floor-palm construction model

The mom-and-pop store's two `potted-plant` fixtures with `variant: 'floor-palm'`
now load an original Blender-authored construction kit. The front-window plant
retains its full crown; the alcove plant still honours its existing
`frondScale: 0.72` and restricted `fanSpan`. No third-party model, texture,
brand asset or reference-derived geometry is used.

## Source and runtime contract

- Reproducible source: `tools/models/floor-palm.py`.
- Editable source: `tools/models/floor-palm.blend`.
- Runtime kit: `public/models/floor-palm-components.glb`.
- Assembly and loading: `src/floor-palm-model.ts`.
- Fixture integration and fallback: `src/fixtures/potted-plant.ts`.

Run `blender -b -t 2 --python tools/models/floor-palm.py` to reproduce the
editable source and GLB. Store units are feet. Blender authors Z-up; glTF's
Y-up export lands the templates directly in Three.js with Y as growth height.

The placement origin, footprint and collision contract are unchanged. The pot
is centred on the fixture origin, rests at Y = 0 and preserves the previous
1.34-foot collision diameter. The loaded geometry replaces only the visible
fallback; the fallback pot stays hidden in the scene as the established
collider. The plant remains optional and is still placed only by shop formats
whose `StoreFormatSpec.plants` flag is enabled.

## Construction

`Pot` is a closed lathed section with a footed base, tapered wall, rolled lip,
real inner wall and recessed interior floor. `Saucer` is a separate shallow
lathed drip tray. `Soil` is a closed mound seated at 1.08 feet, below the
1.30-foot rim instead of floating across it.

`Cane` is a tapered, slightly wandering stem template. `RachisA` and
`RachisB` are different tapered, curved frond axes. Each finished frond is
stretched only along its growth axis, so a four-foot frond does not acquire a
four-inch-thick stem. `PinnaA` and `PinnaB` are narrow, pointed leaflets with
hand-authored UVs, a midrib fold, tip droop and lateral wave. They are the only
intentionally open surfaces and render two-sided.

At runtime five varied canes emerge from the soil and fourteen deterministic
fronds fan from the crown. Every frond carries nine opposed leaflet pairs plus
a terminal leaflet, each attached to a sampled point on that frond's own
authored curve. Two taller crown spears retain the old fixture's roughly
5.6-foot silhouette while the older outer fronds arch down and outward.
Randomness is seeded by placement id, so rebuilds do not reshuffle the plant.

## Loading, ownership and cost

The GLB loads once and is cached at module scope. A missing or damaged asset
leaves the complete procedural fallback visible. Successful assembly merges
the finished plant into four material roles: pot and saucer, soil, canes and
rachides, and leaflets. Disposal cancels an in-flight install and releases all
merged geometries and per-fixture materials; the shared source kit remains
cached.

The shipped kit is 38,352 bytes and 956 triangles across eight named parts,
with no embedded images. The full-size front-window plant measures 4.53 by
5.32 feet across and 5.53 feet high. It renders 9,348 triangles in four draw
calls: 620 pot and saucer, 96 soil, 1,184 stem, and 7,448 leaflet triangles.
That is intentionally more surface detail than the old broad-card crown, but
far fewer draw calls than one mesh per leaflet.

## Verification

`tests/remaining-plant-models.test.ts` parses the shipped GLB with the runtime's
own `GLTFLoader` and checks part names, byte and triangle budgets, finite
position/normal/UV attributes, a real thick pot wall, recessed soil, curved
rachides and readable folded leaflets. Inspect the isolated asset from front,
side and rear with `tools/asset-shot.mjs`, then the two live placements in a
mom-and-pop store with `tools/shot.mjs --quality high --settle 1`.
