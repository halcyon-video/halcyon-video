"""Original exit-side reshelving counter. Feet, Blender (x,-store_z,height).
Owner design: diagonal counter forms passage; rental cases rest on employee top.
Reproduce: blender -b -t 2 -P tools/models/exit-return-counter.py
"""
import bpy,bmesh,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
roles={}
for name,color in [('ReturnBody',(.87,.86,.81)),('ReturnTop',(.08,.14,.30)),('ReturnWorktop',(.87,.86,.81)),('ReturnPlinth',(.06,.06,.06))]:
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*color,1)
 m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.48
 roles[name]=m
parts=[]
def panel(name,x0,x1,y0,y1,z0,z1,role,bevel=.008):
 return prism(name,[(x0,y0),(x1,y0),(x1,y1),(x0,y1)],z0,z1,role,bevel)
def prism(name,outline,z0,z1,role,bevel=.008):
 # Closed fitted solid slabs and panels with finished ends.
 n=len(outline);verts=[(x,y,z) for z in (z0,z1) for x,y in outline]
 faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
 o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);me.materials.append(roles[role])
 bpy.context.view_layer.objects.active=o;o.select_set(True)
 mod=o.modifiers.new('Eased finished edges','BEVEL');mod.width=bevel;mod.segments=2
 bpy.ops.object.modifier_apply(modifier=mod.name)
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);assert all(e.is_manifold for e in bm.edges),name;bm.to_mesh(me);bm.free()
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT');o.select_set(False);parts.append(o)
# 15.5-ft run, 2.5-ft depth, 3.25-ft finished top. Customer side = Blender +Y.
# Staff side has open shelves, recessed toe space and a lower worktop strip.
prism('Recessed plinth',[(-7.60,-1.10),(7.60,-1.10),(7.60,-.78),(5.55,1.10),(-7.60,1.10)],0,.22,'ReturnPlinth')
panel('Continuous customer panel',-7.65,5.55,1.10,1.18,.22,3.10,'ReturnBody')
prism('Tapered exit end panel',[(5.55,1.18),(7.73,-.72),(7.65,-.80),(5.55,1.10)],.22,3.10,'ReturnBody')
for x in [-7.73,-3.87,-.02,3.83]:
 panel('Cabinet end or division',x,x+.08,-1.18,1.10,.22,3.10,'ReturnBody')
panel('Closed tapered end',7.65,7.73,-1.18,-.80,.22,3.10,'ReturnBody')
for z in [.22,1.22,2.20]:prism('Tapered staff shelf',[(3.91,-1.14),(7.65,-1.14),(7.65,-.80),(5.55,1.10),(3.91,1.10)],z,z+.065,'ReturnWorktop')
for lo,hi in [(-7.65,-3.87),(-3.79,-.02),(.06,3.83)]:
 for z in [.22,1.22,2.20]:panel('Staff shelving',lo,hi,-1.14,1.10,z,z+.065,'ReturnWorktop')
prism('Continuous tapered counter slab',[(-7.75,-1.25),(7.75,-1.25),(7.75,-.65),(5.75,1.25),(-7.75,1.25)],3.10,3.25,'ReturnTop',.024)
# A flush inset strip marks the employee preparation surface without a fake seam.
# Top remains continuous; rental stacks are separate runtime store-copy meshes.
scene=bpy.context.scene;scene.unit_settings.system='IMPERIAL';scene.unit_settings.scale_length=.3048
scene['provenance']='Original unbranded millwork for owner-described exit-side preparation counter; no copied signs or artwork.'
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0]
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=19;area.spaces.active.region_3d.view_location=(0,0,1.6)
metrics={'boundsFeet':[15.5,2.5,3.25],'parts':len(parts),'triangles':sum(len(p.vertices)-2 for o in parts for p in o.data.polygons),'allSolidPartsManifold':True}
(ROOT/'tools/models/exit-return-counter-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/exit-return-counter.blend'))
bpy.ops.object.join();bpy.context.object.name='ExitReturnCounter'
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/exit-return-counter.glb'),export_format='GLB',use_selection=True,export_yup=True)
print(json.dumps(metrics))
