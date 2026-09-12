# Exterior tape-return kiosk (#262)

Original generic scripted Blender mesh, replacing the single ambiguous red exterior
box at `(rightEdgeX + 2.6, 0, FRONT_GLASS_Z + 1.3)`. No second placement or fixture
registry entry is added: the registry contains no exterior kiosk, and this scenery
anchor has no stock, collision proxy, animation or interaction callback to migrate.
The existing behavior is preserved.

## Geometry contract

Feet; ground-center origin; front faces store +Z. Blender `(x, -store_z, height)`
exports directly to runtime `(x, height, store_z)`, with no runtime fitting.
Bounds are 1.30 W × 3.20 H × 1.30 D ft. The front slot sill is at 2.40 ft;
receiving mouth is 0.92 ft wide and approximately 0.21 ft tall. A recessed baffle
and sloping sill give it depth. Cabinet panels have 0.03 ft thickness. The rear
service door has an inset gasket, perimeter reveal, two hinge barrels and a keyed
latch. The hood is a continuous folded sheet with closed cheek panels and front
drip edge; the base has a recessed steel plinth.

**Estimated dimensions:** the 1.30 ft depth, 0.43 ft hood rise, panel thickness,
slot and service hardware dimensions are design choices, not reference measurements.
Height/width/footprint are constrained by the existing prop. The default sidewalk
extends 4.70 ft from the glass; the model's front is at +1.95 ft, leaving 2.75 ft
between it and the sidewalk edge (the old slot extended to +1.985 ft). The rear
is +0.65 ft from the glass line. These preserve the existing clearance; they are
not claims of accessibility compliance. The existing bollard/door positions stay
unchanged. There is no animated door or operational tape deposit interaction.

## Delivery and provenance

- `tools/models/exterior-return-kiosk.py`: reproducible authoring script.
- `tools/models/exterior-return-kiosk.blend`: named editable physical parts,
  generic editable RETURNS text, eased panel edges and UVs.
- `public/models/exterior-return-kiosk.glb`: four merged finish batches.
- `tools/models/exterior-return-kiosk-metrics.json`: measured export cost.

Run Blender with an absolute script path if its installation wrapper changes the
working directory. Closed authored panel solids are checked for manifold edges;
UV islands are generated per part. Runtime finish roles are `KioskEnamel`,
`KioskTrim`, `KioskHardware`, and `KioskRecess`. No image textures or third-party
geometry are used. Cost: 2,780 triangles, four draws/materials, 186,068 GLB bytes.

The issue's `quikdrop-exterior-kiosk` archive lead was searched in the local
workspace and available project/reference trees; the original image was not
available. This is therefore an original generic return-kiosk
variant, not a verified QuikDrop or period store replica. No chain art or
owner-reference derivative is included.

## Runtime and verification

`src/exterior-return-kiosk.ts` uses `assetUrl`, validates roles, UVs, normals and
bounds, then atomically hides the old body and slot. Missing/malformed loads retain
the old fallback. Disposal releases owned meshes/materials/textures, including late
loads; the exterior's existing callback refreshes render and structural shadows.
Fallback geometries are now tracked for cleanup too.

`tools/verify-return-kiosk.mjs` adapts the existing curb-kit StoreScene photography
harness. It captures matching front/side/rear/context/inside photographs and checks
missing, malformed, late and successful loads and idempotent teardown. `before`
can run on the baseline or with the kiosk GLB request blocked. Use an isolated
output directory. Delivery photographs and verification logs are in the task
outbox; they show the integrated store, not a separate studio or live deployment.
