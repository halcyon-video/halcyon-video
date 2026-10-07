"""Original twin-monitor wire merchandiser, fitted to the archived scale study.
Nominal 2.4-ft frontage and 8-ft cabinet are approximate, not surveyed sizes.
Reuses the existing original CRT mesh and display-family Blender exporter.
"""
from pathlib import Path
import bpy, math, importlib.util, json
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('display_builder',ROOT/'tools/models/display-fixtures.py')
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
f.reset()
f.material('TowerSteel',(.18,.17,.15),.48)
f.material('TowerAccent',(.60,.34,.49),.62)
f.material('TowerBase',(.045,.05,.055),.62)
f.material('TowerFoot',(.75,.49,.10),.5)
f.material('PocketBack',(.07,.08,.085),.65)

def tube(name,points,r=.01,role='TowerSteel',closed=False):
 points=[Vector(p) for p in points];v=[];n=8
 for i,p in enumerate(points):
  tangent=(points[(i+1)%len(points)]-points[(i-1)%len(points)]) if closed else (points[min(i+1,len(points)-1)]-points[max(0,i-1)])
  tangent.normalize();up=Vector((0,1,0))
  if abs(tangent.dot(up))>.95:up=Vector((1,0,0))
  a=tangent.cross(up).normalized();b=tangent.cross(a).normalized()
  v += [tuple(p+r*(a*math.cos(k*math.tau/n)+b*math.sin(k*math.tau/n))) for k in range(n)]
 faces=[]
 for i in range(len(points) if closed else len(points)-1):
  j=(i+1)%len(points);faces += [(i*n+k,i*n+(k+1)%n,j*n+(k+1)%n,j*n+k) for k in range(n)]
 if not closed:faces += [tuple(reversed(range(n))),tuple(range((len(points)-1)*n,len(points)*n))]
 return f.mesh(name,v,faces,role)

# Continuous exposed folded channel posts. No enclosed wiring or internal frame.
for x in [-1.15,1.15]:
 f.extrude('Return-fold upright',[(.70,-.53),(6.18,-.53),(6.18,-.43),(.70,-.43)],.10,'TowerSteel',.008,x)
f.box('Low base plate',0,.025,0,2.65,.05,1.30,'TowerBase',.016)
f.box('Visible amber foot',1.03,.37,.28,.30,.69,.44,'TowerFoot',.035)
f.box('Left end-column foot',-1.12,.37,0,.18,.69,.95,'TowerSteel',.012)
f.box('Bottom folded skirt',0,.77,0,2.42,.16,1.12,'TowerSteel',.014)

# Six wire fan trays. Front and rear rims meet actual rounded divider wires.
# The first and last rows are deliberately unstocked by the runtime adapter.
rows=[.90+i*.89 for i in range(6)]
for row,y in enumerate(rows):
 tube(f'Tray {row+1} perimeter',[(-1.18,y,-.44),(1.18,y,-.44),(1.20,y,-.41),(1.20,y,.48),(1.17,y,.52),(-1.17,y,.52),(-1.20,y,.48),(-1.20,y,-.41)],.014,closed=True)
 for j in range(11):
  x=-1.10+j*.22;tube(f'Tray {row+1} bed wire {j}',[(x,y,-.43),(x,y,.50)],.0075)
 for j in range(6):
  x=-1.14+j*.456
  tube(f'Tray {row+1} formed divider {j}',[(x,y,.46),(x,y+.03,.50),(x,y+.53,-.27),(x,y+.55,-.36),(x,y,-.43)],.011)
 tube(f'Tray {row+1} front retaining rail',[(-1.18,y+.07,.52),(1.18,y+.07,.52)],.012)

# Flat advertising-pocket seats on the aisle-facing end; printed art is separate.
for i,y in enumerate([1.51,3.04,4.57,6.10]):
 f.box(f'Advertising pocket {i+1} backing',-1.265,y,0,.035,1.40,.97,'PocketBack',.006)
 for z in [-.505,.505]:f.box(f'Pocket {i+1} side fold',-1.29,y,z,.052,1.45,.035,'TowerSteel',.004)
 for yy in [y-.725,y+.725]:f.box(f'Pocket {i+1} end fold',-1.29,yy,0,.052,.035,1.025,'TowerSteel',.004)

# Monitor cradle and coved accent sheet sit above the product bays.
f.box('Monitor cradle deck',0,6.36,0,2.46,.13,1.10,'TowerSteel',.014)
for x in [-1.21,0,1.21]:f.box('Monitor surround upright',x,7.03,.08,.095,1.27,1.12,'TowerSteel',.010)
f.box('Monitor surround header',0,7.69,.08,2.52,.13,1.12,'TowerSteel',.012)
f.box('Visible monitor forehead',0,7.48,.655,2.38,.34,.05,'TowerSteel',.008)
profile=[]
for i in range(9):
 t=i/8;profile.append((7.48+t*.73,-.55-.14*math.sin(t*math.pi/2)))
profile += [(y,z-.025) for y,z in reversed(profile)]
f.extrude('Coved accent back',profile,2.66,'TowerAccent',.003)

# Use the authored small CRT fronts; the enclosing fixture hides rear casework.
# Selecting visible components from the editable source avoids exporting it twice.
source=ROOT/'tools/models/store-crts.blend'
with bpy.data.libraries.load(str(source),link=False) as (data_from,data_to):
 assert 'ceiling-television' in data_from.collections,data_from.collections
 data_to.collections=['ceiling-television']
collection=data_to.collections[0]
visible=('FrontMolding','TubeFace','Glass','ControlRecess','ControlKey','PowerSwitch','SpeakerSlot','CabinetJoint')
originals=[o for o in collection.objects if o.type=='MESH' and o.name.startswith(visible)]
assert originals,'No original CRT front components'
# Existing tv_ceiling source is 2.6 feet wide, floor anchored and faces store -Z.
for side,x in [('Left',-.605),('Right',.605)]:
 for source_ob in originals:
  ob=source_ob.copy();ob.data=source_ob.data.copy();ob.name=side+'CRT_'+source_ob.name
  bpy.context.collection.objects.link(ob)
  ob.hide_viewport=False;ob.hide_render=False;ob.hide_set(False)
  # Bake the source's editing transform, rotate the front toward customer +Z.
  for vertex in ob.data.vertices:
   co=source_ob.matrix_world@vertex.co;co*=1.10/2.6
   vertex.co=(-co.x+x,-co.y-.25,co.z+6.43)
  ob.matrix_world.identity();ob.data.update();f.PARTS.append(ob)

bpy.context.scene.unit_settings.system='IMPERIAL';bpy.context.scene.unit_settings.scale_length=.3048
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':area.spaces.active.region_3d.view_location=(0,0,4.1)
f.export('twin-crt-tower')
record=f.REPORT['twin-crt-tower'];record.update({'trayHeightsFt':rows,'stockRows':[1,2,3,4],'columns':5,'stockCapacity':20,'nominalFootprintFt':[2.80,1.50],'scaleConfidence':'approximate','hiddenConstruction':False})
(ROOT/'tools/models/twin-crt-tower-metrics.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record,indent=2))
