# Shelf construction models

Aisle and wall display decks now have eased board edges and recessed price-card
channels. The wire-frame theme uses opaque round-wire geometry, folded support
brackets, wire dividers and physical slat grooves instead of a textured grid box.

Blender source: `tools/models/shelf-components.blend`. Rebuild with
`blender -b -t 2 --python tools/models/shelf-components.py`. Runtime kit:
`public/models/shelf-components.glb`, installed by `src/shelf-model.ts`.
The five independently editable parts are closed manifold solids with UVs.
The original generic construction uses no photographic textures or brand marks.
Local photographic observations and confidence notes remain under the ignored
`public/user-assets/fixtures/shelf-reference-study/` directory.

## Placement contract

Store units are feet; runtime Y is up. Blender authors `(x, -store_z, height)`.
Object translations separate the parts in the editor; the loader uses their local
geometry. Deck surfaces and wire crowns remain at shelf anchor Y + 0.02. Solid
decks stop behind the channels rather than filling their recesses. Rail sections
retain their physical thickness as the longitudinal span changes. Deck edge eases
also retain their dimensions when shelf depth changes.

Existing layout supplies row heights, taper, bay span, shelf depth, orientation,
case positions and collision meshes. Category graphics and end-cap identities
retain their current theme program. Wire finishes use the active dark frame and
warm backing finish; laminate and timber use their existing material roles.

## Loading and ownership

Each store build loads one 14 KB GLB and stamps its sections into merged meshes.
There is one draw call per replacement, not per wire. On success, original meshes
remain hidden as registered collision proxies. A missing kit keeps the original
visible geometry. A pending load observes original-geometry disposal, preventing
installation after scene destruction. Template geometry and imported materials
are released after stamping; replacement geometry is owned by scene teardown.
Locally allocated finishes are released on failure or adopted by the scene.

## Verification

The source generator checks each part for manifold edges. The full application
build and 467 existing tests pass. In-app photography covers solid and wire eras;
additional browser checks exercise ordinary loading, stable reconstruction counts,
a missing model, and destruction while the GLB is in flight. Dimensions of small
hardware sections are plausible construction assumptions, not factory measurements.
