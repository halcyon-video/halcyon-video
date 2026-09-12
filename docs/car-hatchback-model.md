# Editable lot hatchback (#267)

Original scripted Blender mesh authoring under the repository license; no imported
geometry, images, badges or manufacturer marks. Source: `tools/models/car-hatchback.blend`;
reproduce with `blender -b -P /absolute/path/to/tools/models/car-hatchback.py`.
The existing `public/models/car_hatchback.glb` URL is replaced in place.

## Reference and scope

Inspected the original downloaded Kay Lousberg CC0 hatchback in the actual lot
before replacing it. For period construction, inspected the photographed side/rear
spread (printed pages 2–3) of Volkswagen's August 1986 / 1987 Dutch Golf brochure:
[archive](https://www.thesamba.com/vw/archives/lit/8_86_golf_dutch.php),
[original spread](https://www.thesamba.com/vw/archives/lit/8_86_golf_dutch/02.jpg).
The photographed four-door car informs the recessed glazing, narrow pillars,
sloping hatch, rubber bumpers, arch lips, hubcaps and rear wiper. This deliverable
is a generic three-door interpretation with original proportions and rectangular
lighting, not a measured Golf replica. It is compatible with the selected 2000
store as an older parked vehicle; no assertion of exact manufacturer fidelity.
Reference imagery is not bundled.

## Construction and coordinates

Blender uses feet, X across the car, -Y toward the nose, Z up; glTF maps the nose
to +Z, matching the original. Authored envelope is 4.38 wide (including mirrors),
9 long, 3.35 high; origin is at the ground midpoint. These are deliberately
miniaturized lot dimensions, not real production-car measurements. Existing
runtime normalization still fits the longer horizontal axis to 9, recenters the
bounds and seats min-Y at zero. Wheels have radius .73 and centers at ±2.65 along
the length. Both hatchbacks remain at (2, 0, 53) and (29, 0, 53), with yaws -.02
and .01. No navigation, collision or interaction anchor changes.

Named physical parts include the pressed side skins with actual arch openings,
arch lips and well returns, hood, roof, A/B/C pillars, hatch pressing, inset window
reveals, bumpers, grille blades, separate lamp lenses, mirrors, door handles,
revolved tires/steel wheels, underbody, dashboard, front seats/headrests and rear
bench. Window tint is translucent so the lightweight cabin silhouette can read.
No moving parts are introduced. Body panels are closed solids; reveal and wheel
well return surfaces intentionally remain open. Geometry is welded and normals
recalculated; every part has packed UV islands suitable for uniform finishes.
UV islands are per part, not an atlas intended for unique full-car decals.

The Blender audit finds 79 editable parts, no zero-area faces and no missing UVs.
Only the ten intended arch-return/window-reveal surfaces are open; all other
parts are manifold solids. Editable parts remain separate in the blend. Export batches them into eight named
material-role meshes: BodyPaint, RubberTrim, WindowGlass, WheelMetal, Headlamp,
TailLamp, AmberLens, InteriorCloth. No textures. Existing exterior environment
intensity clamp still applies to every material and subsequent mode changes.

## Integration and verification

The same asset resolver, load/error callbacks, normalization, stall groups,
contact shadows and shadow flags remain in use. The loader now releases resources
from late arrivals after disposal, tracks atlas textures and fallback geometry,
deduplicates tracked resources, and requests a render on successful/fallback
installation. The store-shell callback also invalidates the on-demand shadow bake. Disposal is idempotent. Nothing is published or deployed.

`tools/verify-hatchback.mjs OUT [before|after]` follows the existing StoreScene
photography harness. `before` accepts the original GLB saved at
`/tmp/car-hatchback-before.glb` (recoverable from the parent commit); photographs
use an 80-title corporate 2000 store with cleared settings. Software rendering
uses the low quality tier. Outdoor panoramas can vary between boots; compare
vehicle geometry and placement, not the surrounding panorama.

The outbox includes inspected front/rear, both sides, full-lot and interior-facing
views; exact per-stall bounds/costs are in before-cost.json and after-cost.json.
The automated lifecycle scenario exercises rejected loads and successful loads
arriving after disposal. The runtime asset test loads the actual GLB, checks
bounds/ground contact, UVs/normals, all eight roles, and resource limits.

| Cost (car meshes only; excludes unchanged contact-shadow quads) | Before | After |
|---|---:|---:|
| Hatchback GLB bytes | 82,232 | 327,500 |
| Hatchback triangles | 1,194 | 4,604 |
| Hatchback material batches | 5 | 8 |
| Hatchback materials | 1 | 8 |
| Hatchback textures | 1 | 0 |
| Entire five-car row triangles | 11,444 | 18,264 |
| Entire five-car row material batches | 45 | 51 |

The double-sided translucent glass adds one extra color-pass draw per hatchback
in Three.js: effective car-only color draws are 9 per hatchback and 53 for the
row (45 previously), before shadow passes. Counts are geometry/material
submissions, not a frame-time benchmark; shadows and the rest of the store affect
total renderer cost. Both
hatchbacks load independently as before. Full row increase: 6,820 triangles and
six material batches (eight color-pass draws); no texture memory for the replacement hatchbacks.

Verification: `npm test && npm run build`, all 686 tests and build pass (exit 0).
Existing Vite chunk-size/mixed-import notices remain nonfatal.
