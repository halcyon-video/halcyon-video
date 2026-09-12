"""Original generic service exit, scripted mesh authoring; numeric feet.
Paired 1.75-inch leaf representations fit the retained solid-wall shell.
Run blender -b -P tools/models/service-door.py. See docs/service-door-model.md.
"""
import bpy, bmesh, math, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/models'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.scene.unit_settings.system = 'IMPERIAL'
bpy.context.scene.unit_settings.scale_length = .3048
MATERIALS=[]
for name,color,rough,metal in [
 ('ServiceLeaf',(.041,.051,.069,1),.6,.35),
 ('ServiceFrame',(.016,.019,.024,1),.5,.6),
 ('ServiceHardware',(.485,.515,.558,1),.25,.9),
 ('ServiceSeal',(.009,.011,.012,1),.9,0)]:
 m=bpy.data.materials.new(name);m.diffuse_color=color;m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=color
 p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 MATERIALS.append(m)
def mesh(name, verts, faces, role):
    data = bpy.data.meshes.new(name)
    # Store X, height, depth -> Blender X, -depth, height -> glTF Y up.
    data.from_pydata([(x, -z, y) for x, y, z in verts], [], faces)
    data.materials.append(MATERIALS[role])
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    # Physical, four-foot texture tiles; no wall or shadow baked into UVs.
    uv = data.uv_layers.new(name='SurfaceFeet')
    for poly in data.polygons:
        axis = max(range(3), key=lambda k: abs(poly.normal[k]))
        axes = [k for k in range(3) if k != axis]
        for li in poly.loop_indices:
            v = data.vertices[data.loops[li].vertex_index].co
            uv.data[li].uv = (v[axes[0]] / 4, v[axes[1]] / 4)
    return obj


def extrude_profile(name, profile, x0, x1, role):
    n = len(profile)
    verts = [(x, y, z) for x in [x0, x1] for z, y in profile]
    faces = [tuple(reversed(range(n))), tuple(range(n, 2*n))]
    faces += [(j, (j+1) % n, (j+1) % n+n, j+n) for j in range(n)]
    return mesh(name, verts, faces, role)


def tube(name, a, b, radius, role=2):
    from mathutils import Vector
    a, b = Vector(a), Vector(b)
    direction = (b-a).normalized()
    up = Vector((0, 1, 0)) if abs(direction.y) < .9 else Vector((0, 0, 1))
    u = direction.cross(up).normalized()
    v = direction.cross(u).normalized()
    verts = [tuple(p + radius*(u*math.cos(k*math.tau/8) + v*math.sin(k*math.tau/8)))
             for p in [a, b] for k in range(8)]
    faces = [tuple(reversed(range(8))), tuple(range(8, 16))]
    faces += [(k, (k+1) % 8, (k+1) % 8+8, k+8) for k in range(8)]
    return mesh(name, verts, faces, role)



def prism(name, profile, a, b, axis, role):
 # profile is the other two store axes, in ascending axis order.
 verts=[]
 for end in [a,b]:
  for p,q in profile:
   v=[p,q];v.insert(axis,end);verts.append(tuple(v))
 n=len(profile)
 return mesh(name,verts,[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)],role)
def box(name,lo,hi,role,bevel=0):
 obj=prism(name,[(lo[0],lo[1]),(hi[0],lo[1]),(hi[0],hi[1]),(lo[0],hi[1])],lo[2],hi[2],2,role)
 if bevel:
  bpy.context.view_layer.objects.active=obj
  mod=obj.modifiers.new('Eased metal edges','BEVEL');mod.width=bevel;mod.segments=2
  bpy.ops.object.modifier_apply(modifier=mod.name)
 return obj
# The assembly fits the two pre-existing wall faces. Matched skins are deliberate
# architectural dressing, not a claim of a ten-inch-thick physical door leaf.
for side,face,direction in [('Interior',-.12,-1),('Exterior',.735,1)]:
 back=face-direction*.146
 box(side+' hollow metal leaf',(min(face,back),.035,-1.475),(max(face,back),6.99,1.475),0,.009)
 # Brake-folded jamb: flange, return, stop and inner return, closed sheet section.
 for sign in [-1,1]:
  profile=[(face+direction*d,sign*w) for d,w in [(.025,1.70),(-.055,1.70),(-.055,1.51),(-.16,1.51),(-.16,1.47),(-.135,1.47),(-.135,1.485),(-.03,1.485),(-.03,1.675),(.025,1.675)]]
  prism(side+(' hinge jamb' if sign==-1 else ' strike jamb'),profile,0,7.0,1,1)
  box(side+' compression seal '+str(sign),(min(face,face-direction*.028),.04,sign*1.485-.012),(max(face,face-direction*.028),6.99,sign*1.485+.012),3)
 # Head folds share the jamb depth and meet at 7 feet.
 profile=[(face+direction*d,7+w-1.5) for d,w in [(.025,1.70),(-.055,1.70),(-.055,1.51),(-.16,1.51),(-.16,1.47),(-.135,1.47),(-.135,1.485),(-.03,1.485),(-.03,1.675),(.025,1.675)]]
 prism(side+' pressed head',profile,-1.70,1.70,2,1)
 box(side+' sweep',(min(face,face+direction*.018),.035,-1.46),(max(face,face+direction*.018),.09,1.46),3)
