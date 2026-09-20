"""Original enclosed returns millwork. Feet, glass at local z=0.
Reuses the main counter's authored joinery profile and material roles.
Run with Blender: blender -b -t 2 -P tools/models/exit-return-counter.py
"""
from pathlib import Path
import json
import bpy
ROOT=Path(__file__).resolve().parents[2]
# Reuse the established authoring functions without running its variant exports.
source=(ROOT/'tools/models/checkout-counter.py').read_text()
exec(compile(source.split('\ndef shield(')[0],str(ROOT/'tools/models/checkout-counter.py'),'exec'))
parts=[]
parts.append(sweep('Continuous blue customer rim',[(-7.75,-4.8),(-7.75,-7.4),(2.75,-7.4),(7.75,-4.4),(7.75,0),(-7.75,0),(-7.75,-1.6)],.8))
parts.append(sweep('Lower white window-side work shelf',[(3.5,-.8),(-6.95,-.8)],1.4,island=True))
parts.append(sweep('Lower white inner sorting shelf',[(-6.95,-6.6),(2.0,-6.6)],1.3,island=True))
# Generic enclosed return receiver above the window shelf: a real dark mouth,
# sloping hood and separate lower tray. No copied lettering or graphics.
def solid(name,outline,z0,z1,mat):
 n=len(outline);vertices=[(x-4.5,-z,y) for y in (z0,z1) for x,z in outline]
 faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.materials.append(MATERIALS[mat]);mesh.update()
 ob=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(ob)
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));assert all(e.is_manifold for e in bm.edges);bm.to_mesh(mesh);bm.free()
 bpy.context.view_layer.objects.active=ob;ob.select_set(True)
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT');ob.select_set(False)
 parts.append(ob);return ob
solid('Quick return receiver left cheek',[(-1.15,-.84),(-1.06,-.84),(-1.06,-1.95),(-1.15,-1.95)],2.82,3.52,3)
solid('Quick return receiver right cheek',[(1.06,-.84),(1.15,-.84),(1.15,-1.95),(1.06,-1.95)],2.82,3.52,3)
solid('Quick return receiver sill',[(-1.06,-.84),(1.06,-.84),(1.06,-1.95),(-1.06,-1.95)],2.82,2.90,3)
solid('Quick return dark interior',[(-1.06,-.86),(1.06,-.86),(1.06,-.94),(-1.06,-.94)],2.90,3.43,5)
solid('Quick return receiver hood',[(-1.15,-.84),(1.15,-.84),(1.15,-1.95),(-1.15,-1.95)],3.43,3.52,3)
scene=bpy.context.scene;scene.unit_settings.system='IMPERIAL';scene.unit_settings.scale_length=.3048
scene['construction']='Enclosed returns millwork with an open staff aisle, lower inner worktops and generic return receiver. Original proportions; not a surveyed store.'
bpy.context.preferences.filepaths.save_version=0
for ob in bpy.context.selected_objects:ob.select_set(False)
for ob in parts:ob.select_set(True)
bpy.context.view_layer.objects.active=parts[0]
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=22;area.spaces.active.region_3d.view_location=(0,3.5,1.6)
metrics={'boundsFeet':[15.5,7.4,3.54],'parts':len(parts),'triangles':sum(len(p.vertices)-2 for ob in parts for p in ob.data.polygons),'allSolidPartsManifold':True,'worktopHeightFeet':2.82,'staffOpeningFeet':3.2}
(ROOT/'tools/models/exit-return-counter-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/exit-return-counter.blend'),compress=True)
bpy.ops.object.join();bpy.context.object.name='ExitReturnCounter'
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/exit-return-counter.glb'),export_format='GLB',use_selection=True,export_yup=True)
print(json.dumps(metrics))
