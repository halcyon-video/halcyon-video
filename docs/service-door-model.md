# Service exit assembly (#223)

Original generic metal service-door construction, authored in Blender 5.2 with
`tools/models/service-door.py`; editable parts in `service-door.blend` alongside
that script; runtime `public/models/service-door.glb`. No downloaded geometry,
reference photographs, branded artwork, or textures are included. Hardware
sizes are construction estimates, not an exact historic manufacturer's replica.

Regenerate with `blender -b -P "$PWD/tools/models/service-door.py"`.

Numeric units are feet; Blender `(x,-z,y)` exports to Three.js `(x,y,z)`.
Origin is the floor on the right shell wall at the existing doorway center.
X points outside, Y up, Z toward the storefront. The consumer translates by
`(rightEdgeX,0,sideRibbon.backZ-.5-1.5)` without scaling or rotation.

The nominal opening remains 3 × 7 ft, with 2.95 × 6.955 ft leaves and .146 ft
(1.75 inch) thickness. Jambs span Z ±1.7 ft and top out at 7.2 ft. The rim-device
center remains 3.3 ft high. Hinges sit at .85, 3.5 and 6.15 ft, on the same edge
opposite the latch; exterior keyed lever aligns with the interior rim latch.
The closer body mounts on the leaf and its forearm terminates at a head shoe.

The existing architecture intentionally retains a solid wall and two separate
visible mounting planes. Accordingly this asset uses matched thin interior and
exterior leaf representations, at X=-.12 and +.735 ft. It does not claim a single
wall-thickness steel leaf. Folded jambs, compression seals, and the common saddle
threshold make the two views read as one doorway while preserving that shell
contract. There is no animation, new collision object, or interaction target.
The original concrete stoop, drip cap, EXIT sign and wall-dressing exclusion
function remain unchanged. The door still exists only when a side ribbon exists.

Every physical part is a named editable mesh in the source. Closed solids have
zero non-manifold edges. Face-projected UVs use four-foot tiles; bevels retain
UV data. Material roles are ServiceLeaf, ServiceFrame, ServiceHardware and
ServiceSeal. The first three reuse the existing fallback's runtime finishes;
the loader owns the neutral seal material. No lighting or signs are baked.
Runtime geometry is batched by finish: 3,132 triangles, four draws, 212,052 bytes,
zero texture allocations. Detailed part costs are in
`tools/models/service-door-metrics.json`.

`installDisplayModel` retains the procedural fallback, refreshes shadows/render,
and releases late or detached loads. Scene teardown explicitly cancels the
load before the shared geometry/material disposal pass. Facade removal also
releases the model. The retained hidden fallback owns shared finishes.

`tools/verify-service-door.mjs <out-directory> before|after` uses the existing
StoreScene photograph harness with deliberately reset corporate/day settings.
The before mode blocks this GLB to photograph the unchanged procedural door.
It captures interior, exterior, oblique panic/closer hardware and threshold views.
Evidence and test/build logs are delivered in the #223 outbox.
