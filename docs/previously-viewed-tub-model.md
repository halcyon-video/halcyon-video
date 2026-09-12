# Clear previously-viewed countertop tub (#185)

An original compact acrylic display, integrated with the 1993 shield counter's
existing dressing. It is a separate consumer from the floor PreviouslyViewedBin.

## Reference and provenance

Read the #151 delivery contract. Inspected
recovered original Part II frames `rUhRHo44CIA/f0063.jpg` (00:18:26:14) and
`rUhRHo44CIA-f0079.jpg` (00:18:58:13), from the local candy/counter-structure
reference directories. The former shows transparent merchandise displays in
checkout context; the latter is a clerk-side equipment view. Neither provides
measurable dimensions or a clear view of this small tub's hidden construction.
The text recollection does not describe a tub.

This is **an original generic design, not a measured period replica**. Its compact
size, bend radius, joints, feet and fictional $4.99 price are authoring choices.
No archive pixels, copied artwork, third-party mesh or branded derivative is
included in the public source or export. Movie sleeves use the application's
existing shared case system and the current library.

## Construction and asset contract

- Source: `tools/models/previously-viewed-tub.blend`.
- Reproducible scripted mesh authoring: `tools/models/previously-viewed-tub.py`.
  Run `blender -b -t 2 -P "$PWD/tools/models/previously-viewed-tub.py"` from the
  project root. An absolute path also works with the ThinkPad's Flatpak wrapper.
- Runtime: `public/models/previously-viewed-tub.glb`.
- Units are feet. Blender `(x, y, z)` exports as runtime `(x, z, -y)`.
  Origin is the underside of the four feet; +Z faces the clerk, -Z the customer.
- Hardware bounds: X ±0.54, Y 0–0.42, Z -0.415–0.39 ft; approximately
  12.96 × 9.66 × 5.04 inches (width/depth/height). Stock reaches Y .707 ft.
- Front, base and rear are one closed, bent sheet with .01 ft (~3 mm)
  thickness and .04 ft internal bend radius. End panels fit against the open
  ends with solvent-bonded butt joints. A folded front pocket encloses a
  removable card; four eased silicone feet contact the worktop.
- Nine named editable parts, closed manifold solids, eased edges, named roles,
  UV islands, consistent normals and non-destructive runtime triangulation.
  Source audit is in `tools/models/previously-viewed-tub-metrics.json`.
- Roles: `Tub_ClearAcrylic`, `Tub_SiliconeFeet`, `Tub_PriceCard`. Roughness
  multipliers .13/.78/.82, modulated by a .84–1 texture. Fine normal grain is
  embedded; acrylic uses a lower normal strength (.18). All albedo factors
  exceed .08. Two original 128² PNGs are packed into both source and GLB.
- Acrylic uses the store's alpha/clearcoat approach, opacity .16, IOR 1.49,
  clearcoat .4, no transmission render target. Runtime disables depth writing
  and opaque shadows on clear parts. Card print remains a replaceable runtime
  512 × 192 canvas, projected onto the actual card face.
- 2,156 hardware triangles, nine draw primitives, three material roles,
  220,960 GLB bytes. Two embedded images have six glTF texture bindings;
  loaded texture count includes the additional price canvas. Stock adds two
  instanced batches (four copies each), 96 rendered box triangles and twelve
  material draws, reusing shared case geometry/materials. Eight tapes fit in
  two columns and four rows without rescaling the VHS sleeves.

## Integration and lifetime

`period-fixtures.ts` exports the dedicated builder; `counter-props-93.ts` calls
it within the existing counter-dressing lifecycle. `counter-anchors.ts` owns the
placement, using `Entrance.getCounterTopAnchorAt(-2.65)` for actual top height
and orientation. The adjacent left terminal is at -4 and VFD at -1.5; the bag
is farther down-counter at -5.4. No terminal, bag, return, navigation or browsing
anchor is moved. This static display follows the floor bin's decorative stock
behavior; it does not introduce a new purchase interaction.

Only bb-1993, VHS and shield-counter dressing qualify. Desk, U-square, other
eras and DVD layouts retain their current scene. Empty or small catalogs are
handled without invented library entries. With no catalog the hardware/card
remain visible; each available title contributes four copies, up to eight.

The previous empty countertop is the loading/failure fallback. Loading uses
`assetUrl`; success refreshes shadows and rendering. Removal cancels adoption
of late results and releases all owned GLB geometry/materials/textures and card
art. Shared stock is detached before the signage disposal traversal, disposing
only its instance buffers. Shelf-owned geometry/materials/textures survive.

## Verification

`tools/verify-previously-viewed-tub.mjs` boots the actual StoreScene with explicit
public-only 1993/corporate/day settings. It captures matching before/after
context plus front, side, rear, interior and foot details, records live resource
cost and neighboring equipment bounds, and exercises successful cleanup, shared
case survival, late completion, missing export and alternate counter gates.
The photographs and results are copied to the #185 outbox. Software-rendered
photographs are appearance/placement evidence, not hardware FPS evidence.

`tests/previously-viewed-tub.test.ts` verifies exported normals/UVs, required
construction parts, mesh budget and mapped material roles, including the absence
of a transmission extension. Run the required `npm test && npm run build`.

Measured installed anchor: `(8.35, 2.82, -0.46788784)`, yaw `0.66974348`.
Visible-triangle checks in the tub's local frame clear both loaded terminal
stations, the VFD and return chute; the bag bounds also clear the assembly.
Downward rays from all four feet meet the loaded counter within 6.7e-8 ft.
Teardown releases all 15 unique owned resources (9 geometries, 3 materials,
3 texture objects), with zero shared case geometry/material disposals. The
export's repeated texture bindings are deduplicated by the loader. Dedicated
mipmapped RGBA texture storage is approximately 683 KiB, excluding existing
shared case art. Final project checks: 741 tests passed and build exit 0.
