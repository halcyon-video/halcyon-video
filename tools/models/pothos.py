"""Editable countertop-pothos construction kit: thick-walled lathed desk
planter, tapered vine stems swept from an authored cascade centreline, leaf
petioles, and two creased cordate blades. Sibling of tools/models/potted-plant.py
(the tall ficus) — same conventions, its own parts and its own .blend/.glb.

Run: blender -b -t 2 --python tools/models/pothos.py

Blender local (x, -z, y) exports store Y-up, matching the ficus/shelf/av-decks
kits: every template grows along local +Z here, which is +Y in the GLB. Each
named part is a template — the runtime (src/pothos-model.ts) instances, scales
and merges copies into a handful of draw calls instead of one mesh per leaf.
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


# Material ROLES, one per runtime draw call: the runtime rebuilds these four
# as THREE materials (potted-plant.ts buildPothos) and merges every part
# wearing a role into a single mesh.
POT_FINISH = material('PothosPotFinish', (0.741, 0.384, 0.220), 0.78, 0.02)
SOIL = material('PothosSoil', (0.133, 0.089, 0.066), 0.95)
STEM = material('PothosStem', (0.267, 0.451, 0.192), 0.62)
LEAF = material('PothosLeaf', (0.141, 0.420, 0.184), 0.38, 0.04)


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
    # Smooth-shade every lathed/tubed part: flat per-face normals on a 14-16
    # sided approximation of a curved surface read as faceted glass on a prop
    # this small, and throw hard specular chips off the pot's rolled rim.
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


def lathe(name, profile, mat, sides=16):
    """Revolve a (radius, height) profile — both ends on-axis — around Z into
    a closed solid. A thick-walled pot is a profile that climbs the outside,
    rolls over the lip and comes back down the inside to an interior floor,
    rather than a single-skin cylinder with no wall section at all.
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


