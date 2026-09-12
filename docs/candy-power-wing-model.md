# Cardboard candy power wing (#204)

Original generic bulk-tray design, integrated as the 1993 hardware variant of
`candy-display-front` in both shield and square-U counter layouts. This uses
the existing `candy-display` registry factory; no duplicate fixture or collider
is registered. The desk format still has no queue rack. Other eras, custom
sizes, and custom row counts retain the prior rack and dispenser behavior.

The original 1993 Part II walkthrough was not available in this checkout.
The existing archive investigation in
`docs/children-section-arch-model.md` records the unavailable original archive
and video leads. No source photograph was used and no exact period fidelity is
claimed. All geometry, fiber textures and generic header lettering are original.
Owner-reference derivatives and branded art must stay under local user-assets.

## Source and contract

- Editable source: `tools/models/candy-power-wing.blend` (named separate panels,
  decks, returns, glue laps, locking tabs, flute details, rails and saddles).
- Rebuild: `blender -b -P "$PWD/tools/models/candy-power-wing.py"`.
- Runtime: `public/models/candy-power-wing.glb`, merged by four material roles.
- One numeric unit is one foot; Blender `(x, -store_z, store_y)` exports to
  Three.js `(x, y, z)`. Origin is floor center; customer face is local -Z.
- Estimated bounds: 2.94 × 4.47 × 1.58 feet (width × height × depth), entirely
  inside the existing 3 × 1.6 foot collider. No rear projection into the counter.
- Five support datums: y = .615 + row × .7; pitch = -π/15 about runtime X.
  Named `Anchor_StockRow_0..4`, `Anchor_Header`, `Anchor_RearAttachment` empties.
- #194 is open. This consumer reuses the existing 175 generic candy cartons,
  five catalog materials, row IDs and `candyStockMatrix` transforms. It does
  not introduce a second carton family or change checkout/bag collision sizes.
  Future #194 geometry must retain the .32 × .42 × .18 foot stock envelope,
  centered origin, and current row transform (including .65 vertical scale).
- The wing attaches to its rear host rails with four return saddles. The rails
  terminate in full-depth feet; the hollow plinth has an internal cross web.
  All parts are static. Header print is independent of the folded header blank.

## Surfaces and ownership

`CorrugatedKraft` and `ExposedFlute` use packed 256² deterministic fiber albedo,
roughness and tangent-space normal images. UVs use physical-scale projection;
the header front has a separate full-face print mapping. `AttachmentSteel`
has .7 metalness / .42 roughness and .24–.30 linear base reflectance. Each
closed mesh is checked for manifold edges during authoring. No black albedo.
`HeaderPrint` receives a fixture-owned 512 × 128 generic canvas print at runtime;
its fiber normal and roughness maps remain active.

The loader owns all imported geometries, materials and textures, including
textures replaced by live header art. Disposal releases unique resources and
removes the root. Failure retains the built-in rack; late responses release
resources without installing or requesting a render. Successful installation
refreshes rendering and shadows. Catalog resources stay with CandyDisplay.

Hardware: 4,992 triangles, four draws, 640,376 byte GLB, three embedded 256²
images. Runtime header adds one 512 × 128 canvas texture. Stock remains 2,100
triangles in five instanced draws: total 7,092 triangles / nine draws. Texture
payloads occupy about 1.33 MiB including mipmaps (three imported images plus
header; excludes the pre-existing five stock label textures).

## Verification

`npm test && npm run build` and
`node tools/verify-candy-power-wing.mjs /tmp/power-wing-evidence`.
The browser check raycasts all 700 carton bottom corners onto the runtime trays,
checks footprint bounds, five unchanged catalog rows, texture/mesh disposal,
failed loading and disposal during loading. It checks both real store counter
layouts for candy violations and clerk traversal, and captures before/after
front, side and over-counter rear views plus isolated construction details.
Before photographs load the prior public rack and dispenser hardware at the
same anchor. Rear store views necessarily include counter occlusion; the
isolated rear view shows all four saddles and the base attachment.
