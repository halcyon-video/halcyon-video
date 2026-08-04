# store-carpet — real photo-scanned floor carpet

Skins the store floor (`buildStore` in `src/store-shell.ts`), replacing the
procedural `createCarpetTextures()` navy loop-pile when these files exist.

## Source

- **ambientCG "Carpet012"** — https://ambientcg.com/view?id=Carpet012
- License: **CC0 1.0 (Public Domain)** — free for any use, no attribution required.
- Downloaded pack: `Carpet012_2K-PNG.zip` (2K PNG maps).

## Files (renamed from the pack)

| here            | from ambientCG pack                 | color space |
|-----------------|-------------------------------------|-------------|
| `color.png`     | `Carpet012_2K-PNG_Color.png`        | sRGB        |
| `normal.png`    | `Carpet012_2K-PNG_NormalGL.png`     | linear (OpenGL/three.js normal convention) |
| `roughness.png` | `Carpet012_2K-PNG_Roughness.png`    | linear      |

Displacement + AO from the pack are unused (the floor gets its AO from the
in-engine `bakeFloorAO` pass).

## Shipped default

This copy is the 1K default the repo ships (downscaled from the 2K pack).
Drop the full-res set into `public/user-assets/surfaces/store-carpet/` to override it.
