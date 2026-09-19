"""Two-door queue drinks cooler (Commission #197).
Feet; Blender (x, -store_z, height), floor-centred origin.
Reproduce: blender -b -t 2 -P tools/models/two-door-cooler.py
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
        p.inputs['IOR'].default_value = 1.52
        p.inputs['Coat Weight'].default_value = 0.30
        p.inputs['Coat Roughness'].default_value = 0.05
    return m

m_cabinet = make_mat('CoolerCabinet', (0.10, 0.11, 0.12), 0.35, metal=0.15)
m_interior = make_mat('CoolerInteriorWhite', (0.92, 0.93, 0.94), 0.30)
m_grille = make_mat('CoolerGrilleDark', (0.05, 0.05, 0.06), 0.70, metal=0.50)
m_frame = make_mat('CoolerDoorFrame', (0.15, 0.16, 0.18), 0.25, metal=0.85)
m_handle = make_mat('CoolerHandleMetal', (0.75, 0.78, 0.82), 0.15, metal=0.95)
m_glass = make_mat('CoolerGlass', (0.85, 0.93, 0.95), 0.05, alpha=0.15)
m_wire = make_mat('CoolerWireShelf', (0.88, 0.90, 0.92), 0.25, metal=0.40)
m_header = make_mat('CoolerHeaderSign', (0.95, 0.95, 0.90), 0.20)
m_can_red = make_mat('DrinkCanRed', (0.85, 0.08, 0.10), 0.30, metal=0.60)
m_can_blue = make_mat('DrinkCanBlue', (0.08, 0.25, 0.85), 0.30, metal=0.60)
m_can_green = make_mat('DrinkCanGreen', (0.10, 0.75, 0.20), 0.30, metal=0.60)
m_bottle = make_mat('DrinkBottleAmber', (0.80, 0.65, 0.20), 0.20, alpha=0.65)

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

# Dimensions: W=4.0 ft, D=2.3 ft, H=6.5 ft
# 1. Main Outer Insulated Cabinet
# Left/Right outer walls:
box('CabinetLeftWall', (-1.96, 0, 3.25), (0.08, 2.30, 6.50), m_cabinet, bevel=0.005)
box('CabinetRightWall', (1.96, 0, 3.25), (0.08, 2.30, 6.50), m_cabinet, bevel=0.005)
# Top and bottom slabs:
box('CabinetTopSlab', (0, 0, 6.46), (4.00, 2.30, 0.08), m_cabinet, bevel=0.005)
box('CabinetBottomBase', (0, 0, 0.04), (4.00, 2.30, 0.08), m_cabinet, bevel=0.005)
# Back insulated wall:
box('CabinetBackWall', (0, 1.11, 3.25), (3.84, 0.08, 6.34), m_interior, bevel=0.004)

# 2. Lower Compressor Compartment & Intake Louvers (Z: 0.08 to 0.90 ft)
box('CompressorInteriorDeck', (0, 0, 0.90), (3.84, 2.14, 0.06), m_interior, bevel=0.004)
box('CompressorLowerFrontFrame', (0, -1.11, 0.49), (3.84, 0.06, 0.76), m_grille, bevel=0.003)
for l_idx in range(5):
    lz = 0.22 + l_idx * 0.12
    box(f'IntakeLouver_{l_idx}', (0, -1.14, lz), (3.50, 0.03, 0.06), m_frame, bevel=0.002)

# 3. Top Header Lightbox (Z: 5.60 to 6.42 ft)
box('HeaderDividerShelf', (0, 0, 5.60), (3.84, 2.14, 0.06), m_interior, bevel=0.004)
box('HeaderBacklitSign', (0, -1.12, 6.01), (3.78, 0.03, 0.74), m_header, bevel=0.003)
box('HeaderBezelTop', (0, -1.13, 6.40), (3.84, 0.05, 0.05), m_frame, bevel=0.002)
box('HeaderBezelBottom', (0, -1.13, 5.62), (3.84, 0.05, 0.05), m_frame, bevel=0.002)

# 4. Interior Refrigerated Cavity & Wire Shelves (Z: 0.93 to 5.57 ft)
# Central mullion divider at front:
box('CenterDoorMullion', (0, -1.11, 3.25), (0.10, 0.08, 4.64), m_frame, bevel=0.003)

# 4 wire shelves:
shelf_heights = [1.85, 2.80, 3.75, 4.70]
for s_idx, sh_z in enumerate(shelf_heights):
    # Main shelf wire deck
    box(f'WireShelfDeck_{s_idx}', (0, 0.05, sh_z), (3.74, 1.95, 0.03), m_wire, bevel=0.002)
    # Front wire retaining lip
    box(f'WireShelfLip_{s_idx}', (0, -0.92, sh_z + 0.04), (3.74, 0.02, 0.06), m_wire, bevel=0.002)

    # Cans and bottles on each shelf
    for d_idx, dx in enumerate([-1.4, -0.9, -0.4, 0.4, 0.9, 1.4]):
        mat_can = [m_can_red, m_can_blue, m_can_green][(s_idx + d_idx) % 3]
        cylinder(f'DrinkCanFront_{s_idx}_{d_idx}', (dx, -0.65, sh_z + 0.22), 0.12, 0.40, mat_can, verts=14, bevel=0.002)
        cylinder(f'DrinkCanMid_{s_idx}_{d_idx}', (dx, -0.15, sh_z + 0.22), 0.12, 0.40, mat_can, verts=14, bevel=0.002)
        cylinder(f'DrinkBottleRear_{s_idx}_{d_idx}', (dx, 0.40, sh_z + 0.32), 0.13, 0.60, m_bottle, verts=14, bevel=0.002)

# 5. Framed Glass Double Doors (Left and Right)
# Left door center: X=-0.95. Right door center: X=0.95.
for d_side, cx in [('Left', -0.95), ('Right', 0.95)]:
    # Outer frame
    box(f'{d_side}DoorFrameTop', (cx, -1.13, 5.56), (1.80, 0.05, 0.08), m_frame, bevel=0.002)
    box(f'{d_side}DoorFrameBottom', (cx, -1.13, 0.96), (1.80, 0.05, 0.08), m_frame, bevel=0.002)
    box(f'{d_side}DoorFrameLeft', (cx - 0.86, -1.13, 3.26), (0.08, 0.05, 4.52), m_frame, bevel=0.002)
    box(f'{d_side}DoorFrameRight', (cx + 0.86, -1.13, 3.26), (0.08, 0.05, 4.52), m_frame, bevel=0.002)
    # Double-pane glass panel
    box(f'{d_side}DoorGlass', (cx, -1.13, 3.26), (1.64, 0.02, 4.48), m_glass, bevel=0.001)

    # Vertical full-length metal handle
    hx = cx + (0.75 if d_side == 'Left' else -0.75)
    cylinder(f'{d_side}DoorHandle', (hx, -1.22, 3.25), 0.035, 2.40, m_handle, verts=14, bevel=0.002)
    box(f'{d_side}HandleMountTop', (hx, -1.18, 4.40), (0.04, 0.06, 0.04), m_handle, bevel=0.001)
    box(f'{d_side}HandleMountBottom', (hx, -1.18, 2.10), (0.04, 0.06, 0.04), m_handle, bevel=0.001)

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

blend_path = ROOT / 'tools/models/two-door-cooler.blend'
glb_path = ROOT / 'public/models/two-door-cooler.glb'
json_path = ROOT / 'tools/models/two-door-cooler-metrics.json'

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
