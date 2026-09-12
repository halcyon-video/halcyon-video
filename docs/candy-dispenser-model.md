# Generic candy dispenser and blister pack (#278)

Original, character-free product attached to the **right side of the existing
checkout candy rack**. Twelve packs occupy a narrow supplier panel; this does
not add a department, catalog row, or collision footprint. Enabled by
`dispenserPacks` on the two existing shield/square-U counter placements. The
existing desk-format omission remains. Custom racks below 3 ft wide, 1 ft deep,
or five rows omit the attachment.

## Source and uncertainty

Inspected [Flickr photo 243950517](https://www.flickr.com/photo.gne?id=243950517),
“Day of sale,” locally on 2026-09-10.
The cropped right edge shows hanging clear bubbles, printed cards, small heads
and long stems. The 2–3 × 6–8 inch package estimate is **LOW confidence**.
This is an original generic interpretation, not a faithful reconstruction.
No character likeness, supplier mark, source pixels, or invisible dispensing
mechanism is included. The cap seam and rear knuckle only suggest a hinge;
there is no moving-part animation. Reference downloads remain outside the
public tree. No private assets were present when the evidence was captured.

## Editable source and construction

- Source: `tools/models/candy-dispenser-pack.blend`.
- Reproduce: `blender -b -P "$(pwd)/tools/models/candy-dispenser-pack.py"`.
  Use an absolute script path with the ThinkPad's containerized Blender CLI.
- Export: `public/models/candy-dispenser-pack.glb`.
- One numerical unit is **one foot**. Blender uses Imperial/Feet with
  `scale_length=.3048`; the GLB retains numeric feet for the store renderer.
  Blender `(x, y, z)` maps to store `(x, z, -y)`; store Y is up, +Z is front.
- Origin: bottom center of card. Width 0.208333 ft (2.5 in), height 0.583333 ft
  (7 in), total depth approximately 0.065 ft (0.78 in).
- Named anchors in source/export: `Anchor_CardBottom` (0,0,0),
  `Anchor_PegHole` (0,.550,0), `Anchor_CapHinge` (0,.408,.010), in store axes.
- Die-cut card: .002 ft thickness, rounded corners, real .024 ft diameter peg
  hole. Thermoformed shell: open-backed cup, rounded shoulder, crown, flange,
  and .0008 ft wall. Separate molded stem, widened foot, cap, lower seam and
  rear hinge knuckle remain individually editable in the Blender source.
- Every solid source part is checked manifold. All meshes carry UVs and
  normals. Card front/rear have planar full-card UVs; remaining parts have
  packed smart UVs. Runtime geometry merges only by material role.

## Materials and cost

Roles: `PackCard`, `DispenserStem`, `DispenserCap`, `HingeDetail`, `ClearBlister`.
The GLB contains no textures or branding. Runtime card printing is a shared
256 × 704 canvas using the active palette, LogoSpec and bundled Archivo Black;
font completion repaints it and requests a frame. Dispenser parts use instance
colors across three colorways. Printing stays independent of mesh authoring.
Blender glass uses transmission/IOR 1.46; the small runtime blister uses alpha
.23, clearcoat and no depth writes, avoiding a scene transmission pass.

Export: **1,064 triangles, five primitives, 76,792 bytes, zero textures**.
Twelve packs share five instanced meshes (12,768 triangles). The backing,
clamp straps/returns, pegs and upturned tips use five additional instanced draws
(396 triangles). Total addition: **13,164 triangles / 10 main-pass draws**,
seven runtime materials and one shared canvas texture (~704 KiB base RGBA,
~939 KiB including mipmaps). Shadows add their usual separate passes.
The retained hidden fallback uses four box geometries/instanced meshes and
shares materials; it adds no draws while the GLB is active.

## Attachment, lifecycle and clearances

The supplier panel is .012 ft thick, 3.05 ft high and .84 × rack depth wide.
Four clamp straps/returns tie it to the existing side hoop. Twelve pegs enter
the card holes, with upturned tips retaining the packs. Pack-bottom anchors:
`x = width/2 - .065`, `y = .92 + row*.73`, `z = (column-1)*depth*.28`;
rotate each pack +90° around store Y so its front faces the rack's +X side.
These anchors can be reused by #204's future power-wing implementation.
#193's rack hardware and candy stock are reused; its optional local left-side
stock is on the opposite side of this attachment.

At default size, the complete addition (including fallback) lies in local
X [1.378, 1.500], Y [.815, 3.865], Z [-.690, .690] ft. The original 3 × 1.6 ft
floor footprint, counter offsets, navigation and selectable five candy rows
are unchanged. Backing-to-authored-tray clearance is .002 ft; cartons also
clear the backing. Procedural fallback trays narrow to width minus .17 ft
when the panel is enabled so they also clear it. The panel remains below the
rack's 4.028 ft top and well below both tested store ceilings.

`CandyDisplay` owns the attachment's disposer. GLB failure keeps volumetric
packs and the support hardware. Late loads after disposal release imported
resources; live installation refreshes shadows and requests rendering. All
owned geometries, materials, instance buffers and the canvas texture are
released during rebuild/disposal. No per-frame work or new interaction is added.

## Verification and public photographs

- `npm test && npm run build`: 680 tests pass; build exits 0.
- `node tools/verify-candy-rack.mjs`: original stock support raycasts, custom
  rack dimensions, loading failure and teardown pass. Its Three import now
  follows Vite's resolved URL, including shared/symlinked node_modules.
- `node tools/verify-candy-dispenser.mjs /tmp/candy-dispenser-evidence`:
  real GLB loading, shared draw count, dimensions, tray clearance, disposal,
  failure fallback, late disposal, both installed counters and clerk-path audit.
  For slower software-rendering hosts, use `--studio-only`, then
  `--store-only --preset=standard` and `--store-only --preset=usquare-counter`
  with the same output directory. The harness rejects any user-assets beyond
  the public README. Each counter has zero candy-related layout violations.
- Export test verifies numerical feet, all named roles, finite UVs/normals,
  geometry budget, peg anchor and an actual open peg hole by raycasting.

Photographs and machine-readable bounds/navigation evidence are in
[`screenshots/candy-dispenser`](screenshots/candy-dispenser/). Product front,
side and rear use the exact runtime mesh/materials. Supplier support images
show the existing host; cartons are hidden only in the rear support diagnostic
so the backing and joins can be inspected. Installed photographs use 5.5 ft
eye height. Before views hide only the new attachment at the same camera;
footprint views overlay the unchanged host bounds in green.
