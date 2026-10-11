# Floor-standing tape-cleaner sidekick (#199)

Original generic fixture, scripted Blender mesh authoring in
`tools/models/tape-cleaner-sidekick.py` (Blender 5.1). Editable source:
`tools/models/tape-cleaner-sidekick.blend` (28 named parts). Runtime:
`public/models/tape-cleaner-sidekick.glb`. Cost and bounds:
`tools/models/tape-cleaner-sidekick-metrics.json`. No third-party geometry or artwork.

Regenerate: `blender -b -t 2 -P "$PWD/tools/models/tape-cleaner-sidekick.py"`.

## Contract
Feet; origin at floor centre, +Z toward the customer. Envelope 2.06 × 5.2 × 1.0
(`RETAIL_FIXTURE_SPECS['tape-cleaner-sidekick']` is 2.1 × 5.2 × 1.0, clearance 1.5).
Blender authors `(x, -store_z, store_y)`; Y-up export.

Parts: chamfered plinth with toe recess; slatwall panel with real 3 in-pitch
groove profile; two rounded posts with collars; four clear carton trays (floor,
front lip, end walls, slat clip); header board.
Material roles: `SidekickBase`, `SidekickSlat`, `SidekickPost`, `SidekickAcrylic`
(blended), `SidekickHeader` (replaced at runtime with the active brand primary).

## Stock
Cartons are not modelled here. `src/fixtures/tape-cleaner-sidekick.ts` instances
the shared #181 carton (`installCleanerCartons`) on 4 tiers × 4 columns:
tray tops y = 0.9/1.8/2.7/3.6, x = ±0.21/±0.63, z = -0.27, centre y = tray + 0.3335.
The same brand face texture as the countertop display is used.

## Integration
Registered as `tape-cleaner-sidekick`; reserved placement in
`DEFAULT_FIXTURE_PLACEMENTS` (left front wall, yaw π/2). Box fallback, collision
proxy, footprint and teardown follow the candy gondola pattern. A plain red gift
tag appears on the header in December only (`inSeason('holiday')`, the same gate
as the collection endcap kit). Placement and era gating are first guesses — no
sidekick reference photo was inspected, so period fidelity is unclaimed.
