"""Original queue cabinet, estimated design (no recovered reference).
First: python3 tools/models/queue-vitrine-print.py (Pillow).
Reproduce: blender -b -t 2 -P tools/models/queue-vitrine.py
Feet; Blender (x,-store_z,height), floor-centred origin, customer face store +Z.
"""
import bpy, bmesh, math, json
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene
scene.unit_settings.system='IMPERIAL';scene.unit_settings.scale_length=.3048
parts=[];n=256;y,x=np.mgrid[:n,:n];rng=np.random.default_rng(196)
noise=rng.random((n,n));grain=.5+.18*np.sin(y*.75+np.sin(x*.06))+.12*noise

def image(name,rgb):
 im=bpy.data.images.new(name,width=n,height=n);im.colorspace_settings.name='Non-Color'
 a=np.ones((n,n,4),dtype=np.float32);a[:,:,:3]=rgb;im.pixels.foreach_set(a.ravel());im.pack();return im

def mat(name,color,r,metal=0,wood=False):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1)
 ns=m.node_tree.nodes;ls=m.node_tree.links;p=ns['Principled BSDF'];p.inputs['Metallic'].default_value=metal
 h=grain if wood else noise
 def tex(im,socket):
  t=ns.new('ShaderNodeTexImage');t.image=im;ls.new(t.outputs['Color'],p.inputs[socket])
 tex(image(name+'_albedo',np.array(color)[None,None,:]*(.94+.06*h[:,:,None])),'Base Color')
 tex(image(name+'_roughness',np.repeat((r+.04*(h-.5))[:,:,None],3,2)),'Roughness')
 dy,dx=np.gradient(h);t=ns.new('ShaderNodeTexImage');t.image=image(name+'_normal',np.stack((.5-dx*.14,.5-dy*.14,np.ones_like(h)),2))
 nm=ns.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.25;ls.new(t.outputs['Color'],nm.inputs['Color']);ls.new(nm.outputs[0],p.inputs['Normal'])
 return m
wood=mat('VitrineLaminate',(.55,.45,.31),.48,wood=True)
metal=mat('VitrineAnodizedAluminum',(.60,.63,.65),.30,.82)
gasket=mat('VitrineGasket',(.09,.095,.10),.82)
stock=mat('VitrineCarton',(.16,.23,.38),.64)
label=mat('VitrinePaper',(.83,.81,.72),.76)
im=bpy.data.images.load(str(ROOT/'tools/models/queue-vitrine-print.png'));im.pack()
t=label.node_tree.nodes.new('ShaderNodeTexImage');t.image=im
label.node_tree.links.new(t.outputs['Color'],label.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
glass=mat('VitrineGlass',(.80,.94,.90),.055)
p=glass.node_tree.nodes['Principled BSDF'];p.inputs['Alpha'].default_value=.12
# No transmission extension, even when viewed outside the app.
glass.surface_render_method='DITHERED'

def finish(o,name,m,bevel=.005):
 o.name=name;o.data.materials.append(m)
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  mod=o.modifiers.new('Manufactured edge radius','BEVEL');mod.width=bevel;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name)
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
 assert all(e.is_manifold for e in bm.edges),name
 bm.to_mesh(o.data);bm.free()
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.015);bpy.ops.object.mode_set(mode='OBJECT')
 o['partRole']=name;parts.append(o);return o

def box(name,loc,dims,m,bevel=.005):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.dimensions=dims;return finish(o,name,m,bevel)

def ring(name,w,d,lo,hi,t,m):
 # Single welded rectangular profile, open inside, capped on both ends.
 corners=lambda W,D:[(-W/2,-D/2),(W/2,-D/2),(W/2,D/2),(-W/2,D/2)]
 vs=[(x,y,z) for z in [lo,hi] for W,D in [(w,d),(w-2*t,d-2*t)] for x,y in corners(W,D)]
 fs=[]
 for i in range(4):
  j=(i+1)%4
  fs.extend([(i,j,8+j,8+i),(4+j,4+i,12+i,12+j),(j,i,4+i,4+j),(8+i,8+j,12+j,12+i)])
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);return finish(o,name,m)

ring('RecessedToePlinth',3.24,1.44,0,.18,.09,gasket)
ring('BaseCarcass',3.5,1.7,.18,.56,.07,wood)
box('BaseDeck',(0,0,.60),(3.5,1.7,.08),wood,.012)
box('BaseBottom',(0,0,.22),(3.36,1.56,.08),wood)
# End-fitted frame extrusions; rails terminate at post faces.
for xx in [-1.69,1.69]:
 for yy in [-.79,.79]:box('CornerPost',(xx,yy,2.03),(.08,.08,2.78),metal)
for zz in [.68,3.40]:
 for yy in [-.79,.79]:box('FrontRearFrameRail',(0,yy,zz),(3.30,.08,.08),metal)
 for xx in [-1.69,1.69]:box('SideFrameRail',(xx,0,zz),(.08,1.5,.08),metal)
box('CustomerFrontGlass',(0,-.79,2.04),(3.30,.018,2.64),glass,.003)
for xx in [-1.69,1.69]:box('SideGlass',(xx,0,2.04),(.018,1.50,2.64),glass,.003)
box('GlassTop',(0,0,3.465),(3.5,1.7,.035),glass,.006)
# Fixed vertical shelf standards fasten into the side frame rails. Brackets
# seat on these strips, rather than floating between the corner posts.
for xx in [-1.655,1.655]:
 for yy in [-.61,.61]:box('FixedShelfStandard',(xx,yy,2.04),(.03,.06,2.64),metal,.003)
