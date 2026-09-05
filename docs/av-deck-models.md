# Screening-room VCR and DVD player

These original Halcyon models fill the previously missing `vcr.glb` and
`dvd_player.glb` slots. They are generic period designs, not replicas of a
named manufacturer's equipment. No downloaded geometry, imagery, textures,
or trademarks are used; the repository license applies.

Regenerate both runtime assets and their editable Blender collections:

```sh
blender -b -t 2 --python tools/models/av-decks.py
```

The source is `tools/models/av-decks.blend`. It opens with the VCR visible;
enable the DVD collection to edit that variant. Separate named parts preserve
the casing, cassette flap or tray, display, switches, feet and rear connections.
The authoring script uses Blender mesh sweeps, bevels and Boolean apertures.

## Construction and coordinates

Both decks have a continuous bent sheet-metal top and side cover, a fitted
bottom pan, a separate front fascia, and a rear connector panel. Ventilation
cuts pass through the metal, with a dark baffle below the top vents. Recessed
front apertures hold the tray/flap, lens and switches. Rubber feet support the
pan; the rear has bored signal sockets, an inset power connection and screws.
The generator checks closed parts for manifold edges and positive volume;
flat lettering is an intentionally open surface. Every part has UVs and named
material roles. Runtime exports batch parts by finish; darker aperture walls
remain separate draw primitives. There are no image textures.

Units are feet. Blender `(x, -store_z, height)` exports to the store's Y-up,
negative-Z-facing axes. The origin is centred at the soles of the feet. Nominal
bounds are 1.4 × 0.32 × 0.95 feet for the VCR and 1.4 × 0.18 × 0.85 for the DVD
deck; rear sockets and front controls add less than 0.015 feet of depth. The
existing prop loader centres the depth and seats the feet at zero. Both sit
on the existing stand's middle shelf at 0.66 feet, clear of the upper shelf.

`DeckDisplay` identifies the recessed lens material. The registry exposes its
rectangle, and the room parents the live clock to the deck instance, inset
within that rectangle and 0.0008 feet ahead of its glass. The primitive
fallback also exposes a correctly sized display, including the shorter DVD
face. The exported `DeckMediaMouth` attachment point centres the insertion
animation on the flap/tray; the existing approach distance is retained.
The meshes are static: tray or flap mechanical animation is not added.

## Measured cost and verification

| Asset | Triangles | Draw primitives | GLB bytes | Textures |
|---|---:|---:|---:|---:|
| VCR | 10,264 | 9 | 647,484 | 0 |
| DVD player | 10,074 | 10 | 645,104 | 0 |

The existing prop cache owns shared model geometry and materials. Room
instances own their clock planes and textures; removing a room releases those
without freeing the cached decks. No new loader or cache is introduced.

`tests/av-decks.test.ts` parses the actual GLBs with Three.js and checks their
axes, stand clearances, feet, display and insertion anchors, UVs, finite
attributes, and resource limits. Browser verification additionally exercises
both media selections, deliberate missing-file responses, shared instances,
clock alignment, and room/cache disposal. Before/after and front/rear room
photographs were inspected using the existing screenshot harness. The project
build and full test suite pass.
