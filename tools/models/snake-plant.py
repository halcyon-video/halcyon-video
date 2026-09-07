"""Editable snake-plant construction kit for the mom-and-pop store.

Run: blender -b -t 2 --python tools/models/snake-plant.py

The kit contains a thick-walled glazed planter and three genuinely curved,
creased Sansevieria blade templates.  The runtime assembles the templates into
the existing deterministic plant and keeps the original placement contract.
"""
import math
from pathlib import Path

import bmesh
import bpy

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/models'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for old in list(bpy.data.materials):
    bpy.data.materials.remove(old)

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


POT_FINISH = material('SnakePlantGlaze', (0.737, 0.707, 0.650), 0.28, 0.08)
SOIL = material('SnakePlantSoil', (0.133, 0.089, 0.066), 0.95)
LEAF = material('SnakePlantLeaf', (0.118, 0.282, 0.137), 0.44, 0.02)


def finish_closed(obj, mat):
    obj.data.materials.append(mat)
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
    for face in bm.faces:
        face.smooth = True
    bad = [edge for edge in bm.edges if not edge.is_manifold]
    assert not bad, f'{obj.name}: {len(bad)} non-manifold edges'
    assert bm.calc_volume() > 0, f'{obj.name}: inward normals'
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    PARTS.append(obj)
    return obj


def lathe(name, profile, mat, sides=20):
    bm = bmesh.new()
    verts = [bm.verts.new((radius, 0, height)) for radius, height in profile]
    edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1),
                   angle=math.tau, steps=sides, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish_closed(obj, mat)


def sword_blade(name, width, shoulder, trough, bow, twist, lean):
    """Five-column blade with a concave channel, twist and grown-in bow."""
    rows = 12
    columns = (-1.0, -0.48, 0.0, 0.48, 1.0)
    verts, uvs = [], []
    for row in range(rows + 1):
        t = row / rows
        if t < shoulder:
            half = width * 0.5 * (0.62 + 0.38 * math.sin(t / shoulder * math.pi / 2))
        else:
            half = width * 0.5 * max(0.005, (1 - (t - shoulder) / (1 - shoulder)) ** 1.35)
        centre_x = bow * (t ** 1.55) + math.sin(t * math.pi * 1.35) * width * 0.07
        centre_y = lean * (t ** 1.7)
        turn = twist * t
        for column in columns:
            x0 = half * column
            # The midrib sits behind the margins, making the deep channel that
            # keeps a broad blade legible from oblique views.
            depth = -trough * (1 - abs(column) ** 1.35) * math.sin(math.pi * min(1, t / 0.82))
            x = centre_x + x0 * math.cos(turn) - depth * math.sin(turn)
            y = centre_y + x0 * math.sin(turn) + depth * math.cos(turn)
            verts.append((x, y, t))
            uvs.append(((column + 1) / 2, t))
    faces = []
    for row in range(rows):
        base, nxt = row * len(columns), (row + 1) * len(columns)
        for column in range(len(columns) - 1):
            faces.append((base + column, base + column + 1,
                          nxt + column + 1, nxt + column))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(LEAF)
    uv = mesh.uv_layers.new(name='BladeUV')
    for polygon in mesh.polygons:
        polygon.use_smooth = True
        for loop_index in polygon.loop_indices:
            uv.data[loop_index].uv = uvs[mesh.loops[loop_index].vertex_index]
    obj['open_surface'] = True
    PARTS.append(obj)
    return obj


# Warm cream glazed planter.  The wall rolls over a rounded lip and returns to
# a recessed soil seat; it is not the old open-ended cylinder plus a loose rim.
POT_H = 1.0
R_TOP_OUT, R_TOP_IN = 0.48, 0.423
R_BOT_OUT, R_BOT_IN = 0.40, 0.353
SOIL_SEAT = 0.82
lathe('Pot', [
    (0.0, 0.0), (R_BOT_OUT, 0.0), (R_BOT_OUT, 0.04),
    (R_BOT_OUT - 0.018, 0.065), (R_TOP_OUT - 0.02, POT_H - 0.075),
    (R_TOP_OUT, POT_H - 0.042), (R_TOP_OUT + 0.014, POT_H - 0.014),
    (R_TOP_OUT - 0.004, POT_H), (R_TOP_IN, POT_H - 0.025),
    (R_TOP_IN, POT_H - 0.09), (R_BOT_IN + 0.035, SOIL_SEAT + 0.035),
    (R_BOT_IN, SOIL_SEAT), (0.0, SOIL_SEAT),
], POT_FINISH)
lathe('Saucer', [
    (0.0, 0.0), (R_BOT_OUT + 0.08, 0.0), (R_BOT_OUT + 0.08, 0.04),
    (R_BOT_OUT + 0.045, 0.062), (R_BOT_OUT - 0.045, 0.036),
    (R_BOT_OUT - 0.09, 0.014), (0.0, 0.014),
], POT_FINISH, sides=18)
soil_r = R_BOT_IN + (R_TOP_IN - R_BOT_IN) * (SOIL_SEAT / POT_H)
lathe('Soil', [
    (0.0, SOIL_SEAT), (soil_r, SOIL_SEAT),
    (soil_r * 0.97, SOIL_SEAT + 0.022),
    (soil_r * 0.58, SOIL_SEAT + 0.052), (0.0, SOIL_SEAT + 0.066),
], SOIL, sides=16)

# Three silhouettes are enough for the seeded runtime assembly to vary height,
# twist and lean without stamping one identical spear fifteen times.
sword_blade('BladeA', width=0.105, shoulder=0.29, trough=0.018,
            bow=0.055, twist=0.12, lean=0.025)
sword_blade('BladeB', width=0.125, shoulder=0.24, trough=0.022,
            bow=-0.035, twist=-0.18, lean=0.045)
sword_blade('BladeC', width=0.092, shoulder=0.34, trough=0.016,
            bow=0.025, twist=0.26, lean=-0.015)

triangles = sum(sum(len(face.vertices) - 2 for face in obj.data.polygons) for obj in PARTS)
bpy.ops.object.select_all(action='DESELECT')
for index, obj in enumerate(PARTS):
    obj.location.x = index * 0.9
    obj.select_set(True)
bpy.context.view_layer.objects.active = PARTS[0]
bpy.context.scene.unit_settings.system = 'IMPERIAL'
bpy.context.scene.unit_settings.scale_length = 0.3048
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'tools/models/snake-plant.blend'), compress=True)
bpy.ops.export_scene.gltf(filepath=str(OUT / 'snake-plant-components.glb'),
                          export_format='GLB', use_selection=True,
                          export_yup=True, export_apply=True)
print(f'SNAKE PLANT KIT: {len(PARTS)} parts, {triangles} triangles, no textures')
