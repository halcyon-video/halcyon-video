"""Original Halcyon CRT family, authored in feet. Not replicas of named products.
Blender (x, -store_z, store_y) exports directly to runtime Y-up, face -Z.
Run: blender -b -t 2 --python tools/models/store-crts.py
"""
from pathlib import Path
import math, random, json
import bpy, bmesh
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
# Packed UV roughness: slight molded ABS grain, not baked illumination.
rng=random.Random(175207211)
img=bpy.data.images.new('Molded ABS grain',width=128,height=128)
img.pixels=[c for _ in range(128*128) for c in ([.54+rng.random()*.14]*3+[1])]
img.pack()
def material(name,color,rough=.62,metal=0,texture=False):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 if texture:
  t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=img;m.node_tree.links.new(t.outputs['Color'],p.inputs['Roughness'])
 return m
shell=material('CabinetABS',(.19,.205,.225),texture=True)
bezel=material('BezelABS',(.055,.062,.07),texture=True)
dark=material('VentRecess',(.008,.009,.011),.86)
metal=material('ConnectorMetal',(.34,.36,.39),.32,.8)
tube=material('mat17',(.008,.012,.016),.25)
glass=material('mat16',(.014,.021,.026),.12)
parts=[];report={}
def mesh(name,vs,fs,mat,closed=True):
 me=bpy.data.meshes.new(name);me.from_pydata([(x,-z,y) for x,y,z in vs],[],fs);me.update()
 o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);o.data.materials.append(mat)
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
 if closed: assert all(e.is_manifold for e in bm.edges),name
 bm.to_mesh(me);bm.free()
 bpy.context.view_layer.objects.active=o;o.select_set(True)
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.015);bpy.ops.object.mode_set(mode='OBJECT');o.select_set(False)
 parts.append(o);return o

def rect(w,h,r,y,z,n=5):
 return [(cx+r*math.cos(a),y+cy+r*math.sin(a),z) for cx,cy,start in [(w/2-r,h/2-r,0),(-w/2+r,h/2-r,90),(-w/2+r,-h/2+r,180),(w/2-r,-h/2+r,270)] for i in range(n+1) for a in [math.radians(start+i*90/n)]]
def loft(name,rings,mat,cap=True):
 n=len(rings[0]);vs=sum(rings,[]);fs=[]
 for j in range(len(rings)-1):
  for i in range(n):fs.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
 if cap:fs.extend([tuple(reversed(range(n))),tuple(range((len(rings)-1)*n,len(rings)*n))])
 return mesh(name,vs,fs,mat)
def box(name,w,h,d,x,y,z,mat,r=.012):
 o=loft(name,[rect(w,h,min(r,w/4,h/4),y,z-d/2),rect(w,h,min(r,w/4,h/4),y,z+d/2)],mat)
 for v in o.data.vertices:v.co.x+=x
 return o

