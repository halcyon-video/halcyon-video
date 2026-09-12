# Corner clubhouse

Owner layout direction, 2026-09-11: back-left corner, 1990 only. Back-left means
minimum world X and Z when facing inward from the front entrance. The host,
chairs and dropped soffit are absent in other eras and independent formats.

## Construction and inferred dimensions

This is original generic millwork and shell construction, not a surveyed replica.
The private photo establishes a broad polygonal header, open framed shoulders,
a lower tiled ceiling extending over adjoining shelves, a floor carpet and a
supported television. The owner establishes the compass placement and era.
The photo has no reliable physical scale; all dimensions below are design
estimates. Hidden wall thickness, overhead chase depth and rear construction
have low confidence as historical measurements.

Scene units are feet. Blender (X, -store Z, height) exports to runtime
(X, height, store Z). The origin is the enclosure center; rear is -Z and left
is -X. The enlarged enclosure is 14 by 14, with a diagonal cut between local
(1,7) and (7,1). Each shoulder is 8 feet long, up from 6 in the superseded draft.
Two 3.7-foot shelf bays per shoulder give 80 interactive family-title slots:
five columns per bay, four tiers. The total fixture envelope is 15.2 square.
The center is 7.2 feet inward from each adjoining wall, leaving .2 feet for
installation. Shelves, not just the header, occupy the corner reservation.

The clubhouse top and lower acoustic lid meet at y=10.6. The normal ceiling
is y=13.5; the existing mirror cornice ends at y=10.8. The solid soffit chase
is therefore 2.9 deep, with a .2 painted lower return beneath the cornice.
Its plan reaches 19 feet along both walls, then cuts from (19,9) to (9,19)
relative to the room corner. The room cornice follows that exposed edge and
turns back into its normal wall runs. The solid chase continues to both real
walls; it is not a suspended white plane. Its tiled underside and three flush
lower diffusers continue over the first adjoining wall shelf bays. Main-ceiling
lights overlapping the chase are suppressed and applicable light keys move
below the lower lid. The existing cornice, tile and lighting systems are reused.

The header clears approximately 7.21 feet above the diagonal entry. Open side
windows begin at 4.5, with stiles and a top rail, and no infill or glass. The
cream surfaces visible through them are actual rear liners. Low walls remain
physical barriers. The room has no raised stage or threshold; carpet continues at the main floor datum. Cabinet support is y=2.3 at (-5.6,-2), 3.4 wide by 2.2 deep, turned onto the left side wall with a .1-foot installation gap.
The existing screening television model and static CRT picture are reused.

Existing chair geometry is unchanged. Centers are (-2,-3.15) and (-2,-.85),
facing -X toward the television. The cabinet ends at X=-4.5; chair bounds
begin at X=-2.565, leaving 1.935 feet between them. A five-foot turning disk centered at (1,1.5) and
the diagonal approach are kept clear.

## Palette and artwork boundary

FramePaint and HeaderPaint use the resolved active theme primary at full value;
EdgePaint and ChairPlastic use its secondary. The same contract applies to
custom LogoSpec colors and brand-pack/era resolution. The store's normal brand
rebuild recreates the finishes. A default secondary can legitimately be cream;
it is not a fixed white or fixed yellow chair color.

The nook uses the continuous main store floor directly. It therefore shares the
exact canvas/optional scan albedo, normal and roughness maps, six-foot repeat,
0.6 normal scale, 0.95 roughness and baked floor AO. There is no separate rug,
hue rotation or overlay seam.

Owner revision: the upper accent now spans y=9.633333–9.966667, matching the
middle third of the wall stripe (y=9.3–10.3, from 13.5−2.7−0.5). Upper blue
ends at 10.3 and a cream fitted return closes to the 10.6 soffit. The fallback
uses the same band boundaries. The entry, side windows and shelf slots retain
their earlier dimensions. Finish UVs are projected after the height remapping,
at ten repeats per foot, matching finishEquipmentSurfaces; packed UVs formerly
stretched the micrograin over the entire structure. The editable source has
explicit Principled base colors/roughness and procedural micrograin previews;
the optimized GLB receives shared bump/roughness textures at runtime.

