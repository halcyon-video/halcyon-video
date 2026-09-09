# Closed physical packaging

These are original, blank, scripted Blender meshes. They contain no cover art,
logos, image textures, opening animation or playback behavior. `packaging.py`
authors welded profiles and separate physical parts, saves `packaging.blend`,
and uses Blender's glTF exporter. They are approximations of construction
families, not exact reproductions of every regional edition.

## Geometry and artwork contract

Store coordinates are feet: X width, Y height, Z depth, centered on all axes.
Front is +Z; back is -Z; hinge/spine is -X. Blender stores `(x, -z, y)` and its
Y-up glTF export restores the store axes. Rental VHS retains the existing
positive-X half-rim offset. No model extends beyond its declared closed bounds.

The loader maps named paper surfaces to the existing material lanes:
Opening 0 (+X), PaperSpine 1 (-X), Top 2, Shell/WhiteShell 3, PaperFront 4 (+Z),
PaperBack 5 (-Z). Detailed meshes additionally use ClearRim 6, Tray 7 and
PaperEdge 8. Compact jewel stock retains lane 6 and merges the two interior
finishes into the shell lane. Front/back/spine paper is independent of plastic.
The loader reverses the glTF V convention for the existing CanvasTexture /
ImageBitmap art pipeline. Front/back have opposite U directions, as before.
Spine paper uses the established two-flap composition where present.

Rims are closed swept sections with eased lips and recessed paper seats.
VHS rental, white clamshell and DVD inserts are continuous U-shaped sheets: front,
spine and back share their fold edges, with the plastic recessed beneath them.
The outer opening edge and top/bottom retain the real case rim; no black
plastic separator crosses a paper fold.
Jewel halves flank a tray carrier and paper edges; the hero adds hinge lugs
and tray grip ribs. Multi-disc geometry has a wider central carrier and paired
hinge lugs. The white VHS model has larger rounded halves, a broad living hinge,
an inset window and a closure seam. The rental and DVD models use smaller lips,
a recessed closure and tabs. The VHS sleeve is a continuous thin-walled tube
with a stepped inner glue lap, open ends and a recessed cassette silhouette.
Closed packaging does not expose a disc hub; hidden discs are deliberately absent.

## Selection and dimensions

`Title.packaging = 'vhs-white-clamshell'` selects the larger molded retail VHS
case. Explicit `'vhs-slipcase'` selects the ordinary sleeve, including within
the Animated Movies library. In the absence of metadata, the existing exact
`Animated Movies` library name retains its white-case presentation; other
libraries default to the sleeve. That backward-compatible operator convention
is styling, not proof of a title's retail edition. All white selection applies
only in VHS mode and excludes games and series. No new genre, studio or poster
aspect inference is added. Producers of Title objects may
supply this optional metadata; there is no automatic server-tag inference or
new settings UI. `tests/fixtures/packaging.ts` supplies public-safe game inserts
for integration testing; the screenshot harness also supplies explicit movie
metadata. This is separate from rental copies, which remain store shells.

The white case is 5.5 × 8.75 × 1.25 inches. The ordinary local movie sizes remain
0.365 × 0.667 × 0.092 feet for VHS and 0.445 × 0.667 × 0.045 feet for DVD.
Rental VHS retains the existing rim enlargement and 0.104-foot depth. These
local sleeve/DVD proportions predate this work and are not newly measured
retail standards. The white case is a distinct construction, not a color swap.

Current recognized platform inventory is preserved in `GAME_BOX_IN`, now in
`packaging-formats.ts`. Dimensions below are the inherited nominal inches,
width × height × depth. Wide cartons still scale uniformly to the existing
6.6-inch shelf-width limit; no known plastic case is fitted to incoming artwork.

