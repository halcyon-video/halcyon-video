"""Commercial ice cream chest freezer.
Feet; Blender (x, -store_z, height), floor-centred origin.
Reproduce: blender -b -t 2 -P tools/models/chest-freezer.py
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
        p.inputs['IOR'].default_value = 1.50
        p.inputs['Coat Weight'].default_value = 0.30
        p.inputs['Coat Roughness'].default_value = 0.05
    return m

m_enamel = make_mat('FreezerEnamelWhite', (0.94, 0.94, 0.93), 0.25)
m_plinth = make_mat('FreezerToeKick', (0.08, 0.09, 0.10), 0.70)
m_bumper = make_mat('FreezerBumperGrey', (0.28, 0.30, 0.32), 0.60)
m_frame = make_mat('FreezerLidFrame', (0.78, 0.80, 0.82), 0.20, metal=0.85)
m_glass = make_mat('FreezerSlidingGlass', (0.86, 0.93, 0.95), 0.06, alpha=0.16)
m_handle = make_mat('FreezerLidHandle', (0.15, 0.16, 0.18), 0.40)
m_wire = make_mat('FreezerBasketWire', (0.90, 0.91, 0.92), 0.30, metal=0.20)
m_pint_choc = make_mat('IceCreamPintChoc', (0.35, 0.18, 0.10), 0.45)
m_pint_vanilla = make_mat('IceCreamPintVanilla', (0.95, 0.90, 0.65), 0.45)
m_pint_berry = make_mat('IceCreamPintBerry', (0.75, 0.15, 0.30), 0.45)
m_novelty = make_mat('IceCreamNoveltyPack', (0.12, 0.45, 0.80), 0.40)

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

def cylinder(name, loc, r, h, m, verts=16, bevel=0.002):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc)
    o = bpy.context.object
    return finish(o, name, m, bevel)

# Dimensions: W=3.8 ft, D=2.2 ft, H=2.8 ft
# 1. Base / Toe kick (Z: 0 to 0.20 ft)
box('FreezerBaseKick', (0, 0, 0.10), (3.60, 2.00, 0.20), m_plinth, bevel=0.006)

# 2. Main Insulated Body (Z: 0.20 to 2.65 ft)
# Lower body below bumper: Z 0.20 to 1.35 ft
box('FreezerLowerBody', (0, 0, 0.775), (3.78, 2.18, 1.15), m_enamel, bevel=0.006)
# Middle protective bumper rail: Z 1.35 to 1.55 ft
box('FreezerBumperRail', (0, 0, 1.45), (3.84, 2.24, 0.20), m_bumper, bevel=0.008)
# Upper body above bumper: Z 1.55 to 2.65 ft
box('FreezerUpperBody', (0, 0, 2.10), (3.78, 2.18, 1.10), m_enamel, bevel=0.006)

# 3. Top Surround & Sliding Glass Lids (Z: 2.65 to 2.80 ft)
# Perimeter top frame
box('TopFrameRear', (0, 1.02, 2.72), (3.78, 0.14, 0.14), m_frame, bevel=0.003)
box('TopFrameFront', (0, -1.02, 2.72), (3.78, 0.14, 0.14), m_frame, bevel=0.003)
box('TopFrameLeft', (-1.82, 0, 2.72), (0.14, 1.90, 0.14), m_frame, bevel=0.003)
box('TopFrameRight', (1.82, 0, 2.72), (0.14, 1.90, 0.14), m_frame, bevel=0.003)

# Left sliding glass lid (lower track, Z=2.70):
box('LeftSlidingLidGlass', (-0.90, 0, 2.71), (1.80, 1.88, 0.02), m_glass, bevel=0.002)
box('LeftLidHandle', (-0.25, 0, 2.74), (0.05, 0.50, 0.04), m_handle, bevel=0.002)

# Right sliding glass lid (upper track, Z=2.75):
box('RightSlidingLidGlass', (0.88, 0, 2.75), (1.80, 1.88, 0.02), m_glass, bevel=0.002)
box('RightLidHandle', (0.23, 0, 2.78), (0.05, 0.50, 0.04), m_handle, bevel=0.002)

# 4. Interior Wire Baskets & Merchandised Ice Cream
for b_idx, bx in enumerate([-0.90, 0.90]):
    # Wire basket rim & ribs
    box(f'BasketRim_{b_idx}', (bx, 0, 2.50), (1.45, 1.65, 0.03), m_wire, bevel=0.002)
    box(f'BasketFloor_{b_idx}', (bx, 0, 1.40), (1.40, 1.60, 0.02), m_wire, bevel=0.002)

    # Ice cream pints in left/right baskets
    for row_idx, ry in enumerate([-0.50, 0.0, 0.50]):
        for col_idx, cx_off in enumerate([-0.40, 0.0, 0.40]):
            px = bx + cx_off
            mat_p = [m_pint_choc, m_pint_vanilla, m_pint_berry][(b_idx + row_idx + col_idx) % 3]
            cylinder(f'IceCreamPint_{b_idx}_{row_idx}_{col_idx}', (px, ry, 1.65), 0.15, 0.35, mat_p, verts=14, bevel=0.002)

    # Novelty packs stacked in center
    for n_idx in range(3):
        box(f'NoveltyPack_{b_idx}_{n_idx}', (bx, -0.25 + n_idx * 0.25, 2.10), (0.60, 0.22, 0.30), m_novelty, bevel=0.003)

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

blend_path = ROOT / 'tools/models/chest-freezer.blend'
glb_path = ROOT / 'public/models/chest-freezer.glb'
json_path = ROOT / 'tools/models/chest-freezer-metrics.json'

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
