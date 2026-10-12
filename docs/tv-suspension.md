# Ceiling television suspension

Original generic hardware authored in Blender, in feet, around the original procedural CRT envelope (2.6 × 2.2 × 2.2 ft). The currently approved GLB cabinets are retained; their actual installed visible bounds are measured below rather than assumed from that procedural envelope. This is an engineered fictional mount, not a manufacturer reproduction or a measured reconstruction of a historic three-screen installation. The existing separate CRTs and wall-bank configuration remain available. The 1993 era defaults to a shared three-screen assembly, as requested; the overhead-TV settings offer the era default, separate sets, and shared frame. The optional six-screen wall cabinet is outside this change.

`tools/models/tv-suspension.py` reproduces the editable blend and GLB. Named exported assemblies are CeilingPlate, DropStem, Swivel, Cradle, and TripleCradle. Materials are PowderCoat, ZincFasteners, and CableJacket. Every solid passes a manifold-edge assertion and carries UVs. The single cradle uses continuous extruded frame profiles, cabinet support pads, upper bridge, and a capped cable sweep. The shared variant uses continuous upper/lower rails, dividing uprights, trays and a top suspension spreader.

The runtime places the ceiling plate directly above the transformed cabinet attachment, rather than driving a pole into the cabinet center. The one-foot stem scales to the actual gap; the swivel follows the television's tilt. The existing glass, crop, synchronous video texture, cabinet replacement, collision objects, and screen-peek targets stay owned by AmbientTvs. The shared assembly retains three separate screen targets. A failed/late load retains the procedural mounts, and a load after teardown releases its resources. Unselected geometry stays hidden under the scene owner because its materials are shared with installed parts; scene teardown disposes them together.

Public photographs and runtime attachment measurements are in `scratch/publicity-kits/arngrim-tv-mount`. Screenshots use a Chromium phone viewport on the ThinkPad GPU; they are not physical-phone frame-rate evidence. The GLB's exact mesh and size metrics are emitted beside the authoring script.

## Shared enclosure primary wave (#209)

This extends the existing original `TripleCradle`; it does not commission a
second suspension cage. The established rails, support pads, service loops,
spreader, ceiling plate, plumb drop, swivel, single cradle and CRT consumers remain.
`TripleHousing`, nested under `TripleCradle`, adds a formed three-aperture front
pressing with 0.10 ft returns, thin upper/lower skins, a fitted 0.55 ft square
swivel opening, nine pierced ventilation slots in each end cap, four visible
fasteners and an open rear perimeter return. Every sheet has real thickness and
continuous connected faces around its openings. There is no rear slab or hidden
cabinet interior. The existing Blender exporter and named three finish roles are
reused. All solids pass the existing manifold assertion; the export has usable UVs.

Owner-supplied period footage was inspected directly: the single suspended cage
supports only open mount construction, not survey dimensions of a historical
shared triple. The distinct six-screen L-shaped cabinet footage supports a future
variant, not a reason to turn this suspended assembly into a floor cabinet.
This enclosure is an original generic engineered interpretation. No footage,
manufacturer marks, reference-derived textures or downloaded geometry were added.

### Measured anchor and envelope

Measurements use actual visible vertices, full world-matrix updates and ancestor
visibility filtering in the central CRT's coordinate frame. Hidden fallback,
source and template geometry are excluded. Each retained approved cabinet occupies
approximately 2.91122 × 2.77786 × 2.71819 ft. Shared local bounds are X
-4.19899..4.21223, Y -1.41775..1.36010, Z -1.56559..1.15261. Centres stay at
X -2.75, 0 and +2.75. Cabinet projected X bounds overlap by 0.16122 ft at that
spacing; this is an existing bounds observation, not a solid-intersection claim.
Monitor geometry and spacing are unchanged.

The formed outer envelope is 8.56 ft wide; fastener heads extend it to approximately
8.604 ft. The three clear openings are 2.65 × 2.35 ft. Actual picture width remains
2.10 ft, height 1.74559 ft, and local front depth 1.110..1.145 ft; gloss remains
slightly proud of the picture. Recesses clear the actual layers, not centred
assumed cabinet seats. Front openings and the rear depth path remain unobstructed.

