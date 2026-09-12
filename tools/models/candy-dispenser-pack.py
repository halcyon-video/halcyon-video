"""Original generic candy dispenser, feet. blender -b -P tools/models/candy-dispenser-pack.py"""
import bpy, bmesh, math, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
# Numerical Blender unit = one foot, exported unchanged; store X/right Y/up Z/front.
bpy.context.scene.unit_settings.system = 'IMPERIAL'
bpy.context.scene.unit_settings.scale_length = .3048
bpy.context.scene.unit_settings.length_unit = 'FEET'
def material(name, color, rough=.5):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=rough
 return m
card=material('PackCard',(.12,.22,.38)); stem=material('DispenserStem',(.1,.42,.5),.28)
cap=material('DispenserCap',(.9,.55,.12),.25); seam=material('HingeDetail',(.12,.13,.15))
clear=material('ClearBlister',(.88,.96,1),.13)
p=clear.node_tree.nodes.get('Principled BSDF'); p.inputs['Transmission Weight'].default_value=.85; p.inputs['IOR'].default_value=1.46
parts=[]
def box(name, pos, size, mat, bevel=0):
 x,y,z=pos; w,h,d=size
 bpy.ops.mesh.primitive_cube_add(size=1,location=(x,-z,y)); o=bpy.context.object; o.name=name; o.dimensions=(w,d,h)
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  mod=o.modifiers.new('Molded edge radius','BEVEL'); mod.width=bevel; mod.segments=2
  bpy.ops.object.modifier_apply(modifier=mod.name)
 o.data.materials.append(mat); parts.append(o); return o
# Die-cut 0.024 inch paperboard, with a real through-hole (not a painted dot).
c=box('Die_cut_hanging_card',(0,7/24,0),(2.5/12,7/12,.002),card,.007)
bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.012,depth=.02,location=(0,0,.550),rotation=(math.pi/2,0,0))
cutter=bpy.context.object; bpy.context.view_layer.objects.active=c
mod=c.modifiers.new('Punched peg hole','BOOLEAN'); mod.operation='DIFFERENCE'; mod.object=cutter
bpy.ops.object.modifier_apply(modifier=mod.name); bpy.data.objects.remove(cutter,do_unlink=True)
box('Rectangular_dispenser_stem',(0,.231,.030),(.056,.335,.038),stem,.005)
box('Molded_base_foot',(0,.061,.03),(.082,.020,.047),stem,.004)
box('Cap_lower_rim',(0,.403,.031),(.079,.014,.047),seam,.003)
box('Original_rounded_cap_no_character',(0,.438,.031),(.086,.055,.049),cap,.012)
box('Rear_hinge_knuckle',(0,.408,.010),(.044,.018,.012),cap,.004)
# Thermoformed open-backed cup: rounded rectangular rings, flange, shoulder,
# crown and an actual .0008 ft wall. Solidify closes the flange edge.
def ring(w,h,r,z,cy=.256):
 out=[]
 for cx,yy,a in [(w/2-r,h/2-r,0),(-w/2+r,h/2-r,90),(-w/2+r,-h/2+r,180),(w/2-r,-h/2+r,270)]:
  for j in range(5):
   t=math.radians(a+j*90/4); out.append((cx+r*math.cos(t),-z,cy+yy+r*math.sin(t)))
 return out
rings=[ring(.184,.464,.019,.0018),ring(.160,.438,.023,.0022),ring(.132,.420,.032,.054),ring(.111,.397,.036,.064)]
verts=sum(rings,[]); n=20; faces=[]
for k in range(3):
 for j in range(n): faces.append((k*n+j,k*n+(j+1)%n,(k+1)*n+(j+1)%n,(k+1)*n+j))
faces.append(tuple(range(3*n,4*n)))
mesh=bpy.data.meshes.new('Thermoformed_shell_topology'); mesh.from_pydata(verts,[],faces); mesh.update()
o=bpy.data.objects.new('Clear_bubble_with_heat_seal_flange',mesh); bpy.context.collection.objects.link(o); o.data.materials.append(clear); parts.append(o)
bpy.context.view_layer.objects.active=o; o.select_set(True)
mod=o.modifiers.new('PET wall thickness','SOLIDIFY'); mod.thickness=.0008; mod.offset=-1
bpy.ops.object.modifier_apply(modifier=mod.name)
for ob in parts:
 bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active=ob
 bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.uv.smart_project(island_margin=.015); bpy.ops.object.mode_set(mode='OBJECT')
 bm=bmesh.new(); bm.from_mesh(ob.data); assert all(e.is_manifold for e in bm.edges),ob.name; bm.free()
 ob['units']='feet'; ob['provenance']='Original generic design; estimate, not photographic reconstruction'
# The card front uses planar full-card UVs so house printing is independent.
uv=c.data.uv_layers.active.data
for poly in c.data.polygons:
 if abs(poly.normal.y)>.9:
  for li in poly.loop_indices:
   v=c.matrix_world @ c.data.vertices[c.data.loops[li].vertex_index].co
   u=v.x/(2.5/12)+.5
   uv[li].uv=(1-u if poly.normal.y>0 else u,v.z/(7/12))
for name,pos in [('Anchor_PegHole',(0,0,.550)),('Anchor_CardBottom',(0,0,0)),('Anchor_CapHinge',(0,-.010,.408))]:
 ob=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(ob); ob.location=pos; ob.empty_display_size=.025
bpy.context.scene['contract']='One numeric unit = 1 foot; Blender (x,-store_z,store_y). Origin bottom center of card; front +store_z. No internal mechanism.'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/candy-dispenser-pack.blend'))
# Merge only runtime pieces by material; source keeps named editable components.
merged=[]
subsets=[(mat,[o for o in parts if o.data.materials[0]==mat]) for mat in [card,stem,cap,seam,clear]]
for mat,subset in subsets:
 bpy.ops.object.select_all(action='DESELECT')
 for o in subset:o.select_set(True)
 bpy.context.view_layer.objects.active=subset[0]; bpy.ops.object.join(); o=bpy.context.object; o.name=mat.name; merged.append(o)
bpy.ops.object.select_all(action='DESELECT')
for o in merged:o.select_set(True)
for o in bpy.context.scene.objects:
 if o.type=='EMPTY':o.select_set(True)
path=ROOT/'public/models/candy-dispenser-pack.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_texcoords=True,export_normals=True,export_extras=True)
triangles=0
for o in merged:o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
metrics={'triangles':triangles,'primitives':len(merged),'bytes':path.stat().st_size,'textures':0,'dimensionsFeet':[2.5/12,7/12,.065],'pegHoleFeet':[0,.550,0]}
(ROOT/'tools/models/candy-dispenser-pack-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
print(metrics)
