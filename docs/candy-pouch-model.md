# Hanging snack pouch kit

Original generic flexible packaging, authored in Blender for issue #277 and
installed on the public queue rack and gondola. The photographed slatwall-wing
variant remains separate, incomplete scope. The final section records current
runtime coverage and its verification; the earlier candidate section records
the original asset-only stage.

## Provenance and construction

The locally archived [2006 store photograph](https://www.flickr.com/photo.gne?id=243950517)
was inspected: the left queue display and adjoining slatwall wing show upright,
inflated bags with flattened transverse seals and differing widths/fill levels.
The source was forward-readable. Its limited resolution does not establish hole
shape, laminate gauge, rear seal construction or concealed hook attachments.
These details are original construction estimates, not historical measurements.
No source pixels, photographic skins, real product marks or third-party mesh are
included. The current 1993 folded bulk-tray wing is a different object and must
not be silently converted to this 2006 hanging arrangement.

Each pouch has a joined bulged body, flattened top/bottom seals with restrained
crimp impressions, a narrow rear fin crease, and a real through-hole in its top
seal. The model is a closed filled-volume surface, not a simulation of two
microscopic film layers. Estimated flattened seal thickness is approximately
.0016–.0020 feet. Twenty-four section vertices and seventeen height sections
control the shape; a sixteen-sided die-cut bore is applied to the editable mesh.
Source parts are manifold; bent-wire pegs have a lowered neck and rounded tip.
Crossbars and side rails join existing fixture supports as original welded
hardware. They are not claimed to reproduce hidden hardware in the photograph.

## Files, templates and coordinates

- Editable source: `tools/models/candy-pouch.blend`.
- Reproduce: `blender -b -t 2 -P /absolute/path/to/tools/models/candy-pouch.py`.
- Runtime kit: `public/models/candy-pouch.glb`.
- Export measurements: `tools/models/candy-pouch-metrics.json`.

One numerical unit is one foot. Blender `(x, -store_z, height)` becomes glTF
X across, Y up, +Z printed front. Template parents have identity transforms.
The pouch origin is its bottom centre. Templates overlap at zero intentionally:
select a **named group**, never install the whole GLB as one object. The Blender
file initially isolates the small pouch; other named groups can be unhidden.

| Group | Envelope or construction | Triangles |
| --- | --- | ---: |
| PouchSmall | .42 × 7/12 × .15 ft, W × H × D | 888 |
| PouchFull | .50 × .72 × .20 ft | 888 |
| PegShort | .006-ft wire radius; load at local Z .18 | 172 |
| PegLong | .006-ft wire radius; load at local Z .75 | 172 |
| RackCrossbar | X −1.43 to +1.43; .0125-ft tube radius | 28 |
| GondolaCrossbar | X −1.85 to +1.85; .0125-ft tube radius | 28 |
| RackSideRail | Z −.64 to +.64; .0125-ft tube radius | 28 |
| RackCrownRail | Z ±.2449173967; .0125-ft tube radius | 28 |

These dimensions are integration design choices near the low end of the issue's
low-confidence photo estimate, not physical measurements of a commercial bag.
The seven-inch small height was chosen after checking the real authored rack.

Pouch anchors `Anchor_Small_Bottom`, `Anchor_Small_PegHole`,
`Anchor_Small_WireRest` (and corresponding Full names) are exported as named
nodes. Hole centre is `(0, H−.035, 0)`. Wire rest is `(0, H−.0285, 0)`:
a .006-ft-radius wire touches the upper interior of a .0125-ft-radius hole.
Each peg exports `Anchor_PegShort_Mount` and `Anchor_PegShort_Load` (or Long).
Load is `(0, −.01385293577, .18)` or Z .75. Positive Z runs away from its
crossbar. The lowered neck and rounded retaining tip are inside measured bounds.
Crossbar/rail end anchors are also named in the metrics.

## Materials and UVs

`SnackPouchLaminate` is an opaque, lightly glossy printable laminate role.
`PouchSupportSteel` is the separate metal role. The kit embeds no textures.
Runtime should substitute existing original generic packaging materials, keep
printing independently replaceable, and avoid a scene-wide transmission pass.
Front/back panels read upright from their respective outside viewing sides;
the printed wrap remains continuous through the sealed margins. The single active render UV
layer is `ReplaceablePrintUV`. glTF uses the existing `flipY=false` wrap
convention. A custom CanvasTexture branch using `flipY=true` requires explicit
UV compensation, as in the existing candy carton helper.

## Verified host fit and placement recipe

The fit study loads actual exported rack frame/tray and gondola geometry. It
raycasts support intersections and conservative pouch-box clearances. No fixture
footprint, navigation collider, selected row identity or delivery metadata changes
are part of the asset contract.

Default 3 × 1.6-ft rack, known flexible rows 1, 2, 4 only:

- `base = .615 + row*.7`.
- Small pouch bottom centres: `((i−2.5)*.45, base−.005, −.18)`, i=0..5,
  rotated π about Y so its front faces the existing queue face.
- Crossbar and peg root height: `base + .5636862691031603`; crossbar Z=0.
- PegShort at each pouch X and root height, rotation π about Y.
- Side rails at X ±1.43, root height, Z=0. Use RackSideRail for rows 1/2;
  RackCrownRail for top row 4. The latter terminates on actual hoop crown
  vertices at height `3.72 + .28*sin(3π/8)`.
- One bag deep, six facings per flexible row. The old 35 boxes per row are
  decorative repetitions, not catalog quantity. Two carton rows stay unchanged.

Measured conservative clearance: .01731844 ft above the sloping tray and
.04088389 ft below the next tray. All rail endpoints intersect the authored
hoops; top small-bag height is 3.99333333 ft, inside the existing 4.028-ft frame.
The complete support/pouch subset remains inside the existing 3 × 1.6-ft footprint.
These values apply to this default host, not arbitrary custom dimensions.

Existing gondola upper tiers at shelf heights 3.2 and 4.2 ft:

- Full pouch bottoms `((i−3)*.53, shelf+.07, +.10)`, i=0..6; rotation 0.
- Crossbar at `(0, shelf+.77535293577, −.65)` attaches to existing standards.
- PegLong roots share crossbar Y/Z and each pouch X; rotation 0.
- Remove existing horizontal `SnackPouch_*` and `PouchCrimp_*` stock only when
  replacement installation is ready. Preserve trays, standards and lower cartons.

Conservative lower clearance is .00948904 ft. Top pouch is at 4.99 ft, crossbar
at 4.97535294 ft; complete geometry fits the 4 × 1.6 × 5-ft host envelope.
Changing upper decorative facings from eight to seven avoids overlap. The
existing gondola has no selectable candy-row semantics to alter.

## Resource cost and integration gates

Whole GLB: 2,232 triangles, eight mesh templates, two material roles, 96,580 bytes,
zero embedded images. A template count is not a scene draw count. Proposed rack
instances: 18 bags + 18 short pegs + 3 bars + 6 rails = 19,332 triangles. The
unchanged two carton rows contribute another 12,600, for 31,932 stock/support
triangles compared with 31,500 carton-stock triangles before this change.
With instancing per row/material and support type this is nine main-pass draws
including two retained carton rows, compared with five prior stock draws.
Existing rack/dispenser hardware and shadow passes are additional and unchanged.

Proposed gondola addition: 14 full bags, 14 long pegs, 2 crossbars = 14,896
triangles. At two print materials, one peg instance mesh and one bar instance
mesh, this is four main-pass draws replacing the two existing pouch-material
batches. Report actual final costs after integration. Reusing already-owned
packaging wraps need not add textures; new wrapping ownership must be measured.

Runtime must preserve failure fallback, late-load cancellation, resource disposal,
render/shadow refresh, custom labels/palettes, and selectable row IDs. In particular,
optional private rack side stock currently clones the front row geometry with
old carton transforms: blindly sharing a bottom-origin hanging pouch would shift
or overlap those copies. Its placement/support compatibility must be addressed
explicitly or retain its pre-existing compatible fallback. Likewise, the separate
1993 bulk-tray wing is not the hanging rack. Neither path is proved by the default
host fit study. Bag-drop physics and count-only randomized assortment are outside
this family handoff and remain unchanged.

The asset checks establish manifold source, exported numerical bounds, real hole,
finite normals, front/back UV direction and bounded cost. Proof-of-fit photographs
use a temporary diagnostic placement in the real app, not shipped integration.
Full consumer lifecycle tests, fallback/custom/private compatibility, installed
mobile/eye-level photographs and final build remain required for issue completion.

## Asset-candidate verification, October 3

The final source/export passed manifold, envelope, normal, real-hole, print
orientation and side-seam span checks. The seam regression assertion rejected the
preserved earlier export before accepting the corrected one. Normal build and
four existing candy/rack/dispenser asset tests passed. Before/after real-store
fit previews plus front/side/rear detail and mobile images were inspected; the
preview had zero page errors and no candy layout violations. ImageMagick compared
the same-boot installed images (normalized RMSE .0365924, an intentional-change
measurement, not a screenshot regression threshold).

Final GLB SHA-256:
`da597682c5899eab8d4ab00bc64e49290d0b6b1402402bfd6f4a787830edd4b5`.
Evidence is retained in `scratch/publicity-kits/pouches-277/`. These are asset
and temporary-placement results; default/gondola runtime integration and the
later slatwall-wing consumer slice remain outstanding. No issue-closing claim
is made by this asset-only commit.

## Bounded runtime integration and remaining scope

The shared kit now renders on the original public queue rack's known flexible
rows and on the existing gondola's two upper tiers. The default queue keeps
CHOCO BARS and MOVIE MINTS as 35 carton instances each, and uses six small bags
on each of GUMMY BEARS, POPCORN and SOUR RIBBONS. Product row IDs, catalog names,
sizes, generated print maps and delivery behavior remain unchanged. Known
custom palettes keep their existing canvas cards with explicit UV compensation;
unknown labels or unproved dimensions retain their prior compatible stock.

The rack's new pouch/support subset measures 19,332 triangles in seven draws;
its two retained carton rows add 12,600 triangles and two draws, for 31,932
stock/support triangles in nine draws. Original hardware is additional. The
upper gondola replacement is 14,896 triangles in four draws, with fourteen full
bags, fourteen long pegs and two crossbars. Lower cartons and host hardware are
unchanged. Pending/failed stock keeps the original two batched upper print
materials, avoiding a temporary unbatched fixture. No new texture downloads are
introduced; fixture-owned maps and steel are reused, with owned print clones
retired independently.

Runtime checks verified loaded geometry, exact instancing costs, original row
identity and footprints, support-rest coincidence within 1.55e-7 feet, custom
printing, failed asset fallback, cancellation during pending loading and hidden
GPU preparation, and resource disposal. Front/side/rear/support views and actual
mobile-sized in-store eye-level photographs were inspected after numerical
comparison. These are renderer/browser checks, not physical-phone performance
measurements. The public store's normal warmup/detail-release lifecycle was
preserved; an omitted release in an excluded private screenshot harness was
identified and documented separately, without changing the product scheduler.

This is **partial issue #277 progress**, not delivery of the photographed
slatwall-wing hanging bags. The separate 1993 folded bulk-tray wing retains its
own stock and geometry. The optional private rack counterpart retains its
compatible centred-carton side facings; a test using public substitute hardware
proved the legacy branch, but the real private wing's geometry and supports
were not inspected here. Its actual source, backing/hooks, hanger fit and
private/public-safe integration still require a distinct bounded assignment.
Neither compatibility path should be described as a newly modeled hanging wing.
Count-only checkout-bag assortment and physics also remain unchanged.
