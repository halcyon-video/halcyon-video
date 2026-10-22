# Original retail fixture studies

Six original fixture studies are available to the chain store's measured layout: an acrylic popcorn bin, impulse spinner, two-door cooler, chest freezer, candy gondola and secondary service counter. Editable Blender files and reproducible authoring scripts live beside their metrics in `tools/models/`; the corresponding runtime GLBs live in `public/models/`. These are original designs, not authenticated period replicas. The decorative secondary service counter is dormant; checkout remains at the main counter.

Coordinates are feet: Blender `(x, -store_z, height)` becomes glTF Y-up. The spinner's source caster bottoms are 0.055 feet above the source datum; runtime installation lowers its unchanged export by that amount. Conservative shared envelopes in `src/retail-fixture-specs.ts` contain both exports and loading fallbacks.

| Fixture | Exported width × depth × height, ft | Reserved width × depth, ft | Triangles | Runtime mesh draws |
|---|---:|---:|---:|---:|
| Open acrylic bin | 1.82 × 1.82 × 3.00 | 2.20 × 2.20 | 6,156 | 10 |
| Impulse spinner | 1.859 × 1.947 × 5.185 | 2.20 × 2.20 | 14,724 | 8 |
| Two-door cooler | 4.01 × 2.405 × 6.50 | 4.20 × 2.60 | 16,612 | 36 |
| Chest freezer | 3.84 × 2.24 × 2.80 | 3.90 × 2.30 | 5,328 | 12 |
| Candy gondola | 3.90 × 1.146 × 5.00 | 4.00 × 1.60 | 5,616 | 12 |
| Service counter | 5.30 × 2.85 × 3.72 | 5.40 × 2.90 | 4,104 | 13 |

Static opaque parts sharing a material are batched through Three.js `mergeGeometries`. Glass and translucent bottles remain separate for correct sorting. Source meshes remain editable and unchanged. These are geometry/resource measurements, not physical-phone frame-rate results.

Concessions form short runs near the registers, checked against existing fixtures, shelving and reserved checkout/entrance space. They do not migrate to the distant game-department wall. The popcorn tray is open, with low acrylic sides and individually sealed pillow bags; the cooler has closed door-frame joins and original red-and-white side finishes without a beverage brand.

Fixed fixtures and game shelves are built first, then concessions, then movable sale furniture and the stock cart. The era-specific draped sale table reserves its actual 6.20 × 2.70-foot footprint and three feet of surrounding clearance, including the whole return-counter enclosure. Small or obstructed stores receive fewer objects; independent-store floor-display exclusions remain in force.

The existing model loader owns installation and cancellation. The scene retains these fixture instances and disposes them before renderer teardown, so late loads cannot attach to a discarded scene. The service counter's imported accent finish uses the active store palette and follows live brand edits. Generic package geometry represents visual stock, not purchasable inventory.

Validation covers actual GLB bounds, normals, UVs, triangle counts, transparent-part preservation and runtime draw budgets; several store widths and blocked layouts; loaded/failed/pending model teardown; live brand updates; independent-store exclusion; and mobile scene, navigation and touch checks. Historical identification, adoption dates and any further reference-fidelity model work remain open.

## September 20 concessions revision

The queue candy rack joins the concessions line instead of facing it across
an obstructed checkout aisle. The shelf and popcorn display each have a
back-to-back partner, and the cooler turns 90 degrees counterclockwise.
The aggregate admission envelope includes every member and preserves the
three-foot customer approach. The chest freezer is dormant. Sale tables only
use front-half pockets, and the supplemental table requires five-foot clearance.

The cooler export includes rolled can rims, recessed lids, pull tabs, profiled
bottle shoulders, necks and caps, plus open wire decks. Gondola snack pouches
have sealed ends and bulged profiles rather than solid cartons. Runtime original
product wraps distinguish soda, candy and popcorn; clear acrylic/glass keeps
stock visible. Existing object scale, origin and collision envelopes are retained.
The authoring scripts and editable Blender sources reproduce the public exports.

## October 21 single-film floor display

The two single-film promotions (`feature-title:0` and `:1`) no longer borrow
the four-sided tower. They use an original printed corrugated floor display.
One scored blank forms the back and both side panels: it is rounded at the
rear folds and cut back along a taper from 0.50 feet deep at the kick to 0.04
feet at the top. Each of the four trays folds a back flange into its 0.20-radian
raked deck and butts against a separate printed apron. The kick base folds its
top and front from one strip. The header card stands in the back panel's plane
on two rear lock tabs. It carries the featured film's landscape backdrop and
title through the existing feature-film header art. As on the towers, a film
with only portrait art leaves the card bare. The stock is twelve face-out
copies of the film, three per tray, filled from the top tray down.

| Fixture | Exported width × depth × height, ft | Reserved width × depth, ft | Triangles | Runtime mesh draws |
|---|---:|---:|---:|---:|
| Single-film floor display | 2.10 × 1.02 × 5.28 | 2.20 × 1.10 | 388 | 3, plus 2 for header art |

The 45.6 KB export is untextured, using satin black print, kraft and darker cut
flute, with planar UVs. `tools/models/film-floor-display.py` reproduces the
editable `film-floor-display.blend` and the runtime GLB. The script shares its
measurements with `src/fixtures/film-floor-display-geometry.ts`.
`tests/film-floor-display.test.ts` checks the runtime trays against the exported
metrics. It also checks that DVD and VHS copies rest on their decks, stay behind
the aprons and clear the tray above.

Film displays keep the three-foot approach on every side. Viability is now
checked against each fixture's own 4 × 3 grid. A store with three base towers
places one film display. Actor subjects now use the marquee column described
below. Independent-store formats still exclude both kinds. This is an original generic design, not an authenticated period replica.

## October 21 actor spotlight column

Actor spotlights (`actor-spotlight:0` and `:1`) now use an original marquee
column. The plinth and drum are one turned body. Three chrome ledge rings rake
up 0.20 radians toward their rims, and copies lean back against the drum, twelve
per ring: three columns on each of four quarter faces. A four-sided marquee box
sits on a chrome seat collar. Its bevelled edges are the chrome trim, and seven
lamps run above and below the subject's name on each face. The house fascia
blades letter the name, so the label follows live brand edits. The lamps glow in
the room but opt out of the environment cube bake.

| Fixture | Exported width × depth × height, ft | Reserved width × depth, ft | Triangles | Runtime mesh draws |
|---|---:|---:|---:|---:|
| Actor spotlight column | 2.58 × 2.58 × 5.25 | 2.60 × 2.60 | 8,780 | 3, plus 4 name blades |

The 328 KB export is untextured, with satin black, chrome and lamp finishes.
`tools/models/spotlight-column.py` reproduces the editable
`spotlight-column.blend` and the runtime GLB. The script shares its measurements
with `src/fixtures/spotlight-column-geometry.ts`.
`tests/spotlight-column.test.ts` checks them against the export. It also checks
that DVD and VHS copies rest on their rings, stay off the drum and inside the
rims, clear the ring or marquee above, and stay inside their own wedge. Browsing
uses the four-sided stand's face-to-face stepping, and the camera squares up to
each quarter face's centre column. Studio subjects remain on four-sided towers.
