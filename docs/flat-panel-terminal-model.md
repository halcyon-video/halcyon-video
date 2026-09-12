# Late-era checkout flat panel (#189)

Original generic scripted Blender monitor, installed at counter terminal station 0
in the `bb-2010` theme when the counter has two stations. Station 1 retains its
CRT. Earlier themes and the independent shop retain their existing CRT hardware.
The existing terminal canvas, menu rows/actions, search dock and keyboard are reused.

## Evidence and provenance

Reviewed issue #151's delivery contract and #176's keyboard commission, the landed
`counter-terminal.py` / `rental-keyboard.glb` implementation.
Also inspected the original local checkout photograph
`tasks/quest-188-20260910/private/checkout-hardware-7476924322.jpg`, associated with
the `late-era-fixtures-2012` lead. It shows a dark flat panel beside a beige CRT,
with beige keyboards and loose cables. It does not reveal rear ventilation,
concealed connectors, foot construction or measured dimensions.

This is an original, unbranded generic design, **not a measured reconstruction of
the pictured monitor**. Size, 4:3 picture area, pedestal, hinge, vent pattern and
cable route are design estimates selected for the existing interactive station.
No photograph pixels, logos, external meshes or manufacturer-specific construction
are included. Reference-derived replicas and branded artwork belong in private
user-assets under #151; the reference photograph remains outside this repository.
Geometry and generated textures use the repository license.

## Authoring and attachment contract

- Editable source: `tools/models/flat-panel-terminal.blend` (11 named physical
  mesh parts, UVs, packed images and unapplied bevel modifiers).
- Generator: `tools/models/flat-panel-terminal.py`; imports the existing terminal
  mesh/UV/export helpers. The helper's standard `__main__` guard allows reuse
  without regenerating the CRT or keyboard.
- Runtime: `public/models/flat-panel-terminal.glb`, six material primitives.
- Units: feet; Blender Z up / +Y front exports to glTF Y up / −Z front. Origin
  sits on the desk; centred on X. Runtime rotates by π just like the CRT.
- Export envelope: 1.3993 W × 1.5496 H × 0.7469 D feet, including cords. Runtime
  fits body height to the established 1.55 ft, excluding `LCDCableRubber` from the
  body fit. Desk pads use the inset role so the body includes the true y=0 contact.
- `LCDScreen` identifies the replaceable 1.22 × 0.915 ft picture plane. The editable
  part is `LiveScreenSurface`; the installed menu mesh is
  `counter-terminal-live-screen`. Runtime measures its bounds and positions the
  existing canvas just in front. No CRT glass dome is added to the LCD.
- Station origin, yaw, counter-top depth and standing/navigation anchors remain
  those from `counter.ts`. The dock uses the loaded screen's world transform at
  its existing 1.3 ft distance. No new collision or action target is introduced.
- #176 contract: reuse the shipped `rental-keyboard.glb`, its −Z front, 0.85 ft
  runtime width and rear-edge seating at `islandDepth/2 − 0.02`. The LCD foot sits
  behind the keyboard; this issue does not duplicate or reauthor the keyboard.
- Hinge is static; no tilt animation is commissioned.

## Construction and materials

Continuous welded bezel with a recessed aperture; tapered rear shell with a seam
step and 19 carved cooling pockets; elliptical molded foot; tapered mast; tilt
barrel; connector sockets; four chin buttons; indicator; desk pads; two closed
cable sweeps down the back and onto the deck. Closed source pieces are checked
for manifold edges by the shared bmesh helper; only the live picture plane is
intentionally open. Export copies apply bevels and join by material role; editable
physical parts remain separate in the source collection.

| Material role | Surface | Roughness |
| --- | --- | --- |
| `LCDBezelABS` | bezel | 0.43 |
| `LCDShellABS` | cabinet, pedestal | 0.52 |
| `LCDInsetABS` | vent pocket floors, hinge, controls, sockets, pads | 0.66 |
| `LCDCableRubber` | signal/power cords | 0.76 |
| `LCDScreen` | matte picture backing, live menu attachment | 0.26 |
| `LCDPowerLed` | indicator lens | 0.32 |

Plastic/rubber roles carry original seeded 128² tangent grain normals and a
128² roughness map with fine variation. Grain tiles 18 times across the UV atlas
using `KHR_texture_transform`; normal strength is 0.22. Authored linear albedo
components are at least 0.08. No baked illumination or emissive housing substitutes
for physical lighting. The runtime preserves LCD material factors and texture
maps rather than applying the beige CRT tint. The shared menu remains self-lit.

## Runtime ownership and fallback

The existing base-path asset resolver and GLTFLoader are used. Each distinct
monitor asset loads once and installs only at its selected stations. Keyboard
geometry/textures stay shared. A failed monitor load retains the existing box
monitor, live menu and search dock for that station, and requests a shadow refresh.
Successful arrival also refreshes shadows. Removal marks the terminal family
retired before disposing its shared resources once, including unused screen
materials and the canvas texture when removed before loading; late monitor and keyboard
arrivals are disposed without attachment. The existing entrance teardown remains
the ownership boundary.

## Cost and verification

GLB: **273,008 bytes; 4,502 triangles; six primitives; two embedded 128² PNGs**
(normal and roughness, 128 KiB total uncompressed RGBA base levels). Material
texture transforms may create multiple lightweight texture descriptors over the
two image sources. One LCD replaces one CRT in the late-era store. Blender source
is approximately 278 KB; generated metrics are checked in alongside the script.

`tests/flat-panel-terminal.test.ts` checks era/station gating, physical map roles,
albedo floor, UV/normal attributes, 4:3 screen, contact origin and resource budget.
`tools/verify-flat-panel.mjs` uses the real StoreScene and the existing
Vite/Puppeteer photography workflow for context, front, side, rear, detail and
menu docking, measuring monitor/keyboard placement and exercising ownership,
late arrivals and failed loading. The clerk billboard is hidden in the inspection
views to avoid occluding the equipment. No store fixture or lighting is replaced
for these photographs.

Run from the repo (pass an absolute script path to the installed Blender wrapper):

```sh
blender -b -P "$PWD/tools/models/flat-panel-terminal.py"
LCD_OUT=/tmp/lcd-check node tools/verify-flat-panel.mjs
LCD_OUT=/tmp/lcd-check LCD_LAYOUT=usquare-counter node tools/verify-flat-panel.mjs
LCD_OUT=/tmp/lcd-check LCD_THEME=mom-and-pop LCD_CHECKS=0 node tools/verify-flat-panel.mjs
npm test && npm run build
```

Before/after photographs and verification logs are delivered in the task outbox
at `/home/devin/mognet-workers/out/astra-halcyon-189/`. These are local in-store
renders, not a deployment. See `report.md` there for the final verification result.
