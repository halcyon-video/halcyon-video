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
SPEC=json.loads((ROOT/'src/exit-return-spec.json').read_text())
RECEIVER_X=SPEC['receiverX']
HALF=SPEC['receiverWidth']/2
OPEN_HALF=HALF-.09
# The rear is a white worktop with a low white backsplash against the glazing.
# Retain the customer-side enclosure; its finished end meets the white bench.
parts.append(sweep('Blue customer-side enclosure',[(-7.75,-2.2),(-7.75,-5.75),(-2,-11.5),(3.25,-6.25)],.8))
BACK=SPEC['glassOffset'];BENCH_D=BACK-SPEC['worktopFront']
parts.append(sweep('White window worktop right',[(7.75,BACK),(RECEIVER_X+OPEN_HALF,BACK)],BENCH_D,island=True))
parts.append(sweep('White window worktop left',[(RECEIVER_X-OPEN_HALF,BACK),(-7.75,BACK)],BENCH_D,island=True))
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
FRONT=SPEC['glassOffset']+SPEC['faceClearance']
# The reference shows a compact low receiver on the white rear worktop.
# The low enclosure and its internal ramp retain their approved shape.
def channel(name,x0,x1,yz):
 verts=[(x,-z,y) for x in (x0,x1) for y,z in yz];n=len(yz)
 faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.materials.append(MATERIALS[3]);me.update()
 ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob)
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));assert all(e.is_manifold for e in bm.edges);bm.to_mesh(me);bm.free()
 bpy.context.view_layer.objects.active=ob;ob.select_set(True)
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT');ob.select_set(False)
 parts.append(ob)
Y=SPEC['worktopHeight'];H_BACK=SPEC['hoodBackHeight'];H_FRONT=SPEC['hoodFrontHeight'];Z_FRONT=SPEC['hoodFront']
# Fitted laminate backsplash boards meet the worktop and receiver cheeks.
# The eased cap is authored into each closed profile, with no floating trim.
BH=SPEC['backsplashHeight'];BD=SPEC['backsplashDepth'];R=.012
profile=[(Y,BACK-BD),(Y+BH-R,BACK-BD)]
for step in range(1,7):
 angle=math.pi-step*math.pi/12
 profile.append((Y+BH-R+R*math.sin(angle),BACK-BD+R+R*math.cos(angle)))
profile.append((Y+BH,BACK-R))
for step in range(1,7):
 angle=math.pi/2-step*math.pi/12
 profile.append((Y+BH-R+R*math.sin(angle),BACK-R+R*math.cos(angle)))
profile.append((Y,BACK))
for name,x0,x1 in [('left',-7.75,RECEIVER_X-HALF),
 ('receiver',RECEIVER_X-OPEN_HALF,RECEIVER_X+OPEN_HALF),
 ('right',RECEIVER_X+HALF,7.75)]:
 channel('White window backsplash '+name,x0,x1,profile)
# A squat, enclosed white receiver with a gently raked removable lid. The
# narrow rear throat remains open beneath the lid and feeds the ramp.
cheek=[(Y,FRONT),(H_BACK,FRONT),(H_FRONT,Z_FRONT),(Y,Z_FRONT)]
channel('Quick return receiver left cheek',RECEIVER_X-HALF,RECEIVER_X-OPEN_HALF,cheek)
channel('Quick return receiver right cheek',RECEIVER_X+OPEN_HALF,RECEIVER_X+HALF,cheek)
channel('Quick return receiver hood',RECEIVER_X-HALF,RECEIVER_X+HALF,
 [(H_BACK-.08,BACK),(H_BACK,BACK),(H_FRONT,Z_FRONT),(H_FRONT-.08,Z_FRONT)])
# One closed sheet-metal insert fills the clear pane width, with a real
# rectangular tape throat. Runtime fits only its outer sides to that pane.
metal=bpy.data.materials.new('CounterReturnMetal');metal.diffuse_color=(.62,.65,.67,1);metal.use_nodes=True
metal.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.62,.65,.67,1)
metal.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value=.85
metal.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.36
outer=[(RECEIVER_X-2,2.1),(RECEIVER_X+2,2.1),(RECEIVER_X+2,H_BACK),(RECEIVER_X-2,H_BACK)]
inner=[(RECEIVER_X-OPEN_HALF,3.22),(RECEIVER_X+OPEN_HALF,3.22),(RECEIVER_X+OPEN_HALF,H_BACK-.08),(RECEIVER_X-OPEN_HALF,H_BACK-.08)]
vertices=[(x,-z,y) for z in (BACK,FRONT) for x,y in outer+inner]
faces=[]
for i in range(4):
 j=(i+1)%4
 faces.extend([(i,j,j+4,i+4),(i+8,i+12,j+12,j+8),(i,i+8,j+8,j),(i+4,j+4,j+12,i+12)])
