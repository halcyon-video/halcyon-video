# Suspended ceiling kit — issue #225

Original generic ceiling construction, authored with scripted Blender meshes under
issue #151's delivery contract. This is not a measured replica of a manufacturer's
system. The existing store's deliberately oversized **5 × 2.5 ft** module is retained.
No third-party mesh, photograph, branded artwork or owner asset is embedded.

## Source and runtime contract

- Editable source: `tools/models/ceiling-grid.blend`. Its linked overview copies
  separate the parts for inspection; hidden origin-aligned prototypes are the
  runtime export selection. The authoring script creates the overview after export.
- Reproduce: `blender -b -t 2 -P "$PWD/tools/models/ceiling-grid.py"` (Blender 5.2).
- Runtime: `public/models/ceiling-grid.glb` and `ceiling-tile-grain.png`.
- Store units are feet. Blender uses `(x, -storeZ, storeY)` and exports Y-up.
  The scene's imperial scale is 0.3048 m per unit; runtime coordinates stay in feet.
- `TBar` and `EdgeAngle` are unit spans along X=0..1. Span length alone is fitted;
  transverse widths and heights do not stretch. Angle +Z points into the field.
- `CrossTee` is centered at a grid junction; the rail endpoints stop at its
  ±0.054 ft ports. Its welded cruciform upright connects the runner webs.
- `TileRim` is centered in the module. Its footprint is 4.88 × 2.38 ft;
  the top is +0.018, ledge -0.035 and eased underside -0.055 ft.
  The exposed T-bar flange is at -0.075 ft, leaving a shallow recessed face.
- No motion, interactions, collision or navigation footprint. Ceiling Y and all
  troffer, diffuser, sprinkler and soffit light attachment points remain unchanged.

`GridPaint` is shared satin painted steel, using the existing theme's frame finish.
`AcousticFiber` is shared matte mineral fibre. The 256² grain is baked in Blender
from an original Noise/ColorRamp graph, retained in the source with its packed bake.
Runtime instances share one grain map (also used for subtle bump), one fibre
material and their existing deterministic per-tile colour variation. Main tile
face UVs cover one module; profile and end UVs use planar projections in feet.

## Parametric integration and ownership

`store-shell.ts` passes the exact accepted module centers to `moduleGridPlan`:
room size, wall/cornice margins, stepped back-wall notch and vestibule exclusions
continue to come from the existing builder. Tile/light/vent classification and
soffit occlusion rules remain authoritative. Shared boundaries emit one runner,
not two overlapping frames. Open boundaries use mitred angle profiles, merged
into one geometry draw. Only the prototype parts are exported, never a fixed store.

`ceiling-soffit.ts` clips the lower grid to `frontSoffitLidPolygon`, aligned with
`soffitTrofferCenters` and the printed tile texture. The original cut lid remains
behind the profiles, including partial perimeter tiles. The plain-white soffit
keeps its drywall and circular light holes. A desk format has no dropped soffit;
an exposed main deck has no tile kit. The existing mirrored cornice is untouched.

The loader uses `assetUrl`, validates all four named parts, clones owned geometry
and finishes, then hides the existing box-frame/tile fallback only after success.
Failed loads leave that fallback in place. The original soffit slab is retained.
Model and texture callbacks discard late resources after removal or scene geometry
teardown. Instances, owned materials, geometry and grain are disposed; borrowed
fixture finishes remain owned by the store. Both successful stages refresh
structural shadows and request a render. Node-only shell construction retains
fallback geometry without initiating browser asset requests.

## Verification

`tests/ceiling-grid.test.ts` exercises rail deduplication, variable grid sizes,
missing modules, triangular/trapezoid soffit clipping, phase, runtime bounds,
material roles, UVs, cost, mitred angle bounds, missing-asset fallback, successful
batch installation, borrowed-resource ownership and late-load disposal, late texture disposal and noncollapsed UV triangles.

Use the existing in-store verifier with its added grid mode:

```sh
node tools/verify-ceiling-luminaire.mjs /tmp/ceiling-grid --grid
node tools/verify-ceiling-luminaire.mjs /tmp/ceiling-grid-1993 --grid --theme=bb-1993 --count=80
node tools/verify-ceiling-luminaire.mjs /tmp/ceiling-grid-fallback --grid --theme=bb-1993 --count=80 --fallback
node tools/verify-ceiling-luminaire.mjs /tmp/ceiling-grid-shop --grid --format=mom-and-pop --count=80
```

The verifier clears persistent settings and captures actual StoreScene aisle,
side, soffit and above-deck views; it records instantiated geometry and resource
cost in `evidence.json`. Close joint views render the same store at full resolution
with exposure 0.35 and no compositor, to inspect the profile side/top/underside.
Evidence and final check results are in the dispatched
workspace outbox, `out/astra-halcyon-225/report.md`. Source-level resource costs
and dimensions are generated in `docs/ceiling-grid-cost.json`.
