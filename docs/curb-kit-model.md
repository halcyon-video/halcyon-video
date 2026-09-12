# Concrete edge modules — issue #265

Original generic concrete construction, based on measured Halcyon scene anchors;
not a period store reconstruction. Implements the delivery contract in #151.
Scripted Blender 5.2 mesh authoring: closed profile extrusions and a welded height
field for fitted T junctions and sidewalk end returns. No external geometry or art.

- Editable source: `tools/models/curb-kit.blend` (exploded library display).
- Generator: `tools/models/curb-kit.py` (exports mating origins before arranging
  the source library for inspection).
- Runtime: `public/models/curb-kit.glb`.
- Rebuild: `blender -b -t 2 -P "$PWD/tools/models/curb-kit.py"` from the repo root.

Numeric coordinates are feet. Blender `(x, -store_z, height)` exports to runtime
`(X, Y height, Z toward road)`. Each part's local origin is its left/rear mating
plane at floor elevation. No moving parts or changes to collision/navigation.

| Part | X × Y × Z bounds/size (ft) | Role |
| --- | --- | --- |
| CurbSpan | 1 × .14 × .4; Y −.10 to +.04 | CurbConcrete |
| CurbJunction | .4 × .14 × .4; Y −.10 to +.04 | CurbConcrete |
| GutterSpan | 1 × .07 × 1.6; Y −.10 to −.03 | GutterConcrete |
| SidewalkSpan | 1 × .08 × 4.7; Y −.08 to 0 | SidewalkConcrete |
| SidewalkReturn | .2 × .08 × 4.7; Y −.08 to 0 | SidewalkConcrete |

Curbs have .025 ft crown chamfers; the sidewalk has .012 ft front/outer chamfers.
Mating ends stay square and closed. The T junction joins the side curb to the
continuous road curb without the old overlapping box ends. The pan has a shallow
.002 ft toe fall: its entire top remains above the existing ground fade at −.035.
Its road edge stays exactly at −.03 and `farZ + 2`, preserving the asphalt join.

`curb-kit-plan.ts` retains code-driven sizing: 63/81 ft lot widths, 70 ft road
extensions, existing sidewalk depth and store width + 8. Curb and pan spans are
at most 4.5 ft long with exact shared endpoints. Sidewalk returns use fixed .2 ft
ends; the center span stretches, preserving the front chamfer size. The threshold
stays at Y=0 / `FRONT_GLASS_Z`; no bevel crosses the doorway. Original road, lane
markings, ground-color updates and ground-transition planes are unchanged.

All source faces have `ConcreteFeet` UVs. Runtime remaps concrete tops into
continuous world-space tiling and uses the existing concrete aggregate/joint map
for fine wear, with no new texture allocation. Sidewalk UVs preserve the existing
slab rhythm and optional user material maps. Live sidewalk material ownership
stays with the environment; curb/gutter finishes are independently replaceable.

One base-path-resolved GLB load creates three merged, shadow-receiving meshes in
`exteriorEnvironment / Blender concrete edges`. The original sidewalk, curb and
road-edge group remain visible until the complete asset validates and installs.
Missing/malformed assets retain that fallback. Late loads release their source;
teardown is idempotent, frees owned geometry/materials and preserves borrowed
sidewalk materials/textures. Successful installation requests an on-demand render
and applies the existing exterior environment clamp. No new shadow casters,
lights, animation or interaction behavior.

Resource cost: 134 source triangles, five meshes, three roles, zero embedded
textures, **12,864-byte GLB**. In the photographed 86.8 ft store / 81 ft lot:
**2,860 installed triangles, 5,150 vertices, three draws/materials/geometries**;
the hidden fallback remains allocated until the environment is destroyed.
The visible fallback was 62 triangles / six draws. See `curb-kit-cost.json` for
per-part source bounds and manifold checks.

Verification uses `tools/verify-curb-kit.mjs OUT before|after`, adapted from the
existing hatchback StoreScene photograph harness. Before forces only this GLB to
fail, exposing the unchanged original geometry. Settings are cleared and day
sky/sun pinned. The owner outbox contains matching inside, threshold, sidewalk
side return, road, T corner and rear/side edge photographs, plus cost/lifecycle
JSON. Source assertions and exported-buffer tests check closed manifold meshes,
nonzero/outward triangles, UVs, resource budget, threshold height, both lot widths,
sidewalk depths, exact span joins and clearance above the ground fade.