| Platforms | Nominal dimensions | Runtime construction / qualification |
|---|---|---|
| NES; ATARI; ARCADE | 5 × 7 × 1 | Existing carton/fallback; ARCADE is a rental proxy, not a universal arcade retail box |
| SNES; NINTENDO 64 | 7.5 × 5.25 × 1.1 | Existing landscape paperboard; NA nominal |
| SUPER FAMICOM | 4.2 × 7.5 × 1.1 | Existing portrait paperboard; JP nominal |
| GAME BOY; GAME BOY COLOR | 4.75 × 5.25 × .9 | Existing paperboard |
| GAME BOY ADVANCE | 4.8 × 5.4 × .9 | Existing paperboard |
| GENESIS | 5.5 × 7.5 × 1.2 | Molded hinged shell profile; later cardboard editions are not inferred |
| SEGA MASTER SYSTEM | 5.5 × 7 × 1 | Molded hinged shell profile |
| TURBOGRAFX-16 | 5.5 × 4.9 × .9 | Existing fallback; package combinations vary |
| PLAYSTATION | 5.6 × 4.9 × .4 | Jewel single; early longboxes and PAL editions differ |
| SEGA SATURN | 4.9 × 5.6 × .4 | Inherited portrait jewel approximation; not a verified NA longbox |
| SEGA CD | 5.5 × 7.9 × .75 | Inherited large jewel-family approximation; regional packages differ |
| DREAMCAST | 5.5 × 7.5 × .6 | Inherited tall jewel-family approximation; not a verified US/JP jewel or PAL case |
| PLAYSTATION 2; XBOX | 5.3 × 7.5 × .55 | DVD keepcase family |
| GAMECUBE | 5.3 × 7.4 × .6 | Keepcase; JP small-box editions not inferred |
| NINTENDO 3DS | 5.4 × 4.75 × .5 | Small landscape keepcase |
| NINTENDO DSI | 5.4 × 4.9 × .5 | Inherited DS-family keepcase |
| NINTENDO SWITCH | 4.2 × 6.6 × .45 | Narrow keepcase |
| PSP | 4.1 × 6.7 × .6 | UMD-sized keepcase |
| WII U | 5.3 × 7.5 × .6 | Keepcase |

Unknown labels keep the previous media-class fallback. The current platform
label normalizer is broader than exact console generations; this work neither
adds consoles nor claims that every label match identifies an edition.
All four inherited jewel platforms retain `discCount >= 2` selecting the fat
model and **0.72-inch nominal depth**. Disc count is propagated unchanged; it
is not proof of packaging. Two-disc releases can use a normal-depth swing tray.
The four-disc fixture represents the construction class exemplified by Final
Fantasy VIII, with synthetic inserts. It is not a scan or a measurement of an
FFVIII retail edition. Exact PAL/NA/JP release selection remains unresolved.

Rental class stays independent of retail shape/count. Disc platforms are
PLAYSTATION, PLAYSTATION 2, GAMECUBE, DREAMCAST, PSP, WII U, SEGA CD, SEGA SATURN
and XBOX; other platforms use the VHS-class rental shell as before.

## References and confidence

Product pages and their photographs were consulted 2026-09-08. Photos were
inspected privately; they are not included in the model assets.

