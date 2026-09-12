# Poster frame family (#240)

Original generic Halcyon hardware, authored with `bpy` mesh profiles in Blender
5.2. Not a measured historical replica. Existing scene apertures, frame borders
and clearances supply the dimensions. No branded art or external mesh is included.
Artwork remains on the existing live surfaces.

- Editable source: `tools/models/poster-frames.blend`. Collections hold window and
  wall variants displayed side by side; four separately editable closed mitred
  members, four glazing-seat members and a fitted backing per variant.
- Rebuild: `blender -b -P "$PWD/tools/models/poster-frames.py"`. Absolute script
  paths also work with the ThinkPad's Flatpak Blender wrapper.
- Runtime: `public/models/poster-frame-window.glb` and `poster-frame-wall.glb`.
  Three merged-by-role meshes each, with original per-part topology retained.
- Author axes `(x, -depth, height)` export as glTF `(x, height, depth)`.
  Numeric units are store feet, not metres. Origin is the print centre at z=0;
  front is local +Z. No moving parts or new collision/interaction surfaces.

| Variant | Image aperture (ft) | Overall width × height × depth (ft) | Depth from artwork |
| --- | --- | --- | --- |
| Window | 2.5 × 3.75 | 3.14 × 4.39 × .22 | −.11 to +.11 |
| Wall | 3.133333 × 4.7 | 3.313333 × 4.88 × .08 | −.025 to +.055 |

The closed sweep includes a recessed inner shoulder, sloped reveal, broad front
land, eased outer lip and rear return. Moulding pieces meet at 45° mitres without
intersecting corner blocks. Glazing seats occupy the perimeter behind z=0; there
is no transparent pane over the live print. Backing sits behind z=−.012. All closed
parts pass manifold checks; all meshes carry UV islands and explicit normals.
Named material roles are `FrameFinish` (caller-supplied chrome or theme trim),
`GlazingSeat` (dark gasket), and `Backing` (neutral rear sheet). No texture images.

`src/poster-frame-model.ts` adapts the existing display-model loader. The original
bars/flat frame stay visible on loading or failure. Successful loading hides only
that hardware fallback and refreshes rendering/shadows. Static fallback geometry
is the scene teardown sentinel; detachment is deferred until the synchronous
scene traversal completes. Removed parents and late loads release model-owned
resources. Supplied finishes remain caller-owned. No process-global asset cache.

Window hardware uses the window group's inward orientation. The print itself
retains its original extra half-turn and inverted UVs (its mesh normal points
outward, while readable artwork faces inward). The marquee anchor is now the
hardware at the same print centre; its unchanged 2.82 × 4.07-ft ring faces inward
and remains .16 ft proud of the print, .05 ft ahead of the moulding land. Wall
hardware is centred at the existing portrait z=.065, scaling its aperture from
the existing dimensions; border extents, placement, era/décor gates and image
loading remain unchanged. Wall rear z=.04 stays clear of the wall/film strip.

Each exported variant has 220 triangles, three draws, three materials and no
textures: 17,212 bytes (window), 17,200 bytes (wall). See
`poster-frames-cost.json`. The photographed corporate store has nine windows and
six portraits: 3,300 visible frame triangles / 45 draws versus 444 / 42 before
(excluding unchanged artwork and marquee). Each installed frame owns its GLB
geometry and its two non-theme finishes; the family adds no global resources.

Verification:

- `tests/poster-frame-model.test.ts`: parse actual GLBs, assert resource budget,
  bounds, UV coverage, finite normals and ray hits confirming an unobstructed
  artwork plane, front land and recessed backing.
- `node tools/check-poster-frame-lifecycle.mjs`: actual browser loader, both
  variants, fallback on error, scene traversal disposal, removal during load and
  disposal during load; verifies released resources and render/shadow refresh.
- `node tools/verify-poster-frames.mjs <out> after` (or `fallback`): real StoreScene
  photographs, deterministic high-ceiling corporate bb-2000 with décor enabled.
  `before` was captured with original HEAD source before integration. Synthetic
  catalog uses the repository's neutral poster as stand-in portrait art.
- Before/after photographs and verification logs are delivered in the issue
  outbox. Window front/side/rear and wall front/side show the actual consumer;
  the wall rear is intentionally against the wall, not exposed for a beauty shot.

The `detail` photograph mode explicitly builds the optional marquee on the low
software-rendering harness, measures every generated bulb instance against its
frame's rectangle and +.16-ft mounting plane, and captures close corners.
Measured maximum alignment error across all nine front/side-window anchors:
0.00000184 ft. `FRAME_FORMAT` and `FRAME_THEME` select additional style scenarios.
The mom-and-pop layout with bb-1993 settings also loaded all four window and six
wall frames without page errors. Its window front/side/rear and wall front were
inspected; the corporate views supply the wall's grazing/corner evidence.
