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

# Open, low acrylic tray: no canopy, lid, cartons or tubs.
box('BinBasePlate', (0, 0, 2.21), (1.74, 1.74, 0.02), m_acrylic, bevel=0.002)
for name,loc,dims in [
    ('Back',(0,.87,2.61),(1.76,.02,.78)),
    ('Left',(-.87,0,2.61),(.02,1.72,.78)),
    ('Right',(.87,0,2.61),(.02,1.72,.78)),
    ('Front',(0,-.87,2.51),(1.76,.02,.58))]:
    box('Bin'+name+'Wall',loc,dims,m_acrylic,bevel=.002)

# Individually sealed pillow bags: bulged shoulders and narrow crimped ends.
for i,(x,y) in enumerate([(x,y) for y in [-.48,0,.48] for x in [-.48,0,.48]]):
    rings=[(0,.15,.035),(.06,.21,.105),(.32,.23,.13),(.59,.20,.09),(.65,.15,.025)]
    verts=[]
    for z,halfwidth,halfdepth in rings:
        for k in range(8):
            t=2*math.pi*k/8
            verts.append((x+halfwidth*math.cos(t),y+halfdepth*math.sin(t),2.23+z))
    faces=[tuple(reversed(range(8)))]
    for r in range(len(rings)-1):
        for k in range(8):
            faces.append((r*8+k,r*8+(k+1)%8,(r+1)*8+(k+1)%8,(r+1)*8+k))
    faces.append(tuple(range(32,40)))
    mesh=bpy.data.meshes.new('SealedBagMesh');mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new('PopcornBag',mesh);scene.collection.objects.link(o)
    finish(o,f'PopcornBag_{i}',m_carton_yellow if i%2 else m_tub_white,bevel=.003)
    for z in [2.24,2.87]:
        box(f'BagCrimp_{i}_{z}',(x,y,z),(.31,.045,.025),m_carton_red,bevel=.002)

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
