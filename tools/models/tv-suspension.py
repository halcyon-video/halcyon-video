"""Original generic load-bearing ceiling mount, scene units feet; no photo-derived assets."""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,c,rough,metal):
 m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;return m
steel=mat('PowderCoat',(.055,.06,.07),.48,.65);zinc=mat('ZincFasteners',(.4,.42,.44),.28,.85);rubber=mat('CableJacket',(.012,.014,.018),.75,0)
def group(name):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);return o
plate=group('CeilingPlate');stem=group('DropStem');cradle=group('Cradle');joint=group('Swivel');triple=group('TripleCradle')
def finish(o,name,m,parent):
 o.name=name;o.data.materials.append(m);o.parent=parent;bpy.context.view_layer.objects.active=o
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 mod=o.modifiers.new('Eased metal edges','BEVEL');mod.width=.008;mod.segments=2
 bpy.ops.object.modifier_apply(modifier=mod.name)
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
 return o
def box(name,pos,size,m,parent):
 bpy.ops.mesh.primitive_cube_add(size=1,location=(pos[0],-pos[2],pos[1]));o=bpy.context.object;o.scale=(size[0],size[2],size[1]);return finish(o,name,m,parent)
def cyl(name,pos,r,d,m,parent,axis='y'):
 bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=r,depth=d,location=(pos[0],-pos[2],pos[1]));o=bpy.context.object
 if axis=='x':o.rotation_euler.y=math.pi/2
 if axis=='z':o.rotation_euler.x=math.pi/2
 return finish(o,name,m,parent)
box('Folded ceiling mounting plate',(0,-.045,0),(.72,.09,.58),steel,plate)
for x in [-.25,.25]:
 for z in [-.18,.18]:cyl('Anchor washer',(x,-.095,z),.06,.018,zinc,plate);cyl('Hex anchor head',(x,-.115,z),.035,.025,zinc,plate)
cyl('Upper socket',(0,-.18,0),.10,.24,steel,plate)
cyl('Telescopic drop',(0,.5,0),.065,1,steel,stem)
cyl('Cable conduit',(0,.5,-.095),.018,1,rubber,stem)
cyl('Swivel bearing',(0,.04,0),.14,.16,steel,joint)
cyl('Tilt axle',(0,0,0),.065,.44,zinc,joint,'x')
for x in [-.23,.23]:cyl('Tilt lock head',(x,0,0),.095,.04,zinc,joint,'x')
# Bent U profiles have coherent extruded topology, not overlapping blocks.
def strap(name,z):
 outer=[(-1.4,1.32),(1.4,1.32),(1.4,-1.24),(-1.4,-1.24)]
 inner=[(-1.31,1.23),(1.31,1.23),(1.31,-1.15),(-1.31,-1.15)]
 vertices=[]
 for depth in [z-.055,z+.055]:
  vertices.extend((x,-depth,y) for x,y in outer+inner)
 faces=[]
 for i in range(4):
  j=(i+1)%4
  faces.extend([(i,j,j+8,i+8),(i+4,i+12,j+12,j+4),(i,i+4,j+4,j),(i+8,j+8,j+12,i+12)])
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);return finish(o,name,steel,cradle)
strap('Front formed cage',.65);strap('Rear formed cage',-.65)
for x in [-1.34,1.34]:
 box('Lower support rail',(x,-1.195,0),(.12,.09,1.7),steel,cradle)
 for z in [-.64,.64]:box('Rubber cabinet pad',(x*.92,-1.135,z),(.2,.04,.22),rubber,cradle)
