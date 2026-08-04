# store-sidewalk — real photo-scanned exterior concrete sidewalk

Skins the storefront sidewalk slab (`sidewalkMat` in
`src/exterior-environment.ts`), replacing the procedural
`createConcreteSidewalkTexture()` when installed. The real pack also adds a
normal + roughness map the procedural version didn't have.

## Source
- **ambientCG "Concrete048"** — https://ambientcg.com/view?id=Concrete048 —
  smooth, light, uniform floor concrete.
- License: **CC0 1.0 (Public Domain)**. Pack: `Concrete048_2K-PNG.zip`.

## Files
| here            | from pack                          | color space |
|-----------------|------------------------------------|-------------|
| `color.png`     | `Concrete048_2K-PNG_Color.png`     | sRGB        |
| `normal.png`    | `Concrete048_2K-PNG_NormalGL.png`  | linear      |
| `roughness.png` | `Concrete048_2K-PNG_Roughness.png` | linear      |

## Shipped default

This copy is the 1K default the repo ships (downscaled from the 2K pack).
Drop the full-res set into `public/user-assets/surfaces/store-sidewalk/` to override it.
