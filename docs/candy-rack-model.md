# Queue candy rack (#193)

CandyDisplay remains the existing queue rack at its existing shield and square-U
counter anchors. Five candy IDs, labels, catalog entries and selection flow are
unchanged. Default stock remains 175 cartons (five instanced draws); the footprint
remains 3 × 1.6 feet. Desk stores still omit this rack. Power-wing and dispenser
options retain their existing gates and ownership.

## Public model and authoring contract

The public model is an original generic construction, not a photographic replica.
It retains bent side hoops, cross ties, rear diagonal, rounded sheet trays,
bent-wire retainers, welded stanchions, sled feet and rubber pads. This pass
models depth directly instead of stretching a shallow export, keeping round wire
sections at the default size. Two underside bearer rails per tray now meet the
sheet underside and extend to the side-frame supports. These are original
engineering choices, not claims about hidden reference joinery.

- Source: `tools/models/candy-rack.blend`; script: `tools/models/candy-rack.py`.
- Exports: `public/models/candy-rack-{frame,tray}.glb`.
- Rebuild: `blender -b -P "$(pwd)/tools/models/candy-rack.py"` (the installed CLI
  wrapper requires an absolute script path). Blender 5.2.0 LTS was used.
- Feet are the numeric scene unit, with Blender display scale .3048 m/unit.
  Blender `(x,-store_z,height)` exports directly to store `(x,y,z)`.
  Frame origin is floor-centered; normalization is **3 × 1.6 ft**. Frame height
  is 4.028 ft including wire radius. Extra rows retain the existing height scaling.
- Tray origin is the top support plane, y=0; deck underside is -.026 ft, bearer
  underside -.054 ft. Runtime rotates -12° and translates to `.615 + row*.7`.
  Stock uses the same support transform. Trays share exported geometry.
- Every source part has smart-projected UVs, a descriptive name, units and
  provenance metadata. Closed source components pass manifold assertions.
  Source tray templates are hidden in viewport AND render; linked tiers are visible.

## Physical finish and ownership

`RackSteel` is powder-coated steel: linear RGB (.09,.095,.105), metalness .25,
roughness .58. `RackFeet` is rubber: RGB (.09,.09,.09), metalness 0, roughness .85.
Blender materials contain editable fine-noise bump nodes. These procedural nodes
are not glTF image textures: the app supplies the physical finish through
`createCandyRackFinish`, with deterministic grain in a 128 × 128 RGBA texture.
Red drives bump (.0012 ft), green modulates roughness, repeated 5× over UVs.
Mip filtering keeps the fine relief stable at distance. No photographic texture,
branding, baked lighting, or pitch-black base albedo is used.

The fixture owns the shared grain texture and steel material, including fallback
use. Imported rubber borrows that texture; loader teardown owns its material.
The loader still replaces steel by role and owns imported geometry/materials.
A failed/partial local pair falls back to the public pair; a failed public pair
keeps the procedural fallback. Late results after disposal release their resources.
Successful installation refreshes rendering and shadows.

| Public resource | Triangles | Material primitives | GLB bytes |
| --- | ---: | ---: | ---: |
| Frame | 628 | 2 | 29,528 |
| Tray template | 612 | 1 | 30,600 |
| Default hardware (five trays) | 3,688 | 7 draws | 60,128 total download |
| Existing main stock | 2,100 | 5 draws | procedural |

Hardware adds one 65,536-byte texture allocation (about 85.3 KiB with mipmaps),
zero extra HTTP texture requests. Existing stock uses five label maps. Hidden
fallback geometry stays allocated until fixture disposal. Optional dispenser
hardware is separately owned/budgeted by its existing implementation.

## Reference-based local counterpart

Issue #151 keeps reference-derived reconstruction in ignored user-assets.
The earlier private correction was recovered and regenerated with the current
surface authoring. Its pair installs at
`public/user-assets/fixtures/candy-queue-rack/candy-rack-{frame,tray}.glb`,
with editable source/script and provenance beside it and in the task outbox.
Its normalization is also 3 × 1.6 ft; no public/private depth scaling difference
remains. Local side stock still repeats three packets per row without adding a
selectable product. Frame: 1,240 triangles, two primitives, 65,968 bytes; tray:
612 triangles, one primitive, 30,664 bytes. Default local hardware is 4,300
triangles/seven draws; main and side stock bring it to 6,580 triangles/17 draws,
excluding the independent dispenser option.

Original stills `uOEIl5XaptY/f0262.jpg` (later compilation) and
`rUhRHo44CIA/f0063.jpg` (1993 Part II, visible tape 00:18:26:14) were inspected
from the recovered private archive. They support deep sloping stocked tiers and
side merchandising. They do not calibrate dimensions, wire gauge, feet, hidden
joinery or an exact tray deck construction. Neither confirms a separate short
1993 variant, so none is added. No source stills
or reference-derived mesh are committed.

## Verification and inspected evidence

- `npm test && npm run build`: passed, exit 0.
- `node tools/verify-candy-rack.mjs`: public and `CANDY_CHECK_PRIVATE=1` local
  loading, every carton-bottom corner raycast against actual exported trays,
  3-row 4 × 1 ft custom rack, unchanged row metadata, failure and late teardown.
  Grain texture disposal is included in the ownership checks.
- Asset tests check exported bounds, UVs, normals, albedo and budgets. Finish
  tests check deterministic grain, texture sharing and per-fixture independence.
- `node tools/photograph-candy-rack.mjs <out-dir>` captures the actual store at
  both counter anchors, plus loaded-side contact and isolated rear details.
  Set `CANDY_CHECK_PRIVATE=1` for the locally installed reconstruction.

The task outbox contains before, after-public and after-private photographs and
logs. Public views were captured before installing user-assets. Inspected side
views show boxes seated on trays; isolated rear views reveal ties, braces and
tray undersides that the counter hides in-store. The right-side dispenser panel
occludes that side, so useful contact views use the opposite side.

Candy layout violations are empty at both anchors. The square-U clerk audit
passes. The standard-counter audit records the same three initial
`structure:counter-inner-left` intrusions before and after (first .067 seconds);
this pre-existing clerk spawn issue is outside the rack change. It is recorded
in the evidence rather than presented as a passing full-store navigation audit.
