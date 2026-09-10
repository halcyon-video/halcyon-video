"""Original queue rack; Blender mesh authoring. Run: blender -b --python tools/models/candy-rack.py"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for block in list(bpy.data.materials): bpy.data.materials.remove(block)
def material(name, color, metal, rough):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
 return m
steel=material('RackSteel',(0.025,0.025,0.025),0.75,0.45)
rubber=material('RackFeet',(0.012,0.012,0.012),0,0.85)
# Author in (store x, -store z, store height); Y-up glTF becomes store xyz.
def wire(name, points, radius, mat=steel, sides=8):
 pts=[Vector((x,-z,y)) for x,y,z in points]; vertices=[]; faces=[]; previous_u=None
 for i,p in enumerate(pts):
  tangent=(pts[min(i+1,len(pts)-1)]-pts[max(i-1,0)]).normalized()
  u=tangent.cross(Vector((0,0,1)))
  if u.length<0.01: u=tangent.cross(Vector((0,1,0)))
  u.normalize()
  if previous_u is not None and u.dot(previous_u)<0: u=-u
  previous_u=u.copy(); v=tangent.cross(u).normalized()
  for j in range(sides): vertices.append(p+radius*(u*math.cos(j*2*math.pi/sides)+v*math.sin(j*2*math.pi/sides)))
 for i in range(len(pts)-1):
  for j in range(sides): faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
 faces.extend([tuple(reversed(range(sides))),tuple((len(pts)-1)*sides+j for j in range(sides))])
 mesh=bpy.data.meshes.new(name); mesh.from_pydata(vertices,[],faces); mesh.update()
 ob=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(ob); ob.data.materials.append(mat)
 return ob
# Rounded continuous bent tube side hoops, not intersecting vertical primitives.
frame=[]
for x in [-1.43,1.43]:
 pts=[(x,.085,-.28),(x,3.72,-.28)]
 for i in range(1,9):
  t=math.pi-i*math.pi/8; pts.append((x,3.72+.28*math.sin(t),.28*math.cos(t)))
 pts.extend([(x,3.72,.28),(x,.085,.28)])
 frame.append(wire('Bent_side_hoop',pts,.028))
 frame.append(wire('Sled_foot',[(x,.07,-.29),(x,.07,.29)],.038))
 for z in [-.26,.26]: frame.append(wire('Nonmarking_foot',[(x,.035,z-.045),(x,.035,z+.045)],.035,rubber))
for y in [.25,3.70]: frame.append(wire('Rear_cross_tie',[(-1.43,y,.27),(1.43,y,.27)],.022))
frame.append(wire('Rear_diagonal_brace',[(-1.43,.25,.27),(1.43,3.70,.27)],.016))
# Tray local coordinates: upper support plane is y=0; runtime supplies slope.
tray=[]
# Thin sheet support with rounded folded edge; retainers are actual bent wires.
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,-.013))
ob=bpy.context.object; ob.name='Folded_tray_deck'; ob.dimensions=(2.84,.54,.026)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
bevel=ob.modifiers.new('Rolled_sheet_edges','BEVEL'); bevel.width=.009; bevel.segments=2
bpy.context.view_layer.objects.active=ob; bpy.ops.object.modifier_apply(modifier=bevel.name); ob.data.materials.append(steel); tray.append(ob)
# U-shaped front retainer, curved in plan with two return legs anchored at rear.
points=[(-1.38,.10,.24),(-1.38,.10,-.21)]
for i in range(1,5):
 t=math.pi+i*math.pi/8; points.append((-1.33+.05*math.cos(t),.10,-.21+.05*math.sin(t)))
points.append((1.33,.10,-.26))
for i in range(1,5):
 t=-math.pi/2+i*math.pi/8; points.append((1.33+.05*math.cos(t),.10,-.21+.05*math.sin(t)))
points.append((1.38,.10,.24)); tray.append(wire('Bent_front_retainer',points,.012))
for x in [-1.38,-.92,-.46,0,.46,.92,1.38]:
 tray.append(wire('Retainer_welded_stanchion',[(x,-.012,-.25),(x,.10,-.25)],.009,sides=6))
for x in [-1.38,1.38]:
 tray.append(wire('Rear_return_leg',[(x,-.012,.24),(x,.10,.24)],.012))
# Smart UVs, named source parts remain editable; export merges by material only.
for ob in frame+tray:
 bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active=ob
 bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(island_margin=.02); bpy.ops.object.mode_set(mode='OBJECT')
 for poly in ob.data.polygons: poly.use_smooth=len(poly.vertices)==4 and ob.name!='Folded_tray_deck'
 ob['units']='feet'; ob['provenance']='Original generic fixture; dimensions from existing CandyDisplay contract'
# Assemble the editable source from linked physical parts; retain a tray template.
preview=[]
for r in range(5):
 for ob in tray:
  copy=ob.copy(); copy.data=ob.data; bpy.context.collection.objects.link(copy)
  copy.name=f'Tier_{r+1}_'+ob.name
  from mathutils import Matrix
  copy.matrix_world=Matrix.Translation((0,0,.615+r*.7)) @ Matrix.Rotation(-math.pi/15,4,'X') @ ob.matrix_world
  preview.append(copy)
for ob in tray: ob.hide_set(True)
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':
  area.spaces.active.region_3d.view_distance=7
  area.spaces.active.region_3d.view_location=(0,0,2)
# Closed solid components must be manifold, and every part has UVs.
import bmesh
for ob in frame+tray:
 bm=bmesh.new(); bm.from_mesh(ob.data)
 assert all(edge.is_manifold for edge in bm.edges), ob.name
 bm.free()
 assert ob.data.uv_layers.active is not None, ob.name
source=ROOT/'tools/models/candy-rack.blend'
bpy.context.scene.unit_settings.system='NONE'
bpy.ops.wm.save_as_mainfile(filepath=str(source))
for ob in preview: bpy.data.objects.remove(ob,do_unlink=True)
for ob in tray: ob.hide_set(False)
metrics={}
for name,parts in [('frame',frame),('tray',tray)]:
 bpy.ops.object.select_all(action='DESELECT')
 for ob in parts: ob.select_set(True)
 # Join by role for minimal draw calls; source above keeps component names.
 merged=[]
 subsets=[(mat,[ob for ob in parts if ob.data.materials[0]==mat]) for mat in [steel,rubber]]
 for mat,subset in subsets:
  if not subset: continue
  bpy.ops.object.select_all(action='DESELECT')
  for ob in subset: ob.select_set(True)
  bpy.context.view_layer.objects.active=subset[0]; bpy.ops.object.join(); obj=bpy.context.object; obj.name='CandyRack_'+name+'_'+mat.name; merged.append(obj)
 bpy.ops.object.select_all(action='DESELECT')
 for ob in merged: ob.select_set(True)
 target=ROOT/f'public/models/candy-rack-{name}.glb'
 bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,export_yup=True,export_texcoords=True,export_normals=True,export_materials='EXPORT')
 tris=0
 for ob in merged: ob.data.calc_loop_triangles(); tris+=len(ob.data.loop_triangles)
 metrics[name]={'triangles':tris,'materials':len(merged),'bytes':target.stat().st_size,'textures':0}
(ROOT/'tools/models/candy-rack-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
print('CANDY_RACK_METRICS',json.dumps(metrics))
