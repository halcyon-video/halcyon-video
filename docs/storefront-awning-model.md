# Window awning model

The large store has fitted, rounded window canopies. Toggle them under
**Store Look → Building & Storefront → Window awnings**. The small shop keeps
its own exterior. The existing entry and window openings remain clear.

## Source and export

- Editable source: `tools/models/storefront-awning.blend`
- Reproducible Blender authoring: `tools/models/storefront-awning.py`
- Runtime export: `public/models/storefront-awning.glb`
- Geometry report: `tools/models/storefront-awning-metrics.json`

Rebuild with `blender -b --python tools/models/storefront-awning.py`.
The source contains named vertex groups for the fitted panels, rails, seams,
and brackets. The export joins parts by finish into four meshes: 3,300
triangles and approximately 188 KiB. Every solid part is checked for manifold
edges before export.

## Placement contract

Scene units are feet. Blender coordinates `(x, -depth, height)` export to
Three.js `(x, height, depth)`.

| Dimension | Feet |
| --- | ---: |
| Nominal run | 30 |
| Height, hem to crown | 3.30 |
| Top of wall flashing | 3.59 |
| Projection from mounting plane | 3.25 |
| Hem above window head | 0.25 |
| Mounting plane beyond front glass | 0.80 |

Only the run scales to fit the building. The two canopies end beside the
entrance piers and project within the sidewalk. They are exterior dressing;
door animation and navigation footprints stay with the entrance module.

The canopy has a shallow rolled crown, vertical fabric face, fitted end
panels, translucent soffit, bound seams, continuous rails, and internal
braces. There are no baked signs, wall textures, or lighting in the model.

## Finishes and lifecycle

`src/storefront-awning.ts` supplies four named finishes and paints the
lettering through the normal brand renderer. The canopy follows the active
palette; lettering follows the active name, color, and bundled typeface.
Live brand edits reuse the canvas texture and preserve the lettering's aspect
ratio. Empty brand text leaves the canopy blank.

The fabric, lettering, and soffit have restrained emission after dark. Their
levels change with the outside lighting mode, with no per-frame update loop.
The model loader uses a plain shaded fallback when the export is unavailable.
Scene teardown cancels pending installation and releases loaded meshes and
the lettering texture.

Architectural reference photographs and comparison material remain in the
private reference library; none are bundled with this model.


The #254 construction update adds a folded wall counterflashing with upstand
and kick-out, nine bracket mounting shoes, eight separate underside access
pans and returned end closure channels. These retain the existing rounded
fabric profile and its lettering plane. All parts are closed solids with UVs;
part names survive as vertex groups in the four finish batches. Authoring uses
Blender 5.2 with feet displayed (`scale_length = .3048`); GLB coordinates remain
numeric scene feet. These are original generic construction details with
estimated sheet thicknesses, using no external model or branded artwork.

Export cost is 192,656 bytes (previously 174,536), 3,300 triangles per wing
(previously 3,032), four material draws and zero embedded textures. Bounds in
Three.js feet are `[-15.02, .005, -.05]` to `[15.02, 3.59, 3.278]`.
The existing loader scales the run to each wing; height/depth remain fixed.
The shared 2048×512 dynamic lettering canvas is retained (4 MiB RGBA base
level; about 5.33 MiB with mipmaps), with no new texture allocations.
In-store checks and photography are described in the
[architecture delivery notes](storefront-architecture.md#tower-construction-update-254).
