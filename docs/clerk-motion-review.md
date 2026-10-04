# Clerk motion review

Open MogNet's **Review → Halcyon clerk** to compare three captured female walks
and a standing idle on both uniforms. These remain animation candidates for the
sprite pipeline; the store's existing sprite atlases are unchanged.

## Sourced motion

The standing pose and three walks come from the **Open Motion Project, ACCAD /
The Ohio State University**, Female 1 dataset, under **CC BY 3.0**. The original
BVH files, decoded motion samples, exact crop frames, license and source links
are retained in `tools/models/motion-sources/`. The review page also attributes
the source and explains the adaptations.

- Standing: A01 Stand, frames 0–90, 3 seconds.
- Walk A, soft sway: B02 WalkToStand, frames 29–69, 1.333 seconds.
- Walk B, compact: B02 WalkToStandT2, frames 7–47, 1.333 seconds.
- Walk C, steady: B03 Walk1, frames 80–118, 1.267 seconds.

The two WalkToStand crops use the steady walking portion before the stop.
These are three distinct captured takes, not procedural amplitude variations.
The old Quaternius adaptation and subsequently authored long stride are no
longer used. The owner's latest request for normal captured walks supersedes
the earlier heel-past-chest requirement.

## Reproduce and reuse

1. Run `node tools/models/sample-clerk-captures.mjs`. It uses the existing Three.js
   BVHLoader, preserving source rotations and sample times in JSON.
2. Run Blender with `tools/models/video-clerk-motion.py -- --reuse-geometry`.
   This preserves the current garment meshes, shorter leg proportions, longer
   torso, and articulated fingers. Without `--reuse-geometry`, the original
   source blend and cloth script reproduce that geometry first.
3. The authoring script calls `clerk-captured-motion.py`, then saves the editable
   `video-clerk-motion.blend` and exports both GLBs under `scratch/clerk-motion`.
4. Run Blender with `tools/models/check-clerk-motion.py`, then the MogNet browser
   check `node tools/check-clerk-review.mjs` after installing both exported models.

The retargeter maps source world rotations through a standing calibration onto
the destination bone orientations. It preserves destination bone lengths and
connected local joint translations; it does not copy foreign joint positions.
A small distributed quaternion correction closes each cropped cycle. Horizontal
source travel is removed for in-place sprite playback; frame timing is retained.
The actual deformed shoe soles determine grounding.

The standing calibration is specific to this generated mesh: it settles the head
over the feet, compensates its forward-looking torso silhouette and provides
hand clearance. Reading a spine angle alone did not describe the visible posture.
Future characters can reuse the source captures, decoding and retargeter, with
`MAP` and the standing calibration adapted to their bone names and silhouette.
Each new mesh still requires visual inspection, hand clearance, foot contact and
sprite-speed matching. This is reusable source machinery, not a claim that any
arbitrary future rig will work without calibration.

## Preserved motions and geometry

The five existing stocking, talking and typing actions are retained. Stocking
uses articulated fingers, two-hand case contact, neutral wrists and a complete
place, release, withdraw, regrip and retrieve loop. The shelf and keyboard are
studio references. The original Meshy character, wardrobe mesh repairs, cloth
drape, skin textures and 54-bone rig are retained.

## Verification

The Blender check inspects every baked frame for connected walking joints,
reasonable stride and swing-foot clearance, grounded soles in both uniforms,
pocket clearance, loop seams and the existing stocking wrist, grip and shelf
contact requirements. Actual captured swing knees are allowed; the old arbitrary
39-degree knee ceiling and heel-past-chest constraint are removed.

The browser check exercises both exported uniforms, all nine distinct clip
choices, playback controls, props, reduced motion and 390×844 mobile layout.
It samples exported ankle spacing throughout all three walks, records source
comparisons and captures normal-speed review clips. Pixelmatch compares the
standing screenshot against the previously served version; no custom comparer
is introduced. Inspect the images and animation loops as well as their numbers.

The review is not a public store release or a physical-phone performance claim.
