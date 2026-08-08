# table-wood — real photo-scanned dark-blonde hardwood

Skins the living room's coffee table (`placeCoffeeTable` in `src/back-room.ts`).
The prop GLB is Kenney's "Table Coffee Glass": a dark frame with a GLASS top,
which in this room's single-lamp light read as pale celadon laminate rather
than glass. Every surface takes the board, pane included — a glass top over
wood legs is the thing being replaced, not a look worth keeping half of.

Procedural grain was tried first and abandoned — three passes (drawn strokes,
radial growth rings, warped straight grain) each read as corduroy, sand
ripples, or burl at the scale the GLB's tiled UVs impose. A real scan was the
right answer, same as the carpet and brick before it.

## Source
- **ambientCG "WoodFloor043"** — https://ambientcg.com/view?id=WoodFloor043
- License: **CC0 1.0 (Public Domain)** — free for any use, no attribution required.
- Pack: `WoodFloor043_1K-PNG.zip`.

## Files
| here            | from pack                           | color space |
|-----------------|-------------------------------------|-------------|
| `color.png`     | `WoodFloor043_1K-PNG_Color.png`     | sRGB        |
| `normal.png`    | `WoodFloor043_1K-PNG_NormalGL.png`  | linear      |
| `roughness.png` | `WoodFloor043_1K-PNG_Roughness.png` | linear      |

Normal is the **GL** convention (three.js), not DX.

## Shipped default

1K rather than 2K: it is one prop, seen from a fixed couch position, in a dim
room. The extra tier buys nothing here, and the room loads on entry. Drop a
set into `public/user-assets/surfaces/table-wood/` to override it.

No `.ktx2` sibling yet — unlike the store surfaces, this set ships PNG-only, so
`src/surface-textures.ts` soft-falls to the `.png` for it. Run
`tools/encode-surfaces.mjs --only table-wood` with `toktx` installed to add one.
