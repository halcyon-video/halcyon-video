# Shelf price channels and recommendation clasps — #237

Original generic hardware, scripted in Blender 5.2. This is not a measured
historical replica. Small-section dimensions below are design assumptions
fitted to the existing scene. No external art or textures
were introduced. Source follows the repository license.

Rebuild: `blender -b -t 2 -P /absolute/path/to/tools/models/shelf-components.py`.
Editable source: `tools/models/shelf-components.blend`; runtime:
`public/models/shelf-components.glb`. The existing #152/#153 shelf kit is reused,
not replaced with a second carcass. Per-part bounds, topology cost, UV presence
and material names are in `tools/models/shelf-components-metrics.json`.

## Attachment contract

One scene unit is one foot. Blender `(x, -store_z, height)` exports runtime Y up;
local +X points toward the customer, local Z runs along a shelf. Editor object
translations separate the parts; stamping intentionally uses local geometry.
There are no moving parts or new navigation footprints.

| Part | Runtime size, feet (X depth × Y height × Z span) | Construction |
| --- | --- | --- |
| Rail | .044 × .080 × 1 | Closed extruded section with open card recess and retaining lips |
| RailEndStop | .047 × .082 × .012 | Fixed-size finished end plug |
| RailClip | .048 × .076 × .075 | Rear C spring; two minimum, ceil(span/2) per rail |
| ClaspCarrier | .024 × .206 × .974 | Eased blue polymer carrier behind the card |
| ClaspJaw | .076 × .102 × .075 | Sprung return jaw; two at Z = ±.33 per clasp |
| Runtime card / click target | .018 × .190 × .950 | Separate visible print and transparent pick mesh |

Movie and game channel origins sit .018 inside the deck edge and .012 below its
support anchor. Solid modeled decks stop .044 inside each edge, leaving the
channel recess clear. Wire shelves retain their own crowns and depth. The game
shelf now consumes the same modeled deck/wire parts to honor this clearance.
Wall channels use the same cross-section, rotated -90 degrees around Y, with
its back at the existing wall shelf front. The wall carcass no longer stamps
its embedded rails, avoiding duplicate hardware; its original rail parts remain
editable in that source kit.

Only the channel's straight span stretches. End stops and clip cross-sections
keep their physical size. Each rail is cut .024 shorter than its finished length
and plugged at both ends. Existing yaw, stock placement, row heights, end panels,
collision proxies and live sign programs are preserved.

Clasp origins follow the actual top deck, .012 outside its edge. Previously these
were invisible category markers floating above that deck. #237 explicitly
commissions clickable clasps, so the original blue recommendation card is
restored at the physical lip. Availability still requires Jellyseerr/demo and a
store format with a clerk. There is no new clasp placement on game or wall bays.
The root pick mesh retains category/library metadata; its card child highlights
amber, and its carrier and jaw children never become independent click targets.
The existing click, E-prompt, browse cursor and clerk-walk flow are retained.

## Finishes, UVs and ownership

`ShelfFinish` is replaced by the theme's shelf/strip finish; `ClaspBluePolymer`
uses the existing blue edge material; `SpringSteel` is opaque satin steel.
All authored solids have UV islands and checked manifold edges. The card retains
the single shared 768 × 154 canvas and its existing mapped face. No new bitmap
textures, transparency surfaces or emissive materials are used for hardware.

ShelfModelBatch loads once per shelf build, merges stamped rails/clips/stops into
one mesh per replacement, keeps hidden collision proxies, and cancels installation
when their geometry is disposed. A missing or incomplete kit keeps the original
shelves/strips. The wall carcass and channel loaders can fail independently.

Clasps load one kit per set and share exactly two hardware geometries and two
hardware materials across all placements (carrier finish is already owned by
ShelfClasps). Loading failure keeps the printed card clickable. Cancellation
releases late imports; disposal removes instances and releases each shared
geometry once. Both loaders refresh shadows and request a render on success.

## Cost and verification

The complete shelf kit is 82,988 bytes, up from 70,940 bytes (+12,048), with 1,080
triangles across 14 named meshes. New template cost: clip 44, end stop 20,
carrier 20, jaw 56 triangles. A finished rail has 92 + 44N triangles for N clips;
an eight-foot rail uses four clips and 268 triangles. A clasp adds 132 hardware
triangles and two draws, with geometry shared across the entire set. The separate
click proxy adds one non-writing draw; its existing card uses the original
material grouping (six card draws). Including that card and proxy, a visible
clasp totals 156 triangles and nine draws; all geometry and the one canvas are
shared. There are no additional textures. Wall channels add one draw
per tier while the wall carcass drops its former channel-material draw.

`tools/verify-shelf-hardware.mjs` uses the existing StoreScene photography pattern
with synthetic stocked aisles and explicit theme/quality settings. Output belongs
in the issue outbox, with before captures from the untouched checkout. Side and
rear views are required alongside the stocked run. This is local verification,
not deployment. Full checks: `npm test && npm run build`.

Verification completed with 703 tests and the full build passing. Browser pointer
checks in both bb-1990 and bb-2010 dispatched exactly one clerk walk and preserved
scope; hover, walk reach and browse selection found the same targets. Missing
assets, late disposal and geometry sharing were exercised in tests and the browser.
The optional `SHOT_GAMES=1` photograph scenario adds an unstocked GameSection at
its declared placement after the stocked movie store boots, to inspect its four
decks/eight channels without obscuring hardware with cartons. Its construction
load is asserted before photography. `SHOT_VIEWS` and `SHOT_THEMES` select views
and themes; `SHOT_PORT` isolates the server. Native detail photographs use the
existing feedback-snapshot method. Bright laminate makes the small recesses
subtle; wire side/underside photographs show the construction most clearly.
