"""Original 4-foot acrylic popcorn bin display.
Feet; Blender (x, -store_z, height), floor-centred origin.
Reproduce: blender -b -t 2 -P tools/models/acrylic-popcorn-bin.py
"""
import bpy, bmesh, math, json
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
scene = bpy.context.scene
scene.unit_settings.system = 'IMPERIAL'
scene.unit_settings.scale_length = 0.3048

parts = []

def make_mat(name, color, roughness, metal=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.diffuse_color = (*color, alpha)
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*color, 1.0)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metal
    p.inputs['Alpha'].default_value = alpha
    if alpha < 1.0:
        m.surface_render_method = 'DITHERED'
        p.inputs['IOR'].default_value = 1.49
        p.inputs['Coat Weight'].default_value = 0.35
        p.inputs['Coat Roughness'].default_value = 0.08
    return m

m_plinth = make_mat('PopcornPlinth', (0.08, 0.09, 0.10), 0.70)
m_laminate = make_mat('PopcornLaminate', (0.12, 0.14, 0.18), 0.40)
m_acrylic = make_mat('PopcornClearAcrylic', (0.85, 0.92, 0.95), 0.08, alpha=0.18)
m_carton_yellow = make_mat('PopcornCartonYellow', (0.94, 0.76, 0.18), 0.55)
m_carton_red = make_mat('PopcornCartonRed', (0.82, 0.12, 0.15), 0.50)
m_tub_white = make_mat('PopcornTubWhite', (0.95, 0.94, 0.90), 0.45)
m_tub_rim = make_mat('PopcornTubRim', (0.88, 0.20, 0.15), 0.40)

def finish(o, name, m, bevel=0.004):
    o.name = name
    o.data.materials.append(m)
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = o.modifiers.new('Bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    assert all(e.is_manifold for e in bm.edges), f"Non-manifold in {name}"
    bm.to_mesh(o.data)
    bm.free()
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(island_margin=0.015)
    bpy.ops.object.mode_set(mode='OBJECT')
    o['partRole'] = name
    parts.append(o)
    return o

def box(name, loc, dims, m, bevel=0.004):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.dimensions = dims
    return finish(o, name, m, bevel)

def cylinder(name, loc, r, h, m, verts=24, bevel=0.003):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc)
    o = bpy.context.object
    return finish(o, name, m, bevel)

# 1. Base / Pedestal (Total base height 2.2 ft)
# Recessed kick: 1.6 x 1.6 ft, 0.15 ft high
box('PedestalToeKick', (0, 0, 0.075), (1.6, 1.6, 0.15), m_plinth, bevel=0.005)
# Pedestal main column: 1.76 x 1.76 ft, 1.95 ft high (Z: 0.15 to 2.10)
box('PedestalCarcass', (0, 0, 1.125), (1.76, 1.76, 1.95), m_laminate, bevel=0.006)
# Top collar/deck: 1.82 x 1.82 ft, 0.10 ft high (Z: 2.10 to 2.20)
box('PedestalTopDeck', (0, 0, 2.15), (1.82, 1.82, 0.10), m_laminate, bevel=0.008)

# 2. Acrylic Hopper / Bin (Z: 2.20 to 4.00, total height 1.80 ft)
# Bottom acrylic plate: 1.74 x 1.74 ft, 0.02 ft thick (Z: 2.20 to 2.22)
box('BinBasePlate', (0, 0, 2.21), (1.74, 1.74, 0.02), m_acrylic, bevel=0.002)
# Back wall: 1.76 ft wide, 0.02 ft thick, 1.78 ft tall (Z: 2.22 to 4.00)
box('BinBackWall', (0, 0.87, 3.11), (1.76, 0.02, 1.78), m_acrylic, bevel=0.002)
# Left wall: 0.02 ft thick, 1.72 ft deep, 1.78 ft tall
box('BinLeftWall', (-0.87, 0, 3.11), (0.02, 1.72, 1.78), m_acrylic, bevel=0.002)
# Right wall: 0.02 ft thick, 1.72 ft deep, 1.78 ft tall
box('BinRightWall', (0.87, 0, 3.11), (0.02, 1.72, 1.78), m_acrylic, bevel=0.002)
# Front wall (lower access lip for customer reach): 1.76 ft wide, 0.02 ft thick, 1.25 ft tall (Z: 2.22 to 3.47)
box('BinFrontWall', (0, -0.87, 2.845), (1.76, 0.02, 1.25), m_acrylic, bevel=0.002)
# Top rear canopy / hinge rail: 1.76 ft wide, 0.50 ft deep, 0.02 ft thick at Z=3.99
box('BinTopHeader', (0, 0.62, 3.99), (1.76, 0.50, 0.02), m_acrylic, bevel=0.002)
# Hinged clear lid tilted slightly open: 1.74 ft wide, 1.25 ft deep, 0.02 ft thick
box('BinClearLid', (0, -0.22, 3.86), (1.74, 1.25, 0.02), m_acrylic, bevel=0.002)

