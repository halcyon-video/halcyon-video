# Later arched letterboard tower — reference investigation (#255)

Status: reference blocked, 2026-09-11. **Issue #255 is not complete.**
No new Blender source, runtime model, or facade variant is delivered by this
investigation. The original `marquee-letterboard-tower` study or source
photograph is needed to establish the commissioned assembly and its date.

## Evidence and provenance

The [work order](https://github.com/halcyon-video/halcyon-video/issues/255)
specifies a bowed letterboard, arched metal awning, crest, corrugated wings,
and supporting trim. It explicitly identifies its reference label as a local
archive/study lead, not an available photograph. The
[delivery contract](https://github.com/halcyon-video/halcyon-video/issues/151)
requires original-reference inspection and labeled dimensional uncertainty.

The issue comments contain no reference image or source URL. Searches of the
checkout, nearby project/input copies, and local filenames did not locate the
identified study. The archive repository
`halcyon-video/media-server-video-store` master recursive tree returned 429
entries with `truncated: false`; no matching study or source photographs were
listed. Web searches for the arched/bowed letterboard and
corrugated entrance did not identify a usable match. These results do not
establish that private or historical archive material is absent elsewhere.

An original reference location has been requested. Obtain the original plus
oblique, side/rear and underside details before claiming period fidelity.
Resolve the board bow and return depth, awning radius/rise and projection,
crest silhouette, wing pitch and termination, support arrangement, and date.
Any measurements inferred from photographs must remain labeled estimates.

## Existing attachment contract with #254

The checkout already contains `tools/models/storefront-entrances.py`, its
editable `.blend`, and the three runtime entrance variants. Dependency
[#254](https://github.com/halcyon-video/halcyon-video/issues/254) has a reopened
status comment; existing files establish the technical baseline, not evidence
that its entire acceptance checklist is complete.

- Scene units are feet. Blender `(x, -store_z, height)` exports to Three.js
  `(x, height, store_z)`. `buildFacadeEntryModel` anchors its group at
  `STORE_CENTER_X = 11`, floor Y = 0, `FRONT_GLASS_Z = 15`.
- `storefront-architecture.ts` owns facade dimensions and glazing rules;
  `entranceOpeningHalfWidth` in `store-layout.ts` consumes those shared rules.
  The current header bottom is 9.15 ft, front projection 6.2 ft, and pier
  depth span 4.75–6.48 ft relative to the glass. These are existing scene
  constraints, not measurements of the missing reference.
- Current styles are `gabled-brick`, `flat-parapet`, and `arcaded-brick`.
  The arcaded style has an arched masonry opening; it is not the requested
  bowed-board assembly. A dated variant must explicitly participate in style
  resolution/settings, opening fit, facade mass exclusions and logo bounds.
- Existing model preparation fits authored opening/mass widths and lifts
  geometry above the entrance for taller ceilings. It also overwrites UVs
  with masonry projection. A new board's artwork UVs must be preserved
  separately; applying masonry UV mapping to every new mesh would be wrong.
- Reuse `FacadeBrick`, `FacadeSoldierBrick`, `FacadeTile`, `FacadeTrim`,
  `FacadeCoping`, `FacadeSoffit`, and `FacadeCanopy` where applicable. Give
  letter field, crest ornament/ink and wing metal distinct named parts and
  material roles. Keep live text and brand artwork independently replaceable.
- `installDisplayModel` retains the procedural fallback until load success,
  rejects detached results, refreshes shadows/rendering, and returns a
  disposer. `buildFacadeEntryModel` owns finish disposal and brand listeners.
  Preserve this lifecycle and the entrance-owned doors/collisions.

## Remaining implementation and acceptance

After reference inspection, establish dimensions and the dated placement gate,
then author actual curved board depth, folded awning edges/soffit, corrugations,
crest and support trim with clean topology and useful UVs. Deliver reproducible
source and optimized export through the existing model pipeline. Owner-reference
derivatives and branded artwork belong in local user-assets per #151.

Integrate at the existing entrance anchor and verify opening clearance across
supported sizes, door operation, replaceable text/art, theme changes, load
failure, removal during loading, teardown and rebuild. Inspect matching
before/after in-store views and side/rear/underside details. Record measured
bounds, triangles, material primitives/draw calls, textures and bytes, and run
`npm test && npm run build` after implementation. There are no new model costs
or after photographs yet; baseline checks do not validate an unbuilt model.
