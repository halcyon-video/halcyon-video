"""Original office hardware, scripted mesh authoring. No reference pixels or text.
Rebuild: blender -b -t 2 -P "$PWD/tools/models/counter-office-kit.py"
Coordinates are feet, authored as (store X, -store Z, store Y).
"""
import bpy, bmesh, math, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0
scene = bpy.context.scene
scene.unit_settings.system = 'IMPERIAL'; scene.unit_settings.scale_length = .3048
scene.unit_settings.length_unit = 'FEET'
materials = {}
for role, color, rough, metal in [
 ('ABS',(.025,.029,.034,1),.36,0), ('Calculator',(.35,.34,.29,1),.45,0),
 ('Key',(.58,.56,.46,1),.5,0), ('Display',(.13,.20,.15,1),.23,0),
 ('Paper',(.88,.87,.80,1),.88,0), ('Cork',(.42,.26,.12,1),.96,0),
 ('Board',(.29,.19,.09,1),.78,0), ('Metal',(.48,.50,.51,1),.29,.8),
 ('Partition',(.66,.63,.53,1),.7,0), ('Accent',(.055,.16,.32,1),.42,0)]:
 m=bpy.data.materials.new('Office'+role); m.diffuse_color=color; m.use_nodes=True
 bs=m.node_tree.nodes['Principled BSDF']; bs.inputs['Base Color'].default_value=color
 bs.inputs['Roughness'].default_value=rough; bs.inputs['Metallic'].default_value=metal
 materials[role]=m

def mesh(name, verts, faces, role):
 me=bpy.data.meshes.new(name); me.from_pydata([(x,-z,y) for x,y,z in verts],[],faces); me.update()
 o=bpy.data.objects.new(name,me); scene.collection.objects.link(o); me.materials.append(materials[role]); return o

def box(name, c, d, role, bevel=.005):
 x,y,z=c; w,h,l=[v/2 for v in d]
 o=mesh(name,[(x+a*w,y+b*h,z+e*l) for a,b,e in [(-1,-1,-1),(1,-1,-1),(1,-1,1),(-1,-1,1),(-1,1,-1),(1,1,-1),(1,1,1),(-1,1,1)]],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],role)
 if bevel:
  mod=o.modifiers.new('Molded edge radius','BEVEL'); mod.width=bevel; mod.segments=2
 return o

def tube(name,c,r,height,thick,role):
 x,y,z=c; n=24; vs=[]
 for rad,yy in [(r,y),(r,y+height),(r-thick,y+height),(r-thick,y+thick)]:
  vs.extend((x+rad*math.cos(i*math.tau/n),yy,z+rad*math.sin(i*math.tau/n)) for i in range(n))
 fs=[(k*n+i,k*n+(i+1)%n,(k+1)*n+(i+1)%n,(k+1)*n+i) for k in range(3) for i in range(n)]
 fs += [tuple(reversed(range(n))),tuple(3*n+i for i in range(n))]
 return mesh(name,vs,fs,role)

def copy(o,name,offset):
 ob=o.copy(); ob.data=o.data; ob.name=name; scene.collection.objects.link(ob)
 ob.location=(offset[0],-offset[2],offset[1]); return ob

# Seven shells. A continuous floor with three upright edges is thickened
# outward, retaining a genuinely open front and a welded interior corner.
w,d=10/12,13/12
vs=[(-w/2,0,-d/2),(w/2,0,-d/2),(w/2,0,d/2),(-w/2,0,d/2),(-w/2,.15,-d/2),(w/2,.15,-d/2),(w/2,.15,d/2),(-w/2,.15,d/2)]
tray=mesh('Letter tray 01',vs,[(0,1,2,3),(1,5,6,2),(2,6,7,3),(3,7,4,0)],'ABS')
mod=tray.modifiers.new('Continuous molded shell 0.012 ft','SOLIDIFY'); mod.thickness=.012
mod=tray.modifiers.new('Eased rim','BEVEL'); mod.width=.003; mod.segments=2
tray.location=(-1.28,0,.035)
for i in range(1,7): copy(tray,'Letter tray %02d'%(i+1),(-1.28,.035+i*.208333,0))
# Four vertical stacking rails are physically seated on the ledge.
for x in [-1.28-w/2+.025,-1.28+w/2-.025]:
 for z in [-.47,.45]: box('Tray stacking socket rail',(x,.70,z),(.035,1.40,.035),'ABS')
