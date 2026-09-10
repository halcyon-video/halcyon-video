"""Original generic stock cart; feet, Blender Z up, glTF Y up. Run blender -b -P this_file."""
import bpy, math, os, json
from mathutils import Vector
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
def material(name,color,metal):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=.4
 return m
steel=material('FrameSteel',(.025,.029,.034),.65); chrome=material('Hardware',(.32,.35,.38),.85); rubber=material('Tire',(.012,.012,.015),0)
def finish(o,name,mat):
 o.name=name; o.data.materials.append(mat)
 bpy.context.view_layer.objects.active=o; o.select_set(True)
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 mod=o.modifiers.new('Eased manufactured edges','BEVEL'); mod.width=.012; mod.segments=2
 bpy.ops.object.modifier_apply(modifier=mod.name)
 bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(island_margin=.02); bpy.ops.object.mode_set(mode='OBJECT'); o.select_set(False)
 return o
def box(name,loc,size,mat=steel):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object; o.dimensions=size; return finish(o,name,mat)
def tube(name,points,r=.035,mat=chrome):
 # Continuous swept tube, including curved handle corners.
 verts=[]; faces=[]; n=10
 for i,p in enumerate(points):
  tangent=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
  tangent.normalize(); u=tangent.cross(Vector((0,0,1)))
  if u.length<.01:u=tangent.cross(Vector((0,1,0)))
  u.normalize(); v=tangent.cross(u)
  for j in range(n):verts.append(Vector(p)+r*(u*math.cos(j*math.tau/n)+v*math.sin(j*math.tau/n)))
 for i in range(len(points)-1):
  for j in range(n):a=i*n+j;b=i*n+(j+1)%n;faces.append((a,b,b+n,a+n))
 faces += [tuple(reversed(range(n))),tuple((len(points)-1)*n+j for j in range(n))]
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);finish(o,name,mat)
# Frame overall 3.4 x 1.9 ft; tray floor top 2.55, rim 2.9.
for x in [-1.5,1.5]:
 for y in [-.75,.75]:
  tag=f'{x}_{y}'
  box('Upright_'+tag,(x,y,1.72),(.10,.10,2.36))
  box('CasterPlate_'+tag,(x,y,.53),(.26,.25,.05),chrome)
  for dy in [-.095,.095]:box('CasterFork_'+tag+str(dy),(x,y+dy,.35),(.12,.035,.32),chrome)
  bpy.ops.mesh.primitive_cylinder_add(vertices=20,radius=.18,depth=.15,location=(x,y,.18),rotation=(math.pi/2,0,0));finish(bpy.context.object,'Tire_'+tag,rubber)
  bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.065,depth=.23,location=(x,y,.18),rotation=(math.pi/2,0,0));finish(bpy.context.object,'Axle_'+tag,chrome)
# Solid sheet tray: inset floor, fitted four walls with rolled upper edges.
box('TopTrayFloor',(0,0,2.525),(3.2,1.7,.05))
for y in [-.875,.875]:box('TrayLongWall'+str(y),(0,y,2.70),(3.3,.05,.40))
for x in [-1.675,1.675]:box('TrayEndWall'+str(x),(x,0,2.70),(.05,1.8,.40))
# Lower shelf and tilted back support; cases lean into this open rack.
box('LowerShelf',(0,0,.875),(3.2,1.7,.05))
for y in [-.86,.86]:box('LowerLip'+str(y),(0,y,.95),(3.3,.04,.15))
for x in [-1.63,1.63]:box('LowerEnd'+str(x),(x,0,.95),(.04,1.7,.15))
o=box('LeaningRackBack',(0,.41,1.20),(3.1,.04,.68));o.rotation_euler.x=-math.pi/6
for y in [-.80,.80]:tube('FrameRail'+str(y),[(-1.5,y,2.35),(1.5,y,2.35)],.035,steel)
points=[(1.5,-.75,2.65),(1.9,-.75,2.65)]
for i in range(1,7):a=-math.pi/2+i*math.pi/12;points.append((1.9+.15*math.cos(a),-.6+.15*math.sin(a),2.65))
points.append((2.05,.6,2.65))
for i in range(1,7):a=i*math.pi/12;points.append((1.9+.15*math.cos(a),.6+.15*math.sin(a),2.65))
points.append((1.5,.75,2.65));tube('ContinuousPushHandle',points)
bpy.context.scene.unit_settings.system='IMPERIAL';bpy.context.scene.unit_settings.scale_length=.3048
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'tools/models/release-cart.blend'))
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active=next(o for o in bpy.context.scene.objects if o.type=='MESH')
bpy.ops.object.join()
bpy.context.object.name='ReleaseCartRuntime'
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT,'public/models/release-cart.glb'),export_format='GLB',export_yup=True)
tris=sum(len(o.data.loop_triangles) for o in [])
report={'triangles':0,'parts':0,'materials':3,'textures':0}
for o in bpy.context.scene.objects:
 if o.type=='MESH':o.data.calc_loop_triangles();report['triangles']+=len(o.data.loop_triangles);report['parts']+=1
report['bytes']=os.path.getsize(os.path.join(ROOT,'public/models/release-cart.glb'))
print('CART_METRICS',json.dumps(report))
