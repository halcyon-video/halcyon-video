"""Author a fitted illuminated storefront canopy in Blender. Scene units: feet.

The 30-foot reference module is scaled along its run by the store shell. Its
cross-section, rolled hems and mounting depth remain full size. No lettering or
reference imagery is baked into this asset; the active brand supplies those.
Run: blender -b --python tools/models/storefront-awning.py
"""
import json
import math
from pathlib import Path

import bmesh
import bpy

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/models'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

MATERIALS = []
for name, color, roughness in [
    ('AwningFabric', (.018, .065, .27, 1), .63),
    ('AwningBinding', (.012, .025, .06, 1), .65),
    ('AwningFrame', (.15, .17, .20, 1), .38),
    ('AwningSoffit', (.88, .84, .70, 1), .70),
]:
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Roughness'].default_value = roughness
    MATERIALS.append(mat)


def mesh(name, verts, faces, role):
    data = bpy.data.meshes.new(name)
    # Store X, height, depth -> Blender X, -depth, height -> glTF Y up.
    data.from_pydata([(x, -z, y) for x, y, z in verts], [], faces)
    data.materials.append(MATERIALS[role])
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    # Physical, four-foot texture tiles; no wall or shadow baked into UVs.
    uv = data.uv_layers.new(name='SurfaceFeet')
    for poly in data.polygons:
        axis = max(range(3), key=lambda k: abs(poly.normal[k]))
        axes = [k for k in range(3) if k != axis]
        for li in poly.loop_indices:
            v = data.vertices[data.loops[li].vertex_index].co
            uv.data[li].uv = (v[axes[0]] / 4, v[axes[1]] / 4)
    return obj


def extrude_profile(name, profile, x0, x1, role):
    n = len(profile)
    verts = [(x, y, z) for x in [x0, x1] for z, y in profile]
    faces = [tuple(reversed(range(n))), tuple(range(n, 2*n))]
    faces += [(j, (j+1) % n, (j+1) % n+n, j+n) for j in range(n)]
    return mesh(name, verts, faces, role)


def tube(name, a, b, radius, role=2):
    from mathutils import Vector
    a, b = Vector(a), Vector(b)
    direction = (b-a).normalized()
    up = Vector((0, 1, 0)) if abs(direction.y) < .9 else Vector((0, 0, 1))
    u = direction.cross(up).normalized()
    v = direction.cross(u).normalized()
    verts = [tuple(p + radius*(u*math.cos(k*math.tau/8) + v*math.sin(k*math.tau/8)))
             for p in [a, b] for k in range(8)]
    faces = [tuple(reversed(range(8))), tuple(range(8, 16))]
    faces += [(k, (k+1) % 8, (k+1) % 8+8, k+8) for k in range(8)]
    return mesh(name, verts, faces, role)


# A shallow rounded crown over a broad vertical sign face. Unlike a quarter
# cylinder, the crown does not consume the whole height of the canopy.
outer = [(0, 3.3), (2.43, 3.3)]
for k in range(1, 25):
    a = math.pi/2 - k*math.pi/48
    outer.append((2.43 + .82*math.cos(a), 2.48 + .82*math.sin(a)))
outer += [(3.25, .10), (3.22, .04)]
inner = [(z-.035, y-.035) for z, y in reversed(outer)]
extrude_profile('Vinyl crown and face', outer+inner, -15, 15, 0)

# Fitted closed end panels, recessed from the fabric's hem at each end.
end_profile = [(0, .07)] + outer + [(3.19, .07)]
extrude_profile('Left fitted end', end_profile, -15, -14.95, 0)
extrude_profile('Right fitted end', end_profile, 14.95, 15, 0)
extrude_profile('Translucent soffit', [(.04, .02), (3.19, .02), (3.19, .07), (.04, .07)], -14.96, 14.96, 3)

# Bound vertical seams and curved crown seams, one per fabric panel. These
# have thickness and remain visible in oblique light, rather than painted ribs.
for j in range(9):
    x = -15 + j*3.75
    seam = [(z+.015, y+.012) for z, y in outer]
    seam += [(z-.018, y-.022) for z, y in reversed(outer)]
    extrude_profile(f'Panel seam {j+1:02}', seam, x-.016, x+.016, 1)
    # Real wall brackets behind the fabric, clear of the window heads.
    tube(f'Standoff {j+1:02}', (x, .13, .10), (x, .13, 3.12), .045)
    tube(f'Brace {j+1:02}', (x, 2.9, .10), (x, .13, 3.12), .035)

for y, z in [(.08, 3.23), (.12, .07), (3.27, .05)]:
    tube('Rolled continuous rail', (-15.02, y, z), (15.02, y, z), .048, 1)

# Join by finish: four draw calls, while preserving separate fitted parts in
# the editable source through named vertex groups.
for mat in MATERIALS:
    objects = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.data.materials[0] == mat]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        group = obj.vertex_groups.new(name=obj.name)
        group.add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].name = mat.name

metrics = {'units': 'feet', 'run': 30, 'height': 3.3, 'projection': 3.25, 'meshes': []}
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH':
        continue
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bad = sum(not e.is_manifold for e in bm.edges)
    bm.free()
    assert bad == 0, (obj.name, bad)
    obj.data.calc_loop_triangles()
    metrics['meshes'].append({'name': obj.name, 'triangles': len(obj.data.loop_triangles), 'nonManifoldEdges': bad})

OUT.mkdir(exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'tools/models/storefront-awning.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT / 'storefront-awning.glb'), export_format='GLB', export_yup=True, export_apply=True)
metrics['bytes'] = (OUT / 'storefront-awning.glb').stat().st_size
(ROOT / 'tools/models/storefront-awning-metrics.json').write_text(json.dumps(metrics, indent=2)+'\n')
print(json.dumps(metrics))
