# Clerk motion candidate — 4 October 2026

This is an owner review candidate. The current game sprite atlases are preserved;
this pass does not claim that a smooth GLB viewer has upgraded the store's sprite
frame budget. Open MogNet's **Review → Halcyon clerk** for all seven smooth clips,
both garments, free orbit, slow motion, frame stepping, a hand close-up and the
original sprite review.

## Editable source

`tools/models/video-clerk-motion.py` reads the existing packed
`video-clerk.blend`, preserves the approved Meshy character, shortens the region
below the hips by 10%, lengthens the torso region by 10%, and retains head size.
The fitted Oxford and its details receive the same deformation. It saves
`video-clerk-motion.blend` with named actions and both uniforms. Run it in Blender
with four threads; `--probe` renders representative poses. The normal run exports
`clerk-polo.glb` and `clerk-oxford.glb` under `scratch/clerk-motion`.

The thirty added finger bones deform the existing digit geometry: three joints
for each finger and thumb. They are weighted with smooth joint transitions; this
is not a claim that the generated hand topology has been wholly remodelled.
The character has 54 bones in total, including the original two head helpers.

The adapted walk uses Quaternius's authored `Walk_Loop`, with directions and rest
rotation changes transferred to the clerk, then a smaller arm swing and hand
clearance suited to this silhouette. This is an adapted generic walk, not a
motion-captured feminine performance. The source library and its CC0 license are
preserved in `clerk-motion-reference.glb` and its accompanying license text.

The contact clips are authored in Blender. Two-link arm positioning keeps the
elbows outward and below the hands. Stocking presents a complete place, release,
withdraw, regrip and retrieve cycle: it does not fly the case back to the starting
pose while the hands are elsewhere. The low shelf uses a crouch and forward lean.
The shelf and keyboard are studio references, not new store fixtures. Finger
motion is also present in idle, talking and typing.

The exports use standard glTF skinning and NLA animation tracks, sampled at 30
frames per second. Blender emission baking preserves the original per-pixel cloth boundaries and
skin/hair texture in 2048-square colour maps for the review. Both source wardrobe and
original sprite recolour masks remain available. Facial animation, counter
leaning, customer traffic and new clerks are outside this pass.

## Reference selection

Blender's armature, material, animation and glTF tools were used. The original
imported skeleton's asymmetric pole rotations produced visibly reversed elbows
with stock IK pole settings; a bounded two-link pose authoring helper resolves
elbows against a measured outward/downward guide. No exporter or visual comparer
was replaced.

- [Quaternius Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html): Standard archive downloaded directly from the author's itch.io page; CC0. The walk is used.
- [Adobe Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html): researched as an alternative; no Mixamo animation is included and no account or purchase was created.
- [Meshy animation library](https://docs.meshy.ai/en/api/animation-library): researched; no additional Meshy generation or credit spend.

## Verification

Final receipts and visual findings accompany the delivered review. Studio
inspection establishes this candidate's appearance and playback; it is not a
physical-phone performance measurement or an in-store sprite acceptance test.
