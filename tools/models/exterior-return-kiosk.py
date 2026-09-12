"""Original generic tape return. Feet; Blender (x,-store_z,height). No photo-derived art.
Reproduce: blender -b -t 2 -P tools/models/exterior-return-kiosk.py
Hood pitch/depth are design estimates constrained by the existing 1.3 ft footprint.
"""
import bpy, bmesh, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
def material(name,color,metal=0,rough=.55):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
 return m
body=material('KioskEnamel',(.72,.75,.70),.25)
trim=material('KioskTrim',(.035,.085,.12),.25)
hardware=material('KioskHardware',(.32,.34,.35),.75,.32)
dark=material('KioskRecess',(.012,.017,.02),0,.85)
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
box('Recessed steel plinth',-.54,.54,0,.16,-.53,.53,dark)
box('Base folded pan',-.61,.61,.16,.22,-.59,.59,trim)
for side,a,b in [('Left',-.61,-.58),('Right',.58,.61)]:
 box(side+' cabinet cheek',a,b,.22,2.76,-.59,.57,body)
box('Front lower skin',-.58,.58,.22,2.37,.54,.57,body)
# Real open receiving mouth, surrounded by four fitted jambs, with a recessed baffle.
box('Slot left jamb',-.58,-.46,2.37,2.76,.54,.57,body)
box('Slot right jamb',.46,.58,2.37,2.76,.54,.57,body)
box('Slot upper lintel',-.46,.46,2.61,2.76,.54,.57,trim)
profile('Sloped receiving sill',-.46,.46,[(2.365,.30),(2.365,.61),(2.40,.61),(2.43,.30)],hardware,.003)
box('Recessed anti reach flap',-.46,.46,2.40,2.62,.28,.30,dark,.003)
# Rear service frame and inset gasket, with real perimeter reveal.
box('Rear door gasket',-.58,.58,.22,2.76,-.587,-.55,dark)
box('Rear service door',-.55,.55,.27,2.71,-.607,-.587,body,.008)
for h in [.65,2.25]:
 box('Hinge leaf '+str(h),-.565,-.43,h-.08,h+.08,-.622,-.607,hardware,.002)
 bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.026,depth=.19,location=(-.554,.622,h))
 ob=bpy.context.object; ob.name='Hinge barrel '+str(h); ob.data.materials.append(hardware); ob.select_set(False); parts.append(ob)
box('Latch escutcheon',.39,.49,1.39,1.55,-.63,-.607,hardware,.006)
box('Latch keyway',.434,.446,1.435,1.485,-.633,-.63,dark,.001)
# Continuous folded canted hood: closed thin section, downward drip at front.
profile('Canted hood folded sheet',-.65,.65,[(2.77,-.65),(3.20,-.65),(3.20,-.61),(2.87,.65),(2.78,.65),(2.78,.61),(2.835,.61),(3.155,-.61),(2.77,-.61)],trim,.003)
for name,a,b in [('Left hood closure',-.625,-.605),('Right hood closure',.605,.625)]:
 profile(name,a,b,[(2.76,-.60),(3.15,-.60),(2.83,.60),(2.76,.60)],body,.003)
box('Header plaque',-.48,.48,1.87,2.18,.57,.582,trim,.004)
# Generic copy only, converted to runtime mesh; editable text remains in source.
bpy.ops.object.text_add(location=(0,-.585,1.975),rotation=(1.57079632679,0,0))
label=bpy.context.object; label.name='Generic RETURNS lettering'; label.data.body='RETURNS'; label.data.align_x='CENTER'; label.data.size=.155; label.data.extrude=0; label.data.materials.append(body); label.select_set(False)
scene=bpy.context.scene; scene.unit_settings.system='IMPERIAL'; scene.unit_settings.scale_length=.3048
scene['provenance']='Original generic design, no original QuikDrop reference available; hood pitch and depth estimated. No chain branding.'
scene['dimensions_ft']='1.3 W x 3.2 H x 1.3 D'; scene['front']='store +Z'; scene['origin']='ground center'; scene['moving_parts']='Static closed service door; hinge axis shown, no interaction added.'
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':
  area.spaces.active.region_3d.view_distance=5
  area.spaces.active.region_3d.view_location=Vector((0,0,1.6))
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/exterior-return-kiosk.blend'))
# Runtime grouped by finish, retaining separate named physical parts in source.
label.select_set(True); bpy.context.view_layer.objects.active=label; bpy.ops.object.convert(target='MESH'); label=bpy.context.object
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(); bpy.ops.object.mode_set(mode='OBJECT'); label.select_set(False); parts.append(label)
source_parts=len(parts)
for mat in [body,trim,hardware,dark]:
 obs=[o for o in scene.objects if o.type=='MESH' and o.data.materials[0]==mat]
 for o in obs:o.select_set(True)
 bpy.context.view_layer.objects.active=obs[0]; bpy.ops.object.join(); bpy.context.object.name=mat.name; bpy.context.object.select_set(False)
obs=[o for o in scene.objects if o.type=='MESH']
for o in obs:
 o.data.calc_loop_triangles(); assert o.data.uv_layers
path=ROOT/'public/models/exterior-return-kiosk.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_extras=True)
metrics={'triangles':sum(len(o.data.loop_triangles) for o in obs),'material_batches':len(obs),'textures':0,'glb_bytes':path.stat().st_size,'dimensions_ft':[1.3,3.2,1.3],'hood_depth_confidence':'estimated, not measured from original reference','source_parts':source_parts}
(ROOT/'tools/models/exterior-return-kiosk-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
print(metrics)
