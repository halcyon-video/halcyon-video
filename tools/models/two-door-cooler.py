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
cylinder_meshes = {}
bottle_meshes = {}

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

m_cabinet = make_mat('CoolerCabinet', (0.65, 0.025, 0.035), 0.35, metal=0.15)
m_interior = make_mat('CoolerInteriorWhite', (0.48, 0.51, 0.52), 0.60)
m_grille = make_mat('CoolerGrilleDark', (0.05, 0.05, 0.06), 0.70, metal=0.50)
m_frame = make_mat('CoolerDoorFrame', (0.018, 0.020, 0.023), 0.45, metal=0.25)
m_handle = make_mat('CoolerHandleMetal', (0.022, 0.024, 0.026), 0.48, metal=0.20)
m_glass = make_mat('CoolerGlass', (0.85, 0.93, 0.95), 0.05, alpha=0.15)
m_wire = make_mat('CoolerWireShelf', (0.88, 0.90, 0.92), 0.25, metal=0.40)
m_header = make_mat('CoolerHeaderSign', (0.65, 0.025, 0.035), 0.30)
m_back = make_mat('CoolerGalvanizedBack', (.37,.40,.42), .66, metal=.65)
m_lid = make_mat('DrinkAluminum', (.64,.66,.68), .24, metal=.92)
m_cap = make_mat('BottleCap', (.88,.88,.84), .48)
m_can_red = make_mat('DrinkCanRed', (0.85, 0.08, 0.10), 0.30, metal=0.60)
m_can_blue = make_mat('DrinkCanBlue', (0.08, 0.25, 0.85), 0.30, metal=0.60)
m_can_green = make_mat('DrinkCanGreen', (0.10, 0.75, 0.20), 0.30, metal=0.60)
m_bottle = make_mat('DrinkBottleAmber', (0.095, 0.035, 0.012), 0.24)
m_bottle_green = make_mat('DrinkBottleGreen', (.055,.20,.065), .26)
m_bottle_water = make_mat('DrinkBottleWater', (.18,.35,.41), .24)

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
        mod.segments = 1
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
    finish(o, name, m, bevel)
    key=(r,h,m.name,verts,bevel)
    if key in cylinder_meshes:
        old=o.data; o.data=cylinder_meshes[key]; bpy.data.meshes.remove(old)
    else:
        for poly in o.data.polygons: poly.use_smooth=abs(poly.normal.z)<.5
        cylinder_meshes[key]=o.data
    return o

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

# Red enamel sides and a separate galvanized service skin at the rear.
# These are construction finishes; licensed printed drop-ins remain private.
box('RearGalvanizedSkin', (0,1.157,3.55), (3.84,.024,5.68), m_back, bevel=.003)
box('RearCompressorRecess', (0,1.158,.47), (3.60,.024,.76), m_grille, bevel=.003)
for row in range(5):
    box(f'RearVentLouver_{row}', (0,1.18,.18+row*.14), (3.52,.03,.075), m_back, bevel=.003)
for side in [-1,1]:
    box(f'FrontBlackCaseStile_{side}', (side*1.955,-1.16,3.25), (.11,.08,6.50), m_frame)
    box(f'InnerCabinetLiner_{side}', (side*1.906,.0,3.25), (.024,2.14,4.64), m_interior)
for z in [.06,6.45]:
    box(f'FrontBlackCaseRail_{z}', (0,-1.16,z), (3.84,.08,.10), m_frame)

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

