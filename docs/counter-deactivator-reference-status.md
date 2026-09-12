# Counter security deactivator #186 — reference outstanding

Status: **blocked on reference; issue remains unresolved** (2026-09-11).
No Blender source, runtime mesh or integration is delivered by this audit.

## Evidence inspected

Read [#186](https://github.com/halcyon-video/halcyon-video/issues/186), the
[#151 delivery contract](https://github.com/halcyon-video/halcyon-video/issues/151),
and the checkout-counter model workflow.
The roughly four-inch brushed-metal disc is an issue description, not a
measurement independently confirmed here.

Visually inspected two recovered original Part II frames:

- `rUhRHo44CIA/f0063.jpg`, tape 00:18:26:14: customer-side checkout context;
  equipment and people obscure the worktop.
- `rUhRHo44CIA-f0079.jpg`, tape 00:18:58:13: clerk-side cabinet and equipment
  view; it does not clearly identify the requested disc, rim or mounting seat.

The copies are in the local `donatello-candy-193-20260910` and
`counter-structure-20260910-donatello` task reference directories. No source
pixels are committed. Searches of local project/task/reference filenames and
Downloads/Pictures found no dedicated deactivator study. Web searches for the
video identifier and Part II deactivator did not recover a usable reference.
Opening the YouTube page failed; a fresh yt-dlp attempt for
`https://www.youtube.com/watch?v=rUhRHo44CIA` exited 1 with HTTP 400/precondition
errors and no downloadable video format. The fetch log is in the #186 outbox.
This does not establish absence from the owner's private archive.

Requested a local path or accessible URL to the original walkthrough, close-up
or study. Modeling awaits that input under the issue's explicit requirement to
confirm the reference first and match-real-asset rule 6 (ask for unavailable
references instead of inventing around the gap).

## Integration findings and resume contract

The scene uses feet. Four inches would be 1/3 ft (0.1016 m), provisionally.
`src/counter-anchors.ts` publishes a world frame, not a physical support plane.
`Entrance.getCounterTopAnchorAt(u)` exposes the existing worktop's position,
height, yaw and depth through `spineAt`; the generic worktop is Y=2.82 ft.
Optional local millwork can publish support empties through `counter-mounts.ts`.
Confirm the disc's actual location against the loaded counter and neighboring
terminal, phone, bag and printer before selecting an along-counter offset.
No new location or era/format gate is asserted by this audit.

After reference inspection, establish axes, face-plane origin, estimated hidden
depth and mounting-seat dimensions. Author the removable insert/rim/seat as
named editable parts, with UVs, brushed-metal grain, normal relief and calibrated
roughness. Respect the commissioned albedo floor. Record which details are
visible and which are inferred. Keep owner-reference derivatives in ignored
user-assets per #151. Deliver reproducible script, .blend and optimized GLB.

An exactly coplanar face over an uncut worktop risks depth fighting; embedding
the whole face hides it. Resolve and inspect the flush surface treatment under
grazing light without unnecessarily rebuilding or cutting the counter. Preserve
the current empty-counter fallback, interaction/navigation anchors, asset URL
resolution, load failure behavior and asynchronous removal cleanup. Release
owned textures as well as meshes/materials and request render/shadow refresh.

Acceptance still requires before/after in-store photographs, side/rear/support
details, inspected geometry and UVs, measured bounds/triangles/draw primitives/
materials/textures/file sizes, lifecycle and placement checks, and passing tests
and build. Baseline checks on this audit do not satisfy model acceptance.
