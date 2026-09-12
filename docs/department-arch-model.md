# Interior department portal

An original fitted portal for the corporate exposed-ceiling setting. A broad,
painted rectangular-section arch sits on separate punched box posts and fitted
saddles. The complete ellipse, opposite support, hidden section and floor shoes
are engineering interpretations, not a surveyed historic installation. Private
reference measurement notes and images are kept outside this repository.

## Source and geometry

- Editable source: `tools/models/department-arch.blend`.
- Reproduce with Blender: `blender -b -t 2 --python tools/models/department-arch.py`.
  Authored and exported with Blender 5.2.0 LTS on the ThinkPad.
- Runtime: `public/models/department-arch.glb`; costs in the adjacent geometry JSON.
- Units are feet; origin is floor level halfway between post centres. Blender
  `(x, y, z)` becomes store `(x, z, -y)`. No runtime unit conversion.
- Extents: X ±2.57, Y 0–10.25, Z ±0.25 ft. Post centres X ±2.25.
- Post face 0.30 ft, depth 0.25 ft. Arch face breadth 0.50 ft, return 0.25 ft.
  Spring 7.50 ft, crown 10.25 ft. These are fitted design dimensions; they do
  not establish unseen reference dimensions. Confidence in hidden dimensions is low.
- Real front slot mouths are 0.11 × 0.03 ft at 0.333 ft pitch. A hollow interior,
  closed ends, beveled mouths and finished outside edges provide real depth.
- Model has 12,460 rendered triangles, 7,520 unique triangles, nine mesh nodes,
  three material roles and zero embedded textures. Runtime batches repeated
  posts, shoes and saddles: six mesh draws, including three instanced batches.
- Closed modeled parts are checked for manifold edges and recalculated normals
  by the authoring script. Smart-projected UV islands are exported on every part;
  runtime adds the existing micrograin material's second UV channel.

## Material and attachment contract

`ArchPaint` follows the active palette accent; `PostPaint` and `JointPaint` use
darkened active primary. All are nonmetallic paint with roughness 0.46–0.58 before
the existing subtle micrograin finish. Halcyon's cream accent is intentional;
an installed brand's palette determines its own finish. No lettering or marks
are baked into geometry or materials.

Rear attachment anchors on the left post are `(−2.25, 6.25, −0.23)` for a
medallion and `(−2.25, 3.75, −0.23)` for a lower panel, in store axes. The fitted
mount bosses end at Z −0.215. These are attachment provisions, not automatically
installed graphics: the adjoining New Releases bay retains its existing printed
art slots. Any future attached panel must be included in a new clearance check.

## Supported placement and lifecycle

`departmentArchPlacements()` derives the position from the actual front end of
the left-wall New Releases bay. Only corporate stores with exposed ceilings
at least 13.5 ft high and a bay at least 4 ft long are admitted. Both 13.5 and
18 ft ceiling settings are supported. Acoustic-tile and mom-and-pop stores omit
it. A smaller library can use it only if the same fit checks pass.

The post feet have two separate 0.64 × 0.50 ft footprints. The minimum opening
between shoes is 3.86 ft; above them it is 4.20 ft. Conservative walking proxies
retain the 3.86 ft opening through post height. The lowest conservative overhead
bound is 7.48 ft, above the validator's 6.667 ft minimum; maximum fallback height
is 10.27 ft. The fitted feet clear the host bay end by 0.35 ft. The fitting check
rejects any support or access-lane intersection with adjoining aisle/fixture
footprints or room bounds. It never clears space by moving another fixture.

`DepartmentArch` uses `installDisplayModel`, the base-path resolver and the
existing equipment finish. A solid beveled fallback remains until successful
loading, and remains on a missing GLB. The model requests render and shadow
refresh. Root removal disposes the load, shared owned finishes, geometry and
grain textures; an in-flight callback is cancelled by the established loader.
Collision proxies are deactivated on removal.

## Verification

Run `node --experimental-strip-types --test tests/department-arch.test.ts` and
`npm run build`. The tests cover host/ceiling gates, floor obstructions, room
bounds and invalid vertical clearances. In-app front, side, rear, top and
installed eye-level photographs are captured with the existing asset-shot and
shot tools. Public evidence is kept in `scratch/publicity-kits/issue-283/` in
the owner checkout, captured from the camp without user-assets.
