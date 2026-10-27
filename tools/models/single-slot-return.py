"""Single-slot tape-return housing (issue #403): a hollow blue saddle that caps the
return counter, with one recessed opening and a lower label plate. Same runtime
envelope conventions as interior-return-chute.py: feet, ground origin, width
along X, customer face toward local +Z, counter band face at Z 0.
Run: blender -b -t 2 -P /absolute/path/to/tools/models/single-slot-return.py
No reference artwork included; the runtime paints both labels in a bundled face.
"""
import bpy, bmesh, json, math
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
rng=np.random.default_rng(403); n=256
height=rng.random((n,n)); height=(height+np.roll(height,1,0)+np.roll(height,1,1))/3
normal=np.dstack((.5+(np.roll(height,1,1)-np.roll(height,-1,1))*.14,.5+(np.roll(height,1,0)-np.roll(height,-1,0))*.14,np.ones((n,n)),np.ones((n,n))))
rough=np.dstack([.44+height*.12]*3+[np.ones((n,n))])
def image(name,pixels):
 im=bpy.data.images.new(name,width=n,height=n); im.colorspace_settings.name='Non-Color'; im.pixels.foreach_set(pixels.astype(np.float32).ravel()); im.pack(); return im
norm=image('Housing fine laminate and metal grain',normal); rm=image('Housing calibrated roughness grain',rough)
def material(name,color,metal,roughness):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 nodes=m.node_tree.nodes; links=m.node_tree.links; p=nodes.get('Principled BSDF')
 p.inputs['Base Color'].default_value=(*color,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=roughness
 tex=nodes.new('ShaderNodeTexImage'); tex.image=norm
 nm=nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value=.45; links.new(tex.outputs['Color'],nm.inputs['Color']); links.new(nm.outputs['Normal'],p.inputs['Normal'])
 tex=nodes.new('ShaderNodeTexImage'); tex.image=rm; links.new(tex.outputs['Color'],p.inputs['Roughness'])
 return m
body=material('ChuteLaminate',(.018,.065,.36),.03,.45)
metal=material('ChuteSteel',(.9,.9,.87),0,.45)
dark=material('ChuteReveal',(.09,.10,.12),.1,.62)
parts=[]
def mesh(name,verts,faces,mat,bevel=.006):
 me=bpy.data.meshes.new(name); me.from_pydata([(x,-z,y) for x,y,z in verts],[],faces); me.update()
 ob=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(ob); me.materials.append(mat)
 bm=bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces)); assert all(e.is_manifold for e in bm.edges),name; bm.to_mesh(me); bm.free()
 bpy.context.view_layer.objects.active=ob; ob.select_set(True)
 if bevel:
  mod=ob.modifiers.new('Fold edge easing','BEVEL'); mod.width=bevel; mod.segments=2
  bpy.ops.object.modifier_apply(modifier=mod.name)
 bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(island_margin=.025); bpy.ops.object.mode_set(mode='OBJECT'); ob.select_set(False)
 ob['units']='feet'; parts.append(ob); return ob
