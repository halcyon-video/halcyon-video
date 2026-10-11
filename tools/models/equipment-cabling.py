"""Original equipment cabling kit: ceiling TV power feed, scripted Blender mesh authoring (#260).
Feet, store axes (x right, y up, z toward entrance) mapped to Blender (x, -z, y). No reference pixels or
third-party mesh. Origin of TvCeilingFeed = ceiling-plate centre at the tile datum (y = 0); things hang at y < 0.
Run: blender -b -t 2 -P /abs/path/tools/models/equipment-cabling.py
Reusable builders: box, lathe (nuts, boots, glands), tube + smooth (cord, conduit), elbow, strap/hanger (clips),
gridplate (slotted faces).
"""
import bpy, bmesh, math, json
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene;scene.unit_settings.system='IMPERIAL';scene.unit_settings.scale_length=.3048

def material(name,color,rough,metal=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1)
 p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 return m
GALV=material('ConduitGalvanized',(.62,.64,.66),.36,.9)
COVER=material('BoxCoverIvory',(.86,.84,.76),.5)
JACKET=material('CordJacket',(.02,.02,.022),.72)
PLUG=material('PlugBody',(.03,.03,.034),.45)
BRASS=material('BrassContact',(.72,.55,.25),.3,.9)

def empty(name,parent=None,loc=None):
 o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);o.parent=parent
 if loc:o.location=(loc[0],-loc[2],loc[1]);o.empty_display_size=.03
 return o
def S(p):return (p[0],-p[2],p[1])   # store -> blender
def finish(name,vs,fs,mat,parent,bevel=0,smooth=False):
 me=bpy.data.meshes.new(name);me.from_pydata([S(v) for v in vs],[],fs);me.update()
 o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);o.parent=parent;me.materials.append(mat)
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
 if bevel:bmesh.ops.bevel(bm,geom=list(bm.edges),offset=bevel,segments=2,affect='EDGES')
 if smooth:
  for f in bm.faces:f.smooth=len(f.verts)==4   # round bodies shade smooth, flat caps stay flat
 bm.to_mesh(me);bm.free();return o

def box(c,size,mat,parent,name='Block',bevel=0):
 x,y,z=c;a,b,d=[s/2 for s in size]
 vs=[(x+sx*a,y+sy*b,z+sz*d) for sx in(-1,1) for sy in(-1,1) for sz in(-1,1)]
 fs=[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)]
 return finish(name,vs,fs,mat,parent,bevel)

def basis(d):
 d=Vector(d).normalized();u=d.cross(Vector((0,1,0)))
 if u.length<.01:u=d.cross(Vector((1,0,0)))
 u.normalize();return d,u,d.cross(u).normalized()
def lathe(o,d,profile,mat,parent,name='Turned',sides=16):
 # profile: (distance along axis, radius); flat caps close both ends.
 o=Vector(o);d,u,v=basis(d);vs=[];fs=[]
 for t,r in profile:
  for k in range(sides):a=k*math.tau/sides;vs.append(tuple(o+d*t+r*(math.cos(a)*u+math.sin(a)*v)))
 for i in range(len(profile)-1):
  for k in range(sides):fs.append((i*sides+k,i*sides+(k+1)%sides,(i+1)*sides+(k+1)%sides,(i+1)*sides+k))
 fs.append(tuple(reversed(range(sides))));fs.append(tuple((len(profile)-1)*sides+k for k in range(sides)))
 return finish(name,vs,fs,mat,parent,smooth=sides>6)

