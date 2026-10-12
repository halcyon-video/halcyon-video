# Now-showing poster lightbox — #242

Original generic hanging double-sided poster lightbox; scripted Blender mesh
authoring (Blender 5.x). No third-party geometry, textures or marks. Period
study leads (gold-bulb-frame-1993, 1993 now-showing lightbox) are local archive
references, not shipped assets; proportions are scene-fit estimates.

Source: `tools/models/now-showing-lightbox.blend`; reproducible authoring:
`blender -b -P tools/models/now-showing-lightbox.py`. Runtime:
`public/models/now-showing-lightbox.glb` (487 KB, 10,848 triangles, 16 named
parts, 9 material roles). Fixture: `src/fixtures/now-showing-lightbox.ts`, kind
`now-showing-lightbox`, placed in `src/store-fixtures-config.ts`.

## Contract (feet, glTF Y-up, +Z = front face)

- Origin: centre of the poster window. Poster window 1.8 x 2.7 ft; runtime
  planes sit at z = +-0.17 (front, and back rotated 180 deg). Both faces show the
  first library title that has artwork (latest_movie_poster fallback).
- Frame outer 2.44 x 3.34 ft; lightbox depth 0.38 ft; frame bottom edge at 6.9 ft
  (origin y 8.57), clear of eye line, nothing beneath it (open air gap).
- Rods `Rod_L`/`Rod_R`: unit length, origin at base (top of frame, x = +-1.0);
  the fixture stretches `scale.y` to the ceiling and moves `Canopy_L/R` to it.
  Header plaque (`PlaqueBody`, `PlaqueFace`) hangs on straps from collars on the
  rods (`PlaqueHardware`). Fixture builds nothing if fewer than 1.2 ft of rod fit.
- Material roles: GoldFrame, LightboxShell, BulbGlass (emissive), NickelNeck,
  PorcelainSocket, TubeLight (emissive), RodSteel, PlaqueTrim, PlaqueFace
  (replaced at runtime by a theme-coloured NOW SHOWING canvas; UVs 0..1,
  readable from both sides). 60 six-sided bulbs ring the frame (30 per face) on
  real sockets; interior holds two lit tubes. Closed parts are manifold-asserted.
- Placement: x = store centreline, z = -9, yaw 0, themes bb-1993/2000/2010 via
  `options.themes`. Hanging: no floor footprint, no collider, no interaction.
  It is separate from the window-poster marquee rows (not duplicated).
- Lifecycle: built-in box/rod fallback shows until the GLB loads (shared
  installDisplayModel, which also owns cancel/teardown); the fixture disposes
  its poster/plaque resources and removes itself on `removed`.