paper=box('Tray paper insert 01',(-1.28,.066,.025),(.708,.025,.916),'Paper',.001)
for i in range(1,7): copy(paper,'Tray paper insert %02d'%(i+1),(0,i*.208333,0))
# Calculator: fitted lower pan and sloped deck, separated by a shadow seam.
box('Calculator lower pan',(-.30,.045,-.12),(.65,.07,.75),'Calculator',.025)
x0,z0=-.30,-.12
verts=[(x0+x,y if y == .083 else y-.12*z,z0+z) for y in [.083,.16] for x,z in [(-.322,-.373),(.322,-.373),(.322,.373),(-.322,.373)]]
mesh('Sloped calculator upper shell',verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],'Calculator')
# Display separate from enclosure, no reproduced digits or commercial legends.
dis=box('Recessed display bezel',(-.30,.202,-.36),(.54,.026,.18),'ABS',.014)
box('Calculator LCD glass',(-.30,.217,-.36),(.47,.004,.125),'Display',.004)
key=None
for row in range(5):
 for col in range(4):
  x=-.53+col*.15; z=-.18+row*.095; y=.17-.12*(z-z0)
  if key is None: key=box('Calculator key 01',(0,0,0),(.117,.035,.079),'Key',.012); key.location=(x,-z,y)
  else: copy(key,'Calculator key %02d'%(row*4+col+1),(x,y,z))
for x in [-.55,-.05]:
 for z in [-.40,.16]: box('Calculator rubber foot',(x,.01,z),(.07,.02,.07),'ABS')
# Cup has a visible inner wall and floor, not an opaque cylinder.
tube('Hollow pen cup',(.32,0,.15),.13,.32,.014,'Metal')
for i in range(5):
 x=.25+(i%3)*.065; z=.10+(i//3)*.085
 tube('Pen barrel %d'%i,(x,.04,z),.015,.47+i*.022,.006,'Accent')
 box('Pen pocket clip %d'%i,(x+.02,.44+i*.022,z),(.009,.11,.01),'Metal',.002)
box('Loose stationery stack',(.90,.034,-.10),(.708,.068,.916),'Paper',.001)
# Partition supported by a bottom channel and screws on the counter ledge.
box('Back partition',(.2,1.02,.60),(3.02,2.04,.055),'Partition')
box('Right partition',(1.73,1.02,.12),(.055,2.04,1.015),'Partition')
box('Back mounting channel',(.2,.035,.60),(3.09,.07,.085),'Metal')
box('Right mounting channel',(1.73,.035,.12),(.085,.07,1.05),'Metal')
# Cork core and four fitted slim surround pieces.
box('Cork bulletin core',(.20,1.25,.557),(2.86,1.42,.025),'Cork',.002)
for x in [-1.265,1.665]: box('Bulletin vertical surround',(x,1.25,.546),(.06,1.54,.038),'Metal')
for y in [.51,1.99]: box('Bulletin horizontal surround',(.20,y,.546),(2.87,.06,.038),'Metal')
for x,y in [(-.66,1.29),(.29,1.32)]:
 box('Blank bulletin paper',(x,y,.536),(.708,.916,.003),'Paper',.0005)
 tube('Bulletin pin',(x,y+.43,.517),.016,.018,.006,'Accent')
# Clipboard on RIGHT partition: board thickness, separate page, spring clip,
# rolled hinge and mounting screw. Local front points toward the clerk (-X).
box('Clipboard hardboard',(1.686,1.32,.04),(.025,1.03,.77),'Board',.013)
box('Clipboard blank paper',(1.669,1.28,.04),(.003,.916,.708),'Paper',.001)
box('Clip backplate',(1.646,1.79,.04),(.02,.16,.29),'Metal')
for z in [-.055,.135]: box('Clipboard through rivet',(1.666,1.81,z),(.045,.025,.025),'Metal',.003)
# Bent spring steel profile, extruded across the clip width.
profile=[(1.636,1.85),(1.595,1.85),(1.563,1.79),(1.577,1.71),(1.669,1.69),(1.669,1.70),(1.587,1.72),(1.574,1.787),(1.602,1.84),(1.636,1.84)]
n=len(profile); vs=[(x,y,z) for z in [-.09,.17] for x,y in profile]
mesh('Sprung clipboard jaw',vs,[tuple(reversed(range(n))),tuple(n+i for i in range(n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],'Metal')
for z in [-.07,.15]: box('Clip hinge knuckle',(1.62,1.84,z),(.045,.038,.034),'Metal',.014)
for x in [-1.24,1.60]:
 box('Channel mounting screw',(x,.075,.60),(.035,.01,.035),'Metal',.012)
for name,p in [('anchor_worktop',(0,0,0)),('anchor_bulletin',(.2,1.25,.6)),('anchor_clipboard',(1.73,1.32,.04))]:
 o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);o.location=(p[0],-p[2],p[1]);o['units']='feet'
# Evaluate bevel/solidify, normalize winding, validate manifold solids, unwrap.
seen=set()
for ob in list(scene.objects):
 if ob.type!='MESH':continue
 bpy.context.view_layer.objects.active=ob;ob.select_set(True)
 if ob.data.users > 1: ob.data=ob.data.copy()
 # Each modifier is applied before sharing equivalent exported geometry.
 for mod in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=mod.name)
 bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
 assert all(e.is_manifold for e in bm.edges),ob.name
 bm.to_mesh(ob.data);bm.free()
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.015);bpy.ops.object.mode_set(mode='OBJECT');ob.select_set(False)
 ob['units']='feet'