def tube(points,radius,mat,parent,name='Tube',sides=10):
 pts=[Vector(p) for p in points];vs=[];fs=[];last=None
 for i,p in enumerate(pts):
  t=(pts[min(i+1,len(pts)-1)]-pts[max(i-1,0)]).normalized();u=t.cross(Vector((0,1,0)))
  if u.length<.01:u=t.cross(Vector((0,0,1)))
  u.normalize()
  if last is not None and u.dot(last)<0:u=-u
  last=u.copy();v=t.cross(u).normalized()
  for k in range(sides):a=k*math.tau/sides;vs.append(tuple(p+radius*(math.cos(a)*u+math.sin(a)*v)))
 for i in range(len(pts)-1):
  for k in range(sides):fs.append((i*sides+k,i*sides+(k+1)%sides,(i+1)*sides+(k+1)%sides,(i+1)*sides+k))
 fs.append(tuple(reversed(range(sides))));fs.append(tuple((len(pts)-1)*sides+k for k in range(sides)))
 return finish(name,vs,fs,mat,parent,smooth=True)

def smooth(points,per=6):
 p=[Vector(q) for q in points];out=[]
 for i in range(len(p)-1):
  p0,p1,p2,p3=p[max(i-1,0)],p[i],p[i+1],p[min(i+2,len(p)-1)]
  for k in range(per):
   t=k/per;out.append(tuple(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t**3)))
 out.append(tuple(p[-1]));return out

def elbow(start,direction,up,bend,pipe_r,mat,parent,name='Elbow',steps=18):
 # 90 degree conduit bend: leaves `start` along `direction`, ends travelling along `up`.
 s=Vector(start);d=Vector(direction).normalized();u=Vector(up).normalized()
 pts=[s+bend*(d*math.sin(a)+u*(1-math.cos(a))) for a in [i*math.pi/2/steps for i in range(steps+1)]]
 return tube(pts,pipe_r,mat,parent,name,12)

def strap(path,width,thick,mapper,mat,parent,name='Strap'):
 # Flat sheet band swept along a 2D path; mapper(a,y,e) places path point (a,y) with extrusion offset e.
 n=len(path);vs=[];fs=[]
 for i,(x,y) in enumerate(path):
  p=Vector(path[max(i-1,0)]);q=Vector(path[min(i+1,n-1)]);t=(q-p).normalized();nx,ny=-t.y,t.x
  for off in(-thick/2,thick/2):
   for e in(-width/2,width/2):vs.append(mapper(x+nx*off,y+ny*off,e))
 for i in range(n-1):
  b0,b1=i*4,(i+1)*4
  fs+=[(b0,b0+1,b1+1,b1),(b0+3,b0+2,b1+2,b1+3),(b0+1,b0+3,b1+3,b1+1),(b0,b1,b1+2,b0+2)]
 fs+=[(0,2,3,1),(4*(n-1),4*(n-1)+1,4*(n-1)+3,4*(n-1)+2)]
 return finish(name,vs,fs,mat,parent)
def hanger(pipe_r,pipe_y,mapper,mat,parent,name):
 # Stand-off one-hole strap: feet on the ceiling plane, vertical legs, half-round cradle under the run.
 R=pipe_r+.0017;top=-.0015
 path=[(-.032,top),(-.017,top)]+[(-R,top+(pipe_y-top)*k/3) for k in range(4)]
 path+=[(R*math.cos(math.pi+k*math.pi/10),pipe_y+R*math.sin(math.pi+k*math.pi/10)) for k in range(1,10)]
 path+=[(R,pipe_y+(top-pipe_y)*k/3) for k in range(4)]+[(.017,top),(.032,top)]
 return strap(path,.0125,.0028,mapper,mat,parent,name)

def gridplate(xs,zs,hole,ytop,ybot,mat,parent,name='Plate'):
 # Thick plate on a coordinate grid; cells where hole(i,j) is true are cut straight through.
 idx={};vs=[]
 def v(i,j,top):
  key=(i,j,top)
  if key not in idx:idx[key]=len(vs);vs.append((xs[i],ytop if top else ybot,zs[j]))
  return idx[key]
 fs=[];cells={(i,j) for i in range(len(xs)-1) for j in range(len(zs)-1) if not hole(i,j)}
 for i,j in cells:
  fs.append((v(i,j,1),v(i,j+1,1),v(i+1,j+1,1),v(i+1,j,1)))
  fs.append((v(i,j,0),v(i+1,j,0),v(i+1,j+1,0),v(i,j+1,0)))
  for (di,dj),quad in {(-1,0):((i,j),(i,j+1)),(1,0):((i+1,j+1),(i+1,j)),(0,-1):((i+1,j),(i,j)),(0,1):((i,j+1),(i+1,j+1))}.items():
   if (i+di,j+dj) not in cells:
    (a,b),(c,d)=quad;fs.append((v(a,b,0),v(c,d,0),v(c,d,1),v(a,b,1)))
 return finish(name,vs,fs,mat,parent)

