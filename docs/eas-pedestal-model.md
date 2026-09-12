# Entrance EAS pedestal — issue #220

Original generic scripted Blender model of the existing early pedestal envelope.
Source: `tools/models/eas-pedestal.blend`; reproducible authoring:
`blender -b -P "$PWD/tools/models/eas-pedestal.py"`.
Runtime: `public/models/eas-pedestal.glb`.

## Contract and construction

Coordinates are feet: Blender X width, -Y store Z, Z height; glTF exports Y up.
Origin is the floor at the centre of the mounting shoe. Bounds are 0.62 × 3.43 ×
0.50 ft (runtime XYZ). There are no moving or interactive parts.

The continuous closed shell halves have rolled perimeter shoulders and a recessed
clamshell gasket. A fitted rear service cover, captive screws, sealed cable entry,
molded socket/shoe and four elastomer feet describe construction beyond the front
outline. All 15 source parts are checked manifold. UV islands are smart-unwrapped and tiled eight times for fine grain.
Named material roles: MoldedIvory, SeamElastomer, BasePolymer, FastenerSteel.
Polymer uses deterministic packed 128² grain normal and roughness images; steel has
0.8 metalness and 0.32 roughness. All base-color channels are at least 0.09 linear.
No logos, signage, stock photography, or external textures are included.

The optimized export joins parts into one mesh with four material primitives.
Each pedestal costs 2,724 triangles / four draws; the pair shares the geometry,
materials and textures (5,448 triangles / eight draws excluding shadows).
GLB: 205,256 bytes. Two 128² RGBA textures occupy about 128 KiB decoded before
mipmaps. Machine-readable cost is in `tools/models/eas-pedestal-metrics.json`.

## Integration

`storefront-dressing-93.ts` retains its existing hasChamber gate and exit-only pair:
X = vest.xL − 0.62; Z = vest.sideDoorZ ± (vest.doorW / 2 + 0.55).
The existing fallback collision meshes, door movement and navigation remain intact.
The shoe stays within the old 0.62 × 0.50 footprint; clear floor width between
shoes remains doorW + 0.60 ft. No alarm behavior is added. No entrance pair or
storefront-door gate is introduced. The original early fixture is retained in
all previously supported themes.

One base-path-aware GLTF load installs both instances and hides the fallback.
Failure keeps the fallback. Root removal cancels late attachment and disposes
shared geometry, materials and embedded textures once, before signage cleanup
traverses the remaining fallback. Successful loads refresh shadows and rendering.

## Provenance and outstanding reference gate

Inspected the current procedural geometry and issue #151 contract. The named `late-era-fixtures-2012` archive, its photographs and EAS
assets were not found in this checkout or the local worker input/archive search.
The early dimensions are inherited scene measurements, **not measured historical
product dimensions**. Rear construction is original plausible generic detailing.

No distinct later design is claimed, invented, or installed. The later reference
portion of #220 remains open until its original archive is available for inspection.
This delivery must not be represented as completing that reference-dependent portion.

## Verification

`node tools/verify-eas.mjs <outbox> before|after|final|lifecycle` uses the existing StoreScene
photography harness with cleared storage and deliberate corporate / bb-2000 settings.
Before images require the original implementation. Pair, side and rear views are
saved to the issue outbox. `check-eas-lifecycle.mjs` checks the actual GLB bounds,
floor datum, shared instances, successful load, failed load, removal before load,
ancestor detachment, render refresh and exactly-once disposal of owned resources.

`npm test && npm run build`: passed (725 tests); existing Vite chunk-size warning.