# 3. Merchandised Stock Inside Bin (Popcorn boxes and tubs)
carton_coords = [
    (-0.45, -0.35, 2.38, 0.15, m_carton_yellow),
    (0.00, -0.38, 2.38, -0.10, m_carton_red),
    (0.45, -0.32, 2.38, 0.05, m_carton_yellow),
    (-0.35, 0.10, 2.45, 0.28, m_carton_red),
    (0.20, 0.15, 2.45, -0.22, m_carton_yellow),
    (-0.10, -0.15, 2.62, 0.12, m_carton_red),
    (0.38, -0.10, 2.62, -0.18, m_carton_yellow),
    (-0.40, 0.45, 2.50, -0.05, m_carton_yellow),
    (0.35, 0.48, 2.50, 0.20, m_carton_red),
    (-0.15, 0.35, 2.75, 0.10, m_carton_yellow),
    (0.25, 0.30, 2.75, -0.15, m_carton_red),
]
for i, (cx, cy, cz, rot, mat) in enumerate(carton_coords):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(cx, cy, cz))
    o = bpy.context.object
    o.dimensions = (0.55, 0.40, 0.20)
    o.rotation_euler = (0.05 * (i % 3 - 1), 0.08 * (i % 2 - 1), rot)
    finish(o, f'PopcornCarton_{i}', mat, bevel=0.003)

tub_coords = [
    (-0.30, -0.15, 2.95),
    (0.28, -0.12, 2.95),
    (0.00, 0.25, 3.05),
]
for j, (tx, ty, tz) in enumerate(tub_coords):
    cylinder(f'PopcornTubBody_{j}', (tx, ty, tz), 0.22, 0.48, m_tub_white, verts=20, bevel=0.002)
    cylinder(f'PopcornTubRim_{j}', (tx, ty, tz + 0.23), 0.23, 0.04, m_tub_rim, verts=20, bevel=0.002)

metrics = {
    'units': 'feet',
    'origin': 'floor-centred; X across, Y in-depth, Z up (Blender)',
    'parts': []
}
for o in parts:
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bad = sum(not e.is_manifold for e in bm.edges)
    bm.free()
    assert bad == 0, f"Nonmanifold in {o.name}"
    tri_count = sum(len(p.vertices) - 2 for p in o.data.polygons)
    metrics['parts'].append({
        'name': o.name,
        'triangles': tri_count,
        'nonmanifoldEdges': bad,
        'uv': bool(o.data.uv_layers)
    })
    o.modifiers.new('Triangulate', 'TRIANGULATE')

coords = [o.matrix_world @ Vector(v.co) for o in parts for v in o.data.vertices]
metrics['boundsBlender'] = {
    'min': [float(min(v[i] for v in coords)) for i in range(3)],
    'max': [float(max(v[i] for v in coords)) for i in range(3)]
}
metrics['triangles'] = sum(p['triangles'] for p in metrics['parts'])

blend_path = ROOT / 'tools/models/acrylic-popcorn-bin.blend'
glb_path = ROOT / 'public/models/acrylic-popcorn-bin.glb'
json_path = ROOT / 'tools/models/acrylic-popcorn-bin-metrics.json'

bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
bpy.ops.export_scene.gltf(
    filepath=str(glb_path),
    export_format='GLB',
    export_yup=True,
    export_apply=True
)
metrics['glbBytes'] = glb_path.stat().st_size
json_path.write_text(json.dumps(metrics, indent=2) + '\n')
print(f"Exported {glb_path.name}: {metrics['triangles']} tris, {metrics['glbBytes']} bytes")
