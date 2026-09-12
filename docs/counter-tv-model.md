# Independent-shop counter television (#210)

Original generic compact period CRT, authored with Blender 5.2 Python mesh tools.
This is not a replica of a manufacturer or an identified historical fixture.
Dimensions here follow the existing code contract.
No downloaded geometry, branded art, or third-party textures are included.

- Source: `tools/models/counter-tv.blend`; reproducible authoring: `tools/models/counter-tv.py`.
- Runtime: `public/models/counter-tv.glb`; measured costs: `tools/models/counter-tv-metrics.json`.
- Rebuild: `blender -b -t 2 -P "$PWD/tools/models/counter-tv.py"` (absolute path also works with the ThinkPad Flatpak launcher).
- Consumer: `src/entrance/counter-tv.ts`, at the existing independent-shop inner-counter spine, `innerH + 0.12`, existing yaw. Corporate format does not gain another TV.

Coordinates are feet: Blender `(x, -store_z, height)` exports to Three.js
`(x, height, store_z)`. Origin is the counter attachment at the bottom of the
mounting plate; +Z faces the viewer. Cabinet maximum envelope remains 1.05 ft
wide × 0.82 ft high × 0.85 ft deep, centered at local Y=2.4944. Overall top is
2.9044 ft above the attachment. The inset rear panel/connectors and front controls
fit inside the existing glass-front depth envelope. The 0.32 × 0.28 ft base plate
fits within the cabinet footprint. These are inherited design dimensions, not
measurements of a historical appliance.

The source retains 49 named solid parts under `MountAssembly` and `SwivelHead`:
bolted plate, riser, bearing, tilt axle/yoke, saddle, tapered cabinet, open bezel,
speaker details, buttons, recessed rear service panel, cover screws and sockets.
The head pivot is local Y=2.025; it is editable, with no runtime animation.
The saddle top meets the cabinet bottom at Y=2.0844. `CounterAttachment` and
`ScreenAnchor` empties publish the attachment and picture locations. The latter
is `(0, 2.4944, 0.455)`. Vent slots and the rear service recess are cut into solid
meshes. Source generation validates manifold solids and unwraps the cut meshes.

The five material roles are `WarmGrayABS`, `GraphiteBezel`, `PowderCoatedSteel`,
`ZincFasteners`, and `VentAndControlRecess`. Dielectric plastics, metallic hardware,
small seeded normal grain, and separate calibrated roughness textures provide
physical finish variation. Base-color components are at least 0.085 linear.
UV islands are packed, then tiled six times for fine grain; all runtime primitives
have UVs. All six 128×128 texture images are generated originals and packed into
both deliverables. Approximate RGBA texture memory is 384 KiB before mipmaps,
512 KiB with mipmaps. Runtime batches by material and editable pivot: eight
primitives, 7,304 triangles, 599,656 bytes. The unchanged runtime picture/scan/glass
layers add their existing costs separately.

The three curved screen layers still come from `crt-tube.ts` and
`glass-reflection.ts`, with the original texture, dimensions, bulge and positions.
No video, timer, update loop, interaction target, or new collision mesh is added.
The original arm/body retain their collider registration and exact transforms.
The original shell remains visible during loading and on error. Once installed,
only that fallback group is hidden. The installer uses `assetUrl`, requests a
render and shadow refresh, and owns all GLB geometry/materials/textures. Entrance
or anchor removal disposes those resources; a late result is released instead
of being attached to a retired store.

Verification uses `tools/verify-counter-tv.mjs`, adapted from the project's
StoreScene fixture photograph harness. It builds the actual independent store,
compares the retained original fallback with the authored shell at identical
cameras, photographs side/rear/mount details, records bounds and ceiling
clearance, checks screen layers, counts disposal events, and exercises failed
and late loads. Run with Node 22 and an output directory argument. Photographs
and `evidence.json` are delivered in `/home/devin/mognet-workers/out/astra-halcyon-210`.
