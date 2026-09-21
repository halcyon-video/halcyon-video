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
RECEIVER_X=5.6
OPEN_HALF=1.18
# Pin 213: both the upper customer rim and the lower work shelf stop at the
# rectangular return opening. The old continuous blue rim crossed the ramp.
parts.append(sweep('Continuous blue customer rim right',[(7.75,-2.4),(7.75,0),(RECEIVER_X+OPEN_HALF,0)],.8))
parts.append(sweep('Continuous blue customer rim left',[(RECEIVER_X-OPEN_HALF,0),(-7.75,0),(-7.75,-5.75),(-2,-11.5),(3.25,-6.25)],.8))
parts.append(sweep('Lower white window-side work shelf right',[(6.95,-.8),(RECEIVER_X+OPEN_HALF,-.8)],1.4,island=True))
parts.append(sweep('Lower white window-side work shelf left',[(RECEIVER_X-OPEN_HALF,-.8),(-6.95,-.8)],1.4,island=True))
parts.append(sweep('Lower white inner sorting shelf',[(-6.95,-5.35),(-2,-10.3),(2.4,-5.9)],1.3,island=True))
# Through-window receiver at the left end when viewed from the staff side.
# The runtime fits its front endpoint to the glazing and adds outward window vinyl.
def solid(name,outline,z0,z1,mat):
 n=len(outline);vertices=[(x+RECEIVER_X,-z,y) for y in (z0,z1) for x,z in outline]
 faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.materials.append(MATERIALS[mat]);mesh.update()
 ob=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(ob)
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));assert all(e.is_manifold for e in bm.edges);bm.to_mesh(mesh);bm.free()
 bpy.context.view_layer.objects.active=ob;ob.select_set(True)
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT');ob.select_set(False)
 parts.append(ob);return ob
FRONT=.18328084
solid('Quick return receiver left cheek',[(-1.15,FRONT),(-1.06,FRONT),(-1.06,-1.95),(-1.15,-1.95)],2.82,4.2,3)
solid('Quick return receiver right cheek',[(1.06,FRONT),(1.15,FRONT),(1.15,-1.95),(1.06,-1.95)],2.82,4.2,3)
solid('Quick return receiver sill',[(-1.06,FRONT),(1.06,FRONT),(1.06,-1.95),(-1.06,-1.95)],1.35,1.43,3)
solid('Quick return receiver hood',[(-1.15,FRONT),(1.15,FRONT),(1.15,-1.95),(-1.15,-1.95)],4.11,4.2,3)
# Welded folded ramp: high at the window slot, descending through the open
# worktop cutout into the receiving well. This is a closed solid, not a visual
# patch laid over the old countertop.
def ramp(name,x0,x1):
 yz=[(3.90,FRONT),(3.82,FRONT),(2.12,-1.88),(2.20,-1.88)]
 verts=[(x,-z,y) for x in (x0,x1) for y,z in yz];n=len(yz)
 faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.materials.append(MATERIALS[3]);me.update()
 ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob)
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));assert all(e.is_manifold for e in bm.edges);bm.to_mesh(me);bm.free()
 parts.append(ob)
ramp('Sloping quick-return ramp',RECEIVER_X-1.06,RECEIVER_X+1.06)
# Keep the receiving cabinet beneath the opening. Only the worktop is open;
# removing an entire sweep must not leave a floor-to-counter void in the run.
solid('Receiver cabinet front',[(-1.18,-2.2),(1.18,-2.2),(1.18,-2.12),(-1.18,-2.12)],.32,2.70,0)
solid('Receiver cabinet back',[(-1.18,-.08),(1.18,-.08),(1.18,0),(-1.18,0)],.32,2.70,0)
solid('Receiver cabinet plinth',[(-1.12,-2.12),(1.12,-2.12),(1.12,-.08),(-1.12,-.08)],0,.32,4)

scene=bpy.context.scene;scene.unit_settings.system='IMPERIAL';scene.unit_settings.scale_length=.3048
scene['construction']='Enclosed returns millwork with an open vestibule-side staff aisle, lower inner worktops and generic return receiver. Angled plan follows the owner floor-plan sketch of 2026-09-20; dimensions are approximate.'
bpy.context.preferences.filepaths.save_version=0
for ob in bpy.context.selected_objects:ob.select_set(False)
for ob in parts:ob.select_set(True)
bpy.context.view_layer.objects.active=parts[0]
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=22;area.spaces.active.region_3d.view_location=(0,3.5,1.6)
metrics={'boundsFeet':[15.5,11.73,4.2],'parts':len(parts),'triangles':sum(len(p.vertices)-2 for ob in parts for p in ob.data.polygons),'allSolidPartsManifold':True,'worktopHeightFeet':2.82,'staffOpeningFeet':round(math.hypot(7.75-3.25,6.25-2.4),2),'staffOpeningSide':'vestibule (+X)','vestibuleStubDepthFeet':2.4,'receiverCenterXFeet':RECEIVER_X,'receiverFrontBeyondGlassFeet':.00328084,'worktopOpeningFeet':[2*OPEN_HALF,1.4],'hasSlopingRamp':True,'rampOutletHeightFeet':2.20,'upperRimOpeningFeet':2*OPEN_HALF}
(ROOT/'tools/models/exit-return-counter-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/exit-return-counter.blend'),compress=True)
bpy.ops.object.join();bpy.context.object.name='ExitReturnCounter'
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/exit-return-counter.glb'),export_format='GLB',use_selection=True,export_yup=True)
print(json.dumps(metrics))
