# Screening-room coffee table (#215)

Original generic period-compatible oak/glass furniture; no exact historical
product claim. Scripted Blender mesh authoring replaces Kenney geometry.
Editable source: tools/models/coffee-table.blend; generator: coffee-table.py in the
same directory. Run Blender headless with the absolute script path.

## Contract

Loaded dimensions remain 3.5 wide × 2.0125 high × 3.5 deep feet, measured from the
original GLB after registry scaling. The unchanged fallback is 3.5 × 1.35 × 1.8.
Blender Z is up; Blender -Y exports as store +Z. Origin is floor centre, placed at
room-local (0,0,0.9), relative to (211,0,0). Named empty nodes publish tabletop,
case and receipt supports. Runtime retains size.y as the common support height
for cases, receipt and contact shadows. No animation, navigation or collision changes.

Four mitered oak rails have routed glazing rabbets. Tapered legs meet their
undersides; resilient pads support a closed eased glass slab; glides meet the
floor. Flush brass pins mark frame joints. All 21 solid parts are manifold checked
with outward normals and planar UVs at feet/3.5 scale. All remain separate in the
editable source; runtime batches them by four material roles.

## Finish and ownership

TableOak: existing ambientCG WoodFloor043 CC0 color, normal and roughness scans,
reduced to 512-square embedded maps. Source license: public/textures/surfaces/
table-wood/NOTES.md. The room retains the replaceable higher-resolution wood maps
and user overrides, applying them only to oak. Legacy/custom and fallback models
retain their all-wood treatment. Late texture arrivals are discarded after disposal.
TableGlazing, TableResilientSeats and TableBrassPins use original seeded 64-square
micro-roughness maps. Base color channels are at least 0.08 linear. Wood has normal
relief; real eased glass edges and calibrated roughness catch light.
Glass remains opaque standard PBR, as in the downloaded asset: no transmission,
refraction target, transparency sorting or extra reflection pass. The prop cache
continues owning geometry/materials; room disposal releases only its own finishes.

## Cost and verification

2,844 triangles, four runtime meshes/primitives/materials, 1,977,612 GLB bytes.
Six images: three 512-square and three 64-square, about 4.06 MiB RGBA8 including
mipmaps before renderer overhead. Original: 280 triangles, four primitives, no
embedded images; room already loaded three wood maps. Export metrics are recorded
in tools/models/coffee-table-metrics.json.

The verification harness tools/verify-coffee-table.mjs takes an outbox path and
before/after/fallback label. It creates the actual BackRoom inside StoreScene with
clean settings and fixed rental data. Before mode needs original-coffee-table.glb
in that outbox, extracted from the preceding revision. Captures include seated,
room, side, rear and underside views; fallback aborts the GLB request. Task outbox
contains inspected photographs, loaded bounds/materials, test and build logs.
