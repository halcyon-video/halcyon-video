"""Secondary Service Counter (Customer Service, Express Return & Rewind Station).
Feet; Blender (x, -store_z, height), floor-centred origin.
Reproduce: blender -b -t 2 -P tools/models/secondary-service-counter.py
"""
import bpy, bmesh, math, json
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

m_laminate_body = make_mat('CounterLaminateBody', (0.92, 0.91, 0.89), 0.35)
m_countertop = make_mat('CounterTopLaminate', (0.85, 0.86, 0.87), 0.28)
m_accent_band = make_mat('CounterAccentBlue', (0.08, 0.18, 0.48), 0.30)
m_plinth = make_mat('CounterPlinthBlack', (0.12, 0.12, 0.13), 0.70)
m_chute_metal = make_mat('CounterChuteMetal', (0.75, 0.76, 0.78), 0.25, metal=0.85)
m_chute_interior = make_mat('CounterChuteInterior', (0.05, 0.05, 0.05), 0.80)
m_rewinder_body = make_mat('RewinderBodyBlack', (0.10, 0.10, 0.11), 0.40)
m_rewinder_button = make_mat('RewinderButtonRed', (0.80, 0.15, 0.15), 0.30)
m_acrylic = make_mat('SignAcrylicClear', (0.90, 0.95, 0.98), 0.08, alpha=0.18)
m_sign_card = make_mat('SignCardWhite', (0.95, 0.95, 0.95), 0.50)
m_vhs_black = make_mat('VhsCaseBlack', (0.12, 0.12, 0.12), 0.40)
m_vhs_label = make_mat('VhsLabelWhite', (0.88, 0.88, 0.85), 0.60)

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

# Dimensions:
# Total Width: 5.2 ft (across X)
# Total Depth: 2.8 ft (customer facing -Y, clerk facing +Y)
# Countertop Height: 3.1 ft (Z)

# 1. Base / Plinth / Toe Kick (Z: 0 to 0.25 ft)
# Inset 0.15 ft from front and sides, flush or open at back
box('CounterPlinth', (0, -0.05, 0.125), (4.90, 2.50, 0.25), m_plinth, bevel=0.005)

# 2. Main Carcass (Z: 0.25 to 2.95 ft)
# Front face panel (facing customer -Y):
box('CounterFrontPanel', (0, -1.30, 1.60), (5.10, 0.08, 2.70), m_laminate_body, bevel=0.004)
# Left side end panel:
box('CounterEndPanelLeft', (-2.51, 0, 1.60), (0.08, 2.68, 2.70), m_laminate_body, bevel=0.004)
# Right side end panel:
box('CounterEndPanelRight', (2.51, 0, 1.60), (0.08, 2.68, 2.70), m_laminate_body, bevel=0.004)
# Internal center vertical divider (Z: 0.25 to 2.95 ft):
box('CounterCenterDivider', (0.20, 0.05, 1.60), (0.08, 2.50, 2.70), m_laminate_body, bevel=0.004)

# Upper accent band below counter edge (front and outer sides, Z: 2.75 to 2.95 ft):
box('AccentBandFront', (0, -1.32, 2.85), (5.12, 0.04, 0.20), m_accent_band, bevel=0.003)
box('AccentBandLeft', (-2.53, 0, 2.85), (0.04, 2.68, 0.20), m_accent_band, bevel=0.003)
box('AccentBandRight', (2.53, 0, 2.85), (0.04, 2.68, 0.20), m_accent_band, bevel=0.003)

# 3. Clerk Side Interior Shelves (Y from -1.2 to +1.2):
# Left bay (X: -2.45 to +0.15, tape return bin reception area)
box('ShelfFloorLeft', (-1.15, 0.05, 0.30), (2.60, 2.45, 0.06), m_laminate_body, bevel=0.003)
box('ShelfMidLeft', (-1.15, 0.05, 1.50), (2.60, 2.45, 0.06), m_laminate_body, bevel=0.003)
# Right bay (X: +0.25 to +2.45, supply shelves)
box('ShelfFloorRight', (1.35, 0.05, 0.30), (2.20, 2.45, 0.06), m_laminate_body, bevel=0.003)
box('ShelfMidRight', (1.35, 0.05, 1.20), (2.20, 2.45, 0.06), m_laminate_body, bevel=0.003)
box('ShelfUpperRight', (1.35, 0.05, 2.10), (2.20, 2.45, 0.06), m_laminate_body, bevel=0.003)

