# Exposed joists and service ducts

Original scripted Blender geometry completes the existing optional exposed
ceiling. Editable source, generator and resource measurements are in
`tools/models/ceiling-structure.blend`, `ceiling-structure.py` and
`ceiling-structure-metrics.json`. The native Blender glTF exporter produces
`public/models/ceiling-structure.glb` with no images or external mesh data.

## Reference and design confidence

The construction study used the archived [2006 store interior photograph](https://www.flickr.com/photo.gne?id=243950517)
and the open framing visible in [concept-store footage](https://youtu.be/uOEIl5XaptY?t=1878).
They show paired chords, diagonal open webs, cross bridging, a separate roof
deck and suspended services. Dimensions are inferred generic construction,
not a survey of either building. The existing room, roof and fixture anchors
determine the installed spans. No private reference pixels, printed graphics
or concealed duct and light internals are included.

## Model and placement contract

One unit is one foot. Blender stores `(x, -store_z, height)` and exports Y up.
The source contains separate named component templates and an eight-foot
assembly for editing. Paired angle chords run along local X with a
one-foot length. Round diagonal webs use the same axis; duct spans run local Z.
Their actual cross-sections remain unchanged when a span changes length.
The bent duct has a .65-foot centreline radius and .34-foot tube radius.
Formed lower straps, seam collars and visible discharge louvers are separate
physical parts. All solids have manifold topology, positive volume and UVs.

Truss bottom is 1.3 feet below the existing ceiling datum; the upper chord is
.3 feet above it, below the existing opaque roof underside at +.35. Room edges
and stepped corners bound the spans. Joist rows meet every installed pendant
anchor, with intermediate bays no more than five feet apart. Actual television
collision volumes and existing cornice faces leave clear openings through the
lower chords and webs.
The continuous upper chords and end webs frame those openings. Existing
television mounts reuse their authored drop tube to reach the roof without
moving a cabinet or screen target.

Pendant attachments move to the lower chords. Lamp aiming follows those
attachments, and a fitting that conflicts with an actual cabinet is omitted
together with its light. The existing light and shadow budgets are retained.
No extra reflection pass, frame loop or physics simulation is introduced.

Service feeds begin at the visible side-fascia face. Pipework hidden behind the
opaque cornice is omitted. Straight ducts and quarter bends connect those feeds
to the two longitudinal runs, with formed straps suspended from the roof and
end discharge grilles. Routing checks television volumes and pendant anchors,
and begins after a stepped corner when present. A run is omitted if it cannot
fit. All geometry stays above customer and shelf clearance.

The acoustic-tile default and independent-shop formats retain their existing
ceiling. The existing Ceiling Structure setting selects this construction only
for corporate rooms at standard or high ceiling height.

## Loading, ownership and measured cost

The seven-part GLB is 84,260 bytes and 1,236 triangles, with three material roles
and no textures. Instances share templates in eight material batches, regardless
of store size. The final standard-room view with the shared television mount used 25,992
installed triangles;
exact counts and room dimensions are recorded with each photograph. The roof
contact extension reuses two existing mount parts, adding two draws for a shared
television mount or four for separate paired mounts. These are
geometry measurements, not physical-phone frame-rate claims.

The complete kit replaces the temporary beams only after successful loading.
Missing assets retain the beams; removal during loading disposes the late model
without installing it. Scene teardown releases both instance buffers and owned
geometry/materials. Loading requests one structural-shadow refresh and render.

## Verification

Export checks cover dimensions, open chord seats, finite normals/UVs, resource
limits and named parts. Layout tests exercise short, full, high and stepped
rooms, light anchors and television service openings. Browser tests cover
successful loading, missing assets and removal before completion. Installed
upward, side, duct-connection and elevated oblique photographs use a phone
viewport; the triple television view checks the adjoining shared mount.
Upward rays confirm that the retained roof blocks the sky across the room.
Evidence is kept in the private ceiling-structure publicity folder.
