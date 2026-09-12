# Back-counter office organizer kit (#279)

Original generic hardware based on the construction visible in [Flickr photo
2427655437](https://www.flickr.com/photo.gne?id=2427655437). The photo was retrieved and inspected locally: forward-readable
signage establishes orientation; seven approximate tray levels, a calculator,
pen cup, bulletin board and right-hand clipboard partition are visible. The
clerk occludes the center and hidden sides. No pixels, staff information, logos
or faithful printed skins from that photo are bundled. The reference remains in
ignored `scratch/reference/`; public paper faces are separate blank solids.

## Authoring and asset contract

Rebuild from the repository root (absolute path accommodates the ThinkPad's
Flatpak Blender launcher):

```sh
blender -b -t 2 -P "$PWD/tools/models/counter-office-kit.py"
```

- Editable source: `tools/models/counter-office-kit.blend`.
- Reproducible scripted mesh authoring: `tools/models/counter-office-kit.py`.
- Runtime: `public/models/counter-office-kit.glb`, adjacent JSON cost record.
- Feet: Blender Imperial display, scale length 0.3048. Numerical coordinates
  deliberately export unchanged to Halcyon's feet-based world (not SI meters).
  Blender `(x, -store_z, height)` becomes runtime X right, Y up, Z rearward.
- Origin is the worktop contact plane. Trays and calculator face local −Z.
  Left/right equipment order is defined from the clerk facing +Z.
  Named empty anchors: `anchor_worktop` (0,0,0), `anchor_bulletin`
  (-0.2,1.25,0.6), `anchor_clipboard` (-1.73,1.32,0.04), in runtime XYZ feet.
- Trays: 10 × 13 inch nominal floor, 0.012-foot molded wall, 2.5-inch pitch,
  seven levels, socket rails and separate letter-size paper stack inserts.
  Continuous floor/three-wall topology, solidified with eased edges; open front.
- Calculator: 7.8 × 9 inches, fitted pan/deck seam, sloping top, 20 raised keys,
  separate bezel/LCD and rubber feet. Cup: hollow wall and bottom, five pens
  with separate pocket clips. Clipboard: thick hardboard, blank page, bent
  spring-steel jaw, hinge knuckles and backplate. Cork core and four-piece thin
  surround attach to a supported back/right partition with base channels.
- Footprint estimates are MEDIUM confidence from standard letter paper;
  unseen construction, depths and mounting details are LOW-confidence generic
  interpretations, not a claimed manufacturer-exact reproduction.
- All solid source edges pass manifold checks. Every export mesh has finite
  normals, positions and smart-projected UV islands. Printed faces remain
  separate from hardware for future local skins.
- Named roles: `OfficeABS`, `OfficeCalculator`, `OfficeKey`, `OfficeDisplay`,
  `OfficePaper`, `OfficeCork`, `OfficeBoard`, `OfficeMetal`, `OfficePartition`,
  `OfficeAccent`. Runtime replaces Accent with the active theme primary color.
  Other materials represent generic physical substances. No text or logo is
  required, so no alternate font or improvised LogoSpec is introduced.

The complete footprint is 3.4692 × 1.2030 feet and its height is 2.04 feet.
The optimized public asset is 410,292 bytes, 10,004 rendered triangles, 12
material/geometry draw batches and zero textures. It exports 43 mesh nodes;
34 repeated objects (seven trays, seven paper inserts, twenty keys) use three
instance batches in the live store. Editable source objects stay separate.

## Placement and lifecycle

`counterOfficeKitAnchor()` in `src/store-fixtures-config.ts` derives the origin
from the real entrance's counter datum: `(cx + 2.1, 3.54, backZ - 0.85)`.
`src/entrance/index.ts` installs it through the entrance's `FixtureContext` only
for a dressed shield counter. U-square has no rear ledge; the independent desk
has no enclosed nook. Those formats deliberately receive no unsupported kit.
The two counter finish variants share the same contact height.

Default installation occupies approximately X 11.33–14.80, Y 3.54–5.58,
Z 7.19–8.40 feet, inside the rear band (X 6.2–15.8, Z 7.0–8.5).
Thus it adds no floor obstacle, consumes no additional clerk walking width,
and cannot obstruct the customer terminal or keyboard on the inner island.
The top is below even the seven-foot vestibule doorway datum. The neighboring
rear information board ends near X 11.2; the office kit starts beyond that.
The cork/clipboard partitions include their own supported channels rather than
floating against the glass.

The loader uses `assetUrl`, retains generic geometry if the GLB fails, rejects
late results after entrance removal, and releases owned geometry, materials,
textures and instance buffers at the entrance removal boundary. Repeated GLB
meshes become `InstancedMesh` batches; unique hardware is joined by material in
export while the source retains individually named parts. Successful loading
requests both shadow refresh and an on-demand frame. No stock slots,
interactions or navigation obstacles are added.

## Verification

`tests/counter-office-kit.test.ts` parses the shipped GLB using Three's loader
and verifies scale/bounds, seven shared trays, anchors, UVs/normals, roles and
asset/triangle budgets. The Blender generator asserts manifold solid edges.

`tools/verify-office-kit.mjs` captures the actual running demo store with clean
local settings (corporate shield, bb-1993, daytime; `OFFICE_THEME` overrides the era) and refuses a tree containing private user-assets. It verifies containment
inside the live counter navigation footprint, separation from loaded terminal
and signage bounds, and exclusion of unsupported counter shapes. Run Vite on
port 4279, then `node tools/verify-office-kit.mjs`. Photographs and measured
installed metrics are written to `scratch/publicity-kits/issue-279/` and copied
to the task outbox. The fixture is static: it adds no per-frame update work.

Final inspected evidence: before/installed eye-level, front, side and rear
photographs, plus `footprint-plan.svg`/`.png` generated from the live navigation
rectangles and model bounds by `tools/office-footprint.mjs`. The calculator's
high display faces away from the clerk; all keys stay over its fitted pan.
The clipboard jaw reaches its paper and through-rivets connect its backplate
to the board. Live bounds clear both loaded terminals and the bb-1993 rear
information board (0.2175 feet of X clearance to that board).