me=bpy.data.meshes.new('Full pane metal return insert');me.from_pydata(vertices,[],faces);me.materials.append(metal);me.update()
ob=bpy.data.objects.new('Full pane metal return insert',me);bpy.context.collection.objects.link(ob)
bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));assert all(e.is_manifold for e in bm.edges);bm.to_mesh(me);bm.free()
bpy.context.view_layer.objects.active=ob;ob.select_set(True)
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.01);bpy.ops.object.mode_set(mode='OBJECT');ob.select_set(False)
parts.append(ob)
# Finished front panel and white worktop bridge conceal the under-counter well.
slope=(H_BACK-H_FRONT)/(-.10-Z_FRONT)
channel('Quick return receiver front panel',RECEIVER_X-OPEN_HALF,RECEIVER_X+OPEN_HALF,
 [(Y,Z_FRONT),(H_FRONT-.08,Z_FRONT),(H_FRONT-.08+slope*.08,Z_FRONT+.08),(Y,Z_FRONT+.08)])
parts.append(sweep('White surface ahead of receiver',[(RECEIVER_X+OPEN_HALF,Z_FRONT),(RECEIVER_X-OPEN_HALF,Z_FRONT)],Z_FRONT-SPEC['worktopFront'],island=True))
solid('Quick return receiver sill',[(-1.06,FRONT),(1.06,FRONT),(1.06,-1.95),(-1.06,-1.95)],1.35,1.43,3)
channel('Sloping quick-return ramp',RECEIVER_X-1.06,RECEIVER_X+1.06,
 [(3.30,FRONT),(3.22,FRONT),(2.12,-1.88),(2.20,-1.88)])
# Keep the receiving cabinet beneath the opening. Only the worktop is open;
# removing an entire sweep must not leave a floor-to-counter void in the run.
solid('Receiver cabinet front',[(-1.18,-2.2),(1.18,-2.2),(1.18,-2.12),(-1.18,-2.12)],.32,2.70,0)
solid('Receiver cabinet back',[(-1.18,BACK-.08),(1.18,BACK-.08),(1.18,BACK),(-1.18,BACK)],.32,2.70,0)
solid('Receiver cabinet plinth',[(-1.12,-2.12),(1.12,-2.12),(1.12,BACK-.08),(-1.12,BACK-.08)],0,.32,4)

scene=bpy.context.scene;scene.unit_settings.system='IMPERIAL';scene.unit_settings.scale_length=.3048
scene['construction']='Enclosed returns millwork with an open vestibule-side staff aisle, lower inner worktops and generic return receiver. Angled plan follows the owner floor-plan sketch of 2026-09-20; dimensions are approximate.'
bpy.context.preferences.filepaths.save_version=0
for ob in bpy.context.selected_objects:ob.select_set(False)
for ob in parts:ob.select_set(True)
bpy.context.view_layer.objects.active=parts[0]
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=22;area.spaces.active.region_3d.view_location=(0,3.5,1.6)
metrics={'boundsFeet':[15.5,11.5+FRONT,H_BACK],'parts':len(parts),'triangles':sum(len(p.vertices)-2 for ob in parts for p in ob.data.polygons),'allSolidPartsManifold':True,'worktopHeightFeet':2.82,'staffOpeningFeet':round(math.hypot(7.75-3.25,6.25-2.2),2),'staffOpeningSide':'vestibule (+X)','vestibuleStubDepthFeet':0,'receiverCenterXFeet':RECEIVER_X,'receiverFrontBeyondGlassFeet':.00328084,'worktopOpeningFeet':[2*OPEN_HALF,BENCH_D],'hasSlopingRamp':True,'rampOutletHeightFeet':2.20,'rearBlueRim':False,'whiteWorktopMeetsGlass':True,'whiteBacksplashHeightFeet':BH,'receiverHeightAboveWorktopFeet':H_BACK-Y}
(ROOT/'tools/models/exit-return-counter-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/models/exit-return-counter.blend'),compress=True)
bpy.ops.object.join();bpy.context.object.name='ExitReturnCounter'
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/exit-return-counter.glb'),export_format='GLB',use_selection=True,export_yup=True)
print(json.dumps(metrics))