root=empty('TvCeilingFeed')
root['units']='feet';root['origin']='ceiling-plate centre at tile datum; y down, -z toward the service box';root['estimatedConstruction']=True
root['design']='Original generic 120 V ceiling feed for the suspended TV; not a surveyed historic installation'

# ---------------------------------------------------------------- junction box with duplex receptacle
BOX_Z=-.80;BH=.1667
box_g=empty('JunctionBoxDuplex',root)
box((0,-.0575,BOX_Z),(.3334,.115,.3334),GALV,box_g,'Pressed 4 in square box',.004)
box((0,-.1208,BOX_Z),(.315,.0116,.315),COVER,box_g,'Square cover plate',.002)
for sx in(-1,1):
 for sz in(-1,1):
  lathe((sx*.135,-.1266,BOX_Z+sz*.135),(0,-1,0),[(0,.0085),(.0035,.0085)],GALV,box_g,'Cover screw head',8)
OUT_Z=[BOX_Z-.058,BOX_Z+.058]
xs=[-.045,-.0208,-.0156,-.0061,.0061,.0156,.0208,.045]
zs=[BOX_Z+z for z in(-.12,-.0788,-.0372,-.032,-.020,.0372,.0788,.084,.096,.12)]
def hole(i,j):
 # two blade slots (x cells 1 and 5) and a ground hole (x cell 3) per outlet
 return (i in(1,5) and j in(1,5)) or (i==3 and j in(3,7))
gridplate(xs,zs,hole,-.1266,-.1350,COVER,box_g,'Duplex receptacle face with blade slots')
for oz in OUT_Z:
 for sx in(-1,1):box((sx*.0182,-.1300,oz),(.0052,.003,.0415),BRASS,box_g,'Receptacle contact')

# ---------------------------------------------------------------- right-angle plug seated in the plate-side outlet
plug_g=empty('PowerPlugRightAngle',root)
PZ=OUT_Z[1]
for sx in(-1,1):box((sx*.0182,-.1366,PZ),(.0052,.0116,.0415),BRASS,plug_g,'NEMA 5-15 blade',.0006)
box((0,-.1566,PZ+.004),(.052,.0384,.0720),PLUG,plug_g,'Moulded plug body',.005)
lathe((0,-.1566,PZ+.040),(0,0,1),[(0,.0135),(.016,.0125),(.043,.0095)],PLUG,plug_g,'Plug strain-relief boot',12)
CORD_R=.0120;CY_C=-.075
cord_ctrl=[(0,-.1566,PZ+.075),(0,-.1566,-.64),(0,-.145,-.60),(0,-.115,-.56),(0,-.085,-.52),(0,CY_C,-.50),(0,CY_C,-.43),
           (0,-.068,-.40),(0,-.056,-.375),(0,-.047,-.355),(0,-.045,-.335),(0,-.045,-.29)]
# the tail ends inside the gland nut; the visible lead is the jacket outside it
tube(smooth(cord_ctrl),CORD_R,JACKET,empty('TvLeadCord',root),'Two-conductor lead',10)

# ---------------------------------------------------------------- cord grip (strain relief) at the plate edge
grip_g=empty('CordGripConnector',root)
GZ=-.29;GY=-.045
lathe((0,GY,GZ),(0,0,-1),[(0,.0289),(.020,.0289)],GALV,grip_g,'Hex locknut / gland nut',6)
lathe((0,GY,GZ-.020),(0,0,-1),[(0,.0205),(.022,.0205),(.022,.0185),(.050,.0150),(.060,.0125)],GALV,grip_g,'Domed cord grip gland',14)