def family(key,w,h,d,screenw,screenh,cy,base):
 global parts
 parts=[]
 # Closed front fascia: outer molding returns through the recessed tube opening.
 front=-d/2
 rings=[rect(w-.045,h-base-.04,.085,base+(h-base)/2,front+.10),rect(w,h-base,.095,base+(h-base)/2,front+.035),rect(w-.024,h-base-.022,.09,base+(h-base)/2,front),rect(screenw+.075,screenh+.075,.08,cy,front+.025),rect(screenw,screenh,.075,cy,front+.092),rect(screenw,screenh,.075,cy,front+.13),rect(w-.045,h-base-.04,.085,base+(h-base)/2,front+.10)]
 loft('FrontMolding',rings,bezel,False)
 # Rear tub narrows around the tube neck. Closed back and inner wall keep genuine thickness.
 loft('RearCabinet',[
  rect(w-.045,h-base-.04,.085,base+(h-base)/2,front+.102),
  rect(w-.055,h-base-.05,.085,base+(h-base)/2,front+.30),
  rect(w*.69,(h-base)*.74,.09,base+(h-base)*.49,d/2),
  rect(w*.69-.035,(h-base)*.74-.035,.075,base+(h-base)*.49,d/2),
  rect(w-.09,h-base-.085,.07,base+(h-base)/2,front+.30),
  rect(w-.08,h-base-.075,.07,base+(h-base)/2,front+.102),
  rect(w-.045,h-base-.04,.085,base+(h-base)/2,front+.102)],shell,False)
 box('RearCover',w*.69-.01,(h-base)*.74-.01,.025,0,base+(h-base)*.49,d/2-.0125,shell,.08)
 # Fine dark assembly seam in the front/rear mold split, physically recessed.
 loft('CabinetJoint',[
  rect(w-.046,h-base-.041,.085,base+(h-base)/2,front+.097),
  rect(w-.046,h-base-.041,.085,base+(h-base)/2,front+.106),
  rect(w-.082,h-base-.077,.067,base+(h-base)/2,front+.106),
  rect(w-.082,h-base-.077,.067,base+(h-base)/2,front+.097),
  rect(w-.046,h-base-.041,.085,base+(h-base)/2,front+.097)],dark,False)
 # Tube surface has a mild dome. The independently named outer pane drives live UI fit.
 for name,mat,offset in [('TubeFace',tube,.128),('Glass',glass,.110)]:
  vs=[];fs=[];nx=24;ny=18
  for j in range(ny+1):
   yy=(j/ny-.5)*screenh
   for i in range(nx+1):
    xx=(i/nx-.5)*screenw;bow=.008*(1-(xx/(screenw/2))**2)*(1-(yy/(screenh/2))**2)
    vs.append((xx,cy+yy,front+offset-bow))
  for j in range(ny):
   for i in range(nx):a=j*(nx+1)+i;fs.append((a+nx+1,a+nx+2,a+1,a))
  o=mesh(name,vs,fs,mat,False)
  for p in o.data.polygons:p.use_smooth=True
 # Bottom control rail: tactile keys, separated power switch, speaker perforations.
 rail_y=base+.095
 box('ControlRecess',w*.69,.075,.009,0,rail_y,front-.002,dark)
 for i in range(5):box('ControlKey',.07,.026,.014,-w*.20+i*.10,rail_y,front-.012,shell,.008)
 box('PowerSwitch',.095,.047,.02,w*.31,rail_y,front-.012,shell)
 for side in [-1,1]:
  for j in range(5):box('SpeakerSlot',w*.12,.009,.004,side*w*.37,base+.23+j*.025,front-.003,dark,.003)
 # Lower side cooling banks follow tapered case side; raised louver lips over dark recesses.
 for side in [-1,1]:
  for i in range(11):
   z=front+.36+i*d*.034;x=side*(w/2-.025-(z-front-.30)/(d-.30)*w*.16)
   o=box('CoolingSlot',.006,h*.24,.025,x,base+(h-base)*.61,z,dark,.002)
 # Recessed rear service panel and metal coax/RCA rings.
 box('RearServicePanel',w*.43,h*.23,.012,0,base+(h-base)*.32,d/2+.001,dark)
 for x in [-.18,0,.18]:
  n=12; outer=.028;inner=.012;zc=d/2+.012;yc=base+(h-base)*.33
  rings=[]
  for rad,z in [(outer,zc),(outer,zc+.025),(inner,zc+.025),(inner,zc),(outer,zc)]:
   rings.append([(x+rad*math.cos(i*math.tau/n),yc+rad*math.sin(i*math.tau/n),z) for i in range(n)])
  loft('RearConnector',rings,metal,False)
 for x in [-w*.25,w*.25]:box('RearFastener',.028,.028,.006,x,base+(h-base)*.68,d/2+.003,metal)
 if base>.12:
  box('SwivelNeck',w*.27,base*.7,d*.3,0,base*.64,0,shell,.04)
  box('SwivelFoot',w*.64,base*.25,d*.67,0,base*.125,.015,shell,.045)
 else:
  for x in [-w*.33,w*.33]:box('RubberFoot',w*.12,base,d*.62,x,base/2,.02,dark,.012)
 # Preserve distinct editable objects; export merged by material (six draw calls).
 col=bpy.data.collections.new(key);bpy.context.scene.collection.children.link(col)
 for o in parts:
  for c in list(o.users_collection):c.objects.unlink(o)
  col.objects.link(o)
 authored=list(col.objects)
 exports=bpy.data.collections.new(key+' export');bpy.context.scene.collection.children.link(exports)
 for o in authored:
  c=o.copy();c.data=o.data.copy();exports.objects.link(c)
 for mat in [shell,bezel,dark,metal,tube,glass]:
  group=[o for o in exports.objects if o.data.materials[0]==mat]
  if not group:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in group:o.select_set(True)
  bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join();group[0].name=mat.name
 bpy.ops.object.select_all(action='DESELECT')
 for o in exports.objects:o.select_set(True)
 file=ROOT/'public/models'/f'{key}.glb'
 bpy.ops.export_scene.gltf(filepath=str(file),export_format='GLB',use_selection=True,export_yup=True,export_apply=True)
 report[key]={'feet':[w,h,d],'screen':[screenw,screenh,cy],'bytes':file.stat().st_size,'parts':len(exports.objects),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in exports.objects)}
 for o in list(exports.objects):bpy.data.objects.remove(o,do_unlink=True)
 bpy.data.collections.remove(exports)
 for o in col.objects:o.location.x += {'rental-terminal':-3.3,'ceiling-television':0,'screening-television':3.3}[key]
family('rental-terminal',1.48,1.55,1.34,1.075,.806,.90,.21)
family('ceiling-television',2.6,2.12,2.08,2.12,1.59,1.19,.07)
family('screening-television',2.2,1.86,1.85,1.78,1.335,1.04,.08)
bpy.context.scene.unit_settings.system='IMPERIAL';bpy.context.scene.unit_settings.scale_length=.3048
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/store-crts.blend'))
print(json.dumps(report,indent=2))
