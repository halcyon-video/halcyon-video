# Customer information terminal surround (#280)

Delivered as a **placement-gated generic study**. The owner’s original Flickr
screenshot dated 2026-07-26 14-11-25 was inspected locally. It shows a black
display in front of pale perforated sides and a raised rectangular program
board with an upper-right circular badge. The photograph crops the bottom;
it does not establish a hinge, device base, counter, floor contact or mounting
height. The historical SiteKiosk/laptop description is not treated as proof of
device construction. No original reference or faithful printed skin is bundled.

This is not an exact replica. Panel depth, absolute dimensions, rear closure,
brackets, returns and fasteners are low-confidence generic construction choices.
No keyboard, laptop hinge, pedestal or floor stand has been invented. The lower
edge is a crop datum, not a claim about the bottom of the original enclosure.

## Files and reproduction

- `tools/models/customer-information-terminal.py`: scripted Blender mesh authoring.
- `tools/models/customer-information-terminal.blend`: separate editable, named parts,
  linked side-panel/fastener meshes, UVs, materials and attachment empties.
- `public/models/customer-information-terminal.glb`: original unprinted surround.
- `src/fixtures/customer-information-terminal.ts`: lifecycle integration, basic loading
  fallback, theme finishes, separate canvas print faces and generic display envelope.
- `tools/customer-information-terminal-preview.html`: isolated viewer using the real
  fixture registry and the preview placement from store config.

```sh
blender -b -t 2 -P "$PWD/tools/models/customer-information-terminal.py"
npm run dev -- --port 4380 --strictPort
# In another terminal:
node tools/verify-customer-information-terminal.mjs
```

Open `/tools/customer-information-terminal-preview.html` on that dev server.
The verifier requires `public/user-assets` to contain only its tracked README.
It captures front, side, rear, viewing-height and display-removed support views,
then exercises successful load, missing GLB fallback and removal during loading.
Its default evidence directory is ignored `scratch/customer-information-terminal`;
override with `TERMINAL_CHECK_OUT`. Port override is `TERMINAL_CHECK_PORT`.

## Geometry and attachment contract

One Blender coordinate unit is one foot (`IMPERIAL`, scale length 0.3048).
Blender `(x, y, z)` maps to runtime `(x, z, -y)` without runtime scaling.
Runtime +Y is up; +Z faces the customer; +X is customer-view right. The origin
is the center of the enclosure front at the lower crop datum. No moving parts.

| Item | Runtime feet / meaning |
| --- | --- |
| Surround bounds | X −0.86…0.93; Y 0…2.01; Z −0.420…0.021 |
| Overall surround | 1.79 W × 0.441 D × 2.01 H ft |
| Perforated side separation | 1.58 ft; sheets 0.006 ft (~1.8 mm) thick |
| Panel perforations | 6 × 18 real holes per side, 0.022 ft diameter |
| `crop_datum_NOT_floor` | (0, 0, 0); explicitly unconfirmed placement |
| `mount_display` | (0, 0.76, −0.035); front of generic mount plate |
| `mount_program_face` | (−0.07, 1.585, −0.330), facing +Z |
| `mount_badge_face` | (0.59, 1.67, −0.286), facing +Z |
| Generic display envelope | 1.40 × 0.93 × 0.045 ft; active screen 1.26 × 0.79 ft (~17.8 in diagonal) |

Every closed source part is welded and checked for manifold edges and outward
normals by the authoring script. Perforations have actual thickness walls.
Folded return profiles have hollow sheet sections; separate supports contact
the board and rear panel through spacers. These are estimated construction,
not source-verified hardware. Smart-projected UV islands cover all mesh parts;
runtime printed faces and the display use independent full-face 0–1 UVs.

The GLB merges the editable parts into **four material primitives, 14,704
triangles, 733,560 bytes, zero textures**. Repeated source panels and fasteners
share mesh data; the runtime batches them into those four draws. With the
display envelope and independent print faces, the viewer measured eight fixture
draws (nine including the grid). The runtime adds three canvas textures:
640×400 screen, 768×220 board and 256×256 badge (~1.87 MiB RGBA before mipmaps).
Metrics are recorded in `tools/models/customer-information-terminal-metrics.json`.

| Material role | Ownership / replacement |
| --- | --- |
| `EnclosurePowderCoat` | Neutral light gray, runtime material owned by fixture |
| `MountHardware` | Export-owned metal; released by shared display loader |
| `ProgramBackboard`, `PromotionalBadge` | Active theme primary/secondary palette |
| `ProgramPrint`, `BadgePrint` | Separate faces, active LogoSpec and bundled Outfit |
| `DisplayEnvelope` | Generic black proxy; not a historical device model |
| `CustomerInformationScreen` | Named replaceable informational screen; no backend or signup |

The public GLB is brand-free. Runtime signage uses the existing LogoSpec painter,
theme palette and bundled fonts. Font callbacks are guarded against disposal;
loaded model, fallback and print resources retain separate ownership.

## Placement gate and dependency coordination

The kind is registered but **absent from `DEFAULT_FIXTURE_PLACEMENTS`**.
`CUSTOMER_INFORMATION_TERMINAL_PREVIEW` is tooling-only, and `build()` requires
the explicit `assetViewer: true` option. There is no production enable switch,
floor collider, interaction target or navigation footprint. Browser verification
asserts zero default placements, zero registered colliders, a null footprint and
a closed build gate for ordinary placements. Existing store routes therefore
gain no obstacle or headroom intrusion from this asset.

#189 has no flat-panel source/export in this checkout. Its future confirmed
device can replace the `mount_display` child at the documented transform.
The visible screen is an explicitly generic envelope, not blind reuse of the
checkout CRT or a new competing historical monitor. #238 remains responsible
for general shelf-top hardware; these narrow, generic supports are specific to
this surround and do not alter shelf fixtures.

**Installation remains unresolved.** Another reference must establish hinge/base,
support height and location before a store placement can be authored and checked
against adjacent fixtures, walking routes, headroom and viewing clearance. No
installed eye-level photograph is claimed: `eye.png` is a crop-relative viewing
study. This implements the issue’s isolated-viewer alternative; it does not
fulfill the eventual installed-photo/placement acceptance criterion.

## Verification evidence

Public captures were made from this worktree with no private user-assets present:
[front](screenshots/customer-information-terminal/front.png),
[side](screenshots/customer-information-terminal/side.png),
[rear](screenshots/customer-information-terminal/rear.png),
[viewing study](screenshots/customer-information-terminal/eye.png),
[mounting supports](screenshots/customer-information-terminal/supports.png).
The support view intentionally hides the generic display envelope to expose
the estimated mount. The viewer grid is ¼ foot and is not an installation floor.

The browser verifier checks load/fallback swap, default-placement gate, render
and shadow requests, full owned-resource disposal, idempotent teardown and a
delayed load completing after removal. Node tests inspect the actual GLB for
budget, UVs, material roles, texture absence, foot scale and attachment nodes.
Run the full project checks with `npm test && npm run build`.
