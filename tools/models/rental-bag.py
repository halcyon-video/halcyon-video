"""Original deformable film-bag rest mesh and its existing 340-node binding.
Blender (x,-store_z,height), feet. No solver tuning or printed artwork changes.
"""
import bpy, math, json, struct, sys
from pathlib import Path
from mathutils import Euler
ROOT=Path(__file__).resolve().parents[2]
COLS=13;ROWS=12;HW=.8;BODY=1.42;TAB=.34;TOTAL=BODY+TAB
N=340;nodes=[[0.,0.,0.] for _ in range(N)]
F=lambda r,i:r*COLS+i
B=lambda r,i:F(r,i) if i in [0,12] else 169+r*11+i-1
FT=lambda t,i:312+t*7+i-3
BT=lambda t,i:326+t*7+i-3
for r in range(13):
 y=.02+(BODY-.02)*r/12;yn=y/BODY
 d=.028+.08*math.sin(math.pi*min(yn,1)*.86)**1.2
 for i in range(13):
  x=-HW+i*2*HW/12
  width=max(0.,math.sin(math.pi*i/12))**.62
  # Paired side gussets and a small diagonal fold give the film a folded rest
  # shape. Edges, floor pins, mouth line and the complete lattice stay fixed.
  edge_weight=min(1.,max(0.,(abs(x)-.40)/.2666667))
  gusset=.035*math.exp(-((abs(x)-.64)/.12)**2)*math.sin(math.pi*yn)*edge_weight
  wrinkle=.009*math.sin(yn*math.pi*3+i*.55)*math.sin(math.pi*yn)*width*edge_weight
  z=0 if i in [0,12] else max(.005,d*width-gusset+wrinkle)
  nodes[F(r,i)]=[x,y,z]
  if i not in [0,12]:nodes[B(r,i)]=[x,y,-z]
for t in range(2):
 y=BODY+TAB*(t+1)/2
 for i in range(3,10):
  x=-HW+i*2*HW/12;distance=math.hypot(x,y-(BODY+TAB*.54))
  reinforcement=.006*math.exp(-((distance-.13)/.055)**2)
  nodes[FT(t,i)]=[x,y,.022+reinforcement];nodes[BT(t,i)]=[x,y,-.022-reinforcement]
faces=[];uvfaces=[]
def add(ids,back=False):
 faces.append(ids);uvfaces.append([(1-(nodes[n][0]/1.6+.5) if back else nodes[n][0]/1.6+.5,nodes[n][1]/TOTAL) for n in ids])
for r in range(12):
 for i in range(12):
  add([F(r,i),F(r,i+1),F(r+1,i+1),F(r+1,i)])
  add([B(r,i+1),B(r,i),B(r+1,i),B(r+1,i+1)],True)
for i in range(3,9):
 add([F(12,i),F(12,i+1),FT(0,i+1),FT(0,i)])
 add([FT(0,i),FT(0,i+1),FT(1,i+1),FT(1,i)])
 add([B(12,i+1),B(12,i),BT(0,i),BT(0,i+1)],True)
 add([BT(0,i+1),BT(0,i),BT(1,i),BT(1,i+1)],True)
# The existing constrained bottom weld becomes a visible sealed film seam.
# Runtime's first front/back vertex row is 0..12 / 13..25.
bottom=[]
for i in range(12):
 if i==0:
  add([F(0,0),B(0,1),F(0,1)]);bottom += [0,14,1]
 elif i==11:
  add([F(0,11),B(0,11),F(0,12)]);bottom += [11,24,12]
 else:
  add([F(0,i),B(0,i),B(0,i+1),F(0,i+1)]);bottom += [i,13+i,14+i,i,14+i,i+1]

bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
me=bpy.data.meshes.new('Welded film lattice');me.from_pydata([(x,-z,y) for x,y,z in nodes],[],faces);me.update()
ob=bpy.data.objects.new('Rental bag authored rest mesh',me);bpy.context.collection.objects.link(ob)
uv=me.uv_layers.new(name='LivePrintUV')
for poly,values in zip(me.polygons,uvfaces):
 for li,value in zip(poly.loop_indices,values):uv.data[li].uv=value