box('Top bridge',(0,1.275,0),(.4,.09,1.4),steel,cradle)
for z in [-.64,.64]:cyl('Bridge rivet',(0,1.34,z),.045,.03,zinc,cradle)
# Rear power/signal lead, rounded sweep with a service loop.
points=[Vector((x,-z,y)) for x,y,z in [(0,1.31,-.095),(0,1.35,-.65),(0,1,-1.2),(.12,.45,-1.18),(0,.1,-1.10)]]
vertices=[]
for i,point in enumerate(points):
 tangent=(points[min(i+1,len(points)-1)]-points[max(0,i-1)]).normalized()
 u=tangent.cross(Vector((1,0,0))).normalized();v=tangent.cross(u).normalized()
 for j in range(8):vertices.append(tuple(point+.018*(u*math.cos(j*math.tau/8)+v*math.sin(j*math.tau/8))))
faces=[tuple(reversed(range(8))),tuple(range(32,40))]
for i in range(4):
 for j in range(8):faces.append((i*8+j,i*8+(j+1)%8,(i+1)*8+(j+1)%8,(i+1)*8+j))
mesh=bpy.data.meshes.new('Closed cable sweep');mesh.from_pydata(vertices,[],faces);mesh.update();o=bpy.data.objects.new('Rear service loop',mesh);bpy.context.collection.objects.link(o);o.parent=cradle;o.data.materials.append(rubber)
bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
# A shared upper cable run branches into a service loop at every cabinet.
for x in [-2.75,0,2.75]:
 lead=o.copy();lead.data=o.data.copy();lead.name='Triple rear service loop';lead.parent=triple;lead.location.x+=x;lead.location.z+=.15;bpy.context.collection.objects.link(lead)
cyl('Shared rear cable run',(0,1.46,-.095),.018,5.5,rubber,triple,'x')
# Three adjoining cabinets share continuous rails and one suspended structure.
for z in [-.65,.65]:
 box('Triple top rail',(0,1.275,z),(8.3,.09,.11),steel,triple)
 box('Triple lower rail',(0,-1.195,z),(8.3,.09,.11),steel,triple)
 for x in [-4.105,-1.375,1.375,4.105]:
  box('Triple upright',(x,.04,z),(.09,2.56,.11),steel,triple)
for x in [-4.05,-1.375,1.375,4.05]:
 box('Triple tray bridge',(x,-1.195,0),(.12,.09,1.7),steel,triple)
for x in [-2.75,0,2.75]:
 for z in [-.64,.64]:box('Triple cushion',(x,-1.135,z),(1.8,.04,.22),rubber,triple)
box('Suspension spreader',(0,1.36,0),(6.1,.13,.45),steel,triple)
for x in [-2.75,2.75]:
 box('Spreader tie',(x,1.29,0),(.4,.09,1.4),steel,triple)
 for z in [-.64,.64]:cyl('Spreader rivet',(x,1.34,z),.045,.03,zinc,triple)
# Consolidate each articulated part by material: small stable draw-call budget.
for parent in [plate,stem,cradle,joint,triple]:
 for material in [steel,zinc,rubber]:
  objects=[o for o in parent.children if o.type=='MESH' and o.data.materials[0]==material]
  if not objects:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in objects:o.select_set(True)
  bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=objects[0];o.name=parent.name+'_'+material.name
  bm=bmesh.new();bm.from_mesh(o.data);assert all(e.is_manifold for e in bm.edges),o.name;bm.free()
for p in [plate,stem,cradle,joint,triple]:p['units']='feet';p['design']='Original generic mount, existing 2.6 x 2.2 x 2.2 ft CRT envelope'
bpy.context.scene.unit_settings.system='IMPERIAL';bpy.context.scene.unit_settings.scale_length=.3048
bpy.context.view_layer.update()
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=6
out=ROOT/'public/models/tv-suspension.glb';out.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/tv-suspension.blend'))
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_yup=True,export_apply=True)
tris=sum(len(o.data.polygons) for o in bpy.data.objects if o.type=='MESH')
metrics={'bytes':out.stat().st_size,'polygons':tris,'meshes':len([o for o in bpy.data.objects if o.type=='MESH']),'units':'feet','cabinetEnvelope':[2.6,2.2,2.2],'cradleBounds':[2.8,2.56,1.7]}
(ROOT/'tools/models/tv-suspension-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n');print(metrics)
