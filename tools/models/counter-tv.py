"""Original generic compact CRT and counter bracket, #210. No external art.
Feet; author in store coordinates via (x,-z,y). Rebuild: blender -b -t 2 -P tools/models/counter-tv.py
"""
import bpy,bmesh,math,random,json,struct
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
parts=[]
def empty(name,pos,parent=None):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=(pos[0],-pos[2],pos[1]);o.parent=parent;return o
root=empty('CounterTelevision',(0,0,0));mount=empty('MountAssembly',(0,0,0),root);head=empty('SwivelHead',(0,2.025,0),root)
# Parenting below preserves authored world positions, leaving useful head pivot.
rng=random.Random(210)
normal=bpy.data.images.new('Molded grain normal',width=128,height=128);normal.colorspace_settings.name='Non-Color'
pix=[]
for i in range(128*128):pix.extend((.5+rng.uniform(-.035,.035),.5+rng.uniform(-.035,.035),1,1))
normal.pixels=pix;normal.pack()
def material(name,color,rough,metal=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1);p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal
 im=bpy.data.images.new(name+' finish variation',width=128,height=128);im.colorspace_settings.name='Non-Color';pix=[]
 for i in range(128*128):
  v=rough+rng.uniform(-.025,.025);pix.extend((v,v,v,1))
 im.pixels=pix;im.pack();n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=im;m.node_tree.links.new(n.outputs['Color'],p.inputs['Roughness'])
 n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=normal;b=m.node_tree.nodes.new('ShaderNodeNormalMap');b.inputs['Strength'].default_value=.4;m.node_tree.links.new(n.outputs['Color'],b.inputs['Color']);m.node_tree.links.new(b.outputs['Normal'],p.inputs['Normal']);return m
shell=material('WarmGrayABS',(.48,.46,.40),.59);trim=material('GraphiteBezel',(.12,.13,.13),.66);steel=material('PowderCoatedSteel',(.16,.17,.18),.43,.65);metal=material('ZincFasteners',(.48,.49,.47),.32,.8);inset=material('VentAndControlRecess',(.085,.09,.09),.8)
def finish(o,name,mat,parent,bevel=.003):
 o.name=name;o.data.materials.append(mat);bpy.context.view_layer.objects.active=o
 if bevel:
  mod=o.modifiers.new('Molded edge radius','BEVEL');mod.width=bevel;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name)
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));assert all(e.is_manifold for e in bm.edges),name;bm.to_mesh(o.data);bm.free()
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT')
 world=o.matrix_world.copy();o.parent=parent;o.matrix_world=world;parts.append(o);return o

def box(name,pos,size,mat,parent=head,bevel=.003):
 bpy.ops.mesh.primitive_cube_add(size=1,location=(pos[0],-pos[2],pos[1]));o=bpy.context.object;o.scale=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,name,mat,parent,bevel)
def cyl(name,pos,r,depth,mat,parent=mount,axis='y'):
 bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=r,depth=depth,location=(pos[0],-pos[2],pos[1]));o=bpy.context.object
 if axis=='z':o.rotation_euler.x=math.pi/2
 if axis=='x':o.rotation_euler.y=math.pi/2
 return finish(o,name,mat,parent,.002)
box('CounterMountPlate',(0,.018,0),(.32,.036,.28),steel,mount,.012)
for x in [-.115,.115]:
 for z in [-.09,.09]:
  cyl('MountBolt',(x,.042,z),.022,.014,metal);box('BoltDriverSlot',(x,.05,z),(.024,.001,.004),inset,mount,.0003)
