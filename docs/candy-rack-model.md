# Queue candy rack (#193)

Original generic Blender hardware upgrades the existing `CandyDisplay` at
`candy-display-front`. No new fixture, placement, stock catalog or checkout flow
is introduced. The original procedural frame remains available on loading/error;
only its hardware is hidden after both GLBs load. Candy labels and row IDs remain
owned by `CandyDisplay`, including its existing seven cartons per default row.

## Construction and coordinate contract

Scene units are feet. Origin is the footprint center at floor height; +Y is up,
-Z is the customer-facing side. Blender uses `(x, -store_z, height)` and exports
Y-up glTF. The default collision footprint stays 3 × 0.7 ft at its existing
position/yaw. Hardware bounds are approximately 2.936 × 4.028 × 0.656 ft
(width × height × depth). There are no moving parts.

The editable source contains named bent side hoops, sled feet, nonmarking foot
pads, rear ties/diagonal brace, tray decks and bent retainers with welded
stanchions. Five assembled tiers use linked editable parts; a hidden tray
template provides the export source. Closed components pass Blender manifold
checks. All meshes have UVs; no image textures are required.

Tray support centers are `y = 0.615 + row * 0.7`; trays rotate -12 degrees about
X. Their deck top is local y=0, and cartons rotate with their tray. Carton bottom
corners are checked against the actual exported triangles by raycasting.
Width/depth options scale hardware horizontally; rows repeat the shared tray
geometry. Taller row counts extend the frame. No new era gate is introduced.

`RackSteel` is replaced by the fixture-owned steel finish; `RackFeet` remains
rubber. Frame and tray GLBs are loaded once per fixture. Tray clones share their
geometry/materials within that fixture. The disposer frees each owned resource
once, including successful partial loads and requests completed after teardown.
The caller retains ownership of its replacement finish. Successful installation
requests both a render and a shadow refresh.

## Provenance and uncertainty

This is an original generic design dimensioned from the existing scene fixture,
not an exact reconstruction of a manufacturer's product. The local queue-rack
study's original video frames and 1993 footage were inspected: they support
black, floor-standing, roughly four-foot tiered racks and sloped merchandise
trays. They do not resolve exact tube sections, bend radii, joinery or a distinct
shorter rack requiring a separate variant. Those construction details are
original design choices. The existing four-foot floor-rack form is retained.
No archive imagery, branding, merchandise artwork or photo-derived mesh is
included in these deliverables.

## Delivery and verification

- Source: `tools/models/candy-rack.blend`
- Rebuild: `blender -b --python tools/models/candy-rack.py`
- Runtime: `public/models/candy-rack-{frame,tray}.glb`
- Measured cost: `tools/models/candy-rack-metrics.json`
- Geometry checks: `node --experimental-strip-types --test tests/candy-rack-assets.test.ts`
- Browser lifecycle/contact checks: `node tools/verify-candy-rack.mjs`
- Project checks: `npm test` and `npm run build`

Frame: 628 triangles, two material primitives, 29,796 bytes. Shared tray: 492
triangles, one primitive, 25,592 bytes. Default loaded hardware: 3,088 triangles,
seven draws and 55,388 downloaded bytes, zero textures. The existing stock adds
35 instanced boxes across five draws; hidden fallback geometry remains allocated
for collision and normal fixture disposal. The old hardware used ten draws.

Inspected in-store before/after front and side photographs, an over-counter rear
view (partly obscured by the counter), and an isolated rear construction detail
are kept in `scratch/publicity-kits/issue-193/` in the development checkout and
in the dispatch conversation's outbox. Public evidence was captured without
user-assets. The normal five-row configuration and custom three-row 4 × 1 ft
configuration pass stock-contact and lifecycle checks.

The local Blender installation reports an OCIO library/config version mismatch
and uses fallback color management. Mesh exports, UVs and geometry checks pass;
visual verification uses the actual Three.js store renderer.
