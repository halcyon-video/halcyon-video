# Original asymmetric wall-bank casework (#209)

This replaces only the existing opaque housing of the corporate 2000 three-screen
wall bank. The current pierced black bezels, picture/scan/glass geometry, media
feed, crop, screen targets and positional audio remain owned by AmbientTvs.
The approved ceiling CRTs, separate sets and suspended shared enclosure are unchanged.

## Source and construction

Original generic scripted Blender casework under the repository license; no
imported geometry, reference pixels, marks, fonts or images. Its shape comes from
the existing owner-approved asymmetric runtime outline, not a surveyed historic
manufacturer cabinet. Source is `tools/models/tv-wall-bank.blend`; regenerate with
`blender -b --python-exit-code 1 -P /absolute/path/to/tools/models/tv-wall-bank.py`.
The existing Blender glTF exporter and display-model loading/ownership pipeline
are reused.

Thirteen editable physical pieces include a continuous pierced front pressing,
upper/lower formed skins, two pierced end returns with four ventilation slots
each, an open wall attachment flange, three matching open cassette supports and
small assembly heads. Real sheet thickness and formed edges replace the solid
extrusion; no back slab crosses any of the three CRT depth paths. Cassette returns
are open frames, not hidden full CRT bodies. No in-wall cabinet interior was built.
Every solid is welded, outward-normal/manifold/zero-area checked before export;
all parts have packed UV islands for uniform finishes. The source keeps pieces
separate, then batches only the runtime mesh into three material-role meshes.

Roles are HousingAmber, RecessHardware and WallFasteners. The runtime supplies the
original owner's amber material (`0xc4941f`, roughness .72, metalness .05) for
HousingAmber; it remains owned by the existing fallback/scene. Other finishes
belong to the loaded asset. No textures are embedded. Assembly heads are within
the existing outside-wall envelope; the clear end-vent image, not the small heads,
is the useful construction detail at normal viewing distance.

## Exact consumer contract

Numeric scene units are feet. Blender `(X, -store Z, height)` exports runtime
`(X, height, store Z)`. Model origin is the bank centre at the back-wall surface:
`(11, bankY, backWallZ)`. Front face is local Z .5; nothing extends behind the wall
or farther out than the existing half-foot housing. The asymmetric outline remains
wider on top and taller on the left. Nominal relative contour points are:

- Bottom-left (-5.2865, -1.88475), bottom-right (5.2865, -1.53025).
- Top-right (5.6135, 1.66025), top-left (-5.6135, 2.01475).

The existing three 2.10 × 1.575 ft pictures stay at X 7.5, 11 and 14.5, pitch 3.5.
The existing bezel is 2.50 × 1.975 ft, with a 2.14 × 1.615 ft aperture and .16 ft
depth; it was already properly modeled and is retained. Picture/scan/gloss remain
at local front offsets .03/.036/.14 with the original .035 ft tube bulge. New
cassette supports and pierced front fit those current faces rather than changing
the picture planes or importing a full ceiling CRT into a shallow wall cabinet.

The original bankY formula is unchanged. In the normal 13.5 ft scene, bankY is
10.09. Measured adopted model world bounds are X 5.386918..16.612990,
Y 8.205418..12.104592, Z backWallZ..backWallZ+.5. Ceiling gap is 1.395408 ft;
case-grid/header gap above the existing 8 ft datum is .205418 ft. All extents stay
inside the old extrusion's envelope; corner easing makes only a small inward
change. The initial formed-roof end protruded .00095 ft and was rejected before
preview; its fitted end stops were trimmed and the rejected bounds/source retained.

## Loading, admission and teardown

`src/ambient-wall-bank.ts` is the bounded adapter; AmbientTvs adds its existing
housing, retains its collider, stores the remove callback and invokes it at
teardown. The old world-coordinate extrusion is reparented with an exactly
cancelling translation so its fallback/collision shape stays in place. Only that
opaque fallback is hidden after successful prepared model adoption.

Precise transformed model bounds must fit the original envelope, stay at least
.10 ft above the case-grid/header datum and .10 ft below the ceiling. Unsupported
or malformed detail keeps the built-in housing. Supported corporate normal13.5
and raised18 ft cases admit the model. A synthetic9 ft case rejects it without
moving screens or worsening the old fallback; actual mom-and-pop9 ft format
already excludes overhead TVs through its existing ceilingTvs admission.

Existing installDisplayModel handles deferred preparation, failed/late loads and
cancellation. The loaded model owns its geometries, unreplaced materials and any
imported textures; supplied amber is not released by model teardown. Render and
structural shadows wake after adoption. No per-frame animation, provider work,
settings, navigation or overlay path is added.

## Cost and evidence

The export is 130,344 bytes, 1,992 triangles, three material batches and zero
embedded textures. The replaced opaque extrusion was12 triangles/two geometry
groups. Existing three bezels and all live screen layers are unchanged and excluded
from that housing-only comparison. Room/environment textures on supplied/shared
materials are existing scene resources, not new model texture memory. These are
geometry costs, not frame-time or physical-phone performance measurements.

Before/after actual front, side and join views were inspected. The first generic
ready screenshots were labelled unverified until model adoption was established.
A private checkpoint then asserted display-model visible and display-fallback
hidden, recorded mesh/geometry/material IDs and captured actual adopted
front-oblique and close end views in the same scene. The end view resolves all
four ventilation openings. Those images were delivered before focused checks/build.

Targeted evidence covers actual-export normals/finite UVs/roles/envelope/cost,
all three clear aperture and rear depth paths, actual picture/gloss centre/corner
rays, synchronized 640×360 programme crop (repeat X .75, repeat Y1), unchanged
screen-layer positions/sizes/types/colours and target names, normal/high/synthetic
low height, 404/late completion/preparation cancellation and shared finish ownership.
Suspended/separate configurations and approved CRT/suspension asset bytes are
checked unchanged. The required build includes enforced budget/provider/slot and
TypeScript gates. No unrelated full-suite or navigation sweep is required because
no navigation or overlay behavior changes.

## Remaining #209

The suspended-three primary and this existing three-screen wall-bank housing are
separate retained configurations. The optional six-screen L cabinet remains
unbuilt: three top/four left positions sharing one corner, real lower-right stock,
plinth and ahead/right lectern. Its scale remains an inferred engineering problem;
four current full CRT pitches exceed11 ft. The catalog podium remains dormant and
is not reactivated here. Future L-six/stock/peek/navigation work requires its own
reviewed scale/placement/lectern decisions and meaningful navigation gates.
This wave uses Refs #209 and does not claim the complete family closed.
