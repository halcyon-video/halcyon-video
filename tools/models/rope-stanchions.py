"""Original queue family. Blender coordinates (x,-store_z,height), numeric feet.
Reproduce: blender -b -P tools/models/rope-stanchions.py
"""
import bpy, bmesh, math, os, json
from mathutils import Vector
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
def material(name,c,metal,rough):
 m=bpy.data.materials.new(name); m.diffuse_color=(*c,1); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 return m
brass=material('BrushedBrass',(.55,.34,.105),.8,.28)
core=material('WeightedCore',(.045,.05,.055),.35,.65)
rubber=material('FloorRubber',(.018,.022,.028),0,.9)
rope=material('RopeFabric',(.018,.045,.24),0,.93)
parts=[]
def mesh(name,verts,faces,mat):
 data=bpy.data.meshes.new(name); data.from_pydata(verts,[],faces);data.update()
 o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);data.materials.append(mat)
 bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data)
 assert all(e.is_manifold for e in bm.edges),name
 bm.free()
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
 for p in data.polygons:p.use_smooth=True
 parts.append(o);return o
# Closed radial profiles: thin spun cover has its own inner return, not a solid cone.
def lathe(name,profile,mat,n=48):
 v=[(r*math.cos(j*math.tau/n),r*math.sin(j*math.tau/n),h) for r,h in profile for j in range(n)]
 f=[]
 for i in range(len(profile)):
  for j in range(n):f.append((i*n+j,i*n+(j+1)%n,((i+1)%len(profile))*n+(j+1)%n,((i+1)%len(profile))*n+j))
 return mesh(name,v,f,mat)
lathe('Rubber_nonmarking_foot',[(.10,0),(.55,0),(.565,.018),(.565,.035),(.10,.035)],rubber)
lathe('Cast_weighted_core',[(.085,.035),(.53,.035),(.53,.052),(.39,.085),(.10,.14)],core)
lathe('Spun_base_cover_0.008ft',[(.084,.19),(.16,.19),(.22,.15),(.45,.075),(.568,.057),(.5833,.043),(.5833,.027),(.5753,.027),(.5753,.039),(.564,.049),(.448,.067),(.216,.142),(.156,.182),(.084,.182)],brass)
lathe('Threaded_socket_collar',[(.07,.14),(.115,.14),(.115,.21),(.10,.23),(.07,.23)],brass)
lathe('Hollow_tubular_upright',[(.065,.19),(.075,.19),(.075,2.995),(.065,2.995)],brass)
lathe('Attachment_collar',[(.064,2.90),(.10,2.90),(.11,2.92),(.11,3.015),(.09,3.035),(.064,3.035)],brass)
# Ball cap has a small hidden central bore closed by the post collar.
profile=[(.015,3.00)]+[(.125*math.sin(a),3.125-.125*math.cos(a)) for a in [i*math.pi/16 for i in range(1,16)]]+[(.015,3.25)]
lathe('Ball_cap',profile,brass,32)
def tube(name,points,r,mat,n=10):
 closed=(Vector(points[0])-Vector(points[-1])).length<1e-6
 if closed:points=points[:-1]
 verts=[];faces=[]
 for i,p in enumerate(points):
  t=(Vector(points[(i+1)%len(points) if closed else min(i+1,len(points)-1)])-Vector(points[(i-1)%len(points) if closed else max(0,i-1)])).normalized();u=Vector((0,1,0));v=t.cross(u).normalized()
  for j in range(n):verts.append(Vector(p)+r*(u*math.cos(j*math.tau/n)+v*math.sin(j*math.tau/n)))
 for i in range(len(points) if closed else len(points)-1):
  for j in range(n):
   a=i*n+j;b=i*n+(j+1)%n;faces.append((a,b,((i+1)%len(points))*n+(j+1)%n,((i+1)%len(points))*n+j))
 if not closed:faces.extend([tuple(reversed(range(n))),tuple((len(points)-1)*n+j for j in range(n))])
 return mesh(name,verts,faces,mat)
for sign in [-1,1]:
 # Upright eye lies in X/Z plane and intersects its collar at the mounting boss.
 pts=[(sign*(.105+.065*math.cos(i*math.tau/24)),0,2.965+.065*math.sin(i*math.tau/24)) for i in range(25)]
 tube('Attachment_eye_'+str(sign),pts,.014,brass,8)
postparts=parts[:]
# Author a complete editable 3-post assembly, retaining linked mesh data.
for x in [-5,5]:
 for original in postparts:
  o=original.copy();o.data=original.data;bpy.context.collection.objects.link(o);o.location.x=x;o.name=original.name+('_left' if x<0 else '_right')
