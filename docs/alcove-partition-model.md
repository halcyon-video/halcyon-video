# Alcove doorway and partition trim (#231)

Original generic millwork, authored with scripted Blender mesh construction. Dimensions
come from the existing fixture (3 ft opening, 6.8 ft head, 0.34 ft partitions), not from a
measured commercial product or historical replica. No downloaded meshes, photographs,
branded artwork or private user assets. Project license applies.

Editable source `tools/models/alcove-partition.blend`; reproduce with
`blender -b -t 2 -P /absolute/path/to/tools/models/alcove-partition.py`.
Runtime pack `public/models/alcove-partition.glb`; per-part costs in
`docs/alcove-partition-cost.json`.

## Parts (feet; Blender `(x, -store_z, height)` -> glTF `(x, height, store_z)`)

Origin is the doorway centre on the floor; the sales-floor wall face is -X, the room
face +X. The runtime yaws the door parts half a turn for the left-corner variant.

| Part | Role | Notes |
| --- | --- | --- |
| `AlcoveDoorSurround` | `AlcoveTrimTimber` | Both faces: stepped backband + bead jamb casings on plinth blocks; head casing (0.10 ft on the sales face, under the sign board; 0.32 ft with drip cap in the room). |
| `AlcoveHeaderCap` | `AlcoveTrimTimber` | Cove cap above the sales-face sign board (dropped under ceilings below 8 ft). |
| `AlcoveJambLining` | `AlcoveTrimTimber` | Finished returns lining the two pier ends inside the opening, mortised for the curtain rail ends. |
| `AlcoveRailBracket`, `AlcoveBracketScrew` | `AlcoveBracketBrass` | Brass frames cupping each end of the existing curtain rail, four screw heads each. |
| `AlcoveSkirting`, `AlcoveCrown` | `AlcoveTrimTimber` | 1 ft unit mouldings, wall face at x=0 projecting +X, stretched along their length only at runtime. |

Closed parts are checked manifold, normals recomputed, UVs smart-projected; no textures.
`AlcoveTrimTimber` is replaced at runtime by the fixture's own finish (the format's
end-panel timber), so theme/format finishes stay replaceable.

## Integration

`src/fixtures/alcove-partition-model.ts` installs the pack through `installDisplayModel`
(base-path resolver, fallback, late-load and teardown handling). The trim is additive:
the procedural partition boxes remain the colliders, footprints and loading/error
fallback, so a missing GLB leaves the plain walls. The curtain asset still owns rail,
eyes, cords and beads and is untouched; the brackets cup its rail ends.

Fixture changes: the front partition runs half a wall thickness past the return
leg's centre line, closing the open sales-floor corner pocket (footprint grows by
0.17 ft at that corner only; the doorway, header and navigation clearances are
unchanged); the age placard moves 0.245 ft further along the pier to clear the casing.
Runs: skirting stops at the plinth blocks; crown runs are skipped under ceilings below
8.3 ft.

The alcove builds only in the mom-and-pop format with Above-R stock and
`bb_above_r_room=1`, as before. The in-store before/after photos were taken with the
project shot harness (`--set bb_store_format=mom-and-pop --set bb_above_r_room=1`, with
the harness catalog's R titles temporarily counted as Above-R so the room exists).
