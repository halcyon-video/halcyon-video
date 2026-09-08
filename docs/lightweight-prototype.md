# Lightweight 3D prototype

On a running development build, open [the lightweight store](http://localhost:1420/light-store.html).
This is a separate, opt-in browsing prototype. The usual store remains the default.

The prototype uses the existing floor planner, simple diffuse lighting, shared
shelf geometry and a small movie-cover atlas. It omits dynamic shadows,
reflections, detailed fixtures and the animated clerk. Small real covers arrive
while the store is already usable; inspecting a title requests a sharper cover.
Streaming service names stay out of browsing. Checkout is not implemented in
this prototype.

Swipe between sections, tap the floating label to enter a shelf, then swipe
across titles and vertically between rows. Tap **Pick up movie** to inspect its
cover. The buttons and arrow keys provide the same navigation; Escape returns
to the shelf or overview.

**Low detail 3D — Prototype** is always visible. **See full quality** opens a
recorded screenshot of the actual full store, captured without user assets at
high quality. The comparison image is downloaded only when opened. It describes
the rendering differences and offers a link back to the full store; it does not
change the visitor's saved quality settings or claim that every phone requires
these concessions.

This deliberate demo entry uses the bundled streaming snapshot when no service
preference exists. An explicitly empty service selection stays empty. It does
not change the normal local installation's opening-day behavior. The catalog is
limited to 24 unique titles per date-based section for this first prototype;
availability comes from the snapshot, not a new live provider check.

The entry and frame-rate goals still require physical iPhone and Android
testing on cellular connections. Desktop GPU measurements with a phone viewport
are useful diagnostics, not device certification.
