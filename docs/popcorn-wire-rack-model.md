# Popcorn wire rack — reference and dependency investigation (#203)

Status: blocked on the original rack reference and the shared #202 placement
contract, 2026-09-11. **Issue #203 is not resolved.** This investigation delivers
no Blender source, runtime mesh, fixture registration, or store placement.

## Evidence inspected

Read the live work orders [#203](https://github.com/halcyon-video/halcyon-video/issues/203),
[#202](https://github.com/halcyon-video/halcyon-video/issues/202), and the
[delivery contract #151](https://github.com/halcyon-video/halcyon-video/issues/151).
The yellow wire rack is distinguished from the carton stack, but neither issue
supplies measurements, reference frames, or attachment points. #202 is open,
with no comments or implementation delivery in its timeline at inspection.
Neither object exists in this checkout's fixture registry, configuration,
model directory, or source consumers.

A local candy audit identifies the original Part II video as `rUhRHo44CIA`.
The locally recovered frames concern the checkout candy rack/counter; those
records do not establish the yellow popcorn rack.

Searched the current checkout, nearby task/reference records, Downloads,
Pictures, and the saved recursive archive repository tree (not truncated).
No popcorn rack study or original walkthrough video was located. Two local
Flickr screenshot files were visually inspected:

- A package photograph showed three filled pillow bags with crimped end seals;
  no rack, mounting system, dimensions, or established 1993 provenance.
- A promotional sign close-up provided no usable rack construction view.

Neither image was copied into the public repository or used to infer the rack.
Web search did not recover the commissioned object, and direct retrieval of
`https://www.youtube.com/watch?v=rUhRHo44CIA` failed. The owner was asked for the
rack study/stills and #202's footprint or attachment contract. Missing local
files do not establish absence from the owner's private archive.

## Contract that must be settled before authoring/integration

Use the existing feet convention: author Blender `(x, -store_z, height)` and
export glTF Y-up to store `(x, height, store_z)`. A floor-origin assembly and
local +Z approach face are a proposed convention, not an agreed #202 datum.

The reference must establish the upright silhouette, hook versus pocket
support, row/column arrangement, base form, and relationship to the cartons.
Record uncertainty in overall height, width/depth, wire gauge, bend radii,
package dimensions and hidden bracing. Every bag must have a modeled support:
a real hanger opening on a hook, or a bottom resting on a wire pocket floor.
A closed bag intersected by a hook is not an attachment solution.

Agree with #202 on the promotion datum/yaw, each object's complete footprint,
separation, approach clearance, and whether the rack is freestanding or shares
any base fittings. Record reusable package/attachment origins for the related
#277 pouch family. Do not create a second carton stack within #203. No usable
reserved popcorn host exists in `src/store-fixtures-config.ts`; the explicitly
open front corners and existing queue/browse lanes are constraints, not spare
space to claim. Confirm format/era admission and omission in compact layouts
before adding placements through the existing registry/configuration.

## Remaining delivery

Author intentional wire sweeps, fitted joints, stable feet/base, and reusable
sealed bags with shaped fill, seams and crimp relief. Keep named physical parts
editable in `.blend`, retain the script, and optimize runtime geometry by
material role and repeated package geometry. Provide useful UVs, calibrated
paint/film/rubber roughness, fine surface grain and normal/bump relief, with
albedo at least 0.08 under the commissioning mandate. Public counterparts must
be original and generic; owner-reference derivatives and branded graphics
belong in ignored user-assets under #151.

Use `installDisplayModel` and `assetUrl` conventions, successful-load fallback
replacement, render/shadow refresh and cancellation on removal. Verify texture
ownership explicitly: the current helper disposes geometry and materials but
does not release embedded textures. Preserve navigation and interaction
ownership; this absent decorative object has no current stock slots to replace.

Measure exported bounds, vertices, triangles, primitives/material roles,
texture dimensions/memory and file bytes. Inspect matching before/after views
at the agreed store anchor and side/rear/base/package-support details. Exercise
failed loads, disposal during loading, rebuild, and admitted layout variants;
then run `npm test && npm run build`. Baseline success on this documentation
change cannot satisfy any geometry or in-store acceptance criterion.

The CLI retrieval also failed with YouTube API precondition/HTTP 400 errors and
no downloadable video format. No original rack frame was obtained or inspected
through that attempt; its failure log is retained in the private delivery outbox.
