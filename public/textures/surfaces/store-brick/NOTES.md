# store-brick — real photo-scanned exterior facade brick

Skins the exterior facade brick (`brickMaterial` in `src/store-shell.ts`, used
by the knee-wall veneer and `buildStorefrontFacade`), replacing the procedural
`createBrickTexture()` running-bond when installed. Loaded for every theme.

## Source
- **ambientCG "Bricks051"** — https://ambientcg.com/view?id=Bricks051 — clean
  orange-red modern running-bond brick.
- License: **CC0 1.0 (Public Domain)**. Pack: `Bricks051_2K-PNG.zip`.

## Files
| here            | from pack                        | color space |
|-----------------|----------------------------------|-------------|
| `color.png`     | `Bricks051_2K-PNG_Color.png`     | sRGB        |
| `normal.png`    | `Bricks051_2K-PNG_NormalGL.png`  | linear      |
| `roughness.png` | `Bricks051_2K-PNG_Roughness.png` | linear      |

Tiled at `BRICK_FEET` (4 ft) per texture tile, matching the procedural scale.

## Shipped default

This copy is the 1K default the repo ships (downscaled from the 2K pack).
Drop the full-res set into `public/user-assets/surfaces/store-brick/` to override it.
