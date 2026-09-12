"""Original generic ceiling CCTV, scripted mesh authoring. Coordinates in feet.
Blender (x,-store_z,store_y); head origin at optical center, lens along -X.
Run: blender -b -t 2 -P tools/models/security-camera.py
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
roles={}
for name,color,metal,rough in [('CameraShell',(.73,.69,.59,1),.15,.48),('CameraEnamel',(.16,.17,.18,1),.5,.38),('LensRubber',(.018,.022,.027,1),.05,.7),('ConnectorMetal',(.48,.51,.53,1),.85,.25),('OpticalGlass',(.018,.065,.09,1),.65,.12),('RecordIndicator',(.5,.008,.005,1),0,.3)]:
 m=bpy.data.materials.new(name);m.diffuse_color=color;m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=color;p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;roles[name]=m
parents={}
for name in ['CameraHead','CameraMount']:
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);parents[name]=o
parts=[]
def mesh(name,verts,faces,role,parent):
 me=bpy.data.meshes.new(name);me.from_pydata([(x,-z,y) for x,y,z in verts],[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);o.parent=parents[parent];me.materials.append(roles[role]);parts.append(o)
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT');return o
def box(name,center,size,role,parent='CameraHead',bevel=.006):
 x,y,z=center;a,b,c=[v/2 for v in size];v=[(x+i*a,y+j*b,z+k*c) for i,j,k in [(-1,-1,-1),(-1,-1,1),(-1,1,1),(-1,1,-1),(1,-1,-1),(1,-1,1),(1,1,1),(1,1,-1)]]
 o=mesh(name,v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],role,parent)
 mod=o.modifiers.new('Manufactured edge radii','BEVEL');mod.width=bevel;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name);return o
def lathe(name,profile,center,role,axis='X',parent='CameraHead',n=24):
 # Closed profile swept into a welded annular section, including hood interior.
 v=[]
 for along,r in profile:
  for i in range(n):
   a=i*2*math.pi/n;co=(along,r*math.cos(a),r*math.sin(a));co=co if axis=='X' else ((co[1],co[0],co[2]) if axis=='Y' else (co[1],co[2],co[0]));v.append(tuple(co[j]+center[j] for j in range(3)))
 f=[]
 for j in range(len(profile)):
  for i in range(n):f.append((j*n+i,j*n+(i+1)%n,((j+1)%len(profile))*n+(i+1)%n,((j+1)%len(profile))*n+i))
 return mesh(name,v,f,role,parent)
# Extruded folded shell: rounded rectangular annulus with a real inner wall.
# Explicit ordered rounded rectangle in Y/Z plane.
def ring(w,h,r):
 return [(cy+r*math.cos(math.radians(a+i*22.5)),cz+r*math.sin(math.radians(a+i*22.5))) for cy,cz,a in [(h/2-r,w/2-r,0),(-h/2+r,w/2-r,90),(-h/2+r,-w/2+r,180),(h/2-r,-w/2+r,270)] for i in range(5)]
outer=ring(.26,.24,.025);inner=ring(.24,.22,.015);loops=[(-.275,outer),(.275,outer),(.275,inner),(-.275,inner)];n=len(outer)
mesh('Folded_aluminium_shell',[(x,y,z) for x,loop in loops for y,z in loop],[(j*n+i,j*n+(i+1)%n,((j+1)%4)*n+(i+1)%n,((j+1)%4)*n+i) for j in range(4) for i in range(n)],'CameraShell','CameraHead')
box('Front_casting',(-.282,0,0),(.022,.232,.252),'CameraShell')
box('Rear_service_panel',(.28,0,0),(.025,.225,.245),'CameraEnamel')
lathe('C_mount_flange',[(-.31,.07),(-.295,.07),(-.295,.095),(-.31,.095)],(0,0,0),'ConnectorMetal')
lathe('Focus_barrel',[(-.40,.058),(-.305,.058),(-.305,.078),(-.32,.084),(-.38,.084),(-.40,.08)],(0,0,0),'LensRubber')
lathe('Hollow_lens_hood',[(-.46,.088),(-.46,.102),(-.445,.106),(-.39,.086),(-.39,.073)],(0,0,0),'CameraEnamel')
lathe('Recessed_optical_element',[(-.419,.001),(-.413,.001),(-.413,.074),(-.419,.074)],(0,0,0),'OpticalGlass')
for i in range(5):lathe('Focus_grip_%02d'%i,[(-.335-i*.01,.083),(-.338-i*.01,.083),(-.338-i*.01,.087),(-.335-i*.01,.087)],(0,0,0),'LensRubber')
for z in [-.072,.072]:
 lathe('Rear_BNC' if z<0 else 'Rear_DC_socket',[(.29,.015),(.338,.015),(.338,.023),(.305,.023),(.305,.029),(.29,.029)],(0,-.035,z),'ConnectorMetal',n=16)
for x in [-.23,.23]:
 for z in [-.095,.095]:box('Captive_panel_screw',(x,.119,z),(.023,.006,.023),'ConnectorMetal',bevel=.003)
box('Indicator_bezel',(-.22,.127,0),(.06,.018,.04),'LensRubber')
box('REC_lamp',(-.22,.14,0),(.035,.008,.022),'RecordIndicator',bevel=.003)
# Fork cheeks rotate in yaw with mount. Optical head pivots between them.
lathe('Ceiling_plate',[(-.03,.001),(0,.001),(0,.14),(-.008,.145),(-.03,.14)],(0,0,0),'CameraEnamel','Y','CameraMount')
lathe('Drop_tube',[(-.735,.021),(-.03,.021),(-.03,.031),(-.735,.031)],(0,0,0),'CameraEnamel','Y','CameraMount',16)
box('Fork_bridge',(0,-.745,0),(.10,.04,.35),'CameraEnamel','CameraMount')
for z in [-.16,.16]:
 box('Fork_cheek',(0,-.855,z),(.085,.22,.025),'CameraEnamel','CameraMount')
 lathe('Tilt_lock_washer',[(-.018,.008),(.018,.008),(.018,.044),(-.018,.044)],(0,-.95,z),'ConnectorMetal','Z','CameraMount',16)
for x in [-.095,.095]:lathe('Ceiling_fixing',[(-.038,.002),(-.03,.002),(-.03,.015),(-.038,.015)],(x,0,0),'ConnectorMetal','Y','CameraMount',12)
# Head at its delivery pose; runtime replaces this with overview aiming transform.
parents['CameraHead'].location.z=-.95
bpy.context.scene.unit_settings.system='IMPERIAL';bpy.context.scene.unit_settings.scale_length=.3048
for o in parts:
 bm=bmesh.new();bm.from_mesh(o.data);assert all(e.is_manifold for e in bm.edges),o.name;bm.free()
 o['provenance']='Original Halcyon generic CCTV; issue 221';o['units']='feet'
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=2.2;area.spaces.active.region_3d.view_location=Vector((0,0,-.55))
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/security-camera.blend'))
# Batch rigid parts by material and pivot only in the runtime export.
tri=sum(len(p.vertices)-2 for o in parts for p in o.data.polygons)
source_count=len(parts)
for parent in parents.values():
 for role in roles:
  batch=[o for o in parts if o.parent==parent and o.data.materials[0].name==role]
  if not batch:continue
  names=[o.name for o in batch]
  bpy.ops.object.select_all(action='DESELECT')
  for o in batch:o.select_set(True)
  bpy.context.view_layer.objects.active=batch[0];bpy.ops.object.join()
  batch[0].name=parent.name+'_'+role;batch[0]['source_parts']=names
 # Joined objects invalidate Blender references; refresh the list.
 parts=[o for o in bpy.context.scene.objects if o.type=='MESH']
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/security-camera.glb'),export_format='GLB',export_yup=True,export_extras=True)
print(json.dumps({'triangles':tri,'source_parts':source_count,'meshes':len(parts),'materials':len(roles),'bytes':(ROOT/'public/models/security-camera.glb').stat().st_size}))
