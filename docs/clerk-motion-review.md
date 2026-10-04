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

## Posture and garment revision — owner review follow-up

The owner found the walk too stooped and the shirt too closely fitted beneath the
chest, with rough sleeve edges and a penetrating pocket. The reproducible motion
script now calls `clerk-cloth.py` before animation sampling. Blender mesh edits
remove tiny coincident garment defects, smooth cloth, rebuild the Oxford shirt with Blender voxel remeshing and native
skin-weight transfer,
and distribute the shirt front continuously from the bust apex to the waistband.
The face, hair and hands retain their source geometry; the collar, badge and
trousers retain their original design and texture.
The original texture coordinates remain the bake input; the Oxford export gets
a fresh Blender UV atlas for the revised topology.

The Oxford pocket is a tessellated cloth patch fitted to the shirt, with skin
weights interpolated from the supporting triangles. The placket and buttons
receive the same surface fitting and skin interpolation. It therefore follows
the garment through bends instead of using unrelated rigid spine weights.

The reference walk retains its leg poses and timing. A torso correction at the
pelvis keeps the hip-to-neck axis between 1.6 and 2.4 degrees forward, replacing
roughly 10–11 degrees in the preceding review. Lower-body pose matrices are
preserved during that correction; the existing shoe-grounding pass still runs.

This remains a review candidate. The production sprite sheets are unchanged.
Validation receipts and matching before/after captures are retained with the
MogNet review evidence and in `scratch/publicity-kits/clerk-drape-20261004`.

The Oxford uses a smooth remeshed outer surface, with the original cut edges and
an inset continuous lining retained underneath. Fitted positions and transferred
normals blend the surfaces at their joins. Plain Oxford pigment matches across
both surfaces; the original pixel mask still preserves skin and trousers at the
hem. The production sprite atlases remain unchanged.

Final validation: the build and all 1,112 tests pass on source base
`63ddf269cea771b875605f5ec0d0b7fc246a5b12`. The 712-frame pocket-to-torso mesh audit
passes for both sides of the pocket thickness, with minimum signed clearance
0.0595 cm. All 40 walking frames keep the hip-to-neck angle between 1.6 and
2.4 degrees. Existing stocking grip and seated-case checks pass across all 405
stocking frames. A full-character nearest-face query was rejected as the pocket
check because raised sleeves can become the nearest unrelated surface; the final
audit explicitly measures the supporting torso. A supplemental forward ray is
not a gate at the crouched silhouette, where 30 rays have no intersection; the
3D nearest-surface check covers every vertex in every frame.

Chromium at 390×844 loads both exported uniforms, exercises all seven clips and
the playback controls, and passes layout, reduced-motion and error checks.
The actual exported models were inspected in that viewer from side and three-
quarter views, with matching old/new walking captures. Source face, hair, skin,
trouser texture details and the original generated collar design remain; this
pass does not claim a wholly retopologized character or physical-phone FPS.

## Connected gait and neutral hands — second owner correction

The preceding hip-to-neck angle check missed opposing segment bends and
backward-displaced clavicles. The corrected walk retains the clerk's connected
rest spine and shoulder offsets, with a small pelvic sway and a coherent forward
pitch. Only the reference's leg timing and reduced sagittal motion are transferred;
foreign shoulder transforms and disconnected leg world matrices are no longer
imported. Thigh swing is reduced and knee flexion is limited to 38 degrees.

Stocking now solves the arm to the palm, treating the forearm and palm as one
straight reach. This places the wrists behind the case and keeps the hands
aligned with the forearms during lift, placement, release, withdrawal and return.
The same case and release timing remain. All three shelf heights use this rule.

`--reuse-geometry` loads the already-authored garment and finger mesh from the
packed motion blend, clears its old actions, and rebuilds the motion, baked colour
textures and exports. This correction used that option to preserve the preceding
clothing repair. Without it, the original source blend and cloth script still
reproduce the full model and motion pipeline.

Run `tools/models/check-clerk-motion.py` in Blender after export. It checks every
baked frame for connected walk joint positions, each spine segment's pitch,
shoulder depth, knee flexion, stocking wrist alignment and hand elevation, palm
contact, seated-case height, pocket clearance and loop seams. This is a regression
gate for concrete faults, not a substitute for inspecting the animated mesh.

The owner review remains MogNet's Halcyon clerk page. Store sprite sheets are
unchanged; this is not a release to the public store.

## Chest-to-heel walking correction — 2026-10-04

The prior walk could pass its upright bone-angle gates while the leading shoe
remained behind the visible chest. At phase zero its heel was 27.46 cm behind
the shirt front. Independent attenuation of the reference thigh motion and knee
flexion had removed forward foot reach.

The walking cycle now authors contact and passing phases together: coherent
opposed thigh swing, a nearly extended contact knee, restrained swing-leg knee
flexion, and heel-first contact/toe-off. The pelvis has no forward pitch. The
existing garment geometry, finger articulation and stocking actions are retained.
The walk remains 1.3 seconds and loops at 30 fps.

The permanent Blender audit now measures the deformed shirt and both shoes in
both uniforms. At each forward contact it requires the back of the leading shoe
to pass the front of the chest by more than 0.5 cm, with the sole within 1.5 cm of
the ground. This supplements the existing spine, connected-joint, knee, stocking
wrist, grip, pocket-clearance and loop checks. The browser independently samples
the exported skinned GLB vertices and checks chest/heel alignment and heel contact.

The GLBs are installed in MogNet's Halcyon clerk animation review. The Halcyon
store still uses its established sprite assets; this work updates the 3D motion
candidate being reviewed, not the store sprite pipeline or a public release.
