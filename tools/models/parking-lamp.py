"""Original generic parking-lot shoebox luminaire. Numeric feet, Z-up source.
Rebuild: blender -b -t 2 -P tools/models/parking-lamp.py
No external geometry, images, or manufacturer-specific dimensions.
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector, Quaternion
ROOT = Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
M = {}
for name, color, metal, rough in [
    ('PoleFinish', (.042,.047,.052), .5,.6),
    ('FastenerMetal', (.24,.26,.28), .8,.38),
    ('SealRubber', (.012,.014,.016), 0,.85),
    ('LampLens', (.95,.88,.7), 0,.4),
]:
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;M[name]=m

def mesh(name, verts, faces, role, bevel=0):
    d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update()
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);d.materials.append(M[role])
    if bevel:
        mod=o.modifiers.new('Manufactured edge radius','BEVEL');mod.width=bevel;mod.segments=2
    return o

def profile(name, rings, role, bevel=0, closed=False):
    # (half width, half depth, height, center y). Closed profile returns down
    # the inner wall to make a genuinely hollow shaft/housing with thickness.
    v=[(x*w,y*d+cy,h) for w,d,h,cy in rings for x,y in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    f=[(i*4+j,i*4+(j+1)%4,((i+1)%len(rings))*4+(j+1)%4,((i+1)%len(rings))*4+j) for i in range(len(rings) if closed else len(rings)-1) for j in range(4)]
    if not closed:f += [(3,2,1,0),tuple((len(rings)-1)*4+j for j in range(4))]
    return mesh(name,v,f,role,bevel)

def box(name, center, dims, role, bevel=.006):
    x,y,z=center;w,d,h=dims
    o=profile(name,[(w/2,d/2,z-h/2,y),(w/2,d/2,z+h/2,y)],role,bevel)
    o.location.x=x;return o

def bolt(name,x,y,z,r=.027,h=.035,n=6):
    v=[(x+r*math.cos(i*math.tau/n),y+r*math.sin(i*math.tau/n),z+k*h) for k in [0,1] for i in range(n)]
    f=[tuple(reversed(range(n))),tuple(n+i for i in range(n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,v,f,'FastenerMetal')

box('Base_isolation_pad',(0,0,.014),(.65,.65,.028),'SealRubber')
base=box('Anchor_base_plate',(0,0,.068),(.64,.64,.08),'PoleFinish',.014)
for x in [-.235,.235]:
    for y in [-.235,.235]:
        bolt('Anchor_washer',x,y,.108,.053,.013,12)
        bolt('Anchor_hex_nut',x,y,.121,.040,.040)
        bolt('Anchor_stud_exposed',x,y,.161,.021,.024,8)
shaft=profile('Tapered_hollow_square_shaft',[(.13,.13,.108,0),(.085,.085,12.98,0),(.067,.067,12.98,0),(.112,.112,.108,0)],'PoleFinish',.005,True)
# Service opening cut through the store-facing wall. Plate covers it with a
# perimeter gasket; the source retains the real opening for editability.
cut=box('Service_opening_tool',(0,.12,.91),(.125,.10,.33),'SealRubber',0)
bpy.context.view_layer.objects.active=shaft
mod=shaft.modifiers.new('Service handhole','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cut
bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cut,do_unlink=True)
box('Service_cover_gasket',(0,.128,.91),(.17,.018,.43),'SealRubber',.018)
box('Removable_access_plate',(0,.145,.91),(.155,.018,.405),'PoleFinish',.018)
for z in [.757,1.063]:
    o=bolt('Access_cover_screw',0,0,0,.012,.010,8);o.rotation_euler.x=math.pi/2;o.location=(0,.164,z)
box('Welded_base_socket',(0,0,.15),(.285,.285,.084),'PoleFinish',.008)
box('Pole_top_cap',(0,0,13.005),(.19,.19,.05),'PoleFinish',.009)
# Short rectangular arm seats against the pole, housing seats on its far end.
box('Arm_mount_flange',(0,.104,12.80),(.24,.044,.36),'PoleFinish',.008)
box('Rectangular_mount_arm',(0,.344,12.85),(.16,.436,.15),'PoleFinish',.009)
for z in [12.68,12.94]:
    o=bolt('Arm_flange_bolt',0,0,0,.027,.025);o.rotation_euler.x=math.pi/2;o.location=(0,.153,z)
# Cast shoebox shell: skirt, sloped shoulder, upper lid and inner return.
# Lower opening is closed by the separate recessed lens and gasket.
profile('Cast_shoebox_housing',[(.39,.57,12.84,1.132),(.39,.57,13.13,1.132),(.34,.52,13.27,1.132),(.305,.485,13.27,1.132),(.345,.525,13.10,1.132),(.345,.525,12.84,1.132)],'PoleFinish',.008,True)
box('Sealed_housing_lid',(0,1.132,13.271),(.68,1.04,.025),'PoleFinish',.010)
profile('Lens_perimeter_gasket',[(.344,.524,12.86,1.132),(.344,.524,12.89,1.132),(.314,.494,12.89,1.132),(.314,.494,12.86,1.132)],'SealRubber',.002,True)
box('Recessed_diffusing_lens',(0,1.132,12.88),(.628,.988,.025),'LampLens',.006)
# Four flush retaining screws under the perimeter and a rear hinge barrel.
for x in [-.365,.365]:
    for y in [.70,1.56]:bolt('Lens_frame_screw',x,y,12.825,.012,.015,8)
o=bolt('Service_frame_hinge',0,0,0,.035,.30,12);o.rotation_euler.y=math.pi/2;o.location=(-.15,.558,12.87)
box('Service_frame_latch',(0,1.709,12.89),(.15,.025,.075),'FastenerMetal',.005)

parts=[]
for o in list(bpy.context.scene.objects):
    if o.type!='MESH':continue
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=1e-7);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    assert all(e.is_manifold for e in bm.edges),o.name
    assert all(f.calc_area()>1e-10 for f in bm.faces),o.name
    bm.to_mesh(o.data);bm.free()
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
    o['material_role']=o.data.materials[0].name;o['provenance']='Original generic fixture; scripted mesh authoring; dimensions estimated to fit existing store anchor'
    parts.append(o)
scene=bpy.context.scene;scene.unit_settings.system='IMPERIAL';scene.unit_settings.scale_length=.3048;scene.unit_settings.length_unit='FEET'
scene['origin']='Ground at pole center; Blender +Y arm toward store -> runtime -Z; Y-up GLB; numeric feet'
scene['attachments']='Base ground (0,0,0); arm seat (0,0.562,12.85); lens center (0,1.132,12.88) in Blender coordinates'
scene['moving_parts']='None; service plate and lens assembly separately editable, not animated'
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        r=area.spaces.active.region_3d;r.view_distance=18;r.view_location=(0,0,6.5);r.view_rotation=Quaternion((.84,.40,.16,.32)).normalized()
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/parking-lamp.blend'))
# Four shared draw primitives, separate physical parts remain in editable source.
for role,mat in M.items():
    obs=[o for o in scene.objects if o.type=='MESH' and o.data.materials[0]==mat];bpy.ops.object.select_all(action='DESELECT')
    for o in obs:o.select_set(True)
    bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();o=bpy.context.object;o.name='ParkingLamp_'+role
    scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
path=ROOT/'public/models/parking-lamp.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_yup=True,export_extras=True)
metrics={'bytes':path.stat().st_size,'textures':0,'source_parts':len(parts),'roles':{}}
coords=[]
for o in scene.objects:
    if o.type!='MESH':continue
    o.data.calc_loop_triangles();coords += [o.matrix_world@v.co for v in o.data.vertices]
    metrics['roles'][o.name]={'triangles':len(o.data.loop_triangles),'vertices':len(o.data.vertices),'uv':bool(o.data.uv_layers)}
metrics['blender_bounds']={'min':[min(v[i] for v in coords) for i in range(3)],'max':[max(v[i] for v in coords) for i in range(3)]}
(ROOT/'tools/models/parking-lamp-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n');print(metrics)
