# store-shelf — real photo-scanned white melamine laminate

Skins the store shelving (`sharedShelfMat` in `src/store-shell.ts`), replacing
the procedural `createShelfTextures()` laminate when installed. The material
keeps its warm off-white tint (`color: 0xf8f2e8`), so the neutral scan reads as
satin melamine. The New Releases backing panel (`nrBackingMat`) shares the
shelf normal/roughness, so it takes the real normal + roughness too (keeping its
own baked bay-shade albedo).

(The counter and return-slot also call `createShelfTextures()` in their own
modules; those still use the procedural laminate — swap them the same way if
wanted.)

## Source
- **ambientCG "Plastic013A"** — https://ambientcg.com/view?id=Plastic013A —
  clean warm-white fine-grain plastic/laminate.
- License: **CC0 1.0 (Public Domain)**. Pack: `Plastic013A_2K-PNG.zip`.

## Files
| here            | from pack                           | color space |
|-----------------|-------------------------------------|-------------|
| `color.png`     | `Plastic013A_2K-PNG_Color.png`      | sRGB        |
| `normal.png`    | `Plastic013A_2K-PNG_NormalGL.png`   | linear      |
| `roughness.png` | `Plastic013A_2K-PNG_Roughness.png`  | linear      |

## Shipped default

This copy is the 1K default the repo ships (downscaled from the 2K pack).
Drop the full-res set into `public/user-assets/surfaces/store-shelf/` to override it.