# Turn the complete calculator so its high display is away from the clerk.
# Rotation includes the feet, fitted shell, bezel and all keys as one assembly.
for ob in scene.objects:
 if ob.type=='MESH' and ob.name.startswith(('Calculator', 'Sloped calculator', 'Recessed display')):
  ob.location.x = -.6-ob.location.x
  ob.location.y = .24-ob.location.y
  for v in ob.data.vertices: v.co.x=-v.co.x; v.co.y=-v.co.y
# Arrange left/right as seen by a clerk facing +store Z at this rear ledge.
# Mirroring both local vertices and placements retains right-handed world axes.
mirrored=set()
for ob in scene.objects:
 ob.location.x = -ob.location.x
 if ob.type=='MESH' and ob.data.name not in mirrored:
  mirrored.add(ob.data.name)
  for v in ob.data.vertices: v.co.x = -v.co.x
  bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(ob.data);bm.free()
# Deduplicate identical geometry (including UVs) for runtime instancing.
canonical={}
for ob in scene.objects:
 if ob.type!='MESH':continue
 key=(tuple(tuple(round(v,7) for v in p.co) for p in ob.data.vertices),tuple(tuple(p.vertices) for p in ob.data.polygons),tuple(m.name for m in ob.data.materials))
 if key in canonical: ob.data=canonical[key]
 else: canonical[key]=ob.data
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D': area.spaces.active.region_3d.view_distance=5; area.spaces.active.region_3d.view_location=(0,0,1)
source=ROOT/'tools/models/counter-office-kit.blend';out=ROOT/'public/models/counter-office-kit.glb'
bpy.ops.wm.save_as_mainfile(filepath=str(source))
# Batch unique hardware by role; retain repeated mesh nodes for InstancedMesh.
counts={}
for o in scene.objects:
 if o.type=='MESH':counts[o.data.name]=counts.get(o.data.name,0)+1
for mat in materials.values():
 obs=[o for o in scene.objects if o.type=='MESH' and counts[o.data.name]==1 and o.data.materials[0]==mat]
 if len(obs)>1:
  bpy.ops.object.select_all(action='DESELECT')
  for o in obs:o.select_set(True)
  bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();bpy.context.object.name=mat.name+' hardware'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_apply=True,export_yup=True)
metrics={'units':'feet','textures':0,'bytes':out.stat().st_size,'source_meshes':len(counts),'triangles':0}
for o in scene.objects:
 if o.type=='MESH':o.data.calc_loop_triangles();metrics['triangles']+=len(o.data.loop_triangles)
print(json.dumps(metrics));out.with_suffix('.json').write_text(json.dumps(metrics,indent=2)+'\n')
