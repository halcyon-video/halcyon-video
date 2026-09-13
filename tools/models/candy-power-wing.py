"""Original generic bulk candy power wing; feet; no reference-derived art.
Run: blender -b -P tools/models/candy-power-wing.py
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.unit_settings.system='IMPERIAL'; scene.unit_settings.scale_length=.3048
scene['provenance']='Original generic design. 1993 walkthrough not available; dimensions estimated. Not a period replica.'
scene['contract']='Feet; Blender (x,-store_z,height); origin floor center; front store -Z. Fixed five rows; stock stays catalog-owned.'
# Deterministic tileable fiber, roughness and tangent-space normal maps, packed.
import numpy as np
rng=np.random.default_rng(204); n=256
noise=rng.random((n,n)); fibers=(noise*.55+np.roll(noise,1,axis=0)*.25+np.roll(noise,2,axis=0)*.2)
def img(name,rgb):
 a=np.ones((n,n,4),dtype=np.float32); a[:,:,:3]=rgb
 im=bpy.data.images.new(name,width=n,height=n); im.pixels.foreach_set(a.ravel()); im.pack(); return im
color=img('Kraft_fiber_albedo',np.stack([.61+fibers*.10,.43+fibers*.09,.25+fibers*.07],axis=2))
rough=img('Kraft_fiber_roughness',np.repeat((.76+fibers*.15)[:,:,None],3,axis=2)); rough.colorspace_settings.name='Non-Color'
dx=np.roll(fibers,1,axis=1)-np.roll(fibers,-1,axis=1); dy=np.roll(fibers,1,axis=0)-np.roll(fibers,-1,axis=0)
normal=img('Kraft_fiber_normal',np.stack([.5+dx*.2,.5+dy*.2,np.full((n,n),.99)],axis=2)); normal.colorspace_settings.name='Non-Color'
def mat(name,base,roughness,metal=0,textured=False,emissive=False):
 m=bpy.data.materials.new(name);m.diffuse_color=(*base,1);m.use_nodes=True
 ns=m.node_tree.nodes; links=m.node_tree.links;p=ns.get('Principled BSDF');p.inputs['Base Color'].default_value=(*base,1);p.inputs['Roughness'].default_value=roughness;p.inputs['Metallic'].default_value=metal
 if emissive:
  p.inputs['Emission Color'].default_value=(*base,1)
  p.inputs['Emission Strength'].default_value=0.8
 if textured:
  for im,socket in [(color,'Base Color'),(rough,'Roughness')]:
   t=ns.new('ShaderNodeTexImage');t.image=im;links.new(t.outputs['Color'],p.inputs[socket])
  t=ns.new('ShaderNodeTexImage');t.image=normal;b=ns.new('ShaderNodeNormalMap');b.inputs['Strength'].default_value=.45;links.new(t.outputs['Color'],b.inputs['Color']);links.new(b.outputs['Normal'],p.inputs['Normal'])
 return m
kraft=mat('CorrugatedKraft',(.65,.48,.3),.86,textured=True)
edge=mat('ExposedFlute',(.36,.24,.13),.94,textured=True)
steel=mat('AttachmentSteel',(.24,.27,.3),.42,.7)
art=mat('HeaderPrint',(.85,.72,.39),.8,textured=True,emissive=True)
parts=[]
def box(name,pos,size,material,tilt=0):
 x,y,z=pos; w,h,d=size
 bpy.ops.mesh.primitive_cube_add(size=1,location=(x,-z,y));o=bpy.context.object;o.name=name;o.dimensions=(w,d,h)
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 o.rotation_euler.x=tilt;o.data.materials.append(material);parts.append(o);return o
# Folded back blank with returned side panels; thin sheets, not solid blocks.
box('Back_blank',(0,2.11,.705),(2.82,3.78,.018),kraft)
for x in [-1.425,1.425]:
 box('Side_return_left' if x<0 else 'Side_return_right',(x,2.1,0),(.018,3.8,1.43),kraft)
 box('Rear_glue_lap',(x*.97,2.1,.675),(.075,3.75,.018),kraft)
 # Visible score line / folded double rim at front edge.
 box('Folded_front_hem',(x*.985,2.1,-.706),(.032,3.8,.028),edge)
# Five open-top bulk trays, share the exact existing sloped stock datum.
a=-math.pi/15
for row in range(5):
 y=.615+row*.7
 def traypart(name,x,yy,z,size,material):
  # Transform local tray coordinates to store coordinates.
  return box(f'Tray_{row}_{name}',(x,y+yy*math.cos(a)-z*math.sin(a),yy*math.sin(a)+z*math.cos(a)),size,material,a)
 traypart('deck',0,-.009,0,(2.80,.018,1.44),kraft)
 traypart('front_fold',0,.065,-.711,(2.80,.15,.018),kraft)
 traypart('rear_fold',0,.07,.711,(2.80,.16,.018),kraft)
 for x in [-1.389,1.389]:
  traypart('side_fold',x,.07,0,(.018,.16,1.42),kraft)
  traypart('locking_tab',x*.97,-.055,.54,(.11,.11,.02),edge)
 # Open flute relief on the visible cut lip; joined into one runtime role.
 for i in range(70):
  traypart('cut_flute',-1.37+i*.0397,.142,-.711,(.018,.005,.014),edge)
# Stable folded plinth, hollow with internal cross web.
for z in [-.74,.74]:box('Plinth_fold',(0,.13,z),(2.94,.26,.02),kraft)
for x in [-1.46,1.46,0]:box('Plinth_web',(x,.13,0),(.02,.26,1.5),kraft)
box('Plinth_top',(0,.269,0),(2.94,.018,1.5),kraft)
# Rear host: two upright rails with paired steel saddles through rear folds.
for x in [-1.25,1.25]:
 box('Host_rear_rail',(x,1.98,.755),(.045,3.9,.045),steel)
 for y in [1,3.45]:
  box('Rear_saddle_bridge',(x,y,.779),(.14,.07,.018),steel)
  for xx in [x-.063,x+.063]:box('Saddle_return',(xx,y,.735),(.014,.07,.09),steel)
 box('Host_base_foot',(x,.023,0),(.12,.046,1.58),steel)
# Separate blank header face: live generic print installed by consumer.
box('Header_folded_blank',(0,4.23,.675),(2.82,.48,.028),kraft)
box('Header_print_face',(0,4.23,.656),(2.72,.38,.006),art)
for name,p in [('Anchor_Header',(0,4.23,.65)),('Anchor_RearAttachment',(0,3.45,.78))]+[(f'Anchor_StockRow_{r}',(0,.615+r*.7,0)) for r in range(5)]:
 o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);o.location=(p[0],-p[2],p[1]);o.empty_display_size=.08
for o in parts:
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.uv.smart_project(island_margin=.015);bpy.ops.object.mode_set(mode='OBJECT')
 bm=bmesh.new();bm.from_mesh(o.data);assert all(e.is_manifold for e in bm.edges),o.name;bm.free()
 # Physical-scale planar fiber UVs. Header face retains full-face print UV.
 uv=o.data.uv_layers.active.data
 for poly in o.data.polygons:
  axis=max(range(3),key=lambda k:abs(poly.normal[k])); axes=[k for k in range(3) if k!=axis]
  for li in poly.loop_indices:
   v=o.data.vertices[o.data.loops[li].vertex_index].co
   uv[li].uv=(v[axes[0]]*8,v[axes[1]]*8)
   if o.name=='Header_print_face' and axis==1:uv[li].uv=(.5-v.x/2.72,.5+v.z/.38)
 o['provenance']='Original generic; estimated dimensions';o['units']='feet'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/candy-power-wing.blend'))
merged=[]
subsets=[(m,[o for o in parts if o.data.materials[0]==m]) for m in [kraft,edge,steel,art]]
for material,subset in subsets:
 bpy.ops.object.select_all(action='DESELECT')
 for o in subset:o.select_set(True)
 bpy.context.view_layer.objects.active=subset[0];bpy.ops.object.join();bpy.context.object.name=material.name;merged.append(bpy.context.object)
bpy.ops.object.select_all(action='DESELECT')
for o in merged:o.select_set(True)
for o in scene.objects:
 if o.type=='EMPTY':o.select_set(True)
path=ROOT/'public/models/candy-power-wing.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_extras=True)
tri=0
for o in merged:o.data.calc_loop_triangles();tri+=len(o.data.loop_triangles)
points=[o.matrix_world@v.co for o in merged for v in o.data.vertices]
mins=[min(p[k] for p in points) for k in range(3)];maxs=[max(p[k] for p in points) for k in range(3)]
metrics={'triangles':tri,'primitives':4,'bytes':path.stat().st_size,'textureImages':3,'textureResolution':[256,256],'boundsFeet':{'min':[mins[0],mins[2],-maxs[1]],'max':[maxs[0],maxs[2],-mins[1]]},'stock':'Existing five catalog rows, 175 cartons; unchanged geometry and transforms'}
(ROOT/'tools/models/candy-power-wing-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n');print(metrics)
