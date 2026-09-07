# Blender-rendered video clerk

The default clerk is an original stylized adult retail employee: chestnut bob,
hazel eyes, a collared house polo, name badge, cotton khakis and canvas sneakers.
The model, face and clothing were authored in Blender using the reproducible
mesh script; no third-party character, model, texture, font or likeness is used.

## Source and reproduction

- Editable model: `tools/models/video-clerk.blend`.
- Mesh and pose authoring: `tools/models/video-clerk.py`.
- Runtime assets: `public/textures/clerk/{color,livery}.png`.
- Runtime palette application: `src/clerk-rendered-atlas.ts`.

Run `blender -b -t 6 --python tools/models/video-clerk.py -- --preview` for
front and three-quarter studio views. Run with `--render` to reproduce all
frames, both atlases, and the existing `clerk-sheet` contract check. Preview and
intermediate frames go to `scratch/clerk-render/`. Blender 5.1 and Cycles were
used. The .blend is saved before rendering the material-ID pass, so it retains
its editable, named materials and useful neutral pose.

The source has named heading, body, head, shoulder, wrist and shoe pivots. The
script constructs continuous limb surfaces around the posed joints and welds
the trouser seat and legs into one smooth cloth shell. This is scripted mesh
authoring; the source does not claim to be an animation-ready skinned rig.
Every modeled surface has UVs for later painting. The runtime delivery format
is PNG sprites, not a live animated 3D mesh.

Forward working poses explicitly pronate both wrists: typing and low/middle
stocking show palms down with the thumbs facing one another, rather than
rotating the neutral palm-forward hands upward. A small wrist pitch keeps the
fingers readable instead of presenting two flat palm ends to the camera. Cheek
warmth and freckles follow the face surface rather than hovering in front of
it. The bob uses a closer, flatter crown, two broad locks per side and subdued
rough highlights instead of the former spherical shell plus eight glossy rope
locks.

## Stable scene contract

Blender units are feet, Z is up, and the character faces -Y. Her origin is at
floor level between her shoes. The orthographic camera has a 5.7-foot vertical
span and a common foot anchor. Standing hair height is approximately five
feet; upper-shelf reaches stay within the same frame. The store's existing
5.7-foot billboard, navigation footprint, heading calculation, interaction
radius, timing and soft grounding shadow remain in charge.

Both atlases are 4096 by 1920, with 256 by 384 cells: five directional rows,
front through back in 45-degree increments, heading screen-right. The runtime
mirrors the other three octants. Sixteen columns hold idle (2), walk (4), high
stocking (2), middle stocking (2), crouching (2), talking (2) and typing (2).

Color is a transparent Cycles render. Livery is an identical, unlit coverage
render: white uniform and case stripe, black other surfaces. Occlusion is
rendered by Blender, so a hand or the hair in front of the polo is not tinted.
The loader applies the active primary color once at load time, preserving skin,
hair, trousers, badge and the original alpha. There is no extra per-frame work
or additional sprite draw call. Both textures disable mipmaps when installed to
prevent neighboring atlas cells from bleeding.

Existing theme-specific and default user sprite sheets keep their priority.
If neither exists, the rendered clerk loads; if its assets fail or violate the
grid, the procedural clerk remains available. Replacement preserves the live
UV cell, and a late texture is disposed if its clerk has already been removed.
The older procedural template and skeleton export are retained for users of
that authoring workflow; those exports describe the procedural fallback.

## Verification

Use `node tools/clerk-sheet.mjs check public/textures/clerk/color.png` for the
whole sheet's grid, coverage and foot-anchor checks. In-scene verification uses
the existing screenshot tool's `clerk` state, yaw and action parameters, and
the `clerkpath` and `clerktalk` checkpoints. Production builds must pass
`npm run build` and the repository test suite before landing.