The verified normal 13.5 ft room has a 0.33189 ft ceiling gap and 9.53803 ft floor
clearance for the addition. It stays inside the existing room footprint and does
not intersect the three loaded new-release wall bays, whose tops are at 8 ft.
The original drop remains 0.51615 ft long and plumb; attachment, television tilt,
three screen targets, picture crop, glass and synchronized program are unchanged.

### Absolute clearance and ownership

The loader uses precise transformed child bounds. The addition is visible only
when its lowest point is at least 7 ft above the floor and its highest point is
at least 0.10 ft below the ceiling. This depends on actual clearance, not theme.
At the supported 9 ft low ceiling, only `TripleHousing` is hidden: the entire
original open `TripleCradle` and all three unchanged CRTs remain. At normal
13.5 ft and supported raised 18 ft ceilings, the enclosure is visible. A 19 ft
stress case was also exercised. No new low-room protrusion is installed.

The optional child uses the existing source/material ownership and scene disposal.
Successful installation wakes the render and structural shadow refresh once.
Missing assets or insufficient mount clearance retain the existing procedural
mounts. Late successful loads after teardown release their resources and never
wake or reattach to the removed owner. Separate single sets and the existing
three-screen wall bank are preserved; no new settings, screen or navigation path
is introduced.

### Cost and targeted evidence

| Suspension mesh cost | Before | After |
|---|---:|---:|
| Family GLB bytes | 518,424 | 842,400 |
| Installed shared cradle/enclosure triangles | 3,628 | 8,976 |
| Installed shared cradle/enclosure batches | 3 | 5 |
| Full family export triangles | — | 12,808 |
| Full family mesh batches | 12 | 14 |
| Embedded textures | 0 | 0 |

The two new batches share PowderCoat and ZincFasteners. CableJacket and all other
existing finishes remain. The family includes unselected assemblies retained by
the existing ownership mechanism; those are hidden and are not rendered draws.
No frame-time or physical-device performance claim is made.

The actual-export test checks all openings and the rear depth path, swivel opening,
finite normals, UV coverage, roles and bounded resource cost. The scene probe checks
30 centre/corner rays from the actual picture and gloss layers, synchronized video
and the current 640 × 360 crop (repeat X 0.67670636, repeat Y 1), target names,
ceiling/room/bay clearance and actual mount loading at low/normal/high heights.
Missing/late/rejected loads, resource ownership, unchanged single installation and
unchanged wall-bank selection are exercised. The enforced application build runs
its budget, provider, slot and TypeScript gates. Navigation inputs were unchanged,
so no unrelated navigation sweep was added.

Positions, normals, indices, transforms and finishes of CeilingPlate, DropStem,
Swivel and the single Cradle match the prior export exactly. Their UVs match except
for the single Cradle's uniform untextured CableJacket, whose usable islands were
repacked by Blender. This does not change its no-texture material path, geometry
or appearance; byte-identical UV attributes are not claimed.

Inspected before/after front-oblique, open rear and ceiling attachment photographs
are retained with the written receipt. The front-oblique includes the visible
vented end cap. Two black high side/attachment captures were rejected and retained;
these are not represented as successful views. The accepted preview preceded
checks and landing. No supersample wait was repeated after discovering that the
shot tool treats a string `--settle 0` as truthy; subsequent captures omit the flag.

### Remaining commission

This is the suspended-triple primary wave only. The existing wall-bank geometry
remains as before. The optional L-shaped six-screen cabinet, six independent screen
mappings, floor plinth, real browseable stock in the lower-right opening and
lectern relationship are not delivered here; #209 remains open.

Before the optional variant, reconcile scale: four full current 2.77786 ft cabinet
heights already total 11.11 ft before joins/plinth, while the footage's seven-to-eight
foot study is explicitly low confidence. A separate uniformly smaller monitor
variant could preserve the approved default CRTs, but its scale needs a documented
reference/adjacent-shelf study before authoring. Then build the three-across/four-down
shared-corner enclosure, reserve the lower-right stock opening through the existing
fixture/shelf targets, place the existing lectern ahead/right and validate walk
clearances and all six cropped screens. No optional placement or new model was
silently installed in this wave.
