"""Original fitted return-chute construction; existing runtime envelope in feet.
Run: blender -b -t 2 -P /absolute/path/to/tools/models/interior-return-chute.py
No reference artwork included; existing runtime lettering remains authoritative.
"""
import bpy, bmesh, json, math
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
# Deterministic tileable fine grain, encoded as tangent normal and roughness.
rng=np.random.default_rng(219); n=256
height=rng.random((n,n)); height=(height+np.roll(height,1,0)+np.roll(height,1,1))/3
normal=np.dstack((.5+(np.roll(height,1,1)-np.roll(height,-1,1))*.14,.5+(np.roll(height,1,0)-np.roll(height,-1,0))*.14,np.ones((n,n)),np.ones((n,n))))
rough=np.dstack([.44+height*.12]*3+[np.ones((n,n))])
def image(name,pixels):
 im=bpy.data.images.new(name,width=n,height=n); im.colorspace_settings.name='Non-Color'; im.pixels.foreach_set(pixels.astype(np.float32).ravel()); im.pack(); return im
norm=image('Chute fine laminate and metal grain',normal); rm=image('Chute calibrated roughness grain',rough)
def material(name,color,metal,roughness):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 nodes=m.node_tree.nodes; links=m.node_tree.links; p=nodes.get('Principled BSDF')
 p.inputs['Base Color'].default_value=(*color,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=roughness
 tex=nodes.new('ShaderNodeTexImage'); tex.image=norm
 nm=nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value=.45; links.new(tex.outputs['Color'],nm.inputs['Color']); links.new(nm.outputs['Normal'],p.inputs['Normal'])
 tex=nodes.new('ShaderNodeTexImage'); tex.image=rm; links.new(tex.outputs['Color'],p.inputs['Roughness'])
 return m
body=material('ChuteLaminate',(.08,.13,.34),.03,.36)
metal=material('ChuteSteel',(.48,.50,.53),.85,.36)
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
def profile(name,x0,x1,yz,mat,bevel=.006):
 n=len(yz); v=[(x,y,z) for x in (x0,x1) for y,z in yz]
 return mesh(name,v,[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat,bevel)
def box(name,x0,x1,y0,y1,z0,z1,mat,bevel=.006):
 return profile(name,x0,x1,[(y0,z0),(y1,z0),(y1,z1),(y0,z1)],mat,bevel)
# Continuous rounded millwork envelope, with a machined aperture and hollow rear.
yz=[(0,-1.49),(3.85,-1.49),(3.85,.52)]
for i in range(1,25):
 a=math.pi/2*(1-i/24); yz.append((3.47+.38*math.sin(a),.52+.38*math.cos(a)))
yz.append((0,.9))
shell=profile('Rounded laminate shell',-1.2,1.2,yz,body,0)
def cut(name,x0,x1,y0,y1,z0,z1):
 cutter=box(name,x0,x1,y0,y1,z0,z1,body,0)
 bpy.context.view_layer.objects.active=shell; mod=shell.modifiers.new(name,'BOOLEAN'); mod.operation='DIFFERENCE'; mod.object=cutter
 bpy.ops.object.modifier_apply(modifier=mod.name); parts.remove(cutter); bpy.data.objects.remove(cutter,do_unlink=True)
cut('Open rear counter socket',-1.06,1.06,.08,3.46,-1.60,.76)
cut('Through aperture',-1,0,2.4,2.7,.70,1.0)
bpy.context.view_layer.objects.active=shell
mod=shell.modifiers.new('Eased laminate cut edges','BEVEL'); mod.width=.006; mod.segments=3; bpy.ops.object.modifier_apply(modifier=mod.name)
shell.select_set(True); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(island_margin=.015); bpy.ops.object.mode_set(mode='OBJECT'); shell.select_set(False)
# Folded throat, open all the way to the receiver. No solid dark cavity cube.
box('Throat ceiling',-1,0,2.68,2.70,.05,.904,metal,.002)
box('Throat sill',-1,0,2.40,2.42,.35,.904,metal,.002)
for name,a,b in [('Left',-1,-.98),('Right',-.02,0)]:
 box(name+' throat return',a,b,2.42,2.68,.05,.904,metal,.002)
profile('Sloped internal receiving reveal',-1.02,.02,[(2.15,.02),(2.18,.02),(2.42,.35),(2.40,.35)],dark,.002)
box('Rear light baffle',-1.03,.03,1.7,2.7,.03,.05,dark,.002)
# Independently addressable top hinge; runtime opens this during the existing drop.
flap=box('ChuteFlap',-.97,-.03,2.435,2.665,.737,.749,metal,.003)
bpy.context.scene.cursor.location=(-.5,-.743,2.665); flap.select_set(True); bpy.context.view_layer.objects.active=flap; bpy.ops.object.origin_set(type='ORIGIN_CURSOR'); flap.select_set(False)
flap.rotation_euler.x=.24
for x in [-1.09425,1.09425]:
 for y in [3.085-(2.24/8.7)*.4,3.085+(2.24/8.7)*.4]:
  box('Acrylic label standoff',x-.014,x+.014,y-.014,y+.014,.9,.907,metal,.002)
scene=bpy.context.scene; scene.unit_settings.system='IMPERIAL'; scene.unit_settings.scale_length=.3048
scene['provenance']='Original scripted fitted construction using existing application dimensions; missing archival stills not reinterpreted as an exact replica. No branded art.'
scene['dimensions_ft']='2.4 W x 3.85 H x 2.397 D; rear -1.49, face .9; mouth (-.5,2.55,.9)'
scene['moving_parts']='ChuteFlap: top pivot (-.5,2.665,.743), opens inward during tape return'
for o in parts:
 bm=bmesh.new(); bm.from_mesh(o.data); assert all(e.is_manifold for e in bm.edges),o.name; bm.free()
 assert o.data.uv_layers
 # Tile packed per-part islands for sub-inch physical grain rather than broad mottling.
 for uv in o.data.uv_layers.active.data: uv.uv *= 8
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':
  area.spaces.active.region_3d.view_distance=7; area.spaces.active.region_3d.view_location=Vector((0,0,1.9))
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/interior-return-chute.blend'))
# Merge static parts by material, keep hinge independently movable.
source_parts=len(parts)
for mat in [body,metal,dark]:
 obs=[o for o in scene.objects if o.type=='MESH' and o!=flap and o.data.materials[0]==mat]
 for o in obs:o.select_set(True)
 bpy.context.view_layer.objects.active=obs[0]; bpy.ops.object.join(); bpy.context.object.name=mat.name; bpy.context.object.select_set(False)
obs=[o for o in scene.objects if o.type=='MESH']
for o in obs:o.data.calc_loop_triangles()
path=ROOT/'public/models/interior-return-chute.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_extras=True)
metrics={'triangles':sum(len(o.data.loop_triangles) for o in obs),'draws':len(obs),'materials':3,'images':2,'image_dimensions':[256,256],'glb_bytes':path.stat().st_size,'source_parts':source_parts}
(ROOT/'tools/models/interior-return-chute-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n'); print(metrics)
