# Gumball machine

An original, unbranded spiral dispenser ships as `public/models/gumball-machine.glb`.
Its editable source and reproducible Blender mesh authoring script live in
`tools/models/gumball-machine.blend` and `tools/models/gumball-machine.py`.
The public design has a spherical clear globe, rounded coin cabinet and a squat plinth.
The globe is a true sphere 2.04 ft across in authoring units (1.48 ft at runtime), with
its openings at the seating ring and the lid; the gumball fill stays inside it.
Installed private models can replace it through
`public/user-assets/fixtures/gumball-machine/machine.glb`; private references and
reconstructions remain outside Git.

Scene units are feet. Ground origin is the center of the plinth. Runtime height is 4 ft, slightly
below the standard 4.6-ft shelf frame, with a maximum radius of 0.764 ft.
The editable public and private source models retain their 5.5-ft authoring
envelope; the loader and built-in fallback uniformly scale by 4/5.5. Collision
and placement use the scaled envelope. Blender X maps to store X, Blender -Y to store +Z and
Blender Z to store height. The coin mechanism and delivery door face local +Z.
Named `Enamel` and `ClearPlastic` finishes are replaced at runtime; enamel uses
the active store palette. Thin transparent plastic uses 0.045 opacity and 0.07 roughness, retaining
subtle highlights while revealing the gumballs and spiral through the shell.
It uses alpha blending without
a full-scene refraction render. The helical chute is a solid trough with raised
edges, and gumballs use a fixed seed. All generated parts carry UVs.

`store-gumball.ts` reads the built games department and games-only plan shelves.
The deepest world-Z shelf wins; joined ends and wall-facing ends are excluded.
The exposed end nearer the counter receives the machine, with its coin face
turned away from its host into the open customer aisle at a multiple of 45
degrees. Each placement records a customer standing point in front of the gray
coin mechanism. Counter placements similarly face the customer side, outside
the counter body. With no game shelves,
the machine stands beside the shield counter's center peak, entranceward along
its right shoulder; flat and standalone counters have corresponding anchors.
Door depth follows the shared vestibule datum.

The existing detail loader controls queued loading, fallback visibility, shadow
refresh and cancellation. One cylindrical collision proxy remains through model
replacement. The floor-plan footprint is the conservative 1.527 ft square, classified
as an attached structure so it does not demand a walking lane through its host.
The fixture enters the scene's owned fixture lifecycle and releases its model,
fallback, materials and proxy when the store is rebuilt or disposed.

Verification: unit coverage of joined/deepest/wall shelves, input-order stability,
counter shapes and door depth; full build and test suite; exported bounds, UVs
and manifold solids; isolated fixture views and both placement rules in the store.

The globe carries the active configured store emblem as a small curved sticker.
`gumball-logo.ts` paints the canonical `getActiveLogoSpec` through `drawLogo`,
retaining text, colors, silhouette, composed emblem and installed brand artwork.
It trims the painter's transparent margins and contains the complete mark within
an envelope 39% of the hopper diameter wide, with a 5:3 width-to-height ratio;
unusual logo shapes retain their proportions. A static 24-by-16 mesh projects
onto the actual front glass, so the spherical fallback, public barrel and private
replacement each keep their own curvature. No source model or glass finish changes.
Brand edits reuse one canvas texture; canonical image and bundled font readiness repaint the mark,
and fixture teardown unregisters the listener and disposes decal resources.

Logo verification additionally covers frontal and oblique views of both model
paths, the built-in fallback, live text/color/emblem changes, installed image
artwork, and teardown during asynchronous detail/font preparation. Public
photographs must still be captured with user assets absent.

The dispenser is interactive in walk mode. Mouse, touch, the keyboard reticle and
VR share the fixture hit resolver. A click turns the named handle, rolls one ball
down the spiral, opens the delivery flap and leaves the ball at the outlet, with
coin, gear, rolling and landing contacts on the shared effects bus. Repeated
clicks during dispensing do not add another ball or restart the cycle. The bounded
animation releases its frame callback and GPU objects when the fixture is disposed.

The public export retains separate `Turn handle` and `Delivery flap` parts.
`Clear chute sleeve` carries its low/high/radius/turn-count metadata so installed
models follow their own raceway. Static material batches leave animated parts
independent. Both the five-turn public asset and seven-turn installed asset were
exercised through a real click, with live audio, delivery and teardown evidence.

### Instanced candy and entrance clearance (#198)

The editable `Candy fill` assembly contains linked 80-triangle candy meshes,
with one shared mesh for each of seven finishes. Blender exports the assembly
using `EXT_mesh_gpu_instancing`; the runtime draws seven candy batches. The
fixed seed, positions, sizes and colors retain the existing filled hopper.
The display loader releases each instance buffer as well as its shared geometry
and materials, including cancellation during asynchronous model preparation.

The public export is 541,920 bytes (previously 3,191,572), contains 12,386 stored
triangles and submits 89,586 triangles across 15 mesh primitives. It has 972
candy instances, 11 material roles and no image textures. These costs exclude
the separately owned configured-logo decal and animated dispensed ball. Source
parts remain individually editable; the runtime export batches static finishes
while keeping the handle and flap independent. The hopper and chute are closed,
double-wall shells, with 0.016-foot authored thickness (about 0.14 inches after
the existing runtime scale).

The existing registry entry and conditional placement remain the integration
point: the games shelf receives the machine when present; otherwise its anchor
is on the customer side of the entrance counter. The entrance placement tests
reserve a complete door-width circle around either possible side-door hinge,
plus a three-foot approach gap, for both shield and U counters with 3.2- and
4.2-foot doors. This is a conservative geometric clearance check, not a claim
of building-code certification. Runtime inspection additionally checks a
30-by-48-inch customer space against actual navigation footprints.

`tests/gumball-model.test.ts` checks exported instancing, UVs, separate operable
hardware and resource limits. The authoring source uses feet, ground-centered
origin and the existing Blender-to-store axes documented above. Blender source
inspection verifies closed manifold parts; browser verification exercises
rendered instances, the original collision envelope, dispensing, cancellation
and one-time cleanup.