# Exterior out-swing hinge barrels, five alternating knuckles, fitted hinge plates.
for i,y in enumerate([.85,3.5,6.15]):
 box('Hinge %d leaf plate'%i,(.735,y-.18,-1.475),(.755,y+.18,-1.27),2,.004)
 box('Hinge %d frame plate'%i,(.745,y-.18,-1.67),(.765,y+.18,-1.51),2,.004)
 for k in range(5):
  tube('Hinge %d knuckle %d'%(i,k),(.785,y-.18+k*.072,-1.49),(.785,y-.112+k*.072,-1.49),.038)
 for z in [-1.61,-1.32]:
  for dy in [-.11,.11]:tube('Hinge screw',(.759,y+dy,z),(.773,y+dy,z),.018)
# Rim exit device, end housings touch the leaf; push pad sits on its carrier.
box('Panic carrier',(-.235,3.18,-1.20),(-.12,3.43,1.29),1,.025)
for z in [-1.18,1.16]:box('Panic end housing',(-.34,3.12,z-.13),(-.12,3.49,z+.13),2,.035)
prism('Rounded push pad',[(-.235,3.21),(-.315,3.21),(-.365,3.25),(-.365,3.37),(-.315,3.41),(-.235,3.41)],-1.0,1.0,2,2)
box('Rim latch bolt',(-.235,3.23,1.29),(-.17,3.36,1.52),2,.008)
box('Strike keeper',(-.26,3.18,1.51),(-.13,3.43,1.60),2,.009)
# Exterior keyed lever on through-bolted escutcheon, aligned with the rim latch.
box('Exterior escutcheon',(.735,3.03,1.07),(.77,3.57,1.28),2,.022)
tube('Lever spindle',(.77,3.3,1.175),(.89,3.3,1.175),.055)
tube('Returned lever grip',(.89,3.3,1.175),(.89,3.3,.82),.045)
tube('Lever return',(.89,3.3,.82),(.82,3.3,.82),.045)
tube('Key cylinder',(.77,3.47,1.175),(.785,3.47,1.175),.045)
box('Key slot',(.785,3.45,1.168),(.788,3.49,1.182),3)
# Surface hydraulic closer and two pivoting arms; shoe meets the head flange.
box('Closer body',(-.31,6.49,-1.12),(-.12,6.78,-.39),2,.04)
tube('Closer spindle',(-.23,6.76,-.90),(-.23,6.88,-.90),.045)
tube('Closer main arm',(-.23,6.85,-.90),(-.58,6.94,-.26),.027)
tube('Closer forearm',(-.58,6.94,-.26),(-.18,7.055,.18),.022)
box('Closer frame shoe',(-.20,7.02,.09),(-.145,7.13,.27),2,.007)
# Sloping saddle threshold and traction ribs; exterior top clears retained stoop.
prism('Saddle threshold',[(-.22,.012),(-.14,.055),(.60,.055),(.76,.235),(.93,.235),(1.00,.22),(1.00,.20),(.78,.20),(.62,.02),(-.22,0)],-1.48,1.48,2,2)
for x in [-.10,.02,.14,.26,.38,.50,.80,.87]:
 y=.057 if x<.6 else .237
 box('Threshold traction flute',(x,y,-1.46),(x+.018,y+.009,1.46),3)
# Inspect every authored solid before batching, retain named editable parts.
metrics={'units':'feet','leafWidth':2.95,'leafHeight':6.955,'leafThickness':.146,'textures':0,'parts':[]}
for obj in list(bpy.context.scene.objects):
 bm=bmesh.new();bm.from_mesh(obj.data);bad=sum(not e.is_manifold for e in bm.edges);bm.free()
 assert bad==0,(obj.name,bad)
 assert obj.data.uv_layers.active
 obj.data.calc_loop_triangles()
 metrics['parts'].append({'name':obj.name,'triangles':len(obj.data.loop_triangles),'nonManifoldEdges':bad})
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':
  area.spaces.active.region_3d.view_distance=11
  area.spaces.active.region_3d.view_location=(0,0,3.5)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/service-door.blend'))
# Four runtime draws; the .blend above retains separate named physical parts.
for mat in MATERIALS:
 objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials[0]==mat]
 bpy.ops.object.select_all(action='DESELECT')
 for obj in objects:
  vg=obj.vertex_groups.new(name=obj.name);vg.add(list(range(len(obj.data.vertices))),1,'REPLACE');obj.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();objects[0].name=mat.name
bpy.ops.export_scene.gltf(filepath=str(OUT/'service-door.glb'),export_format='GLB',export_yup=True,export_apply=True)
metrics['triangles']=sum(p['triangles'] for p in metrics['parts']);metrics['draws']=len(MATERIALS)
metrics['bytes']=(OUT/'service-door.glb').stat().st_size
(ROOT/'tools/models/service-door-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
print(json.dumps({k:v for k,v in metrics.items() if k!='parts'}))
