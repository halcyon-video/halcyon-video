# store-wall — real photo-scanned warm painted plaster

Skins the interior walls (`wallMat` in `src/store-shell.ts`), replacing the
procedural `createWallTextures()` orange-peel drywall when installed. The scan
is a neutral warm off-white plaster; its colour map is multiplied by the
"Wall Paint" setting (`bb_wall_color` in `src/settings.ts`, values in
`WALL_PAINT_OPTIONS` — `src/themes.ts`): 'auto' (default) follows the era's
`theme.palette.wall`; the other options pin a fixed swatch regardless of
theme ('white' is the scan's own natural tone, an identity ×#ffffff
multiply). The wall's baked contact-AO gradient (`aoMap`) is left untouched.

## Source
- **ambientCG "Plaster002"** — https://ambientcg.com/view?id=Plaster002
- License: **CC0 1.0 (Public Domain)**. Pack: `Plaster002_2K-PNG.zip`.
- A clean, warm cream troweled plaster with fine directional trowel striations —
  reads as real painted wall relief without the peeling/grunge of the damaged
  PaintedPlaster scans.

## Files
| here            | from pack                             | color space |
|-----------------|---------------------------------------|-------------|
| `color.png`     | `Plaster002_2K-PNG_Color.png`         | sRGB        |
| `normal.png`    | `Plaster002_2K-PNG_NormalGL.png`      | linear (OpenGL/three.js normal convention) |
| `roughness.png` | `Plaster002_2K-PNG_Roughness.png`     | linear      |

Tiled at 9 ft per texture tile (`wallFeetPerTile`). Displacement/AO from the
pack are unused. `theme.palette.wall` now only drives the procedural fallback
(uninstalled clones) and the CSS accent vars.

## Shipped default

This copy is the 1K default the repo ships (downscaled from the 2K pack).
Drop the full-res set into `public/user-assets/surfaces/store-wall/` to override it.
