"""Original generic industrial luminaires, scripted Blender authoring.
Run: blender -b -t 2 -P tools/models/ceiling-luminaire.py
Coordinates are feet, Z up; glTF maps to store Y up. Origin: ceiling contact.
"""
from pathlib import Path
import bpy, bmesh, math, json
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
roles={}
for name,c,metal,rough in [('OuterPaint',(.78,.79,.76,1),.12,.36),('InnerReflector',(.88,.9,.92,1),.55,.24),('Hardware',(.24,.27,.29,1),.75,.32),('Lamp',(.95,.96,1,1),0,.28)]:
 m=bpy.data.materials.new(name);m.diffuse_color=c;m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=c;p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if name=='Lamp':p.inputs['Emission Color'].default_value=c;p.inputs['Emission Strength'].default_value=1.4
 roles[name]=m

def finish(obj,role):
 obj.data.materials.append(roles[role]);bpy.context.view_layer.objects.active=obj
 bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
 if not obj.data.uv_layers:
  bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.03);bpy.ops.object.mode_set(mode='OBJECT')
 obj.parent=parent
 return obj

def box(name,loc,size,role='OuterPaint'):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 mod=o.modifiers.new('Eased fabrication edges','BEVEL');mod.width=.018;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name)
 return finish(o,role)

def lathe(name,profile,role):
 n=48;v=[(r*math.cos(2*math.pi*j/n),r*math.sin(2*math.pi*j/n),z) for r,z in profile for j in range(n)];f=[]
 for i in range(len(profile)):
  k=(i+1)%len(profile)
  for j in range(n):f.append((i*n+j,i*n+(j+1)%n,k*n+(j+1)%n,k*n+j))
 me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o)
 uv=me.uv_layers.new(name='TurnedProfileUV')
 for i,p in enumerate(me.polygons):
  row,j=divmod(i,n)
  for li,co in zip(p.loop_indices,[(j/n,row/len(profile)),((j+1)/n,row/len(profile)),((j+1)/n,(row+1)/len(profile)),(j/n,(row+1)/len(profile))]):uv.data[li].uv=co
  p.use_smooth=True
 return finish(o,role)

def tube(name,r,top,bottom,role='Hardware'):
 return lathe(name,[(r,top),(r,bottom),(.001,bottom),(.001,top)],role)

stats={}
for variant in ['dome','directional']:
 parent=bpy.data.objects.new(variant,None);bpy.context.collection.objects.link(parent);parent['units']='feet';parent['confidence']='LOW: exploratory proportions, not electrically accurate';parent['attachment']='origin, ceiling underside';parent['beam_axis']='local -Z; directional head pitched 25 degrees'
 box('Ceiling_contact',(0,0,-.04),(.38,.34,.08),'Hardware');tube('Attachment_stem',.045,-.08,-.42)
 if variant=='dome':
  box('Ballast_box',(0,0,-.58),(.46,.4,.34));box('Ballast_lid',(0,0,-.405),(.5,.44,.035),'Hardware');tube('Socket_neck',.14,-.75,-1.08)
  outer=[(.14,-1.04),(.2,-1.10),(.25,-1.25),(.34,-1.44),(.46,-1.61),(.61,-1.79),(.735,-1.89),(.75,-1.92),(.748,-1.945),(.727,-1.96)]
  inner=[(.715,-1.93),(.60,-1.82),(.44,-1.64),(.32,-1.46),(.23,-1.27),(.18,-1.12),(.12,-1.08)]
  shade=lathe('Spun_bell_with_rolled_lip',outer+inner,'OuterPaint');shade.data.materials.append(roles['InnerReflector'])
  for p in shade.data.polygons:
   if p.index//48>=9:p.material_index=1
  tube('Recessed_lamp',.16,-1.19,-1.36,'Lamp')
  lamp=(0,0,-1.37)
 else:
  box('Yoke_bridge',(0,0,-.45),(.70,.13,.12),'Hardware')
  for x in [-.30,.30]:
   box('Yoke_arm', (x,0,-.64),(.09,.13,.38),'Hardware')
   pin=tube('Pivot_bolt',.07,.09,-.09);pin.rotation_euler.y=math.pi/2;pin.location=(math.copysign(.265,x),0,-.78)
  pivot=bpy.data.objects.new('Adjustable_head_joint',None);bpy.context.collection.objects.link(pivot);pivot.parent=parent;pivot.location=(0,0,-.78);pivot.rotation_euler.x=math.radians(25)
  shell=lathe('Directional_reflector_shell',[(.17,.20),(.20,.12),(.23,-.04),(.32,-.24),(.37,-.38),(.37,-.405),(.35,-.42),(.33,-.38),(.29,-.24),(.20,-.04),(.17,.12),(.14,.18)],'OuterPaint');shell.parent=pivot;shell.data.materials.append(roles['InnerReflector'])
  for p in shell.data.polygons:
   if p.index//48>=6:p.material_index=1
  bulb=tube('Directional_lamp',.105,.03,-.09,'Lamp');bulb.parent=pivot
  lamp=(0,.04,-.87)
 anchor=bpy.data.objects.new(variant+'_Lamp_anchor',None);bpy.context.collection.objects.link(anchor);anchor.parent=parent;anchor.location=lamp
 bpy.context.view_layer.update();bpy.ops.object.select_all(action='DESELECT');parent.select_set(True)
 meshes=[]
 for o in parent.children_recursive:
  o.select_set(True)
  if o.type=='MESH':
   meshes.append(o);bm=bmesh.new();bm.from_mesh(o.data);assert all(e.is_manifold for e in bm.edges),o.name;bm.free();o.data.calc_loop_triangles()
 out=ROOT/f'public/models/ceiling-luminaire-{variant}.glb'
 bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_extras=True)
 coords=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
 stats[variant]={'triangles':sum(len(o.data.loop_triangles) for o in meshes),'parts':len(meshes),'material_primitives':sum(len(o.data.materials) for o in meshes),'bytes':out.stat().st_size,'bounds_blender_feet':[[min(v[i] for v in coords) for i in range(3)],[max(v[i] for v in coords) for i in range(3)]],'all_parts_manifold':True,'all_parts_uv':True}
 parent.location.x=0 if variant=='dome' else 2
scene=bpy.context.scene;scene.unit_settings.system='IMPERIAL';scene.unit_settings.scale_length=.3048;scene.unit_settings.length_unit='FEET'
bpy.ops.object.select_all(action='SELECT')
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=6;area.spaces.active.region_3d.view_location=(.7,0,-.9)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/ceiling-luminaire.blend'))
(ROOT/'docs/ceiling-luminaire-cost.json').write_text(json.dumps(stats,indent=2)+'\n')
print(json.dumps(stats))
