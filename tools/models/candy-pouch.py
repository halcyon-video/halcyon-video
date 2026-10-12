"""Original sealed hanging pouch kit, scripted Blender mesh authoring (#277).
Feet; Blender (store_x, -store_z, store_y). No reference pixels or third-party mesh.
Run with an absolute script path: blender -b -t 2 -P /path/tools/models/candy-pouch.py
"""
import bpy, bmesh, math, json
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene;scene.unit_settings.system='IMPERIAL';scene.unit_settings.scale_length=.3048
CROWN=3.72+.28*math.sin(3*math.pi/8)
ROOT_OFFSET=CROWN-(.615+4*.7)
NECK_DROP=ROOT_OFFSET-(-.005+7/12-.035+.0065)
SIDE_TOP=.28*math.cos(3*math.pi/8)*1.6/.7
parts=[];groups=[]
def material(name,color,rough,metal=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1)
 p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 return m
laminate=material('SnackPouchLaminate',(.76,.71,.59),.43)
steel=material('PouchSupportSteel',(.17,.18,.19),.38,.7)
board=material('SlatwallBoard',(.80,.72,.56),.55)
kick=material('SlatwallKickBase',(.05,.05,.055),.7)
def group(name):
 o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);groups.append(o);return o

def finish(name,vs,fs,mat,parent,print_size=None):
 me=bpy.data.meshes.new(name);me.from_pydata([(x,-z,y) for x,y,z in vs],[],fs);me.update()
 o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);o.parent=parent;me.materials.append(mat)
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(me);bm.free()
 if print_size: o['printWidth'],o['printHeight']=print_size
 parts.append(o);return o

def anchor(parent,name,p):
 o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);o.parent=parent;o.location=(p[0],-p[2],p[1]);o.empty_display_type='PLAIN_AXES';o.empty_display_size=.025
 return o

def tube_geometry(points,radius,sides=8):
 pts=[Vector(p) for p in points];vs=[];fs=[];last=None
 for i,p in enumerate(pts):
  tangent=(pts[min(i+1,len(pts)-1)]-pts[max(i-1,0)]).normalized();u=tangent.cross(Vector((0,1,0)))
  if u.length<.01:u=tangent.cross(Vector((0,0,1)))
  u.normalize()
  if last is not None and u.dot(last)<0:u=-u
  last=u.copy();v=tangent.cross(u).normalized()
  for k in range(sides):vs.append(tuple(p+radius*(math.cos(k*math.tau/sides)*u+math.sin(k*math.tau/sides)*v)))
 for i in range(len(pts)-1):
  for k in range(sides):fs.append((i*sides+k,i*sides+(k+1)%sides,(i+1)*sides+(k+1)%sides,(i+1)*sides+k))
 fs.extend([tuple(reversed(range(sides))),tuple((len(pts)-1)*sides+k for k in range(sides))])
 return vs,fs

def tube(name,points,radius,parent,sides=8):
 vs,fs=tube_geometry(points,radius,sides);return finish(name,vs,fs,steel,parent)

def prism(profile,axis,a,b):
 # Closed extrusion of a simple 2D section; caps may be concave n-gons.
 n=len(profile);vs=[];fs=[]
 for t in (a,b):
  for u,v in profile:vs.append({'x':(t,u,v),'z':(u,v,t)}[axis])
 fs.append(tuple(reversed(range(n))));fs.append(tuple(n+k for k in range(n)))
 for k in range(n):fs.append((k,(k+1)%n,n+(k+1)%n,n+k))
 return vs,fs

def box(x0,x1,y0,y1,z0,z1):
 return prism([(x0,y0),(x1,y0),(x1,y1),(x0,y1)],'z',z0,z1)

