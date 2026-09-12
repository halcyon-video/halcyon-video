# Projection reel source artwork (#245)

Original generic reel, authored in Blender 5.2 with a structured annular mesh.
The film-reel-35mm archive lead was not available in the checkout, local project,
or supplied reference directories. The inspected reference is the existing
src/assets/awning-film-strip.png composition (reel silhouettes and low blue
collage). This is **not a measured period replica**. No owner photograph or trademark is included.

## Consumer and placement

The historical anchors were checked: storefront-facade.ts now builds architecture,
and wall-decor.ts builds a continuous film ribbon with portraits. Neither currently
depicts a projection reel. The existing reel artwork consumer is
src/flat/flat-store.ts, the flat store's fascia/awning. It now displays a transparent
collage composed from this model's alpha poses, retaining live brand lettering and
the original image as a one-shot error fallback. Existing DOM teardown owns the
image/listener; no asynchronous GPU resource is introduced. No extra floor fixture,
collision, wall decoration, or 3D mesh is installed.

## Model contract

- Feet: nominal diameter 1.25 ft (381 mm); overall depth approximately .156 ft
  (47.5 mm). These are design assumptions, not archive measurements.
- Origin: spindle centre. Blender XY is the flange plane; +Z faces front.
  glTF maps this to XZ flange plane, +Y spindle/front. No moving parts, scene
  attachment other than the spindle origin, or collision footprint.
- FrontStampedFlange and RearStampedFlange: five genuinely open tapered sector
  windows each, dished centre, formed rim and deburred edges. Rear profile mirrors
  the front so both stampings face outward.
- BoredCentralHub: .084 ft through-bore and stepped flange seating shoulders.
- OptionalFilmPack: removable annulus, .114 ft / 34.75 mm wide. The empty GLB
  excludes it; the wound variant includes it. Hidden in the saved source.
- StampedAluminum, HubMachinedMetal, OptionalWoundFilm are replaceable PBR roles.
  Every part has packed smart-project UV islands. Source checks recalculate outward
  normals and assert manifold edges per solid.

## Files and reproduction

The ThinkPad Blender wrapper changes working directory, so use an absolute path:

```sh
blender -b -t 4 -P "$PWD/tools/models/projection-reel.py"
python3 tools/models/projection-reel-art.py
```

tools/models/projection-reel.blend contains editable parts, optional film, lights
and orthographic camera. public/models/projection-reel.glb is the empty reel;
projection-reel-wound.glb includes film. Six 512×512 RGBA poses live under
public/models/projection-reel/: front, three-quarter, side, rear, stacked, wound.
The Pillow compositor emits src/assets/awning-projection-reel.png (1920×130),
using blue duotone alpha poses at the existing collage's scale and spacing.

## Cost and evidence

Empty model: 22,536 triangles, three meshes/material primitives, two PBR materials,
zero textures, 630,544 bytes. Film adds 1,024 triangles and one material primitive.
The awning loads only the approximately 84 KB PNG: no mesh requests, added WebGL
draw calls, animation, or render-loop work. Decoded collage RGBA costs 998,400
bytes. Model metrics accompany the exports. The source samples curves for 512px
poses; no subdivision modifier or embedded render texture is exported.

tools/verify-projection-reel.mjs exercises the real demo flat store at 1440×1000
and 800×800, image-load failure, actual GLTFLoader front/side/rear WebGL views,
exported dimensions, UVs and resource counts. Start Vite on port 4245, then run
it with Node 22. Photographs and verification JSON are in the task outbox.
Before/after images show the actual flat-store consumer; side/rear WebGL images
are model inspection views, not evidence of a physical fixture. Period-reference
comparison remains unavailable.
