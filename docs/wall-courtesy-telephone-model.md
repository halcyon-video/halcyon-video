# Wall courtesy telephone — #191

Original generic beige wall telephone, distinct from the counter phone. Scripted
Blender mesh authoring delivers a fitted two-piece shell and seam, metal mounting
plate with recessed rear fixing sockets, vertical curved handset, two cradle
saddles and hook switch, twelve raised labeled keys, slotted face fixings,
strain reliefs and a continuous capped 32-turn hanging cord.

The original 1993 walkthrough imagery was not located in the available checkout
or local archive leads. The issue's beige-phone description was inspected.
Dimensions and mounting details are design estimates,
not measured historical evidence. No source photo, downloaded mesh, branding or
third-party artwork is included. The original swept handset mesh is reused from
#178's `counter-telephone.blend`, transformed into a vertical receiver. The desk
phone, its connectors and countertop contact system remain unchanged.

## Delivery contract

- Source: `tools/models/wall-courtesy-telephone.blend`.
- Rebuild: `blender -b -t 2 -P "$PWD/tools/models/wall-courtesy-telephone.py"`.
  The script reads the existing #178 Blender source, embeds deterministic
  surface maps, checks manifold solids, saves separate editable physical parts,
  then joins the runtime by material.
- Runtime: `public/models/wall-courtesy-telephone.glb`; adjacent JSON records cost.
- Units: numeric feet; Blender `(x, -store_z, height)` becomes runtime X right,
  Y up, +Z facing the room. Blender scene scale is 0.3048 meters per unit.
- Origin: backplate center on the wall. Named empties: `Mount_wall` at `(0,0,0)`,
  `Connector_handset` at `(-0.16,-0.37,0.26)` and `Connector_base` at
  `(0.20,-0.46,0.12)` in runtime XYZ. Cord endpoints meet those sockets.
- Envelope: 0.57 × 1.800054 × 0.382916 ft, including hanging cord. Backplate is
  0.53 × 1.02 ft; shell is 0.57 × 0.94 ft. No animation, floor footprint, stock,
  selection target or phone interaction is added.
- Roles: `PhoneHousing`, `PhoneHandset`, `PhoneKeys`, `PhoneRubber`,
  `PhoneHardware`, `PhoneLegend`. Each exported primitive has UVs and normals.
  Roughness factors respectively 0.43, 0.34, 0.46, 0.82, 0.30, 0.55, modulated
  by a grain image in the 0.86–1 range. Hardware metallic factor is 0.8;
  other roles are dielectric. All RGB albedos are at least 0.08.
- Two embedded 128-square images: fine molded-grain tangent normal and packed
  metallic/roughness variation. Shared image/sampler resources need about
  171 KiB of RGBA mipmapped texture storage; no external texture requests.
- Cost: 12,020 triangles, six mesh/material batches, 656,004 GLB bytes. Thirty
  physical source solids pass manifold checks; raised font legends are separate
  converted font surfaces. This is resource accounting, not device FPS evidence.

## Store integration

`buildStorefrontFacade` calls `buildWallCourtesyTelephone` only where the service
door exists (a side ribbon is required). The fixture additionally requires
corporate format and `bb-1993`. `store-fixtures-config.ts` exposes its mounting
configuration; it is facade-owned rather than a fixed floor placement.

The anchor is `(11 + storeWidth/2, 4.65, doorZone.z0 - 0.35 - 0.285)` feet, yaw
−π/2. Backplate touches the interior wall plane; the entire phone is behind the
service-door exclusion rectangle, with 0.35 ft nominal clearance (0.33 ft from
the slightly wider authored door frame). The cord ends 3.36 ft above the floor.
Door operation, EXIT signage, navigation and wall-display placement are retained.

The existing `installDisplayModel` handles base-path URLs, render/shadow refresh,
failed requests and disposal of late results. Before this issue no wall phone
existed, so an empty visible fallback preserves that absence during loading or
failure. Facade or phone removal releases the model's owned geometry, materials
and embedded textures; no counter-owned finish is borrowed.

## Verification

Run `npm test && npm run build`. The asset regression checks UV/normal presence,
embedded physical finishes, albedo floor, named mounts, bounds and cost budgets.
Run `node tools/verify-wall-courtesy-telephone.mjs /tmp/wall-phone-evidence` for
actual StoreScene photographs and browser lifecycle checks. The harness uses
isolated public-only corporate/1993/day settings and standard/high ceilings,
with 80/16 synthetic titles respectively. It checks loaded bounds, wall contact,
door separation and neighboring mesh triangles, plus removal, missing assets,
late results and the wrong-era gate.

Before/after context, front and side captures retain the store architecture.
Rear captures are explicitly architectural cutaways at the installed transform
so the normally concealed fixing recesses can be inspected. SwiftShader low
quality is used; these are local preview photographs, not a live deployment or
hardware-performance claim. Inspected images and verification logs are delivered
in `/home/devin/mognet-workers/out/astra-halcyon-191/`.
