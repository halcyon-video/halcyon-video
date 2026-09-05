# Aisle and CRT remodels

Original, generic Halcyon construction, authored with scripted Blender meshes.
These are not asserted replicas of a named manufacturer's product or traced
owner photographs. No third-party geometry or imagery enters the new models.

## Active CRTs

The store uses the original `crt_monitor.glb`, `tv_ceiling.glb` and
`tv_hero.glb` assets again. The September remodel's cabinet replacements
were withdrawn after owner review. The register retains its original beige
finish, curved glass, inset menu safe area and 1.3-foot camera distance;
the televisions retain their original screen crops and curved live overlays.
Late-load disposal guards and lighting classification remain in place.

## Inactive CRT family

The following authored variants remain available as editable source assets,
but are not selected by the store or prop registry.

`tools/models/store-crts.py` reproduces the three exports and the editable
`tools/models/store-crts.blend`. Source collections retain the individual
moldings, cabinet halves, assembly seam, keys, speaker slots, side cooling
banks, rear service plate, connectors and support feet. Only the disposable
export copies are merged by material.

| Export | Nominal width × height × depth, feet | Tube width × height | Tube center Y |
|---|---|---|---|
| rental-terminal.glb | 1.48 × 1.55 × 1.34 | 1.075 × 0.806 | 0.90 |
| ceiling-television.glb | 2.60 × 2.12 × 2.08 | 2.120 × 1.590 | 1.19 |
| screening-television.glb | 2.20 × 1.86 × 1.85 | 1.780 × 1.335 | 1.04 |

Connectors and controls project slightly beyond nominal cabinet depth. Each
export is under 400 KB, under 8,000 triangles and six material primitives.
One embedded 128-square roughness texture supplies deterministic molded ABS
grain. UVs and named material roles are included; no external image request
is needed. Cabinet shells and seams have closed wall sections, an open tube
aperture, and a separate back cover. Tube and glass are intentionally open
curved surfaces. Closed authored parts are checked for manifold edges.

Coordinates are feet, bottom Y=0, forward -Z, centered on X. Blender authors
(x, -store Z, store Y) and exports Y-up. `mat16` identifies glass and `mat17`
the tube independently. These names retain the rental-terminal contract and
replace the old guessed television crop rectangles with measured surfaces.
Only live tube layers emit; ABS, rear metal, foot rubber and glass reflections
use physical materials. Terminal body finishes remain replaceable without
discarding the molded surface map.

The rental monitor retains the island clearance calculation, live shared menu,
search camera and fallback. The ceiling sets retain their shared video feed,
playback logic, tube overlays and peek poses. The screening-room set retains
its stand anchor, screen overlay stack and playback behavior. Cached TV meshes
remain shared; an abandoned terminal load is disposed instead of being attached
to an already removed counter.

## Aisle construction

`tools/models/shelf-components.py` and its editable Blender source extend the
existing kit with eased laminate uprights, a recessed-toe spine, finished end
panels, closed C-section steel standards and formed feet. Existing authored
decks, price channels, opaque bent-wire grids and under-deck brackets remain
shared. This is a structural upgrade to that kit, not a duplicate shelf loader.

Laminate supports follow the existing height-dependent taper. The laminate A-frames
keep the existing pale finish on their backing, uprights and decks, including
the 1993 family. Branding remains on the designated trim and end-panel faces. The late wire family uses formed
steel standards and feet at bay joints and both ends. End panels retain their
face materials, click targets, library metadata and physical position while
receiving the modeled edge profile.

The runtime adapts lengths and frame height from the existing store plan.
Case lean, tier heights, column capacity, shelf origins and eleven-foot aisle
spacing are unchanged. Both short and full stores use the same components.
Geometry remains merged by replacement material, not one draw call per wire
or modeled piece. Loading failures retain procedural construction; retired
batches abandon replacement and release their imported geometry and materials.
The exported kit is about 71 KB, with UVs on all ten named components.

## Lighting contract

Ordinary objects use scene lighting and exposure. Artificial emission was
removed from ceiling bounce materials, soffit drywall, HVAC faces, category
signs, curtain beads and focused recommendation clasps. Road paint, terrain
blending, acrylic sheen, the animated clerk billboard and screening-room scenery
use lit materials. Existing
surface albedo, normal, bump and roughness maps remain attached. Painted solids,
metal, rubber and clear glass keep finishes appropriate to their materials;
not every physical finish requires an albedo image.

A low-frequency hemisphere light represents interior light reflected upward
from the floor and fixtures. It illuminates normal PBR surfaces rather than
making those surfaces emit, and remains separate from outdoor sky presets.

`auditStoreMaterials` reports unexplained unlit, emissive or exposure-bypassing
materials. Exceptions are explicit: actual bulbs, tube pictures, LEDs and
illuminated sign faces; window posters; and nonphysical sky, navigation overlays,
shadow compositing, light-spill layers and actual planar reflection shaders. An ordinary prop may not acquire an
exception simply to make it brighter. The audit runs during development builds
and can also inspect completed scenes after asynchronous loads.

## Verification

The model tests parse shipped GLBs with Three.js, verify dimensions, surface
names, UVs, normals, resource budgets and rays through the live tube opening.
They guard against an opaque cabinet seam covering the picture. The material
checks cover forbidden unlit/emissive finishes and deduplicated disposal of a
late unadopted load. Build, store tests and inspected scene photographs accompany
the dev landing. Additional photographs and measured runtime results are kept
in the landing's publicity kit.

Validated on the development GPU with 480 passing unit tests, both navigation
root suites, blocked-model fallback checkpoints, and inspected photographs in
1990, 1993, 2000, 2010 and independent-shop configurations. The full late-era
scene audit examined 1,607 mesh objects and 404 unique materials with no
unexplained bypasses. Ordinary surfaces and refreshed planar reflections fall
to a uniform near-black when lights and environment are removed.

A full late-era repeated aisle line comprises four unit groups: 21 + 19 + 19 +
22 visible material primitives (81 total) and 67,336 structural/sign triangles.
The count includes deck wires, support profiles, end panels and shelf signage;
instanced stock and render passes are outside this construction count. An
individual television adds six source primitives (four cabinet primitives when
its authored tube/glass are hidden for the existing live screen stack).
