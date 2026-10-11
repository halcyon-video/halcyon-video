# Wooden staff ladder (#233)

Exterior dressing for the 1993 store: a worn straight wooden ladder leaning on
the brick beside the right-wall service door. Installed only for theme `bb-1993`.

## Source and provenance

`tools/models/staff-ladder.py` authors the mesh in Blender with bmesh/bpy
(scripted mesh authoring); run `blender -b -t 2 -P tools/models/staff-ladder.py`.
It writes `tools/models/staff-ladder.blend` (visible welded ladder plus a hidden
"Editable construction parts" collection of separate rails, rungs, rods and
washers), `public/models/staff-ladder.glb` and `staff-ladder.geometry.json`.
The standard Blender glTF exporter is used; no new exporter was written.

No reference photograph was inspected for this object. The 1993 walkthrough
notes only say "a wooden ladder by the service door". It is an original generic
design, not a measured replica; dimensions have LOW historical confidence and
no reference pixels or real-chain marks are present.

## Construction

Two 1-3/4 x 1-5/16 in rails (eased edges), seven turned rungs with a worn waist
(radius .040 ft at the ends, .036 mid) seated through mortises cut in the rails
(boolean seats with 0.003 ft clearance, end grain showing 0.008 ft proud on
the outer faces), two steel tie rods with washers. Rail feet are cut flush to
the ground plane and the rail tops are trimmed flat to the wall plane (rails
closed and manifold before joining). Lean 14 degrees; rail length 7.2 ft.

## Scale, axes, anchors

Feet. Blender +X right, +Z up, +Y toward the wall; glTF export maps to store
(x, z, -y), so the wall is local -Z. Origin is the foot line on the ground,
centred. Empties: `floor_origin`, `wall_contact`, `top_rung`.

| Property | Export |
| --- | --- |
| Width | 1.44 ft |
| Height | 7.00 ft |
| Depth foot to wall | 1.758 ft (`wallOffsetFeet`) |
| Triangles / draws | see geometry.json (4 draw calls, no textures) |

## Material roles

`LadderRailWood`, `LadderRungWood`, `LadderEndGrain`, `LadderHardware`. The
runtime (`src/fixtures/staff-ladder.ts`) substitutes its own weathered colours
per role; no textures are embedded.

## Placement and behaviour

`buildStaffLadder` is called from `src/storefront-facade.ts` next to the service
door: wall face x = right edge + 0.63, z = beyond the stoop (stoop spans
doorZ +/- 2.2) by 0.5 ft plus the ladder's half width. That is outside
`rightSideDoorZone` and outside the interior, so it cannot touch the clerk
route. It has no collider and no interaction. A primitive ladder shows while the
GLB loads and stays if loading fails; teardown goes through `installDisplayModel`'s
release plus disposal of the fixture-owned materials and fallback geometry.
