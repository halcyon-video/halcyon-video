# Interior return chute (#219)

Original scripted Blender construction fitted to the existing return-slot envelope.
The shell is a continuous extruded bullnose profile with a hollow counter socket,
a boolean through-aperture, and eased cut edges. The counter provides the
rear closure: the open-backed socket fits around its existing panels. Separate folded steel throat
panels, a sloping receiver, rear light baffle, top-pivot flap and four acrylic-label
stand-offs provide physical depth. Closed solids are checked for manifold edges.
The editable source retains twelve named parts; the runtime batches static parts
by finish and retains the flap separately.

## Contract and provenance

Feet, ground origin, width along X, front toward local +Z. Blender coordinates
are `(x, -store_z, height)` and export directly to Three.js Y-up coordinates.
Bounds: X ±1.20, Y 0–3.85, Z −1.49–0.907 ft. The shell face remains Z 0.90;
the 1.00 × 0.30 ft aperture remains centered at (−0.50, 2.55, 0.90).
Crown radius is 0.38 ft; nominal shell thickness is 0.14 ft. The flap pivot is
(−0.50, 2.665, 0.743), opening inward about X during the existing return ritual.
Stand-offs end at Z 0.907 behind the existing clear label and screw heads.

The dimensions and silhouette come from the existing application geometry.
Internal folds, bevels, baffle and hardware depths are construction estimates.
The existing `docs/screenshots/return-chute.jpg` was inspected. The archival f0068/scene_011 stills identified in the code were
not present in the searched local reference trees. This is an original fitted
construction upgrade, not a newly verified exact period replica. No downloaded
geometry or branded artwork is embedded. Existing measured canvas lettering,
clear acrylic sheen, theme color and label ownership remain in the application.

## Delivery and surfaces

- `tools/models/interior-return-chute.py`: reproducible Blender authoring script.
- `tools/models/interior-return-chute.blend`: editable named parts, packed images,
  UVs, dimensions and provenance metadata.
- `public/models/interior-return-chute.glb`: optimized runtime mesh.
- `tools/models/interior-return-chute-metrics.json`: measured geometry/resource cost.

Run Blender with an absolute script path and `-b -t 2 -P`.
Material roles: `ChuteLaminate`, `ChuteSteel`, `ChuteReveal`. Laminate uses the
active counter-top color at runtime. All three retain embedded tangent-space fine
grain and roughness textures (two shared 256² images). Authored base-color channels
are at least 0.08, steel metalness is 0.85, laminate 0.03, reveal 0.10; roughness
varies approximately 0.44–0.56. UV islands are packed per physical part and tiled 8× for fine physical grain.
The light baffle sits at Z 0.05, giving 0.85 ft of visible depth ahead of the
existing counter band; it masks the blue counter behind the receiving throat.
Cost: 2,116 triangles, four mesh draws, three materials, 334,280 GLB bytes.
Decoded image pixels total 512 KiB before mipmaps; loader texture objects can
share image data. The existing runtime label adds its original draws/textures.

## Integration and verification

`return-slot-model.ts` validates bounds, UVs, normals, surface maps and material
roles before adoption. It uses `assetUrl`, retains fallback on failed/malformed
loads, and releases model geometry/materials/textures on teardown or late arrival.
It refreshes static shadows and the on-demand renderer on installation and flap
state changes. The old hidden collision meshes remain registered. The existing
entrance anchors, theme/format gates, navigation footprint, rental-case ownership,
non-blocking staggered drop and sounds are unchanged.

`tests/return-chute-assets.test.ts` verifies the shipped GLB's resource budget,
bounds, UVs, mapped materials, pivot and ray-tested open throat/receiver depth.
`tools/verify-interior-return-chute.mjs <output-dir> before|after [theme] [storefront]`
adapts the
existing StoreScene photography harness. It captures matching front, side, rear,
context and close views, plus a posed return and loader/lifecycle checks. Baseline
captures block only the new GLB. Each run clears localStorage and uses the corporate
1993 store by default; optional theme and storefront arguments exercise other
finishes and counter anchors. Photographs and verification logs are delivered in the task outbox;
these are local in-store previews, not a deployment.
