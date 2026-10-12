# Equipment cabling and conduit fittings (#260)

Original generic hardware, scripted Blender mesh authoring (bmesh/bpy construction: lathed glands and nuts,
swept cord and conduit, formed straps, a slotted receptacle face, pressed boxes). No reference photo, texture
or third-party mesh. Feet, store axes; Blender sees `(x, -z, y)`.

- Source: `tools/models/equipment-cabling.py` writes `tools/models/equipment-cabling.blend`,
  `public/models/equipment-cabling.glb` and `tools/models/equipment-cabling-metrics.json`.
  Run `blender -b -t 2 -P $PWD/tools/models/equipment-cabling.py`. Every solid passes a manifold-edge assertion and carries UVs.
- Origin of `TvCeilingFeed`: the ceiling mounting plate centre on the tile datum (y = 0); parts hang at y < 0.
- Named groups: `JunctionBoxDuplex` (pressed 4 in box, ivory cover, duplex face with blade slots and contacts),
  `PowerPlugRightAngle` (NEMA 5-15 style blades, moulded body, strain-relief boot), `TvLeadCord` (0.012 ft radius
  jacket, 5 control-point Catmull-Rom sweep), `CordGripConnector` (hex nut + domed gland), `CordClips`
  (two stand-off one-hole clips), `ExposedRise` (set-screw connector, straight run, coupling, 0.30 ft radius
  90 degree bend, vertical stub, coupling, roof flange, strap), plus `Anchor_PlateEdge` and `Anchor_ServiceBox` empties.
- Material roles (theme-independent, replaceable): `ConduitGalvanized`, `BoxCoverIvory`, `CordJacket`, `PlugBody`, `BrassContact`.
- Cost: 9 meshes, about 3.6k triangles, about 157 KB, five materials; the GLB loads once per TV mount.

## What it terminates at

Every run ends at a device or service point. The lead starts at a plug seated in the duplex outlet of a surface ceiling box
(the service point) and ends in a cord grip bolted to the TV mounting plate's edge (the device); no cord end is free. Two stand-off
clips pin it to the ceiling, the cord sweep is kept above roughly three jacket diameters of bend radius. The mount's own lead from
the plate to the set (`tv-suspension`) is unchanged. Where the exposed-roof ceiling is active the box is fed by EMT that leaves its
side, bends 0.30 ft (more than ten conduit radii) and enters the roof underside through a flange. With a tiled ceiling the box is
fed from the void above and the `ExposedRise` group is hidden. This is a functionally justified generic feed, not a surveyed
historic installation: nothing here claims a period photograph.

## Integration

`src/ambient-tv-feed.ts` loads the GLB for each ceiling TV from `installTvMount` once the mount is placed, positions it at the
plate, rotates it 180 degrees about Y so the box lands on the plain tile beside the plate rather than over a troffer, enables
shadows and requests a render. There is no per-frame work and no cable simulation. A failed or late load leaves the existing mount
untouched (warning only); a load after teardown is released immediately; otherwise the parsed scene is parented to the ceiling group and
released with it. `ceiling.userData.tvFeed` records the plate and exposed state. Test: `tests/equipment-cabling-model.test.ts`.

## Photographs

`scratch/publicity-kits/cabling-260/` holds before/after in-store views (under, box, side, rear) on the standard tiled ceiling and the
exposed-roof ceiling (`exposed-*`), shot with `node tools/shot.mjs --quality high --settle 1 --fly 1` on the ThinkPad GPU from a
Chromium desktop viewport (not physical-device frame-rate evidence).

Not done here: the storefront facade and counter props keep their existing local cord details; the same kit's plug, grip, clip and
conduit parts are the starting point for those anchors.