- [DeltaMedia single jewel](https://www.deltamedia.com/products/copy-of-10-4mm-cd-jewel-case-with-black-tray-holds-2):
  142 × 124 × 10.4 mm, clear cover, tray, booklet and tray-card seats. Good
  construction reference; vendor material descriptions differ from the maker below.
- [HWS single/double jewel construction](https://www.cd-case.com.tw/en/product/HWS-01-02.html):
  clear polystyrene case and separate tray; confirms two discs need not mean fat.
- [Uline four-disc case](https://www.uline.com/Product/Detail/S-10000/CD-Cases-and-Mailers/Multi-CD-Jewel-Cases-4-CDs-with-Black-Tray):
  inspected open-case photo shows clear outer halves and a black central carrier.
  Published 15/16-inch thickness is greater than the inherited .72-inch depth.
  Construction confidence is moderate; exact FFVIII dimensions are unverified.
- [Retrospekt white VHS clamshell](https://retrospekt.com/products/replacement-vhs-white-clamshell-case):
  closed/open photos and published 8.75 × 5.5 × 1.25 inches. Good reference for
  a replacement family case; not proof of any particular film's original mold.
- [MediaRange DVD specification](https://www.avxperten.dk/files/144882/mmo_5814699_1507813609_9532_16296.pdf):
  191 × 136 × 14 mm corroborates the keepcase class; inherited movie dimensions
  are retained rather than silently changed to this product.
- [FFVIII cover inventory](https://www.mobygames.com/game/1149/final-fantasy-viii/covers/)
  distinguishes releases and documents four disc faces. Used only to corroborate
  the four-disc technical fixture, not as artwork or exact geometry measurements.

Small molded details and sleeve fold thickness are authored nominal approximations.
No region-specific dimensional correction should be made from cover aspect alone.

## Loading, ownership and cost

`packaging-model.ts` fetches each requested family/LOD once through GLTFLoader
and `assetUrl`, merges parts into material draw ranges, and retains a bounded
CPU geometry cache. Stock is an ordinary InstancedMesh using the existing
texture-array attributes. Hero geometry shares the same coordinates and adds
visible details. Clear rims are opaque, lit physical material; the hero jewel
adds only two additive reflection planes. There are no transparent shelf shells,
transmission render targets, model textures or self-lit plastic materials.

Each async target retains its built-in fallback until ready. Disposal cancels
that target; cache generation invalidation rejects stale loads. Clones created
while loading register independently and preserve their per-instance attributes.
A failed download retains fallback until cache reset. Material roles and source
geometry are cache-owned; GLB temporary resources are released after conversion.
Three r184 shares geometry `userData` on clone; each target explicitly owns its
metadata so loading a hero never relabels compact stock. Malformed role/attribute
failures release every partially built geometry and source material/texture.
The stock subscription requests both render and structural shadow refresh, and
is removed with stock teardown. Hero removal also disposes its two owned
reflection planes and materials. Flips retain the same physical rental model.

Shelf placement uses the projected bounds of both leaned cases. The resting
animation retains the actual rental offset, including the height lift. Backstock
pitch uses the rental shell depth plus a small gap; carried mixed-format stacks
likewise use their actual adjacent half-depths; counts are capped to the
published gondola deck depth. Repeats are instanced separately by rental class.
Shallow display fixtures without a backstock depth contract keep their main
rental copy but do not receive invented decorative copies behind it. Neither
shelf geometry nor fixture/counter/sign placement is changed.

Exact exported bytes, triangles, parts, closed-solid counts and dimensions are
in `tools/models/packaging-costs.json`. The many editable source parts become
one runtime geometry per size/LOD, with contiguous material ranges. Cost excludes
existing paper textures, room lighting and the two reflection
planes (four triangles total). No physical-phone FPS performance claim is made.

All twelve files total 599,372 bytes; only requested families/LODs load.
Each has zero image textures. GLBs contain seven named materials for jewels,
six for sleeves and four for the other families. “Ranges” means material draw ranges in one runtime
geometry; the material array retains unused art lanes for compatibility.

| Family | Stock bytes / triangles / ranges | Hero bytes / triangles / ranges |
|---|---:|---:|
| jewel-single | 28,652 / 312 / 6 | 125,484 / 1,720 / 7 |
| jewel-fat | 28,720 / 312 / 6 | 135,208 / 1,872 / 7 |
| vhs-white | 22,728 / 254 / 4 | 62,184 / 886 / 4 |
| vhs-rental | 22,744 / 254 / 4 | 62,196 / 886 / 4 |
| dvd-keepcase | 22,752 / 254 / 4 | 62,204 / 886 / 4 |
| vhs-slipcase | 9,924 / 76 / 5 | 9,940 / 76 / 6 |

## Validation and limits

`node --experimental-strip-types --test tests/packaging-models.test.ts` checks
all exports for finite/unit normals, triangle winding, outward art surfaces,
UV range, bounds/origin, no image textures/emission/alpha, costs and supported
selection coverage, including plastic occlusion of the spine seat. Blender authoring also checks solid manifoldness, positive
volume and nondegenerate faces before exporting. `tests/case-fit.test.ts`
checks independent retail/rental seating arithmetic. `tests/packaging-fit.test.ts`
projects backing/deck corners and tests normal-space separation across both lean
angles and six representative sizes. The saved `.blend` was reopened and audited
against all twelve export cost/bounds records.

The cartridge paperboard variants remain on the existing geometry/aspect path;
issue #251 is not complete. Blu-ray is not added; issue #249 is not complete.
Further edition-specific models require measured references and explicit edition
metadata. This generic jewel family has no video-store branding or art in its
geometry/material definitions and can be reused by another media application.
