# Checkout counter millwork

The front counter loads an original Blender-authored GLB, with shield, U-square,
and standalone desk variants in laminate and rounded profiles. The editable
source is `tools/models/checkout-counter.blend`; collections hold each variant.
Only the shield laminate collection is visible when the file opens.

Each cabinet is a closed, welded mesh. Its cross-section contains the recessed
toe kick, eased panel edges, under-top reveal, contrasting inlay, rolled worktop
edges, and clerk-side finger rail. Narrow panel joints are recessed into the
surface. There are no overlapping box solids or floating trim strips. Material
boundaries split the mesh into glTF draw primitives during export, but the
authored cabinet topology remains continuous. The generator checks every edge
for manifoldness before export.

Regenerate with Blender installed:

```sh
blender -b -t 2 --python tools/models/checkout-counter.py
```

The script saves the Blender source and all six GLBs. Model units are feet,
matching the store. Blender coordinates `(x, -store_z, height)` export directly
to Three.js coordinates. Shield/U-square origins are `cx = 0, backZ = 0` from
`src/entrance/counter.ts`; the desk origin is the centre of its customer-facing
edge and its depth points along local positive Z. No bounding-box fitting or
rescaling is used at runtime.

The outer top remains at 3.54 feet and the inner work surface at 2.82 feet.
Counter navigation, staff gaps, collision shapes, terminal placements and bag
anchors still come from `counter.ts`. The original simple solids serve as the
collision rig and loading/error fallback; they are hidden when the GLB arrives.

`CounterBody`, `CounterTop`, `CounterInlay`, and `CounterWorktop` materials are
replaced with the active theme's finishes at load time. UVs follow the run and
the millwork section. Neutral plinth/reveal finishes stay with the model. The
loader refreshes shadows after installation and releases model resources if
the entrance is removed, including requests finishing after a rebuild.

Optional local installations use
`public/user-assets/fixtures/checkout-counter/<theme>-<shape>-<profile>.glb`
(`laminate` or `rounded`). An active brand pack has precedence over the flat
local directory; missing or invalid files fall through to the original model,
then the procedural counter. These assets must fit the existing ground-plan
and staff-access envelope. They may replace the internal cabinet construction.
No local geometry or imagery is required by the public app.

GLB empty nodes with the `counterMount` extra publish support points:
`mount_terminal_0/1`, `mount_housing_0/1`, `mount_printer`, `mount_telephone`,
and `mount_bag`. Their world position and local +Z supply surface height and
facing. Terminal groups include the screen and camera dock. A loaded housing
raises its terminal by the housing's actual exported height; without a housing,
the terminal rests on its cabinet shelf. Bag placement updates its resting,
mouth and checkout-motion transforms together. Missing mount nodes keep the
existing corresponding placement. No new settings or interaction targets.

The optional installation retains theme finish roles and equipment contact AO.
The loader releases detached results and its owned materials, textures and
geometry on removal. Public fallback geometry, local source, and per-installation
reference confidence remain separate concerns.

## Receipt printer worktop and finishes

The shield worktop extends 0.6 feet farther left in world X (about 0.77 feet
along its angled run); the half-square extends 0.25 feet within its existing
surround. The same endpoints generate the loading fallback, authored cabinet
and clerk-navigation obstacles. The printer rests on the inner worktop left
of station zero: along-counter offsets -5.65 and -4.7 feet respectively.
Optional installations can publish the corresponding `mount_printer` support.
The independent shop desk retains its existing footprint.

Laminate body, perimeter and inlay retain albedo and normal detail and now
share roughness variation. Molded equipment gains physically scaled grain
and finish variation using a separate UV channel; authored colour and normal
maps, printed art, luminous screens and transparent glass are preserved.
Plastic is dielectric. Small detail maps are allocated on installation and
released with their owning model or fixture group.

## Reference geometry reconstruction and equipment bays (#308)

The checkout millwork reconstruction aligns internal cabinet structure and equipment support bays with primary reference photography:
- **Terminal recesses**: Primary and secondary register stations (`mount_terminal_0`, `mount_terminal_1`) align along the clerk-side inner worktop at 2.82 ft elevation, with station 0 defining the operator transaction focus and search origin.
- **Cash-housing support**: Discrete mounting anchors (`mount_housing_0`, `mount_housing_1`) support period till enclosures beneath each register terminal. Installing a till housing dynamically elevates its station group by the housing's exact exported height (`supportHeight`).
- **Staff drawer and cupboard bank**: The clerk-side joinery profile establishes an integrated work surface below the 3.54 ft customer-facing counter ledge, maintaining clear foot kicks and staff service access.
- **Receipt printer bay**: The extended inner worktop supports the receipt printer to the left of station 0 (`mount_printer`), preserving functional reach and equipment contact occlusion.
- **Reference confidence**: Exterior customer-facing millwork, counter heights, and equipment placement match primary photographic references; unexposed internal carcass joinery and hidden structural partitions remain estimated.

## 2010 repair variant

The 2010 shield uses a straight 3.6-foot staff opening, 1.0 to 4.6 feet
along the left shoulder from its rear corner. Its old shoulder-corner gap
is closed. The collision rig, clerk navigation and fixture reservation use
the same opening; the cleaner display moves to the supported rear band.
Other eras retain their existing perimeter. The 2010 shield and half-square
public models have closed recessed drawer reveals on their clerk-facing
work cabinets. They remain original generic furniture; private cabinet
reconstructions retain their separate loader priority and source.

## F8 follow-up, 2026-09-13

All shield-era surrounds now use the same straight 3.6-foot staff entrance,
1.0–4.6 feet along the left shoulder from the rear corner. The former corner
gap is closed, and the tape-cleaner display moves onto the rear band. Collision
and clerk navigation follow the same segment endpoints as the Blender mesh.
The shared authoring helper cuts an open staff receiver behind the tape-return
slot. It is also reused by locally installed reference cabinet models.

## Wall and diagonal alignment

The shield outline uses 45-degree shoulders and customer faces: its back
half-width is 6.2 ft, shoulder half-width 9.8 ft, shoulder depth 3.6 ft and
tip depth 13.4 ft. The inner worktop and return receiver follow those faces.
Vestibule door corners and both diagonal aisle arrangements use the same
45-degree plan grid. The separate returns cabinet uses equal X/Z diagonal
advances and scales uniformly in the floor plane, including its collision
segments, so smaller stores cannot skew its angles.