cyl('RiserTube',(0,1.025,0),.05,1.98,steel);cyl('BaseWeldCollar',(0,.075,0),.067,.06,steel)
cyl('SwivelBearing',(0,2.005,0),.085,.07,steel,head);cyl('TiltAxle',(0,2.035,0),.035,.45,metal,head,'x')
box('SupportSaddle',(0,2.0654,0),(.57,.038,.48),steel,head,.012)
for x in [-.2,.2]:box('TiltYokeEar',(x,2.025,0),(.035,.08,.17),steel)
# Closed tapered back cabinet with coherent rings, front behind live screen.
cy=2.4944
rings=[(.525,.41,.41),(.525,.41,.30),(.40,.32,-.34),(.33,.27,-.425)]
verts=[(sx*w,-z,cy+sy*h) for w,h,z in rings for sx,sy in [(-1,-1),(1,-1),(1,1),(-1,1)]]
faces=[(3,2,1,0),(12,13,14,15)]+[(r*4+i,r*4+(i+1)%4,(r+1)*4+(i+1)%4,(r+1)*4+i) for r in range(3) for i in range(4)]
me=bpy.data.meshes.new('Tapered cabinet topology');me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new('Cabinet',me);bpy.context.collection.objects.link(o);cabinet=finish(o,'TaperedABSCabinet',shell,head,.012)
# Real open bezel ring: four solid rails expose the unchanged procedural glass.
for x in [-.458,.458]:box('BezelSide',(x,cy,.437),(.085,.69,.035),trim,bevel=.009)
for y in [-.35,.35]:box('BezelRail',(0,cy+y,.437),(.995,.06,.035),trim,bevel=.009)
# Boolean recesses are physical openings with closed wall thickness.
def cut(target,pos,size):
 bpy.ops.mesh.primitive_cube_add(size=1,location=(pos[0],-pos[2],pos[1]));tool=bpy.context.object;tool.scale=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 bpy.context.view_layer.objects.active=target;mod=target.modifiers.new('Machined recess','BOOLEAN');mod.operation='DIFFERENCE';mod.object=tool;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(tool,do_unlink=True)
cut(cabinet,(0,cy,-.43),(.55,.46,.08))
panel=box('RearServicePanel',(0,cy,-.407),(.53,.43,.020),trim,bevel=.008)
for i in range(11):cut(panel,(0,cy-.04+i*.023,-.415),(.43,.010,.06))
box('RearVentInterior',(0,cy+.075,-.395),(.45,.26,.002),inset,bevel=.001)
for x in [-.235,.235]:
 for y in [-.18,.18]:cyl('RearCoverScrew',(x,cy+y,-.419),.012,.004,metal,head,'z')
box('RearConnectorWell',(0,cy-.14,-.419),(.24,.058,.004),inset)
for x in [-.075,0,.075]:cyl('AerialAVSocket',(x,cy-.14,-.418),.019,.012,metal,head,'z')
for x in [-1,1]:
 for i in range(9):cut(cabinet,(x*.509,cy-.16+i*.036,.215),(.055,.015,.105))
# Re-unwrap boolean meshes and validate closed cabinet/panel topology.
for obj in [cabinet,panel]:
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
 bm=bmesh.new();bm.from_mesh(obj.data);assert all(e.is_manifold for e in bm.edges),obj.name;bm.free()
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT')
for x in [.22,.30,.38]:cyl('FrontControlButton',(x,cy-.35,.460),.018,.012,trim,head,'z')
for i in range(15):box('SpeakerSlot_%02d'%i,(-.34+i*.029,cy-.35,.456),(.012,.024,.002),inset,bevel=.001)
empty('ScreenAnchor',(0,cy,.455),root);empty('CounterAttachment',(0,0,0),root)
root['provenance']='Original generic period CRT, procedural authoring; no third-party assets';root['units']='feet';root['screen_contract']='0.8 x 0.6 curved runtime test card, +Z front'
bpy.context.scene.unit_settings.system='IMPERIAL';bpy.context.scene.unit_settings.scale_length=.3048
bpy.context.view_layer.update()
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=4;area.spaces.active.region_3d.view_location=Vector((0,0,1.5))
for obj in parts:
 for uv in obj.data.uv_layers.active.data: uv.uv *= 6
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/counter-tv.blend'))
# Batch by pivot and material; source preserves each fastener/slat.
count=len(parts)
for parent in [mount,head]:
 for mat in [shell,trim,steel,metal,inset]:
  group=[o for o in list(bpy.context.scene.objects) if o.type=='MESH' and o.parent==parent and o.data.materials[0]==mat]
  if not group:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in group:o.select_set(True)
  bpy.context.view_layer.objects.active=group[0]
  if len(group)>1:bpy.ops.object.join()
  group[0].name=parent.name+'_'+mat.name
path=ROOT/'public/models/counter-tv.glb';bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_yup=True,export_extras=True)
b=path.read_bytes();j=json.loads(b[20:20+struct.unpack_from('<I',b,12)[0]])
metrics={'bytes':len(b),'triangles':sum(j['accessors'][p['indices']]['count']//3 for m in j['meshes'] for p in m['primitives']),'primitives':sum(len(m['primitives']) for m in j['meshes']),'materials':[m['name'] for m in j['materials']],'images':len(j.get('images',[])),'manifoldSourceParts':count,'allPrimitivesHaveUV':all('TEXCOORD_0' in p['attributes'] for m in j['meshes'] for p in m['primitives'])}
(ROOT/'tools/models/counter-tv-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n');print(metrics)