# Five close-stocked levels, ten bottles per row and four rows deep.
# Opaque colored PET/liquid avoids hundreds of transparent draw calls; the
# existing static retail batching merges equal finishes after loading.
shelf_heights = [1.08, 1.99, 2.90, 3.81, 4.72]
for s_idx, sh_z in enumerate(shelf_heights):
    for wire in range(20):
        box(f'WireShelfDeck_{s_idx}_{wire}', (-1.82+wire*3.64/19, .05, sh_z), (.018,1.95,.024), m_wire, bevel=0)
    box(f'WireShelfLip_{s_idx}', (0, -.94, sh_z+.03), (3.74,.026,.065), m_wire, bevel=.002)
    for d_idx in range(10):
        dx=-1.62+d_idx*.36
        label=[m_can_red,m_can_red,m_can_green,m_can_blue,m_can_blue][s_idx]
        liquid=[m_bottle,m_bottle,m_bottle_green,m_bottle,m_bottle_water][s_idx]
        for depth in range(4):
            yy=-.73+depth*.43
            name=f'DrinkBottle_{s_idx}_{d_idx}_{depth}'
            # Full eight-sided profiles at the glass; four-sided stock deeper
            # in the cabinet keeps the dense rows inside the fixture budget.
            # Rear labels and caps are material regions on the same closed mesh.
            count=8 if depth==0 else 4
            rings=[(0,.108),(.03,.142),(.27,.14),(.48,.14),(.61,.07),(.72,.055)]
            verts=[(dx+r*math.cos(k*math.tau/count),yy+r*math.sin(k*math.tau/count),sh_z+.025+zz) for zz,r in rings for k in range(count)]
            faces=[tuple(reversed(range(count))),tuple(range(5*count,6*count))]+[(q*count+k,q*count+(k+1)%count,(q+1)*count+(k+1)%count,(q+1)*count+k) for q in range(5) for k in range(count)]
            mesh=bpy.data.meshes.new(name+'Profile');mesh.from_pydata(verts,[],faces);mesh.update()
            obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj)
            finish(obj,name,liquid,bevel=0)
            if depth==0:
                cylinder(name+'Cap',(dx,yy,sh_z+.770),.064,.07,m_cap,verts=8,bevel=0)
                wrap=cylinder(name+'PrintedLabel',(dx,yy,sh_z+.385),.144,.19,label,verts=8,bevel=0)
                wrap['wrapHeight']=.19
            else:
                mesh.materials.append(label);mesh.materials.append(m_cap)
                for poly in mesh.polygons:
                    if poly.index==1: poly.material_index=2
                    elif poly.index>=2 and (poly.index-2)//count==2: poly.material_index=1
                uv=mesh.uv_layers.active
                for poly in mesh.polygons:
                    values=[]
                    for li in poly.loop_indices:
                        v=mesh.vertices[mesh.loops[li].vertex_index].co
                        values.append((li,(math.atan2(v.y-yy,v.x-dx)/math.tau+.75)%1,(v.z-sh_z-.295)/.21))
                    us=[u for _,u,_ in values]
                    for li,u,v in values:
                        if max(us)-min(us)>.5 and u<.5:u+=1
                        uv.data[li].uv=(u,v)

            # Blender linked meshes preserve all 200 physical bottles while
            # exporting each repeated profile only once per finish/level.
            key=(s_idx,depth==0)
            if key in bottle_meshes:
                proto,px,py=bottle_meshes[key]
                old=obj.data;obj.data=proto.data;bpy.data.meshes.remove(old)
                obj.location=(dx-px,yy-py,0)
            else:
                for poly in obj.data.polygons: poly.use_smooth=poly.index>=2
                bottle_meshes[key]=(obj,dx,yy)

# 5. Framed Glass Double Doors (Left and Right)
# Left door center: X=-0.95. Right door center: X=0.95.
for d_side, cx in [('Left', -0.95), ('Right', 0.95)]:
    # Outer frame
    box(f'{d_side}DoorFrameTop', (cx, -1.13, 5.56), (1.90, 0.085, 0.11), m_frame, bevel=0.002)
    box(f'{d_side}DoorFrameBottom', (cx, -1.13, 0.96), (1.90, 0.085, 0.11), m_frame, bevel=0.002)
    box(f'{d_side}DoorFrameLeft', (cx - 0.91, -1.13, 3.26), (0.11, 0.085, 4.52), m_frame, bevel=0.002)
    box(f'{d_side}DoorFrameRight', (cx + 0.91, -1.13, 3.26), (0.11, 0.085, 4.52), m_frame, bevel=0.002)
    # Double-pane glass panel
    box(f'{d_side}DoorGlass', (cx, -1.13, 3.26), (1.76, 0.02, 4.52), m_glass, bevel=0.001)

    # Vertical full-length metal handle
    hx = cx + (0.75 if d_side == 'Left' else -0.75)
    cylinder(f'{d_side}DoorHandle', (hx, -1.22, 3.25), 0.035, 2.40, m_handle, verts=14, bevel=0.002)
    box(f'{d_side}HandleMountTop', (hx, -1.18, 4.40), (0.04, 0.06, 0.04), m_handle, bevel=0.001)
    box(f'{d_side}HandleMountBottom', (hx, -1.18, 2.10), (0.04, 0.06, 0.04), m_handle, bevel=0.001)

# Continuous wrap UVs, seam facing the rear rather than chopped smart islands.
for o in parts:
 if o.data.materials[0].name.startswith('DrinkCan'):
  uv=o.data.uv_layers.active
  for face in o.data.polygons:
   coords=[]
   for li in face.loop_indices:
    v=o.data.vertices[o.data.loops[li].vertex_index].co
    coords.append((li,(math.atan2(v.y,v.x)/math.tau+.75)%1,(v.z+o.get('wrapHeight',.4)/2)/o.get('wrapHeight',.4)))
   us=[v[1] for v in coords]
   for li,u,v in coords:
    if max(us)-min(us)>.5 and u<.5:u+=1
    uv.data[li].uv=(u,v)
metrics = {
    'units': 'feet',
    'origin': 'floor-centred; X across, Y in-depth, Z up (Blender)',
    'bottleCount': 200,
    'shelfLevels': shelf_heights,
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
    # glTF triangulates polygons; keep linked source mesh identities intact.

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
