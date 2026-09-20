# Enclosed exit returns counter

An original enclosed returns station shares the main checkout's blue/theme-colored rim, routed millwork profile, contrasting inlay and white lower worktops. The rear run sits against the front glass. A broad rectangular enclosure with a short clipped outer corner preserves the exit approach; an open left end admits staff. A plain return receiver stands on the window-side worktop. Its dimensions are design proportions, not measurements of a photographed store.

- Authoring: `tools/models/exit-return-counter.py`, using the existing checkout authoring functions before their variant-export entry point.
- Editable source: `tools/models/exit-return-counter.blend`.
- Runtime: `public/models/exit-return-counter.glb`.
- Coordinates: feet, local glass plane z=0, interior extends toward negative z. Runtime shifts the glass plane 0.18 feet into the room. X scales for room width; Y remains constant; Z follows the front vestibule panel.
- Envelope: 15.5 by 7.4 feet; rim height 3.54 feet, white worktop height 2.82 feet. Left staff opening 3.2 feet. Six material batches, see the generated metrics for triangle count, closed manifold construction parts, UVs and outward normals.
- Theme roles are shared with checkout: CounterBody, CounterTop, CounterInlay, CounterWorktop, CounterPlinth. The dark receiver interior retains CounterReveal.
- Placement and physical navigation segments: `src/exit-return-layout.ts`. The full envelope reserves floor space for fixtures; only the actual millwork obstructs staff navigation.
- Display loader: brand-pack override, then local override, then public model. Hosted builds skip private probes. Missing meshes retain an enclosed procedural fallback. Return-case stacks rest on the lower window-side worktop.

Validation: production build and complete test suite, plus staff-entry path coverage. In-app context, overhead and interior evidence lives in `scratch/publicity-kits/enclosed-return-counter/` for direct dev landing. Private historical reference imagery is not included.

The vestibule-side edge sits flush to the outer frame face and ends at the frontmost side panel. The clipped corner turns away from the side-door approach. Vestibule depth and checkout datums are shared in `src/vestibule-layout.ts`; the default chamber grows 2.4 feet inward. Gates fit inside the enlarged chamber.
