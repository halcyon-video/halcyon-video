"""Original generic sign mounting kit, scripted mesh authoring for issue #236.
Run: blender -b -t 2 -P tools/models/sign-mount.py
One coordinate unit = one store foot; Blender (x, -store_z, store_y).
Runtime parts have independent origins; only channel length and drop length scale.
"""
from pathlib import Path
import bpy, bmesh, math, json
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
roles={}
for name,color,metal,rough in [('MountChannel',(.055,.063,.075,1),.45,.48),('MountSteel',(.43,.46,.49,1),.8,.32)]:
 m=bpy.data.materials.new(name);m.diffuse_color=color;m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=color;p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;roles[name]=m

def mesh(name,v,f,role):
 me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);me.materials.append(roles[role])
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT')
 o['provenance']='Original generic mounting hardware, scripted Blender mesh authoring; not a measured historical replica';o['units']='feet'
 return o

def profile_x(name,profile,length,role):
 # Closed folded-metal cross-section in (depth, height), extruded along X.
 n=len(profile);v=[(x,-d,h) for x in [-length/2,length/2] for d,h in profile]
 f=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 return mesh(name,v,f,role)

def lathe(name,profile,n=12):
 v=[(r*math.cos(2*math.pi*j/n),r*math.sin(2*math.pi*j/n),h) for r,h in profile for j in range(n)]
 f=[(i*n+j,i*n+(j+1)%n,((i+1)%len(profile))*n+(j+1)%n,((i+1)%len(profile))*n+j) for i in range(len(profile)) for j in range(n)]
 return mesh(name,v,f,'MountSteel')

# Continuous U section: 0.006 ft sheet, underside grips a 0.04 ft board.
profile_x('TopChannel',[(-.032,-.022),(-.032,.032),(.032,.032),(.032,-.022),(.026,-.022),(.026,.026),(-.026,.026),(-.026,-.022)],1,'MountChannel')
# Folded spring saddle: flat top contacts ceiling; rolled-in lower returns.
profile_x('CeilingClip',[(-.07,0),(.07,0),(.07,-.034),(.045,-.048),(.019,-.048),(.019,-.040),(.043,-.040),(.062,-.029),(.062,-.008),(-.062,-.008),(-.062,-.029),(-.043,-.040),(-.019,-.040),(-.019,-.048),(-.045,-.048),(-.07,-.034)],.16,'MountSteel')
# Closed annular eye with a real opening, flattened into the sign plane.
n=16;v=[]
for depth in [-.009,.009]:
 for radius in [.034,.021]:
  v += [(radius*math.cos(2*math.pi*j/n),depth,.066+radius*math.sin(2*math.pi*j/n)) for j in range(n)]
f=[]
for j in range(n):
 k=(j+1)%n
 f += [(j,k,n+k,n+j),(2*n+j,3*n+j,3*n+k,2*n+k),(j,2*n+j,2*n+k,k),(n+j,n+k,3*n+k,3*n+j)]
eye=mesh('AttachmentEye',v,f,'MountSteel')
# Turned cable gripper: chamfered shoulders, wrench flats, central cable bore.
lathe('WireConnector',[(.010,.088),(.019,.096),(.019,.121),(.013,.127),(.013,.153),(.009,.160),(.004,.160),(.004,.088)])
# Closed rod with tiny center caps represented by axis vertices after welding.
n=8
v=[(.0035*math.cos(2*math.pi*j/n),.0035*math.sin(2*math.pi*j/n),h) for h in [0,1] for j in range(n)]
f=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
mesh('SuspensionWire',v,f,'MountSteel')
# Short rigid wedge drops keep the original bar-and-two-drops construction.
profile_x('RigidDrop',[(-.014,0),(.014,0),(.014,1),(-.014,1)],.028,'MountChannel')
# Eye screws/ceiling fastening collars: bore and chamfered head, same origin.
lathe('Fastener',[(.012,0),(.012,.012),(.018,.014),(.018,.021),(.014,.025),(.005,.025),(.005,0)],12)
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];stats={}
for o in meshes:
 bm=bmesh.new();bm.from_mesh(o.data);assert all(e.is_manifold for e in bm.edges),o.name;assert all(f.calc_area()>1e-12 for f in bm.faces),o.name;bm.free();o.data.calc_loop_triangles()
 coords=[Vector(c) for c in o.bound_box]
 stats[o.name]={'triangles':len(o.data.loop_triangles),'bounds_blender':[[min(v[i] for v in coords) for i in range(3)],[max(v[i] for v in coords) for i in range(3)]],'material':o.data.materials[0].name,'uv':True,'manifold':True}
bpy.ops.object.select_all(action='SELECT');out=ROOT/'public/models/sign-mount.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_extras=True)
# Editable exploded parts tray, after export so runtime origins remain canonical.
for i,o in enumerate(meshes):o.location.x=(i%4)*.4;o.location.y=(i//4)*.35
scene=bpy.context.scene;scene.unit_settings.system='IMPERIAL';scene.unit_settings.scale_length=.3048;scene.unit_settings.length_unit='FEET'
scene['assembly']='Runtime positions canonical parts in sign-mount.ts. Channel at sign top, clips at ceiling. Board eyes + grippers; wedge rigid drops.'
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=2.5;area.spaces.active.region_3d.view_location=(.6,.1,.4)
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/sign-mount.blend'))
(ROOT/'tools/models/sign-mount-metrics.json').write_text(json.dumps({'parts':stats,'triangles':sum(p['triangles'] for p in stats.values()),'bytes':out.stat().st_size,'materials':len(roles),'textures':0},indent=2)+'\n')