def tube(name, centerline, mat, sides=6):
    """Sweeps a circular, tapered cross-section along a planar (y=0) centre-
    line of (x, z, radius) triples. Local Z is the growth axis and local X the
    bend plane, so a fixed Y reference gives a twist-free ring frame with no
    rotation-minimizing-frame bookkeeping. A pothos vine tapers hard from a
    fleshy base node to a soft growing tip — a uniform rod reads as wire.
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
        rings.append([pts[i] + radii[i] * (math.cos(a) * side1 + math.sin(a) * side2)
                      for a in (k / sides * math.tau for k in range(sides))])
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    bverts = [[bm.verts.new(v) for v in ring] for ring in rings]
    for i in range(len(rings) - 1):
        for j in range(sides):
            k = (j + 1) % sides
            bm.faces.new((bverts[i][j], bverts[i][k], bverts[i + 1][k], bverts[i + 1][j]))
    bm.faces.new(reversed(bverts[0]))
    bm.faces.new(bverts[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    return finish_and_check(obj, mat)


def cordate_leaf(name, length, max_width, peak, lobe_width, sinus, fold, droop, wave, mat):
    """Explicit heart-shaped (cordate) blade — the pothos silhouette.

    Five columns per row (edge / shoulder / midrib / shoulder / edge) so the
    outline can be ROUND rather than a faceted diamond, with the base row's
    outer columns pulled BEHIND the petiole attachment: that backward pull is
    the basal sinus, the notch that makes a leaf read as a pothos and not as
    a generic spearhead. The midrib is lifted above the shoulders as a real
    V-crease, and a droop plus a mild lateral wave keep the blade from
    reading as a flat card from a three-quarter angle.
    """
    rows = 8
    cols = (-1.0, -0.55, 0.0, 0.55, 1.0)
    verts, uvs = [], []
    for r in range(rows + 1):
        t = r / rows
        if t <= peak:
            # Widens from the basal lobes out to the shoulder.
            half = lobe_width + (max_width / 2 - lobe_width) * math.sin(t / peak * math.pi / 2)
        else:
            # Drawn-out acuminate tip: width has to be well under half by the
            # three-quarter mark or the blade reads as a blunt shield.
            half = (max_width / 2) * (1 - (t - peak) / (1 - peak)) ** 0.62
        # The sinus: base rows pull backward, most at the outer edge. The
        # falloff reaches a third of the way up so the notch is a rounded
        # heart, not a sawn V.
        back = sinus * max(0.0, 1 - t / 0.34) ** 1.1
        x_wave = math.sin(t * math.pi * 1.25) * wave * t
        droop_y = -(t ** 1.6) * droop
        for xf in cols:
            ridge = fold * (1 - abs(xf) ** 0.85) * math.sin(min(1.0, t / peak) * math.pi / 2) * (1 - 0.2 * t)
            verts.append((half * xf + x_wave, droop_y + ridge, t * length - back * abs(xf) ** 0.55))
            uvs.append(((xf + 1) / 2, t))
    faces = []
    for r in range(rows):
        b, n = r * len(cols), (r + 1) * len(cols)
        for c in range(len(cols) - 1):
            faces.append((b + c, b + c + 1, n + c + 1, n + c))
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
    # Smooth across the crease: a leaf's midrib is a bend in the surface
    # normal, not a lit/unlit facet boundary.
    for face in bm.faces:
        face.smooth = True
    bm.to_mesh(mesh)
    bm.free()
    obj['open_surface'] = True  # a leaf blade is a real two-sided open shell
    PARTS.append(obj)
    return obj


# --- Planter: a 4-inch terracotta desk pot. Thick wall (~0.030 ft / 0.36 in)
# from sole to lip, a rolled rim bead, a footed base ring, and an interior
# soil seat recessed a watering-gap below the rim.
POT_H = 0.48
R_TOP_OUT, R_BOT_OUT = 0.32, 0.24
WALL = 0.030
R_TOP_IN, R_BOT_IN = R_TOP_OUT - WALL, R_BOT_OUT - WALL
SOIL_SEAT_Y = 0.30
pot_profile = [
    (0.00, 0.00),                          # base centre (solid sole)
    (R_BOT_OUT, 0.00),                     # outer sole edge
    (R_BOT_OUT, 0.030),                    # footed base ring
    (R_BOT_OUT - 0.018, 0.048),
    (R_TOP_OUT - 0.020, POT_H - 0.055),    # tapered outer wall
    (R_TOP_OUT, POT_H - 0.038),            # flares into the lip
    (R_TOP_OUT + 0.016, POT_H - 0.010),    # rolled bead, outer
    (R_TOP_OUT - 0.006, POT_H),            # bead crown
    (R_TOP_IN, POT_H - 0.018),             # bead, inner
    (R_TOP_IN, POT_H - 0.070),             # down the inner wall
    (R_BOT_IN + 0.030, SOIL_SEAT_Y + 0.035),
    (R_BOT_IN, SOIL_SEAT_Y),               # interior soil-seat floor
    (0.00, SOIL_SEAT_Y),                   # floor centre, closes the revolve
]
lathe('Pot', pot_profile, POT_FINISH)

saucer_profile = [
    (0.00, 0.00),
    (R_BOT_OUT + 0.06, 0.00),
    (R_BOT_OUT + 0.06, 0.032),
    (R_BOT_OUT + 0.036, 0.048),
    (R_BOT_OUT - 0.04, 0.028),
    (R_BOT_OUT - 0.08, 0.014),
    (0.00, 0.014),
]
lathe('Saucer', saucer_profile, POT_FINISH, sides=16)

soil_r = R_BOT_IN + (R_TOP_IN - R_BOT_IN) * (SOIL_SEAT_Y / POT_H)
soil_profile = [
    (0.00, 0.00),
    (soil_r, 0.00),
    (soil_r * 0.97, 0.028),
    (soil_r * 0.55, 0.052),
    (0.00, 0.060),
]
lathe('Soil', soil_profile, SOIL, sides=14)

# --- Vines: two unit-span (local Z 0..1) cascade templates. Placed by the
# runtime with local +Z swung out over the rim, so the authored +X bow IS the
# hang: A trails ~1.05 units below its own span, B nearly 1.4. The runtime
# scales each copy uniformly, so a shorter vine is also a thinner one.
vine_a = [
    (0.00, 0.00, 0.028), (0.09, 0.30, 0.024),
    (0.30, 0.60, 0.020), (0.64, 0.84, 0.015), (1.05, 1.00, 0.010),
]
vine_b = [
    (0.00, 0.00, 0.025), (0.14, 0.28, 0.021),
    (0.44, 0.56, 0.017), (0.86, 0.80, 0.013), (1.35, 0.96, 0.009),
]
tube('VineA', vine_a, STEM, sides=6)
tube('VineB', vine_b, STEM, sides=6)

# --- Petiole: the short leaf stalk. Every blade in this plant hangs off one
# of these rather than floating at a vine node, which is what makes the
# attachment read at all from a counter's arm-length viewing distance.
petiole = [(0.00, 0.00, 0.016), (0.03, 0.50, 0.013), (0.09, 1.00, 0.010)]
tube('Petiole', petiole, STEM, sides=5)

# --- Blades: two cordate silhouettes for varied growth. The runtime jitters
# scale and rotation per instance on top of these two shapes.
cordate_leaf('LeafA', length=0.31, max_width=0.25, peak=0.26, lobe_width=0.086,
             sinus=0.062, fold=0.022, droop=0.045, wave=0.018, mat=LEAF)
cordate_leaf('LeafB', length=0.245, max_width=0.19, peak=0.24, lobe_width=0.066,
             sinus=0.048, fold=0.018, droop=0.055, wave=0.024, mat=LEAF)

triangles = sum(len(o.data.polygons) if all(len(p.vertices) == 3 for p in o.data.polygons)
                else sum(len(p.vertices) - 2 for p in o.data.polygons)
                for o in PARTS)

bpy.ops.object.select_all(action='DESELECT')
for i, obj in enumerate(PARTS):
    # Editable source spreads the parts out so their construction stays visible.
    obj.location.x = i * 0.9
    obj.select_set(True)
bpy.context.view_layer.objects.active = PARTS[0]
for area in (bpy.context.screen.areas if bpy.context.screen else ()):
    if area.type == 'VIEW_3D':
        area.spaces.active.region_3d.view_distance = 4
        area.spaces.active.region_3d.view_location = (3.2, 0, 0.4)
        area.spaces.active.shading.type = 'MATERIAL'
bpy.context.scene.unit_settings.system = 'IMPERIAL'
bpy.context.scene.unit_settings.scale_length = 0.3048
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'tools/models/pothos.blend'), compress=True)
bpy.ops.export_scene.gltf(filepath=str(OUT / 'pothos-components.glb'), export_format='GLB',
                          use_selection=True, export_yup=True, export_apply=True)
print(f'POTHOS KIT: {len(PARTS)} parts, {triangles} triangles, no textures')
