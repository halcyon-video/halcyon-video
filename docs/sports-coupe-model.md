# Parked sports coupe (#268)

`public/models/car_sports.glb` now contains an original, unbranded late-1980s
fastback. `tools/models/sports-coupe.blend` preserves individually named editable
parts and edge modifiers; `tools/models/sports-coupe.py` reproducibly authors and
exports the mesh. The runtime export joins parts by material after saving the
editable source. There are no downloaded meshes or embedded images.

## Reference and confidence

Inspected Nissan's [Heritage Collection No. 323, 1990 180SX Type II](https://www.nissan-global.com/EN/HERITAGE_COLLECTION/nissan_180SX_TYPE_II.html)
and its original high-resolution front/side photograph on 2026-09-10. Nissan
lists 4,540 × 1,690 × 1,290 mm and a 2,475 mm wheelbase, and dates the related
North American 240SX to model year 1989. The photograph supports the long hood,
closed pop-up headlamp lids, fastback glass, thin seals, small mirrors and modest
wheel diameter. Those are study cues, not a claim of an exact Nissan replica.
The rear light arrangement, plate recess, wheel spokes, seats and underside are
original simplified design choices; their exact construction is not established
by that front/side photograph. No Nissan marks or reference imagery ship.

The selected verification stores use the 1990 and 2000 corporate settings. A
1989-era coupe is compatible with those periods. No new era gate is introduced:
the existing shared parking-row asset is retained across settings. An earlier
store setting is not being certified as historically accurate by this model.
The old downloaded coupe was also inspected in the actual lot from both sides,
front, rear, ground level and through the storefront before replacement.

## Construction and coordinate contract

The script uses metre-based design dimensions converted into feet before saving.
The Blender scene uses Imperial units with `scale_length = 0.3048`; glTF numeric
coordinates are feet, as expected by this application's asset pipeline.
Blender -Y is the nose and +Z is up; runtime +Z is the nose and +Y is up. The
origin is on the ground at the nominal wheelbase center. Tires have a 0.305 m
radius and contact the zero plane. Wheel centers are ±1.2375 m longitudinally.
The shell is nominally 1.69 m wide; mirrors and bumpers extend its measured
bounds. The complete exported envelope and normalized bounds are recorded below.

A welded profiled body forms genuine arch openings and underside returns.
Separate rolled arch lips follow the cutouts. Annular window reveals have depth
and inset single-sheet glazing, leaving room for the lightweight cabin silhouette.
Named door shutlines, sill trim, handles, mirrors, closed lamp lids, running lamps,
rear lenses, plate recess and exhaust complete the other elevations. The interior
has a dashboard, two front seats/head restraints, rear bench, console and steering
wheel. It is a distant parked prop: doors, lamps and wheels have no animation,
interaction targets, collision shapes or navigation changes.

Closed authored solids are checked for manifold edges and nonzero face area.
Glass panes are intentionally open single sheets. Each part receives packed
Smart UV islands; curved tire geometry uses smooth normals and manufactured
panels have restrained edge bevels. These are editable UVs for future finishes,
not a claim of a single shared texture atlas. All runtime material roles remain
named: `CoupePaint`, `CoupeTrim`, `CoupeGlass`, `CoupeRubber`, `CoupeAlloy`,
`CoupeLamp`, `CoupeAmber`, `CoupeTail`, and `CoupeInterior`. Only glass blends;
all other materials are opaque. There are no emissive headlights or new lights.

## Integration and reproduction

The existing `assetUrl('models/car_sports.glb')` slot in
`src/exterior-environment.ts` still occupies stall index 2 of five. Its loader
normalizes the longer horizontal axis to exactly 9 scene units, centers it in
the same stall, seats its minimum Y at zero, and retains the 0.015-radian stall
yaw and street-facing nose. The contact-shadow decal and shared exterior
`envMapIntensity` clamp remain in effect. Later environment rebakes continue to
retarget the material finishes through the existing exterior traversal.

Rebuild with an absolute script path if using the ThinkPad's container wrapper:

```sh
blender -b -t 2 --python "$PWD/tools/models/sports-coupe.py"
node tools/verify-sports-coupe.mjs /tmp/sports-coupe-check after
npm test && npm run build
```

The verification harness follows the existing StoreScene screenshot workflow,
pins the panorama and daylight settings, and photographs the actual installed
lot. After boot it pauses the animation loop and draws the existing StoreScene
with its renderer and camera at 1200 × 800, so adaptive low-resolution frames
cannot overwrite the inspection images. These native-resolution inspection
frames omit the composer postprocessing; they are not separate studio scenes.
Use label `fallback` to abort the coupe request and exercise the existing box.
Use label `before` to intercept only the coupe request with its original GLB
from baseline commit `e3e06fc`; the camera and other store assets stay identical.
Use label `lifecycle` for the fast isolated loader/teardown checks, or pass
`bb-1990` as the fourth argument to inspect that store setting. Evidence is retained in the task outbox, not distributed reference assets.

## Resource cost and lifecycle

| Cost | Previous coupe | Authored coupe | Five-car lot, before → after |
|---|---:|---:|---:|
| Triangles | 3,148 | 10,274 | 11,454 → 18,580 |
| Draw primitives | 11 | 9 | 50 → 48 |
| Material objects | 6 | 9 | 21 → 24 |
| Coupe embedded textures | 0 | 0 | unchanged |
| Coupe GLB bytes | 175,100 | 583,304 | — |
| Three distinct car downloads, bytes | — | — | 422,084 → 830,288 |

The lot totals include the five two-triangle contact-shadow planes. Draw counts
are the resident asset primitives, before camera culling and additional shadow
passes. Other cars remain unchanged. The extra 7,126 triangles buy modeled
openings, cabin and manufactured detail; material batching removes two draw
primitives. No per-frame animation or new lighting cost is introduced.

The complete unnormalized GLB bounds are approximately 6.260 × 4.232 × 15.048 ft
(width × height × length), including mirrors, bumpers and exhaust. The loader
reduces its length to 9 and seats the tire minimum at Y=0. World-aligned bounds
are slightly larger longitudinally after the retained parking yaw; that is
expected and must not be mistaken for a normalization regression.

The car callbacks now wake the on-demand renderer; the StoreScene callback also
invalidates the static shadow map. `disposeDetachedModel` releases each loaded
car's geometries, materials and embedded textures. A disposal guard rejects late
successes and failures; teardown is idempotent. The existing failure box retains
its color, size and ground position and now releases its tracked geometry.
The verification harness exercises live adoption, finish clamping, double
teardown, delayed success/failure, and fallback geometry release. The asset test
locks the axis/ground envelope, UV channel, roles and geometry/resource budgets.
