"""Original generic surface-fixed entrance bollard, issue #263.
Run: blender -b -P tools/models/entrance-bollard.py
Coordinates in feet: X width, -Y store depth, Z height. No external assets.
"""
import bpy, bmesh, math, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
materials = []
for name, color, metal, rough in [
    ('PostPaint', (.024, .024, .028), .4, .5),
    ('SafetyBand', (1, .604, .033), .15, .4),
    ('FixingSteel', (.32, .35, .38), .75, .36),
]:
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    materials.append(m)

def revolve(name, profile, segments=32, role=0, center=(0,0), band=False, closed=False):
    # Profile (radius,height), with a single vertex at each axis endpoint.
    vertices, rings, faces, face_roles = [], [], [], []
    for radius, height in profile:
        ring=[]
        for i in range(segments if radius else 1):
            a=math.tau*i/segments
            ring.append(len(vertices))
            vertices.append((center[0]+radius*math.cos(a),center[1]+radius*math.sin(a),height))
        rings.append(ring)
    for j in range(len(rings) if closed else len(rings)-1):
        nxt=(j+1)%len(rings)
        a,b=rings[j],rings[nxt]
        for i in range(segments):
            k=(i+1)%segments
            face=(a[0],b[k],b[i]) if len(a)==1 else ((a[i],a[k],b[0]) if len(b)==1 else (a[i],a[k],b[k],b[i]))
            faces.append(face)
            h=(profile[j][1]+profile[nxt][1])/2
            face_roles.append(1 if band and 2.30<h<2.55 else role)
    me=bpy.data.meshes.new(name)
    me.from_pydata(vertices,[],faces);me.update()
    obj=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(obj)
    for m in materials:me.materials.append(m)
    uv=me.uv_layers.new(name='Cylindrical_surface_and_planar_ends')
    for p,r in zip(me.polygons,face_roles):
        p.material_index=r
        zs=[vertices[v][2] for v in p.vertices]
        planar=max(zs)-min(zs)<1e-6
        p.use_smooth=not planar and segments>8
        angles=[(math.atan2(vertices[v][1]-center[1],vertices[v][0]-center[0])/math.tau)%1 for v in p.vertices]
        seam=max(angles)-min(angles)>.5
        for loop,v,u in zip(p.loop_indices,p.vertices,angles):
            x,y,z=vertices[v]
            uv.data[loop].uv=((x-center[0]+.5,y-center[1]+.5) if planar else (u+1 if seam and u<.5 else u,z/3))
    bm=bmesh.new();bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    assert all(e.is_manifold for e in bm.edges),name
    assert all(f.calc_area()>1e-10 for f in bm.faces),name
    bm.to_mesh(me);bm.free()
    obj['units']='feet'
    obj['provenance']='Original scripted generic hardware; no reference-derived geometry or imagery'
    return obj

# Continuous welded post skin and sealed domed crown. The yellow band is a
# material assignment on this same surface, never a second hovering cylinder.
revolve('Continuous_post_finished_crown_and_weld_foot',[
    (0,.0625),(.274,.0625),(.277,.072),(.264,.093),(.252,.112),
    (.25,.14),(.25,2.30),(.25,2.55),(.25,2.84),
    (.248,2.88),(.233,2.925),(.204,2.963),(.159,2.987),(.09,2.998),(0,3)
],band=True)
revolve('Eased_9inch_mounting_flange',[(0,0),(.365,0),(.375,.01),(.375,.05),(.3625,.0625),(0,.0625)])
for i in range(4):
    angle=math.pi/4+i*math.pi/2
    center=(.318*math.cos(angle),.318*math.sin(angle))
    revolve(f'Anchor_{i+1}_washer',[(.024,.0625),(.045,.0625),(.047,.066),(.047,.072),(.044,.076),(.024,.076)],16,2,center,closed=True)
    revolve(f'Anchor_{i+1}_hex_head',[(0,.067),(.024,.067),(.024,.076),(.035,.076),(.037,.080),(.037,.104),(.032,.110),(0,.110)],6,2,center)

scene=bpy.context.scene
scene.unit_settings.system='IMPERIAL';scene.unit_settings.scale_length=.3048
scene['dimensions']='36 in high; 6 in post diameter; 9 in flange diameter; floor datum Z=0'
scene['installation']='Two unchanged exterior anchors. Decorative only; no collision or animation.'
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_distance=5
        area.spaces.active.region_3d.view_location=(0,0,1.5)
        area.spaces.active.shading.type='MATERIAL'
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active=bpy.data.objects['Continuous_post_finished_crown_and_weld_foot']
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/entrance-bollard.blend'))
# Keep editable construction parts above; export a single mesh with three roles.
bpy.ops.object.join();obj=bpy.context.object;obj.name='EntranceBollard'
obj.data.calc_loop_triangles()
metrics={'triangles':len(obj.data.loop_triangles),'source_vertices':len(obj.data.vertices),'material_roles':[m.name for m in materials],'textures':0,'dimensions_feet':[.75,3,.75],'source_parts':10,'closed_manifold_parts':True,'blender_version':bpy.app.version_string}
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/entrance-bollard.glb'),export_format='GLB',export_yup=True,export_apply=True,export_extras=True)
metrics['glb_bytes']=(ROOT/'public/models/entrance-bollard.glb').stat().st_size
(ROOT/'tools/models/entrance-bollard-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
print(json.dumps(metrics))
