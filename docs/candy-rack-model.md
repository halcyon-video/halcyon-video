# Queue candy rack (#193)

CandyDisplay remains the single existing queue rack. Its five labels, catalog
IDs, selection flow and era behavior are unchanged. Repeated procedural cartons
now fill the tray depth (175 cartons at the default size, five instanced draws).
The collision footprint is 3 × 1.6 feet. Both counter placements move outward
0.45 feet along the customer-facing normal, retaining the previous rear edge
and clerk access. The standalone desk format still has no queue rack.

## Original public fallback

The committed Blender hardware is the existing original generic design, with
rounded side hoops and sheet trays. It is not a photographic reconstruction.
Its normalized exports remain unchanged: frame 628 triangles / two primitives /
29,796 bytes; tray 492 triangles / one primitive / 25,592 bytes. At runtime the
frame and tray depth scale from the original 0.7-foot authoring contract to the
fixture depth. Five trays share geometry. Hardware totals 3,088 triangles and
seven draws; stock adds 2,100 triangles and five draws. No new textures are added.

Source: tools/models/candy-rack.blend. Rebuild with
`blender -b --python tools/models/candy-rack.py`. Source units are feet; Blender
(x, -store_z, height) exports as store (x, y, z). Tray support is local y=0,
rotated -12 degrees, translated to y=0.615 + row*0.7. Stock is transformed by
the same support plane. The public source and exports carry no private imagery
or reference-derived replacement geometry.

## Optional local hardware

A locally installed pair at
`public/user-assets/fixtures/candy-queue-rack/candy-rack-{frame,tray}.glb`
replaces the public hardware. Both must load successfully; a missing/failed
member releases the partial pair and falls back to the public pair. If that
also fails, the built-in procedural frame and shelves stay visible. Late
responses after disposal release their resources without adding to the scene.

The local pair's normalization is 3 feet wide × 1.6 feet deep, floor-centered,
with the same tray origins, angle and material roles (`RackSteel`, `RackFeet`).
The frame scales in height for extra rows; trays repeat for the existing row
option. The local path also adds three packets per row to its side support,
sharing the original stock geometry and catalog materials. These add five
instanced draws and 180 triangles. They add no selectable row or new product.
The fixture owns the shared stock resources and replacement steel finish;
the loader owns imported resources. Install refreshes shadows and rendering.

Private source, reference provenance, uncertainty, geometry measurements and
inspected photographs accompany the local drop-in, outside the public tree.
Their construction must not be inferred from the original public fallback.

## Verification

- `npm run build` and `npm test`.
- `node tools/verify-candy-rack.mjs`: public loading, all stock-bottom corners
  raycast against exported tray triangles, footprint, failure and disposal.
- `CANDY_CHECK_PRIVATE=1 node tools/verify-candy-rack.mjs`: the same checks
  against an installed local pair. Both runs include a 3-row, 4 × 1 ft rack.
- `node --experimental-strip-types --test tests/candy-rack-assets.test.ts`:
  public exported bounds, UVs, normals and resource budgets.

The private screenshot harness additionally checks both shield and square-U
counter placements for candy-related layout violations, preserves the five
checkout rows, and runs the clerk-path checkpoint. Inspected public photographs
must come from a tree containing no user-assets. Private in-store front, side,
over-counter rear and isolated rear detail are delivered separately; the
counter occludes the lower rear in the in-store rear view.