HEX=[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
def profile(name,x0,x1,yz,mat,bevel=.006):
 n=len(yz); v=[(x,y,z) for x in (x0,x1) for y,z in yz]
 return mesh(name,v,[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat,bevel)
def box(name,x0,x1,y0,y1,z0,z1,mat,bevel=.006):
 return profile(name,x0,x1,[(y0,z0),(y1,z0),(y1,z1),(y0,z1)],mat,bevel)
def slab(name,loop,offset,mat,bevel=.002):
 # A folded sheet: a four-point inner surface plus the same loop pushed by its thickness.
 v=list(loop)+[(x+offset[0],y+offset[1],z+offset[2]) for x,y,z in loop]
 return mesh(name,v,HEX,mat,bevel)
# Envelope (feet). Measured off the owner's close-up as fractions of the housing
# face: the face hangs from a crown just proud of the counter top almost to the
# base trim, its width about 0.78 of that height; the opening sits 0.33-0.51
# of the way down and spans ~0.4 of the width; the lower label 0.55-0.76 down.
FACE=1/3      # proud of the counter band face, as the #219 chute
SKIN=.14
HALF_W=1.35   # 2.7 ft wide housing
TOP=3.9       # crown top, just over the 3.54 band top
BOT=.35       # the front panel and cheeks hang almost to the floor
ROLL=.33      # quarter-round crown along the top-front edge
REAR=-1.49    # tucks to the counter band's inner face, as the chute
MOUTH_W,MOUTH_Y0,MOUTH_Y1=1.0,2.10,2.72   # one opening, a little bigger than a VHS case
CLIP_Y=2.55   # the staff-side leg of the saddle stops here (a clip over the blue band top)
yz=[(BOT,REAR),(TOP,REAR),(TOP,FACE-ROLL)]
for i in range(1,17):
 a=math.pi/2*(1-i/16); yz.append((TOP-ROLL+ROLL*math.sin(a),FACE-ROLL+ROLL*math.cos(a)))
yz.append((BOT,FACE))
shell=profile('Rounded laminate saddle',-HALF_W,HALF_W,yz,body,0)
def cut(name,x0,x1,y0,y1,z0,z1):
 cutter=box(name,x0,x1,y0,y1,z0,z1,body,0)
 bpy.context.view_layer.objects.active=shell; mod=shell.modifiers.new(name,'BOOLEAN'); mod.operation='DIFFERENCE'; mod.object=cutter
 bpy.ops.object.modifier_apply(modifier=mod.name); parts.remove(cutter); bpy.data.objects.remove(cutter,do_unlink=True)
# Hollow saddle: the counter band passes through it. The upper cut leaves a
# short rear clip; the lower cut opens the rear fully so nothing reaches into
# the staff well.
cut('Upper saddle hollow',-HALF_W+SKIN,HALF_W-SKIN,CLIP_Y,TOP-ROLL-.1,REAR+SKIN,FACE-SKIN)
cut('Lower saddle hollow',-HALF_W+SKIN,HALF_W-SKIN,BOT-.1,CLIP_Y+.001,REAR-.2,FACE-SKIN)
cut('Return opening',-MOUTH_W/2,MOUTH_W/2,MOUTH_Y0,MOUTH_Y1,FACE-SKIN-.05,FACE+.08)
bpy.context.view_layer.objects.active=shell
mod=shell.modifiers.new('Eased laminate cut edges','BEVEL'); mod.width=.006; mod.segments=2; bpy.ops.object.modifier_apply(modifier=mod.name)
shell.select_set(True); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(island_margin=.015); bpy.ops.object.mode_set(mode='OBJECT'); shell.select_set(False)
# Tapered steel throat: four folded sheets converge from the face opening to a
# smaller mouth deep in the recess, the way the close-up's pale walls narrow.
F=FACE+.004; D=.06; T=.02
IX,IY0,IY1=.39,2.21,2.63
slab('Throat floor',[(-MOUTH_W/2,MOUTH_Y0,F),(MOUTH_W/2,MOUTH_Y0,F),(IX,IY0,D),(-IX,IY0,D)],(0,-T,0),metal)
slab('Throat ceiling',[(-MOUTH_W/2,MOUTH_Y1,F),(MOUTH_W/2,MOUTH_Y1,F),(IX,IY1,D),(-IX,IY1,D)],(0,T,0),metal)
slab('Left throat wall',[(-MOUTH_W/2,MOUTH_Y0,F),(-MOUTH_W/2,MOUTH_Y1,F),(-IX,IY1,D),(-IX,IY0,D)],(-T,0,0),metal)
slab('Right throat wall',[(MOUTH_W/2,MOUTH_Y0,F),(MOUTH_W/2,MOUTH_Y1,F),(IX,IY1,D),(IX,IY0,D)],(T,0,0),metal)
# Dark baffle masks the counter band behind the throat; the dropped case
# vanishes behind it.
box('Rear light baffle',-IX-.03,IX+.03,IY0-.03,IY1+.03,.03,.05,dark,.002)
# Lower label plate: a pale metal plate below the opening; the runtime letters it.
box('Lower label plate',-.56,.56,1.22,1.95,FACE,FACE+.012,metal,.003)
scene=bpy.context.scene; scene.unit_settings.system='IMPERIAL'; scene.unit_settings.scale_length=.3048
scene['provenance']='Original scripted construction proportioned off the owner-held tape-return close-up (reference record lenneth-tape-return-20261012); no photo pixels or chain marks embedded. Runtime paints the lettering.'
scene['dimensions_ft']='2.7 W x 3.9 H x 1.835 D; rear -1.49, face .333; single mouth (0,2.41,.333) 1.0 x .62'
scene['moving_parts']='none; the drop ritual slides the case through the open throat'
for o in parts:
 bm=bmesh.new(); bm.from_mesh(o.data); assert all(e.is_manifold for e in bm.edges),o.name; bm.free()
 assert o.data.uv_layers
 for uv in o.data.uv_layers.active.data: uv.uv *= 8
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':
  area.spaces.active.region_3d.view_distance=7; area.spaces.active.region_3d.view_location=Vector((0,0,1.9))
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/single-slot-return.blend'))
source_parts=len(parts)
for mat in [body,metal,dark]:
 obs=[o for o in scene.objects if o.type=='MESH' and o.data.materials[0]==mat]
 for o in obs:o.select_set(True)
 bpy.context.view_layer.objects.active=obs[0]; bpy.ops.object.join(); bpy.context.object.name=mat.name; bpy.context.object.select_set(False)
obs=[o for o in scene.objects if o.type=='MESH']
for o in obs:o.data.calc_loop_triangles()
path=ROOT/'public/models/single-slot-return.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_extras=True)
metrics={'triangles':sum(len(o.data.loop_triangles) for o in obs),'draws':sum(len(o.data.materials) for o in obs),'materials':3,'images':2,'image_dimensions':[256,256],'glb_bytes':path.stat().st_size,'source_parts':source_parts}
(ROOT/'tools/models/single-slot-return-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n'); print(metrics)
