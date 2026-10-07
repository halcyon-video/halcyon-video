"""Original paperboard game cartons and television-season slipboxes.
Reuses the existing packaging authoring helpers, art roles and GLB exporter.
Only visible folds, wall returns and nested case ends are modeled.
"""
import bpy, math, json, importlib.util
from pathlib import Path
from mathutils import Euler
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('packaging_builder',ROOT/'tools/models/packaging.py')
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)

def box(name,x,y,z,w,h,d,role):
 v=[(x+sx*w/2,y+sy*h/2,z+sz*d/2) for sx,sy,sz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
 ob=f.mesh(name,v,[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],role)
 if role==2:
  for poly in ob.data.polygons:
   for li in poly.loop_indices:
    x,nz,y=ob.data.vertices[ob.data.loops[li].vertex_index].co
    ob.data.uv_layers.active.data[li].uv=(x/f.W+.5,.5+nz/f.D)
 return ob

def carton(detail):
 f.sleeve(detail)
 for ob in list(f.parts):
  if ob.name.startswith('Recessed-tape'):
   f.parts.remove(ob);bpy.data.objects.remove(ob,do_unlink=True)
 t=.0015
 for side in [-1,1]:
  box('Closed end flap',t/2,side*(f.H/2-t/2),0,f.W-3*t,t,f.D-2*t,2 if side>0 else 3)

def slipbox(detail):
 W,H,D=f.W,f.H,f.D;t=.0015
 # One continuous shell: closed printed spine and an open right-hand mouth.
 rings=[(-W/2,H/2,D/2),(W/2,H/2,D/2),(W/2,H/2-t,D/2-t),(-W/2+t,H/2-t,D/2-t)]
 v=[(x,sy*h,sz*d) for x,h,d in rings for sy,sz in [(-1,-1),(1,-1),(1,1),(-1,1)]]
 faces=[];roles=[]
 for ring in range(3):
  for i in range(4):
   j=(i+1)%4;faces.append((ring*4+i,ring*4+j,(ring+1)*4+j,(ring+1)*4+i))
   roles.append([5,2,4,3][i] if ring==0 else 3)
 faces.extend([(3,2,1,0),(12,13,14,15)]);roles.extend([1,3])
 ob=f.mesh('Folded slipbox with open right edge',v,faces,3)
 for mat in f.mats:ob.data.materials.append(mat)
 for poly,role in zip(ob.data.polygons,roles):
  poly.material_index=role+1
  for li in poly.loop_indices:
   x,nz,y=ob.data.vertices[ob.data.loops[li].vertex_index].co;z=-nz
   uv=(x/W+.5,y/H+.5) if role==4 else (.5-x/W,y/H+.5) if role==5 else (z/D+.5,y/H+.5) if role==1 else (x/W+.5,.5-z/D) if role==2 else (x/W+.5,z/D+.5)
   ob.data.uv_layers.active.data[li].uv=uv
 # Only the exposed nested spines exist. No hidden discs or inner case shells.
 pitch=(D-2*t-.004)/4
 for i in range(4):
  box('Exposed nested case spine '+str(i),W/2-.004,0,-D/2+t+.002+(i+.5)*pitch,.006,H-.005,pitch-.001,0)

families={'game-carton':(5/12,7/12,1/12),'series-boxset':(.445,.667,.045*3.5)}
for family,dims in families.items():
 f.W,f.H,f.D=dims
 for detail in [False,True]:
  name='packaging-'+family+('-hero' if detail else '-stock')
  f.collection=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(f.collection);f.parts=[]
  (carton if family=='game-carton' else slipbox)(detail)
  f.export_current(name);f.collection.hide_viewport=True
for collection in bpy.data.collections:
 if collection.name.startswith('packaging-'):
  collection.hide_render=collection.hide_viewport=collection.name!='packaging-series-boxset-hero'
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   area.spaces.active.region_3d.view_location=(0,0,0);area.spaces.active.region_3d.view_distance=1.1
   area.spaces.active.region_3d.view_rotation=Euler((1.25,0,-.5)).to_quaternion();area.spaces.active.shading.color_type='MATERIAL'
bpy.context.scene.unit_settings.system='IMPERIAL';bpy.context.scene.unit_settings.scale_length=.3048
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/packaging-extras.blend'))
(ROOT/'tools/models/packaging-extras-metrics.json').write_text(json.dumps(f.records,indent=2)+'\n')
print(json.dumps(f.records,indent=2))
