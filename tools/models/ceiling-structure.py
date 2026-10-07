"""Original open-web ceiling and exposed duct components, in store feet.
Uses the established Blender X,-Z,Y mesh and native glTF export workflow.
Only the visible steel, duct skins, straps and outlet faces are authored.
"""
import bpy, bmesh, math, json, struct
from pathlib import Path
from mathutils import Vector, Euler
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
parts=[];stats={}
def material(name,color,metal,rough):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 return m
paint=material('StructuralPaint',(.69,.72,.70),.25,.55)
duct=material('DuctMetal',(.49,.53,.56),.65,.42)
dark=material('OutletRecess',(.07,.08,.085),.2,.7)
def mesh(name,v,f,mat=paint):
 me=bpy.data.meshes.new(name);me.from_pydata([(x,-z,y) for x,y,z in v],[],f);me.update()
 ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob);me.materials.append(mat)
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
 assert all(e.is_manifold for e in bm.edges),name
 assert bm.calc_volume(signed=True)>0,name
 bm.to_mesh(me);bm.free();me.update()
 uv=me.uv_layers.new(name='PhysicalSurfaceFeet')
 for face in me.polygons:
  axis=max(range(3),key=lambda i:abs(face.normal[i]));axes=[i for i in range(3) if i!=axis]
  for li in face.loop_indices:
   co=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=(co[axes[0]],co[axes[1]])
 me.calc_loop_triangles();stats[name]={'triangles':len(me.loop_triangles),'manifold':True,'vertices':len(me.vertices),'material':mat.name}
 parts.append(ob);return ob
def prism(name,section,length,axis='x',mat=paint):
 n=len(section);v=[]
 for a in [-length/2,length/2]:
  v += [(a,b,c) if axis=='x' else (b,c,a) for b,c in section]
 return mesh(name,v,[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat)
def merged(name,objects):
 bpy.ops.object.select_all(action='DESELECT')
 for ob in objects:ob.select_set(True);parts.remove(ob);stats.pop(ob.name,None)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();ob=objects[0];ob.name=name;parts.append(ob)
 ob.data.calc_loop_triangles();stats[name]={'triangles':len(ob.data.loop_triangles),'manifold':True,'vertices':len(ob.data.vertices),'material':ob.data.materials[0].name}
 return ob
# Paired angle chords leave the rod web visible between their vertical legs.
section=[(0,.005),(.085,.005),(.085,.02),(.018,.02),(.018,.12),(0,.12)]
chord=merged('TrussChord',[prism('Angle positive',section,1),prism('Angle negative',[(y,-z) for y,z in section],1)])
def circle(radius,n=16):return [(radius*math.cos(i*2*math.pi/n),radius*math.sin(i*2*math.pi/n)) for i in range(n)]
web=prism('TrussWeb',circle(.024,8),1)
span=prism('DuctSpan',circle(.34,24),1,'z',duct)
collar=prism('DuctCollar',circle(.356,24),.045,'z',duct)
# Swept ninety-degree elbow: +X inlet at origin, +Z outlet at (.65,0,.65).
v=[];f=[];N=24;steps=12;r=.65
for j in range(steps+1):
 a=j*math.pi/(2*steps)
 for i in range(N):
  t=i*2*math.pi/N
  v.append((r*math.sin(a)+.34*math.sin(a)*math.cos(t),.34*math.sin(t),r*(1-math.cos(a))-.34*math.cos(a)*math.cos(t)))
for j in range(steps):
 for i in range(N):f.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
f.extend([tuple(reversed(range(N))),tuple(steps*N+i for i in range(N))]);elbow=mesh('DuctElbow',v,f,duct)
# A formed cradle strap follows the exposed lower duct; rods start at its ears.
section=[]
for radius,direction in [(.366,range(21)),(.356,range(20,-1,-1))]:
 for i in direction:
  a=-math.pi*.72+i*math.pi*1.44/20;section.append((radius*math.sin(a),-radius*math.cos(a)))
strap=prism('DuctStrap',section,.07,'z',duct)
# End discharge: a shallow dark seat with visible horizontal louvers. No hidden
# fan, duct interior or electrical construction is included.
outletparts=[prism('Discharge seat',circle(.335,24),.018,'z',dark)]
for i in range(-4,5):
 y=i*.06;half=math.sqrt(.326**2-y*y)
 outletparts.append(prism('Discharge louver',[(y-.012,-.013),(y+.012,-.013),(y+.015,.012),(y-.009,.012)],half*2,'x',duct))
outlet=merged('DuctOutlet',outletparts)
scene=bpy.context.scene;scene.unit_settings.system='IMPERIAL';scene.unit_settings.scale_length=.3048
bpy.ops.object.select_all(action='DESELECT')
for ob in parts:ob.select_set(True)
out=ROOT/'public/models/ceiling-structure.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_extras=True,export_yup=True)
data=out.read_bytes();gltf=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]])
stats['resources']={'bytes':len(data),'triangles':sum(gltf['accessors'][p['indices']]['count']//3 for m in gltf['meshes'] for p in m['primitives']),'textures':0,'parts':len(parts),'materialRoles':3}
(ROOT/'tools/models/ceiling-structure-metrics.json').write_text(json.dumps(stats,indent=2)+'\n')
# A readable assembly in the editable source; templates keep their export origins.
preview=bpy.data.collections.new('Eight-foot construction study - not exported');scene.collection.children.link(preview)
def copy(ob,name,position=(0,0,0),rotation=(0,0,0),scale=(1,1,1)):
 c=ob.copy();c.name=name;preview.objects.link(c);x,y,z=position;c.location=(x,-z,y);c.rotation_euler=rotation;c.scale=scale;return c
copy(chord,'Lower paired angles',(0,0,0),scale=(8,1,1))
copy(chord,'Upper paired angles',(0,1.6,0),rotation=(math.pi,0,0),scale=(8,1,1))
for i in range(8):
 a=Vector((-4+i,0 if i%2==0 else 1.6,0));b=Vector((-3+i,1.6 if i%2==0 else 0,0));mid=(a+b)/2
 c=copy(web,'Diagonal web '+str(i),mid);direction=Vector((b.x-a.x,0,b.y-a.y));c.rotation_mode='QUATERNION';c.rotation_quaternion=Vector((1,0,0)).rotation_difference(direction);c.scale.x=(b-a).length
copy(span,'Exposed straight duct',(.65,-.8,0),scale=(1,4,1));copy(elbow,'Bend',(0,-.8,-2.65))
copy(strap,'Formed hanger',(.65,-.8,1));copy(outlet,'Visible discharge',(.65,-.8,2.025))
for ob in parts:ob.hide_set(True)
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   area.spaces.active.region_3d.view_distance=12;area.spaces.active.region_3d.view_location=(0,0,.5)
   area.spaces.active.region_3d.view_rotation=Euler((1.15,0,-.6)).to_quaternion();area.spaces.active.shading.color_type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/ceiling-structure.blend'))
print(json.dumps(stats['resources']))
