"""Caster-base rotating peg merchandiser (#275).
Feet; Blender (x, -store_z, height), floor-centred origin.
Reproduce: blender -b -t 2 -P tools/models/rotating-merchandiser.py
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

def make_mat(name, color, roughness, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.diffuse_color = (*color, 1.0)
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*color, 1.0)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metal
    return m

m_chrome = make_mat('MerchandiserChrome', (0.80, 0.82, 0.85), 0.18, metal=0.92)
m_panel = make_mat('MerchandiserPanelDark', (0.10, 0.11, 0.13), 0.45, metal=0.20)
m_caster_rubber = make_mat('MerchandiserCasterRubber', (0.05, 0.05, 0.06), 0.85)
m_hook = make_mat('MerchandiserHookWire', (0.75, 0.77, 0.80), 0.22, metal=0.90)
m_pkg_cyan = make_mat('PackageCyan', (0.12, 0.58, 0.72), 0.40)
m_pkg_orange = make_mat('PackageOrange', (0.88, 0.45, 0.10), 0.40)
m_pkg_purple = make_mat('PackagePurple', (0.55, 0.15, 0.65), 0.40)
m_header = make_mat('HeaderSignCard', (0.92, 0.90, 0.82), 0.50)

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

def cylinder(name, loc, r, h, m, verts=20, bevel=0.002):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc)
    o = bpy.context.object
    return finish(o, name, m, bevel)

# 1. Base Hub and Arched Caster Legs (Sweep ~2.0 ft, 5 legs)
# Center hub cylinder: r=0.18 ft, h=0.15 ft at Z=0.35
cylinder('BaseHubCenter', (0, 0, 0.35), 0.18, 0.15, m_chrome, verts=24, bevel=0.004)

for i in range(5):
    angle = i * (2 * math.pi / 5)
    ca, sa = math.cos(angle), math.sin(angle)
    # Leg arm projecting out to r=0.92 ft
    lx, ly = 0.52 * ca, 0.52 * sa
    bpy.ops.mesh.primitive_cube_add(size=1, location=(lx, ly, 0.28))
    leg = bpy.context.object
    leg.dimensions = (0.75, 0.08, 0.06)
    leg.rotation_euler = (0, -0.15, angle)
    finish(leg, f'ArchedLeg_{i}', m_chrome, bevel=0.003)

    # Caster stem and wheel at leg tip
    cx, cy = 0.95 * ca, 0.95 * sa
    cylinder(f'CasterStem_{i}', (cx, cy, 0.18), 0.025, 0.12, m_chrome, verts=12, bevel=0.001)
    cylinder(f'CasterWheel_{i}', (cx, cy, 0.08), 0.07, 0.05, m_caster_rubber, verts=16, bevel=0.002)

# 2. Central Upright Mast (Height from 0.40 to 5.20 ft)
cylinder('CentralUprightMast', (0, 0, 2.80), 0.055, 4.80, m_chrome, verts=20, bevel=0.002)

# Rotating Collar Bearings (at bottom Z=1.15 and top Z=4.55)
cylinder('LowerRotatingCollar', (0, 0, 1.15), 0.09, 0.10, m_chrome, verts=20, bevel=0.002)
cylinder('UpperRotatingCollar', (0, 0, 4.55), 0.09, 0.10, m_chrome, verts=20, bevel=0.002)

# 3. Rotating Pegboard Display Panel (Width 1.60 ft, Height 3.40 ft, Thickness 0.04 ft, Z: 1.15 to 4.55)
box('PegboardMainPanel', (0, 0, 2.85), (1.60, 0.04, 3.40), m_panel, bevel=0.004)
# Perimeter tubular frame surrounding panel
box('PegboardFrameTop', (0, 0, 4.56), (1.64, 0.06, 0.04), m_chrome, bevel=0.002)
box('PegboardFrameBottom', (0, 0, 1.14), (1.64, 0.06, 0.04), m_chrome, bevel=0.002)
box('PegboardFrameLeft', (-0.81, 0, 2.85), (0.04, 0.06, 3.44), m_chrome, bevel=0.002)
box('PegboardFrameRight', (0.81, 0, 2.85), (0.04, 0.06, 3.44), m_chrome, bevel=0.002)

# 4. Peg Hooks & Hanging Merchandise (4 tiers per face, 3 columns per tier)
hook_tiers = [1.60, 2.30, 3.00, 3.70]
hook_cols = [-0.50, 0.0, 0.50]
pkg_mats = [m_pkg_cyan, m_pkg_orange, m_pkg_purple]

pkg_idx = 0
for face_sign in [-1, 1]:  # Front and rear faces
    fy = face_sign * 0.02
    for t_idx, hz in enumerate(hook_tiers):
        for c_idx, hx in enumerate(hook_cols):
            # Wire hook projecting outward
            hy = fy + face_sign * 0.22
            box(f'PegHook_{face_sign}_{t_idx}_{c_idx}', (hx, hy, hz), (0.015, 0.42, 0.015), m_hook, bevel=0.001)
            # Up-turned wire tip
            tip_y = fy + face_sign * 0.43
            box(f'HookTip_{face_sign}_{t_idx}_{c_idx}', (hx, tip_y, hz + 0.025), (0.015, 0.015, 0.05), m_hook, bevel=0.001)
            # Hanging blister pack
            p_mat = pkg_mats[(t_idx + c_idx) % 3]
            pkg_y = fy + face_sign * 0.28
            box(f'HangingCard_{face_sign}_{t_idx}_{c_idx}', (hx, pkg_y, hz - 0.22), (0.36, 0.015, 0.42), p_mat, bevel=0.002)
            # Blister bubble with item
            bubble_y = fy + face_sign * 0.31
            box(f'BlisterBubble_{face_sign}_{t_idx}_{c_idx}', (hx, bubble_y, hz - 0.24), (0.28, 0.045, 0.26), m_chrome, bevel=0.003)
            pkg_idx += 1

# 5. Top Header Sign Channel (Height 4.70 to 5.25 ft)
box('HeaderSignChannel', (0, 0, 4.68), (1.45, 0.04, 0.06), m_chrome, bevel=0.002)
box('HeaderSignCard', (0, 0, 4.96), (1.40, 0.015, 0.50), m_header, bevel=0.002)
box('HeaderSignTopCap', (0, 0, 5.22), (1.45, 0.04, 0.04), m_chrome, bevel=0.002)

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

blend_path = ROOT / 'tools/models/rotating-merchandiser.blend'
glb_path = ROOT / 'public/models/rotating-merchandiser.glb'
json_path = ROOT / 'tools/models/rotating-merchandiser-metrics.json'

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
