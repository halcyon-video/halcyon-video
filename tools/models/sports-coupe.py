"""Original 1989-era fastback; visual study: Nissan Heritage 180SX Type II.
Not a replica. No downloaded meshes/images. See docs/sports-coupe-model.md.
blender -b -t 2 --python tools/models/sports-coupe.py
Authoring coordinates below: (right, longitudinal/rear, up), metres.
Saved/exported coordinates are feet, Blender (left, rear, up), glTF Y-up; nose along +Z at runtime.
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[2]
FT = 1 / .3048
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.context.scene.unit_settings.system = 'IMPERIAL'
bpy.context.scene.unit_settings.scale_length = .3048
MATS = {}
for name, color, rough, metal in [
 ('CoupePaint',(.22,.25,.29,1),.3,.32),
 ('CoupeTrim',(.015,.02,.025,1),.62,0),
 ('CoupeGlass',(.06,.11,.15,.64),.16,0),
 ('CoupeRubber',(.021,.022,.024,1),.86,0),
 ('CoupeAlloy',(.36,.39,.42,1),.32,.75),
 ('CoupeLamp',(.78,.82,.74,1),.23,0),
 ('CoupeAmber',(.8,.21,.017,1),.28,0),
 ('CoupeTail',(.40,.015,.02,1),.26,0),
 ('CoupeInterior',(.035,.047,.057,1),.95,0),
]:
 m=bpy.data.materials.new(name); m.diffuse_color=color; m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=color;p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 if name=='CoupeGlass': p.inputs['Alpha'].default_value=color[3];m.surface_render_method='DITHERED';m.use_backface_culling=True
 else:m.use_backface_culling=True
 MATS[name]=m

def mesh(name, verts, faces, mat, closed=True):
 me=bpy.data.meshes.new(name);me.from_pydata([(-x*FT,l*FT,h*FT) for x,l,h in verts],[],faces if closed else [tuple(reversed(f)) for f in faces]);me.update()
 ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob);me.materials.append(MATS[mat])
 bm=bmesh.new();bm.from_mesh(me)
 if closed:bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
 if closed: assert all(e.is_manifold for e in bm.edges),name
 assert all(f.calc_area()>1e-12 for f in bm.faces),name
 bm.to_mesh(me);bm.free()
 bpy.context.view_layer.objects.active=ob;ob.select_set(True)
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.05,island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT');ob.select_set(False)
 ob['construction']= 'Closed manifold solid' if closed else 'Intentional single glass sheet'
 ob['provenance']='Original Halcyon mesh; reference study only, no imported geometry'
 return ob

def loft(name, sections, mat):
 n=len(sections[0]);vs=[p for sec in sections for p in sec]
 fs=[tuple(reversed(range(n))),tuple((len(sections)-1)*n+i for i in range(n))]
 fs += [(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(len(sections)-1) for i in range(n)]
 return mesh(name,vs,fs,mat)

def plate(name, poly, mat, depth=.012):
 # Thin physical panel extruded along its normal.
 normal=(Vector(poly[1])-Vector(poly[0])).cross(Vector(poly[2])-Vector(poly[0])).normalized()
 return loft(name,[poly,[tuple(Vector(p)-normal*depth) for p in poly]],mat)

def box(name, center, size, mat, bevel=.012):
 x,l,h=center;w,d,t=[s/2 for s in size]
 ob=loft(name,[[(x-w,l-d,h-t),(x+w,l-d,h-t),(x+w,l+d,h-t),(x-w,l+d,h-t)],[(x-w,l-d,h+t),(x+w,l-d,h+t),(x+w,l+d,h+t),(x-w,l+d,h+t)]],mat)
 if bevel:
  mod=ob.modifiers.new('Manufactured edge radii','BEVEL');mod.width=bevel*FT;mod.segments=1
  ob.modifiers.new('Weighted panel normals','WEIGHTED_NORMAL')
 return ob

def tube(name, points, radius, mat, n=8):
 sections=[]
 for i,p in enumerate(points):
  t=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
  t.normalize();u=t.cross(Vector((0,0,1)))
  if u.length<.01:u=t.cross(Vector((0,1,0)))
  u.normalize();v=t.cross(u)
  sections.append([tuple(Vector(p)+radius*(u*math.cos(a*2*math.pi/n)+v*math.sin(a*2*math.pi/n))) for a in range(n)])
 if (Vector(points[0])-Vector(points[-1])).length < 1e-6:
  sections=sections[:-1];k=len(sections)
  return mesh(name,[p for sec in sections for p in sec],[(j*n+i,j*n+(i+1)%n,((j+1)%k)*n+(i+1)%n,((j+1)%k)*n+i) for j in range(k) for i in range(n)],mat)
 return loft(name,sections,mat)

# One continuous welded lower body: sampled wheel cut-outs pass into genuine
# underside returns. No solid boxes fill the arches behind the tires.
wheel_l=[-1.2375,1.2375]; R=.353
stations=[-2.27,-2.20,-2.04,-1.85,-.83,-.75,-.35,.4,.78,1.8,2.13,2.27]
for c in wheel_l:
 stations += [c-R-.001,c+R+.001]+[c-R*math.cos(i*math.pi/16) for i in range(17)]
stations=sorted(set(stations))
def width(l):return .845-.12*max(0,(abs(l)-1.8)/.47)
def top(l):return .82-.14*max(0,(-l-1)/1.27)-.025*max(0,(l-1.7)/.57)
def floor(l):
 for c in wheel_l:
  if abs(l-c)<=R+1e-6:return .305+math.sqrt(max(0,R*R-(l-c)**2))
 return .26 if abs(l)>2.25 else .18
sections=[]
for l in stations:
 w=width(l);b=floor(l);t=top(l)
 sections.append([(-w+.045,l,b),(-w,l,b+.012),(-w,l,t-.085),(-w+.065,l,t),(-w*.72,l,t+.027),(w*.72,l,t+.027),(w-.065,l,t),(w,l,t-.085),(w,l,b+.012),(w-.045,l,b)])
body=loft('Welded body shell with four wheel-well returns',sections,'CoupePaint')
# Real inset fender lips follow each opening. Closed section, no filled disk.
for c in wheel_l:
 for s in [-1,1]:
  points=[(s*(width(c-R*math.cos(i*math.pi/20))+.002),c-R*math.cos(i*math.pi/20),.305+R*math.sin(i*math.pi/20)) for i in range(21)]
  tube(('Left' if s<0 else 'Right')+f' rolled wheel arch {c}',points,.009,'CoupePaint',6)

# Greenhouse panels: each reveal is an annular solid, with a recessed glass
# pane. There is no opaque cabin block behind the glazing.
def window(name,poly,inset=.065):
 center=sum((Vector(p) for p in poly),Vector())/len(poly)
 inner=[tuple(Vector(p).lerp(center,inset)) for p in poly]
 normal=(Vector(poly[1])-Vector(poly[0])).cross(Vector(poly[2])-Vector(poly[0])).normalized()
 back=[tuple(Vector(p)-normal*.012) for p in inner]
 n=len(poly);verts=poly+inner+back+[tuple(Vector(p)-normal*.016) for p in poly]
 faces=[]
 for a,b in [(0,n),(n,2*n),(2*n,3*n),(3*n,0)]:
  faces += [(a+i,a+(i+1)%n,b+(i+1)%n,b+i) for i in range(n)]
 mesh(name+' window reveal and seal',verts,faces,'CoupeTrim')
 glass=mesh(name+' recessed glass',back,[tuple(range(n))],'CoupeGlass',False)
 # Pane normals must face away from interior, rather than rely on double side.
 return glass
window('Windshield',[(-.755,-.88,.837),(.755,-.88,.837),(.61,-.18,1.255),(-.61,-.18,1.255)])
window('Rear hatch',[(.61,.68,1.255),(.755,1.65,.844),(-.755,1.65,.844),(-.61,.68,1.255)])
plate('Crowned roof panel',[(-.61,-.18,1.255),(.61,-.18,1.255),(.64,.10,1.29),(.61,.68,1.255),(-.61,.68,1.255),(-.64,.10,1.29)],'CoupePaint',.023)
for s,side in [(-1,'Left'),(1,'Right')]:
 def outward(poly):return poly if s<0 else list(reversed(poly))
 window(side+' door',outward([(s*.77,-.80,.847),(s*.625,-.15,1.244),(s*.625,.51,1.244),(s*.79,.65,.847)]),.09)
 window(side+' quarter',outward([(s*.79,.735,.847),(s*.63,.60,1.242),(s*.75,1.52,.849)]),.14)
 plate(side+' B pillar',outward([(s*.79,.65,.847),(s*.625,.51,1.244),(s*.63,.60,1.242),(s*.79,.735,.847)]),'CoupePaint',.022)
 plate(side+' A pillar',outward([(s*.755,-.88,.837),(s*.61,-.18,1.255),(s*.625,-.15,1.244),(s*.77,-.80,.847)]),'CoupePaint',.018)
 plate(side+' rear sail pillar',outward([(s*.75,1.52,.849),(s*.63,.60,1.242),(s*.61,.68,1.255),(s*.755,1.65,.844)]),'CoupePaint',.018)
 plate(side+' roof rail',outward([(s*.625,-.15,1.244),(s*.61,-.18,1.255),(s*.61,.68,1.255),(s*.63,.60,1.242)]),'CoupePaint',.015)
 # Door cutline on the flat flank; it terminates at the belt, with sill below.
 tube(side+' recessed door shutline',[(s*.846,-.79,.73),(s*.846,-.77,.28),(s*.846,.64,.28),(s*.846,.73,.73)],.0035,'CoupeTrim',6)
 box(side+' sill molding',(s*.836,0,.23),(.027,1.52,.064),'CoupeTrim',.008)
 box(side+' recessed handle bezel',(s*.85,.51,.718),(.015,.145,.052),'CoupeTrim',.008)
 box(side+' pull handle',(s*.862,.515,.724),(.013,.108,.021),'CoupePaint',.005)
 box(side+' mirror foot',(s*.795,-.69,.884),(.055,.11,.055),'CoupeTrim')
 box(side+' mirror housing',(s*.874,-.67,.925),(.16,.195,.087),'CoupePaint',.025)
 box(side+' mirror silver',(s*.876,-.578,.925),(.125,.005,.054),'CoupeAlloy',.006)
 # Hood pop-up doors closed, and separate lower indicator lenses.
 x=s*.53
 plate(side+' closed pop-up lamp lid',[(x-.18,-1.97,.748),(x+.18,-1.97,.748),(x+.17,-1.57,.789),(x-.17,-1.57,.789)],'CoupeTrim',.006)
 plate(side+' lamp lid painted skin',[(x-.171,-1.96,.752),(x+.171,-1.96,.752),(x+.161,-1.58,.793),(x-.161,-1.58,.793)],'CoupePaint',.005)
 box(side+' front running lamp',(x,-2.284,.52),(.24,.018,.083),'CoupeLamp',.008)
 box(side+' front turn lens',(s*.705,-2.284,.52),(.075,.015,.083),'CoupeAmber',.006)
 box(side+' rear tail lens',(s*.49,2.267,.675),(.46,.014,.125),'CoupeTail',.012)
 box(side+' rear reverse lens',(s*.245,2.27,.675),(.08,.015,.085),'CoupeLamp',.005)
# Recesses and bumpers are fitted to fascia, no modern aero wings/diffusers.
box('Front bumper rub strip',(0,-2.284,.415),(1.43,.03,.044),'CoupeTrim',.01)
box('Front lower intake',(0,-2.284,.34),(.85,.025,.11),'CoupeTrim',.015)
box('Rear bumper rub strip',(0,2.258,.43),(1.43,.032,.048),'CoupeTrim',.01)
box('Rear license recess',(0,2.273,.607),(.29,.018,.145),'CoupeTrim',.008)
box('Unmarked rear plate',(0,2.285,.607),(.235,.005,.107),'CoupeLamp',.003)
tube('Single tail pipe',[(-.55,2.08,.24),(-.55,2.28,.24)],.034,'CoupeAlloy',12)
# Hood seam follows the narrow inset edge of the upper panel.
for s in [-1,1]:tube('Hood panel seam',[(s*.38,-1.56,.784),(s*.55,-.90,.85)],.0028,'CoupeTrim',6)
# Lightweight cabin silhouette visible through glass.
box('Cabin floor',(0,.25,.71),(1.33,1.96,.05),'CoupeInterior')
box('Dashboard',(0,-.69,.873),(1.3,.26,.14),'CoupeInterior',.035)
box('Centre console',(0,.02,.815),(.2,.74,.13),'CoupeTrim',.018)
for x in [-.35,.35]:
 box('Front bucket cushion',(x,.10,.815),(.43,.47,.13),'CoupeInterior',.045)
 ob=box('Front bucket backrest',(x,.36,.99),(.44,.12,.36),'CoupeInterior',.05)
 box('Front head restraint',(x,.40,1.18),(.25,.095,.115),'CoupeInterior',.032)
box('Rear bench silhouette',(0,.95,.825),(1.15,.34,.13),'CoupeInterior',.035)
# Closed steering rim, hub and column; no animated targets.
points=[(-.35+.14*math.cos(i*2*math.pi/24),-.45,.96+.14*math.sin(i*2*math.pi/24)) for i in range(25)]
tube('Steering wheel rim',points,.012,'CoupeTrim',6)
tube('Steering wheel spoke',[(-.49,-.45,.96),(-.21,-.45,.96)],.012,'CoupeTrim',6)
tube('Steering column',[(-.35,-.45,.96),(-.35,-.68,.89)],.023,'CoupeTrim',8)
# Lathed tire/rim profiles with sidewall shoulder, tread grooves, bead and
# recessed alloy center. Tire lowest point exactly zero at 24 angular samples.
def wheel(name,c,s,profile,mat,n=24):
 sections=[[(s*x,c+r*math.sin(i*2*math.pi/n),.305+r*math.cos(i*2*math.pi/n)) for i in range(n)] for x,r in profile]
 # Revolve a closed profile, rather than capping the tire bore.
 vs=[p for sec in sections for p in sec];k=len(sections)
 fs=[(j*n+i,j*n+(i+1)%n,((j+1)%k)*n+(i+1)%n,((j+1)%k)*n+i) for j in range(k) for i in range(n)]
 ob=mesh(name,vs,fs,mat)
 for p in ob.data.polygons:p.use_smooth=True
 return ob
for c,axle in zip(wheel_l,['Front','Rear']):
 for s,side in [(-1,'left'),(1,'right')]:
  name=axle+' '+side
  wheel(name+' tire',c,s,[(.64,.20),(.64,.267),(.665,.30),(.69,.305),(.717,.305),(.723,.299),(.729,.305),(.758,.305),(.764,.299),(.770,.305),(.798,.305),(.827,.285),(.835,.232),(.83,.20)],'CoupeRubber')
  wheel(name+' alloy rim',c,s,[(.66,.195),(.83,.195),(.846,.209),(.852,.219),(.83,.227),(.807,.212),(.801,.055),(.789,.055)],'CoupeAlloy')
  wheel(name+' dark recessed wheel face',c,s,[(.798,.056),(.798,.195),(.792,.195),(.792,.056)],'CoupeTrim')
  # Eight restrained radial slots formed by alternating metal spokes/open gaps.
  for i in range(8):
   a=i*math.pi/4
   poly=[(s*.808,c+r*math.sin(a+t),.305+r*math.cos(a+t)) for r,t in [(.055,-.14),(.20,-.07),(.20,.07),(.055,.14)]]
   plate(name+' alloy spoke '+str(i),poly,'CoupeAlloy',.008)
  wheel(name+' hub cap',c,s,[(.801,.008),(.801,.055),(.819,.055),(.823,.008)],'CoupeAlloy',16)

# Editable named objects retain modifiers and individual UV layouts.
scene=bpy.context.scene
scene['asset']='Original generic late-1980s sports coupe; static parked prop'
scene['axes']='Feet; Blender -Y nose/+Z up; glTF +Z nose/+Y up. Ground origin centered.'
scene['reference']='Nissan Heritage Collection No.323; proportions studied, not a replica'
for ob in scene.objects:
 if ob.type=='MESH':ob['material_role']=ob.data.materials[0].name
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':
  area.spaces.active.region_3d.view_distance=20
  area.spaces.active.region_3d.view_location=(0,0,2)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/sports-coupe.blend'))
# Optimize only AFTER saving source: apply modifiers and batch by material role.
bpy.ops.object.select_all(action='SELECT');bpy.context.view_layer.objects.active=body;bpy.ops.object.convert(target='MESH')
for role in MATS:
 bpy.ops.object.select_all(action='DESELECT')
 obs=[o for o in scene.objects if o.type=='MESH' and o.data.materials[0].name==role]
 for ob in obs:ob.select_set(True)
 bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();bpy.context.object.name=role+' assembly'
 bpy.context.object.modifiers.new('Runtime triangulation','TRIANGULATE')
out=ROOT/'public/models/car_sports.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_yup=True,export_apply=True,export_extras=True)
print('SPORTS_COUPЕ_EXPORT',out.stat().st_size)
