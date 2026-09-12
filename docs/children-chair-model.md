# Molded children’s chair (#281)

The chair asset and guarded fixture component are delivered. **The complete
issue remains blocked on the children’s nook host**: current store plans do
not build one. See `children-section-arch-model.md` (#206). No production
placement, installed-nook photograph or actual nook navigation is claimed.
The placement helper deliberately receives no host from current store plans.
Building the nook/arch is a separate work order.

## Original construction and source

`tools/models/children-chair.py` authors the mesh in Blender; run
`blender -b -t 2 -P tools/models/children-chair.py` from any checkout. The
editable `tools/models/children-chair.blend` retains separate construction
surfaces in a hidden collection and the visible optimized one-piece molding.
The standard Blender glTF exporter writes `public/models/children-chair.glb`.
No new exporter is involved.

The original owner photograph was inspected privately. It confirms small
light-colored molded chairs, upright backs and separate legs; it supplies no
reliable dimension standard on the chair plane and does not resolve undersides.
This is an original generic design, not a measured replica. No reference pixels,
real-chain graphics or source-derived skins are present in the public asset.
Dimensions, thickness and hidden construction have LOW historical confidence.

The continuous seat/back surface has a shallow sitting basin, curved lumbar
transition, rounded perimeter and nominal 0.06-ft thickness. Four rounded,
splayed leg profiles broaden into the seat. Blender remeshing welds their
transitions, followed by smoothing and decimation. The final solid has one
connected component, zero nonmanifold edges and positive volume. Solid leg ends
are an original modeling choice; no hidden ribs or mold tooling are invented.

## Scale, axes and anchors

Units are feet. Blender +X is right, +Z up, -Y forward; exported Three.js +X
is right, +Y up, +Z forward. Origin is floor centre. No animated parts.

| Property | Measured export |
| --- | --- |
| Width | 1.13149 ft (13.58 in) |
| Depth | 1.09028 ft (13.08 in) |
| Height | 1.79183 ft (21.50 in) |
| Seat support at centre | 0.89289 ft (10.71 in) |
| Pair centres | 2.30 ft apart |
| Pair overall width | 3.43149 ft |
| Conservative individual footprint | 1.16 × 1.13 ft |

The GLB carries `floor_origin`, `seat_support` and `back_top` empty anchors.
The fixture adds individual `chair-seat-*` anchors at local height 0.893 ft.
Its root sits 0.015 ft above the floor to clear carpet. Collision proxies cover
individual chairs, leaving the space between them open.

## Finish, loading and ownership

`ChairPlastic` is replaced by the active theme’s `palette.accent` (cream in the
current default palette). MeshStandardMaterial uses nonmetallic plastic with
nominal roughness 0.4. The existing `finishEquipmentSurfaces` supplies two
128×128 repeating textures: fine bump grain and roughness variation. Imported
UV0 remains available for future art; UV1 drives the fine plastic finish.
Textures have 128 KiB total base texels, approximately 171 KiB including mipmaps.
No textures are embedded in the GLB.

`installDisplayModel` retains the rounded procedural fallback on load failure,
hides it after success, rejects cancelled/detached loads, and requests both
render and shadow refresh. A pair uses one InstancedMesh and shares geometry,
material and textures. Removing the root disposes the fixture, disables stale
collision raycasts and releases all owned resources. `update()` does no work.

Measured asset: 172,444 bytes, 6,438 triangles, one material, one primitive/draw.
The pair renders 12,876 triangles in one draw; shadow passes are additional.
The retained fallback and collision geometry are owned and released too.

## Future host contract and current omission

`childrenChairPlacements(host)` requires explicit reserved red-carpet space,
family stock, and at least 8 × 11.5 ft of clear host rectangle. Local -Z is the
TV side. At the minimum depth the row sits at Z=-3.5 and faces the TV. The back
1.5 ft is reserved for the TV; the chair proxy leaves 0.185 ft beyond that zone.
A central 5-ft turning circle and a 3-ft-wide front approach remain clear of the
chair proxies. Host rotation is supported.

These are conservative design dimensions, not measurements from the photo and
not a substitute for validating surrounding shelves, the actual TV, portal,
clerk destinations and browse cameras once #206 reserves a real host. A missing,
undersized, unreserved or unstocked host returns no placement. No corners are
implicitly occupied; current small and full stores omit the chair.

## Verification

The shipped-GLB test checks scale, floor datum, material, UV availability and
size/triangle budgets. Blender verifies a connected manifold solid. The existing
asset viewer checks a loaded pair, UV0/UV1, bounds, instance/draw counts, host
omission/size/stock/rotation gates, teardown and cancellation during load. Removal
released six unique geometries, three materials and two textures; a late load
released its imported geometry and installed nothing. Missing-GLB fallback was
photographed and the GLB restored. Navigation unit tests passed (7).

Front, side, rear, underside, pair and fallback photographs were inspected.
Small/full store checks reported zero layout errors with 28/39 navigation
rectangles and no child chair. These are omission checks, not installed-nook
navigation. Private harness lighting-stage photos are explicitly previews.
Public result photographs are kept in `scratch/publicity-kits/issue-281/`, from
a camp without private user-assets. Reference photographs remain private.