for label,w,h,d in [('Small',.42,7/12,.15),('Full',.50,.72,.20)]:
 parent=group('Pouch'+label);parent['boundsFeet']=[w,h,d];parent['origin']='bottom centre; +Z front';parent['estimatedConstruction']=True
 # Joined inflated body and flattened transverse seals. Alternating thin seal
 # sections model restrained crimp impressions; the source is a closed volume.
 profiles=[(0,.88,.0008),(.010,.90,.0010),(.020,.92,.0008),(.033,.94,.004),(.064,.97,d*.28),(h*.24,1,d*.47),(h*.50,.995,d*.5),(h*.73,.98,d*.43),(h-.082,.96,d*.27),(h-.060,.94,.0010),(h-.050,.94,.0008),(h-.042,.94,.0010),(h-.034,.94,.0008),(h-.026,.94,.0010),(h-.018,.94,.0008),(h-.009,.94,.0010),(h,.93,.0008)]
 section=[(-1,0),(-.96,.40),(-.85,.72),(-.65,.90),(-.35,.98),(0,1),(.35,.98),(.65,.90),(.85,.72),(.96,.40),(1,0),(.96,-.40),(.85,-.72),(.65,-.90),(.35,-.96),(.08,-.96),(.025,-.96),(0,-1),(-.025,-.96),(-.08,-.96),(-.35,-.96),(-.65,-.90),(-.85,-.72),(-.96,-.40)]
 n=len(section);vs=[]
 for j,(y,width,depth) in enumerate(profiles):
  for k in range(n):
   sx,sz=section[k];x=w*.5*width*sx;z=depth*sz
   # Original restrained corner wrinkles, taper to zero through the label area.
   if 2<j<9:z*=1+.035*math.sin(k*2.8+j*.9)*(abs(x)/(w*.5))**4
   # A narrow rear folded-fin ridge is part of the continuous skin, not a
   # floating strip. Its unseen construction is explicitly an estimate.
   if j<3 or j>8:
    if sz<-.95:z=-depth*.96
   vs.append((x,y,z))
 fs=[tuple(reversed(range(n))),tuple((len(profiles)-1)*n+k for k in range(n))]
 for j in range(len(profiles)-1):
  for k in range(n):fs.append((j*n+k,j*n+(k+1)%n,(j+1)*n+(k+1)%n,(j+1)*n+k))
 o=finish('Pouch'+label+'_continuous_laminate_and_seals',vs,fs,laminate,parent,(w,h))
 # Actual bore through both sealed skins. Boolean is applied to the source;
 # consumers never need alpha to fake a hanging hole.
 bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=.0125,depth=.06,location=(0,0,h-.035),rotation=(math.pi/2,0,0))
 cutter=bpy.context.object;cutter.name='temporary_hole_tool'
 bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('Die_cut_hanging_hole','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
 bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
 anchor(parent,'Anchor_'+label+'_Bottom',(0,0,0));anchor(parent,'Anchor_'+label+'_PegHole',(0,h-.035,0));anchor(parent,'Anchor_'+label+'_WireRest',(0,h-.035+.0065,0))

for name,length,load in [('PegShort',.25,.18),('PegLong',.82,.75)]:
 parent=group(name);parent['wireRadiusFeet']=.006;parent['loadDistanceFeet']=load
 # Smooth neck offset clears the support bar. A rounded upturn retains stock.
 pts=[(0,0,0)]
 for i in range(1,5):
  t=i/4;pts.append((0,-NECK_DROP*(.5-.5*math.cos(math.pi*t)),.04*t))
 pts.append((0,-NECK_DROP,length-.012))
 for i in range(1,5):
  a=i*math.pi/8;pts.append((0,-NECK_DROP+.012*(1-math.cos(a)),length-.012+.012*math.sin(a)))
 pts.append((0,-NECK_DROP+.018,length))
 tube(name+'_bent_wire',pts,.006,parent)
 anchor(parent,'Anchor_'+name+'_Mount',(0,0,0));anchor(parent,'Anchor_'+name+'_Load',(0,-NECK_DROP,load))

for name,half in [('RackCrossbar',1.43),('GondolaCrossbar',1.85)]:
 p=group(name);tube(name+'_continuous_tube',[(-half,0,0),(half,0,0)],.0125,p)
 for side in [-1,1]:anchor(p,f'Anchor_{name}_'+('Left' if side<0 else 'Right'),(side*half,0,0))
for name,half in [('RackSideRail',.64),('RackCrownRail',SIDE_TOP)]:
 p=group(name);tube(name+'_continuous_tube',[(0,0,-half),(0,0,half)],.0125,p)
 for side in [-1,1]:anchor(p,f'Anchor_{name}_'+('Front' if side<0 else 'Rear'),(0,0,side*half))

# Slatwall wing: grooved end board for the candy gondola's open end (2006
# reference: bags hung on slatwall hooks beside the queue). Original
# construction estimates; board thickness and slot section follow common
# 3/4-in slatwall practice, not a measured panel. Local X=0 is the board's
# inner face against the gondola end; +X faces the aisle; Z spans the depth.
SLAT_T=.0625;SLAT_Y0=.4;SLAT_Y1=5.0;SLAT_HALF=.75
SLOTS=[.5+.25*k for k in range(18)]
p=group('SlatwallWing');p['boundsFeet']=[SLAT_T,SLAT_Y1,2*SLAT_HALF];p['origin']='inner board face, floor, gondola end centre; +X aisle'
section=[(0,SLAT_Y0),(SLAT_T,SLAT_Y0)]
for y in SLOTS:
 # J-slot: narrow lip opening, then a cavity running down behind the face,
 # which is what a hook bracket's lip drops into.
 section+=[(SLAT_T,y-.012),(SLAT_T-.022,y-.012),(SLAT_T-.022,y-.032),(SLAT_T-.045,y-.032),(SLAT_T-.045,y+.012),(SLAT_T,y+.012)]
section+=[(SLAT_T,SLAT_Y1),(0,SLAT_Y1)]
finish('SlatwallBoard_grooved_panel',*prism(section,'z',-SLAT_HALF,SLAT_HALF),board,p)
# Steel edge caps: butt-jointed, the top cap runs over both side caps.
for side in (-1,1):
 z0,z1=sorted((side*SLAT_HALF,side*(SLAT_HALF+.008)))
 finish(f'SlatwallEdgeCap_{"Rear" if side<0 else "Front"}',*box(-.004,SLAT_T+.004,SLAT_Y0,SLAT_Y1,z0,z1),steel,p)
finish('SlatwallEdgeCap_Top',*box(-.004,SLAT_T+.004,SLAT_Y1,SLAT_Y1+.008,-SLAT_HALF-.008,SLAT_HALF+.008),steel,p)
# Kick base, set back from the board face for a shadow line like the gondola toe.
finish('SlatwallKick_base',*box(0,SLAT_T-.012,0,SLAT_Y0,-SLAT_HALF,SLAT_HALF),kick,p)
# Flat-bar ties from the gondola's rear standard face (store x 1.89) to the board.
for i,y in enumerate((1.0,4.6)):
 finish(f'SlatwallTie_{i}',*box(-.11,0,y-.04,y+.04,-.656,-.644),steel,p)
anchor(p,'Anchor_SlatwallWing_GondolaEnd',(0,0,0))
for i,y in enumerate(SLOTS):anchor(p,f'Anchor_SlatwallWing_Slot{i:02d}',(SLAT_T,y,0))

# One-piece slatwall hook: a die-formed bracket whose lip drops into the slot
# cavity, with the bent wire welded to its face. Origin is the wire centre at
# the board face; the slot it engages is .06 ft above. +Z leaves the board.
p=group('SlatwallHook');p['wireRadiusFeet']=.006;p['slotAboveFeet']=.06
G=.06
bracket=[(.012,-.06),(.012,G+.008),(-.04,G+.008),(-.04,G-.028),(-.026,G-.028),(-.026,G-.008),(0,G-.008),(0,-.06)]
bv,bf=prism([(y,z) for z,y in bracket],'x',-.035,.035)
pts=[(0,0,.010),(0,0,.30),(0,0,.75-.012)]
for i in range(1,5):
 a=i*math.pi/8;pts.append((0,.012*(1-math.cos(a)),.75-.012+.012*math.sin(a)))
pts.append((0,.018,.75))
wv,wf=tube_geometry(pts,.006)
off=len(bv)
finish('SlatwallHook_bracket_and_wire',bv+wv,bf+[tuple(i+off for i in f) for f in wf],steel,p)
anchor(p,'Anchor_SlatwallHook_Mount',(0,0,0));anchor(p,'Anchor_SlatwallHook_LoadRear',(0,0,.40));anchor(p,'Anchor_SlatwallHook_LoadFront',(0,0,.62))

metrics={'units':'feet','axes':'glTF X across, Y up, +Z front; Blender (x,-z,y)','neckDropFeet':NECK_DROP,'rackCrossbarOffsetFeet':ROOT_OFFSET,'groups':[],'embeddedTextures':0,'construction':'Original generic sealed pouch and welded/bent-wire support kit. Visible pillow silhouette informed by reference; holes, sealed thickness, rear fin and support joints are estimates.'}
for parent in groups:
 meshes=[o for o in parts if o.parent==parent];count=0
 for o in meshes:
  me=o.data;bm=bmesh.new();bm.from_mesh(me);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7);bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
  bad=sum(not e.is_manifold for e in bm.edges);assert bad==0,(o.name,bad)
  assert bm.calc_volume(signed=False)>0,o.name
  bm.to_mesh(me);bm.free()
  # Boolean can import an empty default UV layer from its cutting primitive.
  # Keep one explicit render layer so glTF exports the authored print coordinates.
  for old_uv in list(me.uv_layers):me.uv_layers.remove(old_uv)
  uv=me.uv_layers.new(name='ReplaceablePrintUV');uv.active_render=True
  for poly in me.polygons:
   poly.use_smooth=('laminate' in o.name and abs(poly.normal.z)<.7)
   for li in poly.loop_indices:
    x,by,y=me.vertices[me.loops[li].vertex_index].co;z=-by
    if 'printWidth' in o:
     w,h=o['printWidth'],o['printHeight']
     # Orient each whole face, including its zero-depth side-edge loops.
     # Per-vertex depth signs would run the back edge from U0 to U1 and
     # squeeze another full label into the narrow side strip.
     u=x/w+.5 if poly.center.y<=0 else .5-x/w;v=y/h
    else:u=.5+x*.15;v=.5+y*.15
    uv.data[li].uv=(max(0,min(1,u)),max(0,min(1,v)))
  me.calc_loop_triangles();count+=len(me.loop_triangles)
  o['units']='feet';o['constructionEstimate']=True
 coords=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
 # Parents are identity, so these are the template's actual local bounds.
 mins=[min(p[i] for p in coords) for i in range(3)];maxs=[max(p[i] for p in coords) for i in range(3)]
 metrics['groups'].append({'name':parent.name,'triangles':count,'parts':len(meshes),'manifold':True,'boundsFeet':{'min':[mins[0],mins[2],-maxs[1]],'max':[maxs[0],maxs[2],-mins[1]]},'anchors':{o.name:[o.location.x,o.location.z,-o.location.y] for o in parent.children if o.type=='EMPTY'}})
# Source templates retain identity coordinates. Isolate the small bag initially;
# named groups remain available in the Outliner without misleading transforms.
for o in scene.objects:
 if o.name!='PouchSmall' and (o.parent is None or o.parent.name!='PouchSmall'):o.hide_set(True)
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=1.5;area.spaces.active.region_3d.view_location=(0,0,.3)
scene['templateKit']='Named groups overlap at origin intentionally; small pouch visible initially. Unhide/isolate another group to edit. Never install the entire kit as one object.'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/candy-pouch.blend'))
for o in scene.objects:o.hide_set(False)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/candy-pouch.glb'),export_format='GLB',export_yup=True,export_apply=True,export_extras=True)
metrics['triangles']=sum(g['triangles'] for g in metrics['groups']);metrics['glbBytes']=(ROOT/'public/models/candy-pouch.glb').stat().st_size
(ROOT/'tools/models/candy-pouch-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
print(json.dumps(metrics,indent=2))