binding=me.attributes.new('solver_node','INT','POINT')
for i,item in enumerate(binding.data):item.value=i
for poly in me.polygons:poly.use_smooth=True
ob['solver_node_count']=N;ob['runtime_binding']='src/model-data/rental-bag-rest.json; same node IDs and constraints'
# Unbranded material for the editable/GLB preview. Runtime keeps its live print.
m=bpy.data.materials.new('Unprinted bag film');m.use_nodes=True;m.diffuse_color=(.95,.95,.92,1)
shader=m.node_tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=.35
image=bpy.data.images.new('Die-cut handle mask',width=128,height=256,alpha=True)
pixels=[]
for j in range(256):
 y=(j+.5)/256*TOTAL
 for i in range(128):
  x=((i+.5)/128-.5)*1.6;a=0. if math.hypot(x,y-(BODY+TAB*.54))<.13 else 1.
  pixels.extend((.96,.96,.94,a))
image.pixels=pixels;image.pack();tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image
m.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color']);m.node_tree.links.new(tex.outputs['Alpha'],shader.inputs['Alpha'])
if hasattr(m,'surface_render_method'):m.surface_render_method='DITHERED'
elif hasattr(m,'blend_method'):m.blend_method='CLIP'
m.use_backface_culling=False;me.materials.append(m)
bpy.context.view_layer.objects.active=ob;ob.select_set(True)
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
if '--from-blend' in args:
 source=Path(args[args.index('--from-blend')+1]).resolve()
 bpy.ops.wm.open_mainfile(filepath=str(source),use_scripts=False)
 ob=bpy.data.objects.get('Rental bag authored rest mesh')
 assert ob and ob.type=='MESH','Expected the authored rental-bag mesh'
 me=ob.data;binding=me.attributes.get('solver_node')
 assert binding and len(me.vertices)==N and sorted(a.value for a in binding.data)==list(range(N)),'Preserve the 340 solver IDs'
 bpy.ops.object.select_all(action='DESELECT');ob.hide_set(False);ob.select_set(True);bpy.context.view_layer.objects.active=ob
# Runtime data is extracted from the authored mesh, including deliberate edits
# loaded with --from-blend. The print/solver topology remains the fixed contract.
nodes=[None]*N
for vertex,identity in zip(me.vertices,me.attributes['solver_node'].data):
 co=ob.matrix_world@vertex.co;nodes[identity.value]=[co.x,co.z,-co.y]
me.calc_loop_triangles();assert len(me.loop_triangles)==646,'Preserve the authored topology'
bpy.context.scene.unit_settings.system='IMPERIAL';bpy.context.scene.unit_settings.scale_length=.3048
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':
  area.spaces.active.region_3d.view_location=(0,0,.88);area.spaces.active.region_3d.view_distance=2.8
  area.spaces.active.region_3d.view_rotation=Euler((1.25,0,.18)).to_quaternion()
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/rental-bag.blend'))
path=ROOT/'public/models/rental-bag-rest.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_extras=True)
data={'schema':1,'nodeCount':N,'columns':COLS,'rows':ROWS,'halfWidth':HW,'bodyHeight':BODY,'tabRise':TAB,
 'nodes':[round(v,7) for node in nodes for v in node],'bottomIndices':bottom}
folder=ROOT/'src/model-data';folder.mkdir(exist_ok=True)
(folder/'rental-bag-rest.json').write_text(json.dumps(data,separators=(',',':'))+'\n')
b=path.read_bytes();doc=json.loads(b[20:20+struct.unpack_from('<I',b,12)[0]])
assert doc['materials'][0].get('alphaMode') in ['MASK','BLEND'],'Handle cutout must survive export'
me.calc_loop_triangles();metrics={'nodes':N,'triangles':len(me.loop_triangles),'bytes':len(b),'footprintFt':[1.6,1.76],'binding':'unchanged 340-node lattice','bottomTriangles':len(bottom)//3,'alphaMode':doc['materials'][0].get('alphaMode')}
(ROOT/'tools/models/rental-bag-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n');print(metrics)