# Two supported shelves: upper surface is the merchandise datum.
for level in [1.43,2.32]:
 box('GlassShelf',(0,0,level-.0175),(3.25,1.41,.035),glass,.003)
 ring('ShelfEdgeGuard',3.27,1.43,level-.035,level,.01,metal)
 for xx in [-1.65,1.65]:
  for yy in [-.61,.61]:
   box('ShelfSupportBracket',(xx,yy,level-.075),(.10,.10,.06),metal)
   box('ShelfCushion',(xx,yy,level-.040),(.10,.10,.010),gasket,.002)
# Rear frame and sliding door hardware are inferred, explicitly named.
for zz in [.735,3.345]:
 for yy in [.685,.765,.845]:box('InferredRearTrack',(0,yy,zz),(3.30,.014,.035),metal,.002)
for i,(xx,yy) in enumerate([(-.785,.72),(.785,.80)]):
 # continuous welded frame, modelled flat and rotated into the X/Z plane
 o=ring('InferredSlidingDoorFrame_'+str(i),1.73,2.59,-.0175,.0175,.04,metal)
 o.rotation_euler.x=math.pi/2;o.location=(xx,yy,2.04)
 box('RearDoorGlass_'+str(i),(xx,yy,2.04),(1.65,.018,2.51),glass,.003)
 # handle attached on the outboard stile; horizontal stand-offs meet backplate
 hx=xx+(-.78 if i==0 else .78)
 box('InferredHandleBackplate',(hx,yy+.025,2.03),(.055,.020,.29),metal)
 for z in [1.93,2.13]:box('InferredPullStandoff',(hx,yy+.06,z),(.028,.05,.028),metal)
 box('InferredPull',(hx,yy+.09,2.03),(.028,.028,.228),metal,.008)
box('InferredLockBody',(.025,.85,1.91),(.10,.035,.07),metal,.012)
box('InferredLockSlot',(.025,.869,1.91),(.034,.003,.009),gasket,.001)
# Supported generic cassette cartons, not catalog selection/interaction slots.
for shelf in [.64,1.43,2.32]:
 for i,xx in enumerate([-1.17,-.39,.39,1.17]):
  box('Merchandise_CassetteCarton',(xx,-.12,shelf+.30),(.65,.20,.60),stock,.008)
  ob=box('Merchandise_PaperSleeve',(xx,-.223,shelf+.29),(.61,.006,.42),label,.002)
  # Face-projected print UV; eased edges sample the blank paper border.
  uv=ob.data.uv_layers.active.data
  for face in ob.data.polygons:
   for li in face.loop_indices:
    v=ob.data.vertices[ob.data.loops[li].vertex_index].co
    uv[li].uv=(v.x/.61+.5,v.z/.42+.5) if face.normal.y<-.9 else (.01,.01)
anchors=[]
for name,z in [('floor_origin',0),('merchandise_base',.64),('merchandise_shelf_1',1.43),('merchandise_shelf_2',2.32)]:
 ob=bpy.data.objects.new(name,None);scene.collection.objects.link(ob);ob.location=(0,0,z);ob['units']='feet';anchors.append(ob)
scene['provenance']='Original unbranded construction study. queue-vitrine / candy-queue-fixtures source not available; all dimensions estimated, rear tracks/pulls/lock inferred. Not an authenticated period replica.'
scene['dimensions']='3.5 x 1.7 x 3.4825 feet; store +Z customer front, -Z sliding service doors; static, no door interaction.'
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=6;area.spaces.active.region_3d.view_location=(0,0,1.7)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/queue-vitrine.blend'),compress=True)
# Batch opaque physical parts by role; retain separate glass panes for sorting.
exported=[o for o in parts if o.data.materials[0]==glass]
batches=[[o for o in parts if o.data.materials[0]==m] for m in [wood,metal,gasket,stock,label]]
for m,obs in zip([wood,metal,gasket,stock,label],batches):
 bpy.ops.object.select_all(action='DESELECT')
 for o in obs:o.select_set(True)
 bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();obs[0].name=m.name;exported.append(obs[0])
bpy.ops.object.select_all(action='DESELECT')
for o in exported+anchors:o.select_set(True)
out=ROOT/'public/models/queue-vitrine.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_texcoords=True)
tri=0;pts=[]
for o in exported:
 o.data.calc_loop_triangles();tri+=len(o.data.loop_triangles);pts += [o.matrix_world@Vector(v) for v in o.bound_box]
metrics={'units':'feet','triangles':tri,'glbBytes':out.stat().st_size,'runtimeMeshes':len(exported),'materialRoles':[m.name for m in [wood,metal,gasket,stock,label,glass]],'textures':18,'textureSize':[256,256],'boundsBlender':[[min(p[i] for p in pts) for i in range(3)],[max(p[i] for p in pts) for i in range(3)]],'closedPartsManifold':True,'exception':None,'shelfTopHeights':[.64,1.43,2.32],'merchandiseCartons':12}
(ROOT/'tools/models/queue-vitrine-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n');print(metrics)