# ---------------------------------------------------------------- stand-off clips pinning the lead to the ceiling
clip_g=empty('CordClips',root)
for z in(-.50,-.43):
 hanger(CORD_R,CY_C,lambda a,y,e,z=z:(a,y,z+e),GALV,clip_g,'Stand-off cord clip')
 lathe((.0245,-.0015,z),(0,-1,0),[(0,.0055),(.0025,.0055)],GALV,clip_g,'Clip screw head',8)

# ---------------------------------------------------------------- exposed-roof conduit rise (hidden unless the roof underside shows)
rise=empty('ExposedRise',root)
CY=-.0425;CR=.0294;BR=.30
lathe((BH,CY,BOX_Z),(1,0,0),[(0,.0345),(.034,.0345)],GALV,rise,'Set-screw box connector',12)
x0=BH+.034
tube([(x0,CY,BOX_Z),(x0+.30,CY,BOX_Z)],CR,GALV,rise,'EMT straight run',12)
lathe((x0+.28,CY,BOX_Z),(1,0,0),[(0,.0352),(.05,.0352)],GALV,rise,'Set-screw coupling',12)
elbow((x0+.30,CY,BOX_Z),(1,0,0),(0,1,0),BR,CR,GALV,rise,'EMT 90 degree bend (radius 0.30 ft)')
vx=x0+.30+BR;top=CY+BR
tube([(vx,top,BOX_Z),(vx,.35,BOX_Z)],CR,GALV,rise,'EMT vertical stub',12)
lathe((vx,.31,BOX_Z),(0,1,0),[(0,.0352),(.05,.0352)],GALV,rise,'Set-screw coupling',12)
lathe((vx,.342,BOX_Z),(0,1,0),[(0,.0560),(.008,.0560)],GALV,rise,'Roof flange / locknut',16)
hanger(CR,CY,lambda a,y,e:(x0+.12+e,y,BOX_Z+a),GALV,rise,'One-hole EMT strap')

# ---------------------------------------------------------------- anchors, merge by role, assert closed solids
empty('Anchor_PlateEdge',root,(0,GY,GZ));empty('Anchor_ServiceBox',root,(0,0,BOX_Z))
for g in [c for c in root.children if c.name in('JunctionBoxDuplex','PowerPlugRightAngle','TvLeadCord','CordGripConnector','CordClips','ExposedRise')]:
 for m in{o.data.materials[0] for o in g.children if o.type=='MESH'}:
  objs=[o for o in g.children if o.type=='MESH' and o.data.materials[0]==m]
  bpy.ops.object.select_all(action='DESELECT')
  for o in objs:o.select_set(True)
  bpy.context.view_layer.objects.active=objs[0]
  if len(objs)>1:bpy.ops.object.join()
  o=objs[0];o.name=g.name+'_'+m.name
  bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
  bm=bmesh.new();bm.from_mesh(o.data);assert all(e.is_manifold for e in bm.edges),o.name;bm.free()
bpy.context.view_layer.update()
out=ROOT/'public/models/equipment-cabling.glb';out.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/equipment-cabling.blend'))
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_yup=True,export_apply=True)
tris=0;meshes=[o for o in bpy.data.objects if o.type=='MESH']
for o in meshes:o.data.calc_loop_triangles();tris+=len(o.data.loop_triangles)
metrics={'bytes':out.stat().st_size,'triangles':tris,'meshes':len(meshes),'units':'feet','materials':sorted(m.name for m in bpy.data.materials),
 'plateEdgeAnchor':[0,GY,GZ],'serviceBoxAnchor':[0,0,BOX_Z],'conduitBendRadiusFeet':BR,'conduitOuterRadiusFeet':CR,'cordRadiusFeet':CORD_R}
(ROOT/'tools/models/equipment-cabling-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n');print(metrics)
