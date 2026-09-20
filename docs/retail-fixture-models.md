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
