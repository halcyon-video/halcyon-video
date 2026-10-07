# Original customer-owned period sedan (#266)

`public/models/car_sedan.glb` is original unbadged compact four-door construction
under the repository license. Editable, individually named physical parts are in
`tools/models/car-sedan.blend`; reproduce with Blender 5.1 or later:

```sh
blender -b --python-exit-code 1 -P /absolute/path/to/tools/models/car-sedan.py
```

The script reuses the existing hatchback mesh-authoring and glTF export pipeline.
It imports no geometry, images, badges, lettering or manufacturer textures.

## Period study and original proportions

The front and rear three-quarter photographs on pages 02 and 03 of the
[1987 Jetta manufacturer brochure](https://www.thesamba.com/vw/archives/lit/1987_jetta_mexico.php)
were inspected for period construction: straight hood and trunk planes, four
separate doors, recessed glass, narrow pillars, rubber bumper bands, rectangular
lamps, wheel-arch lips, hubcaps, small handles and mirrors. Text reads forwards
and the entire vehicle is visible. The
[manufacturer's historical profile](https://www.volkswagen-newsroom.com/en/jetta-2-19841992-19643)
places that generation in 1984–1992 and lists a 4,315 mm length, close to the
existing 14-foot customer parking contract. Perspective photographs do not give
orthographic measurements. This is an original interpretation with approximate
compact proportions, not a measured manufacturer replica. Photographs remain
local study material and are not bundled.

The exported envelope is **14.00 ft long × 6.10 ft wide including mirrors ×
4.72 ft high**, with an approximately 5.26 ft body width. Blender coordinates are
X across, -Y toward the nose, Z up; glTF is Y-up with nose +Z. Origin is the ground
midpoint, exported min-Y is zero. Runtime preserves proportions with one uniform
length transform, recenters the envelope and uses the assigned stall's exact yaw.
The existing pavement seating offset remains -0.09 ft. These are declared
admission dimensions, not production-car measurement claims.

## Construction and finishes

Eighty-three editable parts include fitted front/rear wings and four distinct
pressed door panels, actual arch openings with lip returns and recessed dark
cavity liners, a sloping hood, short roof, rear windshield and trunk lid,
A/B/C pillars, inset glazing with gasket returns, rubber bumpers, grille blades,
rectangular lamps, mirror housings and faces, handles, protective strips,
revolved tires and hubcaps. A dashboard, two front seats/headrests and rear bench
provide the visible cabin silhouette. No engine or hidden undercarriage was built.

The concave body skin is triangulated before its physical panel splits; fitted
cut edges are capped, and panel gaps remain narrow. Closed solids are welded and
checked for manifoldness and zero-area faces. The ten window-reveal and arch-return
surfaces are intentionally open; liners behind the tires close the visible wheel
cavities. Every editable part has packed UV islands for uniform finishes, not
photographic decals. The source blend preserves separate parts and a useful
viewport; export batches physical parts into eight material-role meshes.

Roles are BodyPaint, RubberTrim, WindowGlass, WheelMetal, Headlamp, TailLamp,
AmberLens and InteriorCloth. Tinted translucent glazing lets the lightweight
interior read. BodyPaint remains replaceable per customer; all other model
materials and geometry are shared per asset. No textures are embedded.

## Current consumer and lifecycle

The fixed decorative sedan consumer had already been retired. This change
integrates the sedan through `CustomerParking` and `CustomerVehicles`, rather
than restoring unrelated decorative parking. The existing original hatchback
remains. Both vehicles are model-year 1987. Identity selects deterministically
among era- and stall-compatible vehicles before any space is assigned; later
model years cannot displace an eligible period vehicle. Selection and the existing
color stay stable during browsing, departure and re-entry. Existing admission,
space uniqueness, accessible/reserved exclusion and capacity behavior remain.

The adapter requests each distinct eligible asset once and retains an independent
source and loading/error silhouette. Each silhouette has the assigned vehicle's
exact declared width, height, length and ground envelope. Success replaces only
customers using that asset; a failed sedan does not replace or remove a loaded
hatchback. Instanced geometry and shared finishes are retained until adapter
teardown, while each cloned customer paint material is released on replacement
or departure. Late successful loads after disposal release only their own
resources; late failures do not wake the removed scene. Disposal is idempotent
and removes parked objects. Load/install and occupancy changes use the existing
render and structural shadow wake callback. Model choices and envelopes are
identical on low, medium and high quality tiers.

## Measured exported and admitted-lot cost

| Vehicle-only cost | Original hatchback | New sedan |
|---|---:|---:|
| GLB bytes | 327,500 | 336,168 |
| Triangles | 4,604 | 4,964 |
| Material batches | 8 | 8 |
| Color-pass draws | 9 | 9 |
| Embedded textures | 0 | 0 |

Double-sided transparent glazing adds a second color-pass draw. At the full
supported ten-regular admission (five of each vehicle), the measured parked
geometry totals **47,840 triangles, 80 batches and 90 color draws**. The previous
ten-hatchback equivalent was 46,040 triangles with the same batch/draw counts;
the increase is 1,800 triangles, approximately 3.9 percent. Sixteen geometries and
24 materials are referenced by those parked cars; paint is the only cloned finish.
The adapter additionally retains six fallback geometries/materials and the two
source paint materials for reuse. Total source/fallback/parked ownership is 22
geometries and 32 materials, with no vehicle textures. Costs exclude shadow passes,
customer sprites and the rest of the store; they are not a frame-time benchmark.
The photographed day admits four regulars and shows two hatchbacks plus two sedans.

## Verification evidence

The actual exported GLB test checks the declared envelope, floor contact, nose and
rear lamp orientation, finite normals, UVs, all eight roles and bounded resource
cost. Targeted customer tests cover mixed stable identity, future-year filtering,
narrow-stall selection, excluded bays, full capacity, admission and ownership
through browse/checkout/departure/re-entry. The private adapter probe loads both
actual assets and measures every assigned envelope/ground/yaw at full admission,
then exercises missing sedan, independent completion, exact fallback bounds,
paint ownership, teardown during pending loads, late success/error and tier
coherence. The required build runs the enforced budget/provider/slot gates.

Inspected before/after actual-store lot photographs and front/side/rear model
views are retained in the conversation album and written verification receipt.
The first keyed preview exposed an open wheel cavity; it was rejected and replaced
with fitted liners, then photographed again before build/landing. High-tier lot
photography requested the existing settle supersample; active customer animation
prevented a static settle signal, and the tool recorded that limitation while
completing high-quality captures. No phone frame-rate claim or release is made.
