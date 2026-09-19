"""Wall candy gondola (Commission #195).
Feet; Blender (x, -store_z, height), floor-centred origin.
Reproduce: blender -b -t 2 -P tools/models/candy-wall-gondola.py
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
        p.inputs['Coat Weight'].default_value = 0.30
        p.inputs['Coat Roughness'].default_value = 0.05
    return m

m_steel = make_mat('GondolaSteelStandard', (0.15, 0.16, 0.18), 0.35, metal=0.80)
m_shelf = make_mat('GondolaGravityShelf', (0.18, 0.20, 0.22), 0.30, metal=0.60)
m_acrylic = make_mat('GondolaRetainingLip', (0.88, 0.94, 0.96), 0.08, alpha=0.18)
m_bracket = make_mat('GondolaBracket', (0.25, 0.26, 0.28), 0.25, metal=0.85)
m_candy_red = make_mat('CandyCartonRed', (0.85, 0.12, 0.15), 0.50)
m_candy_blue = make_mat('CandyCartonBlue', (0.12, 0.30, 0.85), 0.50)
m_candy_yellow = make_mat('CandyCartonYellow', (0.92, 0.75, 0.15), 0.50)
m_pouch_green = make_mat('SnackPouchGreen', (0.15, 0.70, 0.25), 0.40)
m_pouch_purple = make_mat('SnackPouchPurple', (0.60, 0.15, 0.70), 0.40)

def finish(o, name, m, bevel=0.003):
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

def box(name, loc, dims, m, bevel=0.003):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.dimensions = dims
    return finish(o, name, m, bevel)

# Dimensions: W=4.0 ft, D=1.4 ft, H=5.0 ft
# 1. Slotted Upright Wall Standards (Two vertical tracks, rear at Y=0.65)
for s_idx, sx in enumerate([-1.85, 1.85]):
    box(f'WallStandard_{s_idx}', (sx, 0.65, 2.50), (0.08, 0.08, 5.00), m_steel, bevel=0.003)
    # Foot stabilizer bracket resting on floor
    box(f'StandardFoot_{s_idx}', (sx, 0.40, 0.05), (0.08, 0.60, 0.10), m_steel, bevel=0.003)

# 2. Four Gravity-Feed Shelves (Z: 1.20, 2.20, 3.20, 4.20)
shelf_heights = [1.20, 2.20, 3.20, 4.20]
tray_angle = -0.15  # Tilted forward for gravity feed

for i, sz in enumerate(shelf_heights):
    # Shelf deck (3.90 ft wide, 1.10 ft deep, tilted forward)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.10, sz))
    tray = bpy.context.object
    tray.dimensions = (3.90, 1.10, 0.03)
    tray.rotation_euler = (tray_angle, 0, 0)
    finish(tray, f'GravityTray_{i}', m_shelf, bevel=0.002)

    # Brackets attaching shelf to standards
    for sx in [-1.85, 1.85]:
        box(f'ShelfBracket_{i}_{sx}', (sx, 0.40, sz + 0.08), (0.05, 0.55, 0.16), m_bracket, bevel=0.002)

    # Clear acrylic front retaining lip (3.90 ft wide, 0.20 ft tall)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -0.42, sz - 0.05))
    lip = bpy.context.object
    lip.dimensions = (3.90, 0.02, 0.22)
    lip.rotation_euler = (tray_angle, 0, 0)
    finish(lip, f'RetainingLip_{i}', m_acrylic, bevel=0.001)

    # Stocked merchandise on trays:
    # 8 facings per shelf
    for c in range(8):
        cx = -1.65 + c * 0.47
        if i < 2:
            # Theater candy cartons (#194)
            mat_c = [m_candy_red, m_candy_blue, m_candy_yellow][(i + c) % 3]
            bpy.ops.mesh.primitive_cube_add(size=1, location=(cx, -0.15, sz + 0.12))
            carton = bpy.context.object
            carton.dimensions = (0.42, 0.55, 0.18)
            carton.rotation_euler = (tray_angle, 0, 0)
            finish(carton, f'CandyCarton_{i}_{c}', mat_c, bevel=0.002)
        else:
            # Hanging snack pouches (#277)
            mat_p = [m_pouch_green, m_pouch_purple][(i + c) % 2]
            bpy.ops.mesh.primitive_cube_add(size=1, location=(cx, -0.15, sz + 0.14))
            pouch = bpy.context.object
            pouch.dimensions = (0.40, 0.45, 0.15)
            pouch.rotation_euler = (tray_angle, 0, 0)
            finish(pouch, f'SnackPouch_{i}_{c}', mat_p, bevel=0.002)

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

blend_path = ROOT / 'tools/models/candy-wall-gondola.blend'
glb_path = ROOT / 'public/models/candy-wall-gondola.glb'
json_path = ROOT / 'tools/models/candy-wall-gondola-metrics.json'

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
