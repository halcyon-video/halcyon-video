"""Original generic snap frame, scripted mesh authoring. Units: store feet.
Regenerate: blender -b -t 2 -P tools/models/wire-snap-frame.py
No borrowed geometry, branded artwork, or claim of exact historical manufacture.
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Quaternion
ROOT = Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = 'IMPERIAL'
scene.unit_settings.scale_length = .3048

def material(name, color, roughness, metal=0):
    m = bpy.data.materials.new(name); m.diffuse_color = (*color, 1); m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metal
    return m
chrome = material('FrameFinish', (.64,.67,.7), .28, .85)
back = material('Backing', (.14,.16,.18), .65)
rubber = material('Rubber', (.018,.022,.025), .85)
steel = material('Fasteners', (.3,.32,.35), .3, .8)
paper = material('Artwork', (.92,.9,.84), .8)

def empty(name):
    o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);return o
frame=empty('FrameAssembly');frame.location.z=.92
stand=empty('AdjustableStand')
parts=[]
def mesh(name, verts, faces, mat, parent, fit='fixed'):
    # Input coordinates are Three.js X/Y/Z; Blender is X/-Z/Y.
    me=bpy.data.meshes.new(name);me.from_pydata([(x,-z,y) for x,y,z in verts],[],faces);me.update()
    o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);o.parent=parent
    me.materials.append(mat);o['snapFit']=fit;parts.append(o);return o

def loft(name, loops, mat, parent):
    n=len(loops[0]);verts=sum(loops,[])
    faces=[tuple(reversed(range(n))),tuple(range((len(loops)-1)*n,len(loops)*n))]
    for k in range(len(loops)-1):
        for i in range(n):faces.append((k*n+i,k*n+(i+1)%n,(k+1)*n+(i+1)%n,(k+1)*n+i))
    return mesh(name,verts,faces,mat,parent)

# Closed snap-lid extrusion with recessed retaining channel and 45-degree mitres.
profile=[(0,.023),(.003,.030),(.009,.033),(.030,.033),(.040,.022),(.040,-.010),(.031,-.010),(.031,.012),(.007,.015),(0,.015)]
for k,name in enumerate(['TopSnapRail','LeftSnapRail','BottomSnapRail','RightSnapRail']):
    loops=[]
    for side in [-1,1]:
        loop=[]
        for d,z in profile:
            x,y=side*(.5+d-.0005),.5+d
            for _ in range(k):x,y=-y,x
            loop.append((x,y,z))
        loops.append(loop)
    o=loft(name,loops,chrome,frame);o['snapFit']='rail'

# Backing is a real thin panel, separated from the live art plane by .01 ft.
loops=[]
for z in [-.010,.010]:loops.append([(-.532,-.532,z),(.532,-.532,z),(.532,.532,z),(-.532,.532,z)])
o=loft('RemovableBacking',loops,back,frame);o['snapFit']='backing'
art=mesh('ArtworkSurface',[(-.5,-.5,.02),(.5,-.5,.02),(.5,.5,.02),(-.5,.5,.02)],[(0,1,2,3)],paper,frame,'art')
uv=art.data.uv_layers.new(name='ArtworkUV')
for p in art.data.polygons:
    for li,co in zip(p.loop_indices,[(0,0),(1,0),(1,1),(0,1)]):uv.data[li].uv=co

# Surface-of-revolution with explicit stepped section; sleeve has an open bore.
def lathe(name, profile, mat, parent, x=0, z=0, axis='y', n=16):
    verts=[]
    for r,h in profile:
        for i in range(n):
            a=2*math.pi*i/n
            verts.append((x+r*math.cos(a),h,z+r*math.sin(a)) if axis=='y' else (x+r*math.cos(a),r*math.sin(a),z+h))
    faces=[]
    for j in range(len(profile)):
        for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,((j+1)%len(profile))*n+(i+1)%n,((j+1)%len(profile))*n+i))
    return mesh(name,verts,faces,mat,parent)

# Rounded-octagonal weighted shoe, within the original .24 x .24 footprint.
outline=[(-.09,-.12),(.09,-.12),(.12,-.09),(.12,.09),(.09,.12),(-.09,.12),(-.12,.09),(-.12,-.09)]
for name,levels,mat in [('NonSlipSole',[(.0,.94),(.004,1)],rubber),('WeightedFoot',[(.004,1),(.012,1),(.02,.88)],chrome)]:
    loft(name,[[(x*s,h,z*s) for x,z in outline] for h,s in levels],mat,stand)
lathe('FootSocket',[(.028,.019),(.028,.033),(.021,.041),(.015,.041),(.015,.019)],chrome,stand)
lathe('LowerPostSleeve',[(.015,.03),(.015,.27),(.011,.27),(.011,.03)],chrome,stand)
lathe('TelescopingUpperPost',[(.0105,.20),(.0105,.424),(.002,.424),(.002,.20)],chrome,stand)
lathe('HeightLockCollar',[(.015,.252),(.020,.256),(.020,.276),(.015,.28),(.011,.28),(.011,.252)],steel,stand)
knob=lathe('RearLockThumbwheel',[(.002,-.04),(.018,-.04),(.020,-.036),(.020,-.025),(.008,-.022),(.008,-.01),(.002,-.01)],rubber,stand,axis='z')
knob.location.z=.264
# Rear mounting saddle overlaps the tube end and connects to the backing's rear.
loops=[]
for z in [-.025,-.011]:loops.append([(-.035,-.515,z),(.035,-.515,z),(.035,-.44,z),(-.035,-.44,z)])
o=loft('RearPostSaddle',loops,steel,frame);o['snapFit']='bottom'
for x in [-.022,.022]:
    o=lathe('SaddleScrew'+str(x),[(.002,-.029),(.006,-.029),(.007,-.026),(.007,-.025),(.002,-.025)],chrome,frame,x=x,axis='z',n=8)
    o.location.z=-.468;o['snapFit']='bottom'

rows=[]
for o in parts:
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    closed=all(e.is_manifold for e in bm.edges)
    assert closed or o==art,o.name
    bm.to_mesh(o.data);bm.free()
    if o!=art:
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT')
    o.data.calc_loop_triangles()
    rows.append({'name':o.name,'triangles':len(o.data.loop_triangles),'closed':closed,'uv':True})
scene['provenance']='Original generic fixture for Halcyon issue #235; dimensions follow existing code, construction estimated.'
scene['dimensions']='Artwork 1 x 1 ft at reference size; frame border .04 ft; post offset .42 ft; base .24 x .24 x .02 ft.'
bpy.ops.object.select_all(action='SELECT')
path=ROOT/'public/models/wire-snap-frame.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_extras=True)
for a in bpy.context.screen.areas:
    if a.type=='VIEW_3D':
        a.spaces.active.region_3d.view_distance=2.6
        a.spaces.active.region_3d.view_location=(0,0,.7)
        a.spaces.active.region_3d.view_rotation=Quaternion((.88,.3,.13,.34)).normalized()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/wire-snap-frame.blend'))
(ROOT/'tools/models/wire-snap-frame-metrics.json').write_text(json.dumps({'parts':rows,'triangles':sum(r['triangles'] for r in rows),'materials':5,'textures':0,'bytes':path.stat().st_size},indent=2)+'\n')
