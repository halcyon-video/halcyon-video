# Wall-mounted changeable-strip information board family (#287)

Original reproducible Blender models and Three.js runtime fixture integration
for the wall-mounted changeable-strip information board family, extending #151.
These fixtures model the commercial changeable-slat / track-rail bulletin and
terms boards historically mounted in retail video stores.

## Formats and specifications

The family provides two distinct formats and one modular rail unit:

1. **Tall format (`public/models/wall-track-board-tall.glb`)**:
   - Silver-framed (`TrackFrameSilver`) board positioned on the vestibule/register back wall behind the checkout counter.
   - Narrow proportion: ~2.25 ft wide × 3.80 ft high with 14 horizontal insert channels and separable insert strips (`TrackStripFace`).
   - Accompanied by a co-planar companion framed poster (`PosterFrame`, `PosterFace`) beside it, sharing the unified architectural presentation attested in reference footage.
   - Total assembly bounds: ~4.60 ft wide × 3.80 ft high × 0.08 ft deep.
   - Draw calls and geometry: 1,028 triangles, 7 material primitives, 88,172 bytes.

2. **Long format (`public/models/wall-track-board-long.glb`)**:
   - Shallow horizontal dark-framed (`TrackFrameDark`) rental terms board mounted above the front glass facing incoming shoppers.
   - Parameterized width: 11.5 ft nominal span, 8 visible rows of changeable terms strips.
   - Configurable illumination: includes an architectural light hood (`TrackHood`) and downward diffuser lens (`TrackEmissive`). Toggled via `illuminated` option (defaults to non-illuminated daytime finish, active emissive wash when enabled).
   - Total assembly bounds: ~11.50 ft wide × 1.50 ft high × 0.10 ft deep.
   - Draw calls and geometry: 732 triangles, 7 material primitives, 69,164 bytes.

3. **Modular rail unit (`public/models/wall-track-rail.glb`)**:
   - 1-foot modular section of the extruded channel profile.
   - Features extruded top and bottom retaining lips (0.015 ft protrusion, 0.012 ft forward depth), recessed channel bed, reveal gap between tiers, and separable strip face (`TrackStripFace`).
   - Draw calls and geometry: 56 triangles, 2 material primitives, 5,688 bytes.

## Coordinate contract and construction

- **Scene units**: Imperial feet.
- **Coordinate origin**: Center-rear of the mounting plane at the bottom base of the frame (`x = 0`, `y = 0`, `z = 0`). Local `+Y` is upward along the wall face, `+Z` points outward into the store interior perpendicular to the wall, and `-Z` points into the wall substrate.
- **Wall anchor and mounting clearance**: Rear cleat bars (`BoardHardware`) offset the frame backboard ~0.015 ft (3/16 in) off the wall surface to represent plausible retail cleat/z-clip mounting.
- **Rail and channel profile**: Extruded horizontal channel rails (`TrackRail`) with top and bottom retention returns creating a genuine 3D recess for insert strips. The strips sit flush in the track bed behind the retaining lips, with clean non-overlapping coplanar separation.
- **Geometry quality**: Manifold, closed manifold profiles where appropriate, clean UV mappings across all meshes, and consistent outward-facing vertex normals.

## Material roles

| Material Name | Role and Visual Target | Format |
| :--- | :--- | :--- |
| `TrackFrameSilver` | Natural anodized brushed aluminum frame extrusions | Tall |
| `TrackFrameDark` | Dark bronze / black anodized aluminum frame extrusions | Long |
| `TrackBacking` | Matte interior substrate / backing sheet behind rails | Tall, Long |
| `TrackRail` | Extruded aluminum retention track rails with top/bottom lips | Tall, Long, Rail |
| `TrackStripFace` | Changeable acrylic/vinyl text slat inserts with real reveal | Tall, Long, Rail |
| `PosterFrame` | Silver extruded companion poster frame molding | Tall |
| `PosterFace` | Co-planar framed promotional poster face | Tall |
| `TrackHood` | Dark architectural light hood / valance along top edge | Long |
| `TrackEmissive` | Translucent downward fluorescent diffuser strip | Long |
| `BoardHardware` | Concealed z-cleats, standoff bumpers, and fasteners | Tall, Long |

## Runtime integration and lifecycle

- **Fixture Kind**: Registered in `src/fixture-registry.ts` under `'wall-track-board'`.
- **Placements**: Declared in `src/store-fixtures-config.ts`:
  - `wall-track-board-registers`: positioned at `(8.8, 8.48)`, yaw `PI` (facing registers), tall format with companion poster.
  - `wall-track-board-terms`: positioned at `(11.0, 0.35)`, surface Y `7.65`, yaw `0` (facing into store from above glazing), long format with 11.5 ft width and 8 rows.
- **Era Gating**: Gated to `['bb-1993', 'bb-2000', 'bb-2010']`. Does not displace the 1990 counter Coming Soon board (`coming-soon-letterboard-counter-end`, gated strictly to `['bb-1990']`).
- **Footprint**: Returns `null` for `getFootprint()`, ensuring zero floor collision interference in `src/layout-validator.ts`.
- **Fallback & Loading**: Built immediately with an instantaneous procedural fallback matching the dimensions, frame finishes, and procedural canvas lettering, then swapped cleanly when the GLB loads.
- **Disposal**: Thorough resource cleanup disposing geometries, canvas textures, and materials, with render refresh requests wired.
- **User-Assets**: Probes git-ignored drop-in paths:
  - `fixtures/wall-track-board-tall/front.png`
  - `fixtures/strip-board-1998/front.png`
  - `fixtures/wall-track-board-long/front.png`
  - `fixtures/rental-terms-track-board-2000/front.png`

## Provenance and archival reference

- Archival footage citations:
  - Video uOEIl5XaptY: f0080 (~158s), f0098 (~194s), f0434 (~866s)
  - Video cQ4iAvnzaaw: f0109 (~216s), f0418 (~834s), f0421 (~840s), f0426 (~850s)
- Archival analysis established:
  - Narrow tall silver track board with companion framed poster mounted behind checkout registers on the glazed vestibule partition.
  - Shallow horizontal dark-framed terms board mounted high above the front glass, spanning across the entry/exit bays.
- All 3D geometry and scripts are original clean-room implementations authored specifically for Halcyon Video. No copyrighted trademarks, scanned meshes, or proprietary assets are committed.

## Deliverables

- Generator script: `tools/models/wall-track-board.py`
- Editable source: `tools/models/wall-track-board.blend`
- Runtime models:
  - `public/models/wall-track-board-tall.glb`
  - `public/models/wall-track-board-long.glb`
  - `public/models/wall-track-rail.glb`
- Budget metrics: `tools/models/wall-track-board-metrics.json`
- Fixture implementation: `src/fixtures/wall-track-board.ts`
- Verification suite: `tests/wall-track-board.test.ts`