The corner's existing first troffer key now sits under the actual diffuser at
wall-left +5, wall-back +5, y=10.4. It uses the normal store intensity and shadow
budget, avoiding the room grid's former placement outside the enclosed nook.

The public GLB and editable blend contain no source artwork or embedded images.
The runtime header uses createEntranceTicketLogoTexture -> active LogoSpec ->
drawLogo. Existing private sign slots remain optional local overrides; their
assets, private source photo and historical comparisons are excluded from this
commit and from the user-assets-free capture tree. No real-chain logo is
included in the model or public delivery. Existing attribution and publication
guards are unchanged.

## Planning, fallback and lifecycle

StorePlan reserves 20 feet at the back-left before shell/stock/navigation builds.
Only room depth changes as needed; existing island and stock transforms remain
intact in straight, diagonal and herringbone arrangements. New Releases begins
18 feet away along both walls, using the existing shared geometry/slot datums.
Admission requires 1990, corporate format, room width >=64, ceiling >=13.5 and
family stock. Unsupported rooms omit the nook; it is never relocated.

Individual walls, low panels, jambs, shelves, cabinet and chairs feed floor
navigation. Overhead construction and walkable interior do not become solid
floor obstacles. Family faces retain physical reading order and clamp at walls.
The fallback has the same open windows and shelf reservation; loaded geometry
replaces its visible millwork via installDisplayModel. The host owns its chairs,
finishes and asynchronous loads. Scene teardown owns the structural soffit.
Late model and private-texture arrivals are disposed after host removal.

## Sources, cost and verification

Blender scripted mesh authoring and Blender's standard glTF exporter produce
`tools/models/clubhouse.blend`, `tools/models/clubhouse.py` and
`public/models/clubhouse.glb`. The source retains named construction parts, UVs
and five finish roles. The export costs 560,256 bytes / 7,976 triangles / five
material batches and contains zero images. The fitted structural soffit lives
in `src/clubhouse-soffit.ts`, following the existing procedural shell pipeline.
The completed chair and television assets were reused without remodeling.

`tests/clubhouse.test.ts` checks admission, all three layouts, unchanged island
transforms, turning/approach space, export bounds/UVs/materials/cost, exported
window sightlines and stripe datum/physical UV scale. Runtime harness evidence exercises
family browsing/inspection, clerk routing, fallback, brand colors, load/cancel/
disposal and era rebuilds. Public completion photographs are findable in
`scratch/publicity-kits/clubhouse-1990`; the full report and superseded evidence
remain in the owner's clubhouse-1990 outbox. The top-down photo is a deliberate
ceiling cutaway, not the normal roof view.

## Kids detail iteration — 2026-09-11

The plaque reads KIDS CLUBHOUSE in the resolved brand secondary. The canonical
entrance emblem uses a secondary field with primary lettering and pinstripe;
the existing LogoSpec painter supplies its silhouette and letterforms. This is
a palette/copy revision to canonical art, not a photo-derived sign redraw.

The console, television, deck and chair row now share a left-wall viewing axis.
The VCR reuses models/vcr.glb and its editable tools/models/av-decks.blend source
and av-decks.py generator: an original generic period deck with cassette flap,
recessed controls/display, vented casing and rear sockets. Its feet sit at 1.27
on the middle console shelf, centered at (-5.32,-2), front toward +X. The CRT
sits at 2.3 and faces +X; the chairs face -X. Console fallback construction now
has the same open shelf slot. All loads use the existing lifecycle/disposal path.

The right cutout gains a fitted cream sill and secondary inner jamb liners.
The open sightline, all 80 interactive Family stock slots and shelf positions
remain intact. No character standee or reference artwork has been invented.