# Rope module spans five feet; root centered at zero. Runtime affine sag edit leaves endpoints fixed.
ropeparts=[]
for start in [-5,0]:
 for side in [0,1]:
  x=start+(.22 if side==0 else 4.78)
  pts=[(x+.066*math.cos(i*math.tau/20),0,2.965+.038*math.sin(i*math.tau/20)) for i in range(21)]
  ropeparts.append(tube('Clasp_closed_hook',pts,.013,brass,8))
  # Sleeve follows the rope's end tangent; visible seam is the socket mouth.
  sign=1 if side==0 else -1
  ropeparts.append(tube('Swaged_clasp_socket',[(x+sign*.04,0,2.95),(x+sign*.14,0,2.88)],.05,brass,12))
 pts=[]
 for i in range(49):
  t=i/48;pts.append((start+.35+4.3*t,0,2.875-4*.91*t*(1-t)))
 ropeparts.append(tube('Braided_rope_core',pts,.042,rope,12))
 # Longitudinal sweep UVs: circumference U, distance along rope V (feet).
 o=ropeparts[-1];uv=o.data.uv_layers.active
 for poly in o.data.polygons:
  for li in poly.loop_indices:
   vi=o.data.loops[li].vertex_index;uv.data[li].uv=(vi%12/12,vi//12/48*4.8)
# Plain runner beside the barrier; #222's door mats remain a separate fixture.
runnerMat=material('RunnerPile',(.018,.045,.24),0,.98)
runnerparts=[]
def runner_layer(name,z0,z1,inset,mat):
 # Rounded rectangle with sloping perimeter edge and closed top/bottom.
 ring=[]
 for cx,cy,a0 in [(4.85,-3.25,0),(-4.85,-3.25,90),(-4.85,-.95,180),(4.85,-.95,270)]:
  for j in range(7):
   a=math.radians(a0+j*90/6);ring.append((cx+.25*math.cos(a),cy-.25*math.sin(a)))
 n=len(ring);v=[(x,y,z0) for x,y in ring]+[(x*(1-inset/5.1),-2.1+(y+2.1)*(1-inset/1.4),z1) for x,y in ring]
 f=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 o=mesh(name,v,f,mat)
 for p in o.data.polygons:p.use_smooth=False
 runnerparts.append(o)
runner_layer('Runner_ramped_rubber_backing',0,.018,0,rubber)
runner_layer('Runner_compressed_pile',.018,.028,.07,runnerMat)
for x in [-5,0,5]:
 for side in [-1,1]:
  o=bpy.data.objects.new('anchor_rope_'+str(x)+'_'+str(side),None);o.location=(x+side*.17,0,2.965);bpy.context.collection.objects.link(o)
scene=bpy.context.scene;scene.unit_settings.system='IMPERIAL';scene.unit_settings.scale_length=.3048;scene.unit_settings.length_unit='FEET'
scene['dimensions_feet']='11.1666 x 1.1666 footprint; 3.25 height; 5 ft centers';scene['rope_sag']='0.20 span nominal, configurable 0.15–0.25';scene['origin']='middle post floor; +X along queue; Blender +Z up, glTF +Y up'
bpy.ops.object.select_all(action='DESELECT')
for a in bpy.context.screen.areas:
 if a.type=='VIEW_3D':a.spaces.active.region_3d.view_distance=15
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'tools/models/rope-stanchions.blend'))
# Export one post (3 roles) plus one rope module (2 roles). Runtime instances these.
for o in list(scene.objects):
 if o not in postparts and o not in ropeparts[:5] and o not in runnerparts:bpy.data.objects.remove(o,do_unlink=True)
# First span shifts to centered module origin; modules carry their own names.
for o in ropeparts[:5]:o.location.x=2.5
for name,objs in [('Post',postparts),('Rope',ropeparts[:5]),('Runner',runnerparts)]:
 bpy.ops.object.select_all(action='DESELECT')
 for o in objs:o.select_set(True)
 bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join();o=bpy.context.object;o.name=name
 bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
 # consolidate material slots into single primitives per role

path=os.path.join(ROOT,'public/models/rope-stanchions.glb')
bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',export_yup=True,export_extras=True)
metrics={'bytes':os.path.getsize(path),'textures':0,'modules':{}}
for o in scene.objects:
 if o.type=='MESH':
  o.data.calc_loop_triangles();metrics['modules'][o.name]={'triangles':len(o.data.loop_triangles),'vertices':len(o.data.vertices),'material_roles':[m.name for m in o.data.materials]}
with open(os.path.join(ROOT,'tools/models/rope-stanchions-metrics.json'),'w') as f:json.dump(metrics,f,indent=2)
print(metrics)
