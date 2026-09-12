# New Release wall shelving — issue #311

Original Blender mesh construction for Halcyon's existing shelf layout. No downloaded meshes, textures, private reference files, or branded artwork are included.

The construction contract uses particleboard with beige vinyl laminate, eight tiers in eight-foot sections, high-backed angled shelves, and space for three rental cases behind a cover comfortably (four tightly). A separate capacity study demonstrates five shelves of eight facings; it is not a historical store recreation.

The reconstruction uses an **8 ft wide × 8 ft high × 0.70 ft deep** carcass, 3/4-inch tray boards, a 5° tray slope rising toward the customer, 0.65 ft high individual backs, wrapped end panels with toe recesses, and recessed price-card channels. Height, depth, angle, sheet thickness, edge profiles and hardware details are modeling assumptions, not measured historical specifications. Tier elevations match the existing scene: 0.42 through 6.545 ft at 0.875 ft intervals. This preserves clearance for the existing VHS cases and sign anchors.

- Editable source: `tools/models/new-release-wall.blend`.
- Deterministic authoring: `tools/models/new-release-wall.py`.
- Runtime: `public/models/new-release-wall.glb` (61,740 bytes, 744 triangles, 28 separate mesh parts).
- Metrics: `tools/models/new-release-wall-metrics.json`.
- Material roles: `BeigeVinylLaminate`, `BeigeVinylEdgeBand`, `SatinPriceChannel`; opaque PBR, zero metalness, no texture downloads.

Each swept part is a closed manifold solid with outward normals and UV islands. The channel recess is modeled geometry. Blender uses imperial display with scale length 0.3048; numeric coordinates remain feet, as the Three.js store expects. Authoring maps store `(x,y,z)` to Blender `(x,-z,y)`; glTF exports Y-up without a runtime unit conversion.

The hidden **Capacity study — NOT exported** collection contains eight facings per tier. The bottom five tiers share one neutral cover design; the upper three use other colors. Each facing has a cover plus three nominal 1.25-inch Amray cases; the rightmost column demonstrates four. This is an editable dimensional study, not a replacement for catalog artwork. The yellow wall and blue labels are also study-only; the live store owns its existing wall and brand signage.

`NrWallModelBatch` installs geometry at the existing local +Z wall-run anchors, repeats eight-foot board/back sections, trims a final partial section, and merges the result to three material draw calls per run. Catalog dividers retain their current positions and double-feature suppression. Their six-column merchandising bays are independent of eight-foot construction joints; the physical asset supports eight facings, while this issue does not change the catalog's allocation policy. The runtime retains the existing display/rental count rather than creating invented rental inventory. Timber formats keep their existing material path.

The deeper run dimension also feeds corner insets and the cover hinge. Stock height follows the new sloped support plane. Fallback boards have matching depth and slope; original meshes remain hidden collision proxies after successful loading. Missing/malformed exports leave fallback visible, disposed scene geometry cancels pending adoption, and imported templates are released after merging. Adopted meshes/materials use normal scene teardown.

Regenerate from the repository root (absolute script path is needed by the ThinkPad Flatpak CLI):

```sh
blender -b -t 2 -P "$(pwd)/tools/models/new-release-wall.py"
# Also render the capacity study:
blender -b -t 2 -P "$(pwd)/tools/models/new-release-wall.py" -- --render /tmp/new-release-wall.png
node tools/verify-nr-wall.mjs /tmp/nr-wall-verification
npm test && npm run build
```

The browser verification renders the real installer in an isolated yellow-wall scene, including two full sections and a one-foot trimmed section. It is not a screenshot of a populated production catalog. Asset tests check tier/section dimensions, slope, usable capacity, finite UVs/normals, materials, draw-call merging, fallback behavior and disposal during loading.