# 4. Countertop (Z: 2.95 to 3.08 ft)
# Overhangs front by 0.15 ft, sides by 0.08 ft
box('CountertopMain', (0, -0.02, 3.015), (5.30, 2.85, 0.13), m_countertop, bevel=0.006)

# 5. Quick-Drop / Express Return Chute (on the customer-right side, X: +1.40, Y: -0.50):
# Metal chute bezel on counter
box('ReturnChuteBezel', (1.40, -0.50, 3.085), (1.10, 0.45, 0.03), m_chute_metal, bevel=0.002)
# Chute opening aperture
box('ReturnChuteSlot', (1.40, -0.50, 3.09), (0.90, 0.25, 0.01), m_chute_interior, bevel=0.001)

# 6. Commercial Dual-Deck VHS Rewinder Station (X: -1.20, Y: -0.10, Z: 3.08 to 3.45):
# Rewinder main body
box('RewinderChassis', (-1.20, -0.10, 3.22), (1.30, 0.85, 0.28), m_rewinder_body, bevel=0.005)
# Dual tape well insets
box('RewinderWellLeft', (-1.55, -0.10, 3.32), (0.45, 0.65, 0.08), m_chute_interior, bevel=0.002)
box('RewinderWellRight', (-0.85, -0.10, 3.32), (0.45, 0.65, 0.08), m_chute_interior, bevel=0.002)
# Eject / control buttons
box('RewinderButton1', (-1.75, 0.22, 3.34), (0.12, 0.10, 0.04), m_rewinder_button, bevel=0.001)
box('RewinderButton2', (-1.05, 0.22, 3.34), (0.12, 0.10, 0.04), m_rewinder_button, bevel=0.001)

# Tape in rewinder left well
box('RewinderTapeLeft', (-1.55, -0.10, 3.36), (0.40, 0.60, 0.10), m_vhs_black, bevel=0.002)

# 7. Acrylic Service Sign Stand (X: 0.10, Y: -0.60, Z: 3.08 to 3.75):
box('SignAcrylicBase', (0.10, -0.60, 3.10), (0.80, 0.30, 0.04), m_acrylic, bevel=0.002)
box('SignAcrylicFrame', (0.10, -0.60, 3.42), (0.75, 0.04, 0.60), m_acrylic, bevel=0.002)
box('SignInformationCard', (0.10, -0.60, 3.42), (0.70, 0.02, 0.55), m_sign_card, bevel=0.001)

# 8. Stack of returned tapes staged on the clerk's mid shelf (left bay):
for t_idx in range(5):
    tz = 1.56 + t_idx * 0.12
    box(f'ReturnedTapeCase_{t_idx}', (-1.15, -0.20, tz), (0.85, 0.45, 0.11), m_vhs_black, bevel=0.002)
    box(f'ReturnedTapeLabel_{t_idx}', (-0.72, -0.20, tz), (0.01, 0.40, 0.08), m_vhs_label, bevel=0.001)

# 9. Supply boxes on right shelves:
box('SupplyBox1', (1.20, -0.20, 1.45), (0.90, 0.70, 0.44), m_laminate_body, bevel=0.003)
box('SupplyBox2', (1.20, 0.40, 1.45), (0.80, 0.50, 0.44), m_laminate_body, bevel=0.003)
box('TapeSparesBox', (1.30, 0.10, 2.30), (1.10, 0.80, 0.35), m_laminate_body, bevel=0.003)

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

blend_path = ROOT / 'tools/models/secondary-service-counter.blend'
glb_path = ROOT / 'public/models/secondary-service-counter.glb'
json_path = ROOT / 'tools/models/secondary-service-counter-metrics.json'

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
