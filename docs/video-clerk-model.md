# Rigged, Blender-rendered video clerk

The default clerk is an original stylized employee with a chestnut bob, large
expressive eyes, fixed khakis and brown shoes. The owner approved the original
concept artwork. Meshy generated a textured base from the isolated front
reference, followed by an initial skeleton and walking motion. Blender supplies
the final continuous skin binding, editable wardrobe, working poses, and sprites.
The visible result remains a directional flat sprite; no character mesh is
loaded by the store.

## Source and reproduction

- `tools/models/video-clerk-source.glb`: preserved Meshy textured base, skeleton
  and walking motion; the authoring script reads this without modifying it.
- `tools/models/video-clerk.py`: Blender authoring and deterministic rendering.
- `tools/models/video-clerk.blend`: packed editable result, with Polo and Oxford
  collections and the retained walking action.
- `tools/models/video-clerk-reference.png`: original approved generation input.
- `public/textures/clerk/{color,livery}.png`: polo sprite atlases.
- `public/textures/clerk/oxford/{color,livery}.png`: Oxford sprite atlases.
- `src/clerk-uniform.ts`: garment selection and independent primary/trim tinting.

Use `blender -b -t 4 --python tools/models/video-clerk.py -- --preview` for
pose previews. With a Blender installation that changes its working directory,
pass the absolute script path. Run `node tools/render-clerk.mjs` for both complete
sprite sheets and the existing sheet contract checks. `BLENDER_PATH` can select
a particular installation; `CLERK_RENDER_THREADS` defaults to four. Intermediate
images and the frame manifest are written under `scratch/clerk-render`.
Blender 5.2 was used for this version. The host wrapper keeps browser-based
atlas stitching outside a sandboxed Blender installation.

## Geometry, rig and garments

The source base has 30,521 triangles and one 4096-square base-colour texture.
Coincident vertices at imported attribute seams are welded while preserving
per-corner UVs. Blender Automatic Weights binds the resulting 15,280-vertex
character to 22 deform bones and two head helpers. Imported bone display lengths
are corrected to the actual joints; all exported body and garment weights are
explicitly normalized. The model uses a real armature modifier, rather than
reconstructing separate posed body meshes for each image.

Both outfits share the same face, hair, body dimensions, skeleton, khakis and
shoes. The Oxford uses a fitted version of the continuous arm surface, plus
separate wrist cuffs, full button placket and chest pocket. Polo cloth and its
collar/cuffs have separate named material roles. Oxford cloth is a pale version
of the active brand's primary colour. The store's Clerk Uniform setting selects
the garment; colour changes do not regenerate the character.

This is a body rig. Fingers and the face do not have individual animation
controls; the current sprite actions use body and arm gestures. Generated base
geometry and texture provenance must not be described as wholly hand-sculpted.

## Stable scene contract

Blender presentation units are feet, Z is up, and the character faces -Y. The
origin and common foot anchor are at floor level. The orthographic camera retains
the 5.7-foot vertical span used by the store billboard. Navigation footprints,
heading selection, interaction radius and animation timing remain unchanged. New
clerks start at a walkable point beside the measured register, including after a
uniform change, rather than the historical coordinate inside the counter.

Each atlas is 4096 by 1920, with 256 by 384 cells: five directional rows, front
through back at 45-degree increments, heading screen-right. The renderer mirrors
the other three octants. Sixteen columns hold idle (2), walk (4), high shelving
(2), middle shelving (2), crouching (2), talking (2), and typing (2).

Colour images have transparent backgrounds and neutral cloth. The corresponding
unlit livery pass encodes primary cloth in red, contrasting polo trim in green,
and fixed surfaces in black. The two passes use identical geometry, camera and
poses, including occlusion by hands and hair. Recolouring runs once at load time
and preserves the original alpha. There are no added per-frame allocations or
sprite draw calls. Mipmaps remain disabled to prevent neighbouring-cell bleed.

Theme-specific and default user sprite sheets retain their existing priority.
Failed or invalid shipped atlases retain the procedural fallback. A late-loading
atlas is disposed when its clerk has already been removed.

## Provenance and verification

The approved source image has SHA-256
`0f5ed356aaacf1a9d5bd7a25003b13bedec187997c6180d6738a5560837cc4c0`.
Meshy generated one textured candidate for 30 API credits and the initial rig
for five; generation used Meshy 7.1, an A pose, no image style enhancement,
4K colour texture and a 30,000-face remesh target. No additional identities or
outfit bodies were generated. API credentials and signed download URLs are not
part of the repository.

Before landing, run the existing `clerk-sheet check` for both colour atlases,
`npm run check`, and the app's clerk/interaction/navigation verification. Review
both garments in the actual store at a phone viewport and preserve screenshots
with the change. The four walk samples retain the existing runtime contract;
they are sampled from the stored continuous walking action, not four unrelated
pictures.
