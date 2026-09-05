"""Editable tall-ficus construction kit: thick-walled lathed planter, tapered
branching trunk/limbs swept from an authored centreline, and two creased leaf
shapes. Run: blender -b -t 2 --python tools/models/potted-plant.py

Blender local (x, -z, y) exports store Y-up, matching the shelf/av-decks kits.
Each named part is a template: the runtime (src/ficus-model.ts) instances,
scales and merges copies to build the full plant in a handful of draw calls
instead of one mesh per twig and leaf.
"""
import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/models'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for material in list(bpy.data.materials):
    bpy.data.materials.remove(material)

PARTS = []


def material(name, color, roughness=0.5, metalness=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metalness
    return mat


POT_FINISH = material('FicusPotFinish', (0.729, 0.369, 0.212), 0.82, 0.04)
SOIL = material('FicusSoil', (0.133, 0.089, 0.066), 0.95)
BARK = material('FicusBark', (0.306, 0.220, 0.153), 0.85, 0.02)
LEAF = material('FicusLeaf', (0.114, 0.302, 0.137), 0.35, 0.04)


def finish_and_check(obj, mat, uv=True):
    obj.data.materials.append(mat)
    if uv:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(island_margin=0.03)
        bpy.ops.object.mode_set(mode='OBJECT')
        obj.select_set(False)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    # Smooth-shade every round/lathed/tubed part: flat per-face normals on an
    # 8-20 sided approximation of a curved surface reads as faceted glass and
    # throws harsh specular chips, not a rolled pot rim or a round limb.
    for face in bm.faces:
        face.smooth = True
    bad = [e for e in bm.edges if not e.is_manifold]
    assert not bad, f'{obj.name}: {len(bad)} non-manifold edges'
    assert bm.calc_volume() > 0, f'{obj.name}: inward normals'
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    PARTS.append(obj)
    return obj


def lathe(name, profile, mat, sides=20):
    """Revolve a (radius, height) profile — both ends on-axis — around Z into
    a closed hollow-or-solid solid. A thick-walled pot is just a profile that
    goes up the outside, over a rolled lip, and back down the inside to an
    interior floor, rather than a single-skin cylinder.
    """
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0, z)) for r, z in profile]
    edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1),
                    angle=math.radians(360), steps=sides, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish_and_check(obj, mat)


