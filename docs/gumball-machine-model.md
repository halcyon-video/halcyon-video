# Gumball machine

An original, unbranded spiral dispenser ships as `public/models/gumball-machine.glb`.
Its editable source and reproducible Blender mesh authoring script live in
`tools/models/gumball-machine.blend` and `tools/models/gumball-machine.py`.
The public design has a barrel hopper, rounded coin cabinet and a squat plinth.
Installed private models can replace it through
`public/user-assets/fixtures/gumball-machine/machine.glb`; private references and
reconstructions remain outside Git.

Scene units are feet. Ground origin is the center of the plinth, height 5.5 ft,
maximum radius 1.05 ft. Blender X maps to store X, Blender -Y to store +Z and
Blender Z to store height. The coin mechanism and delivery door face local +Z.
Named `Enamel` and `ClearPlastic` finishes are replaced at runtime; enamel uses
the active store palette. Thin transparent plastic uses alpha blending without
a full-scene refraction render. The helical chute is a solid trough with raised
edges, and gumballs use a fixed seed. All generated parts carry UVs.

`store-gumball.ts` reads the built games department and games-only plan shelves.
The deepest world-Z shelf wins; joined ends and wall-facing ends are excluded.
The exposed end nearer the counter receives the machine, with its coin face
turned toward checkout at a multiple of 45 degrees. With no game shelves,
the machine stands beside the shield counter's center peak, entranceward along
its right shoulder; flat and standalone counters have corresponding anchors.
Door depth follows the shared vestibule datum.

The existing detail loader controls queued loading, fallback visibility, shadow
refresh and cancellation. One cylindrical collision proxy remains through model
replacement. The floor-plan footprint is the conservative 2.1 ft square, classified
as an attached structure so it does not demand a walking lane through its host.
The fixture enters the scene's owned fixture lifecycle and releases its model,
fallback, materials and proxy when the store is rebuilt or disposed.

Verification: unit coverage of joined/deepest/wall shelves, input-order stability,
counter shapes and door depth; full build and test suite; exported bounds, UVs
and manifold solids; isolated fixture views and both placement rules in the store.
