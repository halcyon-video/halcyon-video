# Mirrored mall-entry canopy — reference blocked (#256)

Status: reference investigation only, 2026-09-11. **Issue #256 is not complete.**
No canopy model, runtime asset, placement, or replacement reflection artwork
has been created. Dispatch authorizes the work, but the original and
supplementary references required by the issue have not been located.

## Evidence available

The [work order](https://github.com/halcyon-video/halcyon-video/issues/256)
describes a mirrored octagonal canopy, mirror seats, corner trim, support
columns, and guide rails. Its `mall-entry-canopy` label is an archive/study
lead, not a photograph. The issue comments supply no source image or URL.
The [shared contract](https://github.com/halcyon-video/halcyon-video/issues/151)
requires original-reference inspection and actual scene integration.


The checkout and nearby working copy have only the README in `public/user-assets`.
Local filename/text searches did not locate the named study. The read-only
archive repository's current recursive tree contains no matching canopy study
or source photographs; ignored/private archive material may exist elsewhere.
Web searches for the mirrored octagonal mall entrance did not
identify a usable match. These searches do not establish that no reference
exists; the archive location or original source URL is still needed.

## Established scene constraints

- Scene units are feet. Follow the [counter workflow](checkout-counter-model.md):
  Blender `(x, -store_z, height)` exports to Three.js `(x, height, store_z)`.
- `EntranceCheckout.build()` currently uses world centre X = 11 and front
  glazing Z = 15. Chamber depth is twice the configured door width, or zero
  for a storefront-door entrance. These are existing anchors, not measured
  canopy dimensions.
- The available entrance types are `vestibule` and `storefront-door`;
  exterior styles are `gabled-brick`, `flat-parapet`, and `arcaded-brick`.
  There is no existing mall style or canopy fallback to replace. A compatible
  placement/style gate needs to be established from the reference before
  adding this family; do not silently place it over every existing facade.
- Use `getVestibuleInfo()` and the shared opening calculations in
  `store-layout.ts` to assess door clearance. Preserve both side-door routes,
  the front entrance/exit, door motion, clerk navigation, counter terminals,
  return slot, and bag/checkout paths. Include column bases and rail ends in
  the footprint; canopy headroom alone does not demonstrate an open route.
- `glass-reflection.ts` uses the existing environment and material response,
  with day-gain metadata and a low-quality gate for additive glass panes.
  It adds no scene capture. Mirror backing and facet normals still need
  intentional modeling; transparent glazing alone is not an opaque mirror.
  Do not bake room imagery into canopy textures or add a full-scene mirror pass.
- Follow `entrance/counter-model.ts` for base-path loading, fallback retention,
  detached-load disposal, owned/shared resource handling, parent-removal
  cleanup, and render/shadow refresh. Existing entrance behavior remains the
  baseline until a compatible canopy installation is validated.

## Required evidence before authoring

Obtain and inspect the original `mall-entry-canopy` source plus supplementary
oblique, underside, and side/rear detail sufficient to resolve the support and
rail arrangement. Record source identity, orientation, provenance, and which
measurements are estimates. Width, depth, underside height, facet slope, seat
thickness, trim sections, support positions, rail height/spacing/termination,
and the canopy's relation to the glazing remain unknown. No numerical model
dimensions or period-fidelity claims can currently be justified.

After that inspection, establish a floor origin, dimensions, material roles
(mirror, backing/seat, corner trim, column, rail, base), attachment anchors,
and any moving parts. Keep physical parts editable and named, with intentional
topology and useful UVs. Place original generic source/export in the existing
`tools/models` and `public/models` pipeline; owner-reference derivatives belong
in the local user-assets collection per #151.

## Remaining delivery and verification

Deliver the `.blend`, reproducible authoring script, and optimized runtime mesh;
measure bounds, triangles, material primitives/draw calls, textures, and resource
cost. Integrate at the established consumer anchor, then inspect matching
before/after in-store views from both approach directions and side/rear/underside
details. Exercise load failure, removal during loading, rebuild/cleanup, quality
tiers, supported placement gates, and entrance/checkout navigation. Run
`npm test && npm run build` after implementation.

There are no model costs or after photographs to report yet. Checks on this
documentation-only investigation do not validate geometry or complete #256.