def tube(name, centerline, mat, sides=8, cap_start=True, cap_end=True):
    """Sweeps a circular, tapered cross-section along a planar (y=0) centre-
    line of (x, z, radius) triples — a real branching limb, not a uniform rod.
    The curve stays in the local XZ plane so a fixed Y reference gives a
    twist-free ring frame with no rotation-minimizing-frame bookkeeping.
    """
    pts = [Vector((x, 0, z)) for x, z, _r in centerline]
    radii = [r for _x, _z, r in centerline]
    rings = []
    for i in range(len(pts)):
        prev = pts[max(0, i - 1)]
        nxt = pts[min(len(pts) - 1, i + 1)]
        tangent = (nxt - prev).normalized()
        side1 = Vector((0, 1, 0))
        side2 = tangent.cross(side1).normalized()
        ring = [pts[i] + radii[i] * (math.cos(a) * side1 + math.sin(a) * side2)
                for a in (k / sides * math.tau for k in range(sides))]
        rings.append(ring)
    verts_flat = [v for ring in rings for v in ring]
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    bverts = [[bm.verts.new(v) for v in ring] for ring in rings]
    for i in range(len(rings) - 1):
        for j in range(sides):
            k = (j + 1) % sides
            bm.faces.new((bverts[i][j], bverts[i][k], bverts[i + 1][k], bverts[i + 1][j]))
    if cap_start:
        bm.faces.new(reversed(bverts[0]))
    if cap_end:
        bm.faces.new(bverts[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    return finish_and_check(obj, mat)


def leaf(name, length, max_width, peak, fold, droop, wave, mat):
    """Explicit creased blade: 3 verts per row (edge / rib / edge), rib pulled
    below the edges as a real V-fold, plus a droop curve and a mild lateral
    wave — a broad glossy leaf read from any angle, not a flat card.
    """
    rows = 8
    verts, uvs = [], []
    for r in range(rows + 1):
        t = r / rows
        # Full-bodied silhouette: widens fast then eases to a drawn-out tip.
        w = max_width * math.sin(min(1.0, t / peak) * math.pi / 2) ** 0.7 \
            * (1 - max(0.0, (t - peak) / (1 - peak)) ** 1.4 if t > peak else 1.0)
        # Z is the growth axis here (matches tube()/lathe()'s use of Z for
        # height), Y is the fold/droop depth, X the lateral width — the same
        # axis roles every part in this kit uses, so the runtime can treat
        # every template's local +Y (post export_yup) as "grows outward".
        grow = t * length
        droop_y = -(t ** 1.6) * droop
        x_wave = math.sin(t * math.pi * 1.3) * wave * t
        ridge = -fold * math.sin(min(1.0, t / peak) * math.pi / 2) * (1 - 0.15 * t)
        verts += [(-w / 2 + x_wave, droop_y, grow), (x_wave, droop_y + ridge, grow), (w / 2 + x_wave, droop_y, grow)]
        uvs += [(0, t), (0.5, t), (1, t)]
    faces = []
    for r in range(rows):
        b, n = r * 3, (r + 1) * 3
        faces += [(b, b + 1, n + 1, n), (b + 1, b + 2, n + 2, n + 1)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    layer = mesh.uv_layers.new(name='LeafUV')
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            layer.data[li].uv = uvs[mesh.loops[li].vertex_index]
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    # Smooth-shade across the fold: a real leaf's central crease is a gentle
    # crease in the surface normal, not a lit/unlit facet boundary.
    for face in bm.faces:
        face.smooth = True
    bm.to_mesh(mesh)
    bm.free()
    obj['open_surface'] = True  # a leaf blade is a real two-sided open shell
    PARTS.append(obj)
    return obj


# --- Planter: thick terracotta wall, rolled rim, recessed interior soil seat,
# and a small footed base. Wall section is ~0.045-0.075 ft (0.5-0.9 in) thick
# throughout, not a single-skin shell.
POT_H = 1.40
R_TOP_OUT, R_TOP_IN = 0.64, 0.565
R_BOT_OUT, R_BOT_IN = 0.50, 0.445
SOIL_SEAT_Y = POT_H - 0.24
pot_profile = [
    (0.00, 0.00),                       # bottom centre (solid base)
    (R_BOT_OUT, 0.00),                  # outer sole edge
    (R_BOT_OUT, 0.045),                 # footed base ring
    (R_BOT_OUT - 0.03, 0.075),
    (R_TOP_OUT - 0.03, POT_H - 0.11),   # tapered outer wall
    (R_TOP_OUT, POT_H - 0.075),         # flares to the rolled lip
    (R_TOP_OUT + 0.025, POT_H - 0.02),  # rolled bead, outer
    (R_TOP_OUT - 0.01, POT_H),          # bead crown
    (R_TOP_IN, POT_H - 0.03),           # bead, inner
    (R_TOP_IN, POT_H - 0.12),           # down the inner wall
    (R_BOT_IN + 0.05, SOIL_SEAT_Y + 0.05),
    (R_BOT_IN, SOIL_SEAT_Y),            # interior soil-seat floor
    (0.00, SOIL_SEAT_Y),                # floor centre, closes the revolve
]
lathe('Pot', pot_profile, POT_FINISH)

saucer_profile = [
    (0.00, 0.00),
    (R_BOT_OUT + 0.10, 0.00),
    (R_BOT_OUT + 0.10, 0.05),
    (R_BOT_OUT + 0.06, 0.075),
    (R_BOT_OUT - 0.06, 0.045),
    (R_BOT_OUT - 0.10, 0.02),
    (0.00, 0.02),
]
lathe('Saucer', saucer_profile, POT_FINISH)

soil_r = R_BOT_IN + (R_TOP_IN - R_BOT_IN) * (SOIL_SEAT_Y / POT_H)
soil_profile = [
    (0.00, 0.00),
    (soil_r, 0.00),
    (soil_r * 0.97, 0.05),
    (soil_r * 0.55, 0.095),
    (0.00, 0.105),
]
lathe('Soil', soil_profile, SOIL, sides=16)

# --- Trunk: a single S-curved, tapered multi-stem base. Local Z is the
# growth axis, local X the bend plane; the runtime rotates 3 copies apart in
# yaw for the multi-stem cluster the old procedural version approximated.
trunk_centerline = [
    (0.00, 0.00, 0.075),
    (0.045, 0.55, 0.063),
    (0.015, 1.05, 0.053),
    (-0.02, 1.55, 0.046),
    (0.00, 2.05, 0.038),
]
tube('Trunk', trunk_centerline, BARK, sides=8)

# --- Branches: two unit-length (local Z 0..1) curved, tapered limb templates
# with different bow character; the runtime scales Z to the target length and
# applies its own tilt/azimuth, exactly as shelf-model.ts stretches Rail.
branch_a = [
    (0.00, 0.00, 0.040), (0.12, 0.35, 0.032),
    (0.22, 0.70, 0.024), (0.30, 1.00, 0.015),
]
branch_b = [
    (0.00, 0.00, 0.036), (0.18, 0.30, 0.028),
    (0.24, 0.65, 0.020), (0.26, 1.00, 0.012),
]
tube('BranchA', branch_a, BARK, sides=7)
tube('BranchB', branch_b, BARK, sides=7)

# --- Leaves: two creased, drooping blade shapes for varied growth; the
# runtime jitters scale/rotation per instance on top of these two silhouettes.
leaf('LeafA', length=0.52, max_width=0.36, peak=0.38, fold=0.045, droop=0.10, wave=0.03, mat=LEAF)
leaf('LeafB', length=0.44, max_width=0.27, peak=0.32, fold=0.038, droop=0.14, wave=0.05, mat=LEAF)

triangles = sum(len(o.data.polygons) if all(len(p.vertices) == 3 for p in o.data.polygons)
                 else sum(len(p.vertices) - 2 for p in o.data.polygons)
                 for o in PARTS)

bpy.ops.object.select_all(action='DESELECT')
for i, obj in enumerate(PARTS):
    # Editable source spreads parts out so their construction stays visible.
    obj.location.x = i * 1.4
    obj.select_set(True)
bpy.context.view_layer.objects.active = PARTS[0]
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        area.spaces.active.region_3d.view_distance = 6
        area.spaces.active.region_3d.view_location = (3.5, 0, 1)
        area.spaces.active.shading.type = 'MATERIAL'
bpy.context.scene.unit_settings.system = 'IMPERIAL'
bpy.context.scene.unit_settings.scale_length = 0.3048
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'tools/models/potted-plant.blend'), compress=True)
bpy.ops.export_scene.gltf(filepath=str(OUT / 'ficus-components.glb'), export_format='GLB',
                           use_selection=True, export_yup=True, export_apply=True)
print(f'FICUS KIT: {len(PARTS)} parts, {triangles} triangles, no textures')
