"""Original fitted department portal, feet. Blender Z-up exports to store Y-up.
Run Blender -b -t 2 --python tools/models/department-arch.py.
The unseen engineering, complete ellipse and dimensions are design assumptions.
Reference images and their measurement notes are deliberately private.
"""
import math
import json
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/models'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
MATS = {}
for name, color, rough in [('ArchPaint', (.82,.53,.065,1), .46),
                          ('PostPaint', (.035,.045,.07,1), .52),
                          ('JointPaint', (.09,.10,.12,1), .58)]:
    m=bpy.data.materials.new(name); m.diffuse_color=color; m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=color; p.inputs['Roughness'].default_value=rough
    MATS[name]=m

def finish(obj, role, bevel=.008):
    obj.data.materials.append(MATS[role])
    bpy.context.view_layer.objects.active=obj
    obj.select_set(True)
    if bevel:
        mod=obj.modifiers.new('Finished edges', 'BEVEL'); mod.width=bevel; mod.segments=3
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bm=bmesh.new(); bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    assert all(e.is_manifold for e in bm.edges), obj.name
    bm.to_mesh(obj.data); bm.free()
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(island_margin=.025)
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.select_set(False)
    return obj

def solid(name, verts, faces, role, bevel=.008):
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts, [], faces); mesh.update()
    obj=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(obj)
    return finish(obj,role,bevel)

def box(name,x,y,z,w,d,h,role,bevel=.008):
    v=[(x+sx*w/2,y+sy*d/2,z+sz*h/2) for sz in [-1,1] for sy in [-1,1] for sx in [-1,1]]
    return solid(name,v,[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)],role,bevel)

# Closed curved rectangular section. The broad faces are continuous quad strips.
# Rounded edge treatment is a real bevel, with narrow edge returns and closed ends.
verts=[]; faces=[]
for i in range(65):
    a=math.pi-i*math.pi/64
    for r,y in [(0,-.125),(0,.125),(.5,.125),(.5,-.125)]:
        verts.append(((2.0+r)*math.cos(a),y,7.5+(2.25+r)*math.sin(a)))
for i in range(64):
    for j in range(4): faces.append((4*i+j,4*i+(j+1)%4,4*(i+1)+(j+1)%4,4*(i+1)+j))
faces += [(3,2,1,0),(256,257,258,259)]
solid('Continuous broad arch',verts,faces,'ArchPaint',.012)

def post(name,x):
    # Closed box post, Boolean slots are real openings through its front skin.
    obj=box(name,x,0,3.765,.30,.25,7.37,'PostPaint',0)
    cutters=[]
    for i in range(21):
        # Four-inch pitch. Slot mouths 1.3 x .35 inch, not painted marks.
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x,-.13,.55+i/3))
        cutter=bpy.context.object; cutter.dimensions=(.11,.09,.03)
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        cutters.append(cutter)
    # Hollow centre keeps slot openings from becoming shallow stamped dents.
    bpy.ops.mesh.primitive_cube_add(size=1,location=(x,0,3.765))
    core=bpy.context.object; core.dimensions=(.24,.19,7.30)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); cutters.append(core)
    for cut in cutters:
        bpy.context.view_layer.objects.active=obj
        mod=obj.modifiers.new('Punched opening','BOOLEAN'); mod.operation='DIFFERENCE'; mod.object=cut
        bpy.ops.object.modifier_apply(modifier=mod.name); bpy.data.objects.remove(cut,do_unlink=True)
    obj.data.materials.clear(); finish(obj,'PostPaint',.004)
    # End shoe is hidden engineering, not an asserted historical floor detail.
    box(name+' footplate',x,0,.04,.64,.5,.08,'JointPaint',.012)
    # Collar receives the capped arch end. Ring leaves a fitted square socket.
    box(name+' top saddle',x,0,7.475,.54,.31,.05,'JointPaint',.006)

post('Left slotted upright',-2.25)
post('Right interpreted upright',2.25)
# Attachment bosses remain outside the walking opening, behind the left post.
for name,h in [('Medallion mount',6.25),('Lower panel mount',3.75)]:
    box(name,-2.25,.17,h,.18,.09,.12,'JointPaint',.005)
    anchor=bpy.data.objects.new(name+' anchor',None); bpy.context.collection.objects.link(anchor)
    anchor.location=(-2.25,.23,h); anchor.empty_display_size=.2

# Identical repeated hardware shares one mesh in the export. Runtime instances it.
for suffix, role in [('', 'upright'), (' footplate', 'foot'), (' top saddle', 'saddle')]:
    left=bpy.data.objects['Left slotted upright'+suffix]
    right=bpy.data.objects['Right interpreted upright'+suffix]
    for v in left.data.vertices: v.co.x += 2.25
    left.location.x=-2.25; right.location.x=2.25
    right.data=left.data
    left['repeatRole']=role; right['repeatRole']=role
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
tri=sum(len(o.data.polygons) for o in meshes)
for o in meshes: o.data.calc_loop_triangles()
stats={'units':'feet','bounds':[-2.57,2.57,-.25,.25,0,10.25],
       'triangles':sum(len(o.data.loop_triangles) for o in meshes),
       'uniqueTriangles':sum(len(m.loop_triangles) for m in {o.data for o in meshes}), 'meshObjects':len(meshes),'materials':list(MATS),'textures':0,
       'spanInsidePosts':4.20,'springHeight':7.5,'apexHeight':10.25,
       'postWidth':.30,'archBreadth':.5,'archDepth':.25,
       'assumptions':['full span','height','return depth','opposite support','floor fastening']}
bpy.context.scene.unit_settings.system='IMPERIAL'
bpy.context.scene.unit_settings.scale_length=.3048
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_distance=15
        area.spaces.active.region_3d.view_location=Vector((0,0,5))
bpy.ops.wm.save_as_mainfile(filepath=str(Path(__file__).with_suffix('.blend')))
bpy.ops.export_scene.gltf(filepath=str(OUT/'department-arch.glb'),export_format='GLB',export_yup=True,
    export_extras=True,export_apply=True,export_cameras=False,export_lights=False)
(OUT/'department-arch.geometry.json').write_text(json.dumps(stats,indent=2)+'\n')
print(json.dumps(stats))
