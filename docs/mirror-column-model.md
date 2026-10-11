# Mirrored structural column frame (#229)

The optional four-sided mirror pillar (`fixtures/mirror-column.ts`, kind
`mirror-column`) now wears a modelled frame. The mirror faces themselves are
unchanged: live `Reflector`s when the machine allows them, otherwise the painted
wall / env-mapped chrome fallback. No new reflection pass is added.

## Source and provenance

`tools/models/mirror-column.py` authors the mesh with bmesh/bpy (scripted mesh
authoring); run `blender -b -t 2 -P tools/models/mirror-column.py`. It writes
`tools/models/mirror-column.blend`, `public/models/mirror-column.glb` and
`public/models/mirror-column.geometry.json` with the standard Blender glTF
exporter. Original generic structural cladding, not a measured replica; no
reference pixels, brand marks or signage. Dimensions are LOW historical confidence.

## Construction (feet)

- **Column base** (0.55 high): recessed toe, stepped ledge, face, ogee, and the
  seat ledge the core and panels stand on; slim bottom seat rails.
- **Column core** (2.0 x 2.0): backing that shows in the hairline seams.
- **Column corner posts**: four L-section angles, 0.022 proud, chamfered arris,
  covering 0.07 of each panel edge. These are the narrow corner joints.
- **Column cap** (0.45 high): stepped crown with a soffit overhang and slim top
  seat rails hanging below its origin.

All solids are closed/manifold, chamfered ring lofts, flat-shaded hard
mouldings, UV set `TrimUV`. Overall width 2.12 ft, same as the old plinth.

## Scale, axes, anchors

Blender +Z up maps to glTF/store +Y; origin is the floor point under the column
axis. Parts keep their origin at their own bottom. The GLB is authored for a
13.5 ft ceiling (nominal panel height 12.5): at runtime the cap is moved to
`ceilingY - 0.45` and the core and posts (straight prisms) are Y-scaled to the
real panel height. Empties: `floor_origin`, `ceiling_contact`, `panel_seat_bottom`.

## Material roles

`ColumnTrim` (base, cap; theme trim-dark), `ColumnCore` and `ColumnCorner`
(core, posts, rails; trim scaled 1.35). No textures embedded.

## Placement and behaviour

Unchanged: `store-fixtures-config.ts` placement `mirror-column-back`, floor-display
admission, footprint, collider. The primitive stack stays as the loading/failure
fallback and registered collision shape, and is hidden when the GLB arrives
(`installDisplayModel`); teardown releases the model before fixture-owned
materials and geometry. See geometry.json for triangle and draw-call cost
(4 meshes, 6 draw calls, about 470 triangles, 36 KB).
