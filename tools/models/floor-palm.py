"""Editable floor-palm construction kit for the mom-and-pop store.

Run: blender -b -t 2 --python tools/models/floor-palm.py

Blender Z exports as Three.js Y.  The runtime assembles the named templates
into the two existing palm placements, retaining their frondScale/fanSpan
options while reducing the finished plant to four material-role draw calls.
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


POT_FINISH = material('PalmPotFinish', (0.749, 0.388, 0.231), 0.82, 0.04)
SOIL = material('PalmSoil', (0.133, 0.089, 0.066), 0.95)
STEM = material('PalmRachis', (0.118, 0.275, 0.102), 0.62)
LEAF = material('PalmLeaf', (0.118, 0.337, 0.133), 0.48, 0.02)


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


def tube(name, centerline, mat, sides=7):
    """Sweep tapered rings along an authored planar (x, z, radius) curve."""
    pts = [Vector((x, 0, z)) for x, z, _radius in centerline]
    radii = [radius for _x, _z, radius in centerline]
    rings = []
    for i, point in enumerate(pts):
        tangent = (pts[min(i + 1, len(pts) - 1)] - pts[max(0, i - 1)]).normalized()
        side_a = Vector((0, 1, 0))
        side_b = tangent.cross(side_a).normalized()
        rings.append([
            point + radii[i] * (math.cos(angle) * side_a + math.sin(angle) * side_b)
            for angle in (j / sides * math.tau for j in range(sides))
        ])
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
    return finish_closed(obj, mat)


def pinna(name, length, width, peak, fold, droop, wave):
    """A narrow palm leaflet with a real midrib fold and curved, tapered tip."""
    rows = 7
    columns = (-1.0, 0.0, 1.0)
    verts, uvs = [], []
    for row in range(rows + 1):
        t = row / rows
        if t <= peak:
            half = width * 0.5 * math.sin(t / peak * math.pi / 2) ** 0.65
        else:
            half = width * 0.5 * (1 - (t - peak) / (1 - peak)) ** 0.72
        centre_x = math.sin(t * math.pi * 1.25) * wave * t
        depth = -(t ** 1.7) * droop
        for column in columns:
            rib = fold * (1 - abs(column)) * math.sin(math.pi * t)
            verts.append((centre_x + half * column, depth + rib, length * t))
            uvs.append(((column + 1) / 2, t))
    faces = []
    for row in range(rows):
        base, nxt = row * 3, (row + 1) * 3
        faces += [(base, base + 1, nxt + 1, nxt),
                  (base + 1, base + 2, nxt + 2, nxt + 1)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(LEAF)
    uv = mesh.uv_layers.new(name='PinnaUV')
    for polygon in mesh.polygons:
        polygon.use_smooth = True
        for loop_index in polygon.loop_indices:
            uv.data[loop_index].uv = uvs[mesh.loops[loop_index].vertex_index]
    obj['open_surface'] = True
    PARTS.append(obj)
    return obj


# Thick-walled terracotta planter: a rolled lip, recessed soil seat and footed
# base are one continuous revolved section rather than intersecting cylinders.
POT_H = 1.30
R_TOP_OUT, R_TOP_IN = 0.62, 0.552
R_BOT_OUT, R_BOT_IN = 0.46, 0.405
SOIL_SEAT = 1.08
lathe('Pot', [
    (0.0, 0.0), (R_BOT_OUT, 0.0), (R_BOT_OUT, 0.045),
    (R_BOT_OUT - 0.025, 0.075), (R_TOP_OUT - 0.03, POT_H - 0.105),
    (R_TOP_OUT, POT_H - 0.07), (R_TOP_OUT + 0.025, POT_H - 0.018),
    (R_TOP_OUT - 0.008, POT_H), (R_TOP_IN, POT_H - 0.028),
    (R_TOP_IN, POT_H - 0.115), (R_BOT_IN + 0.055, SOIL_SEAT + 0.045),
    (R_BOT_IN, SOIL_SEAT), (0.0, SOIL_SEAT),
], POT_FINISH)
lathe('Saucer', [
    (0.0, 0.0), (R_BOT_OUT + 0.10, 0.0), (R_BOT_OUT + 0.10, 0.05),
    (R_BOT_OUT + 0.055, 0.078), (R_BOT_OUT - 0.055, 0.045),
    (R_BOT_OUT - 0.11, 0.018), (0.0, 0.018),
], POT_FINISH, sides=18)
soil_r = R_BOT_IN + (R_TOP_IN - R_BOT_IN) * (SOIL_SEAT / POT_H)
lathe('Soil', [
    (0.0, SOIL_SEAT), (soil_r, SOIL_SEAT),
    (soil_r * 0.97, SOIL_SEAT + 0.025),
    (soil_r * 0.58, SOIL_SEAT + 0.06), (0.0, SOIL_SEAT + 0.075),
], SOIL, sides=16)

# Reusable growth templates.  Runtime placement gives each cane and frond its
# own azimuth, lean and length; the two rachides prevent a stamped silhouette.
tube('Cane', [(0.0, 0.0, 0.030), (0.025, 0.38, 0.027),
              (-0.018, 0.72, 0.021), (0.04, 1.0, 0.014)], STEM, sides=7)
tube('RachisA', [(0.0, 0.0, 0.027), (0.08, 0.22, 0.024),
                 (0.20, 0.48, 0.019), (0.40, 0.74, 0.014),
                 (0.68, 1.0, 0.007)], STEM, sides=7)
tube('RachisB', [(0.0, 0.0, 0.025), (0.04, 0.20, 0.022),
                 (0.14, 0.46, 0.018), (0.34, 0.76, 0.012),
                 (0.58, 1.0, 0.006)], STEM, sides=7)
pinna('PinnaA', length=0.48, width=0.145, peak=0.24, fold=0.016, droop=0.052, wave=0.022)
pinna('PinnaB', length=0.39, width=0.112, peak=0.22, fold=0.013, droop=0.062, wave=-0.018)

triangles = sum(sum(len(face.vertices) - 2 for face in obj.data.polygons) for obj in PARTS)
bpy.ops.object.select_all(action='DESELECT')
for index, obj in enumerate(PARTS):
    obj.location.x = index * 0.9
    obj.select_set(True)
bpy.context.view_layer.objects.active = PARTS[0]
bpy.context.scene.unit_settings.system = 'IMPERIAL'
bpy.context.scene.unit_settings.scale_length = 0.3048
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'tools/models/floor-palm.blend'), compress=True)
bpy.ops.export_scene.gltf(filepath=str(OUT / 'floor-palm-components.glb'),
                          export_format='GLB', use_selection=True,
                          export_yup=True, export_apply=True)
print(f'FLOOR PALM KIT: {len(PARTS)} parts, {triangles} triangles, no textures')
